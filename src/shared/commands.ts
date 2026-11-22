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
const todoId = z.string().min(1).max(200);
// 读取旧状态时需要默认值；增量更新不能让 Zod 4 给未提交字段填默认值。
const preferencesPatchSchema = preferencesSchema.extend({
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
  backup: backupPreferencesPatchSchema,
  navigation: preferencesSchema.shape.navigation.removeDefault(),
}).partial().strict();
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
  z.object({ op: z.literal('update'), projectId, id: todoId, expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(500).optional(), note: z.string().max(10000).optional(), done: z.boolean().optional(), priority: prioritySchema.optional() }).strict(),
  z.object({ op: z.literal('remove-todo-image'), projectId, id: todoId, expectedVersion: z.number().int().positive(), attachmentId: todoId }).strict(),
  z.object({ op: z.literal('remove-todo-attachment'), projectId, id: todoId, expectedVersion: z.number().int().positive(), attachmentId: todoId }).strict(),
  z.object({ op: z.literal('delete'), projectId, id: todoId, expectedVersion: z.number().int().positive() }).strict(),
  z.object({ op: z.literal('restore-deleted-todo'), projectId, token: todoId }).strict(),
  z.object({ op: z.literal('rename'), projectId, title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ op: z.literal('permission'), projectId, allowed: z.boolean() }).strict(),
  z.object({ op: z.literal('binding'), projectId, workspaceId: todoId, choice: z.enum(['restore', 'new']) }).strict(),
  z.object({ op: z.literal('mark'), projectId, sessionId: todoId.optional(), field: z.enum(['pinned', 'favorite']), value: z.boolean() }).strict(),
  z.object({ op: z.literal('preferences'), patch: preferencesPatchSchema,
    expectedRevision: z.number().int().nonnegative().optional() }).strict(),
  z.object({ op: z.literal('settings'), theme: preferencesSchema.shape.theme, permissions: z.record(projectId, z.boolean()),
    expectedRevision: z.number().int().nonnegative().optional(),
    options: z.object({ home: preferencesSchema.shape.home, root: preferencesSchema.shape.root,
      language: preferencesSchema.shape.language.removeDefault().optional(),
      projectInitialization: preferencesSchema.shape.projectInitialization.removeDefault().optional(),
      rules: preferencesSchema.shape.rules.removeDefault().optional(),
      expectedRules: preferencesSchema.shape.rules.removeDefault().optional(),
      extensionConfig: preferencesSchema.shape.extensionConfig.removeDefault().optional(),
      openOnStartup: preferencesSchema.shape.openOnStartup.removeDefault().optional(),
      agentManageTodos: preferencesSchema.shape.agentManageTodos.removeDefault().optional(),
      pluginUpdateVisible: preferencesSchema.shape.pluginUpdateVisible.removeDefault().optional(),
      pluginAutoUpdate: preferencesSchema.shape.pluginAutoUpdate.removeDefault().optional(),
      terminalSettingsVisible: preferencesSchema.shape.terminalSettingsVisible.removeDefault().optional(),
      speechComponentEnabled: preferencesSchema.shape.speechComponentEnabled.removeDefault().optional(),
      backup: backupPreferencesPatchSchema.optional(),
      navigation: preferencesSchema.shape.navigation.removeDefault().optional() }).strict().optional() }).strict(),
  z.object({ op: z.literal('rules-save'), rules: preferencesSchema.shape.rules.removeDefault(),
    expectedRevision: z.number().int().nonnegative().optional(),
    expectedRules: preferencesSchema.shape.rules.removeDefault() }).strict(),
  z.object({ op: z.literal('add-project'), path: z.string().max(4096), name: z.string().trim().min(1).max(200).optional(),
    initialization: projectInitializationSchema.optional() }).strict()
    .refine(value => value.initialization === undefined || value.name !== undefined, '初始化仅适用于创建新项目'),
  z.object({ op: z.literal('remove-project'), projectId }).strict(),
  z.object({ op: z.literal('search-sessions'), query: z.string().trim().min(1).max(500) }).strict(),
  z.object({ op: z.literal('launch-catalog') }).strict(),
  z.object({ op: z.literal('native-session-check'), workspaceId: todoId, sessionId: todoId.optional(), hold: z.boolean().optional() }).strict()
    .refine(value => !value.hold || !!value.sessionId, '提交保护需要会话标识'),
  z.object({ op: z.literal('native-session-release'), token: todoId }).strict(),
  z.object({ op: z.literal('begin-session'), projectId, preset: z.string().min(1).max(200),
    sessionId: todoId.optional(), requestId: z.string().uuid().optional() }).strict(),
  z.object({ op: z.literal('configure-session-model'), projectId, sessionId: todoId, provider: todoId, model: todoId }).strict(),
  z.object({ op: z.literal('submit-message'), projectId, sessionId: todoId, provider: todoId, model: todoId,
    text: z.string().min(1).max(20000).refine(text => text.trim().length > 0, '消息不能为空'), requestId: z.string().uuid() }).strict(),
  z.object({ op: z.literal('rename-session'), projectId, sessionId: todoId, title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ op: z.literal('delete-session'), projectId, sessionId: todoId }).strict(),
  z.object({ op: z.literal('reveal-directory'), projectId }).strict(),
  z.object({ op: z.literal('session-preview'), projectId, sessionId: todoId }).strict(),
  z.object({ op: z.literal('archive-project'), projectId, archived: z.boolean() }).strict(),
  z.object({ op: z.literal('git-branches'), projectId }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const RPC_CHANNEL = '/api';
export const RPC_ENDPOINT = 'workbase/dispatch';
export const EXTENSIONS_ENDPOINT = 'workbase/extensions';
export const ASSISTANT_ENDPOINT = 'workbase/assistant';
