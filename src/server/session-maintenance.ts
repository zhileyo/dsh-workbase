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
  expectedIdentity?: string;
  coldOnly?: boolean;
  /** 允许删除「已加载但空闲」的会话：先 flush 再驱逐，仍拒绝有活动的会话。 */
  evict?: boolean;
  validate?(stage?: { evicted: boolean; cacheRemoved?: boolean }): Promise<boolean>;
  authorize?(target: DeleteTarget): Promise<void>;
}
export interface DeleteTarget { sessionId: string; path?: string; identity: string }
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
  // `evictLoaded` 走 deleteCore 的 flush→detachEntered 驱逐路径，活动的会话仍由水位判断拒绝。
  // 三种用法：requireCold=false 只看活动水位；requireCold=true 要求会话未加载；
  // requireCold=true 且 evictLoaded=true 允许「已加载但空闲」，由调用方先 flush 再驱逐。
  const inactive = async (id: string, requireCold: boolean, evictLoaded = false) => {
    const s = get<Sessions>('sessions');
    if (!s || typeof ctx.waterfall !== 'function') throw unsupported();
    if (requireCold && !evictLoaded && s.get(id) !== undefined) return false;
    const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id as never }, () => Promise.resolve([]));
    // 第三个析取项只在「水位判定期间会话又被加载」的竞态窗口里起作用，不能省。
    return activity.length === 0 && (!requireCold || evictLoaded || s.get(id) === undefined);
  };
  // 已加载但没在跑的会话可以先 flush 再驱逐，重建缓存才能读到日志；
  // 真正在跑的会话仍由水位判断拒绝，不在这里放行。
  /** 驱逐时序只留一份：flush → 复查活动与身份 → detachEntered → p.flush → 复查已卸载。
   * 失败原因返回给调用方翻译（release 折叠成 false，deleteCore 翻译成具体文案），能力缺失仍就地抛出。 */
  const evictLoadedSession = async (id: string, live: NonNullable<ReturnType<Sessions['get']>>,
    options: { precheck: boolean }): Promise<'busy' | 'changed' | 'unreleased' | null> => {
    const s = get<Sessions>('sessions')!, p = get<Persistence>('sessionPersistence')!;
    if (!s.flush || !s.liveEntryFor || !s.detachEntered || !p.flush) throw unsupported();
    if (options.precheck && !await inactive(id, false)) return 'busy';
    await s.flush(live);
    if (!await inactive(id, false) || s.get(id) !== live) return 'changed';
    s.detachEntered(s.liveEntryFor(live));
    await p.flush();
    return s.get(id) === undefined ? null : 'unreleased';
  };
  const release = async (id: string) => {
    const live = get<Sessions>('sessions')!.get(id);
    if (!live) return true;
    return await evictLoadedSession(id, live, { precheck: true }) === null;
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
    if (options.expectedIdentity !== undefined && sessionIdentity(byId.get(id)!.header) !== options.expectedIdentity)
      throw new WorkbaseError('conflict', '删除回执的会话生命周期已变化，请核对后重试');
    const ordered: Row[] = [], seen = new Set<string>();
    const collect = (row: Row) => {
      if (seen.has(row.header.id)) throw new WorkbaseError('invalid-lineage', '会话父子关系存在循环，已停止删除');
      seen.add(row.header.id);
      for (const child of byId.values())
        if (child.header.origin === 'subagent' && child.header.parentSession === row.header.id) collect(child);
      ordered.push(row);
    };
    collect(byId.get(id)!);
    // 全集合授权先于 flush、驱逐、缓存和日志删除，不能删了一部分才发现归档后代。
    for (const row of ordered) await options.authorize?.({
      sessionId: row.header.id, path: row.header.cwd, identity: sessionIdentity(row.header),
    });
    const targets = new Map<string, string>();
    const evicted = new Set<string>();
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
    // 提交前再复查一次全集合的身份与冷态：此时还没有任何物理副作用，失败可以整体按「跳过」处理。
    for (const row of ordered) {
      const sessionId = row.header.id, live = s.get(sessionId);
      if (live && sessionIdentity(live.header) !== sessionIdentity(row.header)) return false;
      const current = await readRow(sessionId);
      if (current && !sameRow(row, current)) return false;
      if (!await inactive(sessionId, !!options.coldOnly, !!options.evict)) {
        if (options.coldOnly) return false;
        throw new WorkbaseError('running', '会话状态已变化，已停止删除');
      }
    }
    const committed: string[] = [];
    // 已物理删除的会话无法回滚：此后再有变化只能如实报出已完成的部分，不能谎称整体跳过。
    const stop = (sessionId: string): false => {
      if (committed.length === 0) return false;
      throw new WorkbaseError('delete-partial',
        `已删除 ${committed.join('、')}，${sessionId} 在删除过程中发生变化，请重新检测后重试`);
    };
    for (const row of ordered) {
      const sessionId = row.header.id, live = s.get(sessionId);
      if (live) {
        // 与 release() 共用同一份驱逐时序；失败原因在这里翻译成阻断文案。
        const failure = await evictLoadedSession(sessionId, live, { precheck: false });
        if (failure === 'changed') throw new WorkbaseError('running', '会话状态已变化，已停止删除');
        if (failure === 'unreleased') throw new WorkbaseError('running', '会话未能释放，已停止删除');
        evicted.add(sessionId);
      }
      const current = await readRow(sessionId);
      if (current && !sameRow(row, current)) return stop(sessionId);
      await safeDirectory(targets.get(sessionId)!, 3);
      const spill = get<{ root?: string }>('spillStore');
      let spillDirectory: string | undefined;
      if (spill?.root) {
        if (!path.isAbsolute(spill.root)) throw new WorkbaseError('unsafe-storage', '溢出缓存根目录不是绝对路径');
        spillDirectory = path.join(spill.root, `session-${createHash('sha256').update(sessionId).digest('hex').slice(0, 12)}`);
        await safeDirectory(spillDirectory);
      }
      if (!await inactive(sessionId, true) || options.validate && !await options.validate({ evicted: evicted.has(sessionId) })) return stop(sessionId);
      await options.authorize?.({ sessionId, path: row.header.cwd, identity: sessionIdentity(row.header) });
      // detach 的缓存写入先进入同一表队列；删除在其后持久化，避免重新生成已删除缓存。
      await cache.requireTable().delete(sessionId);
      const finalRow = await readRow(sessionId);
      // 缓存删除后只能复查日志与活动，不能再用刚删掉的空会话投影验证。
      if (finalRow && !sameRow(current ?? row, finalRow) || !await inactive(sessionId, true)) return stop(sessionId);
      if (options.evict && options.validate
          && !await options.validate({ evicted: evicted.has(sessionId), cacheRemoved: true })) return stop(sessionId);
      await rm(targets.get(sessionId)!, { recursive: true, force: true });
      if (await p.stat(sessionId) !== undefined)
        throw new WorkbaseError('delete-unconfirmed', '日志删除未能确认，列表记录保留以便重试');
      if (spillDirectory) await rm(spillDirectory, { recursive: true, force: true });
      await removeAccounts(sessionId);
      committed.push(sessionId);
    }
    return true;
  };
  return {
    capabilities, exclusive,
    async deletionIdentity(id: string) {
      return exclusive(async () => {
        const row = await readRow(id);
        const header = row?.header ?? get<Sessions>('sessions')?.get(id)?.header;
        return header && sessionIdentity(header);
      });
    },
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
          || id.startsWith('im:')) return false;
      // 列表里点开过的会话都在内存里，但没在跑；直接判冷态会让重建永远返回失败。
      if (!await inactive(id, true)) {
        if (!await release(id)) return false;
        if (!await inactive(id, true)) return false;
      }
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
      // 有些会话本来就没有标题行（例如只有系统事件），不能把缺少 title 当成重建失败。
      if (!snapshot || !snapshot.values || !isDeepStrictEqual(snapshot, restored.snapshot))
        throw new WorkbaseError('cache-unconfirmed', '列表缓存持久化未能确认，请重新检测后重试');
      const finalRow = await readRow(id);
      if (!finalRow || !sameRow(row, finalRow) || !await inactive(id, true)) return false;
      return true;
    },
  };
}
