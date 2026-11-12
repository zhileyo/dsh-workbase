import type { Context } from '@deepseek-ai/cordis';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { WorkbaseError } from '../shared/model.js';
import { diagnosticRepairResult, type DiagnosticCandidate, type DiagnosticRepairResult,
  type HostDiagnosis, type HostDiagnosticIssue } from '../shared/diagnostics.js';

// 不绑定某个 JSONL 后端或缓存插件版本；兼容边界只接受检测实际用到的能力。
const headerSchema = z.object({
  id: z.string().min(1), version: z.number(), createdAt: z.number(), isSeeded: z.boolean(),
  cwd: z.string().optional(), origin: z.string().optional(), parentSession: z.string().optional(),
}).passthrough();
type Header = z.infer<typeof headerSchema>;
const storedSchema = z.array(z.object({ header: headerSchema, sizeBytes: z.number().nonnegative().optional(),
  revision: z.string().optional(), eventCount: z.number().int().nonnegative().optional() }));
const emptyMetadata = z.object({ blank: z.boolean(), lastPromptAt: z.number().nullable() });
interface Persistence {
  list(): Promise<unknown>;
  stat?(id: string): Promise<unknown>;
  findLog?(id: string): Promise<unknown>;
  root?: string; config?: { root?: string };
}
interface Cache { cachedSnapshot(header: Header): { values: object } | undefined }
interface Sessions { get(id: string): unknown; list(): { id: string }[] }
interface RepairRegistry {
  rebuildSessionCaches?(input: { items: DiagnosticCandidate[] }): Promise<unknown>;
  cleanOrphanSubagents?(input: { sessionIds: string[] }): Promise<unknown>;
  deleteSession?(id: string): Promise<{ deleted: boolean }>;
}
const identity = (h: Header) => JSON.stringify([h.version, h.createdAt, h.cwd ?? null, h.isSeeded]);
const detail = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);
const segment = (id: string) => id === '.' ? '~002E' : id === '..' ? '~002E~002E'
  : id.replace(/[^A-Za-z0-9._-]/g, ch => `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
async function exists(target: string) {
  try { await stat(target); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** 检测与修复分离：检测不读正文；重建和物理删除委托归档插件的生命周期安全实现。 */
export function createDiagnostics(ctx: Context) {
  const get = <T>(name: string) => (ctx as unknown as { get(name: string): T | undefined }).get(name);
  const registry = () => ctx.workspaceRegistry as unknown as RepairRegistry;
  const emptyIssue = async (row: z.infer<typeof storedSchema>[number], parents: ReadonlySet<string>,
    signal: AbortSignal): Promise<HostDiagnosticIssue | undefined> => {
    signal.throwIfAborted();
    const h = row.header, sessions = get<Sessions>('sessions'), cache = get<Cache>('sessionProjectionCache');
    if (!sessions || !cache || typeof ctx.waterfall !== 'function')
      throw new WorkbaseError('unsupported', '宿主未提供空会话投影或活动检测能力');
    if (h.origin !== undefined || h.parentSession || h.isSeeded || h.id.startsWith('im:')
        || parents.has(h.id) || sessions.get(h.id) !== undefined) return;
    const activity = await ctx.waterfall('workspace/session-activity', { sessionId: h.id as never }, () => Promise.resolve([]));
    signal.throwIfAborted();
    if (activity.length || sessions.get(h.id) !== undefined) return;
    const snapshot = cache.cachedSnapshot(h);
    const metadata = emptyMetadata.safeParse((snapshot?.values as { sessionListMetadata?: unknown } | undefined)?.sessionListMetadata);
    if (!metadata.success) throw new WorkbaseError('unknown-empty', `会话 ${h.id} 缺少可用的官方空会话投影`);
    if (!metadata.data.blank || metadata.data.lastPromptAt !== null) return;
    const asOfSeq = (snapshot as { asOfSeq?: number })?.asOfSeq;
    if (row.eventCount !== undefined && asOfSeq !== row.eventCount - 1)
      throw new WorkbaseError('stale-empty', `会话 ${h.id} 的官方空会话投影尚未覆盖当前日志`);
    return { kind: 'empty', sessionId: h.id,
      identity: JSON.stringify([identity(h), row.revision ?? null, asOfSeq ?? null]),
      path: h.cwd ?? '', ...(row.sizeBytes === undefined ? {} : { sizeBytes: row.sizeBytes }) };
  };
  return {
    async diagnose(signal: AbortSignal): Promise<HostDiagnosis> {
      signal.throwIfAborted();
      const repair = {
        cache: typeof registry().rebuildSessionCaches === 'function',
        orphan: typeof registry().cleanOrphanSubagents === 'function',
        empty: typeof registry().deleteSession === 'function',
      };
      const persistence = get<Persistence>('sessionPersistence');
      const cache = get<Cache>('sessionProjectionCache');
      const sessions = get<Sessions>('sessions');
      const report: HostDiagnosis = { checks: [], issues: [], repair };
      if (!persistence || typeof persistence.list !== 'function') {
        report.checks = (['cache', 'orphan', 'empty'] as const).map(kind => ({
          kind, status: 'unsupported', message: '宿主未提供会话存储检测能力',
        }));
        return report;
      }
      let stored: z.infer<typeof storedSchema>;
      try { stored = storedSchema.parse(await persistence.list()); }
      catch (error) {
        signal.throwIfAborted();
        report.checks = (['cache', 'orphan', 'empty'] as const).map(kind => ({
          kind, status: 'error', message: `读取会话头部失败：${detail(error)}`,
        }));
        return report;
      }
      signal.throwIfAborted();
      // 各检查独立失败，不抹去已经发现的问题，也不把失败伪装成零异常。
      if (cache && typeof cache.cachedSnapshot === 'function' && sessions
          && typeof sessions.get === 'function' && typeof ctx.waterfall === 'function') {
        let errorMessage = '';
        for (const { header: h } of stored) {
          signal.throwIfAborted();
          if (h.origin !== undefined || h.id.startsWith('im:') || sessions.get(h.id) !== undefined) continue;
          try {
            const activity = await ctx.waterfall('workspace/session-activity', { sessionId: h.id as never }, () => Promise.resolve([]));
            signal.throwIfAborted();
            if (activity.length || sessions.get(h.id) !== undefined) continue;
            const snapshot = cache.cachedSnapshot(h);
            if (!snapshot || !snapshot.values || !Object.hasOwn(snapshot.values, 'title'))
              report.issues.push({ kind: 'cache', sessionId: h.id, identity: identity(h), path: h.cwd ?? '' });
          } catch (error) { signal.throwIfAborted(); errorMessage = detail(error); }
        }
        report.checks.push({ kind: 'cache', status: errorMessage ? 'error' : 'ok',
          ...(errorMessage ? { message: `部分缓存未能检查：${errorMessage}` } : {}) });
      } else report.checks.push({ kind: 'cache', status: 'unsupported', message: '宿主未提供官方缓存或活动会话检测能力' });

      if (cache && typeof cache.cachedSnapshot === 'function' && sessions && typeof sessions.get === 'function'
          && typeof ctx.waterfall === 'function') {
        const parents = new Set(stored.flatMap(row => row.header.parentSession ? [row.header.parentSession] : []));
        let errorMessage = '';
        for (const row of stored) {
          try {
            const issue = await emptyIssue(row, parents, signal);
            if (issue) report.issues.push(issue);
          } catch (error) { signal.throwIfAborted(); errorMessage = detail(error); }
        }
        report.checks.push({ kind: 'empty', status: errorMessage ? 'error' : 'ok',
          ...(errorMessage ? { message: `部分空会话未能检查：${errorMessage}` } : {}) });
      } else report.checks.push({ kind: 'empty', status: 'unsupported', message: '宿主未提供空会话投影或活动检测能力' });

      const root = persistence.root ?? persistence.config?.root;
      const physicalRoot = typeof root === 'string' && path.isAbsolute(root) ? root : undefined;
      const physicalLookup = typeof persistence.findLog === 'function';
      if (!sessions || typeof sessions.get !== 'function' || typeof sessions.list !== 'function'
          || (!physicalLookup && !(physicalRoot && typeof persistence.stat === 'function'))) {
        report.checks.push({ kind: 'orphan', status: 'unsupported', message: '宿主未提供可确证日志物理存在的检测能力' });
        return report;
      }
      try {
        const known = new Set([...stored.map(row => row.header.id), ...sessions.list().map(s => s.id)]);
        // 一次扫描项目目录；目录枚举失败整项报错，绝不回退为仅stat判缺失。
        const projects = physicalRoot ? (await readdir(physicalRoot, { withFileTypes: true }))
          .filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => entry.name) : [];
        const missing = new Map<string, boolean>();
        const artifactMissing = async (id: string): Promise<boolean> => {
          signal.throwIfAborted();
          if (missing.has(id)) return missing.get(id)!;
          let absent = true;
          if (physicalLookup && await persistence.findLog!(id) !== undefined) absent = false;
          if (absent && physicalRoot) {
            for (const project of projects) {
              if (await exists(path.join(physicalRoot, project, segment(id)))) { absent = false; break; }
            }
          }
          if (absent && typeof persistence.stat === 'function' && await persistence.stat(id) !== undefined) absent = false;
          missing.set(id, absent);
          return absent;
        };
        for (const { header: h, sizeBytes } of stored) {
          signal.throwIfAborted();
          if (h.origin !== 'subagent' || !h.parentSession || sessions.get(h.id) !== undefined
              || known.has(h.parentSession) || sessions.get(h.parentSession) !== undefined) continue;
          if (!(await artifactMissing(h.parentSession)) || await artifactMissing(h.id)) continue;
          // 探测期间母会话可能重新加载，子会话也可能变活跃。
          if (sessions.get(h.id) !== undefined || sessions.get(h.parentSession) !== undefined) continue;
          report.issues.push({ kind: 'orphan', sessionId: h.id, identity: identity(h), path: h.cwd ?? '',
            parentSessionId: h.parentSession, ...(sizeBytes === undefined ? {} : { sizeBytes }) });
        }
        report.checks.push({ kind: 'orphan', status: 'ok' });
      } catch (error) {
        signal.throwIfAborted();
        report.checks.push({ kind: 'orphan', status: 'error', message: `孤儿子代理检查不完整：${detail(error)}` });
      }
      return report;
    },
    async repairDiagnostics(kind: HostDiagnosticIssue['kind'], items: DiagnosticCandidate[]): Promise<DiagnosticRepairResult> {
      const r = registry();
      let result: unknown;
      if (kind === 'cache' && typeof r.rebuildSessionCaches === 'function') {
        const raw = await r.rebuildSessionCaches({ items }) as Record<string, unknown>;
        result = { succeeded: raw?.rebuiltSessionIds, skipped: raw?.skippedSessionIds, failures: raw?.failures };
      } else if (kind === 'orphan' && typeof r.cleanOrphanSubagents === 'function') {
        const raw = await r.cleanOrphanSubagents({ sessionIds: items.map(item => item.sessionId) }) as Record<string, unknown>;
        result = { succeeded: raw?.cleanedSessionIds, skipped: raw?.skippedSessionIds, failures: raw?.failures };
      } else if (kind === 'empty' && typeof r.deleteSession === 'function') {
        const value: DiagnosticRepairResult = { succeeded: [], skipped: [], failures: [] };
        for (const item of [...new Map(items.map(i => [i.sessionId, i])).values()]) {
          try {
            // 逐项重取当前头部和投影；不调用删除接口清理未知或已变化的会话。
            const persistence = get<Persistence>('sessionPersistence');
            if (!persistence) throw new WorkbaseError('unsupported', '宿主未提供会话存储检测能力');
            const rows = storedSchema.parse(await persistence.list());
            const row = rows.find(row => row.header.id === item.sessionId);
            const issue = row && await emptyIssue(row,
              new Set(rows.flatMap(row => row.header.parentSession ? [row.header.parentSession] : [])), new AbortController().signal);
            if (!issue || issue.identity !== item.identity) { value.skipped.push(item.sessionId); continue; }
            const removed = await r.deleteSession(item.sessionId);
            if (removed?.deleted !== true) throw new WorkbaseError('delete-unconfirmed', '宿主未确认空会话删除结果');
            value.succeeded.push(item.sessionId);
          } catch (error) { value.failures.push({ sessionId: item.sessionId, message: detail(error) }); }
        }
        result = value;
      } else throw new WorkbaseError('unsupported', '请先安装并启用 dsh-archive-manager 归档管理插件，再执行诊断修复');
      const parsed = diagnosticRepairResult.parse(result);
      const ids = [...parsed.succeeded, ...parsed.skipped, ...parsed.failures.map(f => f.sessionId)];
      const requested = new Set(items.map(i => i.sessionId));
      if (ids.length !== requested.size || new Set(ids).size !== ids.length || ids.some(id => !requested.has(id)))
        throw new WorkbaseError('repair-unconfirmed', '宿主未完整确认修复结果，请重新检测后再操作');
      return parsed;
    },
  };
}
