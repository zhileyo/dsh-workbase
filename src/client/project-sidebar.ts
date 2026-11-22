import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';

export interface SidebarReadable<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
export type SidebarReference = Pick<SessionReference, 'sessionId' | 'binding' | 'ready' | 'release'>;
export interface SidebarProject {
  projectId: string;
  workspaceId: string;
  /** 已由宿主正规化的workspace.path，不自行解析或改写路径。 */
  path: string;
  available: boolean;
}
interface Directory {
  workspaceId: string;
  path: string;
  workingDirectory: string | undefined;
}
export interface SidebarTarget { active: boolean; sessionId?: string; }
export interface ProjectSidebarPort {
  panel: SidebarReadable<string | null>;
  /** 只列已有且目录匹配的会话，按最近活动排序；不创建会话。 */
  candidates(project: SidebarProject): readonly string[];
  subscribeCandidates(listener: () => void): () => void;
  /** 未打开会话的只读目录检查，不持有引用、不启动迁移。 */
  refreshCandidates?(project: SidebarProject): void;
  retain(sessionId: string): SidebarReference;
  directory(reference: SidebarReference, project: SidebarProject): Promise<Directory>;
  currentDirectory?(reference: SidebarReference, project: SidebarProject): Directory;
  watchDirectory?(reference: SidebarReference, listener: () => void): () => void;
  closeRightbar(): void;
}

/** 只读取官方目录及投影，不写Agent目录或Conversation选择。 */
export function officialProjectSidebarPort(host: {
  sessions: ISessions;
  workspaces: IWorkspaces;
  layout: { panelInfo: SidebarReadable<{ activePanelId: string | null }>; closeRightbar(): void };
}): ProjectSidebarPort | undefined {
  const { sessions, workspaces, layout } = host;
  if (!layout?.panelInfo?.subscribe || !layout.panelInfo.getSnapshot || !layout.closeRightbar
    || !sessions?.retain || !sessions.refreshProjections || !sessions.list?.subscribe || !sessions.list.getSnapshot
    || !workspaces?.list?.subscribe || !workspaces.list.getSnapshot) return;
  const members = (project: SidebarProject): readonly SessionId[] => {
    const catalog = sessions.list.getSnapshot(), registry = workspaces.list.getSnapshot();
    if (!Array.isArray(catalog.ids) || !catalog.byId || !Array.isArray(registry.items)
      || !Array.isArray(registry.archivedSessionIds)) return [];
    const workspace = registry.items.find(row => row.workspaceId === project.workspaceId);
    if (!project.available || workspace?.path !== project.path) return [];
    const listed = new Set(catalog.ids), archived = new Set(registry.archivedSessionIds);
    return workspace.sessionIds.filter((id: SessionId) => {
      const row = catalog.byId[id];
      return listed.has(id) && !archived.has(id) && row?.cwd === project.path && row.origin !== 'subagent';
    });
  };
  const candidates = (project: SidebarProject) => {
    const catalog = sessions.list.getSnapshot();
    return members(project).filter(id => {
      const projection = catalog.projectionsBySession?.[id];
      return projection?.state !== 'migration-required' && projection?.state !== 'error'
        && projection?.values.workingDirectory === project.path;
    }).sort((a, b) => catalog.byId[b]!.updatedAt - catalog.byId[a]!.updatedAt || a.localeCompare(b));
  };
  const reads = new Map<string, Promise<void>>();
  const currentDirectory = (reference: SidebarReference, project: SidebarProject): Directory => {
    try {
      const workspace = workspaces.list.getSnapshot().items.find(row => row.workspaceId === project.workspaceId);
      const summary = sessions.list.getSnapshot().byId[reference.sessionId];
      const value = reference.binding.session.projections.faceOf('workingDirectory').getSnapshot();
      return {
        workspaceId: workspace && members(project).includes(reference.sessionId) && summary?.cwd === project.path
          ? workspace.workspaceId : '',
        path: workspace?.path ?? '',
        workingDirectory: typeof value === 'string' ? value : undefined,
      };
    } catch { return { workspaceId: '', path: '', workingDirectory: undefined }; }
  };
  return {
    panel: { getSnapshot: () => layout.panelInfo.getSnapshot().activePanelId,
      subscribe: listener => layout.panelInfo.subscribe(listener) },
    candidates,
    subscribeCandidates(listener) {
      const session = sessions.list.subscribe(listener), workspace = workspaces.list.subscribe(listener);
      return () => { session(); workspace(); };
    },
    refreshCandidates(project) {
      const catalog = sessions.list.getSnapshot();
      if (!catalog.projectionsBySession) return;
      for (const id of members(project)) {
        const projection = catalog.projectionsBySession[id];
        if (reads.has(id) || projection?.values.workingDirectory !== undefined
          || projection && projection.state !== 'idle') continue;
        const read = Promise.resolve().then(() => sessions.refreshProjections(id)).catch(() => {});
        reads.set(id, read);
        void read.finally(() => { if (reads.get(id) === read) reads.delete(id); });
      }
    },
    retain: id => sessions.retain(id as SessionId, { source: 'workbaseSidebar' }),
    currentDirectory,
    async directory(reference, project) {
      if (currentDirectory(reference, project).workingDirectory === undefined)
        await sessions.refreshProjections(reference.sessionId);
      return currentDirectory(reference, project);
    },
    watchDirectory(reference, listener) {
      const stops = [
        reference.binding.session.projections.faceOf('workingDirectory').subscribe(listener),
        sessions.list.subscribe(listener), workspaces.list.subscribe(listener),
      ];
      return () => { stops.forEach(stop => stop()); };
    },
    closeRightbar: () => layout.closeRightbar(),
  };
}

