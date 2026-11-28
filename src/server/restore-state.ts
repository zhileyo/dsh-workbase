import { stateSchema, type State, type HostWorkspace } from '../shared/model.js';
import { todoKey } from '../shared/todo.js';
import { migrationTarget } from './migration-ownership.js';

/**
 * 恢复投影：把备份里的状态映射到当前宿主与当前存储域的身份上，只产出 blocker 清单，
 * 不写任何状态。与 migration.ts 的预览同属「纯函数 + service 编排」的切分惯例，
 * 从 WorkbaseService 迁出以收窄单类聚合的业务线数量。
 */
export function restoredState(input: unknown, workspaces: HostWorkspace[], current: State) {
  const value = stateSchema.parse(input), blockers: string[] = [];
  const projects = new Set<string>(), todos = new Set<string>(), paths = new Set<string>();
  for (const binding of value.bindings) {
    if (projects.has(binding.projectId)) blockers.push('备份项目标识重复');
    projects.add(binding.projectId);
    if (binding.retired || binding.removed) continue;
    if (paths.has(binding.path)) blockers.push('备份存在重复的活跃项目目录');
    paths.add(binding.path);
    const matches = workspaces.filter(w => w.path === binding.path);
    if (matches.length === 0 && migrationTarget(value, binding.projectId)) {
      const retained = current.bindings.find(b => b.path === binding.path && !b.retired && !b.removed);
      if (retained) binding.workspaceId = retained.workspaceId;
    } else if (matches.length !== 1) blockers.push(`当前宿主没有唯一匹配项目：${binding.path}`);
    else binding.workspaceId = matches[0]!.workspaceId;
  }
  const todoProjects = new Map<string, Set<string>>();
  for (const todo of value.todos) {
    const pair = todoKey(todo.projectId, todo.id), peers = todoProjects.get(todo.id) ?? new Set<string>();
    const shared = value.migrations.some(record => record.status === 'reverted'
      && record.undo?.todos.some(item => item.id === todo.id && item.shared)
      && [record.source.projectId, record.target.projectId].includes(todo.projectId)
      && [...peers].every(id => [record.source.projectId, record.target.projectId].includes(id)));
    if (!projects.has(todo.projectId) || todos.has(pair) || (peers.size > 0 && !shared)) blockers.push('待办归属或标识不完整');
    todos.add(pair); peers.add(todo.projectId); todoProjects.set(todo.id, peers);
  }
  if (value.worktreeSessions.some(s => !projects.has(s.projectId))) blockers.push('工作树会话缺少项目归属');
  const owners = new Set<string>();
  for (const owner of value.sessionOwnership) {
    const binding = value.bindings.find(b => b.projectId === owner.projectId);
    if (owners.has(owner.sessionId) || !binding || binding.path !== owner.path)
      blockers.push('迁移会话归属或标识不完整');
    owners.add(owner.sessionId);
    if (!workspaces.some(w => w.sessionIds.includes(owner.sessionId))
      && !current.worktreeSessions.some(s => s.sessionId === owner.sessionId)
      && !current.sessionOwnership.some(s => s.sessionId === owner.sessionId))
      blockers.push('迁移会话无法与当前宿主核实');
    if (binding) owner.workspaceId = binding.workspaceId;
  }
  if (value.worktreeSessions.some(s => !current.worktreeSessions.some(c => c.sessionId === s.sessionId
    && current.bindings.find(b => b.projectId === c.projectId)?.path === value.bindings.find(b => b.projectId === s.projectId)?.path)))
    blockers.push('工作树会话无法与当前宿主的项目关联核实');
  // 独立Skills/MCP存储仍引用当前身份；按唯一目录保留身份，不改写扩展存储。
  const mapping = new Map<string, string>();
  for (const binding of current.bindings.filter(b => !b.retired && !b.removed)) {
    const matches = value.bindings.filter(b => !b.retired && !b.removed && b.path === binding.path);
    const peers = current.bindings.filter(b => !b.retired && !b.removed && b.path === binding.path);
    if (matches.length !== 1 || peers.length !== 1 || matches[0]!.archived !== binding.archived)
      blockers.push(`当前项目关联无法安全保留：${binding.path}`);
    else mapping.set(matches[0]!.projectId, binding.projectId);
  }
  for (const rule of current.preferences.rules.projects) for (const id of rule.projectIds)
    if (!current.bindings.some(b => b.projectId === id && !b.retired && !b.removed))
      blockers.push(`当前规则项目关联无法核实：${id}`);
  for (const binding of value.bindings) binding.projectId = mapping.get(binding.projectId) ?? binding.projectId;
  if (new Set(value.bindings.map(b => b.projectId)).size !== value.bindings.length)
    blockers.push('恢复项目关联映射后标识冲突');
  for (const todo of value.todos) todo.projectId = mapping.get(todo.projectId) ?? todo.projectId;
  for (const session of value.worktreeSessions) session.projectId = mapping.get(session.projectId) ?? session.projectId;
  for (const owner of value.sessionOwnership) owner.projectId = mapping.get(owner.projectId) ?? owner.projectId;
  for (const record of value.migrations) {
    for (const endpoint of [record.source, record.target]) if (endpoint.projectId) {
      endpoint.projectId = mapping.get(endpoint.projectId) ?? endpoint.projectId;
      const binding = value.bindings.find(b => b.projectId === endpoint.projectId && b.path === endpoint.path);
      if (binding) endpoint.workspaceId = binding.workspaceId;
    }
    for (const entity of record.entities) {
      entity.sourceProjectId = mapping.get(entity.sourceProjectId) ?? entity.sourceProjectId;
      entity.targetProjectId = mapping.get(entity.targetProjectId) ?? entity.targetProjectId;
    }
    for (const item of record.undo?.sessions ?? []) if (item.previous) {
      item.previous.projectId = mapping.get(item.previous.projectId) ?? item.previous.projectId;
      const binding = value.bindings.find(b => b.projectId === item.previous!.projectId && b.path === item.previous!.path);
      if (binding) item.previous.workspaceId = binding.workspaceId;
    }
  }
  value.projectMarks = Object.fromEntries(Object.entries(value.projectMarks).map(([id, mark]) => [mapping.get(id) ?? id, mark]));
  value.preferences.detail = Object.fromEntries(Object.entries(value.preferences.detail).map(([id, detail]) => [mapping.get(id) ?? id, detail]));
  if (value.preferences.selectedProject)
    value.preferences.selectedProject = mapping.get(value.preferences.selectedProject) ?? value.preferences.selectedProject;
  return { value, blockers: [...new Set(blockers)] };
}
