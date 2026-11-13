import {
  type State, type HostWorkspace, type HostSession, type Snapshot, type Binding, type Actor,
  type Preferences, stateSchema, todoSchema, emptyMark, userActor, WorkbaseError,
  type LaunchCatalog, type SessionSearch, type SessionSearchStatus, type SessionPreview, type SessionPreviewMessage, type GitBranches, type Todo,
} from '../shared/model.js';
import type { Diagnosis, DiagnosticCandidate, DiagnosticRepairKind, DiagnosticRepairResult, HostDiagnosis } from '../shared/diagnostics.js';
import type { BackupPort } from '../shared/backup.js';
import type { RestorePort } from '../shared/restore.js';
import { todoImageSchema, todoAttachmentSchema, todoAttachments, todoFilterSchema, MAX_TODO_IMAGE_BYTES, MAX_TODO_IMAGES, type Priority, type TodoImage, type TodoAttachment, type TodoFilter } from '../shared/todo.js';

export interface Persistence { get(): State; set(next: State): Promise<void> }
export interface HostPort {
  saveTodoAttachment?(data: Uint8Array, mediaType: string, name: string): Promise<TodoAttachment>;
  readTodoAttachment?(attachment: TodoAttachment, signal: AbortSignal): Promise<Uint8Array>;
  saveTodoImage?(data: Uint8Array, mediaType: TodoImage['mediaType']): Promise<TodoImage>;
  readTodoImage?(image: TodoImage, signal: AbortSignal): Promise<Uint8Array>;
  workspaces(): Promise<HostWorkspace[]>;
  sessions(signal?: AbortSignal): Promise<HostSession[]>;
  rename(workspaceId: string, title: string): Promise<void>;
  remove?(workspaceId: string): Promise<void>;
  register?(path: string, title?: string): Promise<HostWorkspace>;
  createDirectory?(root: string, name: string): Promise<string>;
  search?(query: string, signal: AbortSignal, sessionIds: readonly string[]): Promise<SessionSearch>;
  searchStatus?(): SessionSearchStatus;
  catalog?(): Promise<LaunchCatalog>;
  begin?(workspaceId: string, preset: string): Promise<{ sessionId: string }>;
  configureModel?(sessionId: string, provider: string, model: string): Promise<void>;
  submit?(input: { sessionId: string; provider: string; model: string; text: string; requestId: string }, signal: AbortSignal): Promise<void>;
  renameSession?(sessionId: string, title: string): Promise<void>;
  deleteSession?(sessionId: string): Promise<void>;
  readSession?(sessionId: string, signal: AbortSignal): Promise<{ hasEarlier: boolean; messages: SessionPreviewMessage[] }>;
  reveal?(path: string): Promise<void>;
  gitBranches?(projectPath: string, signal: AbortSignal): Promise<GitBranches>;
  diagnose?(signal: AbortSignal): Promise<HostDiagnosis>;
  repairDiagnostics?(kind: DiagnosticRepairKind, items: DiagnosticCandidate[]): Promise<DiagnosticRepairResult>;
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
  private deletedTodo: { token: string; todo: Todo; expiresAt: number } | null = null;
  constructor(
    private readonly persistence: Persistence, private readonly host: HostPort,
    private readonly uuid: () => string, private readonly now: () => number = Date.now,
    private readonly backup?: BackupPort,
    private readonly restore?: RestorePort,
  ) {}
  async backupStatus() {
    if (!this.backup) throw new WorkbaseError('unsupported', '当前宿主未启用备份服务');
    return this.backup.status();
  }
  async startBackup(trigger: 'manual' | 'startup') {
    if (!this.backup) throw new WorkbaseError('unsupported', '当前宿主未启用备份服务');
    return this.backup.start(trigger);
  }
  exportBackupState() {
    return this.serial(async () => structuredClone(this.persistence.get()));
  }
  restoreStatus() {
    if (!this.restore) throw new WorkbaseError('unsupported', '当前宿主未启用恢复服务');
    return this.restore.status();
  }
  restoreCatalog() {
    if (!this.restore) throw new WorkbaseError('unsupported', '当前宿主未启用恢复服务');
    return this.restore.catalog();
  }
  previewRestore(input: { archive: string; keyPath: string }) {
    if (!this.restore) throw new WorkbaseError('unsupported', '当前宿主未启用恢复服务');
    return this.restore.preview(input);
  }
  confirmRestore(input: { token: string; mode: 'workbase' | 'directory'; directory?: string }) {
    if (!this.restore) throw new WorkbaseError('unsupported', '当前宿主未启用恢复服务');
    return this.restore.confirm(input);
  }
  discardRestore(token: string) {
    if (!this.restore) throw new WorkbaseError('unsupported', '当前宿主未启用恢复服务');
    return this.restore.discard(token);
  }
  private restoredState(input: unknown, workspaces: HostWorkspace[]) {
    const value = stateSchema.parse(input), blockers: string[] = [];
    const projects = new Set<string>(), todos = new Set<string>(), paths = new Set<string>();
    for (const binding of value.bindings) {
      if (projects.has(binding.projectId)) blockers.push('备份项目标识重复');
      projects.add(binding.projectId);
      if (binding.retired || binding.removed) continue;
      if (paths.has(binding.path)) blockers.push('备份存在重复的活跃项目目录');
      paths.add(binding.path);
      const matches = workspaces.filter(w => w.path === binding.path);
      if (matches.length !== 1) blockers.push(`当前宿主没有唯一匹配项目：${binding.path}`);
      else binding.workspaceId = matches[0]!.workspaceId;
    }
    for (const todo of value.todos) {
      if (!projects.has(todo.projectId) || todos.has(todo.id)) blockers.push('待办归属或标识不完整');
      todos.add(todo.id);
    }
    if (value.worktreeSessions.some(s => !projects.has(s.projectId))) blockers.push('工作树会话缺少项目归属');
    const current = this.persistence.get();
    if (value.worktreeSessions.some(s => !current.worktreeSessions.some(c => c.sessionId === s.sessionId
      && current.bindings.find(b => b.projectId === c.projectId)?.path === value.bindings.find(b => b.projectId === s.projectId)?.path)))
      blockers.push('工作树会话无法与当前宿主的项目关联核实');
    return { value, blockers: [...new Set(blockers)] };
  }
  inspectRestore(input: unknown) {
    return this.serial(async () => {
      const restored = this.restoredState(input, await this.host.workspaces());
      return { revision: this.persistence.get().revision, blockers: restored.blockers };
    });
  }
  /** 回滚归档必须在写入之前完成；预览后任何状态写入都使确认失效。 */
  applyRestore(input: unknown, expectedRevision: number, beforeWrite: (before: State) => Promise<void>) {
    return this.serial(async () => {
      const before = structuredClone(this.persistence.get());
      if (before.revision !== expectedRevision) throw new WorkbaseError('conflict', '预览后工作台数据已变化，请重新预览');
      const restored = this.restoredState(input, await this.host.workspaces());
      if (restored.blockers.length) throw new WorkbaseError('binding-conflict', restored.blockers.join('；'));
      const next = restored.value;
      next.revision = before.revision + 1;
      // 备份位置与自动任务属于当前环境，恢复不能重启旧环境的自动安装或备份配置。
      next.preferences.backup = { ...before.preferences.backup };
      next.preferences.pluginAutoUpdate = false;
      await beforeWrite(before);
      try { await this.persistence.set(next); }
      catch (error) {
        if (JSON.stringify(this.persistence.get()) !== JSON.stringify(before)) {
          try { await this.persistence.set({ ...before, revision: before.revision + 2 }); }
          catch { throw new WorkbaseError('rollback-failed', '恢复写入及自动回滚均失败，请使用保留的加密回滚副本'); }
        }
        throw error;
      }
      this.deletedTodo = null;
      return { revision: next.revision };
    });
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(run);
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  async configureSessionModel(input: { projectId: string; sessionId: string; provider: string; model: string }, signal: AbortSignal) {
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, input.projectId);
      assertWritable(binding);
      const workspace = workspaces.find(w => w.workspaceId === binding.workspaceId);
      if (!workspace?.available) throw new WorkbaseError('directory-unavailable', '项目目录不可用');
      if (!workspace?.sessionIds.includes(input.sessionId)) throw new WorkbaseError('forbidden', '会话不属于当前项目');
      if (!this.host.configureModel) throw new WorkbaseError('unsupported', '宿主不支持选择模型');
      signal.throwIfAborted();
      await this.host.configureModel(input.sessionId, input.provider, input.model);
      return { configured: true };
    }, signal);
  }
  private async change<T>(run: (state: State, workspaces: HostWorkspace[]) => T | Promise<T>, signal?: AbortSignal, onCommit?: (result: T) => void): Promise<T> {
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
      onCommit?.(result);
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
      const diagnostics = await this.collectDiagnostics(workspaces, state, signal ?? new AbortController().signal, sessions);
      return structuredClone({ revision: state.revision, projects, conflicts, diagnostics,
        sessionSearch: this.host.searchStatus?.() ?? { enabled: false, showDependency: false },
        preferences: state.preferences, sessionMarks: state.sessionMarks, syncedAt: this.now() });
    });
  }
  private async collectDiagnostics(workspaces: HostWorkspace[], state: State, signal: AbortSignal, sessions: HostSession[] = []): Promise<Diagnosis> {
    signal.throwIfAborted();
    let host: HostDiagnosis = { checks: [
      { kind: 'cache', status: 'unsupported', message: '宿主未提供会话缓存检测能力' },
      { kind: 'orphan', status: 'unsupported', message: '宿主未提供孤儿子代理检测能力' },
      { kind: 'empty', status: 'unsupported', message: '宿主未提供空会话检测能力' },
    ], issues: [], repair: { cache: false, orphan: false, empty: false } };
    if (this.host.diagnose) {
      try { host = await this.host.diagnose(signal); }
      catch (error) {
        signal.throwIfAborted();
        const message = error instanceof Error ? error.message : '会话诊断失败';
        host.checks = (['cache', 'orphan', 'empty'] as const).map(kind => ({ kind, status: 'error', message }));
      }
    }
    signal.throwIfAborted();
    const bound = workspaces.flatMap(w => {
      const binding = state.bindings.find(b => b.workspaceId === w.workspaceId && !b.retired && !b.removed && b.path === w.path);
      return binding ? [{ ...w, projectId: binding.projectId, archived: binding.archived }] : [];
    });
    const issues: Diagnosis['issues'] = bound.filter(w => !w.available).map(w => ({
      id: `directory:${w.projectId}`, kind: 'directory', title: '目录不可用', detail: w.path,
      projectId: w.projectId, projectTitle: w.title, path: w.path,
    }));
    for (const issue of host.issues) {
      const worktree = state.worktreeSessions.find(w => w.sessionId === issue.sessionId);
      const w = bound.find(w => w.sessionIds.includes(issue.sessionId)) ??
        bound.find(w => w.projectId === worktree?.projectId) ?? bound.find(w => w.path === issue.path);
      const session = sessions.find(s => s.sessionId === issue.sessionId);
      issues.push({
        ...issue, id: `${issue.kind}:${issue.sessionId}`, projectId: w?.projectId ?? null,
        projectTitle: w?.title ?? '未分组会话', path: w?.path ?? issue.path,
        readOnly: w?.archived ?? false,
        title: issue.kind === 'cache' ? `${session?.title ?? issue.sessionId} · 列表缓存异常`
          : issue.kind === 'empty' ? '空会话' : '孤儿子代理残留',
        ...(issue.kind === 'cache' ? { sessionTitle: session?.title ?? issue.sessionId } : {}),
        detail: issue.kind === 'cache' ? `会话 ${issue.sessionId} 缺少可用的官方列表缓存`
          : issue.kind === 'empty' ? '未开始对话且没有用户消息的普通冷会话'
          : `子代理 ${issue.sessionId} · 母会话 ${issue.parentSessionId ?? '未知'} 已不存在${issue.sizeBytes === undefined ? ' · 日志大小未知' : ` · 日志约 ${(issue.sizeBytes / 1024).toFixed(1)} KB`}`,
      });
    }
    return { checkedAt: this.now(), checks: [{ kind: 'directory', status: 'ok' }, ...host.checks], issues, repair: host.repair };
  }
  /** 显式重新检测不折叠标题，不为检查而读取会话正文。 */
  async diagnose(signal: AbortSignal = new AbortController().signal): Promise<Diagnosis> {
    await this.change(() => undefined, signal);
    return this.serial(async () => this.collectDiagnostics(await this.host.workspaces(), this.persistence.get(), signal));
  }
  async repairDiagnostics(input: { kind: DiagnosticRepairKind; items: DiagnosticCandidate[] }, signal: AbortSignal): Promise<DiagnosticRepairResult> {
    return this.serial(async () => {
      signal.throwIfAborted();
      if (!this.host.repairDiagnostics) throw new WorkbaseError('unsupported', '宿主未提供诊断修复能力');
      const report = await this.collectDiagnostics(await this.host.workspaces(), this.persistence.get(), signal);
      const items = [...new Map(input.items.map(i => [i.sessionId, i])).values()];
      const eligible: DiagnosticCandidate[] = [], skipped: string[] = [];
      for (const item of items) {
        const issue = report.issues.find(i => i.kind === input.kind && i.sessionId === item.sessionId && i.identity === item.identity);
        if (!issue) {
          if (input.kind === 'empty') { skipped.push(item.sessionId); continue; }
          throw new WorkbaseError('stale-diagnostic', '诊断结果已变化，请重新检测后操作');
        }
        const binding = this.persistence.get().bindings.find(b => b.projectId === issue.projectId);
        if (binding) assertWritable(binding);
        eligible.push(item);
      }
      if (!eligible.length) return { succeeded: [], skipped, failures: [] };
      if (!report.repair[input.kind]) throw new WorkbaseError('unsupported', '宿主缺少诊断修复所需的底层能力，请更新宿主');
      signal.throwIfAborted();
      // 下游共享工作区队列会再次核验活动状态、父子关系；缓存重建还校验生命周期见证。
      // 请求发出后即使前端取消也保留实际结果，避免将已完成的物理清理报告为取消。
      const result = await this.host.repairDiagnostics(input.kind, eligible);
      result.skipped.push(...skipped);
      if (input.kind !== 'cache' && result.succeeded.length) {
        const next = structuredClone(this.persistence.get());
        for (const id of result.succeeded) delete next.sessionMarks[id];
        next.worktreeSessions = next.worktreeSessions.filter(w => !result.succeeded.includes(w.sessionId));
        next.revision++;
        await this.persistence.set(stateSchema.parse(next));
      }
      return result;
    });
  }
  async createTodo(input: { projectId: string; title: string; note?: string; priority?: Priority }, actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      assertWritable(this.writable(state, workspaces, input.projectId, actor));
      this.assertAgentManagement(state, actor);
      const time = this.now();
      const todo = todoSchema.parse({
        id: this.uuid(), projectId: input.projectId, title: input.title, note: input.note ?? '',
        priority: input.priority ?? null,
        done: false, creator: actor.kind, createdAt: time, updatedAt: time, completedAt: null, version: 1,
      });
      state.todos.push(todo);
      return todo;
    }, signal);
  }
  async updateTodo(input: { projectId: string; id: string; expectedVersion: number; title?: string; note?: string; done?: boolean; priority?: Priority }, actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      const binding = this.writable(state, workspaces, input.projectId, actor);
      assertWritable(binding);
      this.assertAgentManagement(state, actor);
      const index = state.todos.findIndex(t => t.id === input.id && t.projectId === input.projectId);
      const old = state.todos[index];
      if (!old) throw new WorkbaseError('not-found', '待办不存在');
      if (old.version !== input.expectedVersion) throw new WorkbaseError('conflict', '待办已经变化，请刷新后重试');
      if (actor.kind === 'agent' && input.done !== undefined && input.done !== old.done && !binding.agentCanChangeStatus)
        throw new WorkbaseError('forbidden', '当前项目未允许 Agent 修改状态');
      const done = input.done ?? old.done;
      const next = todoSchema.parse({ ...old, title: input.title ?? old.title, note: input.note ?? old.note,
        priority: input.priority === undefined ? old.priority : input.priority,
        done, completedAt: done ? (old.completedAt ?? this.now()) : null, updatedAt: this.now(), version: old.version + 1 });
      state.todos[index] = next;
      return next;
    }, signal);
  }
  async deleteTodo(input: { projectId: string; id: string; expectedVersion: number }, actor = userActor, signal?: AbortSignal) {
    let undo: typeof this.deletedTodo = null;
    return this.change((state, workspaces) => {
      assertWritable(this.writable(state, workspaces, input.projectId, actor));
      this.assertAgentManagement(state, actor);
      const old = state.todos.find(t => t.id === input.id && t.projectId === input.projectId);
      if (!old) throw new WorkbaseError('not-found', '待办不存在');
      if (old.version !== input.expectedVersion) throw new WorkbaseError('conflict', '待办已经变化，请刷新后重试');
      state.todos = state.todos.filter(t => t.id !== old.id);
      undo = { token: this.uuid(), todo: structuredClone(old), expiresAt: this.now() + 5000 };
      return { deleted: true, undoToken: undo.token, undoExpiresAt: undo.expiresAt };
    }, signal, result => {
      if (undo) {
        undo.expiresAt = this.now() + 5000; result.undoExpiresAt = undo.expiresAt;
        if (actor.kind === 'user') this.deletedTodo = undo;
      }
    });
  }
  private assertAgentManagement(state: State, actor: Actor) {
    if (actor.kind === 'agent' && !state.preferences.agentManageTodos)
      throw new WorkbaseError('forbidden', '已关闭 Agent 管理待办，仅允许查询');
  }
  async restoreDeletedTodo(input: { projectId: string; token: string }, actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      if (actor.kind === 'agent') throw new WorkbaseError('forbidden', 'Agent 不允许撤销删除');
      const undo = this.deletedTodo;
      if (!undo || undo.token !== input.token || undo.todo.projectId !== input.projectId || this.now() >= undo.expiresAt)
        throw new WorkbaseError('not-found', '撤销已失效，请重新记录待办');
      assertWritable(this.writable(state, workspaces, input.projectId, actor));
      if (state.todos.some(t => t.id === undo.todo.id)) throw new WorkbaseError('conflict', '待办已恢复，请刷新');
      const restored = todoSchema.parse({ ...undo.todo, version: undo.todo.version + 1 });
      state.todos.push(restored);
      return restored;
    }, signal, () => { this.deletedTodo = null; });
  }
  async listForAgent(workspaceId: string, signal?: AbortSignal, filter: TodoFilter = {}) {
    const options = todoFilterSchema.parse(filter);
    return this.change((state, workspaces) => {
      const binding = state.bindings.find(b => b.workspaceId === workspaceId && !b.retired);
      if (!binding) throw new WorkbaseError('binding-unavailable', '当前项目绑定不可用');
      this.writable(state, workspaces, binding.projectId, { kind: 'agent', workspaceId });
      const query = options.query?.toLocaleLowerCase() ?? '';
      const todos = state.todos.filter(t => t.projectId === binding.projectId
        && (options.status === undefined || options.status === 'all' || t.done === (options.status === 'done'))
        && (options.priority === undefined || t.priority === options.priority)
        && (!query || `${t.title}\n${t.note}`.toLocaleLowerCase().includes(query)));
      return { projectId: binding.projectId, todos: options.summary ? todos.map(({ note, images, attachments, ...todo }) =>
        ({ ...todo, imageCount: images.length, attachmentCount: images.length + attachments.length })) : todos };
    }, signal);
  }
  async getForAgent(workspaceId: string, id: string, signal?: AbortSignal): Promise<Todo> {
    const result = await this.listForAgent(workspaceId, signal);
    const todo = result.todos.find(t => t.id === id);
    if (!todo || !('note' in todo)) throw new WorkbaseError('not-found', '待办不存在');
    return todo;
  }
  private imageTodo(state: State, workspaces: HostWorkspace[],
    input: { projectId: string; id: string; expectedVersion?: number }, actor: Actor, write: boolean) {
    const binding = this.writable(state, workspaces, input.projectId, actor);
    if (write) { assertWritable(binding); this.assertAgentManagement(state, actor); }
    const todo = state.todos.find(t => t.id === input.id && t.projectId === input.projectId);
    if (!todo) throw new WorkbaseError('not-found', '待办不存在');
    if (input.expectedVersion !== undefined && todo.version !== input.expectedVersion)
      throw new WorkbaseError('conflict', '待办已经变化，请刷新后重试');
    return todo;
  }
  async uploadTodoImage(input: { projectId: string; id: string; expectedVersion: number },
    data: Uint8Array, mediaType: string, actor = userActor, signal?: AbortSignal) {
    if (!this.host.saveTodoImage) throw new WorkbaseError('unsupported', '宿主未提供图片附件服务');
    if (!data.length || data.length > MAX_TODO_IMAGE_BYTES) throw new WorkbaseError('invalid', '图片应小于等于10MiB');
    const type = todoImageSchema.shape.mediaType.parse(mediaType);
    return this.change(async (state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, true);
      if (todoAttachments(todo).length >= MAX_TODO_IMAGES) throw new WorkbaseError('invalid', '每个待办最多10个附件');
      const image = todoImageSchema.parse(await this.host.saveTodoImage!(data, type));
      if (!todo.images.some(i => i.attachmentId === image.attachmentId)) todo.images.push(image);
      todo.version++; todo.updatedAt = this.now();
      return todo;
    }, signal);
  }
  async attachTodoImage(input: { projectId: string; id: string; expectedVersion: number },
    read: () => Promise<TodoImage>, actor: Actor, signal: AbortSignal) {
    return this.change(async (state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, true);
      if (todoAttachments(todo).length >= MAX_TODO_IMAGES) throw new WorkbaseError('invalid', '每个待办最多10个附件');
      const image = todoImageSchema.parse(await read());
      if (!todo.images.some(i => i.attachmentId === image.attachmentId)) todo.images.push(image);
      todo.version++; todo.updatedAt = this.now();
      return todo;
    }, signal);
  }
  async removeTodoImage(input: { projectId: string; id: string; expectedVersion: number; attachmentId: string },
    actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, true);
      if (!todo.images.some(i => i.attachmentId === input.attachmentId)) throw new WorkbaseError('not-found', '图片不存在');
      todo.images = todo.images.filter(i => i.attachmentId !== input.attachmentId);
      todo.version++; todo.updatedAt = this.now();
      return todo;
    }, signal);
  }
  async readImage(input: { projectId: string; id: string; attachmentId: string }, actor = userActor,
    signal = new AbortController().signal) {
    return this.change(async (state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, false);
      const image = todo.images.find(i => i.attachmentId === input.attachmentId);
      if (!image) throw new WorkbaseError('not-found', '图片不存在');
      if (!this.host.readTodoImage) throw new WorkbaseError('unsupported', '宿主未提供图片附件服务');
      return { image, data: await this.host.readTodoImage(image, signal) };
    }, signal);
  }
  async uploadTodoAttachment(input: { projectId: string; id: string; expectedVersion: number },
    data: Uint8Array, mediaType: string, name: string, actor = userActor, signal?: AbortSignal) {
    if (!this.host.saveTodoAttachment) throw new WorkbaseError('unsupported', '宿主未提供文件附件服务');
    const metadata = todoAttachmentSchema.omit({ attachmentId: true }).parse({
      name, mediaType: mediaType || 'application/octet-stream', bytes: data.length,
    });
    return this.attachTodoAttachment(input, async () =>
      this.host.saveTodoAttachment!(data, metadata.mediaType, metadata.name), actor, signal);
  }
  async attachTodoAttachment(input: { projectId: string; id: string; expectedVersion: number },
    read: () => Promise<TodoAttachment>, actor = userActor, signal?: AbortSignal) {
    return this.change(async (state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, true);
      if (todoAttachments(todo).length >= MAX_TODO_IMAGES) throw new WorkbaseError('invalid', '每个待办最多10个附件');
      const attachment = todoAttachmentSchema.parse(await read());
      if (!todoAttachments(todo).some(a => a.attachmentId === attachment.attachmentId))
        todo.attachments.push(attachment);
      todo.version++; todo.updatedAt = this.now();
      return todo;
    }, signal);
  }
  async removeTodoAttachment(input: { projectId: string; id: string; expectedVersion: number; attachmentId: string },
    actor = userActor, signal?: AbortSignal) {
    return this.change((state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, true);
      if (!todoAttachments(todo).some(a => a.attachmentId === input.attachmentId))
        throw new WorkbaseError('not-found', '附件不存在');
      todo.images = todo.images.filter(a => a.attachmentId !== input.attachmentId);
      todo.attachments = todo.attachments.filter(a => a.attachmentId !== input.attachmentId);
      todo.version++; todo.updatedAt = this.now();
      return todo;
    }, signal);
  }
  async readAttachment(input: { projectId: string; id: string; attachmentId: string }, actor = userActor,
    signal = new AbortController().signal) {
    return this.change(async (state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, false);
      const attachment = todoAttachments(todo).find(a => a.attachmentId === input.attachmentId);
      if (!attachment) throw new WorkbaseError('not-found', '附件不存在');
      let data: Uint8Array;
      if ('width' in attachment) {
        if (!this.host.readTodoImage) throw new WorkbaseError('unsupported', '宿主未提供图片附件服务');
        data = await this.host.readTodoImage(attachment, signal);
      } else {
        if (!this.host.readTodoAttachment) throw new WorkbaseError('unsupported', '宿主未提供文件附件服务');
        data = await this.host.readTodoAttachment(attachment, signal);
      }
      return { attachment, data };
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
  async setPreferences(patch: Partial<Omit<Preferences, 'detail' | 'backup'>> & { detail?: Record<string, Preferences['detail'][string]>; backup?: Partial<Preferences['backup']> }) {
    return this.change((state) => {
      state.preferences = { ...state.preferences, ...patch, backup: { ...state.preferences.backup, ...patch.backup }, detail: { ...state.preferences.detail, ...patch.detail } };
      return { saved: true };
    });
  }
  async saveSettings(theme: Preferences['theme'], permissions: Record<string, boolean>, options?: Pick<Preferences, 'home' | 'root'> & Partial<Pick<Preferences, 'language' | 'navigation' | 'openOnStartup' | 'agentManageTodos' | 'pluginUpdateVisible' | 'pluginAutoUpdate'>> & { backup?: Partial<Preferences['backup']> }) {
    return this.change((state, workspaces) => {
      for (const [projectId, allowed] of Object.entries(permissions))
        this.writable(state, workspaces, projectId).agentCanChangeStatus = allowed;
      state.preferences.theme = theme;
      if (options) {
        if (options.language !== undefined) state.preferences.language = options.language;
        state.preferences.home = { ...options.home };
        state.preferences.root = options.root;
        if (options.openOnStartup !== undefined) state.preferences.openOnStartup = options.openOnStartup;
        if (options.pluginUpdateVisible !== undefined) state.preferences.pluginUpdateVisible = options.pluginUpdateVisible;
        if (options.pluginAutoUpdate !== undefined) state.preferences.pluginAutoUpdate = options.pluginAutoUpdate;
        if (options.backup !== undefined) state.preferences.backup = { ...state.preferences.backup, ...options.backup };
        if (options.agentManageTodos !== undefined) {
          state.preferences.agentManageTodos = options.agentManageTodos;
          // 全局设置替代旧逐项目状态权限，包含当前不可见及后续恢复的绑定。
          for (const binding of state.bindings) binding.agentCanChangeStatus = options.agentManageTodos;
        }
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
        if (name !== undefined) throw new WorkbaseError('register-failed', `目录已创建：${directory}。注册失败：${error instanceof Error ? error.message : '宿主不可用'}。请切换「打开已有项目」重试此路径，不必再次创建文件夹。`);
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
    const snapshot = await this.snapshot(signal);
    const visible = new Set(snapshot.projects.flatMap(p => p.sessions.map(s => s.sessionId)));
    const results = await this.host.search(query, signal, [...visible]);
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
  async deleteSession(projectId: string, sessionId: string) {
    if (!this.host.deleteSession) throw new WorkbaseError('unsupported', '当前宿主未启用会话删除能力');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      assertWritable(binding);
      if (!workspaces.find(w => w.workspaceId === binding.workspaceId)!.sessionIds.includes(sessionId)
        && !state.worktreeSessions.some(w => w.sessionId === sessionId && w.projectId === projectId))
        throw new WorkbaseError('forbidden', '会话不属于当前项目');
      const session = (await this.host.sessions()).find(s => s.sessionId === sessionId);
      if (!session) throw new WorkbaseError('not-found', '会话已不存在，请刷新');
      if (session.running) throw new WorkbaseError('running', '请先停止运行中的会话，再永久删除');
      await this.host.deleteSession!(sessionId);
      delete state.sessionMarks[sessionId];
      state.worktreeSessions = state.worktreeSessions.filter(w => w.sessionId !== sessionId);
      return { deleted: true };
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
