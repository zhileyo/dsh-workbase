import { WorkbaseError, type HostWorkspace, type State } from '../shared/model.js';

/** 完成回执就是源项目的移出状态；撤销同一回执即恢复，旧批次也自动适用。 */
export function migrationTarget(state: State, projectId: string): string | null {
  for (let i = state.migrations.length - 1; i >= 0; i--) {
    const record = state.migrations[i]!;
    if (record.kind === 'merge' && record.status === 'completed' && record.source.projectId === projectId
      && record.target.projectId && record.target.projectId !== projectId) return record.target.projectId;
  }
  return null;
}

/** 工作台自己的持久归属，区别于宿主按不可变 header.cwd 建立的历史目录索引。 */
export function projectWorkspaces(state: State, workspaces: HostWorkspace[]): HostWorkspace[] {
  const ids = new Set<string>();
  for (const owner of state.sessionOwnership) {
    if (ids.has(owner.sessionId)) throw new WorkbaseError('binding-conflict', '迁移会话归属重复');
    ids.add(owner.sessionId);
  }
  // 每个工作区都重扫全部归属与绑定是 O(工作区 × 归属 × 绑定)；先把有效绑定与归属各做成一次索引。
  const key = (item: { projectId: string; workspaceId: string; path: string }) =>
    `${item.projectId}\u0000${item.workspaceId}\u0000${item.path}`;
  const bindings = new Set(state.bindings.filter(b => !b.retired && !b.removed).map(key));
  const owned = new Map<string, string[]>();
  for (const owner of state.sessionOwnership) {
    if (!bindings.has(key(owner))) continue;
    const slot = owner.workspaceId + '\u0000' + owner.path;
    const listed = owned.get(slot);
    if (listed) listed.push(owner.sessionId);
    else owned.set(slot, [owner.sessionId]);
  }
  return workspaces.map(workspace => ({
    ...workspace,
    sessionIds: [...new Set([
      ...workspace.sessionIds.filter(id => !ids.has(id)),
      ...owned.get(workspace.workspaceId + '\u0000' + workspace.path) ?? [],
    ])],
  }));
}
