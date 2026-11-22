import { z } from 'zod';
import { WorkbaseError } from '../shared/model.js';
import type { Speech } from './speech.js';
const input = z.object({ version: z.string().max(500).nullable(), manual: z.boolean().optional() }).strict();
/** Connection精确Fetch路由已经强制校验owner。 */
export async function speechFetch(speech: Speech, request: Request): Promise<Response> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    return new Response('invalid content type', { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return new Response('empty body', { status: 400 });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 2048) { await reader.cancel(); return new Response('body too large', { status: 413 }); }
      chunks.push(part.value);
    }
    const parsed = input.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success) return new Response('invalid request', { status: 400 });
    return await speech.openStream(parsed.data.version, request.signal, parsed.data.manual);
  } catch (error) {
    return Response.json({ message: error instanceof WorkbaseError ? error.message : '流式播报请求失败' },
      { status: error instanceof WorkbaseError && error.code === 'conflict' ? 409 : 400 });
  } finally { reader.releaseLock(); }
}
