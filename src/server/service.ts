import {
  type State, type HostWorkspace, type HostSession, type Snapshot, type Binding, type Actor,
  type Preferences, stateSchema, todoSchema, emptyMark, userActor, WorkbaseError,
  type LaunchCatalog, type SessionSearch, type SessionSearchStatus, type SessionPreview, type SessionPreviewMessage, type GitBranches, type Todo,
} from '../shared/model.js';
import type { Diagnosis, DiagnosticCandidate, DiagnosticRepairKind, DiagnosticRepairResult, HostDiagnosis } from '../shared/diagnostics.js';
import type { BackupPort } from '../shared/backup.js';
import type { RestorePort } from '../shared/restore.js';
import { resolveTerminalColors, type TerminalPalette } from '../shared/terminal-palette.js';
import { todoImageSchema, todoAttachmentSchema, todoAttachments, todoFilterSchema, todoKey, MAX_TODO_IMAGE_BYTES, MAX_TODO_IMAGES, type Priority, type TodoImage, type TodoAttachment, type TodoFilter } from '../shared/todo.js';
import { projectInitializationSchema, type ProjectInitialization, type ProjectInitializationInput, type ProjectInitializationResult } from '../shared/project-initialization.js';
import { projectRulesSchema, type ProjectRules, type RuleTarget, type RuleReceipt } from '../shared/project-rules.js';
import type { PersonalPort, PersonalFile } from '../shared/personalization.js';
import type { Speech } from './speech.js';
import { migrationPreview } from './migration.js';
import { restoredState } from './restore-state.js';
import { MIGRATION_UNAVAILABLE, MIGRATION_UNDO_MS, type MigrationPreview, type MigrationRecordView, type MigrationRecord } from '../shared/migration.js';
import { projectWorkspaces, migrationTarget } from './migration-ownership.js';
import type { DeleteTarget } from './session-maintenance.js';
import { isDeepStrictEqual } from 'node:util';
import { stat } from 'node:fs/promises';

export interface Persistence { get(): State; set(next: State): Promise<void> }
export interface HostPort {
  saveRules?(previous: ProjectRules, value: ProjectRules, targets: RuleTarget[]): Promise<RuleReceipt>;
  saveTodoAttachment?(data: Uint8Array, mediaType: string, name: string): Promise<TodoAttachment>;
  readTodoAttachment?(attachment: TodoAttachment, signal: AbortSignal): Promise<Uint8Array>;
  saveTodoImage?(data: Uint8Array, mediaType: TodoImage['mediaType']): Promise<TodoImage>;
  readTodoImage?(image: TodoImage, signal: AbortSignal): Promise<Uint8Array>;
  workspaces(): Promise<HostWorkspace[]>;
  sessions(signal?: AbortSignal): Promise<HostSession[]>;
  rename(workspaceId: string, title: string): Promise<void>;
  remove?(workspaceId: string): Promise<void>;
  register?(path: string, title?: string): Promise<HostWorkspace>;
  createDirectory?(root: string, name: string, initialization?: ProjectInitialization): Promise<string>;
  completeInitialization?(directory: string, name: string, initialization: ProjectInitialization): Promise<ProjectInitializationResult>;
  search?(query: string, signal: AbortSignal, sessionIds: readonly string[]): Promise<SessionSearch>;
  searchStatus?(): SessionSearchStatus;
  catalog?(): Promise<LaunchCatalog>;
  begin?(workspaceId: string, preset: string): Promise<{ sessionId: string }>;
  configureModel?(sessionId: string, provider: string, model: string): Promise<void>;
  submit?(input: { sessionId: string; provider: string; model: string; text: string; requestId: string }, signal: AbortSignal): Promise<void>;
  renameSession?(sessionId: string, title: string): Promise<void>;
  deleteSession?(sessionId: string, expectedIdentity?: string): Promise<void>;
  sessionDeletionIdentity?(sessionId: string): Promise<string | undefined>;
  readSession?(sessionId: string, signal: AbortSignal): Promise<{ hasEarlier: boolean; messages: SessionPreviewMessage[] }>;
  reveal?(path: string): Promise<void>;
  gitBranches?(projectPath: string, signal: AbortSignal): Promise<GitBranches>;
  diagnose?(signal: AbortSignal): Promise<HostDiagnosis>;
  repairDiagnostics?(kind: DiagnosticRepairKind, items: DiagnosticCandidate[],
    authorize?: (target: DeleteTarget) => Promise<void>): Promise<DiagnosticRepairResult>;
}
// 项目标识前置校验：只做守卫、不产出值，函数名按「断言」语义取，避免与宿主返回的删除身份 identity 混淆。
const assertProjectId = (projectId: string) => {
  if (!projectId) throw new WorkbaseError('invalid', '缺少项目标识');
};
// 撤销窗口：与迁移撤销同口径的短时窗口，仅供删除待办后的「撤销」使用。
const TODO_UNDO_MS = 5000;
/** 绑定身份三元组：项目、宿主工作区与项目目录同时匹配才算同一关联（迁移身份未解析时为 null）。 */
interface BindingTriple { projectId: string | null; workspaceId: string | null; path: string }
// 关联仍有效：三元组一致且未被移除／停用；allowArchived=false 时归档也算失效（迁移端点核验要求未归档）。
const isLiveBinding = (binding: Binding, triple: BindingTriple, allowArchived = true) =>
  binding.projectId === triple.projectId && binding.workspaceId === triple.workspaceId
  && binding.path === triple.path && !binding.retired && !binding.removed && (allowArchived || !binding.archived);
