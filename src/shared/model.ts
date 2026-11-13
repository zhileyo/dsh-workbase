import { z } from 'zod';
import type { Diagnosis } from './diagnostics.js';
import { backupPreferencesSchema } from './backup.js';
import { terminalPaletteSchema, defaultTerminalPalette } from './terminal-palette.js';
import { prioritySchema, todoImageSchema, todoAttachmentSchema, MAX_TODO_IMAGES } from './todo.js';

export const markSchema = z.object({ pinned: z.boolean(), favorite: z.boolean() }).strict();
export const todoSchema = z.object({
  id: z.string(), projectId: z.string(), title: z.string().trim().min(1).max(500),
  note: z.string().max(10000), done: z.boolean(), creator: z.enum(['user', 'agent']),
  createdAt: z.number(), updatedAt: z.number(), completedAt: z.number().nullable(),
  version: z.number().int().positive(),
  priority: prioritySchema.default(null),
  images: z.array(todoImageSchema).max(MAX_TODO_IMAGES).default([]),
  attachments: z.array(todoAttachmentSchema).max(MAX_TODO_IMAGES).default([]),
}).strict();
export const bindingSchema = z.object({
  projectId: z.string(), workspaceId: z.string(), path: z.string(),
  // 外部注册消失保留身份，不能仅凭路径静默复用。
  retired: z.boolean(), agentCanChangeStatus: z.boolean(),
  removed: z.boolean().default(false),
  // 插件级归档：宿主暂无项目归档接口，归档为业务只读标志，会话保持归档时的状态。
  archived: z.boolean().default(false),
}).strict();
export const fieldsSchema = z.object({
  directory: z.boolean(), activity: z.boolean(), status: z.boolean(),
  active: z.boolean(), todos: z.boolean(), archived: z.boolean(), recent: z.boolean(),
}).strict();
export const defaultFields = (view: 'grid' | 'list') => ({
  directory: true, activity: true, status: view === 'list', active: true,
  todos: true, archived: true, recent: view === 'grid',
});
export const statCardsSchema = z.object({
  running: z.boolean(), recent: z.boolean(), pending: z.boolean(), diagnostic: z.boolean(),
}).strict().default(() => ({ running: true, recent: true, pending: true, diagnostic: true }));
export const defaultStatCards = () => ({ running: true, recent: true, pending: true, diagnostic: true });
export const homeSchema = z.object({
  quick: z.boolean(), recent: z.boolean(), stats: z.boolean(), projects: z.boolean(),
  recentStyle: z.enum(['cards', 'buttons']),
  statCards: statCardsSchema,
  // 「会话」统计卡与「近期活跃」的统计窗口天数。
  statDays: z.number().int().min(1).max(365).default(7),
}).strict();
export const defaultHome = () => ({ quick: true, recent: false, stats: true, projects: true, recentStyle: 'cards' as const, statCards: defaultStatCards(), statDays: 7 });
export const navigationSchema = z.object({
  sidebarName: z.string().trim().min(1).max(30),
  sidebarVisible: z.boolean(), headerButtonVisible: z.boolean(),
  // 正数为顺序前三项，负数为倒序前三项；旧4–9序位兼容收敛到3。
  sidebarPosition: z.number().int().min(-3).max(9).refine(value => value !== 0)
    .transform(value => value > 3 ? 3 : value).default(2),
}).strict();
// 0.2.8 及更早允许把两个入口同时关闭，工作台会因此不可进入；持久化与命令中的双关状态自动恢复侧边栏入口。
const healNavigation = (value: unknown) => {
  if (typeof value !== 'object' || value === null) return value;
  const n = value as { sidebarVisible?: boolean; headerButtonVisible?: boolean };
  return !n.sidebarVisible && !n.headerButtonVisible ? { ...(value as object), sidebarVisible: true } : value;
};
const navigationInput = z.preprocess(healNavigation, navigationSchema);
export const defaultNavigation = () => ({ sidebarName: '项目概览', sidebarVisible: true, headerButtonVisible: true, sidebarPosition: 2 });
export const preferencesSchema = z.object({
  language: z.enum(['follow', 'zh', 'en']).default('follow'),
  theme: z.enum(['follow', 'dsh', 'fresh', 'warm', 'violet']),
  view: z.enum(['grid', 'list']), layout: z.enum(['list', 'cards']),
  selectedProject: z.string().nullable(), projectFilter: z.enum(['active', 'archived', 'favorite']),
  home: homeSchema.default(defaultHome),
  fields: z.object({ grid: fieldsSchema, list: fieldsSchema }).strict()
    .default(() => ({ grid: defaultFields('grid'), list: defaultFields('list') })),
  root: z.string().max(4096).default(''),
  openOnStartup: z.boolean().default(false),
  agentManageTodos: z.boolean().default(true),
  pluginUpdateVisible: z.boolean().default(true),
  pluginAutoUpdate: z.boolean().default(false),
  terminalSettingsVisible: z.boolean().default(false),
  terminalPalette: terminalPaletteSchema.default(defaultTerminalPalette),
  backup: backupPreferencesSchema,
  navigation: navigationInput.default(defaultNavigation),
  detail: z.record(z.string(), z.object({
    ratio: z.number().min(40).max(70), group: z.enum(['pending', 'done']),
    sessionFilter: z.enum(['active', 'archived', 'favorite']),
  }).strict()),
  // 这里不加 .strict()：整份 global 由宿主按本 schema 校验后才会激活插件，
  // 旧版本或外来写入留下的未知偏好键（实测遇到过 `extras`）会让整个插件启用失败。
  // 默认的 strip 行为丢弃这些键，RPC 侧仍由 commands.ts 的 preferencesPatchSchema 严格校验。
});
export const stateSchema = z.object({
  revision: z.number().int().nonnegative(),
  bindings: z.array(bindingSchema), todos: z.array(todoSchema),
  // 经「新建工作树」在项目目录之外创建的会话：登记归属，使其可提交消息与预览。
  worktreeSessions: z.array(z.object({ sessionId: z.string(), projectId: z.string() }).strict()).default([]),
  projectMarks: z.record(z.string(), markSchema),
  sessionMarks: z.record(z.string(), markSchema),
  preferences: preferencesSchema,
}).strict();
export type Todo = z.infer<typeof todoSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type State = z.infer<typeof stateSchema>;
export type Mark = z.infer<typeof markSchema>;
export const emptyMark = (): Mark => ({ pinned: false, favorite: false });
export const defaultDetail = () => ({ ratio: 65, group: 'pending' as const, sessionFilter: 'active' as const });
export const initialState = (): State => ({
  revision: 0, bindings: [], todos: [], worktreeSessions: [], projectMarks: {}, sessionMarks: {},
  preferences: { theme: 'follow', view: 'grid', layout: 'list', selectedProject: null, projectFilter: 'active', detail: {},
    language: 'follow', home: defaultHome(), fields: { grid: defaultFields('grid'), list: defaultFields('list') }, root: '', openOnStartup: false, agentManageTodos: true, pluginUpdateVisible: true, pluginAutoUpdate: false, terminalSettingsVisible: false, terminalPalette: defaultTerminalPalette(), backup: { directory: '', autoOnStartup: false, retentionDays: 0 }, navigation: defaultNavigation() },
});
export interface HostWorkspace {
  workspaceId: string; path: string; title: string; available: boolean; sessionIds: readonly string[];
}
export interface HostSession {
  sessionId: string; title: string; updatedAt: number; archived: boolean; running: boolean;
}
export interface SessionSearchStatus {
  enabled: boolean;
  showDependency: boolean;
}
export interface SessionSearch {
  items: { sessionId: string; snippet: string }[];
  hasMore: boolean;
}
export interface SessionPreviewMessage {
  seq: number; role: 'user' | 'assistant'; text: string; time: number;
}
export interface SessionPreview {
  title: string; projectName: string;
  running: boolean; archived: boolean;
  updatedAt: number;
  hasEarlier: boolean; messages: SessionPreviewMessage[];
}
export interface LaunchCatalog {
  presets: { id: string; name: string; description?: string; builtIn?: boolean; requiresCodingTools?: boolean; isDefault: boolean; broken?: string }[];
  models: { provider: string; id: string; name: string; providerName: string }[];
  defaultModel: { provider: string; model: string };
  failures: { name: string; message: string }[];
}
export interface GitBranches {
  git: boolean; current: string; branches: string[];
}
export interface Project extends HostWorkspace {
  projectId: string; sessions: HostSession[]; todos: Todo[]; mark: Mark;
  agentCanChangeStatus: boolean; updatedAt: number; archived: boolean;
}
export interface BindingConflict { projectId: string; workspaceId: string; path: string; title: string }
export interface Snapshot {
  revision: number; projects: Project[]; conflicts: BindingConflict[];
  preferences: Preferences; sessionMarks: Record<string, Mark>; syncedAt: number;
  diagnostics?: Diagnosis;
  sessionSearch?: SessionSearchStatus;
}
export type Actor = { kind: 'user' } | { kind: 'agent'; workspaceId: string };
export const userActor: Actor = { kind: 'user' };
export class WorkbaseError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
