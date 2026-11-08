import {
  type State, type HostWorkspace, type HostSession, type Snapshot, type Binding, type Actor,
  type Preferences, stateSchema, todoSchema, emptyMark, userActor, WorkbaseError,
  type LaunchCatalog, type SessionSearch, type SessionPreview, type SessionPreviewMessage, type GitBranches,
} from '../shared/model.js';

export interface Persistence { get(): State; set(next: State): Promise<void> }
export interface HostPort {
  workspaces(): Promise<HostWorkspace[]>;
  sessions(signal?: AbortSignal): Promise<HostSession[]>;
  rename(workspaceId: string, title: string): Promise<void>;
  remove?(workspaceId: string): Promise<void>;
  register?(path: string, title?: string): Promise<HostWorkspace>;
  createDirectory?(root: string, name: string): Promise<string>;
  search?(query: string, signal: AbortSignal): Promise<SessionSearch>;
  catalog?(): Promise<LaunchCatalog>;
  begin?(workspaceId: string, preset: string): Promise<{ sessionId: string }>;
  submit?(input: { sessionId: string; provider: string; model: string; text: string; requestId: string }, signal: AbortSignal): Promise<void>;
  renameSession?(sessionId: string, title: string): Promise<void>;
  readSession?(sessionId: string, signal: AbortSignal): Promise<{ hasEarlier: boolean; messages: SessionPreviewMessage[] }>;
  reveal?(path: string): Promise<void>;
  gitBranches?(projectPath: string, signal: AbortSignal): Promise<GitBranches>;
}
const identity = (projectId: string) => {
  if (!projectId) throw new WorkbaseError('invalid', '缺少项目标识');
};
// 归档项目业务只读：待办、重命名、会话创建与消息等写入全部拒绝；个人标记（置顶／收藏）仍可改。
const assertWritable = (binding: Binding) => {
  if (binding.archived) throw new WorkbaseError('archived', '项目已归档，业务只读；恢复后可继续编辑');
};
export class WorkbaseService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly persistence: Persistence, private readonly host: HostPort,
    private readonly uuid: () => string, private readonly now: () => number = Date.now,
  ) {}
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(run);
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  private async change<T>(run: (state: State, workspaces: HostWorkspace[]) => T | Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.serial(async () => {
      signal?.throwIfAborted();
      const current = this.persistence.get();
      const next = structuredClone(current);
      const workspaces = await this.host.workspaces();
      this.reconcile(next, workspaces);
      const result = await run(next, workspaces);
      signal?.throwIfAborted();
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        next.revision = current.revision + 1;
        await this.persistence.set(stateSchema.parse(next));
      }
      return result;
    });
  }
  private reconcile(state: State, workspaces: HostWorkspace[]) {
    for (const workspace of workspaces) {
      const existing = state.bindings.find(b => b.workspaceId === workspace.workspaceId);
      if (existing) {
        if (existing.path !== workspace.path) throw new WorkbaseError('binding-conflict', '项目目录已改变，请先处理绑定');
        continue;
      }
      if (state.bindings.some(b => !b.retired && b.path === workspace.path)) continue;
      state.bindings.push({
        projectId: this.uuid(), workspaceId: workspace.workspaceId, path: workspace.path,
        retired: false, removed: false, agentCanChangeStatus: true, archived: false,
      });
    }
  }
  private writable(state: State, workspaces: HostWorkspace[], projectId: string, actor = userActor): Binding {
    identity(projectId);
    const b = state.bindings.find(b => b.projectId === projectId && !b.retired && !b.removed);
    if (!b || !workspaces.some(w => w.workspaceId === b.workspaceId && w.path === b.path))
      throw new WorkbaseError('binding-unavailable', '项目绑定不可用，请刷新或处理绑定冲突');
    if (actor.kind === 'agent' && actor.workspaceId !== b.workspaceId)
      throw new WorkbaseError('forbidden', 'Agent 只能操作当前项目');
    return b;
  }
  async snapshot(signal?: AbortSignal): Promise<Snapshot> {
    // 会话读取失败时不提交半份同步，也不把前端已有结果替换为空列表。
    const sessions = await this.host.sessions(signal);
    await this.change(() => undefined, signal);
    return this.serial(async () => {
      signal?.throwIfAborted();
      const state = this.persistence.get();
      const workspaces = await this.host.workspaces();
      const projects = workspaces.flatMap(w => {
        const binding = state.bindings.find(b => b.workspaceId === w.workspaceId && !b.retired && !b.removed && b.path === w.path);
        if (!binding) return [];
        const owned = sessions.filter(s => w.sessionIds.includes(s.sessionId));
        const todos = state.todos.filter(t => t.projectId === binding.projectId);
      return [{
        ...w, projectId: binding.projectId, sessions: owned, todos,
        mark: state.projectMarks[binding.projectId] ?? emptyMark(),
        agentCanChangeStatus: binding.agentCanChangeStatus,
        archived: binding.archived,
        updatedAt: Math.max(0, ...owned.map(s => s.updatedAt), ...todos.map(t => t.updatedAt)),
      }];
      });
      const conflicts = workspaces.flatMap(w => {
        if (state.bindings.some(b => b.workspaceId === w.workspaceId && !b.retired)) return [];
        const old = state.bindings.find(b => !b.retired && b.path === w.path);
        return old ? [{ projectId: old.projectId, workspaceId: w.workspaceId, path: w.path, title: w.title }] : [];
      });
      return structuredClone({ revision: state.revision, projects, conflicts,
        preferences: state.preferences, sessionMarks: state.sessionMarks, syncedAt: this.now() });
    });
  }
  async createTodo(input: { projectId: string; title: string; note?: string }, actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      assertWritable(this.writable(state, workspaces, input.projectId, actor));
      const time = this.now();
      const todo = todoSchema.parse({
        id: this.uuid(), projectId: input.projectId, title: input.title, note: input.note ?? '',
        done: false, creator: actor.kind, createdAt: time, updatedAt: time, completedAt: null, version: 1,
      });
      state.todos.push(todo);
      return todo;
    }, signal);
  }
  async updateTodo(input: { projectId: string; id: string; expectedVersion: number; title?: string; note?: string; done?: boolean }, actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      const binding = this.writable(state, workspaces, input.projectId, actor);
      assertWritable(binding);
      const index = state.todos.findIndex(t => t.id === input.id && t.projectId === input.projectId);
      const old = state.todos[index];
      if (!old) throw new WorkbaseError('not-found', '待办不存在');
      if (old.version !== input.expectedVersion) throw new WorkbaseError('conflict', '待办已经变化，请刷新后重试');
      if (actor.kind === 'agent' && input.done !== undefined && input.done !== old.done && !binding.agentCanChangeStatus)
        throw new WorkbaseError('forbidden', '当前项目未允许 Agent 修改状态');
      const done = input.done ?? old.done;
      const next = todoSchema.parse({ ...old, title: input.title ?? old.title, note: input.note ?? old.note,
        done, completedAt: done ? (old.completedAt ?? this.now()) : null, updatedAt: this.now(), version: old.version + 1 });
      state.todos[index] = next;
      return next;
    }, signal);
  }
  async deleteTodo(input: { projectId: string; id: string; expectedVersion: number }, actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      assertWritable(this.writable(state, workspaces, input.projectId, actor));
      if (actor.kind === 'agent') throw new WorkbaseError('forbidden', 'Agent 不允许删除待办');
      const old = state.todos.find(t => t.id === input.id && t.projectId === input.projectId);
      if (!old) throw new WorkbaseError('not-found', '待办不存在');
      if (old.version !== input.expectedVersion) throw new WorkbaseError('conflict', '待办已经变化，请刷新后重试');
      state.todos = state.todos.filter(t => t.id !== old.id);
      return { deleted: true };
    }, signal);
  }
  async listForAgent(workspaceId: string, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      const binding = state.bindings.find(b => b.workspaceId === workspaceId && !b.retired);
      if (!binding) throw new WorkbaseError('binding-unavailable', '当前项目绑定不可用');
      this.writable(state, workspaces, binding.projectId, { kind: 'agent', workspaceId });
      return { projectId: binding.projectId, todos: state.todos.filter(t => t.projectId === binding.projectId) };
    }, signal);
  }
  async setAgentStatus(projectId: string, allowed: boolean) {
    return this.change((state, workspaces) => {
      this.writable(state, workspaces, projectId).agentCanChangeStatus = allowed;
      return { saved: true };
    });
  }
  async renameProject(projectId: string, title: string) {
    const normalized = title.trim();
    if (!normalized || normalized.length > 200) throw new WorkbaseError('invalid', '项目名称应为1至200个字符');
    return this.change(async (state, workspaces) => {
      const b = this.writable(state, workspaces, projectId);
      assertWritable(b);
      await this.host.rename(b.workspaceId, normalized);
      return { saved: true };
    });
  }
  async resolveBinding(input: { projectId: string; workspaceId: string; choice: 'restore' | 'new' }) {
    return this.change((state, workspaces) => {
      const b = state.bindings.find(b => b.projectId === input.projectId && !b.retired);
      const w = workspaces.find(w => w.workspaceId === input.workspaceId);
      if (!b || !w || b.path !== w.path || state.bindings.some(b => b.workspaceId === w.workspaceId))
        throw new WorkbaseError('conflict', '绑定关系已经变化，请刷新');
      if (workspaces.some(w => w.workspaceId === b.workspaceId))
        throw new WorkbaseError('conflict', '原项目仍注册在宿主中，不能覆盖绑定');
      if (input.choice === 'restore') b.workspaceId = w.workspaceId;
      else {
        b.retired = true;
        state.bindings.push({ ...b, retired: false, removed: false, projectId: this.uuid(), workspaceId: w.workspaceId, agentCanChangeStatus: true });
      }
      return { saved: true };
    });
  }
  async setMark(input: { projectId: string; sessionId?: string; field: 'pinned' | 'favorite'; value: boolean }) {
    return this.change((state, workspaces) => {
      const b = this.writable(state, workspaces, input.projectId);
      const w = workspaces.find(w => w.workspaceId === b.workspaceId)!;
      if (input.sessionId && !w.sessionIds.includes(input.sessionId)) throw new WorkbaseError('forbidden', '会话不属于当前项目');
      const marks = input.sessionId ? state.sessionMarks : state.projectMarks;
      const key = input.sessionId ?? input.projectId;
      marks[key] = { ...(marks[key] ?? emptyMark()), [input.field]: input.value };
      return { saved: true };
    });
  }
  async setPreferences(patch: Partial<Omit<Preferences, 'detail'>> & { detail?: Record<string, Preferences['detail'][string]> }) {
    return this.change((state) => {
      state.preferences = { ...state.preferences, ...patch, detail: { ...state.preferences.detail, ...patch.detail } };
      if (state.preferences.home.stats) state.preferences.home.recentStyle = 'buttons';
      return { saved: true };
    });
  }
  async saveSettings(theme: Preferences['theme'], permissions: Record<string, boolean>, options?: Pick<Preferences, 'home' | 'root'> & Partial<Pick<Preferences, 'navigation'>>) {
    return this.change((state, workspaces) => {
      for (const [projectId, allowed] of Object.entries(permissions))
        this.writable(state, workspaces, projectId).agentCanChangeStatus = allowed;
      state.preferences.theme = theme;
      if (options) {
        state.preferences.home = { ...options.home, ...(options.home.stats ? { recentStyle: 'buttons' as const } : {}) };
        state.preferences.root = options.root;
        if (options.navigation) state.preferences.navigation = options.navigation;
      }
      return { saved: true };
    });
  }
  async removeProject(projectId: string) {
    if (!this.host.remove) throw new WorkbaseError('unsupported', '当前宿主不支持移除项目');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      const workspace = workspaces.find(w => w.workspaceId === binding.workspaceId)!;
      const sessions = await this.host.sessions();
      if (sessions.some(s => workspace.sessionIds.includes(s.sessionId) && s.running))
        throw new WorkbaseError('running', '项目仍有运行中会话，请先停止运行');
      // 先保存恢复身份；宿主移除失败时撤销此标志。两份数据不宣称跨域原子提交。
      binding.removed = true;
      const prepared = structuredClone(state);
      prepared.revision++;
      await this.persistence.set(stateSchema.parse(prepared));
      try { await this.host.remove!(binding.workspaceId); }
      catch (error) {
        binding.removed = false;
        await this.persistence.set(stateSchema.parse({ ...state, revision: prepared.revision + 1 }));
        throw error;
      }
      return { removed: true };
    });
  }
  async addProject(path: string, name?: string) {
    if (!this.host.register) throw new WorkbaseError('unsupported', '当前宿主不支持添加项目');
    return this.serial(async () => {
      const current = this.persistence.get();
      const next = structuredClone(current);
      const directory = name === undefined ? path : await this.host.createDirectory?.(current.preferences.root, name);
      if (!directory) throw new WorkbaseError('unsupported', '当前宿主不支持创建目录');
      let workspace: HostWorkspace;
      try { workspace = await this.host.register!(directory, name); }
      catch (error) {
        if (name !== undefined) throw new WorkbaseError('register-failed', `目录已创建：${directory}。注册失败：${error instanceof Error ? error.message : '宿主不可用'}。请切换「打开已有目录」重试此路径，不必再次创建文件夹。`);
        throw error;
      }
      const existing = next.bindings.find(b => !b.retired && (b.workspaceId === workspace.workspaceId || b.path === workspace.path));
      if (existing && !existing.removed && existing.workspaceId !== workspace.workspaceId)
        throw new WorkbaseError('binding-conflict', '该目录重新注册，请选择恢复原项目或作为新项目');
      const duplicate = !!existing && !existing.removed;
      let binding = existing;
      if (binding?.removed) { binding.workspaceId = workspace.workspaceId; binding.removed = false; }
      else if (!binding) {
        binding = { projectId: this.uuid(), workspaceId: workspace.workspaceId, path: workspace.path,
          retired: false, removed: false, agentCanChangeStatus: true, archived: false };
        next.bindings.push(binding);
      }
      if (!duplicate) {
        next.revision++;
        await this.persistence.set(stateSchema.parse(next));
      }
      return { projectId: binding.projectId, duplicate };
    });
  }
  async searchSessions(query: string, signal: AbortSignal): Promise<SessionSearch> {
    if (!this.host.search) throw new WorkbaseError('unsupported', '当前宿主不支持会话全文检索');
    const [results, snapshot] = await Promise.all([this.host.search(query, signal), this.snapshot(signal)]);
    const visible = new Set(snapshot.projects.flatMap(p => p.sessions.map(s => s.sessionId)));
    return { items: results.items.filter(item => visible.has(item.sessionId)), hasMore: results.hasMore };
  }
  async launchCatalog() {
    if (!this.host.catalog) throw new WorkbaseError('unsupported', '当前宿主不提供模式和模型目录');
    return this.host.catalog();
  }
  async beginSession(projectId: string, preset: string) {
    if (!this.host.begin) throw new WorkbaseError('unsupported', '当前宿主不支持创建会话');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      assertWritable(binding);
      if (!workspaces.find(w => w.workspaceId === binding.workspaceId)?.available)
        throw new WorkbaseError('directory-unavailable', '项目目录不可用，请先修复目录');
      return this.host.begin!(binding.workspaceId, preset);
    });
  }
  async gitBranches(projectId: string, signal: AbortSignal = new AbortController().signal): Promise<GitBranches> {
    if (!this.host.gitBranches) throw new WorkbaseError('unsupported', '当前宿主不支持读取 Git 分支');
    signal.throwIfAborted();
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      const workspace = workspaces.find(w => w.workspaceId === binding.workspaceId)!;
      return this.host.gitBranches!(workspace.path, signal);
    }, signal);
  }
  async submitMessage(input: { projectId: string; sessionId: string; provider: string; model: string; text: string; requestId: string }, signal: AbortSignal) {
    if (!this.host.submit) throw new WorkbaseError('unsupported', '当前宿主不支持消息提交');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, input.projectId);
      assertWritable(binding);
      const workspace = workspaces.find(w => w.workspaceId === binding.workspaceId)!;
      if (!workspace.available) throw new WorkbaseError('directory-unavailable', '项目目录不可用');
      // 工作树会话不在工作区 sessionIds 里，按 worktreeSessions 登记放行。
      if (!workspace.sessionIds.includes(input.sessionId)
        && !state.worktreeSessions.some(w => w.sessionId === input.sessionId && w.projectId === input.projectId))
        throw new WorkbaseError('forbidden', '会话不属于当前项目');
      await this.host.submit!(input, signal);
      return { accepted: true };
    }, signal);
  }
  async renameSession(projectId: string, sessionId: string, title: string) {
    if (!this.host.renameSession) throw new WorkbaseError('unsupported', '当前宿主不支持会话重命名');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      assertWritable(binding);
      if (!workspaces.find(w => w.workspaceId === binding.workspaceId)!.sessionIds.includes(sessionId)
        && !state.worktreeSessions.some(w => w.sessionId === sessionId && w.projectId === projectId))
        throw new WorkbaseError('forbidden', '会话不属于当前项目');
      await this.host.renameSession!(sessionId, title);
      return { saved: true };
    });
  }
  // 在系统文件管理器中显示项目目录：优先平台 SessionController.openWorkspacePath（与
  // 官方「在文件夹中显示」一致），平台能力缺失时回退为直接调起本机文件管理器。
  async revealDirectory(projectId: string) {
    if (!this.host.reveal) throw new WorkbaseError('unsupported', '当前宿主不支持打开目录');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      const workspace = workspaces.find(w => w.workspaceId === binding.workspaceId)!;
      await this.host.reveal!(workspace.path);
      return { revealed: true };
    });
  }
  async sessionPreview(input: { projectId: string; sessionId: string }, signal: AbortSignal = new AbortController().signal): Promise<SessionPreview> {
    if (!this.host.readSession) throw new WorkbaseError('unsupported', '当前宿主不支持会话预览');
    signal.throwIfAborted();
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, input.projectId);
      const workspace = workspaces.find(w => w.workspaceId === binding.workspaceId)!;
      if (!workspace.sessionIds.includes(input.sessionId)
        && !state.worktreeSessions.some(w => w.sessionId === input.sessionId && w.projectId === input.projectId))
        throw new WorkbaseError('forbidden', '会话不属于当前项目');
      const [content, sessions] = await Promise.all([
        this.host.readSession!(input.sessionId, signal), this.host.sessions(signal),
      ]);
      const session = sessions.find(s => s.sessionId === input.sessionId);
      return {
        title: session?.title ?? '未命名会话', projectName: workspace.title,
        running: session?.running ?? false, archived: session?.archived ?? false,
        updatedAt: session?.updatedAt ?? 0,
        hasEarlier: content.hasEarlier, messages: content.messages,
      };
    }, signal);
  }
  // 插件级项目归档：宿主暂无归档接口，归档为业务只读标志；会话保持归档时的状态，
  // 恢复后继续可写。个人标记（置顶／收藏）不受影响。
  async archiveProject(input: { projectId: string; archived: boolean }) {
    return this.change((state) => {
      const binding = state.bindings.find(b => b.projectId === input.projectId && !b.retired && !b.removed);
      if (!binding) throw new WorkbaseError('not-found', '项目不存在');
      binding.archived = input.archived;
      return { saved: true };
    });
  }
}