// 写入后读回核验：持久层读回的状态必须与写入值结构化相等，判定口径与其它读回校验统一。
const assertPersisted = (actual: unknown, expected: unknown, message: string) => {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(message);
};
// 归档项目业务只读：待办、重命名、会话创建与消息等写入全部拒绝；个人标记（置顶／收藏）仍可改。
const assertWritable = (binding: Binding) => {
  if (binding.archived) throw new WorkbaseError('archived', '项目已归档，业务只读；恢复后可继续编辑');
};
export class WorkbaseService {
  private queue: Promise<unknown> = Promise.resolve();
  // 无超时：客户端失联或宿主结果未知时，不能把尚未确认的提交当作结束。
  private readonly nativeSubmissionGuards = new Map<string, { projectId: string; sessionId: string }>();
  private readonly pendingImports = new Map<string, State['pendingImports'][number]>();
  private readonly creationResults = new Map<string, string>();
  private deletedTodo: { token: string; todo: Todo; expiresAt: number } | null = null;
  private readonly migrationPreviews = new Map<string, MigrationPreview>();
  private readonly migrationWitnesses = new Map<string, string>();
  private migrationStorageUnknown = false;
  constructor(
    private readonly persistence: Persistence, private readonly host: HostPort,
    private readonly uuid: () => string, private readonly now: () => number = Date.now,
    private readonly backup?: BackupPort,
    private readonly restore?: RestorePort,
    private readonly personal?: PersonalPort,
    readonly speech?: Speech,
  ) {}
  previewMigration(input: { projectId: string; directory: string }, signal: AbortSignal) {
    return this.serial(() => this.prepareMigration(input, signal));
  }
  previewProjectMigration(input: { projectId: string; targetProjectId: string }, signal: AbortSignal) {
    return this.serial(async () => {
      signal.throwIfAborted();
      assertProjectId(input.projectId); assertProjectId(input.targetProjectId);
      if (input.projectId === input.targetProjectId) throw new WorkbaseError('invalid', '请选择其他项目作为迁移目标');
      const matches = this.persistence.get().bindings.filter(b => b.projectId === input.targetProjectId);
      const target = matches[0];
      if (matches.length !== 1 || !target || target.removed || target.retired)
        throw new WorkbaseError('binding-conflict', '目标项目不存在或关联已失效，请重新选择');
      return this.prepareMigration({ projectId: input.projectId, directory: target.path }, signal, target.projectId);
    });
  }
  private async prepareMigration(input: { projectId: string; directory: string }, signal: AbortSignal, targetProjectId?: string) {
    signal.throwIfAborted();
    const workspaces = await this.workspaces(), sessions = await this.host.sessions(signal);
    const preview = await migrationPreview(this.persistence.get(), workspaces, sessions, input, this.uuid(), this.now(), signal);
    if (preview.executable && (!this.host.remove || !this.host.register)) {
      preview.blockers.push('宿主未提供工作区移除与恢复登记能力');
      preview.executable = false;
    }
    if (targetProjectId && preview.target.projectId !== targetProjectId)
      throw new WorkbaseError('binding-conflict', '目标项目目录关联存在冲突，请重新选择');
    for (const [token, value] of this.migrationPreviews) if (value.expiresAt <= this.now()) this.discardMigration(token);
    if (this.migrationPreviews.size >= 100) this.discardMigration(this.migrationPreviews.keys().next().value!);
    this.migrationPreviews.set(preview.token, structuredClone(preview));
    this.migrationWitnesses.set(preview.token, JSON.stringify([workspaces, sessions]));
    return preview;
  }
  confirmMigration(token: string) {
    return this.serial(async () => {
      this.assertMigrationStorage();
      const completed = this.persistence.get().migrations.find(record => record.id === token);
      if (completed) {
        await this.removeMigratedWorkspace(completed);
        return structuredClone(completed);
      }
      const preview = this.migrationPreviews.get(token);
      if (!preview || preview.expiresAt <= this.now()) throw new WorkbaseError('conflict', '迁移预览已失效，请重新预览');
      if (preview.revision !== this.persistence.get().revision) throw new WorkbaseError('conflict', '预览后工作台数据已变化，请重新预览');
      const workspaces = await this.workspaces(), sessions = await this.host.sessions();
      const before = structuredClone(this.persistence.get());
      if (before.revision !== preview.revision)
        throw new WorkbaseError('conflict', '预览后工作台数据已变化，请重新预览');
      const fresh = await migrationPreview(before, workspaces, sessions,
        { projectId: preview.source.projectId!, directory: preview.target.path }, token, this.now(), new AbortController().signal);
      if (!fresh.executable) throw new WorkbaseError(fresh.kind === 'directory' ? 'unsupported' : 'conflict', fresh.blockers.join('；'));
      if (!this.host.remove || !this.host.register)
        throw new WorkbaseError('unsupported', '宿主未提供工作区移除与恢复登记能力');
      if (JSON.stringify([workspaces, sessions]) !== this.migrationWitnesses.get(token)
        || fresh.target.projectId !== preview.target.projectId || fresh.target.workspaceId !== preview.target.workspaceId)
        throw new WorkbaseError('conflict', '预览后宿主项目或会话已变化，请重新预览');
      const sourceId = fresh.source.projectId!, targetId = fresh.target.projectId!;
      const source = before.bindings.find(b => b.projectId === sourceId)!;
      const target = before.bindings.find(b => b.projectId === targetId)!;
      const sessionIds = [...new Set([
        ...workspaces.find(w => w.workspaceId === source.workspaceId)!.sessionIds,
        ...before.worktreeSessions.filter(s => s.projectId === sourceId).map(s => s.sessionId),
      ])];
      const todos = [...new Map(before.todos.filter(todo => todo.projectId === sourceId).map(todo => [todo.id, todo])).values()];
      const completedAt = this.now();
      // 实体状态取迁移确认时刻的宿主快照；记录是迁移前内容的唯一留存，
      // 撤销截止后目标侧仍可据此核对迁入了什么。
      const entities = [
        ...sessionIds.map(id => {
          const session = sessions.find(s => s.sessionId === id);
          return { kind: 'session' as const, id, sourceProjectId: sourceId, targetProjectId: targetId,
            title: session?.title, archived: session?.archived, running: session?.running };
        }),
        ...todos.map(todo => ({ kind: 'todo' as const, id: todo.id, sourceProjectId: sourceId, targetProjectId: targetId,
          title: todo.title, done: todo.done })),
      ];
      const sourceWorkspace = workspaces.find(w => w.workspaceId === source.workspaceId)!;
      const record: MigrationRecord = {
        id: token, kind: 'merge', source: fresh.source, target: fresh.target,
        status: 'completed', completedAt, undoUntil: completedAt + MIGRATION_UNDO_MS, revertedAt: null,
        entities,
        sourceState: {
          available: sourceWorkspace.available, archived: source.archived,
          agentCanChangeStatus: source.agentCanChangeStatus, counts: fresh.source.counts,
        },
        undo: {
          version: 1,
          sessions: sessionIds.map(sessionId => ({ sessionId,
            previous: before.sessionOwnership.find(owner => owner.sessionId === sessionId) ?? null })),
          todos: todos.map(todo => ({ id: todo.id, shared: before.todos.some(t => t.projectId === targetId && t.id === todo.id) })),
          sourceSettings: { agentCanChangeStatus: source.agentCanChangeStatus,
            detail: before.preferences.detail[sourceId] ?? null, mark: before.projectMarks[sourceId] ?? null },
        },
      };
      const next = structuredClone(before);
      next.sessionOwnership = next.sessionOwnership.filter(owner => !sessionIds.includes(owner.sessionId));
      next.sessionOwnership.push(...sessionIds.map(sessionId => ({
        sessionId, projectId: targetId, workspaceId: target.workspaceId, path: target.path,
      })));
      for (const item of next.worktreeSessions) if (item.projectId === sourceId) item.projectId = targetId;
      const shared = new Set(record.undo!.todos.filter(todo => todo.shared).map(todo => todo.id));
      next.todos = next.todos.filter(todo => todo.projectId !== sourceId || !shared.has(todo.id));
      for (const todo of next.todos) if (todo.projectId === sourceId) {
        todo.projectId = targetId; todo.version++; todo.updatedAt = completedAt;
      }
      next.todos = [...new Map(next.todos.map(todo => [todoKey(todo.projectId, todo.id), todo])).values()];
      if (next.preferences.selectedProject === sourceId) next.preferences.selectedProject = targetId;
      // 身份中的 counts 只用于预览，不写入严格回执模型。
      record.source = { projectId: sourceId, workspaceId: fresh.source.workspaceId, title: fresh.source.title, path: fresh.source.path };
      record.target = { projectId: targetId, workspaceId: target.workspaceId, title: fresh.target.title, path: target.path };
      next.migrations.push(record);
      next.detachedMigrationRules.push(record.id);
      const ruleReceipt = await this.transitionMigrationRules(before, next);
      try { await this.commitMigration(before, next); }
      catch (error) {
        if (!this.migrationStorageUnknown) await ruleReceipt?.rollback();
        throw error;
      }
      this.discardMigration(token);
      await this.removeMigratedWorkspace(record);
      return structuredClone(record);
    });
  }
  /** 跨存储域不能声称原子提交：回执先落盘，失败后仅补齐官方登记移除。 */
  private async removeMigratedWorkspace(record: MigrationRecord, known?: readonly HostWorkspace[]) {
    this.assertMigrationStorage();
    if (record.kind !== 'merge' || record.status !== 'completed') return;
    const listed = known ?? await this.host.workspaces();
    const source = listed.find(w => w.workspaceId === record.source.workspaceId);
    if (!source) return;
    const state = this.persistence.get();
    if (source.path !== record.source.path
      || !state.bindings.some(b => isLiveBinding(b, { projectId: record.source.projectId, workspaceId: source.workspaceId, path: source.path })))
      throw new WorkbaseError('binding-conflict', '迁移已完成，但源工作区关联已变化，无法移除登记');
    if (!this.host.remove) throw new WorkbaseError('unsupported', '迁移已完成，但宿主未提供工作区移除能力');
    const sessions = await this.host.sessions();
    const migratedIds = new Set(record.entities.filter(e => e.kind === 'session').map(e => e.id));
    if (source.sessionIds.some(id => !migratedIds.has(id) && sessions.some(s => s.sessionId === id)
      && !state.sessionOwnership.some(owner => owner.sessionId === id && owner.projectId !== record.source.projectId)))
      throw new WorkbaseError('conflict', '迁移已完成，但源工作区出现新增会话，请先核对归属再移除登记');
    const ids = new Set([...source.sessionIds, ...migratedIds]);
    if (sessions.some(s => ids.has(s.sessionId) && s.running))
      throw new WorkbaseError('running', '迁移已完成，运行中的会话结束后才能移除源工作区登记');
    let failure: unknown;
    try { await this.host.remove(source.workspaceId); } catch (error) { failure = error; }
    // 超时或异常后读回已不存在即可复用结果；仍存在则保持回执供重试，不重做迁移。
    const after = await this.host.workspaces();
    if (after.some(w => w.workspaceId === source.workspaceId))
      throw new WorkbaseError('unavailable', `迁移已完成，但源工作区登记移除失败：${failure instanceof Error ? failure.message : '请刷新重试'}`);
  }
  syncMigratedWorkspaces() {
    return this.serial(async () => {
      this.assertMigrationStorage();
      // 没有待清的已完成合并时直接返回：这是最常见的情况，不该为它去列一次宿主工作区。
      const pending = this.persistence.get().migrations
        .filter(record => record.kind === 'merge' && record.status === 'completed');
      if (pending.length === 0) return [] as string[];
      const listed = await this.host.workspaces();
      const failures: string[] = [];
      for (const record of pending) {
        try { await this.removeMigratedWorkspace(record, listed); }
        catch (error) { failures.push(error instanceof Error ? error.message : '迁移源工作区登记移除失败'); }
      }
      return failures;
    });
  }
  private async workspaces() { return projectWorkspaces(this.persistence.get(), await this.host.workspaces()); }
  private rebindMigrationState(state: State, binding: Binding, workspaceId: string) {
    binding.workspaceId = workspaceId;
    for (const owner of state.sessionOwnership) if (owner.projectId === binding.projectId && owner.path === binding.path)
      owner.workspaceId = workspaceId;
    for (const record of state.migrations) {
      for (const endpoint of [record.source, record.target]) if (endpoint.projectId === binding.projectId && endpoint.path === binding.path)
        endpoint.workspaceId = workspaceId;
      for (const item of record.undo?.sessions ?? []) if (item.previous?.projectId === binding.projectId && item.previous.path === binding.path)
        item.previous.workspaceId = workspaceId;
    }
  }
  workspaceForSession(sessionId: string, fallbackWorkspaceId?: string): string {
    const state = this.persistence.get(), owner = state.sessionOwnership.find(value => value.sessionId === sessionId);
    if (owner) {
      if (!state.bindings.some(b => isLiveBinding(b, owner)))
        throw new WorkbaseError('binding-unavailable', '迁移会话目标关联已失效');
      return owner.workspaceId;
    }
    const tree = state.worktreeSessions.find(value => value.sessionId === sessionId);
    const binding = tree && state.bindings.find(b => b.projectId === tree.projectId && !b.retired && !b.removed);
    if (binding) return binding.workspaceId;
    if (!fallbackWorkspaceId) throw new WorkbaseError('binding-unavailable', '当前会话未关联已注册项目');
    return fallbackWorkspaceId;
  }
  private async commitMigration(before: State, next: State) {
    this.assertMigrationStorage();
    next.revision = before.revision + 1;
    const parsed = stateSchema.parse(next);
    try {
      await this.persistence.set(parsed);
      assertPersisted(this.persistence.get(), parsed, '迁移持久化校验失败');
    } catch (error) {
      // 同一个存储域内提交归属、待办和回执；写入失败同时恢复内存与持久状态。
      try { await this.persistence.set(before); }
      catch {
        this.migrationStorageUnknown = true;
        throw new WorkbaseError('rollback-failed', '迁移存储回滚失败，请重启后核对迁移记录，勿重复操作');
      }
      throw error;
    }
  }
  private assertMigrationStorage() {
    if (this.migrationStorageUnknown)
      throw new WorkbaseError('unknown', '工作台存储状态未知，请重启后核对存储和事务记录');
  }
  discardMigration(token: string) { this.migrationPreviews.delete(token); this.migrationWitnesses.delete(token); return null; }
  migrationRecords(projectId: string): Promise<MigrationRecordView[]> {
    return this.serial(async () => {
      assertProjectId(projectId);
      const state = this.persistence.get();
      if (!state.bindings.some(b => b.projectId === projectId)) throw new WorkbaseError('not-found', '项目不存在');
      return structuredClone(state.migrations.filter(r => r.source.projectId === projectId || r.target.projectId === projectId)
        .sort((a, b) => b.completedAt - a.completedAt).map(r => ({ ...r, expired: this.now() >= r.undoUntil,
          canUndo: r.status === 'completed' && this.now() < r.undoUntil && !!r.undo && r.kind === 'merge'
            && [r.source, r.target].every(endpoint => state.bindings.some(b => isLiveBinding(b, endpoint, false))) })));
    });
  }
  undoMigration(id: string) {
    return this.serial(async () => {
      this.assertMigrationStorage();
      const before = structuredClone(this.persistence.get()), record = before.migrations.find(r => r.id === id);
      if (!record) throw new WorkbaseError('not-found', '迁移记录不存在');
      if (record.status === 'reverted') return structuredClone(record);
      if (this.now() >= record.undoUntil)
        throw new WorkbaseError('conflict', '迁移已撤销或超过撤销期限');
      if (!record.undo || record.kind !== 'merge') throw new WorkbaseError('unsupported', MIGRATION_UNAVAILABLE);
      const workspaces = await this.workspaces(), sessions = await this.host.sessions();
      const native = await this.host.workspaces();
      const sourceMatches = native.filter(w => w.path === record.source.path);
      if (sourceMatches.length > 1) throw new WorkbaseError('binding-conflict', '源目录有多个工作区登记，无法撤销');
      if (before.bindings.some(b => b.projectId !== record.source.projectId && b.path === record.source.path && !b.retired && !b.removed))
        throw new WorkbaseError('binding-conflict', '源目录已关联其他项目，无法撤销');
      const existingSource = sourceMatches[0];
      if (!native.some(w => w.workspaceId === record.source.workspaceId && w.path === record.source.path)) {
        // 虚拟身份仅用于撤销前业务核验，全部通过后才调用官方登记。
        workspaces.push({ workspaceId: record.source.workspaceId!, path: record.source.path,
          title: record.source.title, available: !!existingSource?.available, sessionIds: existingSource?.sessionIds ?? [] });
      }
      for (const endpoint of [record.source, record.target]) {
        const binding = this.writable(before, workspaces, endpoint.projectId!, userActor, endpoint === record.source);
        assertWritable(binding);
        if (binding.workspaceId !== endpoint.workspaceId || binding.path !== endpoint.path)
          throw new WorkbaseError('binding-conflict', '迁移项目关联已变化，无法撤销');
        // 上一行的三元组核验已保证绑定工作区就是端点工作区，按绑定取会话列表。
        const ids = this.boundWorkspace(workspaces, binding).sessionIds;
        if (sessions.some(s => ids.includes(s.sessionId) && s.running))
          throw new WorkbaseError('running', '项目存在运行中的会话');
      }
      const next = structuredClone(before), sourceId = record.source.projectId!, targetId = record.target.projectId!;
      for (const item of record.undo.sessions) {
        // 删除后的会话不复活；被后续批次移走的会话不得夺回。
        const current = next.sessionOwnership.find(owner => owner.sessionId === item.sessionId);
        if (sessions.some(s => s.sessionId === item.sessionId)
          && (!current || current.projectId !== targetId))
          throw new WorkbaseError('conflict', '迁移会话归属已变化，无法撤销');
        next.sessionOwnership = next.sessionOwnership.filter(owner => owner.sessionId !== item.sessionId);
        if (!sessions.some(s => s.sessionId === item.sessionId)) continue;
        next.sessionOwnership.push(item.previous ?? { sessionId: item.sessionId, projectId: sourceId,
          workspaceId: record.source.workspaceId!, path: record.source.path });
        const tree = next.worktreeSessions.find(value => value.sessionId === item.sessionId);
        if (tree) tree.projectId = sourceId;
      }
      for (const item of record.undo.todos) {
        const todo = next.todos.find(value => value.id === item.id && value.projectId === targetId);
        if (!todo) continue;
        if (item.shared) next.todos.push({ ...structuredClone(todo), projectId: sourceId, version: todo.version + 1, updatedAt: this.now() });
        else { todo.projectId = sourceId; todo.version++; todo.updatedAt = this.now(); }
      }
      const settings = record.undo.sourceSettings;
      next.bindings.find(b => b.projectId === sourceId)!.agentCanChangeStatus = settings.agentCanChangeStatus;
      if (settings.detail) next.preferences.detail[sourceId] = settings.detail; else delete next.preferences.detail[sourceId];
      if (settings.mark) next.projectMarks[sourceId] = settings.mark; else delete next.projectMarks[sourceId];
      const reverted = next.migrations.find(r => r.id === id)!;
      reverted.status = 'reverted'; reverted.revertedAt = this.now();
      next.detachedMigrationRules = next.detachedMigrationRules.filter(value => value !== id);
      let created: HostWorkspace | undefined;
      let ruleReceipt: RuleReceipt | undefined;
      try {
        let restored = existingSource;
        if (!restored) {
          if (!this.host.register || !this.host.remove)
            throw new WorkbaseError('unsupported', '宿主未提供工作区恢复登记能力');
          // 源目录缺失时官方登记必抛 realpath ENOENT；撤销仍要求先恢复目录，这里只把裸错误转成可读提示。
          try { await stat(record.source.path); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            throw new WorkbaseError('directory-unavailable', '源项目目录已不存在，请恢复原目录后再撤销迁移');
          }
          // create 异常时不猜测是否已成功，不再次登记或删除未知结果；下次按路径复用。
          restored = await this.host.register(record.source.path, record.source.title);
          if (!native.some(w => w.workspaceId === restored!.workspaceId)) created = restored;
        }
        if (restored.path !== record.source.path || !(await this.host.workspaces()).some(w =>
          w.workspaceId === restored!.workspaceId && w.path === restored!.path))
          throw new WorkbaseError('binding-conflict', '恢复的源工作区登记无法核验');
        this.rebindMigrationState(next, next.bindings.find(b => b.projectId === sourceId)!, restored.workspaceId);
        ruleReceipt = await this.transitionMigrationRules(before, next);
        await this.commitMigration(before, next);
      } catch (error) {
        if (!this.migrationStorageUnknown) await ruleReceipt?.rollback();
        // 存储状态未知时不能补偿删登记：磁盘可能已经是撤销成功状态。
        if (created && !this.migrationStorageUnknown) {
          const found = (await this.host.workspaces()).find(w => w.workspaceId === created!.workspaceId);
          if (found?.path === created.path) {
            let cleanupError: unknown;
            try { await this.host.remove!(created.workspaceId); } catch (failure) { cleanupError = failure; }
            if ((await this.host.workspaces()).some(w => w.workspaceId === created!.workspaceId))
              throw new WorkbaseError('rollback-failed', `撤销未完成，本次恢复的登记清理失败：${cleanupError instanceof Error ? cleanupError.message : '请刷新后重试'}`);
          }
        }
        throw error;
      }
      return structuredClone(reverted);
    });
  }
  personalList(signal?: AbortSignal) {
    if (!this.personal) throw new WorkbaseError('unavailable', '私人订制尚未就绪');
    return this.personal.list(signal);
  }
  personalSave(file: PersonalFile, version: string | null, content: string, signal?: AbortSignal) {
    this.assertMigrationStorage();
    if (!this.personal) throw new WorkbaseError('unavailable', '私人订制尚未就绪');
    return this.personal.save(file, version, content, signal);
  }
  async backupStatus() {
    if (!this.backup) throw new WorkbaseError('unsupported', '当前宿主未启用备份服务');
    return this.backup.status();
  }
  async startBackup(trigger: 'manual' | 'startup') {
    this.assertMigrationStorage();
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
    this.assertMigrationStorage();
    if (!this.restore) throw new WorkbaseError('unsupported', '当前宿主未启用恢复服务');
    return this.restore.confirm(input);
  }
  discardRestore(token: string) {
    if (!this.restore) throw new WorkbaseError('unsupported', '当前宿主未启用恢复服务');
    return this.restore.discard(token);
  }
  inspectRestore(input: unknown) {
    return this.serial(async () => {
      const restored = restoredState(input, await this.host.workspaces(), this.persistence.get());
      return { revision: this.persistence.get().revision, blockers: restored.blockers };
    });
  }
  /** 回滚归档必须在写入之前完成；预览后任何状态写入都使确认失效。 */
  applyRestore(input: unknown, expectedRevision: number, beforeWrite: (before: State) => Promise<void>) {
    return this.serial(async () => {
      this.assertMigrationStorage();
      const before = structuredClone(this.persistence.get());
      if (before.revision !== expectedRevision) throw new WorkbaseError('conflict', '预览后工作台数据已变化，请重新预览');
      const restored = restoredState(input, await this.host.workspaces(), this.persistence.get());
      if (restored.blockers.length) throw new WorkbaseError('binding-conflict', restored.blockers.join('；'));
      const next = restored.value;
      next.revision = before.revision + 1;
      // 备份位置与自动任务属于当前环境，恢复不能重启旧环境的自动安装或备份配置。
      next.preferences.backup = { ...before.preferences.backup };
      // 工作台备份不是规则文件备份；保留当前规则配置与文件的对应关系。
      next.preferences.rules = structuredClone(before.preferences.rules);
      next.pendingImports = structuredClone(before.pendingImports);
      next.pendingSessionDeletions = structuredClone(before.pendingSessionDeletions);
      next.sessionCreations = structuredClone(before.sessionCreations);
      next.detachedMigrationRules = structuredClone(before.detachedMigrationRules);
      next.preferences.pluginAutoUpdate = false;
      await beforeWrite(before);
      try {
        await this.persistence.set(next);
        assertPersisted(this.persistence.get(), next, '恢复持久化校验失败');
      }
      catch (error) {
        try {
          const rollback = { ...before, revision: before.revision + 2 };
          await this.persistence.set(rollback);
          assertPersisted(this.persistence.get(), rollback, '恢复回滚校验失败');
        } catch {
          this.migrationStorageUnknown = true;
          throw new WorkbaseError('rollback-failed', '恢复写入及自动回滚均失败，请使用保留的加密回滚副本');
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
  /** 只读通道：不做整份克隆、不做变更检测，避免读操作承担写路径的比较成本。
   * 绑定对齐只在实际漂移时补一次落盘，正常读路径不写盘。 */
  private async read<T>(run: (state: State, workspaces: HostWorkspace[]) => T | Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.serial(async () => {
      this.assertMigrationStorage();
      signal?.throwIfAborted();
      const workspaces = await this.workspaces();
      await this.ensureBindings(workspaces);
      signal?.throwIfAborted();
      return run(this.persistence.get(), workspaces);
    });
  }
  /** 绑定对齐只在实际漂移时补一次落盘；正常读路径不写盘。 */
  private async ensureBindings(workspaces: HostWorkspace[]): Promise<void> {
    if (!this.needsReconcile(this.persistence.get(), workspaces)) return;
    const next = structuredClone(this.persistence.get());
    this.reconcile(next, workspaces);
    next.revision = next.revision + 1;
    await this.persistence.set(stateSchema.parse(next));
  }  /** 宿主工作区与绑定发生漂移（新增、路径变化、待导入占位）时读路径才需要对齐。 */
  private needsReconcile(state: State, workspaces: HostWorkspace[]): boolean {
    if (this.pendingImports.size > 0) return true;
    return workspaces.some(workspace => {
      if (state.pendingImports.some(item => item.workspaceId === workspace.workspaceId || item.path === workspace.path)) return false;
      const existing = state.bindings.find(b => b.workspaceId === workspace.workspaceId);
      return !existing || existing.path !== workspace.path;
    });
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
  private async change<T>(run: (state: State, workspaces: HostWorkspace[]) => T | Promise<T>, signal?: AbortSignal, onCommit?: (result: T) => void, onFailure?: () => Promise<void>): Promise<T> {
    return this.serial(async () => {
      this.assertMigrationStorage();
      signal?.throwIfAborted();
      const current = this.persistence.get();
      const next = structuredClone(current);
      const workspaces = await this.workspaces();
      this.reconcile(next, workspaces);
      let result: T;
      try {
        result = await run(next, workspaces);
        signal?.throwIfAborted();
        // 变更检测与读回核验（assertPersisted）一样按结构化深等比较，
        // 不受键序或 undefined 字段序列化差异影响，只关心「有没有真实改动」。
        if (!isDeepStrictEqual(next, current)) {
          next.revision = current.revision + 1;
          await this.persistence.set(stateSchema.parse(next));
        }
      } catch (error) {
        if (onFailure) {
          // 某些持久化适配器先改内存再等待落盘，失败时同时撤销偏好和文件。
          let stateFailed = false;
          if (!isDeepStrictEqual(this.persistence.get(), current)) {
            try { await this.persistence.set(current); } catch { stateFailed = true; this.migrationStorageUnknown = true; }
          }
          await onFailure();
          if (stateFailed) throw new WorkbaseError('rollback-failed', '规则文件已回滚，但设置回滚失败，请重新检查设置');
        }
        throw error;
      }
      onCommit?.(result);
      return result;
    });
  }
  private reconcile(state: State, workspaces: HostWorkspace[]) {
    for (const item of this.pendingImports.values())
      if (!state.pendingImports.some(pending => pending.path === item.path))
        state.pendingImports.push(structuredClone(item));
    for (const workspace of workspaces) {
      if (state.pendingImports.some(item => item.workspaceId === workspace.workspaceId || item.path === workspace.path) ||
          [...this.pendingImports.values()].some(item => item.workspaceId === workspace.workspaceId || item.path === workspace.path)) continue;
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
  private writable(state: State, workspaces: HostWorkspace[], projectId: string, actor = userActor, allowMigratedSource = false): Binding {
    assertProjectId(projectId);
    if (!allowMigratedSource && migrationTarget(state, projectId))
      throw new WorkbaseError('migrated', '项目已迁入其他项目，请在目标项目查看迁移记录');
    const b = state.bindings.find(b => b.projectId === projectId && !b.retired && !b.removed);
    if (!b || !workspaces.some(w => w.workspaceId === b.workspaceId && w.path === b.path))
      throw new WorkbaseError('binding-unavailable', '项目绑定不可用，请刷新或处理绑定冲突');
    if (actor.kind === 'agent' && actor.workspaceId !== b.workspaceId)
      throw new WorkbaseError('forbidden', 'Agent 只能操作当前项目');
    return b;
  }
  /** 绑定对应的工作区：writable() 已核验 workspaceId 与 path 一致，这里只承担查找与失败分支，
   * 不再让每个调用方各自 find(...)! 去依赖那次核验。 */
  private requireWorkspace(workspaces: HostWorkspace[], workspaceId: string): HostWorkspace {
    const workspace = workspaces.find(w => w.workspaceId === workspaceId);
    if (!workspace) throw new WorkbaseError('binding-unavailable', '项目绑定不可用，请刷新或处理绑定冲突');
    return workspace;
  }
  private boundWorkspace(workspaces: HostWorkspace[], binding: Binding): HostWorkspace {
    return this.requireWorkspace(workspaces, binding.workspaceId);
  }
  /** 会话归属判定：工作区会话列表优先，工作树会话按项目登记放行。
   * 各入口只决定失败时的错误码与文案，判定口径集中在这里。 */
  private assertSessionInProject(state: State, workspace: HostWorkspace, projectId: string, sessionId: string,
    message = '会话不属于当前项目') {
    if (workspace.sessionIds.includes(sessionId)) return;
    if (state.worktreeSessions.some(s => s.sessionId === sessionId && s.projectId === projectId)) return;
    throw new WorkbaseError('forbidden', message);
  }
  async snapshot(signal?: AbortSignal): Promise<Snapshot> {
    // 会话读取失败时不提交半份同步，也不把前端已有结果替换为空列表。
    const sessions = await this.host.sessions(signal);
    await this.syncMigratedWorkspaces();
    await this.change(() => undefined, signal);
    return this.serial(async () => {
      signal?.throwIfAborted();
      const state = this.persistence.get();
      const workspaces = await this.workspaces();
      const projects = workspaces.flatMap(w => {
        const binding = state.bindings.find(b => b.workspaceId === w.workspaceId && !b.retired && !b.removed && b.path === w.path);
        if (!binding || migrationTarget(state, binding.projectId)) return [];
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
      return binding && !migrationTarget(state, binding.projectId) ? [{ ...w, projectId: binding.projectId, archived: binding.archived }] : [];
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
    return this.serial(async () => this.collectDiagnostics(await this.workspaces(), this.persistence.get(), signal));
  }
  async repairDiagnostics(input: { kind: DiagnosticRepairKind; items: DiagnosticCandidate[] }, signal: AbortSignal): Promise<DiagnosticRepairResult> {
    return this.serial(async () => {
      this.assertMigrationStorage();
      signal.throwIfAborted();
      if (!this.host.repairDiagnostics) throw new WorkbaseError('unsupported', '宿主未提供诊断修复能力');
      const report = await this.collectDiagnostics(await this.workspaces(), this.persistence.get(), signal);
      const items = [...new Map(input.items.map(i => [i.sessionId, i])).values()];
      const eligible: DiagnosticCandidate[] = [], skipped: string[] = [];
      for (const item of items) {
        const issue = report.issues.find(i => i.kind === input.kind && i.sessionId === item.sessionId && i.identity === item.identity);
        if (!issue) {
          if (input.kind === 'empty') { skipped.push(item.sessionId); continue; }
          throw new WorkbaseError('stale-diagnostic', '诊断结果已变化，请重新检测后操作');
        }
        // 已退休或已移除的绑定不再代表可写项目：残留会话往往正属于这批绑定，
        // 用归档/绑定校验把它们挡回去会让诊断清理永久失败。
        const binding = this.persistence.get().bindings
          .find(b => b.projectId === issue.projectId && !b.retired && !b.removed);
        if (binding) assertWritable(binding);
        eligible.push(item);
      }
      if (!eligible.length) return { succeeded: [], skipped, failures: [] };
      if (!report.repair[input.kind]) throw new WorkbaseError('unsupported', '宿主缺少诊断修复所需的底层能力，请更新宿主');
      signal.throwIfAborted();
      // 下游共享工作区队列会再次核验活动状态、父子关系；缓存重建还校验生命周期见证。
      // 请求发出后即使前端取消也保留实际结果，避免将已完成的物理清理报告为取消。
      const result = await this.host.repairDiagnostics(input.kind, eligible, async target => {
        this.assertMigrationStorage();
        const state = this.persistence.get(), workspaces = await this.host.workspaces();
        const owner = state.sessionOwnership.find(s => s.sessionId === target.sessionId)
          ?? state.worktreeSessions.find(s => s.sessionId === target.sessionId);
        // 只按仍然生效的绑定核验归属：项目或工作区已经消失的残留会话正是清理对象，
        // 用 binding-unavailable 拦住它们等于让这批会话永远删不掉。
        const bindings = state.bindings.filter(b => !b.retired && !b.removed && (owner ? b.projectId === owner.projectId
          : workspaces.some(w => w.workspaceId === b.workspaceId && w.sessionIds.includes(target.sessionId))
            || target.path !== undefined && b.path === target.path));
        if (bindings.length > 1) throw new WorkbaseError('binding-conflict', '级联会话项目归属存在冲突');
        const binding = bindings[0];
        if (binding) assertWritable(binding);
      });
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
      state.todos = state.todos.filter(t => t.id !== old.id || t.projectId !== old.projectId);
      undo = { token: this.uuid(), todo: structuredClone(old), expiresAt: this.now() + TODO_UNDO_MS };
      return { deleted: true, undoToken: undo.token, undoExpiresAt: undo.expiresAt };
    }, signal, result => {
      if (undo) {
        undo.expiresAt = this.now() + TODO_UNDO_MS; result.undoExpiresAt = undo.expiresAt;
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
      if (state.todos.some(t => t.id === undo.todo.id && t.projectId === undo.todo.projectId))
        throw new WorkbaseError('conflict', '待办已恢复，请刷新');
      const restored = todoSchema.parse({ ...undo.todo, version: undo.todo.version + 1 });
      state.todos.push(restored);
      return restored;
    }, signal, () => { this.deletedTodo = null; });
  }
  async listForAgent(workspaceId: string, signal?: AbortSignal, filter: TodoFilter = {}) {
    const options = todoFilterSchema.parse(filter);
    return this.read((state, workspaces) => {
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
  /** 写入类工具只需要当前工作区的项目身份；为此列出整份待办既浪费一次扫描，也让 projectId 落地得更早。 */
  async projectForAgent(workspaceId: string, signal?: AbortSignal): Promise<{ projectId: string }> {
    return this.read((state, workspaces) => {
      const binding = state.bindings.find(b => b.workspaceId === workspaceId && !b.retired);
      if (!binding) throw new WorkbaseError('binding-unavailable', '当前项目绑定不可用');
      this.writable(state, workspaces, binding.projectId, { kind: 'agent', workspaceId });
      return { projectId: binding.projectId };
    }, signal);
  }
  async getForAgent(workspaceId: string, id: string, signal?: AbortSignal): Promise<Todo> {
    const result = await this.listForAgent(workspaceId, signal);
    const todo = result.todos.find(t => t.id === id);
    if (!todo || !('note' in todo)) throw new WorkbaseError('not-found', '待办不存在');
    return todo;
  }
  /** 附件配额：图片与通用附件共用一个上限；文案里的数字取自 shared/todo.ts 的常量，改配额时无需再同步字面量。 */
  private assertTodoAttachmentQuota(todo: { images: TodoImage[]; attachments?: TodoAttachment[] }) {
    if (todoAttachments(todo).length >= MAX_TODO_IMAGES)
      throw new WorkbaseError('invalid', `每个待办最多${MAX_TODO_IMAGES}个附件`);
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
    // 上限文案与常量同源，改配额时不用再同步字面量。
    if (!data.length || data.length > MAX_TODO_IMAGE_BYTES)
      throw new WorkbaseError('invalid', `图片应小于等于${MAX_TODO_IMAGE_BYTES / 1024 / 1024}MiB`);
    const type = todoImageSchema.shape.mediaType.parse(mediaType);
    return this.change(async (state, workspaces) => {
      const todo = this.imageTodo(state, workspaces, input, actor, true);
      this.assertTodoAttachmentQuota(todo);
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
      this.assertTodoAttachmentQuota(todo);
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
    return this.read(async (state, workspaces) => {
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
      this.assertTodoAttachmentQuota(todo);
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
    return this.read(async (state, workspaces) => {
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
      if (input.choice === 'restore') this.rebindMigrationState(state, b, w.workspaceId);
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
      const w = this.boundWorkspace(workspaces, b);
      if (input.sessionId && !w.sessionIds.includes(input.sessionId)) throw new WorkbaseError('forbidden', '会话不属于当前项目');
      const marks = input.sessionId ? state.sessionMarks : state.projectMarks;
      const key = input.sessionId ?? input.projectId;
      marks[key] = { ...(marks[key] ?? emptyMark()), [input.field]: input.value };
      return { saved: true };
    });
  }
  async setPreferences(patch: Partial<Omit<Preferences, 'detail' | 'backup'>> & { detail?: Record<string, Preferences['detail'][string]>; backup?: Partial<Preferences['backup']> }, expectedRevision?: number) {
    if (patch.rules !== undefined) throw new WorkbaseError('invalid', '规则必须通过设置保存，并检查原规则版本');
    return this.change((state) => {
      this.assertRevision(state, expectedRevision);
      state.preferences = { ...state.preferences, ...patch, backup: { ...state.preferences.backup, ...patch.backup }, detail: { ...state.preferences.detail, ...patch.detail } };
      return { saved: true, revision: state.revision };
    }, undefined, result => { result.revision = this.persistence.get().revision; });
  }
  async saveTerminalPalette(expected: TerminalPalette, value: TerminalPalette) {
    return this.change(state => {
      if (!isDeepStrictEqual(state.preferences.terminalPalette, expected))
        throw new WorkbaseError('conflict', '终端配色已在其他窗口修改，请重新打开设置。');
      if (value.mode !== 'follow' && !resolveTerminalColors(value))
        throw new WorkbaseError('invalid', '请先下载 Catppuccin 色板。');
      state.preferences.terminalPalette = value;
      return { saved: true };
    });
  }
  async saveSettings(theme: Preferences['theme'], permissions: Record<string, boolean>, options?: Pick<Preferences, 'home' | 'root'> & Partial<Pick<Preferences, 'language' | 'navigation' | 'projectInitialization' | 'openOnStartup' | 'agentManageTodos' | 'pluginUpdateVisible' | 'pluginAutoUpdate' | 'terminalSettingsVisible' | 'speechComponentEnabled' | 'rules' | 'extensionConfig'>> & { backup?: Partial<Preferences['backup']>; expectedRules?: ProjectRules }, expectedRevision?: number) {
    let receipt: RuleReceipt | undefined;
    return this.change(async (state, workspaces) => {
      this.assertRevision(state, expectedRevision);
      const previous = structuredClone(state.preferences.rules);
      let rules: ProjectRules | undefined;
      if (options?.rules !== undefined) {
        if (!options.expectedRules || !isDeepStrictEqual(previous, projectRulesSchema.parse(options.expectedRules)))
          throw new WorkbaseError('conflict', '规则已在其他窗口修改，请重新打开设置');
        rules = projectRulesSchema.parse(options.rules);
      }
      for (const [projectId, allowed] of Object.entries(permissions))
        this.writable(state, workspaces, projectId).agentCanChangeStatus = allowed;
      state.preferences.theme = theme;
      if (options) {
        if (options.language !== undefined) state.preferences.language = options.language;
        state.preferences.home = { ...options.home };
        state.preferences.root = options.root;
        if (options.projectInitialization !== undefined) state.preferences.projectInitialization = { ...options.projectInitialization };
        if (options.extensionConfig !== undefined) state.preferences.extensionConfig = structuredClone(options.extensionConfig);
        if (options.openOnStartup !== undefined) state.preferences.openOnStartup = options.openOnStartup;
        if (options.pluginUpdateVisible !== undefined) state.preferences.pluginUpdateVisible = options.pluginUpdateVisible;
        if (options.pluginAutoUpdate !== undefined) state.preferences.pluginAutoUpdate = options.pluginAutoUpdate;
        if (options.terminalSettingsVisible !== undefined) state.preferences.terminalSettingsVisible = options.terminalSettingsVisible;
        if (options.speechComponentEnabled !== undefined) state.preferences.speechComponentEnabled = options.speechComponentEnabled;
        if (options.backup !== undefined) state.preferences.backup = { ...state.preferences.backup, ...options.backup };
        if (options.agentManageTodos !== undefined) {
          state.preferences.agentManageTodos = options.agentManageTodos;
          // 全局设置替代旧逐项目状态权限，包含当前不可见及后续恢复的绑定。
          for (const binding of state.bindings) binding.agentCanChangeStatus = options.agentManageTodos;
        }
        if (options.navigation) state.preferences.navigation = options.navigation;
      }
      if (rules) receipt = await this.applyRules(state, workspaces, previous, rules);
      return { saved: true, revision: state.revision };
    }, undefined, result => { result.revision = this.persistence.get().revision; }, async () => { await receipt?.rollback(); });
  }
  async saveRules(expectedRules: ProjectRules, rules: ProjectRules, expectedRevision?: number) {
    let receipt: RuleReceipt | undefined;
    return this.change(async (state, workspaces) => {
      this.assertRevision(state, expectedRevision);
      const previous = structuredClone(state.preferences.rules);
      if (!isDeepStrictEqual(previous, projectRulesSchema.parse(expectedRules)))
        throw new WorkbaseError('conflict', '规则已在其他窗口修改，请重新打开设置');
      receipt = await this.applyRules(state, workspaces, previous, projectRulesSchema.parse(rules));
      return { saved: true, revision: state.revision };
    }, undefined, result => { result.revision = this.persistence.get().revision; }, async () => { await receipt?.rollback(); });
  }
  private assertRevision(state: State, expectedRevision?: number) {
    if (expectedRevision !== undefined && state.revision !== expectedRevision)
      throw new WorkbaseError('conflict', '工作台已在其他窗口修改或恢复，请重新打开设置');
  }
  private effectiveRules(state: State, rules = state.preferences.rules, includeLegacy = false): ProjectRules {
    return { global: rules.global, projects: rules.projects.map(rule => ({
      ...rule, projectIds: rule.projectIds.filter(id => !state.migrations.some(r =>
        r.status === 'completed' && r.kind === 'merge' && r.source.projectId === id
        && (includeLegacy || state.detachedMigrationRules.includes(r.id)))),
    })).filter(rule => rule.projectIds.length > 0) };
  }
  private async transitionMigrationRules(before: State, next: State) {
    const previous = this.effectiveRules(before), rules = this.effectiveRules(next);
    if (isDeepStrictEqual(previous, rules)) return;
    const ids = new Set([...previous.projects, ...rules.projects].filter(r => r.enabled).flatMap(r => r.projectIds));
    const targets = [...ids].map(projectId => {
      const binding = next.bindings.find(b => b.projectId === projectId && !b.retired && !b.removed);
      if (!binding) throw new WorkbaseError('binding-unavailable', '迁移规则项目关联无法核实');
      assertWritable(binding);
      return { projectId, path: binding.path };
    });
    if (!this.host.saveRules) throw new WorkbaseError('unsupported', '当前宿主不支持迁移规则文件');
    return this.host.saveRules(previous, rules, targets);
  }
  private async applyRules(state: State, workspaces: HostWorkspace[], previous: ProjectRules, rules: ProjectRules) {
    if (isDeepStrictEqual(rules, previous)) return;
    const targets: RuleTarget[] = [];
    const oldEffective = this.effectiveRules(state, previous), newEffective = this.effectiveRules(state, rules, true);
    const ids = new Set([...oldEffective.projects, ...newEffective.projects].filter(rule => rule.enabled).flatMap(rule => rule.projectIds));
    for (const projectId of ids) {
      const effective = (value: ProjectRules) => value.projects
        .filter(rule => rule.enabled && rule.projectIds.includes(projectId))
        .map(rule => ({ name: rule.name, content: rule.content.trim() }));
      if (isDeepStrictEqual(effective(oldEffective), effective(newEffective))) continue;
      const migrated = migrationTarget(state, projectId);
      const binding = migrated ? state.bindings.find(b => b.projectId === projectId && !b.retired && !b.removed)
        : this.writable(state, workspaces, projectId);
      if (!binding) throw new WorkbaseError('binding-unavailable', '项目规则关联不可用');
      assertWritable(binding);
      if (migrated && workspaces.some(w => w.path === binding.path && w.workspaceId !== binding.workspaceId))
        throw new WorkbaseError('binding-conflict', '迁移源规则目录已关联其他工作区');
      if (!migrated && !workspaces.find(w => w.workspaceId === binding.workspaceId)?.available)
        throw new WorkbaseError('directory-unavailable', '项目目录不可用，无法保存规则');
      targets.push({ projectId, path: binding.path });
    }
    if (!this.host.saveRules) throw new WorkbaseError('unsupported', '当前宿主不支持保存规则文件');
    state.preferences.rules = rules;
    for (const record of state.migrations) if (record.kind === 'merge' && record.status === 'completed'
      && !state.detachedMigrationRules.includes(record.id)) state.detachedMigrationRules.push(record.id);
    stateSchema.parse(state);
    return this.host.saveRules(oldEffective, newEffective, targets);
  }
  async removeProject(projectId: string) {
    if (!this.host.remove) throw new WorkbaseError('unsupported', '当前宿主不支持移除项目');
    return this.serial(async () => {
      this.assertMigrationStorage();
      const state = structuredClone(this.persistence.get()), workspaces = await this.workspaces();
      const pending = state.bindings.find(b => b.projectId === projectId && b.removed && !b.retired);
      const binding = pending ?? this.writable(state, workspaces, projectId);
      if (pending) {
        const native = await this.host.workspaces();
        const found = native.find(w => w.workspaceId === pending.workspaceId);
        if (!found) return { removed: true };
        if (found.path !== pending.path) throw new WorkbaseError('binding-conflict', '待确认移除项目的归属已变化');
        pending.removed = false; state.revision++;
        await this.persistence.set(stateSchema.parse(state));
        throw new WorkbaseError('remove-unconfirmed', '原项目登记仍在，已确认未移除；请重新操作');
      }
      const workspace = this.boundWorkspace(workspaces, binding);
      const sessions = await this.host.sessions();
      if (sessions.some(s => workspace.sessionIds.includes(s.sessionId) && s.running))
        throw new WorkbaseError('running', '项目仍有运行中会话，请先停止运行');
      // 先保存恢复身份；仅读回确证仍存在时撤销标志，未知结果保留方向。
      binding.removed = true;
      const prepared = structuredClone(state);
      prepared.revision++;
      await this.persistence.set(stateSchema.parse(prepared));
      let failure: unknown;
      try { await this.host.remove!(binding.workspaceId); } catch (error) { failure = error; }
      const native = await this.host.workspaces();
      const found = native.find(w => w.workspaceId === binding.workspaceId);
      if (found) {
        if (found.path !== binding.path) throw new WorkbaseError('binding-conflict', '移除项目的宿主归属已变化');
        binding.removed = false;
        await this.persistence.set(stateSchema.parse({ ...state, revision: prepared.revision + 1 }));
        throw failure ?? new WorkbaseError('remove-unconfirmed', '宿主未确认项目移除');
      }
      return { removed: true };
    });
  }
  async addProject(path: string, name?: string, initialization?: ProjectInitializationInput) {
    const explicit = initialization === undefined ? undefined : projectInitializationSchema.parse(initialization);
    if (initialization !== undefined) {
      if (name === undefined) throw new WorkbaseError('invalid', '初始化仅适用于创建新项目');
    }
    if (!this.host.register) throw new WorkbaseError('unsupported', '当前宿主不支持添加项目');
    return this.serial(async () => {
      this.assertMigrationStorage();
      const current = this.persistence.get();
      const next = structuredClone(current);
      const directory = name === undefined ? path : await this.host.createDirectory?.(current.preferences.root, name,
        explicit ?? projectInitializationSchema.parse(current.preferences.projectInitialization));
      if (!directory) throw new WorkbaseError('unsupported', '当前宿主不支持创建目录');
      let workspace: HostWorkspace;
      const pending = name === undefined ? current.pendingImports.find(item => item.path === directory) ??
        [...this.pendingImports.values()].find(item => item.path === directory) : undefined;
      try {
        const registered = pending ? (await this.host.workspaces()).filter(item => item.path === pending.path) : [];
        if (registered.length > 1 || (registered.length === 1 && registered[0]!.workspaceId !== pending!.workspaceId))
          throw new WorkbaseError('binding-conflict', '待补齐项目的宿主登记已变化，请先处理绑定冲突');
        workspace = registered[0] ?? await this.host.register!(directory, name);
      }
      catch (error) {
        if (name !== undefined) throw new WorkbaseError('register-failed', `目录已创建：${directory}。注册失败：${error instanceof Error ? error.message : '宿主不可用'}。请切换「添加已有项目」重试此路径，不必再次创建文件夹。`);
        throw error;
      }
      const existing = next.bindings.find(b => !b.retired && (b.workspaceId === workspace.workspaceId || b.path === workspace.path));
      if (existing && migrationTarget(next, existing.projectId))
        throw new WorkbaseError('migrated', '项目已迁入其他项目，请在目标项目查看迁移记录');
      if (existing && !existing.removed && existing.workspaceId !== workspace.workspaceId)
        throw new WorkbaseError('binding-conflict', '该目录重新注册，请选择恢复原项目或作为新项目');
      const duplicate = !!existing && !existing.removed && !pending;
      let completed: ProjectInitializationResult | undefined;
      const defaults = projectInitializationSchema.parse(pending?.initialization ?? current.preferences.projectInitialization);
      if (name === undefined && !duplicate && !existing?.archived && defaults.completeOnImport &&
          (defaults.basic || defaults.agent || defaults.git)) {
        const record = { workspaceId: workspace.workspaceId, path: workspace.path, initialization: defaults };
        this.pendingImports.set(workspace.workspaceId, record);
        next.pendingImports = next.pendingImports.filter(item => item.path !== workspace.path);
        next.pendingImports.push(record);
        try {
          if (!workspace.available) throw new WorkbaseError('unavailable', '项目目录不可用，无法补齐初始化内容');
          if (!this.host.completeInitialization) throw new WorkbaseError('unsupported', '当前宿主不支持补齐项目初始化内容');
          completed = await this.host.completeInitialization(workspace.path, workspace.title, defaults);
        }
        catch (error) {
          next.revision = current.revision + 1;
          try { await this.persistence.set(stateSchema.parse(next)); }
          catch { throw new WorkbaseError('save-failed', '添加已有项目补齐失败，待重试记录保存失败；宿主登记和已有内容保留，请通过原路径重试'); }
          if (error instanceof WorkbaseError) throw error;
          throw new WorkbaseError('initialization-failed', `添加已有项目补齐失败：${error instanceof Error ? error.message : '目录不可用'}。工作台尚未加入此项目，宿主登记及已有内容保留，可通过原路径重试。`);
        }
        next.pendingImports = next.pendingImports.filter(item => item.path !== workspace.path);
      }
      let binding = existing;
      if (binding?.removed) { this.rebindMigrationState(next, binding, workspace.workspaceId); binding.removed = false; }
      else if (!binding) {
        binding = { projectId: this.uuid(), workspaceId: workspace.workspaceId, path: workspace.path,
          retired: false, removed: false, agentCanChangeStatus: true, archived: false };
        next.bindings.push(binding);
      }
      if (!duplicate) {
        next.revision++;
        try { await this.persistence.set(stateSchema.parse(next)); }
        catch (error) {
          if (completed) throw new WorkbaseError('save-failed', `初始化补齐已完成，但项目保存失败：${error instanceof Error ? error.message : '存储不可用'}。已补齐内容保留，请通过原路径重试。`);
          throw error;
        }
      }
      this.pendingImports.delete(workspace.workspaceId);
      return { projectId: binding.projectId, duplicate, ...(completed ? { initialization: completed } : {}) };
    });
  }
  async searchSessions(query: string, signal: AbortSignal): Promise<SessionSearch> {
    if (!this.host.search) throw new WorkbaseError('unsupported', '当前宿主不支持会话全文检索');
    // 搜索只需要可见会话集合：不跑完整快照，也就不跑诊断与迁移核对。
    const visible = await this.serial(async () => {
      signal.throwIfAborted();
      const workspaces = await this.workspaces();
      await this.ensureBindings(workspaces);
      const state = this.persistence.get();
      const ids = new Set<string>();
      for (const workspace of workspaces) {
        const binding = state.bindings.find(b => b.workspaceId === workspace.workspaceId
          && !b.retired && !b.removed && b.path === workspace.path);
        if (!binding) continue;
        for (const sessionId of workspace.sessionIds) ids.add(sessionId);
      }
      for (const item of state.worktreeSessions) {
        if (state.bindings.some(b => b.projectId === item.projectId && !b.retired && !b.removed)) ids.add(item.sessionId);
      }
      return ids;
    });
    const results = await this.host.search(query, signal, [...visible]);
    return { items: results.items.filter(item => visible.has(item.sessionId)), hasMore: results.hasMore };
  }
  async launchCatalog() {
    if (!this.host.catalog) throw new WorkbaseError('unsupported', '当前宿主不提供模式和模型目录');
    return this.host.catalog();
  }
  async checkNativeSession(workspaceId: string, sessionId?: string, signal?: AbortSignal, hold = false) {
    if (hold && !sessionId) throw new WorkbaseError('invalid', '提交保护需要会话标识');
    return this.change((state, workspaces) => {
      const matches = state.bindings.filter(b => b.workspaceId === workspaceId && !b.retired && !b.removed);
      if (matches.length !== 1) throw new WorkbaseError('binding-unavailable', '原生输入的项目关联不可用');
      const binding = this.writable(state, workspaces, matches[0]!.projectId);
      assertWritable(binding);
      const workspace = this.requireWorkspace(workspaces, workspaceId);
      if (!workspace.available) throw new WorkbaseError('directory-unavailable', '项目目录不可用');
      if (sessionId) this.assertSessionInProject(state, workspace, binding.projectId, sessionId, '原生会话不属于当前项目');
      return { projectId: binding.projectId, revision: state.revision, ...(hold ? { token: this.uuid() } : {}) };
    }, signal, result => {
      result.revision = this.persistence.get().revision;
      if (result.token) this.nativeSubmissionGuards.set(result.token, { projectId: result.projectId, sessionId: sessionId! });
    });
  }
  async releaseNativeSession(token: string) {
    return this.serial(async () => ({ released: this.nativeSubmissionGuards.delete(token) }));
  }
  async beginSession(projectId: string, preset: string, sessionId?: string, requestId?: string) {
    if (!this.host.begin) throw new WorkbaseError('unsupported', '当前宿主不支持创建会话');
    return this.serial(async () => {
      this.assertMigrationStorage();
      const state = structuredClone(this.persistence.get()), workspaces = await this.workspaces();
      this.reconcile(state, workspaces);
      const binding = this.writable(state, workspaces, projectId);
      assertWritable(binding);
      if (!this.requireWorkspace(workspaces, binding.workspaceId).available)
        throw new WorkbaseError('directory-unavailable', '项目目录不可用，请先修复目录');
      const validate = async (sessionId: string) => {
        this.assertSessionInProject(state, this.requireWorkspace(workspaces, binding.workspaceId), projectId, sessionId,
          '重试会话不属于当前项目');
        if (!(await this.host.sessions()).some(s => s.sessionId === sessionId))
          throw new WorkbaseError('not-found', '重试会话已不存在，请核对原创建结果');
        return { sessionId };
      };
      if (sessionId) return validate(sessionId);
      if (!requestId) throw new WorkbaseError('invalid', '创建会话缺少请求身份，请刷新后重试');
      let receipt = state.sessionCreations.find(r => r.requestId === requestId);
      if (receipt && (receipt.projectId !== projectId || receipt.preset !== preset
        || receipt.workspaceId !== binding.workspaceId || receipt.path !== binding.path))
        throw new WorkbaseError('conflict', '创建请求的项目或模式已变化，请核对原创建结果');
      const save = async () => {
        state.revision = this.persistence.get().revision + 1;
        await this.persistence.set(stateSchema.parse(state));
        if (!isDeepStrictEqual(this.persistence.get(), state)) throw new WorkbaseError('conflict', '创建回执保存未确认，请核对原创建结果');
      };
      if (receipt) {
        const known = this.creationResults.get(requestId);
        if (known) {
          receipt.sessionId = known;
          await save();
          this.creationResults.delete(requestId);
        }
        if (!receipt.sessionId)
          throw new WorkbaseError('conflict', '会话创建结果未知，请核对宿主会话后再继续');
        return validate(receipt.sessionId);
      }
      // 不按超时清理身份，避免过期请求再次创建；上限拒绝新请求而不丢弃旧回执。
      if (state.sessionCreations.length >= 10000)
        throw new WorkbaseError('conflict', '会话创建回执已达上限，请先维护历史回执');
      receipt = { requestId, projectId, preset, workspaceId: binding.workspaceId, path: binding.path };
      state.sessionCreations.push(receipt);
      await save(); // 意图未确认落盘之前不调用宿主。
      const result = await this.host.begin!(binding.workspaceId, preset);
      if (!result?.sessionId) throw new WorkbaseError('conflict', '会话创建结果未知，请核对宿主会话后再继续');
      this.creationResults.set(requestId, result.sessionId);
      receipt.sessionId = result.sessionId;
      await save();
      this.creationResults.delete(requestId);
      return { sessionId: result.sessionId };
    });
  }
  async gitBranches(projectId: string, signal: AbortSignal = new AbortController().signal): Promise<GitBranches> {
    if (!this.host.gitBranches) throw new WorkbaseError('unsupported', '当前宿主不支持读取 Git 分支');
    signal.throwIfAborted();
    return this.read(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      const workspace = this.boundWorkspace(workspaces, binding);
      return this.host.gitBranches!(workspace.path, signal);
    }, signal);
  }
  async submitMessage(input: { projectId: string; sessionId: string; provider: string; model: string; text: string; requestId: string }, signal: AbortSignal) {
    if (!this.host.submit) throw new WorkbaseError('unsupported', '当前宿主不支持消息提交');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, input.projectId);
      assertWritable(binding);
      const workspace = this.boundWorkspace(workspaces, binding);
      if (!workspace.available) throw new WorkbaseError('directory-unavailable', '项目目录不可用');
      // 工作树会话不在工作区 sessionIds 里，按 worktreeSessions 登记放行。
      this.assertSessionInProject(state, workspace, input.projectId, input.sessionId);
      await this.host.submit!(input, signal);
      return { accepted: true };
    }, signal);
  }
  async renameSession(projectId: string, sessionId: string, title: string) {
    if (!this.host.renameSession) throw new WorkbaseError('unsupported', '当前宿主不支持会话重命名');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      assertWritable(binding);
      this.assertSessionInProject(state, this.boundWorkspace(workspaces, binding), projectId, sessionId);
      await this.host.renameSession!(sessionId, title);
      return { saved: true };
    });
  }
  async deleteSession(projectId: string, sessionId: string) {
    if (!this.host.deleteSession) throw new WorkbaseError('unsupported', '当前宿主未启用会话删除能力');
    return this.serial(async () => {
      this.assertMigrationStorage();
      const state = structuredClone(this.persistence.get()), workspaces = await this.workspaces();
      const binding = this.writable(state, workspaces, projectId);
      assertWritable(binding);
      let receipt = state.pendingSessionDeletions.find(r => r.sessionId === sessionId);
      if (receipt && (receipt.projectId !== projectId || receipt.workspaceId !== binding.workspaceId
        || receipt.path !== binding.path))
        throw new WorkbaseError('forbidden', '删除回执的会话归属不属于当前项目');
      // 已落盘删除回执时不重复判定归属：回执自身的三元组已在上方核验。
      if (!receipt) this.assertSessionInProject(state, this.boundWorkspace(workspaces, binding), projectId, sessionId);
      const session = (await this.host.sessions()).find(s => s.sessionId === sessionId);
      if (!session && !receipt) throw new WorkbaseError('not-found', '会话已不存在，请刷新');
      if (session?.running) throw new WorkbaseError('running', '请先停止运行中的会话，再永久删除');
      if (receipt && session && !isDeepStrictEqual(receipt.witness, session))
        throw new WorkbaseError('conflict', '删除回执的会话生命周期已变化，请核对后重试');
      if (!this.host.sessionDeletionIdentity)
        throw new WorkbaseError('unsupported', '宿主未提供会话删除生命周期见证');
      const identity = await this.host.sessionDeletionIdentity(sessionId);
      if (!session && identity !== undefined)
        throw new WorkbaseError('delete-unconfirmed', '会话列表已消失，但日志仍存在；删除未确认，请重新检测');
      if (session && (!identity || receipt && receipt.identity !== identity))
        throw new WorkbaseError('conflict', '删除回执的会话生命周期已变化，请核对后重试');
      if (!receipt) {
        receipt = { projectId, workspaceId: binding.workspaceId, path: binding.path, sessionId,
          identity: identity!, witness: session! };
        state.pendingSessionDeletions.push(receipt);
        state.revision++;
        await this.persistence.set(stateSchema.parse(state));
      }
      const prepared = structuredClone(state);
      if (session) await this.host.deleteSession!(sessionId, receipt.identity);
      delete state.sessionMarks[sessionId];
      state.pendingSessionDeletions = state.pendingSessionDeletions.filter(r => r !== receipt);
      state.worktreeSessions = state.worktreeSessions.filter(w => w.sessionId !== sessionId);
      state.sessionOwnership = state.sessionOwnership.filter(w => w.sessionId !== sessionId);
      state.revision++;
      try { await this.persistence.set(stateSchema.parse(state)); }
      catch (error) {
        try {
          prepared.revision = state.revision + 1;
          await this.persistence.set(stateSchema.parse(prepared));
          if (!isDeepStrictEqual(this.persistence.get(), prepared)) throw new Error('删除回执保存无法确认');
        } catch {
          this.migrationStorageUnknown = true;
          throw new WorkbaseError('rollback-failed', '会话已删除，但删除回执恢复失败，存储状态未知；请重启核对');
        }
        throw error;
      }
      return { deleted: true };
    });
  }
  // 在系统文件管理器中显示项目目录：优先平台 SessionController.openWorkspacePath（与
  // 官方「在文件夹中显示」一致），平台能力缺失时回退为直接调起本机文件管理器。
  async revealDirectory(projectId: string) {
    if (!this.host.reveal) throw new WorkbaseError('unsupported', '当前宿主不支持打开目录');
    return this.change(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, projectId);
      await this.host.reveal!(this.boundWorkspace(workspaces, binding).path);
      return { revealed: true };
    });
  }
  async sessionPreview(input: { projectId: string; sessionId: string }, signal: AbortSignal = new AbortController().signal): Promise<SessionPreview> {
    if (!this.host.readSession) throw new WorkbaseError('unsupported', '当前宿主不支持会话预览');
    signal.throwIfAborted();
    return this.read(async (state, workspaces) => {
      const binding = this.writable(state, workspaces, input.projectId);
      const workspace = this.boundWorkspace(workspaces, binding);
      this.assertSessionInProject(state, workspace, input.projectId, input.sessionId);
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
      if (migrationTarget(state, binding.projectId))
        throw new WorkbaseError('migrated', '项目已迁入其他项目，请在目标项目查看迁移记录');
      if (input.archived && [...this.nativeSubmissionGuards.values()].some(guard => guard.projectId === binding.projectId))
        throw new WorkbaseError('busy', '原生输入仍在提交或结果未确认，请等待完成后再归档');
      binding.archived = input.archived;
      return { saved: true };
    });
  }
}
