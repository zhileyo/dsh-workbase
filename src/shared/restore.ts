import { z } from 'zod';
import type { BackupCoverage } from './backup.js';

export const restoreInputSchema = z.object({
  archive: z.string().min(1).max(4096),
  keyPath: z.string().max(4096).default(''),
}).strict();
export interface RestoreStatus {
  phase: 'idle' | 'checking' | 'ready' | 'restoring' | 'completed' | 'failed' | 'interrupted';
  message: string;
  preview?: {
    token: string; archive: string; createdAt: number; expiresAt: number;
    files: number; bytes: number; todos: number; projects: number;
    revision: number; workbaseBlockers: string[]; coverage: BackupCoverage[];
  };
  result?: { mode: 'workbase' | 'directory'; path: string; completedAt: number; revision?: number };
}
export interface RestorePort {
  catalog(): Promise<RestoreArchive[]>;
  status(): Promise<RestoreStatus>;
  preview(input: z.infer<typeof restoreInputSchema>): Promise<RestoreStatus>;
  confirm(input: { token: string; mode: 'workbase' | 'directory'; directory?: string }): Promise<RestoreStatus>;
  discard(token: string): Promise<RestoreStatus>;
}
export interface RestoreArchive { path: string; name: string; bytes: number; modifiedAt: number; rollback: boolean }
