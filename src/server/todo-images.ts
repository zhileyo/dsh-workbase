import { z } from 'zod';
import type { WorkbaseService } from './service.js';
import { WorkbaseError } from '../shared/model.js';
import { MAX_TODO_IMAGE_BYTES } from '../shared/todo.js';

export const TODO_IMAGE_PATH = '/api/workbase/todo-image';
export const TODO_ATTACHMENT_PATH = '/api/workbase/todo-attachment';
/** 官方桥接的正文模式按路由配置；GET必须与流式POST分开。 */
export function todoFetchRoutes(service: WorkbaseService) {
  return [
    { path: TODO_IMAGE_PATH, handler: handleTodoImage },
    { path: TODO_ATTACHMENT_PATH, handler: handleTodoAttachment },
  ].flatMap(({ path, handler }) => [
    { path, methods: ['POST'] as ('GET' | 'POST')[], requestBody: 'streaming' as const,
      fetch: (request: Request) => handler(service, request) },
    { path: `${path}/content`, methods: ['GET'] as ('GET' | 'POST')[], requestBody: 'buffered' as const,
      fetch: (request: Request) => handler(service, request) },
  ]);
}
const scopeSchema = z.object({
  projectId: z.string().min(1).max(200), id: z.string().min(1).max(200),
});
/** 由 Connection 精确路由完成所有者鉴权，二进制正文单独限制，不扩大 JSON RPC 上限。 */
export async function handleTodoImage(service: WorkbaseService, request: Request, generic = false) {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const scope = scopeSchema.parse(query);
    if (request.method === 'GET') {
      const attachmentId = z.string().min(1).max(200).parse(query.attachmentId);
      const result = generic ? await service.readAttachment({ ...scope, attachmentId }, undefined, request.signal)
        : await service.readImage({ ...scope, attachmentId }, undefined, request.signal);
      const image = 'attachment' in result ? result.attachment : result.image;
      const { data } = result;
      return new Response(new Uint8Array(data), { headers: {
        'Content-Type': image.mediaType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        ...(generic ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('name' in image ? image.name : 'image')}`,
          'Content-Security-Policy': "default-src 'none'; sandbox" } : {}),
      } });
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    const expectedVersion = z.coerce.number().int().positive().parse(query.expectedVersion);
    const declared = Number(request.headers.get('content-length'));
    if (declared > MAX_TODO_IMAGE_BYTES) return new Response('附件不能超过10MiB', { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return new Response('缺少附件正文', { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > MAX_TODO_IMAGE_BYTES) { await reader.cancel(); return new Response('附件不能超过10MiB', { status: 413 }); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    const todo = generic ? await service.uploadTodoAttachment({ ...scope, expectedVersion }, Buffer.concat(chunks),
      mediaType, query.name ?? '附件', undefined, request.signal)
      : await service.uploadTodoImage({ ...scope, expectedVersion }, Buffer.concat(chunks), mediaType, undefined, request.signal);
    return Response.json(todo);
  } catch (error) {
    const status = error instanceof WorkbaseError ? ({ forbidden: 403, 'not-found': 404, conflict: 409,
      archived: 409, unsupported: 503 } as Record<string, number>)[error.code] ?? 400 : error instanceof z.ZodError ? 400 : 500;
    return Response.json({ message: error instanceof z.ZodError ? '附件参数不合法' : error instanceof Error ? error.message : '附件操作失败' }, { status });
  }
}
export const handleTodoAttachment = (service: WorkbaseService, request: Request) => handleTodoImage(service, request, true);
