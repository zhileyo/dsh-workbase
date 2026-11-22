import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { RSS_LIMITS, safeRssUrl } from '../shared/rss.js';

export function isPublicRssAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
      || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0
      || a === 192 && b === 88 && c === 99 || a === 198 && (b === 18 || b === 19)
      || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) !== 6) return false;
  // Only native global unicast; reject mapped, transition, documentation and special-purpose blocks.
  const first = parseInt(address.split(':')[0] || '0', 16);
  if (first < 0x2000 || first > 0x3fff) return false;
  const [a, b = '0'] = address.toLowerCase().split(':');
  if (a === '2001' && (parseInt(b, 16) < 0x200 || parseInt(b, 16) === 0xdb8)) return false;
  if (a === '2002' || a === '3fff') return false;
  return true;
}
export interface RssFetchOptions { trusted?: boolean; signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; etag?: string; lastModified?: string; accept?: string }
export interface RssFetchResult { url: string; text: string; status: number; etag?: string; lastModified?: string }
function aborted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('RSS 抓取已取消');
}
async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw aborted(signal);
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(aborted(signal));
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}
async function requestOnce(url: URL, trusted: boolean, signal: AbortSignal, maxBytes: number, conditional: RssFetchOptions): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await withAbort(lookup(hostname, { all: true, verbatim: true }), signal);
  if (!addresses.length || !trusted && addresses.some(a => !isPublicRssAddress(a.address))) throw new Error('RSS 地址解析到私网或保留地址，默认拒绝访问');
  const pinned = addresses[0]!;
  if (signal.aborted) throw aborted(signal);
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { accept: conditional.accept ?? 'application/rss+xml,application/atom+xml,application/xml,text/xml', 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'dsh-workbase/rss' };
    if (conditional.etag && !/[\r\n]/.test(conditional.etag)) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified && !/[\r\n]/.test(conditional.lastModified)) headers['if-modified-since'] = conditional.lastModified;
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false, headers, signal,
      // Pin the validated address while retaining original Host and TLS hostname verification.
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      },
    }, response => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308, 304].includes(status)) {
        response.destroy(); resolve({ status, headers: response.headers, bytes: Buffer.alloc(0) }); return;
      }
      if (status < 200 || status >= 300) { response.destroy(); reject(new Error(`RSS HTTP ${status}`)); return; }
      if (Number(response.headers['content-length']) > maxBytes) { response.destroy(); reject(new Error('RSS 响应超过上限')); return; }
      const chunks: Buffer[] = []; let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) { response.destroy(new Error('RSS 响应超过上限')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status, headers: response.headers, bytes: Buffer.concat(chunks, total) }));
    });
    request.on('error', error => reject(signal.aborted ? aborted(signal) : error));
    request.end();
  });
}
export async function fetchRss(value: string, options: RssFetchOptions = {}): Promise<RssFetchResult> {
  const initial = safeRssUrl(value);
  if (!initial) throw new Error('RSS URL 无效，仅允许无凭据的 HTTP/HTTPS');
  const timeout = options.timeoutMs ?? RSS_LIMITS.timeoutMs, cap = options.maxBytes ?? RSS_LIMITS.responseBytes;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || !Number.isSafeInteger(cap) || cap < 1 || cap > RSS_LIMITS.responseBytes) throw new Error('RSS 网络限制参数无效');
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('RSS 抓取已取消'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error('RSS 抓取超时')), timeout);
  try {
    let url = new URL(initial);
    for (let hop = 0; ; hop++) {
      const response = await requestOnce(url, options.trusted === true && url.origin === new URL(initial).origin, controller.signal, cap, hop === 0 ? options : { accept: options.accept });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (hop >= RSS_LIMITS.redirects) throw new Error('RSS 重定向次数超过上限');
        const next = safeRssUrl(response.headers.location ?? '', url.href);
        if (!next) throw new Error('RSS 重定向地址无效');
        url = new URL(next); continue;
      }
      let bytes = response.bytes;
      const encoding = response.headers['content-encoding']?.toLowerCase();
      try {
        if (encoding === 'gzip') bytes = gunzipSync(bytes, { maxOutputLength: cap });
        else if (encoding === 'deflate') bytes = inflateSync(bytes, { maxOutputLength: cap });
        else if (encoding === 'br') bytes = brotliDecompressSync(bytes, { maxOutputLength: cap });
        else if (encoding && encoding !== 'identity') throw new Error('unsupported encoding');
      } catch { throw new Error('RSS 压缩响应无效或超过上限'); }
      if (controller.signal.aborted) throw aborted(controller.signal);
      const declared = /charset\s*=\s*["']?([^;\s"']+)/i.exec(response.headers['content-type'] ?? '')?.[1];
      const prolog = /encoding\s*=\s*["']([^"']+)/i.exec(bytes.subarray(0, 200).toString('ascii'))?.[1];
      const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : undefined;
      let decoded: string;
      try { decoded = new TextDecoder(declared || bom || prolog || 'utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('RSS 响应字符编码无效'); }
      return { url: url.href, status: response.status, text: decoded,
        ...(response.headers.etag ? { etag: response.headers.etag.slice(0, 1000) } : {}),
        ...(response.headers['last-modified'] ? { lastModified: response.headers['last-modified'].slice(0, 1000) } : {}) };
    }
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
