import { z } from 'zod';
import type { BackupCoverage } from './backup.js';

export const restoreInputSchema = z.object({
  archive: z.string().min(1).max(4096),
  keyPath: z.string().max(4096).default(''),
}).strict();
/** 恢复阶段唯一清单：状态类型、读回校验与「进行中／已定格」判定都从这里派生。 */
export const restorePhases = ['idle', 'checking', 'ready', 'restoring', 'completed', 'failed', 'interrupted'] as const;
export type RestorePhase = (typeof restorePhases)[number];
/** 读回旧状态时先确认阶段字面量在清单内，未知值按初始 idle 处理而不是被当成已完成。 */
export const isRestorePhase = (value: unknown): value is RestorePhase =>
  (restorePhases as readonly unknown[]).includes(value);
/** 阶段未结束时宿主退出，读回时按「上次恢复中断」处理。 */
export const restoreActivePhases: ReadonlySet<RestorePhase> = new Set<RestorePhase>(['checking', 'ready', 'restoring']);
/** 已经产生最终结果的阶段：读回时原样展示，不再改写为中断。 */
export const restoreSettledPhases: ReadonlySet<RestorePhase> = new Set<RestorePhase>(['completed', 'failed', 'interrupted']);
export interface RestoreStatus {
  phase: RestorePhase;
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
