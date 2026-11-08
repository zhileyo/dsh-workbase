import type { Context } from '@deepseek-ai/cordis';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { randomUUID } from 'node:crypto';
import { stateSchema, initialState } from '../shared/model.js';
import { RPC_CHANNEL, RPC_ENDPOINT } from '../shared/commands.js';
import { WorkbaseService } from './service.js';
import { createHost } from './host.js';
import { handleRequest } from './http.js';
import { registerTools } from './tools.js';

export const name = 'dsh-workbase';
export const inject = ['workspaceRegistry', 'sessionController', 'agentPresets', 'storageDomain', 'connection', 'tools', 'sessionQuery'];
export const workbaseDomain = defineDomain({
  // 存储域随包名统一为 dsh_workbase；旧域 dsh_workbench 仅用于一次性迁移读取，
  // 迁移后旧文件保留作回滚备份。目标宿主的 single JSON 后端仍严格比较版本，
  // 不能依赖 compatibleVersions；本次仅追加可默认补齐的字段，保留原格式戳。
  name: 'dsh_workbase', version: 1, tables: {},
  global: { schema: stateSchema, initial: initialState() },
});
// 旧包时代的存储域：仅迁移时读取，不再写入。
const legacyDomain = defineDomain({
  name: 'dsh_workbench', version: 1, tables: {},
  global: { schema: stateSchema, initial: initialState() },
});
export const isEmptyState = (state: { revision: number; bindings: unknown[]; todos: unknown[]; projectMarks: Record<string, unknown>; sessionMarks: Record<string, unknown> }) =>
  state.revision === 0 && state.bindings.length === 0 && state.todos.length === 0
    && Object.keys(state.projectMarks).length === 0 && Object.keys(state.sessionMarks).length === 0;
// 新域为空且旧域有数据时整份搬迁，旧文件保留作回滚备份；返回是否发生迁移。
export async function inheritLegacyStorage(ctx: Pick<Context, 'storageDomain'>,
  domain: { global: { get(): ReturnType<typeof stateSchema.parse>; set(next: ReturnType<typeof stateSchema.parse>): unknown } }): Promise<boolean> {
  if (!isEmptyState(domain.global.get())) return false;
  const legacy = await ctx.storageDomain.open(legacyDomain);
  try {
    const inherited = legacy.global.get();
    if (isEmptyState(inherited)) return false;
    await domain.global.set(inherited);
    return true;
  } finally { await legacy.close(); }
}
// 0.2.10 及更早的首页默认是「会话显示、统计卡隐藏」；旧默认组合一次性迁移到新默认
// 「会话隐藏、统计卡显示」。仅命中任一旧默认值时改写，用户显式配置过的完整新组合不受影响。
export const modernizeHomeState = <T extends { preferences: { home: { recent: boolean; stats: boolean } } }>(state: T): T => {
  const home = state.preferences.home;
  if (home.recent === true || home.stats === false)
    return { ...state, preferences: { ...state.preferences, home: { ...home, recent: false, stats: true } } };
  return state;
};
export async function apply(ctx: Context) {
  const domain = await ctx.storageDomain.open(workbaseDomain);
  ctx.effect(() => () => domain.close());
  try {
    // 旧域整份搬迁后再统一做首页默认值现代化，两条路径的存量数据都覆盖。
    await inheritLegacyStorage(ctx, domain);
    const current = domain.global.get();
    const modernized = modernizeHomeState(current);
    if (modernized !== current) await domain.global.set(modernized);
  } catch { /* 旧域读取失败不阻塞启动；新域继续以初始状态服务。 */ }
  const service = new WorkbaseService({
    get: () => domain.global.get(), set: next => domain.global.set(next),
  }, createHost(ctx), randomUUID);
  ctx.effect(() => ctx.connection.fetch.register({
    path: `${RPC_CHANNEL}/${RPC_ENDPOINT}`, methods: ['POST'], requestBody: 'streaming',
    // 精确Fetch路由由Connection强制只允许owner；沿用官方RPC线上封装。
    fetch: request => handleRequest(service, request),
  }));
  registerTools(ctx, service);
}
