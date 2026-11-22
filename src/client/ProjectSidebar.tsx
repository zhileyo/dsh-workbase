import { createElement, useLayoutEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import { Button, IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { errorText, t, useWorkbaseLocale } from './i18n.js';
import { bindSidebarTarget, type ProjectSidebarController, type SidebarReadable, type SidebarReference } from './project-sidebar.js';

interface View {
  sessionId: string;
  reference: SidebarReference;
  selected: boolean;
  retainTab(tabId: string, signal: AbortSignal): () => void;
}
interface RootFace {
  hooks: { views: SidebarReadable<readonly View[]> };
  mountView(reference: SidebarReference): () => void;
}
interface Entry {
  component: unknown;
  options: { priority?: number };
  store?: unknown;
  locale?: string;
  children?: Readonly<Record<string, { kind: string; scope: string }>>;
  inject?: (...args: never[]) => Record<string, unknown>;
}
export interface ProjectSidebarSlots {
  entries(name: string): readonly Entry[];
  subscribe(name: string, listener: () => void): () => void;
  inject(name: string, register: () => () => void): () => void;
  register(options: { name: string; priority?: number; locale?: string; store?: unknown; children?: Entry['children'];
    inject?: (...args: never[]) => Record<string, unknown> }, component: ComponentType<any>): () => void;
}
const readable = (value: unknown): value is SidebarReadable<unknown> => !!value
  && typeof (value as SidebarReadable<unknown>).getSnapshot === 'function'
  && typeof (value as SidebarReadable<unknown>).subscribe === 'function';

/** 合并项目和官方保留视图；同一Session只挂一份官方Store与Tab树。 */
function projectViews(controller: ProjectSidebarController, official: RootFace): RootFace {
  let snapshot: readonly View[] = [];
  const getSnapshot = () => {
    const target = controller.target.getSnapshot();
    const views = new Map<string, View>();
    for (const view of official.hooks.views.getSnapshot())
      views.set(view.sessionId, { ...view, selected: !target.active && view.selected });
    for (const view of controller.getSnapshot().views) {
      const previous = views.get(view.sessionId);
      if (previous?.selected) continue;
      views.set(view.sessionId, { sessionId: view.sessionId, reference: view.reference,
        selected: target.active && target.sessionId === view.sessionId, retainTab: view.retainTab });
    }
    const next = [...views.values()];
    if (next.length !== snapshot.length || next.some((view, index) => {
      const previous = snapshot[index];
      return !previous || previous.sessionId !== view.sessionId || previous.reference !== view.reference
        || previous.selected !== view.selected || previous.retainTab !== view.retainTab;
    })) snapshot = next;
    return snapshot;
  };
  return {
    hooks: { views: { getSnapshot, subscribe(listener) {
      const native = official.hooks.views.subscribe(listener), project = controller.subscribe(listener);
      return () => { native(); project(); };
    } } },
    mountView(reference) {
      const view = controller.getSnapshot().views.find(view => view.reference === reference);
      return view ? view.mount() : official.mountView(reference);
    },
  };
}

/**
 * 保留官方Root注册项及子插槽授权，适配其公开组件；不复制Git、文件、终端。
 * 前台读源只在项目详情投影，官方写动作仍在原Controller及Tab资源所有者执行。
 */
export function installProjectSidebar(slots: ProjectSidebarSlots, controller: ProjectSidebarController,
  mounted: SidebarReadable<string | undefined>) {
  controller.setAvailable(false);
  if (!readable(mounted) || typeof slots.entries !== 'function' || typeof slots.subscribe !== 'function') return () => {};
  return slots.inject('rightbar', () => slots.inject('workbase.sidebar-expand', () => {
    let closed = false, reconciling = false;
    let selected: { root: Entry; corner: Entry; seat: Entry } | undefined;
    let Root: ComponentType<any> | undefined;
    let remove: (() => void) | undefined;
    const original = (name: string) => [...slots.entries(name)]
      .sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0];
    const reconcile = () => {
      if (closed || reconciling) return;
      reconciling = true;
      try {
        const root = original('rightbar'), corner = original('conversation.session.header.corner');
        const seat = original('rightbar.session');
        const valid = root?.inject && !root.store && root.children?.['rightbar.session']?.scope === 'session'
          && corner?.inject && corner.store && corner.locale === 'sidebarRight'
          && seat?.store === corner.store && seat.locale === 'sidebarRight';
        if (valid && selected?.root === root && selected.corner === corner && selected.seat === seat) return;
        controller.setAvailable(false);
        const dispose = remove; remove = undefined; selected = undefined; dispose?.();
        if (!valid || !root?.inject || !corner?.inject || !seat) return;
        let face: RootFace;
        try {
          const value = root.inject() as unknown as RootFace;
          if (!readable(value?.hooks?.views) || typeof value.mountView !== 'function'
            || !Array.isArray(value.hooks.views.getSnapshot())) return;
          face = projectViews(controller, value);
        } catch { return; }
        const OfficialRoot = root.component as ComponentType<any>;
        const OfficialExpand = corner.component as ComponentType<any>;
        Root = props => {
          const target = useSyncExternalStore(controller.target.subscribe, controller.target.getSnapshot, controller.target.getSnapshot);
          const views = useSyncExternalStore(face.hooks.views.subscribe, face.hooks.views.getSnapshot, face.hooks.views.getSnapshot);
          const usePanelInfo = (selector: (value: { activePanelId: string | null }) => unknown, equal?: unknown) =>
            props.usePanelInfo((value: { activePanelId: string | null }) =>
              selector(target.active ? { ...value, activePanelId: null } : value), equal);
          return createElement(OfficialRoot, { ...props, usePanelInfo,
            useViews: (selector: (value: readonly View[]) => unknown) => selector(views), mountView: face.mountView });
        };
        let restore: () => void;
        try { restore = bindSidebarTarget(mounted, controller.target); }
        catch { return; }
        const disposers: (() => void)[] = [restore];
        try {
          // children只能由一份存活注册拥有；新注册重复声明会被宿主拒绝。
          // 保留原声明、注入与授权，仅可逆替换公开component读取投影。
          root.component = Root;
          disposers.push(() => { if (root.component === Root) root.component = OfficialRoot; });
          // 非胜出席位只通过官方注册生命周期通知renderer重读已挂载的Root。
          disposers.push(slots.register({ name: 'rightbar', priority: (root.options.priority ?? 0) + 1 }, () => null));
          disposers.push(slots.register({ name: 'workbase.sidebar-expand', locale: corner.locale, store: corner.store,
            children: corner.children, inject: corner.inject }, props => {
            const initialized = useRef<string>();
            // 首次点击完成连接后直接展开；同一会话的后续重进详情保持收起。
            useLayoutEffect(() => {
              if (initialized.current === props.sessionId) return;
              if (controller.initializeExpansion(props.sessionId,
                expanded => props.actions.setExpanded(props.sessionId, expanded))) initialized.current = props.sessionId;
            }, [props.sessionId]);
            return <span className="wb-project-sidebar-control" data-state="ready">
              <span className="wb-project-sidebar-separator" aria-hidden="true"/>
              {createElement(OfficialExpand, props)}
            </span>;
          }));
        } catch {
          disposers.reverse().forEach(dispose => dispose());
          return;
        }
        remove = () => { disposers.reverse().forEach(dispose => dispose()); };
        selected = { root, corner, seat };
        controller.setAvailable(true);
      } finally { reconciling = false; }
    };
    const subscriptions = ['rightbar', 'rightbar.session', 'conversation.session.header.corner']
      .map(name => slots.subscribe(name, reconcile));
    reconcile();
    return () => {
      closed = true; subscriptions.forEach(dispose => dispose());
      controller.setAvailable(false); remove?.();
    };
  }));
}

export interface ProjectSidebarRender {
  SessionProvider: ComponentType<{ session: SessionReference; children?: ReactNode }>;
  renderSlot(name: 'workbase.sidebar-expand', owner: Record<string, never>): ReactNode;
}
export function ProjectSidebarHeader({ controller, SessionProvider, renderSlot }:
  ProjectSidebarRender & { controller: ProjectSidebarController }) {
  useWorkbaseLocale();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const target = useSyncExternalStore(controller.target.subscribe, controller.target.getSnapshot, controller.target.getSnapshot);
  if (!snapshot.project || !snapshot.available || !target.active || !snapshot.candidates.length) return null;
  const view = snapshot.views.find(view => view.sessionId === target.sessionId);
  if (view) return <SessionProvider session={view.reference as SessionReference}>
    {renderSlot('workbase.sidebar-expand', {})}
  </SessionProvider>;
  const message = snapshot.error || (!snapshot.project.available ? '项目目录不可用'
    : snapshot.pending ? '正在准备项目右栏…' : '打开项目右栏');
  return <span className="wb-project-sidebar-control" data-state={snapshot.pending ? 'loading' : 'idle'}>
    <span className="wb-project-sidebar-separator" aria-hidden="true"/>
    <Tooltip label={errorText(message)} side="bottom" delayMs={500}>
      <Button size="sm" disabled={snapshot.pending || !snapshot.project.available} data-sidebar-right-expand
        aria-busy={snapshot.pending}
        aria-label={snapshot.error ? t('重试打开项目右栏') : t(message)}
        onClick={() => controller.open()}><IconPanelLeftOutlineRegular/></Button>
    </Tooltip>
  </span>;
}
