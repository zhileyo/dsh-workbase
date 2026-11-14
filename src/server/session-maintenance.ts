import type { Context } from '@deepseek-ai/cordis';
import { createHash } from 'node:crypto';
import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { WorkbaseError } from '../shared/model.js';

interface Header {
  id: string; version: number; createdAt: number; isSeeded: boolean;
  cwd?: string; origin?: string; parentSession?: string;
}
interface Row { header: Header; revision?: string }
interface Persistence {
  name?: string; root?: string; config?: { root?: string };
  list(): Promise<Row[]>; stat(id: string): Promise<Row | undefined>;
  locate(header: Header): { kind: string; path: string } | undefined;
  open(id: string, mode: 'read'): Promise<{
    header: Header; inheritedEventCount: number;
    read(start: number): Promise<{ events: unknown[] }>; close(): Promise<void>;
  }>;
  flush?(): Promise<void>;
}
interface Sessions {
  get(id: string): { id: string; header: Header } | undefined;
  list(): { id: string; header: Header }[];
  flush?(session: unknown): Promise<void>;
  liveEntryFor?(session: unknown): unknown;
  detachEntered?(entry: unknown): void;
}
interface RegistryState {
  workspaceIds: string[]; archivedSessionIds: string[]; pinnedSessionIds?: string[];
}
interface WorkspaceRecord { sessionIds: string[]; updatedAt: string }
interface Registry {
  enqueueOperation<T>(operation: () => Promise<T>): Promise<T>;
  headers: Map<string, Header>; sessionPaths: Map<string, string>;
  invalidSessionPaths?: Map<string, unknown>; missingSessionPaths?: Set<string>;
  entities: Map<string, { record: WorkspaceRecord }>;
  requireState(): RegistryState; setState(state: RegistryState): Promise<void>;
  requireTable(): {
    get(id: string): WorkspaceRecord | undefined;
    update(id: string, update: (record: WorkspaceRecord) => WorkspaceRecord): Promise<WorkspaceRecord>;
  };
}
interface Cache {
  cachedSnapshot(header: Header): { values: object } | undefined;
  put(id: string, identity: object, rows: unknown): Promise<void>;
  requireTable(): { delete(id: string): Promise<void> };
}
interface Projections {
  restore(rows: object, events: unknown[], start: number, header: Header, inherited: number): {
    checkpoint: unknown; snapshot: unknown;
  };
}
export interface DeleteOptions {
  coldOnly?: boolean;
  /** 允许删除「已加载但空闲」的会话：先 flush 再驱逐，仍拒绝有活动的会话。 */
  evict?: boolean;
  validate?(): Promise<boolean>;
}
export const sessionIdentity = (h: Header) => JSON.stringify([h.version, h.createdAt, h.cwd ?? null, h.isSeeded]);
const encode = (text: string) => text.replace(/[^A-Za-z0-9._-]/g,
  ch => `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const segment = (id: string) => id === '.' ? '~002E' : id === '..' ? '~002E~002E' : encode(id);

/** 只认官方 JSONL 后端的专属会话目录，不能把任意 locate 路径当成递归删除授权。 */
export function sessionStorageDirectory(p: Pick<Persistence, 'name' | 'root' | 'config'>,
  h: Header, location: { kind: string; path: string }): string | undefined {
  const root = p.root ?? p.config?.root;
  if (p.name !== 'session-persistence-jsonl' || location.kind !== 'jsonl' || !root
      || !path.isAbsolute(root) || !path.isAbsolute(location.path) || !h.id
      || !/^session(?:\.v[1-9][0-9]*)?\.jsonl(?:\.zstd)?$/.test(path.basename(location.path))) return;
  if (h.cwd !== undefined && !h.cwd) return;
  const project = h.cwd === undefined ? '_no-cwd'
    : `--${(encode(h.cwd.replace(/[\\/:]+/g, '-')).replace(/^-+/, '') || 'root').slice(0, 251)}--`;
  const directory = path.join(path.resolve(root), project, segment(h.id));
  return path.resolve(location.path) === path.join(directory, path.basename(location.path)) ? directory : undefined;
}
async function safeDirectory(directory: string, levels = 2) {
  let target = directory;
  for (let level = 0; level < levels; level++, target = path.dirname(target)) {
    try {
      const entry = await lstat(target);
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw new WorkbaseError('unsafe-storage', '会话存储目录含符号链接或布局异常，已停止清理');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

/** 官方 SDK 尚无公开维护接口；私有适配集中于此，能力不足时拒绝，不调用外部插件。 */
export function createSessionMaintenance(ctx: Context) {
  const get = <T>(name: string) => (ctx as unknown as { get?(name: string): T | undefined }).get?.(name);
  const registry = () => ctx.workspaceRegistry as unknown as Registry;
  const unsupported = () => new WorkbaseError('unsupported', '宿主缺少会话维护所需的底层能力，请更新宿主');
  const supportsQueue = () => typeof registry()?.enqueueOperation === 'function';
  const supportsDelete = () => {
    const r = registry(), p = get<Persistence>('sessionPersistence'), s = get<Sessions>('sessions');
    const c = get<Cache>('sessionProjectionCache');
    const available = supportsQueue() && !!r?.headers && !!r.entities && !!r.sessionPaths
      && typeof r.requireState === 'function' && typeof r.setState === 'function'
      && typeof r.requireTable === 'function' && typeof p?.list === 'function'
      && p.name === 'session-persistence-jsonl' && typeof p.locate === 'function' && typeof p.stat === 'function'
      && typeof s?.get === 'function' && typeof s.list === 'function'
      && typeof s.flush === 'function' && typeof s.liveEntryFor === 'function'
      && typeof s.detachEntered === 'function' && typeof p.flush === 'function'
      && typeof c?.requireTable === 'function' && typeof ctx.waterfall === 'function';
    if (!available) return false;
    try {
      const table = r.requireTable();
      return typeof table.get === 'function' && typeof table.update === 'function'
        && typeof c!.requireTable().delete === 'function';
    } catch { return false; }
  };
  const capabilities = () => ({
    cache: supportsQueue() && typeof get<Persistence>('sessionPersistence')?.open === 'function'
      && typeof get<Persistence>('sessionPersistence')?.list === 'function'
      && typeof get<Cache>('sessionProjectionCache')?.put === 'function'
      && typeof get<Cache>('sessionProjectionCache')?.cachedSnapshot === 'function'
      && typeof get<Projections>('sessionProjections')?.restore === 'function'
      && typeof get<Sessions>('sessions')?.get === 'function' && typeof ctx.waterfall === 'function',
    orphan: supportsDelete(), empty: supportsDelete(),
  });
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    if (!supportsQueue()) throw unsupported();
    return registry().enqueueOperation(operation);
  };
  const readRow = async (id: string) => {
    const p = get<Persistence>('sessionPersistence');
    if (!p) throw unsupported();
    const row = typeof p.stat === 'function' ? await p.stat(id) : (await p.list()).find(row => row.header.id === id);
    return row && structuredClone(row);
  };
  // `s.get()` 只说明会话已加载进内存（当前打开的工作区全都在里面），不代表正在使用；
  // `evict` 走 deleteCore 的 flush→detachEntered 驱逐路径，活动的会话仍由水位判断拒绝。
  const inactive = async (id: string, coldOnly: boolean, evict = false) => {
    const s = get<Sessions>('sessions');
    if (!s || typeof ctx.waterfall !== 'function') throw unsupported();
    if (coldOnly && !evict && s.get(id) !== undefined) return false;
    const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id as never }, () => Promise.resolve([]));
    return activity.length === 0 && (!coldOnly || evict || s.get(id) === undefined);
  };
  const sameRow = (a: Row, b: Row) => sessionIdentity(a.header) === sessionIdentity(b.header)
    && a.revision === b.revision && a.header.origin === b.header.origin && a.header.parentSession === b.header.parentSession;
  const removeAccounts = async (id: string) => {
    const r = registry(), table = r.requireTable(), state = r.requireState();
    for (const workspaceId of state.workspaceIds) {
      if (!table.get(workspaceId)?.sessionIds.includes(id)) continue;
      const record = await table.update(workspaceId, row => ({
        ...row, sessionIds: row.sessionIds.filter(value => value !== id), updatedAt: new Date().toISOString(),
      }));
      const entity = r.entities.get(workspaceId);
      if (entity) entity.record = record;
    }
    await r.setState({ ...state, archivedSessionIds: state.archivedSessionIds.filter(value => value !== id),
      ...(state.pinnedSessionIds ? { pinnedSessionIds: state.pinnedSessionIds.filter(value => value !== id) } : {}) });
    r.headers.delete(id); r.sessionPaths.delete(id);
    r.invalidSessionPaths?.delete(id); r.missingSessionPaths?.delete(id);
    try { ctx.emit('api-session/removed', id as never); }
    catch (error) { ctx.logger?.warn(`workbase: 会话删除通知失败：${String(error)}`); }
  };
  const deleteCore = async (id: string, options: DeleteOptions): Promise<boolean> => {
    const p = get<Persistence>('sessionPersistence')!, s = get<Sessions>('sessions')!;
    const cache = get<Cache>('sessionProjectionCache')!;
    const byId = new Map((await p.list()).map(row => [row.header.id, structuredClone(row)]));
    for (const live of s.list()) if (!byId.has(live.id)) byId.set(live.id, { header: live.header });
    const indexed = registry().headers.get(id);
    if (!byId.has(id) && indexed) byId.set(id, { header: indexed });
    if (!byId.has(id)) throw new WorkbaseError('not-found', '会话已不存在，请刷新列表');
    const ordered: Row[] = [], seen = new Set<string>();
    const collect = (row: Row) => {
      if (seen.has(row.header.id)) throw new WorkbaseError('invalid-lineage', '会话父子关系存在循环，已停止删除');
      seen.add(row.header.id);
      for (const child of byId.values())
        if (child.header.origin === 'subagent' && child.header.parentSession === row.header.id) collect(child);
      ordered.push(row);
    };
    collect(byId.get(id)!);
    const targets = new Map<string, string>();
    for (const row of ordered) {
      if (!await inactive(row.header.id, !!options.coldOnly, !!options.evict)) {
        if (options.coldOnly) return false;
        throw new WorkbaseError('running', '会话或子 Agent 正在使用，请先停止再永久删除');
      }
      const location = p.locate(row.header);
      const directory = location && sessionStorageDirectory(p, row.header, location);
      if (!directory) throw new WorkbaseError('unsupported-storage', '无法确认会话日志目录归属，已停止删除');
      await safeDirectory(directory, 3);
      targets.set(row.header.id, directory);
    }
    if (options.validate && !await options.validate()) return false;
    for (const row of ordered) {
      const sessionId = row.header.id, live = s.get(sessionId);
      if (live && sessionIdentity(live.header) !== sessionIdentity(row.header)) return false;
      if (!await inactive(sessionId, !!options.coldOnly, !!options.evict)) {
        if (options.coldOnly) return false;
        throw new WorkbaseError('running', '会话状态已变化，已停止删除');
      }
      if (live) {
        if (!s.flush || !s.liveEntryFor || !s.detachEntered || !p.flush) throw unsupported();
        await s.flush(live);
        if (!await inactive(sessionId, false) || s.get(sessionId) !== live)
          throw new WorkbaseError('running', '会话状态已变化，已停止删除');
        s.detachEntered(s.liveEntryFor(live));
        await p.flush();
        if (s.get(sessionId)) throw new WorkbaseError('running', '会话未能释放，已停止删除');
      }
      const current = await readRow(sessionId);
      if (!live && current && !sameRow(row, current)) return false;
      await safeDirectory(targets.get(sessionId)!, 3);
      const spill = get<{ root?: string }>('spillStore');
      let spillDirectory: string | undefined;
      if (spill?.root) {
        if (!path.isAbsolute(spill.root)) throw new WorkbaseError('unsafe-storage', '溢出缓存根目录不是绝对路径');
        spillDirectory = path.join(spill.root, `session-${createHash('sha256').update(sessionId).digest('hex').slice(0, 12)}`);
        await safeDirectory(spillDirectory);
      }
      if (!await inactive(sessionId, true) || options.validate && !await options.validate()) return false;
      // detach 的缓存写入先进入同一表队列；删除在其后持久化，避免重新生成已删除缓存。
      await cache.requireTable().delete(sessionId);
      const finalRow = await readRow(sessionId);
      // 缓存删除后只能复查日志与活动，不能再用刚删掉的空会话投影验证。
      if (finalRow && !sameRow(current ?? row, finalRow) || !await inactive(sessionId, true)) return false;
      await rm(targets.get(sessionId)!, { recursive: true, force: true });
      if (await p.stat(sessionId) !== undefined)
        throw new WorkbaseError('delete-unconfirmed', '日志删除未能确认，列表记录保留以便重试');
      if (spillDirectory) await rm(spillDirectory, { recursive: true, force: true });
      await removeAccounts(sessionId);
    }
    return true;
  };
  return {
    capabilities, exclusive,
    async deleteSession(id: string, options: DeleteOptions = {}) {
      if (!supportsDelete()) throw unsupported();
      return exclusive(() => deleteCore(id, options));
    },
    async deleteWithinQueue(id: string, options: DeleteOptions) {
      if (!supportsDelete()) throw unsupported();
      return deleteCore(id, options);
    },
    async rebuildWithinQueue(id: string, identity: string) {
      if (!capabilities().cache) throw unsupported();
      const p = get<Persistence>('sessionPersistence')!, c = get<Cache>('sessionProjectionCache')!;
      const row = await readRow(id);
      if (!row || sessionIdentity(row.header) !== identity || row.header.origin !== undefined
          || id.startsWith('im:') || !await inactive(id, true)) return false;
      if (Object.hasOwn(c.cachedSnapshot(row.header)?.values ?? {}, 'title')) return false;
      const handle = await p.open(id, 'read');
      let events: unknown[];
      try { events = (await handle.read(0)).events; }
      finally { await handle.close(); }
      const current = await readRow(id);
      if (!current || !sameRow(row, current) || sessionIdentity(handle.header) !== identity || !await inactive(id, true)) return false;
      // 完整日志重折叠，等待官方 put 的持久化结果，不能把 fire-and-forget 当成成功。
      const restored = get<Projections>('sessionProjections')!.restore({}, events, 0, handle.header, handle.inheritedEventCount);
      await c.put(id, { formatVersion: handle.header.version, createdAt: handle.header.createdAt,
        ...(handle.header.cwd === undefined ? {} : { cwd: handle.header.cwd }),
        isSeeded: handle.header.isSeeded, inheritedEventCount: handle.inheritedEventCount }, restored.checkpoint);
      const snapshot = c.cachedSnapshot(handle.header);
      if (!snapshot || !Object.hasOwn(snapshot.values, 'title') || !isDeepStrictEqual(snapshot, restored.snapshot))
        throw new WorkbaseError('cache-unconfirmed', '列表缓存持久化未能确认，请重新检测后重试');
      const finalRow = await readRow(id);
      if (!finalRow || !sameRow(row, finalRow) || !await inactive(id, true)) return false;
      return true;
    },
  };
}
