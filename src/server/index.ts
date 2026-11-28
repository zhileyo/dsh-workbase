import type { Context } from '@deepseek-ai/cordis';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { randomUUID } from 'node:crypto';
import { stateSchema, initialState } from '../shared/model.js';
import { RPC_CHANNEL, RPC_ENDPOINT, EXTENSIONS_ENDPOINT, ASSISTANT_ENDPOINT } from '../shared/commands.js';
import { WorkbaseService } from './service.js';
import { createHost } from './host.js';
import { handleRequest } from './http.js';
import { RULES_ENDPOINT, MESSAGE_ENDPOINT } from '../shared/project-rules.js';
import { registerTools } from './tools.js';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { BackupManager } from './backup.js';
import { createBackupSources, backupBusy } from './backup-sources.js';
import { RestoreManager } from './restore.js';
import { todoFetchRoutes } from './todo-images.js';
import { Extensions } from './extensions.js';
import { registerExtensionTools } from './extension-tools.js';
import { Personalization } from './personalization.js';
import { Speech, type SpeechVault } from './speech.js';
import { speechFetch } from './speech-fetch.js';
import type {} from '@deepseek-ai/dsh-fs';
import type {} from '@deepseek-ai/dsh-system-prompt';

export const name = 'dsh-workbase';
export const inject = ['workspaceRegistry', 'sessionController', 'agentPresets', 'storageDomain', 'connection', 'tools'];
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
    await domain.global.set(modernizeHomeState(inherited, 'dsh_workbench'));
    return true;
  } finally { await legacy.close(); }
}
// 只有旧存储域迁入有来源见证；当前域的相同值可能是用户保存的合法偏好。
export const modernizeHomeState = <T extends { preferences: { home: { recent: boolean; stats: boolean } } }>(
  state: T, source?: 'dsh_workbench'): T => {
  if (source !== 'dsh_workbench') return state;
  const home = state.preferences.home;
  if (home.recent === true || home.stats === false)
    return { ...state, preferences: { ...state.preferences, home: { ...home, recent: false, stats: true } } };
  return state;
};
export async function apply(ctx: Context) {
  const domain = await ctx.storageDomain.open(workbaseDomain);
  ctx.effect(() => () => domain.close());
  try {
    // 默认转换与旧域继承同一次写入；当前域不会在再次启用时重置用户偏好。
    await inheritLegacyStorage(ctx, domain);
  } catch { /* 旧域读取失败不阻塞启动；新域继续以初始状态服务。 */ }
  const host = createHost(ctx);
  const speech = new Speech(() => {
    const service = ctx.get('credentials') as SpeechVault | undefined;
    return service && typeof service.readRecord === 'function' && typeof service.modifyRecord === 'function' ? service : undefined;
  });
  const personal = new Personalization(resolveDshHome(), () => ctx.get('fs'), () => ctx.emit('system-prompt/change'));
  // 可选官方服务热插拔；不占用宿主persona自身的section名称。
  ctx.inject(['systemPrompt'], scope => {
    const dispose = scope.systemPrompt.section({ name: 'dsh-workbase:personalization',
      order: scope.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 1,
      text: () => personal.prompt(), interpolate: false });
    personal.active = true;
    return () => { personal.active = false; dispose(); };
  });
  await personal.list().catch(() => { /* 文件冲突在设置读取时明确反馈，不能阻塞插件。 */ });
  const extensions = new Extensions(ctx, resolveDshHome(), host, () => domain.global.get(),
    () => domain.global.get().preferences.extensionConfig);
  ctx.effect(() => () => extensions.dispose());
  const startupKey = Symbol.for('dsh-workbase.backup-startup');
  const runtime = globalThis as typeof globalThis & { [startupKey]?: boolean };
  const backup: BackupManager = new BackupManager({
    home: resolveDshHome(), settings: () => domain.global.get().preferences.backup,
    state: () => service.exportBackupState(), sources: createBackupSources(ctx, resolveDshHome(), host),
    busy: backupBusy(ctx, host),
    claimStartup: () => {
      if (runtime[startupKey]) return false;
      runtime[startupKey] = true;
      return true;
    },
  });
  ctx.effect(() => () => backup.dispose());
  const restore: RestoreManager = new RestoreManager({
    home: resolveDshHome(), backup,
    state: () => service.exportBackupState(), inspect: value => service.inspectRestore(value),
    apply: (value, revision, beforeWrite) => service.applyRestore(value, revision, beforeWrite),
    roots: async () => (await createBackupSources(ctx, resolveDshHome(), host)()).flatMap(source => source.path ? [source.path] : []),
  });
  ctx.effect(() => () => restore.dispose());
  const service: WorkbaseService = new WorkbaseService({
    get: () => domain.global.get(), set: next => domain.global.set(next),
  }, host, randomUUID, Date.now, backup, restore, personal, speech);
  for (const failure of await service.syncMigratedWorkspaces()) ctx.logger?.warn(`workbase: ${failure}`);
  ctx.effect(() => () => speech.dispose());
  ctx.effect(() => ctx.connection.fetch.register({
    path: `${RPC_CHANNEL}/workbase/speech-stream`, methods: ['POST'], requestBody: 'streaming',
    fetch: request => speechFetch(speech, request),
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: `${RPC_CHANNEL}/${RPC_ENDPOINT}`, methods: ['POST'], requestBody: 'streaming',
    // 精确Fetch路由由Connection强制只允许owner；沿用官方RPC线上封装。
    fetch: request => handleRequest(service, request, extensions),
  }));
  // 专用端点按通道标签登记：端点路径与允许的 op 由同一份标签表派生。
  for (const [endpoint, route] of [
    [EXTENSIONS_ENDPOINT, 'extensions'], [RULES_ENDPOINT, 'rules'],
    [MESSAGE_ENDPOINT, 'message'], [ASSISTANT_ENDPOINT, 'assistant'],
  ] as const)
    ctx.effect(() => ctx.connection.fetch.register({
      path: `${RPC_CHANNEL}/${endpoint}`, methods: ['POST'], requestBody: 'streaming',
      fetch: request => handleRequest(service, request, extensions, route),
    }));
  registerTools(ctx, service);
  registerExtensionTools(ctx, extensions.rss);
  for (const route of todoFetchRoutes(service)) ctx.effect(() => ctx.connection.fetch.register(route));
}
