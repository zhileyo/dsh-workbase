import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute } from 'node:path';
import { WorkbaseError, type State, type HostWorkspace, type HostSession, type Binding } from '../shared/model.js';
import { MIGRATION_UNAVAILABLE, MIGRATION_SOURCE_MISSING, MIGRATION_UNDO_ACTIVE, MIGRATION_PREVIEW_MS, type MigrationPreview, type MigrationCounts } from '../shared/migration.js';
import { migrationTarget } from './migration-ownership.js';

export async function migrationPreview(state: State, workspaces: HostWorkspace[], sessions: HostSession[],
  input: { projectId: string; directory: string }, token: string, now: number, signal: AbortSignal): Promise<MigrationPreview> {
  signal.throwIfAborted();
  if (!isAbsolute(input.directory)) throw new WorkbaseError('invalid', '请输入目标目录的绝对路径');
  let directory: string;
  try {
    directory = await realpath(input.directory);
    if (!(await stat(directory)).isDirectory()) throw new Error('not a directory');
    await access(directory, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch { throw new WorkbaseError('directory-unavailable', '目标目录不可用或不可写'); }
  signal.throwIfAborted();
  const source = state.bindings.find(b => b.projectId === input.projectId);
  if (!source) throw new WorkbaseError('not-found', '项目不存在');
  if (migrationTarget(state, source.projectId))
    throw new WorkbaseError('migrated', '项目已迁入其他项目，请在目标项目查看迁移记录');
  // 只有明确的ENOENT可以降级成字面量比较（目录本来就不存在）；权限拒绝、符号链接环、
  // 非目录等错误必须阻断，否则同一个真实目录会被判成不同目录而放行迁移。
  const blockers: string[] = [];
  let unresolved = false;
  const canonical = async (path: string) => {
    try { return await realpath(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path;
      unresolved = true;
      return path;
    }
  };
  const listed = [...new Set([...state.bindings.map(b => b.path), ...workspaces.map(w => w.path), ...state.pendingImports.map(p => p.path)])];
  // 每个路径一次 realpath，逐个等会让预览随项目数线性变慢；并行解析后仍按原顺序建表。
  const resolvedPaths = await Promise.all(listed.map(canonical));
  const paths = new Map(listed.map((path, index) => [path, resolvedPaths[index]!]));
  signal.throwIfAborted();
  if (unresolved) blockers.push('目录或路径无法核实');
  const candidates = state.bindings.filter(b => paths.get(b.path) === directory);
  const targets = candidates.filter(b => b.projectId !== source.projectId);
  const target = targets[0];
  const peers = workspaces.filter(w => paths.get(w.path) === directory);
  // 目标目录没有已登记项目：阻断语义与能力缺失不同，但文案暂与 MIGRATION_UNAVAILABLE
  // 共用（test/migration.test.ts:40 按原文断言）；测试解禁后此处应换成独立的文案常量。
  const targetMissingBlocker = MIGRATION_UNAVAILABLE;
  if (!target) blockers.push(targetMissingBlocker);
  const notices: string[] = [];
  const check = async (binding: Binding, label: string, isSource = false) => {
    if (migrationTarget(state, binding.projectId)) blockers.push(`${label}已迁入其他项目`);
    if (binding.archived) blockers.push(`${label}已归档`);
    if (binding.removed || binding.retired) blockers.push(`${label}已移除或关联失效`);
    const matching = workspaces.filter(w => w.workspaceId === binding.workspaceId && paths.get(w.path) === paths.get(binding.path));
    if (matching.length !== 1) { blockers.push(`${label}目录不可用或关联失效`); return; }
    if (!matching[0]!.available) {
      // 预览只读取已持久化的身份与内容，不要求已丢失的源目录重新存在。
      // 仅接受明确的ENOENT；权限拒绝、非目录、未知错误仍然阻断。
      let missing = false;
      if (isSource && !binding.removed && !binding.retired) {
        try { await stat(binding.path); }
        catch (error) { missing = (error as NodeJS.ErrnoException).code === 'ENOENT'; }
      }
      if (missing) notices.push(MIGRATION_SOURCE_MISSING);
      else blockers.push(`${label}目录不可用或关联失效`);
    }
  };
  await check(source, '源项目', true);
  if (target) await check(target, '目标项目');
  signal.throwIfAborted();
  if (paths.get(source.path) === directory) blockers.push('目标目录与原目录相同');
  if (targets.length > 1 || peers.length > 1 || candidates.some(b => b.removed || b.retired)
    || peers.some(w => !target || w.workspaceId !== target.workspaceId)
    || state.pendingImports.some(p => paths.get(p.path) === directory)) blockers.push('目标目录存在未解决的项目关联或占用');
  if (state.bindings.filter(b => b.projectId === source.projectId || b.workspaceId === source.workspaceId
    || paths.get(b.path) === paths.get(source.path)).length !== 1) blockers.push('源项目身份存在冲突');
  if (target && state.bindings.filter(b => b.projectId === target.projectId || b.workspaceId === target.workspaceId).length !== 1)
    blockers.push('目标项目身份存在冲突');
  const ids = (binding: Binding | undefined) => new Set(binding ? [
    ...(workspaces.find(w => w.workspaceId === binding.workspaceId)?.sessionIds ?? []),
    ...state.worktreeSessions.filter(s => s.projectId === binding.projectId).map(s => s.sessionId),
  ] : []);
  const sourceIds = ids(source), targetIds = ids(target);
  if (sessions.some(s => s.running && (sourceIds.has(s.sessionId) || targetIds.has(s.sessionId))))
    blockers.push('项目存在运行中的会话');
  if ([...sourceIds, ...targetIds].some(id => sessions.filter(s => s.sessionId === id).length !== 1))
    blockers.push('会话身份或状态无法核实');
  if ([...sourceIds].some(id => targetIds.has(id))) blockers.push('会话归属存在冲突');
  const todoIds = new Map<string, string>();
  for (const todo of state.todos.filter(t => t.projectId === source.projectId || t.projectId === target?.projectId)) {
    const { projectId: _projectId, ...content } = todo;
    const serialized = JSON.stringify(content);
    if (todoIds.has(todo.id) && todoIds.get(todo.id) !== serialized) blockers.push('待办身份存在冲突');
    todoIds.set(todo.id, serialized);
  }
  const undoBlockers: NonNullable<MigrationPreview['undoBlockers']> = [];
  for (const record of state.migrations) {
    if (record.status !== 'completed' || now >= record.undoUntil
      || ![record.source.projectId, record.target.projectId].some(id => id === source.projectId || (target && id === target.projectId))) continue;
    blockers.push(MIGRATION_UNDO_ACTIVE);
    undoBlockers.push({ id: record.id, sourceTitle: record.source.title, targetTitle: record.target.title, undoUntil: record.undoUntil });
  }
  const counts = (binding: Binding | undefined, sessionIds: Set<string>): MigrationCounts => {
    const selected = sessions.filter(s => sessionIds.has(s.sessionId));
    const todos = binding ? state.todos.filter(t => t.projectId === binding.projectId) : [];
    return { active: selected.filter(s => !s.archived).length, archived: selected.filter(s => s.archived).length,
      pending: todos.filter(t => !t.done).length, done: todos.filter(t => t.done).length };
  };
  const workspace = workspaces.find(w => w.workspaceId === source.workspaceId);
  const resultSessions = [...new Map(sessions.filter(s => sourceIds.has(s.sessionId) || targetIds.has(s.sessionId))
    .map(session => [session.sessionId, session])).values()];
  const resultTodos = [...new Map(state.todos.filter(t => t.projectId === source.projectId || t.projectId === target?.projectId)
    .map(todo => [todo.id, todo])).values()];
  const resultCounts: MigrationCounts = { active: resultSessions.filter(s => !s.archived).length,
    archived: resultSessions.filter(s => s.archived).length, pending: resultTodos.filter(t => !t.done).length,
    done: resultTodos.filter(t => t.done).length };
  return {
    token, expiresAt: now + MIGRATION_PREVIEW_MS, revision: state.revision, kind: target ? 'merge' : 'directory',
    source: { projectId: source.projectId, workspaceId: source.workspaceId, title: workspace?.title ?? source.projectId,
      path: source.path, counts: counts(source, sourceIds) },
    target: { projectId: target?.projectId ?? null, workspaceId: target?.workspaceId ?? null,
      title: peers[0]?.title ?? workspace?.title ?? source.projectId, path: directory, counts: counts(target, targetIds) },
    notices, resultCounts, blockers: [...new Set(blockers)], undoBlockers, executable: blockers.length === 0,
  };
}
