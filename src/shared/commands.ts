import { z } from 'zod';
import { preferencesSchema } from './model.js';
import { diagnosticCandidate } from './diagnostics.js';
import { restoreInputSchema } from './restore.js';
import { backupPreferencesPatchSchema } from './backup.js';
import { prioritySchema } from './todo.js';
import { terminalPaletteSchema } from './terminal-palette.js';
import { projectInitializationSchema } from './project-initialization.js';
import { extensionModuleSchema } from './extensions.js';
import { personalFileSchema } from './personalization.js';
import { speechConfigSchema } from './speech.js';
const projectId = z.string().min(1).max(200);
// 持久标识（待办、会话、附件、工作区）与一次性访问令牌、模型名分开声明：
// 约束目前相同，但各自的演化边界不同，不能靠一个「待办 ID」名把三件事绑在一起。
const entityId = z.string().min(1).max(200);
const accessToken = z.string().min(1).max(200);
const modelName = z.string().min(1).max(200);
type PreferenceShape = typeof preferencesSchema.shape;
// 不参与增量补丁与设置选项的偏好：视图、筛选、详情展开由界面直接写入，backup 用补丁子 schema。
// 其余键都必须在 preferenceFields 登记：preferencesSchema 新增字段若漏登记，这里的 satisfies 会编译失败。
type DerivedPreferenceKey = Exclude<keyof PreferenceShape,
  'theme' | 'view' | 'layout' | 'selectedProject' | 'projectFilter' | 'detail' | 'backup'>;
