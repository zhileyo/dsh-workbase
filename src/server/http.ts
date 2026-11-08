import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection';
import { RPC_ENDPOINT } from '../shared/commands.js';
import type { WorkbaseService } from './service.js';
import { dispatch } from './rpc.js';

/** 仅供Connection的owner精确路由调用，保持官方RPC封装。 */
export async function handleRequest(service: WorkbaseService, request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    return new Response('content type must be application/json', { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return new Response('empty body', { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32768) { await reader.cancel(); return new Response('body too large', { status: 413 }); }
      chunks.push(chunk.value);
    }
    const envelope = clientRequestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!envelope.success || envelope.data.method !== RPC_ENDPOINT)
      return new Response('invalid RPC envelope', { status: 400 });
    const result = await dispatch(service, envelope.data.payload, true, request.signal);
    return Response.json({ type: 'server-response', rpcId: envelope.data.rpcId, result });
  } catch {
    return new Response('invalid request body', { status: 400 });
  } finally { reader.releaseLock(); }
}
