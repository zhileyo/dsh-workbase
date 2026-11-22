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
  return workspaces.map(workspace => ({
    ...workspace,
    sessionIds: [...new Set([
      ...workspace.sessionIds.filter(id => !ids.has(id)),
      ...state.sessionOwnership.filter(owner => owner.workspaceId === workspace.workspaceId && owner.path === workspace.path
        && state.bindings.some(b => b.projectId === owner.projectId && b.workspaceId === workspace.workspaceId
          && b.path === workspace.path && !b.retired && !b.removed))
        .map(owner => owner.sessionId),
    ])],
  }));
}
