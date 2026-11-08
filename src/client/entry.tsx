import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client';
import { Workbase } from './Workbase.js';
import { WorkbaseButton } from './WorkbaseButton.js';
import { Icon } from './ui.js';
import { caller, UiMemory, type ClientPort } from './api.js';
import { defaultNavigation, type Snapshot } from '../shared/model.js';
import type { Command } from '../shared/commands.js';
import css from './styles.css';
import prototypeCss from './prototype.css';

export const inject = ['slots', 'layout', 'uiWorkspace', 'workspaces', 'connection', 'remote'];
export function apply(ctx: Context) {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* 隐私模式仍可使用工作台。 */ }
  const memory = new UiMemory(storage);
  const connection = ctx.connection as unknown as ConnectionHandle;
  const rawCall = caller(connection.rpc);
  let navigation = defaultNavigation(), revision = -1, stopped = false;
  let updateSidebar: (() => void) | undefined, updateHeader: (() => void) | undefined;
  const acceptSnapshot = (snapshot: Snapshot) => {
    if (stopped || snapshot.revision < revision) return;
    revision = snapshot.revision;
    const next = snapshot.preferences.navigation ?? defaultNavigation();
    const sidebarChanged = next.sidebarName !== navigation.sidebarName || next.sidebarVisible !== navigation.sidebarVisible
      || next.sidebarPosition !== navigation.sidebarPosition;
    const headerChanged = next.headerButtonVisible !== navigation.headerButtonVisible;
    navigation = { ...next };
    if (sidebarChanged) updateSidebar?.();
    if (headerChanged) updateHeader?.();
  };
  const refreshNavigation = async () => {
    try { acceptSnapshot(await rawCall({ op: 'snapshot' }) as Snapshot); }
    catch { /* 配置读取失败保留当前入口；工作台自身显示同步错误。 */ }
  };
  // remote.forgePanel 由 client-ui-forge 经 remote.$mount 异步挂载（官方侧为
  // ctx.remote.forgePanel 属性访问 + remote.forgePanel 注入别名并存）；挂载时机
  // 晚于首帧且解析路径不止一种，逐路径探测，任一命中即可用。
  // 该面板的挂载状态即平台对 @deepseek-ai/dsh-experimental-forge-bundle 的启用状态：
  // 开关关闭时整个 bundle 不加载，面板不会出现；因此分支条显隐以它为准。
  const pickForge = (candidate: unknown): unknown => {
    if (!candidate || typeof candidate !== 'object') return null;
    const direct = (candidate as { forgePanel?: unknown }).forgePanel;
    if (direct) return direct;
    // 命名空间内的键名随版本可能变化（forge / forge*），按名兜底扫描。
    for (const key of Object.keys(candidate as Record<string, unknown>)) {
      if (!/forge/i.test(key)) continue;
      const value = (candidate as Record<string, unknown>)[key];
      if (value && typeof value === 'object') return value;
    }
    return null;
  };
  const findForgePanel = (): unknown => {
    try {
      const panel = pickForge((ctx as unknown as { remote?: unknown }).remote);
      if (panel) return panel;
    } catch { /* 属性访问不可达，尝试下一路径 */ }
    try {
      const panel = pickForge(ctx.get('remote'));
      if (panel) return panel;
    } catch { /* 服务不可达，尝试下一路径 */ }
    try {
      const panel = (ctx as unknown as { get(key: string): unknown }).get('remote.forgePanel');
      if (panel && typeof panel === 'object') return panel;
    } catch { /* 注入别名不存在 */ }
    for (const name of ['forgePanel', 'forge']) {
      try {
        const panel = ctx.get(name);
        if (panel && typeof panel === 'object') return panel;
      } catch { /* 该服务名不存在 */ }
    }
    return null;
  };
  const api: ClientPort = {
    async call(command, signal) {
      const value = await rawCall(command, signal);
      if (command.op === 'snapshot') acceptSnapshot(value as Snapshot);
      else if (command.op === 'settings' || command.op === 'preferences') await refreshNavigation();
      return value;
    },
    openSession(id) { ctx.uiWorkspace.openSession(id as SessionId); ctx.layout.selectPanel(null); },
    async newSession(workspaceId) {
      const signal = ctx.layout.beginNavigation();
      const id = await ctx.uiWorkspace.connectWorkspace(workspaceId as WorkspaceId);
      if (signal.aborted) return;
      ctx.uiWorkspace.openSession(id);
      ctx.layout.selectPanel(null);
    },
    pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
    forgeAvailable() {
      // experimental-forge-bundle 启用时 client-ui-forge 经 remote.$mount 挂载 forgePanel；
      // 挂载异步且晚于首帧，每次调用时逐路径重探，随插件页的启停即时生效。
      return findForgePanel() !== null;
    },
    async requestWorktree(sessionId, from) {
      // 官方链路：注册工作树请求后，首条消息入队等待，宿主在回合开始前从基准分支创建工作树
      // 并切换会话工作目录（.agents/worktrees/dsh-<id8>-<rand4>）。
      try {
        const forgePanel = findForgePanel() as {
          requestWorktree?(sessionId: string, from: string): Promise<{ ok: boolean }>;
        } | null;
        if (typeof forgePanel?.requestWorktree !== 'function') return false;
        return (await forgePanel.requestWorktree(sessionId, from)).ok;
      } catch { return false; }
    },
    async revealDirectory(projectId) {
      // 打开目录由服务端完成：平台 SessionController.openWorkspacePath 优先，缺失时服务端本机回退。
      try { return (await rawCall({ op: 'reveal-directory', projectId } as Command) as { revealed?: boolean }).revealed === true; }
      catch { return false; }
    },
    async addProject(directory) {
      const before = ctx.workspaces.list.getSnapshot();
      const created = await ctx.workspaces.create({ path: directory });
      // 路径正规化和重复检测由宿主完成，不自行扫描磁盘。
      return !before.items.some(w => w.workspaceId === created.workspaceId);
    },
    async archiveSession(id, archived) {
      if (archived) await ctx.uiWorkspace.archiveSession(id as SessionId);
      else await ctx.uiWorkspace.unarchiveSession(id as SessionId);
    },
    subscribe(listener) {
      const workspace = ctx.workspaces.list.subscribe(listener);
      const reset = ctx.on('connection/reset', listener);
      return () => { workspace(); reset(); };
    },
  };
  ctx.effect(() => {
    const style = document.createElement('style');
    style.id = 'dsh-workbase-styles';
    style.textContent = prototypeCss + '\n' + css;
    document.head.append(style);
    return () => style.remove();
  });
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: 'dsh-workbase' },
    () => <Workbase api={api} memory={memory}/>,
  ));
  ctx.slots.inject('sidebar.panellist', () => {
    let dispose: (() => void) | undefined;
    const update = () => {
      dispose?.(); dispose = undefined;
      if (navigation.sidebarVisible) {
        const label = navigation.sidebarName;
        dispose = ctx.slots.register(
          { name: 'sidebar.panellist', id: 'dsh-workbase', order: navigation.sidebarPosition, label: () => label },
          props => <Icon name="grid" size={props.size}/>,
        );
      }
    };
    updateSidebar = update;
    update();
    return () => { updateSidebar = undefined; dispose?.(); };
  });
  ctx.slots.inject('conversation.header.leading', () => {
    let dispose: (() => void) | undefined;
    const update = () => {
      dispose?.(); dispose = undefined;
      if (navigation.headerButtonVisible) dispose = ctx.slots.register(
        { name: 'conversation.header.leading', priority: 10 },
        () => <WorkbaseButton open={() => ctx.layout.selectPanel('dsh-workbase' as MainPanelId)}/>,
      );
    };
    updateHeader = update;
    update();
    return () => { updateHeader = undefined; dispose?.(); };
  });
  ctx.effect(() => {
    void refreshNavigation();
    const reset = ctx.on('connection/reset', () => { revision = -1; void refreshNavigation(); });
    return () => { stopped = true; reset(); };
  });
}
export default { inject, apply };
