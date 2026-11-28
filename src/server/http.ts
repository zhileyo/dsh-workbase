import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection';
import { RPC_ENDPOINT, EXTENSIONS_ENDPOINT, ASSISTANT_ENDPOINT } from '../shared/commands.js';
import type { ExtensionsPort } from '../shared/extensions.js';
import type { WorkbaseService } from './service.js';
import { DEDICATED_ENDPOINT_OPS, dispatch, type DedicatedRoute } from './rpc.js';
import { RULES_ENDPOINT, MESSAGE_ENDPOINT, MAX_RULES_REQUEST_BYTES, MAX_MESSAGE_REQUEST_BYTES, MAX_RPC_REQUEST_BYTES } from '../shared/project-rules.js';

/** 扩展端点的请求体上限：与 RPC／规则／消息并列的一档，单独具名以免魔数散落。 */
const MAX_EXTENSIONS_REQUEST_BYTES = 3 * 1024 * 1024;
/** 通道标签：与布尔开关相比，端点与请求体上限都由同一张表派生，调用处也不必再传布尔。 */
export type RequestRoute = 'rpc' | DedicatedRoute;
const ENDPOINT_BY_ROUTE: Record<RequestRoute, string> = {
  rpc: RPC_ENDPOINT, extensions: EXTENSIONS_ENDPOINT,
  rules: RULES_ENDPOINT, message: MESSAGE_ENDPOINT, assistant: ASSISTANT_ENDPOINT,
};
const LIMIT_BY_ROUTE: Record<RequestRoute, number> = {
  rpc: MAX_RPC_REQUEST_BYTES, extensions: MAX_EXTENSIONS_REQUEST_BYTES,
  rules: MAX_RULES_REQUEST_BYTES, message: MAX_MESSAGE_REQUEST_BYTES, assistant: MAX_MESSAGE_REQUEST_BYTES,
};

/** 仅供Connection的owner精确路由调用，保持官方RPC封装。 */
export async function handleRequest(service: WorkbaseService, request: Request, extensions?: ExtensionsPort, route: RequestRoute = 'rpc') {
  const endpoint = ENDPOINT_BY_ROUTE[route], limit = LIMIT_BY_ROUTE[route];
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
    // 普通 RPC 通道不限 op（分发层另有严格 schema）；专用端点只放行本通道已实现的 op。
    const allowed = route === 'rpc' ? undefined : DEDICATED_ENDPOINT_OPS[route];
    if (allowed && !allowed.includes(op ?? ''))
      return new Response('invalid dedicated operation', { status: 400 });
    const result = await dispatch(service, envelope.data.payload, true, request.signal, extensions);
    return Response.json({ type: 'server-response', rpcId: envelope.data.rpcId, result });
  } catch {
    return new Response('invalid request body', { status: 400 });
  } finally { reader.releaseLock(); }
}
