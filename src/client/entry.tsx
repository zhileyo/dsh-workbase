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
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots';
import { Workbase } from './Workbase.js';
import { WorkbaseButton } from './WorkbaseButton.js';
import { PluginUpdate } from './PluginUpdate.js';
import { PluginUpdateController, type PluginManagerPort, type UpdateProgress } from './plugin-update.js';
import { ComposerActivity, ComposerMenu, ComposerModelState, ComposerProjectPicker } from './NativeComposer.js';
import type { ComponentType } from 'react';
import { createElement } from 'react';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ConversationController } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { prepareTodoSession, releaseAfterAdoption } from './todo-session.js';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { Todo } from '../shared/model.js';
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { workbaseTodo: unknown; }
}
import { Icon } from './ui.js';
import { caller, UiMemory, type ClientPort } from './api.js';
import { defaultNavigation, type Snapshot, type LaunchCatalog } from '../shared/model.js';
import type { Command } from '../shared/commands.js';
import css from './styles.css';
import prototypeCss from './prototype.css';
import { connectLocale, setLanguage, t, onWorkbaseLocaleChange, type HostLocale } from './i18n.js';

export const inject = ['slots', 'layout', 'uiWorkspace', 'workspaces', 'connection', 'remote', 'remote.pluginManager', 'sessions', 'conversation'];
export function apply(ctx: Context) {
  // 语言服务按能力探测，兼容不提供 locale 的宿主；缺失时中文兜底。
  ctx.inject(['locale'], scope => {
    const locale = (scope as unknown as { get(name: string): HostLocale }).get('locale');
    scope.effect(() => connectLocale(locale));
  });
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* 隐私模式仍可使用工作台。 */ }
  const memory = new UiMemory(storage);
  const todoHandoffs = new Set<() => void>();
  ctx.effect(() => () => { for (const release of todoHandoffs) release(); todoHandoffs.clear(); });
  const connection = ctx.connection as unknown as ConnectionHandle;
  const rawCall = caller(connection.rpc);
  let navigation = defaultNavigation(), revision = -1, stopped = false;
  let pluginUpdateVisible = true;
  let updateController: PluginUpdateController | undefined, automaticChoice: boolean | undefined;
  const updateListeners = new Set<() => void>();
  const visibility = {
    getSnapshot: () => pluginUpdateVisible,
    subscribe: (listener: () => void) => { updateListeners.add(listener); return () => { updateListeners.delete(listener); }; },
  };
  const startAutomaticUpdate = () => {
    if (stopped || !updateController || automaticChoice !== true) return;
    automaticChoice = false;
    void updateController.autoUpdate();
  };
  let mainReady = false, startupChoice: boolean | undefined, startupSignal: AbortSignal | undefined;
  let backupStartupSent = false, backupStartupTimer: ReturnType<typeof setTimeout> | undefined;
  const startStartupBackup = () => {
    if (stopped || !mainReady || revision < 0 || backupStartupSent) return;
    const uploads = (ctx.conversation as unknown as {
      fileUploads?: { getSnapshot(): Record<string, { status: string }> };
    } | undefined)?.fileUploads?.getSnapshot();
    if (automaticChoice === true || updateController?.busy
      || Object.values(uploads ?? {}).some(upload => upload.status === 'uploading')) {
      if (backupStartupTimer) clearTimeout(backupStartupTimer);
      backupStartupTimer = setTimeout(startStartupBackup, 5000);
      return;
    }
    // 去重最终由宿主负责，多个窗口/页面重挂载不会重复创建后端任务。
    backupStartupSent = true;
    void rawCall({ op: 'backup-startup' }).catch(() => { /* 自动失败在设置页读取，启动不弹窗。 */ });
  };
  const openStartupPanel = () => {
    if (stopped || !mainReady || startupChoice !== true || !startupSignal || startupSignal.aborted) return;
    startupChoice = false;
    ctx.layout.selectPanel('dsh-workbase' as MainPanelId);
  };
  let updateSidebar: (() => void) | undefined, updateHeader: (() => void) | undefined;
  const acceptSnapshot = (snapshot: Snapshot) => {
    if (stopped || snapshot.revision < revision) return false;
    revision = snapshot.revision;
    memory.theme = snapshot.preferences.theme;
    setLanguage(snapshot.preferences.language ?? 'follow');
    if (automaticChoice === undefined) {
      automaticChoice = snapshot.preferences.pluginAutoUpdate === true;
      startAutomaticUpdate();
    }
    startStartupBackup();
    const next = snapshot.preferences.navigation ?? defaultNavigation();
    const sidebarChanged = next.sidebarName !== navigation.sidebarName || next.sidebarVisible !== navigation.sidebarVisible
      || next.sidebarPosition !== navigation.sidebarPosition;
    const headerChanged = next.headerButtonVisible !== navigation.headerButtonVisible;
    navigation = { ...next };
    const nextUpdateVisible = snapshot.preferences.pluginUpdateVisible ?? true;
    if (nextUpdateVisible !== pluginUpdateVisible) {
      pluginUpdateVisible = nextUpdateVisible;
      for (const listener of updateListeners) listener();
    }
    if (sidebarChanged) updateSidebar?.();
    if (headerChanged) updateHeader?.();
    return true;
  };
  const refreshNavigation = async () => {
    try {
      const snapshot = await rawCall({ op: 'snapshot' }) as Snapshot;
      if (!acceptSnapshot(snapshot)) return;
      if (startupChoice === undefined && startupSignal && !startupSignal.aborted) {
        startupChoice = snapshot.preferences.openOnStartup === true;
        openStartupPanel();
      }
    }
    catch { /* 配置读取失败保留当前入口；工作台自身显示同步错误。 */ }
  };
  // 只认官方面板的准确接点，不把其他含 forge 的服务当成套件已启用。
  const findForgePanel = () => {
    type Panel = { requestWorktree(sessionId: string, from: string): Promise<{ ok: boolean }> };
    for (const read of [
      () => (ctx.remote as unknown as { forgePanel?: Panel }).forgePanel,
      () => (ctx as unknown as { get(name: string): Panel | undefined }).get('remote.forgePanel'),
    ]) {
      try {
        const panel = read();
        if (typeof panel?.requestWorktree === 'function') return panel;
      } catch { /* 官方面板尚未挂载或已卸载。 */ }
    }
    return null;
  };
  const api: ClientPort = {
    async uploadTodoAttachment(todo, file) {
      const query = new URLSearchParams({ projectId: todo.projectId, id: todo.id, expectedVersion: String(todo.version), name: file.name });
      const response = await fetch(`api/workbase/todo-attachment?${query}`, {
        method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? `附件上传失败（${response.status}）`);
      }
      return await response.json() as Todo;
    },
    async readTodoAttachment(todo, attachment, signal) {
      const query = new URLSearchParams({ projectId: todo.projectId, id: todo.id, attachmentId: attachment.attachmentId });
      const response = await fetch(`api/workbase/todo-attachment/content?${query}`, { signal });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? `附件读取失败（${response.status}）`);
      }
      return response.blob();
    },
    renderMarkdown: text => <MarkdownText text={text} labels={{ code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }}/>,
    async uploadTodoImage(todo, file) {
      const query = new URLSearchParams({ projectId: todo.projectId, id: todo.id, expectedVersion: String(todo.version) });
      const response = await fetch(`api/workbase/todo-image?${query}`, {
        method: 'POST', headers: { 'Content-Type': file.type }, body: file,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? `图片上传失败（${response.status}）`);
      }
      return await response.json() as Todo;
    },
    async readTodoImage(todo, image, signal) {
      const query = new URLSearchParams({ projectId: todo.projectId, id: todo.id, attachmentId: image.attachmentId });
      const response = await fetch(`api/workbase/todo-image/content?${query}`, { signal });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? `图片读取失败（${response.status}）`);
      }
      return response.blob();
    },
    async openTodoSession(todo, preset) {
      const navigationSignal = ctx.layout.beginNavigation();
      let prepared: SessionReference | undefined;
      try { await prepareTodoSession(todo, {
        read: attachment => api.readTodoAttachment!(todo, attachment, navigationSignal),
        begin: async () => {
          navigationSignal.throwIfAborted();
          const result = await rawCall({ op: 'begin-session', projectId: todo.projectId, preset }, navigationSignal) as { sessionId: string };
          return result.sessionId;
        },
        draft: async (sessionId, text, blobs) => {
          navigationSignal.throwIfAborted();
          const reference = ctx.sessions.retain(sessionId as SessionId, { source: 'workbaseTodo' });
          prepared = reference;
          try {
            await reference.ready; navigationSignal.throwIfAborted();
            const conversation = ctx.conversation as ConversationController;
            const shell = conversation.input.for(reference.binding.ctx);
            const state = shell.state.getSnapshot();
            if (!['plain', 'claimed'].includes(state.phase)) throw new Error('目标会话正在提交，草稿交接失败，请重试');
            const files = blobs.map((blob, index) => blob instanceof File ? blob : new File([blob], `todo-${index + 1}`, { type: blob.type }));
            const imageFiles = files.filter(file => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type));
            const limits = reference.binding.session.getSnapshot().imageLimits;
            if (limits && (imageFiles.length > limits.maxImagesPerMessage || imageFiles.some(f => f.size > limits.maxImageBytes)
              || imageFiles.reduce((sum, f) => sum + f.size, 0) > limits.maxMessageImageBytes))
              throw new Error('待办图片超过宿主单条消息限制，请减少图片后重试');
            const attachments = conversation.createDrafts(reference.sessionId, files, true);
            if (attachments.length && !shell.addAttachments(attachments.map(a => a.id))) {
              conversation.releaseDraftAttachments(attachments); throw new Error('目标会话未接受附件，请重试');
            }
            shell.setDraft(text);
          } catch (error) { reference.release(); prepared = undefined; throw error; }
        },
        open: id => {
          navigationSignal.throwIfAborted();
          api.openSession(id);
          if (!prepared) throw new Error('会话草稿未准备完成');
          const reference = prepared; prepared = undefined;
          let release: (() => void) | undefined, finished = false;
          release = releaseAfterAdoption(reference, ctx.sessions.retainInfo(id as SessionId), () => {
            finished = true; if (release) todoHandoffs.delete(release);
          });
          if (!finished) todoHandoffs.add(release);
        },
      }); } catch (error) { prepared?.release(); throw error; }
    },
    renderComposerProject: props => <ComposerProjectPicker {...props}/>,
    pluginUpdateBusy: {
      getSnapshot: () => updateController?.busy ?? false,
      subscribe: visibility.subscribe,
    },
    async call(command, signal) {
      const value = await rawCall(command, signal);
      if (command.op === 'snapshot') acceptSnapshot(value as Snapshot);
      else if (command.op === 'launch-catalog') {
        const forms = ctx.get('configForms') as { developerTools?: { enabled: { getSnapshot(): boolean } } } | undefined;
        if (forms?.developerTools?.enabled.getSnapshot() === false) {
          const catalog = value as LaunchCatalog;
          return { ...catalog, presets: catalog.presets.filter(p => !p.requiresCodingTools) };
        }
      }
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
    forgeAvailable: () => findForgePanel() !== null,
    async requestWorktree(sessionId, from) {
      const panel = findForgePanel();
      if (!panel) return false;
      return (await panel.requestWorktree(sessionId, from)).ok;
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
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register(
      { name: 'main', key: 'dsh-workbase', children: {
        'workbase.command-menu': { kind: 'single', scope: 'session' },
        'workbase.model-selector': { kind: 'single', scope: 'session' },
        'workbase.input-activity': { kind: 'single', scope: 'session' },
      } },
      props => {
        if (props?.renderSlot) api.renderComposerMenu = options => <ComposerMenu ctx={ctx} memory={memory} {...options}
          SessionProvider={props.SessionProvider} renderSlot={props.renderSlot}/>;
        return <Workbase api={api} memory={memory}/>;
      },
    );
    let disposeComposer: (() => void) | undefined;
    let disposeModel: (() => void) | undefined;
    let disposeActivity: (() => void) | undefined;
    let previous: unknown;
    let previousModel: unknown;
    let previousActivity: unknown;
    const updateMenu = () => {
      const menu = ctx.slots.entriesOfSlot?.('conversation.input.overlay').find(entry => entry.options.id === 'slash-menu');
      if (menu !== previous) {
        previous = menu; disposeComposer?.(); disposeComposer = undefined;
        if (menu) disposeComposer = ctx.slots.register({
          name: 'workbase.command-menu', locale: 'slash.menu',
          inject: (sessionId: SessionId) => (menu.inject as unknown as (id: SessionId) => Record<string, unknown>)(sessionId),
        }, (props: Record<string, unknown>) => createElement(menu.component as ComponentType<Record<string, unknown>>, props));
      }
      const model = ctx.slots.entriesOfSlot?.('conversation.input.model')[0];
      if (model !== previousModel) {
        previousModel = model; disposeModel?.(); disposeModel = undefined;
        if (model) disposeModel = ctx.slots.register({
          name: 'workbase.model-selector', locale: model.locale as (keyof LocaleNamespaceMap & string) | undefined, children: model.children,
          inject: (sessionId: SessionId) => (model.inject as unknown as (id: SessionId) =>
            { directory: Parameters<typeof ComposerModelState>[0]['directory'] } & Record<string, unknown>)(sessionId),
        }, props => <ComposerModelState directory={props.directory} onState={props.onState}>
          {createElement(model.component as ComponentType<Record<string, unknown>>, props)}
        </ComposerModelState>);
      }
      const activity = ctx.slots.entriesOfSlot?.('conversation.input.activity').find(entry => entry.locale === 'voice-input');
      if (activity !== previousActivity) {
        previousActivity = activity; disposeActivity?.(); disposeActivity = undefined;
        if (activity) disposeActivity = ctx.slots.register({
          name: 'workbase.input-activity', locale: activity.locale as (keyof LocaleNamespaceMap & string) | undefined,
          children: activity.children,
          inject: (sessionId: SessionId) => (activity.inject as unknown as (id: SessionId) => Record<string, unknown>)(sessionId),
        }, props => <ComposerActivity {...props} component={activity.component as ComponentType<Record<string, unknown>>}/>);
      }
    };
    updateMenu();
    const stopMenu = ctx.on?.('slots/changed', updateMenu);
    // 订阅官方语音插槽的注册变化，跟随套件启停，不以“已安装”或首次探测缓存判断。
    const stopActivity = ctx.slots.subscribe?.('conversation.input.activity', updateMenu);
    mainReady = true;
    openStartupPanel();
    startStartupBackup();
    return () => { mainReady = false; stopMenu?.(); stopActivity?.(); disposeComposer?.(); disposeModel?.(); disposeActivity?.(); dispose(); };
  });
  ctx.slots.inject('sidebar.panellist', () => {
    let dispose: (() => void) | undefined;
    let previous: { label: string; order: number } | undefined;
    let updating = false;
    const update = () => {
      if (updating) return;
      const orders = ctx.slots.entriesOfSlot?.('sidebar.panellist')
        .filter(entry => entry.options.id !== 'dsh-workbase')
        .map(entry => typeof entry.options.order === 'number' && Number.isFinite(entry.options.order) ? entry.options.order : 0)
        .sort((a, b) => a - b);
      const position = navigation.sidebarPosition;
      let order = position > 0 ? position : Number.MAX_SAFE_INTEGER + position;
      if (orders) {
        const index = position < 0 ? Math.max(0, orders.length + position + 1)
          : Math.min(position - 1, orders.length);
        const before = orders[index - 1], after = orders[index];
        order = before === undefined ? (after === undefined ? 0 : after - 1)
          : after === undefined ? before + 1 : before / 2 + after / 2;
      }
      const label = navigation.sidebarName === '项目概览' ? t('项目概览') : navigation.sidebarName;
      if (navigation.sidebarVisible ? previous?.label === label && previous.order === order : !previous) return;
      // 注册/移除也会同步通知插槽订阅，避免自己的通知触发递归注册。
      updating = true;
      try {
        dispose?.(); dispose = undefined; previous = undefined;
        if (navigation.sidebarVisible) {
          previous = { label, order };
          dispose = ctx.slots.register(
            { name: 'sidebar.panellist', id: 'dsh-workbase', order, label: () => label },
            props => <Icon name="grid" size={props.size}/>,
          );
        }
      } finally { updating = false; }
    };
    updateSidebar = update;
    update();
    const stop = ctx.slots.subscribe?.('sidebar.panellist', update);
    const stopLocale = onWorkbaseLocaleChange(update);
    return () => { updateSidebar = undefined; stopLocale?.(); stop?.(); dispose?.(); };
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
  ctx.slots.inject('shell.overlay', () => {
    const manager = () => {
      const service = (ctx.remote as unknown as { pluginManager?: PluginManagerPort }).pluginManager;
      if (!service) throw new Error('当前宿主未提供插件更新服务');
      return service;
    };
    const controller = new PluginUpdateController({
      listBundles: () => manager().listBundles(),
      listVersions: (name, options) => manager().listVersions(name, options),
      updateBundle: (name, version, options) => manager().updateBundle(name, version, options),
    });
    updateController = controller;
    const stopBusy = controller.subscribe(() => { for (const listener of updateListeners) listener(); });
    for (const listener of updateListeners) listener();
    startAutomaticUpdate();
    const remote = ctx.remote as unknown as { $on?(name: string, callback: (progress: UpdateProgress) => void): () => void };
    const unsubscribe = remote?.$on?.('plugin-manager/update-state', progress => controller.progress(progress));
    const dispose = ctx.slots.register({ name: 'shell.overlay', id: 'workbase.plugin-update' },
      () => <PluginUpdate controller={controller} visibility={visibility}/>);
    return () => {
      unsubscribe?.(); stopBusy(); controller.dispose();
      if (updateController === controller) updateController = undefined;
      for (const listener of updateListeners) listener();
      dispose?.();
    };
  });
  ctx.effect(() => {
    // data-platform 由桌面 preload 设置。读取偏好前占用导航信号，
    // 用户后续选面板／新建会话会取消该信号，慢响应不抢占页面。
    const platform = document.documentElement.getAttribute('data-platform');
    if (['darwin', 'win32', 'linux'].includes(platform ?? '') && ctx.layout.panelInfo.getSnapshot().activePanelId === null) {
      startupSignal = ctx.layout.beginNavigation();
    }
    void refreshNavigation();
    const reset = ctx.on('connection/reset', () => { revision = -1; void refreshNavigation(); });
    return () => { stopped = true; if (backupStartupTimer) clearTimeout(backupStartupTimer); reset(); };
  });
}
export default { inject, apply };
