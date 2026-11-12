import { z } from 'zod';
import { preferencesSchema } from './model.js';
import { diagnosticCandidate } from './diagnostics.js';
import { restoreInputSchema } from './restore.js';
import { backupPreferencesPatchSchema } from './backup.js';
import { prioritySchema } from './todo.js';
const projectId = z.string().min(1).max(200);
const todoId = z.string().min(1).max(200);
// 读取旧状态时需要默认值；增量更新不能让 Zod 4 给未提交字段填默认值。
const preferencesPatchSchema = preferencesSchema.extend({
  home: preferencesSchema.shape.home.removeDefault(),
  fields: preferencesSchema.shape.fields.removeDefault(),
  root: preferencesSchema.shape.root.removeDefault(),
  openOnStartup: preferencesSchema.shape.openOnStartup.removeDefault(),
  agentManageTodos: preferencesSchema.shape.agentManageTodos.removeDefault(),
  pluginUpdateVisible: preferencesSchema.shape.pluginUpdateVisible.removeDefault(),
  pluginAutoUpdate: preferencesSchema.shape.pluginAutoUpdate.removeDefault(),
  backup: backupPreferencesPatchSchema,
  navigation: preferencesSchema.shape.navigation.removeDefault(),
}).partial().strict();
export const commandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('snapshot') }).strict(),
  z.object({ op: z.literal('backup-status') }).strict(),
  z.object({ op: z.literal('backup-start') }).strict(),
  z.object({ op: z.literal('backup-startup') }).strict(),
  z.object({ op: z.literal('restore-status') }).strict(),
  z.object({ op: z.literal('restore-catalog') }).strict(),
  restoreInputSchema.extend({ op: z.literal('restore-preview') }).strict(),
  z.object({ op: z.literal('restore-confirm'), token: z.string().uuid(), mode: z.enum(['workbase', 'directory']),
    directory: z.string().min(1).max(4096).optional() }).strict(),
  z.object({ op: z.literal('restore-discard'), token: z.string().uuid() }).strict(),
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
  z.object({ op: z.literal('preferences'), patch: preferencesPatchSchema }).strict(),
  z.object({ op: z.literal('settings'), theme: preferencesSchema.shape.theme, permissions: z.record(projectId, z.boolean()),
    options: z.object({ home: preferencesSchema.shape.home, root: preferencesSchema.shape.root,
      openOnStartup: preferencesSchema.shape.openOnStartup.removeDefault().optional(),
      agentManageTodos: preferencesSchema.shape.agentManageTodos.removeDefault().optional(),
      pluginUpdateVisible: preferencesSchema.shape.pluginUpdateVisible.removeDefault().optional(),
      pluginAutoUpdate: preferencesSchema.shape.pluginAutoUpdate.removeDefault().optional(),
      backup: backupPreferencesPatchSchema.optional(),
      navigation: preferencesSchema.shape.navigation.removeDefault().optional() }).strict().optional() }).strict(),
  z.object({ op: z.literal('add-project'), path: z.string().max(4096), name: z.string().trim().min(1).max(200).optional() }).strict(),
  z.object({ op: z.literal('remove-project'), projectId }).strict(),
  z.object({ op: z.literal('search-sessions'), query: z.string().trim().min(1).max(500) }).strict(),
  z.object({ op: z.literal('launch-catalog') }).strict(),
  z.object({ op: z.literal('begin-session'), projectId, preset: z.string().min(1).max(200) }).strict(),
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
