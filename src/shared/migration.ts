import { z } from 'zod';

export const MIGRATION_UNDO_MS = 72 * 60 * 60 * 1000;
export const MIGRATION_PREVIEW_MS = 10 * 60 * 1000;
export const MIGRATION_UNAVAILABLE = '当前宿主未提供安全迁移事务，暂不能执行迁移';
export const MIGRATION_SOURCE_MISSING = '源项目目录已不存在；保留的会话与待办仍参与预览。';
const identity = z.object({
  projectId: z.string().nullable(), workspaceId: z.string().nullable(),
  title: z.string(), path: z.string(),
}).strict();
export const sessionOwnershipSchema = z.object({
  sessionId: z.string(), projectId: z.string(), workspaceId: z.string(), path: z.string(),
}).strict();
/** 只接受已完成的持久事务；预览不是迁移记录。undo缺失的旧记录保持只读。 */
export const migrationRecordSchema = z.object({
  id: z.string().min(1), kind: z.enum(['directory', 'merge']),
  source: identity, target: identity,
  status: z.enum(['completed', 'reverted']),
  completedAt: z.number().nonnegative(), undoUntil: z.number().nonnegative(),
  revertedAt: z.number().nonnegative().nullable(),
  entities: z.array(z.object({
    kind: z.enum(['session', 'todo']), id: z.string(),
    sourceProjectId: z.string(), targetProjectId: z.string(),
  }).strict()),
  undo: z.object({
    version: z.literal(1),
    sessions: z.array(z.object({ sessionId: z.string(), previous: sessionOwnershipSchema.nullable() }).strict()),
    todos: z.array(z.object({ id: z.string(), shared: z.boolean() }).strict()),
    sourceSettings: z.object({
      agentCanChangeStatus: z.boolean(),
      detail: z.object({ ratio: z.number(), group: z.enum(['pending', 'done']),
        sessionFilter: z.enum(['active', 'archived', 'favorite']) }).nullable(),
      mark: z.object({ pinned: z.boolean(), favorite: z.boolean() }).nullable(),
    }).strict(),
  }).strict().optional(),
}).strict().refine(record => record.undoUntil >= record.completedAt
  && record.undoUntil <= record.completedAt + MIGRATION_UNDO_MS
  && (record.status === 'reverted' ? record.revertedAt !== null : record.revertedAt === null),
'迁移记录的完成状态或撤销期限无效');
export type MigrationRecord = z.infer<typeof migrationRecordSchema>;
export interface MigrationCounts { active: number; archived: number; pending: number; done: number }
export interface MigrationIdentity {
  projectId: string | null; workspaceId: string | null; title: string; path: string;
}
export interface MigrationPreview {
  token: string; expiresAt: number; revision: number; kind: 'directory' | 'merge';
  source: MigrationIdentity & { counts: MigrationCounts };
  target: MigrationIdentity & { counts: MigrationCounts };
  /** 只读说明与按实体ID去重后的结果；可选以兼容旧客户端预览。 */
  notices?: string[]; resultCounts?: MigrationCounts;
  blockers: string[]; executable: boolean;
}
export type MigrationRecordView = MigrationRecord & { expired: boolean; canUndo: boolean };
