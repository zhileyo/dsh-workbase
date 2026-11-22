import { z } from 'zod';

export const personalFiles = ['IDENTITY.md', 'USER.md', 'SOUL.md', 'MEMORY.md'] as const;
export const personalFileSchema = z.enum(personalFiles);
export type PersonalFile = z.infer<typeof personalFileSchema>;
export const personalDocumentSchema = z.object({
  file: personalFileSchema, content: z.string().max(20000), version: z.string().nullable(),
}).strict();
export type PersonalDocument = z.infer<typeof personalDocumentSchema>;
export interface PersonalCatalog { directory: string; active: boolean; documents: PersonalDocument[] }
export interface PersonalPort {
  list(signal?: AbortSignal): Promise<PersonalCatalog>;
  save(file: PersonalFile, version: string | null, content: string, signal?: AbortSignal): Promise<PersonalDocument>;
}
