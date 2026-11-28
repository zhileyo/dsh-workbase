import { z } from 'zod';

export const diagnosticKind = z.enum(['directory', 'cache', 'orphan', 'empty']);
export type DiagnosticKind = z.infer<typeof diagnosticKind>;
export type DiagnosticRepairKind = Exclude<DiagnosticKind, 'directory'>;
export const diagnosticCandidate = z.object({
  sessionId: z.string().min(1).max(1024), identity: z.string().min(1).max(4096),
}).strict();
export type DiagnosticCandidate = z.infer<typeof diagnosticCandidate>;
export interface DiagnosticCheck {
  kind: DiagnosticKind; status: 'ok' | 'error' | 'unsupported'; message?: string;
}
/** 宿主诊断与工作台诊断共享的会话定位字段；各侧只补自己的附加字段。 */
export interface DiagnosticTarget {
  sessionId?: string; identity?: string; path: string;
  parentSessionId?: string; sizeBytes?: number;
}
export interface DiagnosticRepairCapability {
  cache: boolean; orphan: boolean; empty?: boolean;
}
export interface HostDiagnosticIssue extends DiagnosticTarget {
  kind: DiagnosticRepairKind; sessionId: string; identity: string;
}
export interface HostDiagnosis {
  checks: DiagnosticCheck[]; issues: HostDiagnosticIssue[]; repair: DiagnosticRepairCapability;
}
export interface DiagnosticIssue extends DiagnosticTarget {
  id: string; kind: DiagnosticKind; title: string; detail: string;
  projectId: string | null; projectTitle: string;
  /** 用户会话名称与固定诊断标题分开传递，显示翻译不处理用户数据。 */
  sessionTitle?: string;
  readOnly?: boolean;
}
export interface Diagnosis {
  checkedAt: number; checks: DiagnosticCheck[]; issues: DiagnosticIssue[]; repair: DiagnosticRepairCapability;
}
export const diagnosticRepairResult = z.object({
  succeeded: z.array(z.string()), skipped: z.array(z.string()),
  failures: z.array(z.object({ sessionId: z.string(), message: z.string() })),
});
export type DiagnosticRepairResult = z.infer<typeof diagnosticRepairResult>;