/** 读取旧状态时需要默认值；增量更新不能让 Zod 4 给未提交字段填默认值，所以这里统一去掉字段默认值。 */
const preferenceFields = {
  language: preferencesSchema.shape.language.removeDefault(),
  home: preferencesSchema.shape.home.removeDefault(),
  fields: preferencesSchema.shape.fields.removeDefault(),
  root: preferencesSchema.shape.root.removeDefault(),
  projectInitialization: preferencesSchema.shape.projectInitialization.removeDefault(),
  rules: preferencesSchema.shape.rules.removeDefault(),
  extensionConfig: preferencesSchema.shape.extensionConfig.removeDefault(),
  openOnStartup: preferencesSchema.shape.openOnStartup.removeDefault(),
  agentManageTodos: preferencesSchema.shape.agentManageTodos.removeDefault(),
  pluginUpdateVisible: preferencesSchema.shape.pluginUpdateVisible.removeDefault(),
  pluginAutoUpdate: preferencesSchema.shape.pluginAutoUpdate.removeDefault(),
  terminalSettingsVisible: preferencesSchema.shape.terminalSettingsVisible.removeDefault(),
  speechComponentEnabled: preferencesSchema.shape.speechComponentEnabled.removeDefault(),
  terminalPalette: preferencesSchema.shape.terminalPalette.removeDefault(),
  navigation: preferencesSchema.shape.navigation.removeDefault(),
} satisfies Record<DerivedPreferenceKey, z.ZodType>;
const preferencesPatchSchema = z.object({
  ...preferenceFields,
  backup: backupPreferencesPatchSchema,
  // 无默认值、可整份替换的偏好：补丁里按原样接受。
  theme: preferencesSchema.shape.theme,
  view: preferencesSchema.shape.view,
  layout: preferencesSchema.shape.layout,
  selectedProject: preferencesSchema.shape.selectedProject,
  projectFilter: preferencesSchema.shape.projectFilter,
  detail: preferencesSchema.shape.detail,
}).partial().strict();
// 设置命令与偏好补丁共用上面那份字段表；home／root 在设置里是必填，其余仍可选。
const preferencesOptionsSchema = z.object({
  ...preferenceFields,
  backup: backupPreferencesPatchSchema,
  expectedRules: preferenceFields.rules.optional(),
}).partial().extend({ home: preferenceFields.home, root: preferenceFields.root }).strict();
export const commandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('speech-stream-text'), id: z.string().uuid(), seq: z.number().int().nonnegative(),
    text: z.string().max(12000), finish: z.boolean() }).strict(),
  z.object({ op: z.literal('speech-stream-cancel'), id: z.string().uuid() }).strict(),
  z.object({ op: z.literal('speech-status') }).strict(),
  z.object({ op: z.literal('speech-save'), version: z.string().max(500).nullable(), config: speechConfigSchema,
    key: z.string().max(4000).optional(), clearKey: z.boolean().optional() }).strict(),
  z.object({ op: z.literal('speech-synthesize'), text: z.string().trim().min(1).max(12000), manual: z.boolean().optional() }).strict(),
  z.object({ op: z.literal('personal-list') }).strict(),
  z.object({ op: z.literal('personal-save'), file: personalFileSchema,
    version: z.string().max(500).nullable(), content: z.string().max(20000) }).strict(),
  z.object({ op: z.literal('extensions'), module: extensionModuleSchema,
    method: z.string().min(1).max(80).regex(/^[a-z][a-zA-Z0-9.-]*$/), input: z.unknown().optional() }).strict(),
  z.object({ op: z.literal('snapshot') }).strict(),
  z.object({ op: z.literal('migration-preview'), projectId, directory: z.string().min(1).max(4096) }).strict(),
  z.object({ op: z.literal('migration-preview-project'), projectId, targetProjectId: projectId }).strict(),
  z.object({ op: z.literal('migration-confirm'), token: z.string().uuid() }).strict(),
  z.object({ op: z.literal('migration-discard'), token: z.string().uuid() }).strict(),
  z.object({ op: z.literal('migration-records'), projectId }).strict(),
  z.object({ op: z.literal('migration-undo'), id: z.string().min(1).max(200) }).strict(),
  z.object({ op: z.literal('terminal-catppuccin') }).strict(),
  z.object({ op: z.literal('terminal-palette'), expected: terminalPaletteSchema, value: terminalPaletteSchema }).strict(),
  z.object({ op: z.literal('backup-status') }).strict(),
  z.object({ op: z.literal('backup-start') }).strict(),
  z.object({ op: z.literal('backup-startup') }).strict(),
  z.object({ op: z.literal('restore-status') }).strict(),
  z.object({ op: z.literal('restore-catalog') }).strict(),
  restoreInputSchema.extend({ op: z.literal('restore-preview') }).strict(),
  z.object({ op: z.literal('restore-confirm'), token: z.string().uuid(), mode: z.enum(['workbase', 'directory']),
    directory: z.string().min(1).max(4096).optional() }).strict(),
  z.object({ op: z.literal('restore-discard'), token: z.string().uuid() }).strict(),
  z.object({ op: z.literal('diagnose') }).strict(),
  z.object({ op: z.literal('repair-diagnostics'), kind: z.enum(['cache', 'orphan', 'empty']),
    items: z.array(diagnosticCandidate).min(1).max(20) }).strict(),
  z.object({ op: z.literal('create'), projectId, title: z.string().trim().min(1).max(500), note: z.string().max(10000).optional(), priority: prioritySchema.optional() }).strict(),
  z.object({ op: z.literal('update'), projectId, id: entityId, expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(500).optional(), note: z.string().max(10000).optional(), done: z.boolean().optional(), priority: prioritySchema.optional() }).strict(),
  z.object({ op: z.literal('remove-todo-image'), projectId, id: entityId, expectedVersion: z.number().int().positive(), attachmentId: entityId }).strict(),
  z.object({ op: z.literal('remove-todo-attachment'), projectId, id: entityId, expectedVersion: z.number().int().positive(), attachmentId: entityId }).strict(),
  z.object({ op: z.literal('delete'), projectId, id: entityId, expectedVersion: z.number().int().positive() }).strict(),
  z.object({ op: z.literal('restore-deleted-todo'), projectId, token: accessToken }).strict(),
  z.object({ op: z.literal('rename'), projectId, title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ op: z.literal('permission'), projectId, allowed: z.boolean() }).strict(),
  z.object({ op: z.literal('binding'), projectId, workspaceId: entityId, choice: z.enum(['restore', 'new']) }).strict(),
  z.object({ op: z.literal('mark'), projectId, sessionId: entityId.optional(), field: z.enum(['pinned', 'favorite']), value: z.boolean() }).strict(),
  z.object({ op: z.literal('preferences'), patch: preferencesPatchSchema,
    expectedRevision: z.number().int().nonnegative().optional() }).strict(),
  z.object({ op: z.literal('settings'), theme: preferencesSchema.shape.theme, permissions: z.record(projectId, z.boolean()),
    expectedRevision: z.number().int().nonnegative().optional(),
    options: preferencesOptionsSchema.optional() }).strict(),
  z.object({ op: z.literal('rules-save'), rules: preferencesSchema.shape.rules.removeDefault(),
    expectedRevision: z.number().int().nonnegative().optional(),
    expectedRules: preferencesSchema.shape.rules.removeDefault() }).strict(),
  z.object({ op: z.literal('add-project'), path: z.string().max(4096), name: z.string().trim().min(1).max(200).optional(),
    initialization: projectInitializationSchema.optional() }).strict()
    .refine(value => value.initialization === undefined || value.name !== undefined, '初始化仅适用于创建新项目'),
  z.object({ op: z.literal('remove-project'), projectId }).strict(),
  z.object({ op: z.literal('search-sessions'), query: z.string().trim().min(1).max(500) }).strict(),
  z.object({ op: z.literal('launch-catalog') }).strict(),
  z.object({ op: z.literal('native-session-check'), workspaceId: entityId, sessionId: entityId.optional(), hold: z.boolean().optional() }).strict()
    .refine(value => !value.hold || !!value.sessionId, '提交保护需要会话标识'),
  z.object({ op: z.literal('native-session-release'), token: accessToken }).strict(),
  z.object({ op: z.literal('begin-session'), projectId, preset: z.string().min(1).max(200),
    sessionId: entityId.optional(), requestId: z.string().uuid().optional() }).strict(),
  z.object({ op: z.literal('configure-session-model'), projectId, sessionId: entityId, provider: modelName, model: modelName }).strict(),
  z.object({ op: z.literal('submit-message'), projectId, sessionId: entityId, provider: modelName, model: modelName,
    text: z.string().min(1).max(20000).refine(text => text.trim().length > 0, '消息不能为空'), requestId: z.string().uuid() }).strict(),
  z.object({ op: z.literal('rename-session'), projectId, sessionId: entityId, title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ op: z.literal('delete-session'), projectId, sessionId: entityId }).strict(),
  z.object({ op: z.literal('reveal-directory'), projectId }).strict(),
  z.object({ op: z.literal('session-preview'), projectId, sessionId: entityId }).strict(),
  z.object({ op: z.literal('archive-project'), projectId, archived: z.boolean() }).strict(),
  z.object({ op: z.literal('git-branches'), projectId }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const RPC_CHANNEL = '/api';
export const RPC_ENDPOINT = 'workbase/dispatch';
export const EXTENSIONS_ENDPOINT = 'workbase/extensions';
export const ASSISTANT_ENDPOINT = 'workbase/assistant';
