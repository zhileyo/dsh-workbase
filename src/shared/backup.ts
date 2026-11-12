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
export interface BackupCoverage {
  id: string;
  status: 'verified' | 'observation' | 'absent' | 'unsupported' | 'error';
  message: string;
  startedAt: number;
  completedAt: number;
}
export interface BackupStatus {
  id?: string;
  phase: 'idle' | 'waiting' | 'exporting' | 'encrypting' | 'verifying' | 'completed' | 'failed' | 'interrupted';
  trigger?: 'manual' | 'startup';
  startedAt?: number;
  completedAt?: number;
  path?: string;
  keyPath?: string;
  message: string;
  coverage: BackupCoverage[];
}
export interface BackupManifest {
  format: 'dsh-workbase-online-backup';
  version: 1;
  globalConsistency: false;
  startedAt: number;
  completedAt: number;
  coverage: BackupCoverage[];
  files: { path: string; bytes: number; sha256: string }[];
}
export interface BackupPort {
  status(): Promise<BackupStatus>;
  start(trigger: 'manual' | 'startup'): Promise<BackupStatus>;
}
export const backupManifestSchema = z.object({
  format: z.literal('dsh-workbase-online-backup'), version: z.literal(1), globalConsistency: z.literal(false),
  startedAt: z.number().finite(), completedAt: z.number().finite(),
  coverage: z.array(z.object({
    id: z.string().max(200), status: z.enum(['verified', 'observation', 'absent', 'unsupported', 'error']),
    message: z.string().max(10000), startedAt: z.number().finite(), completedAt: z.number().finite(),
  }).strict()).max(10000),
  files: z.array(z.object({
    path: z.string().min(1).max(4096), bytes: z.number().int().nonnegative().max(32 * 1024 ** 3),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).max(100000),
}).strict();
