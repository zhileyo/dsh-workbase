import type { Context } from '@deepseek-ai/cordis';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { WorkbaseError } from '../shared/model.js';
import { diagnosticRepairResult, type DiagnosticCandidate, type DiagnosticRepairResult,
  type HostDiagnosis, type HostDiagnosticIssue } from '../shared/diagnostics.js';
import { createSessionMaintenance } from './session-maintenance.js';

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
/** 宿主 `sessionController.list()` 的条目；官方用它同时给出空会话与运行状态。 */
interface ControllerItem { sessionId?: unknown; blank?: unknown; running?: unknown; updatedAt?: unknown }
interface Controller { list(query: object, signal: AbortSignal): Promise<{ items?: ControllerItem[] }> }
interface BlankState { blank: boolean; running: boolean; updatedAt: number | null }
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

/** 检测不读正文；修复在工作台自己的维护模块中复查候选并持久化。 */
export function createDiagnostics(ctx: Context, maintenance = createSessionMaintenance(ctx)) {
  const get = <T>(name: string) => (ctx as unknown as { get(name: string): T | undefined }).get(name);
  // 旧 `sessions` 服务是「已加载会话的内存缓存」，含当前打开工作区的全部会话；
  // 只有宿主会话控制器的 `running` 才代表正在使用，空会话判定以它为准。
  const blankIndex = async (signal: AbortSignal): Promise<Map<string, BlankState> | undefined> => {
    const service = (ctx as unknown as { sessionController?: Partial<Controller> }).sessionController;
    if (!service || typeof service.list !== 'function') return undefined;
    const listed = await service.list({}, signal);
    signal.throwIfAborted();
    const index = new Map<string, BlankState>();
    for (const item of Array.isArray(listed?.items) ? listed.items : []) {
      if (typeof item?.sessionId !== 'string') continue;
      index.set(item.sessionId, { blank: item.blank === true, running: item.running === true,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : null });
    }
    return index;
  };
  const emptyIssue = async (row: z.infer<typeof storedSchema>[number], parents: ReadonlySet<string>,
    signal: AbortSignal, index?: Map<string, BlankState>): Promise<HostDiagnosticIssue | undefined> => {
    signal.throwIfAborted();
    const h = row.header;
    if (h.origin !== undefined || h.parentSession || h.isSeeded || h.id.startsWith('im:') || parents.has(h.id)) return;
    if (index) {
      // 宿主不认识的会话宁可不报；blank 来自宿主投影，running 才是「正在使用」。
      const state = index.get(h.id);
      if (!state || !state.blank || state.running) return;
      return { kind: 'empty', sessionId: h.id,
        identity: JSON.stringify([identity(h), state.updatedAt]), path: h.cwd ?? '',
        ...(row.sizeBytes === undefined ? {} : { sizeBytes: row.sizeBytes }) };
    }
    const sessions = get<Sessions>('sessions'), cache = get<Cache>('sessionProjectionCache');
    if (!sessions || !cache || typeof ctx.waterfall !== 'function')
      throw new WorkbaseError('unsupported', '宿主未提供空会话投影或活动检测能力');
    if (sessions.get(h.id) !== undefined) return;
    const activity = await ctx.waterfall('workspace/session-activity', { sessionId: h.id as never }, () => Promise.resolve([]));
    signal.throwIfAborted();
    if (activity.length || sessions.get(h.id) !== undefined) return;
    const snapshot = cache.cachedSnapshot(h);
    const metadata = emptyMetadata.safeParse((snapshot?.values as { sessionListMetadata?: unknown } | undefined)?.sessionListMetadata);
    if (!metadata.success)
      throw new WorkbaseError('unknown-empty', `会话 ${h.id} 缺少可用的官方空会话投影`);
    if (!metadata.data.blank || metadata.data.lastPromptAt !== null) return;
    const asOfSeq = (snapshot as { asOfSeq?: number })?.asOfSeq;
    if (row.eventCount !== undefined && asOfSeq !== row.eventCount - 1)
      throw new WorkbaseError('stale-empty', `会话 ${h.id} 的官方空会话投影尚未覆盖当前日志`);
    return { kind: 'empty', sessionId: h.id,
      identity: JSON.stringify([identity(h), row.revision ?? null, asOfSeq ?? null]),
      path: h.cwd ?? '', ...(row.sizeBytes === undefined ? {} : { sizeBytes: row.sizeBytes }) };
  };
  const diagnostics = {
    async diagnose(signal: AbortSignal): Promise<HostDiagnosis> {
      signal.throwIfAborted();
      const repair = maintenance.capabilities();
      const persistence = get<Persistence>('sessionPersistence');
      const cache = get<Cache>('sessionProjectionCache');
      const sessions = get<Sessions>('sessions');
      const report: HostDiagnosis = { checks: [], issues: [], repair };
      let index: Map<string, BlankState> | undefined;
      let indexError = '';
      try { index = await blankIndex(signal); }
      catch (error) { signal.throwIfAborted(); indexError = detail(error); }
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

      const emptyFallback = !!cache && typeof cache.cachedSnapshot === 'function' && !!sessions
        && typeof sessions.get === 'function' && typeof ctx.waterfall === 'function';
      if (index || emptyFallback) {
        const parents = new Set(stored.flatMap(row => row.header.parentSession ? [row.header.parentSession] : []));
        let errorMessage = indexError;
        for (const row of stored) {
          try {
            const issue = await emptyIssue(row, parents, signal, index);
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
      if (!maintenance.capabilities()[kind])
        throw new WorkbaseError('unsupported', '宿主缺少诊断修复所需的底层能力，请更新宿主');
      const result = await maintenance.exclusive(async () => {
        const value: DiagnosticRepairResult = { succeeded: [], skipped: [], failures: [] };
        for (const item of [...new Map(items.map(i => [i.sessionId, i])).values()]) {
          try {
            let confirmed = false;
            const validate = async () => {
              if (kind === 'empty') {
                const persistence = get<Persistence>('sessionPersistence');
                if (!persistence) throw new WorkbaseError('unsupported', '宿主未提供会话存储检测能力');
                const rows = storedSchema.parse(await persistence.list());
                const row = rows.find(row => row.header.id === item.sessionId);
                if (!row) return false;
                const inner = new AbortController().signal;
                const issue = await emptyIssue(row,
                  new Set(rows.flatMap(row => row.header.parentSession ? [row.header.parentSession] : [])),
                  inner, await blankIndex(inner));
                if (issue?.identity === item.identity) { confirmed = true; return true; }
                // 驱逐已加载会话后宿主可能不再列出它；日志身份未变且活动为空时交给 deleteCore 收尾。
                if (!confirmed) return false;
                try { return identity(row.header) === String((JSON.parse(item.identity) as unknown[])[0]); }
                catch { return false; }
              }
              const report = await diagnostics.diagnose(new AbortController().signal);
              if (report.issues.some(issue => issue.kind === kind && issue.sessionId === item.sessionId && issue.identity === item.identity))
                return true;
              if (report.issues.some(issue => issue.kind === kind && issue.sessionId === item.sessionId))
                return false;
              if (report.checks.find(check => check.kind === kind)?.status !== 'ok')
                throw new WorkbaseError('diagnostic-incomplete', '候选复查未完成，已停止修复');
              return false;
            };
            if (!await validate()) { value.skipped.push(item.sessionId); continue; }
            const succeeded = kind === 'cache'
              ? await maintenance.rebuildWithinQueue(item.sessionId, item.identity)
              // 空会话常已加载在当前工作区的内存里；`evict` 先 flush 再驱逐，活动会话仍被拒绝。
              : await maintenance.deleteWithinQueue(item.sessionId, { coldOnly: true, evict: kind === 'empty', validate });
            (succeeded ? value.succeeded : value.skipped).push(item.sessionId);
          } catch (error) { value.failures.push({ sessionId: item.sessionId, message: detail(error) }); }
        }
        return value;
      });
      const parsed = diagnosticRepairResult.parse(result);
      const ids = [...parsed.succeeded, ...parsed.skipped, ...parsed.failures.map(f => f.sessionId)];
      const requested = new Set(items.map(i => i.sessionId));
      if (ids.length !== requested.size || new Set(ids).size !== ids.length || ids.some(id => !requested.has(id)))
        throw new WorkbaseError('repair-unconfirmed', '宿主未完整确认修复结果，请重新检测后再操作');
      return parsed;
    },
  };
  return diagnostics;
}
