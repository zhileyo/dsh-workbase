import { z } from 'zod';

export const prioritySchema = z.enum(['high', 'medium', 'low']).nullable();
export const priorityLabels = { high: '高', medium: '中', low: '低' };
export const MAX_TODO_IMAGES = 10;
export const MAX_TODO_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TODO_ATTACHMENTS = MAX_TODO_IMAGES;
export const MAX_TODO_ATTACHMENT_BYTES = MAX_TODO_IMAGE_BYTES;
/** 文件原样存储；MIME 仅供展示，不作为格式准入条件。 */
export const todoAttachmentSchema = z.object({
  attachmentId: z.string().min(1).max(200),
  name: z.string().min(1).max(500).refine(value => !/[\\/\u0000-\u001f\u007f]/.test(value), '文件名不能包含路径或控制字符'),
  mediaType: z.string().max(200).regex(/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/),
  bytes: z.number().int().nonnegative().max(MAX_TODO_ATTACHMENT_BYTES),
}).strict();
export type TodoAttachment = z.infer<typeof todoAttachmentSchema>;
export function todoAttachments(todo: { images: TodoImage[]; attachments?: TodoAttachment[] }) {
  return [...todo.images, ...(todo.attachments ?? [])];
}
export const todoImageSchema = z.object({
  attachmentId: z.string().min(1).max(200),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  bytes: z.number().int().positive().max(MAX_TODO_IMAGE_BYTES),
  width: z.number().int().positive(), height: z.number().int().positive(),
}).strict();
export type TodoImage = z.infer<typeof todoImageSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export const todoFilterSchema = z.object({
  summary: z.boolean().optional(), status: z.enum(['all', 'pending', 'done']).optional(),
  query: z.string().trim().max(500).optional(), priority: prioritySchema.optional(),
}).strict();
export type TodoFilter = z.infer<typeof todoFilterSchema>;
