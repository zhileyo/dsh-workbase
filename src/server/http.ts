import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection';
import { RPC_ENDPOINT, EXTENSIONS_ENDPOINT, ASSISTANT_ENDPOINT } from '../shared/commands.js';
import type { ExtensionsPort } from '../shared/extensions.js';
import type { WorkbaseService } from './service.js';
import { dispatch } from './rpc.js';
import { RULES_ENDPOINT, MESSAGE_ENDPOINT, MAX_RULES_REQUEST_BYTES, MAX_MESSAGE_REQUEST_BYTES, MAX_RPC_REQUEST_BYTES } from '../shared/project-rules.js';

/** 仅供Connection的owner精确路由调用，保持官方RPC封装。 */
export async function handleRequest(service: WorkbaseService, request: Request, extensions?: ExtensionsPort, route: boolean | 'rules' | 'message' | 'assistant' = false) {
  const endpoint = route === 'assistant' ? ASSISTANT_ENDPOINT : route === 'rules' ? RULES_ENDPOINT : route === 'message' ? MESSAGE_ENDPOINT : route ? EXTENSIONS_ENDPOINT : RPC_ENDPOINT;
  const limit = route === 'rules' ? MAX_RULES_REQUEST_BYTES : route === 'message' || route === 'assistant' ? MAX_MESSAGE_REQUEST_BYTES : route ? 3 * 1024 * 1024 : MAX_RPC_REQUEST_BYTES;
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
      if (size > limit) { await reader.cancel(); return new Response('body too large', { status: 413 }); }
      chunks.push(chunk.value);
    }
    const envelope = clientRequestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!envelope.success || envelope.data.method !== endpoint)
      return new Response('invalid RPC envelope', { status: 400 });
    const op = (envelope.data.payload as { op?: string } | null)?.op;
    if ((route === true && op !== 'extensions') || (route === 'rules' && op !== 'rules-save' && op !== 'settings') ||
        (route === 'message' && op !== 'submit-message') ||
        (route === 'assistant' && !['personal-save', 'speech-save', 'speech-synthesize', 'speech-stream-text', 'speech-stream-cancel'].includes(op ?? '')))
      return new Response('invalid dedicated operation', { status: 400 });
    const result = await dispatch(service, envelope.data.payload, true, request.signal, extensions);
    return Response.json({ type: 'server-response', rpcId: envelope.data.rpcId, result });
  } catch {
    return new Response('invalid request body', { status: 400 });
  } finally { reader.releaseLock(); }
}