/** 一份目录会话引用；已初始化的官方Tab拥有独立保留计数。 */
export class ProjectSidebarView {
  readonly sessionId: string;
  private mounts = 0;
  private holds = 0;
  private retired = false;
  private released = false;
  private stopDirectory: (() => void) | undefined;
  constructor(readonly reference: SidebarReference, readonly project: SidebarProject,
    private readonly onRelease: () => void) {
    this.sessionId = reference.sessionId;
  }
  get retained() { return this.holds > 0; }
  watch(stop: () => void) { this.stopDirectory = stop; }
  readonly mount = () => {
    this.mounts++;
    let mounted = true;
    return () => {
      if (!mounted) return;
      mounted = false; this.mounts--;
      if (this.retired && !this.mounts) this.dispose();
    };
  };
  readonly retainTab = (_tabId: string, signal: AbortSignal): (() => void) => {
    if (signal.aborted || this.released) return () => {};
    this.holds++;
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      signal.removeEventListener('abort', release);
      this.holds--; this.onRelease();
    };
    signal.addEventListener('abort', release, { once: true });
    return release;
  };
  retire() {
    this.retired = true;
    if (!this.mounts) this.dispose();
  }
  dispose() {
    if (this.released) return;
    this.released = true;
    this.stopDirectory?.(); this.stopDirectory = undefined;
    this.reference.release();
  }
}
interface Snapshot {
  project: SidebarProject | null;
  available: boolean;
  pending: boolean;
  error: string;
  views: readonly ProjectSidebarView[];
  candidates: readonly string[];
}
const sameProject = (a: SidebarProject | null, b: SidebarProject | null) => a === b || !!a && !!b
  && a.projectId === b.projectId && a.workspaceId === b.workspaceId && a.path === b.path && a.available === b.available;
const directoryMatches = (directory: Directory, project: SidebarProject) => directory.workspaceId === project.workspaceId
  && directory.path === project.path && directory.workingDirectory === project.path;

