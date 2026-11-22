import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { normalizeSkillMarketUrl } from '../shared/skills.js';

export function publicSkillAddress(address: string) {
  if (isIP(address) === 6) {
    const [first = '', second = '0'] = address.toLowerCase().split(':');
    const prefix = parseInt(first, 16);
    if (!Number.isFinite(prefix) || prefix < 0x2000 || prefix > 0x3fff || first === '2002' || first === '3fff') return false;
    return first !== '2001' || (parseInt(second, 16) >= 0x200 && parseInt(second, 16) !== 0xdb8);
  }
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return a !== 0 && a !== 10 && a !== 127 && !(a === 169 && b === 254)
    && !(a === 192 && (b === 168 || b === 0 || b === 88 && c === 99))
    && !(a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
    && !(a === 203 && b === 0 && c === 113)
    && !(a === 172 && b! >= 16 && b! <= 31) && !(a === 100 && b! >= 64 && b! <= 127)
    && a! < 224;
}
export function pinnedSkillLookup(address: { address: string; family: number }): LookupFunction {
  return (_host, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}
/** DNS 解析后固定连接地址；每一跳重新校验，不访问内网、不携带凭据。 */
export async function fetchSkillResource(value: string, signal: AbortSignal, redirects = 0, maxBytes = 2 * 1024 * 1024): Promise<Buffer> {
  if (redirects > 4) throw new Error('技能市场重定向次数过多');
  signal.throwIfAborted();
  const url = new URL(normalizeSkillMarketUrl(value));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(row => !publicSkillAddress(row.address))) throw new Error('技能市场拒绝内网、回环或保留地址');
  signal.throwIfAborted();
  const address = addresses[0]!;
  const result = await new Promise<{ data?: Buffer; location?: string }>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      signal, headers: { Accept: 'application/json, application/octet-stream', 'User-Agent': 'dsh-workbase' },
      lookup: pinnedSkillLookup(address),
    }, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume(); resolve({ location: response.headers.location }); return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`技能市场 HTTP ${response.statusCode}`)); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(new Error(maxBytes === 2 * 1024 * 1024 ? '技能市场目录最大 2 MB' : '市场技能归档最大 20 MB')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ data: Buffer.concat(chunks) }));
    });
    req.setTimeout(15000, () => req.destroy(new Error('技能市场读取超时')));
    req.on('error', reject); req.end();
  });
  if (result.location) return fetchSkillResource(new URL(result.location, url).href, signal, redirects + 1, maxBytes);
  if (result.data === undefined) throw new Error('技能市场重定向缺少地址');
  return result.data;
}
export async function fetchSkillCatalog(value: string, signal: AbortSignal) {
  return (await fetchSkillResource(value, signal)).toString('utf8');
}
