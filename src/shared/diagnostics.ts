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
export interface HostDiagnosticIssue {
  kind: DiagnosticRepairKind; sessionId: string; identity: string; path: string;
  parentSessionId?: string; sizeBytes?: number;
}
export interface HostDiagnosis {
  checks: DiagnosticCheck[]; issues: HostDiagnosticIssue[];
  repair: { cache: boolean; orphan: boolean; empty?: boolean };
}
export interface DiagnosticIssue {
  id: string; kind: DiagnosticKind; title: string; detail: string;
  projectId: string | null; projectTitle: string; path: string;
  sessionId?: string; identity?: string; parentSessionId?: string; sizeBytes?: number;
  readOnly?: boolean;
}
export interface Diagnosis {
  checkedAt: number; checks: DiagnosticCheck[]; issues: DiagnosticIssue[];
  repair: { cache: boolean; orphan: boolean; empty?: boolean };
}
export const diagnosticRepairResult = z.object({
  succeeded: z.array(z.string()), skipped: z.array(z.string()),
  failures: z.array(z.object({ sessionId: z.string(), message: z.string() })),
});
export type DiagnosticRepairResult = z.infer<typeof diagnosticRepairResult>;
