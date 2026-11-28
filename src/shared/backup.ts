import { z } from 'zod';

export const backupPreferencesSchema = z.object({
  directory: z.string().max(4096).default(''),
  autoOnStartup: z.boolean().default(false),
  retentionDays: z.union([z.literal(0), z.literal(7), z.literal(14), z.literal(30)]).default(0),
}).strict().default(() => ({ directory: '', autoOnStartup: false, retentionDays: 0 as const }));
export const backupPreferencesPatchSchema = backupPreferencesSchema.removeDefault().extend({
  directory: z.string().max(4096).optional(),
  autoOnStartup: z.boolean().optional(),
  retentionDays: backupPreferencesSchema.removeDefault().shape.retentionDays.removeDefault().optional(),
});
export type BackupPreferences = z.infer<typeof backupPreferencesSchema>;
/** 备份阶段唯一清单：状态类型、读回校验与「进行中」判定都从这里派生。 */
export const backupPhases = ['idle', 'waiting', 'exporting', 'encrypting', 'verifying', 'completed', 'failed', 'interrupted'] as const;
export type BackupPhase = (typeof backupPhases)[number];
/** 阶段未结束时宿主退出，读回时按「上次任务中断」处理。 */
export const backupActivePhases: ReadonlySet<BackupPhase> = new Set<BackupPhase>([
  'waiting', 'exporting', 'encrypting', 'verifying',
]);
export const backupCoverageSchema = z.object({
  id: z.string().max(200), status: z.enum(['verified', 'observation', 'absent', 'unsupported', 'error']),
  message: z.string().max(10000), startedAt: z.number().finite(), completedAt: z.number().finite(),
}).strict();
export type BackupCoverage = z.infer<typeof backupCoverageSchema>;
export const backupManifestSchema = z.object({
  format: z.literal('dsh-workbase-online-backup'), version: z.literal(1), globalConsistency: z.literal(false),
  startedAt: z.number().finite(), completedAt: z.number().finite(),
  coverage: z.array(backupCoverageSchema).max(10000),
  files: z.array(z.object({
    path: z.string().min(1).max(4096), bytes: z.number().int().nonnegative().max(32 * 1024 ** 3),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).max(100000),
}).strict();
/** 清单类型由 schema 推出：恢复端校验与类型只有一份字段定义。 */
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export interface BackupStatus {
  id?: string;
  phase: BackupPhase;
  trigger?: 'manual' | 'startup';
  startedAt?: number;
  completedAt?: number;
  path?: string;
  keyPath?: string;
  message: string;
  coverage: BackupCoverage[];
}
export interface BackupPort {
  status(): Promise<BackupStatus>;
  start(trigger: 'manual' | 'startup'): Promise<BackupStatus>;
}