/** 项目目标独立于宿主Conversation选择；只复用项目已有会话，不改变Agent目录。 */
export class ProjectSidebarController {
  private snapshot: Snapshot = { project: null, available: false, pending: false, error: '', views: [], candidates: [] };
  private readonly listeners = new Set<() => void>();
  private readonly views = new Set<ProjectSidebarView>();
  private readonly previousSessions = new Map<string, string>();
  private pendingSessionId: string | undefined;
  private current: ProjectSidebarView | undefined;
  private generation = 0;
  private openIntent = false;
  private disposed = false;
  private foreground = false;
  private readonly stopPanel: () => void;
  private readonly stopCandidates: () => void;
  private targetSnapshot: SidebarTarget = { active: false };
  readonly target: SidebarReadable<SidebarTarget> = {
    getSnapshot: () => {
      const active = this.active();
      const sessionId = active && this.validCurrent() ? this.current?.sessionId : undefined;
      if (active !== this.targetSnapshot.active || sessionId !== this.targetSnapshot.sessionId)
        this.targetSnapshot = { active, ...(sessionId ? { sessionId } : {}) };
      return this.targetSnapshot;
    },
    subscribe: listener => this.subscribe(listener),
  };
  readonly commandTarget: SidebarReadable<string | undefined> = {
    getSnapshot: () => this.target.getSnapshot().sessionId,
    subscribe: listener => this.subscribe(listener),
  };
  constructor(private readonly port: ProjectSidebarPort) {
    this.stopPanel = port.panel.subscribe(() => {
      const active = this.active();
      if (this.foreground && !active) {
        port.closeRightbar();
        this.generation++; this.openIntent = false; this.pendingSessionId = undefined;
        if (this.snapshot.pending) this.publish({ pending: false });
      }
      this.foreground = active; this.emit();
    });
    this.stopCandidates = port.subscribeCandidates(() => this.updateCandidates());
  }
  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private active() {
    return !!this.snapshot.project && this.port.panel.getSnapshot() === 'dsh-workbase' && !this.disposed;
  }
  private validCurrent() {
    const view = this.current;
    return !!view && this.port.candidates(view.project).includes(view.sessionId)
      && (!this.port.currentDirectory || directoryMatches(this.port.currentDirectory(view.reference, view.project), view.project));
  }
  private emit() { for (const listener of [...this.listeners]) listener(); }
  private publish(patch: Partial<Snapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...patch, views: [...this.views] };
    this.foreground = this.active();
    this.emit();
  }
  private updateCandidates() {
    if (this.disposed) return;
    const project = this.snapshot.project;
    const candidates = project?.available ? this.port.candidates(project) : [];
    const invalid = this.current && !this.validCurrent()
      || this.pendingSessionId && !candidates.includes(this.pendingSessionId);
    if (invalid) {
      this.generation++; this.openIntent = false; this.pendingSessionId = undefined; this.current = undefined;
      if (this.active()) this.port.closeRightbar();
    }
    if (invalid || candidates.length !== this.snapshot.candidates.length
      || candidates.some((id, index) => id !== this.snapshot.candidates[index]))
      this.publish({ candidates, ...(invalid ? { pending: false, error: '' } : {}) });
    if (invalid) this.prune();
    if (project && this.snapshot.available) this.port.refreshCandidates?.(project);
  }
  private projectKey(project: SidebarProject) {
    return JSON.stringify([project.projectId, project.workspaceId, project.path]);
  }
  private prune() {
    for (const view of this.views) {
      if (view === this.current || view.retained) continue;
      this.views.delete(view);
      // 先撤下目标，随后由已提交Root的卸载清理释放引用。
      this.publish();
      view.retire();
    }
  }
  setAvailable(available: boolean) {
    if (this.disposed || available === this.snapshot.available) return;
    this.generation++;
    this.openIntent = false;
    this.pendingSessionId = undefined;
    this.current = undefined;
    this.publish({ available, pending: false, error: '' });
    this.prune();
    if (!available && this.active()) this.port.closeRightbar();
    this.updateCandidates();
  }
  select(project: SidebarProject | null) {
    if (this.disposed || sameProject(project, this.snapshot.project)) return;
    this.generation++;
    this.openIntent = false;
    this.pendingSessionId = undefined;
    this.current = undefined;
    if (this.active()) this.port.closeRightbar();
    this.publish({ project, pending: false, error: '', candidates: [] });
    this.prune();
    this.updateCandidates();
  }
  /** 只有用户点击入口才连接；准备期间重复点击合并，失败允许再次点击。 */
  open() {
    if (!this.active() || !this.snapshot.available || !this.snapshot.project?.available
      || this.snapshot.pending || this.validCurrent()) return;
    this.updateCandidates();
    const project = this.snapshot.project;
    const previous = this.previousSessions.get(this.projectKey(project));
    const id = previous && this.snapshot.candidates.includes(previous) ? previous : this.snapshot.candidates[0];
    if (!id) return;
    this.generation++; this.current = undefined; this.openIntent = true;
    this.pendingSessionId = id;
    this.prune(); this.prepare(id);
  }
  /** 官方入口挂载后响应首个点击；后续重进详情仍保持收起。 */
  initializeExpansion(sessionId: string, setExpanded: (expanded: boolean) => void) {
    if (!this.snapshot.available || this.commandTarget.getSnapshot() !== sessionId) return false;
    setExpanded(this.openIntent);
    this.openIntent = false;
    return true;
  }
  private prepare(sessionId: string) {
    const project = this.snapshot.project;
    if (!project || !this.snapshot.available || !project.available || this.disposed) return;
    const token = this.generation;
    this.publish({ pending: true, error: '' });
    void this.acquire(project, token, sessionId);
  }
  private async acquire(project: SidebarProject, token: number, id: string) {
    let reference: SidebarReference | undefined;
    const live = () => !this.disposed && token === this.generation;
    try {
      if (!live() || !this.port.candidates(project).includes(id)) return;
      const retained = [...this.views].find(view => view.sessionId === id && sameProject(view.project, project));
      if (retained) {
        const directory = await this.port.directory(retained.reference, project);
        if (!live()) return;
        if (!directoryMatches(directory, project)) throw new Error('右栏会话目录与当前项目不一致，请重新打开项目。');
        this.current = retained;
        this.pendingSessionId = undefined;
        this.previousSessions.set(this.projectKey(project), id);
        this.publish({ pending: false }); return;
      }
      reference = this.port.retain(id);
      await reference.ready;
      if (!live()) return;
      const directory = await this.port.directory(reference, project);
      if (!live()) return;
      if (!directoryMatches(directory, project)) throw new Error('右栏会话目录与当前项目不一致，请重新打开项目。');
      if (!this.port.candidates(project).includes(id)) return;
      const view = new ProjectSidebarView(reference, project, () => this.prune());
      reference = undefined; this.current = view; this.views.add(view);
      this.pendingSessionId = undefined;
      this.previousSessions.set(this.projectKey(project), id);
      if (this.port.watchDirectory) view.watch(this.port.watchDirectory(view.reference, () => {
        if (this.current !== view || this.validCurrent()) return;
        this.current = undefined; this.generation++; this.openIntent = false;
        if (this.active()) this.port.closeRightbar();
        this.publish({ pending: false, candidates: this.port.candidates(project), error: '' });
        this.prune();
      }));
      this.publish({ pending: false });
    } catch (error) {
      if (live()) {
        this.current = undefined;
        this.pendingSessionId = undefined;
        this.publish({ pending: false, error: error instanceof Error ? error.message : '项目右栏加载失败' });
        this.prune();
      }
    } finally { reference?.release(); }
  }
  dispose() {
    if (this.disposed) return;
    if (this.active()) this.port.closeRightbar();
    this.disposed = true; this.generation++; this.current = undefined;
    this.stopPanel();
    this.stopCandidates();
    this.previousSessions.clear();
    for (const view of this.views) view.dispose();
    this.views.clear();
    this.publish({ project: null, pending: false, candidates: [] });
    this.listeners.clear();
  }
}

/**
 * rc.5没有目标注册方法；只合成公开前台读接口，保留宿主原快照与全部写动作。
 * 不读取或写入Controller私有状态，不切换全局Session，不改Agent工作目录。
 */
export function bindSidebarTarget(mounted: SidebarReadable<string | undefined>, target: SidebarReadable<SidebarTarget>) {
  const read = mounted.getSnapshot, subscribe = mounted.subscribe;
  const getSnapshot = () => {
    const project = target.getSnapshot();
    return project.active ? project.sessionId : read.call(mounted);
  };
  const combinedSubscribe = (listener: () => void) => {
    const stopNative = subscribe.call(mounted, listener), stopTarget = target.subscribe(listener);
    return () => { stopNative(); stopTarget(); };
  };
  mounted.getSnapshot = getSnapshot;
  try { mounted.subscribe = combinedSubscribe; }
  catch (error) { mounted.getSnapshot = read; throw error; }
  return () => {
    if (mounted.getSnapshot === getSnapshot) mounted.getSnapshot = read;
    if (mounted.subscribe === combinedSubscribe) mounted.subscribe = subscribe;
  };
}
