import type { GitBranches } from '../shared/model.js';
import { Icon, Picker } from './ui.js';

export interface BranchBarProps {
  /** 平台插件开关：@deepseek-ai/dsh-experimental-forge-bundle 是否已挂载 forgePanel。 */
  forge: boolean;
  branches: GitBranches | null;
  worktree: boolean;
  branch: string;
  busy: boolean;
  pending: boolean;
  projectPath?: string;
  onBranch(value: string): void;
  onWorktree(value: boolean): void;
}

/**
 * 输入卡下方的分支条：显隐只由平台插件开关（experimental-forge-bundle）决定，
 * 不再以“项目是 Git 仓库”为前提——否则非 Git 项目会把整个分支条吞掉。
 *
 * 右侧两枚控件逐项对齐宿主「新对话」输入行的官方实现
 * （@deepseek-ai/dsh-experimental-client-ui-forge 的 WorktreeToggle）：
 * - 分支位：未新建工作树时是 28px 紧凑 chip（分支图标 14px + 分支名），
 *   悬停提示「当前分支：x」；勾选后换成同规格的基准菜单触发器「基于 x」+ 折角箭头。
 * - 工作树位：原生 14px 复选框（品牌色 accent-color）+「新建工作树」文案，
 *   勾选即新建、取消勾选即撤销；创建/发送过程中置灰禁用并冻结基准。
 * 非 Git 项目降级为一行提示，不提供工作树开关。
 */
export function BranchBar({ forge, branches, worktree, branch, busy, pending, projectPath, onBranch, onWorktree }: BranchBarProps) {
  if (!forge) return null;
  const git = !!branches?.git;
  const worktreeOn = worktree && git;
  const frozen = busy || pending;
  const base = branch || branches?.current || '';
  const tip = !branches ? '正在读取项目分支' : git ? `当前分支：${branches.current}` : '当前项目目录不是 Git 仓库，没有分支信息';
  const options = branches && git
    ? branches.branches.map(name => ({ value: name, label: name, description: name === branches.current ? '当前分支' : undefined }))
    : [];
  return <div className="composer-branchbar">
    {worktreeOn
      ? <Picker variant="branch-base" label="选择基准分支" value={base} disabled={frozen} onChange={onBranch} title={projectPath}
          options={options} renderValue={selected => `基于 ${selected?.value ?? base}`}/>
      : <span className="forge-current" title={tip}>
          <Icon name="git" size={14}/>
          <span className="forge-label">{branches ? (git ? branches.current : '非 Git 项目') : '读取分支…'}</span>
        </span>}
    {git && <label className="forge-toggle" data-disabled={frozen ? 'true' : undefined}
      title={worktreeOn ? '取消新建工作树' : '在新工作树中开始'}>
      <input type="checkbox" className="forge-checkbox" checked={worktree} disabled={frozen} onChange={e => onWorktree(e.currentTarget.checked)}/>
      新建工作树
    </label>}
  </div>;
}
