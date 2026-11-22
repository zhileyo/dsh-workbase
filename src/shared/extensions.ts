import { z } from 'zod';

export const extensionModuleSchema = z.enum(['skills', 'mcp', 'rss']);
export type ExtensionModule = z.infer<typeof extensionModuleSchema>;
export const extensionConfigSchema = z.object({
  skills: z.object({
    defaultSourceId: z.string().max(200).default(''),
    defaultEnabled: z.boolean().default(true),
  }).strict().default(() => ({ defaultSourceId: '', defaultEnabled: true })),
  mcp: z.object({
    injection: z.enum(['always', 'session']).default('always'),
    timeoutSeconds: z.number().int().min(1).max(300).default(30),
    autoReconnect: z.boolean().default(true),
  }).strict().default(() => ({ injection: 'always' as const, timeoutSeconds: 30, autoReconnect: true })),
  rss: z.object({
    refreshMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]).default(0),
  }).strict().default(() => ({ refreshMinutes: 0 as const })),
}).strict();
export type ExtensionConfig = z.infer<typeof extensionConfigSchema>;
export const defaultExtensionConfig = (): ExtensionConfig => extensionConfigSchema.parse({});
export interface ExtensionsPort {
  handle(module: ExtensionModule, method: string, input: unknown, signal: AbortSignal): Promise<unknown>;
}
