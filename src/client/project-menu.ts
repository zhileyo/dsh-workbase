import type { Project } from '../shared/model.js';

/** 项目操作菜单条目；字段与 ui.tsx 的 Menu 接受的条目一一对应。 */
export interface ProjectMenuItem {
  label: string;
  action(): void;
  danger?: boolean;
  separatorBefore?: boolean;
}

/**
 * 项目菜单的动作集合：视图只提供自己有哪些动作，条目的文案、顺序与分隔由此模块统一决定。
 * 首页没有「复制路径」，因此不传 copyPath；两个视图打开目录失败时的提示文案不同，由各自的实现提供。
 */
export interface ProjectMenuActions {
  favorite(project: Project, value: boolean): void;
  openDirectory(project: Project): void;
  rename(project: Project): void;
  removeProject(project: Project): void;
  archive(project: Project, archived: boolean): void;
  migration?(project: Project, records: boolean): void;
  copyPath?(project: Project): void;
}

/** 归档与未归档两套条目只在这里定义：条目文案、顺序与危险态不再由视图各自维护。 */
export function projectMenuItems(project: Project, actions: ProjectMenuActions): ProjectMenuItem[] {
  const favorite: ProjectMenuItem = {
    label: project.mark.favorite ? '取消收藏' : '收藏项目',
    action: () => actions.favorite(project, !project.mark.favorite),
  };
  const openDirectory: ProjectMenuItem = { label: '打开目录', action: () => actions.openDirectory(project) };
  const copyPath: ProjectMenuItem[] = actions.copyPath ? [{ label: '复制路径', action: () => actions.copyPath?.(project) }] : [];
  if (project.archived) return [
    favorite, openDirectory, ...copyPath,
    { label: '恢复项目', action: () => actions.archive(project, false) },
  ];
  return [
    { label: '重命名', action: () => actions.rename(project) },
    favorite,
    openDirectory,
    ...copyPath,
    { label: '项目迁移', separatorBefore: true, action: () => actions.migration?.(project, false) },
    { label: '迁移记录', action: () => actions.migration?.(project, true) },
    { label: '归档项目', action: () => actions.archive(project, true) },
    { label: '移除项目', action: () => actions.removeProject(project), danger: true },
  ];
}
