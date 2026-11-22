import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { z } from 'zod';
import { normalizeSkillMarketUrl, parseSkillUpload, skillMarkdown, type SkillMarketItem, type SkillMarketSource, type SkillContent } from '../shared/skills.js';
import { fetchSkillCatalog } from './skills-network.js';
import { MAX_SKILL_BYTES, MAX_SKILL_FILES, type SkillBundle } from './skills-files.js';
import { readSkillDocument } from './skills-document.js';

type FetchText = (url: string, signal: AbortSignal) => Promise<string>;
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const versionName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const label = (value: unknown, fallback = '', limit = 2000) => typeof value === 'string' ? value.slice(0, limit) : fallback;

export function skillMarketKind(value: string) {
  const url = new URL(normalizeSkillMarketUrl(value));
  if (url.origin === 'https://skills.sh' && ['/', '/api/search'].includes(url.pathname)) return 'skillsh';
  if (url.origin === 'https://clawhub.ai' && ['/', '/api/v1/search', '/api/v1/skills'].includes(url.pathname)) return 'clawhub';
  if ((url.origin === 'https://skillhub.cn' && ['/', '/skills', '/skills/'].includes(url.pathname))
    || (url.origin === 'https://api.skillhub.cn' && url.pathname === '/api/skills')) return 'skillhub';
  return 'custom';
}
export function canonicalSkillMarketUrl(value: string) {
  const kind = skillMarketKind(value);
  if (kind === 'skillhub') {
    const original = new URL(value), url = new URL('https://api.skillhub.cn/api/skills');
    const sort = original.searchParams.get('sortBy') ?? 'score';
    url.searchParams.set('sortBy', ['score', 'stars', 'downloads', 'updated_at'].includes(sort) ? sort : 'score');
    url.searchParams.set('order', original.searchParams.get('order') === 'asc' ? 'asc' : 'desc');
    return url.href;
  }
  return kind === 'skillsh' ? 'https://skills.sh/api/search'
    : kind === 'clawhub' ? 'https://clawhub.ai/api/v1/skills' : normalizeSkillMarketUrl(value);
}
function marketId(source: SkillMarketSource, identity: unknown) {
  return `${source.id}-${createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24)}`;
}
// Node 22早期版本没有zlib.crc32，避免引入额外运行时版本要求。
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function checksum(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

/** 搜索只加载目录元信息，正文及关联文件在详情打开后读取。 */
export async function loadSkillMarket(source: SkillMarketSource, query: string, signal: AbortSignal, fetchText: FetchText = fetchSkillCatalog,
  continuation?: string): Promise<{ rows: SkillMarketItem[]; truncated: boolean; next?: string }> {
  const kind = skillMarketKind(source.url);
  if (kind === 'skillhub') {
    const url = new URL(canonicalSkillMarketUrl(source.url));
    const page = continuation === undefined ? 1 : Number(continuation);
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('技能市场分页游标无效');
    url.searchParams.set('page', String(page)); url.searchParams.set('pageSize', '24');
    if (query) url.searchParams.set('keyword', query);
    const payload = record(JSON.parse(await fetchText(url.href, signal)));
    if (payload?.code !== 0) throw new Error(`SkillHub：${label(payload?.message, '技能市场返回了无效目录')}`);
    const data = record(payload.data), values = data?.skills;
    if (!Array.isArray(values) || values.length > 500) throw new Error('技能市场返回了无效目录');
    const rows: SkillMarketItem[] = [], seen = new Set<string>();
    for (const raw of values) {
      const row = record(raw); if (!row || !identifier.safeParse(row.slug).success) continue;
      const namespace = record(row.namespace)?.handle;
      if (namespace !== undefined && !identifier.safeParse(namespace).success) continue;
      if (row.version !== undefined && !versionName.safeParse(row.version).success) continue;
      const catalog = { kind: 'skillhub' as const, slug: row.slug as string,
        namespace: namespace as string | undefined, version: row.version as string | undefined };
      const id = marketId(source, { kind, slug: catalog.slug, namespace: catalog.namespace });
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, marketSourceId: source.id, catalog, body: '', name: label(row.name, catalog.slug, 256),
        description: label(row.description_zh, label(row.description)) });
    }
    const more = values.length > 0 && typeof data?.total === 'number' && data.total > page * 24;
    return { rows, truncated: more, next: more ? String(page + 1) : undefined };
  }
  if (kind === 'custom') {
    const content = parseSkillUpload(await fetchText(source.url, signal));
    return { rows: content.filter(row => `${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase()))
      .map(row => ({ ...row, id: marketId(source, row.name), marketSourceId: source.id })), truncated: false };
  }
  if (kind === 'skillsh' && !query) return { rows: [], truncated: false };
  const url = new URL(kind === 'skillsh' ? 'https://skills.sh/api/search'
    : query ? 'https://clawhub.ai/api/v1/search' : 'https://clawhub.ai/api/v1/skills');
  if (query) url.searchParams.set('q', query);
  if (kind === 'clawhub') { url.searchParams.set('limit', query ? '100' : '10'); if (!query) url.searchParams.set('sort', 'downloads'); }
  if (continuation && kind === 'clawhub' && !query) url.searchParams.set('cursor', continuation);
  const rows: SkillMarketItem[] = [], seen = new Set<string>();
  let truncated = false;
  let next: string | undefined;
  {
    const payload = record(JSON.parse(await fetchText(url.href, signal)));
    const values = kind === 'skillsh' ? payload?.skills : query ? payload?.results : payload?.items;
    if (!Array.isArray(values) || values.length > 500) throw new Error('技能市场返回了无效目录');
    for (const raw of values) {
      const row = record(raw); if (!row) continue;
      let catalog: NonNullable<SkillMarketItem['catalog']>;
      if (kind === 'skillsh') {
        const sourceParts = typeof row.source === 'string' ? row.source.split('/') : [];
        if (sourceParts.length !== 2 || !sourceParts.every(part => identifier.safeParse(part).success)
          || !identifier.safeParse(row.skillId).success) continue;
        catalog = { kind, source: sourceParts.join('/'), skillId: row.skillId as string };
      } else if (row.source === 'skills-sh') {
        const identity = record(row.sourceIdentity);
        if (!identifier.safeParse(identity?.owner).success || !identifier.safeParse(identity?.repo).success
          || !identifier.safeParse(row.slug).success) continue;
        catalog = { kind: 'skillsh', source: `${identity!.owner}/${identity!.repo}`, skillId: row.slug as string };
      } else {
        if (row.source !== undefined && row.source !== 'clawhub') continue;
        const owner = row.ownerHandle ?? record(row.owner)?.handle;
        if (!identifier.safeParse(owner).success || !identifier.safeParse(row.slug).success) continue;
        catalog = { kind, owner: owner as string, slug: row.slug as string };
      }
      const id = marketId(source, catalog); if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, marketSourceId: source.id, catalog, body: '',
        name: label(kind === 'skillsh' ? row.name : row.displayName, catalog.kind === 'skillsh' ? catalog.skillId : catalog.slug, 256),
        description: label(row.summary ?? row.description),
      });
    }
    const cursor = payload?.nextCursor;
    if (kind === 'clawhub' && !query && typeof cursor === 'string' && cursor) {
      if (cursor.length > 4096 || cursor === continuation) throw new Error('技能市场分页游标无效');
      next = cursor; truncated = true;
    }
  }
  return { rows, truncated, next };
}

export function addMarketFile(bundle: SkillBundle, path: string, data: Buffer) {
  if (!path || path.length > 512 || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..'
    || /[\x00-\x1f:*?"<>|]/.test(part)) || bundle.has(path)
    || [...bundle.keys()].some(key => key.startsWith(`${path}/`) || path.startsWith(`${key}/`)))
    throw new Error('市场技能包含非法、重复或嵌套文件路径');
  if (bundle.size >= MAX_SKILL_FILES || [...bundle.values()].reduce((sum, value) => sum + value.length, data.length) > MAX_SKILL_BYTES)
    throw new Error('技能最多 500 个文件、20 MB');
  bundle.set(path, data);
}

/** 只解普通文件，限制解压输出并验证中央目录、CRC和大小；不落盘、不执行代码。 */
export function readMarketZip(bytes: Buffer): SkillBundle {
  if (bytes.length > MAX_SKILL_BYTES) throw new Error('市场技能归档最大 20 MB');
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--)
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)
    || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10)) throw new Error('市场技能 ZIP 格式不支持');
  const count = bytes.readUInt16LE(end + 10), directorySize = bytes.readUInt32LE(end + 12), directory = bytes.readUInt32LE(end + 16);
  if (!count || count > MAX_SKILL_FILES || directory + directorySize !== end) throw new Error('市场技能 ZIP 目录无效或文件过多');
  const bundle: SkillBundle = new Map(); let offset = directory, total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('市场技能 ZIP 目录损坏');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16);
    const compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24), nameSize = bytes.readUInt16LE(offset + 28);
    const extraSize = bytes.readUInt16LE(offset + 30), commentSize = bytes.readUInt16LE(offset + 32), external = bytes.readUInt32LE(offset + 38);
    const local = bytes.readUInt32LE(offset + 42), next = offset + 46 + nameSize + extraSize + commentSize;
    if (next > end || flags & 1 || bytes.readUInt16LE(offset + 34) || ![0, 8].includes(method))
      throw new Error('市场技能 ZIP 加密或压缩格式不支持');
    const filename = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    if ((external >>> 16 & 0xf000) === 0xa000) throw new Error('市场技能归档不可包含符号链接');
    if (local + 30 > directory || bytes.readUInt32LE(local) !== 0x04034b50
      || bytes.readUInt16LE(local + 8) !== method) throw new Error('市场技能 ZIP 文件头损坏');
    const localNameSize = bytes.readUInt16LE(local + 26), start = local + 30 + localNameSize + bytes.readUInt16LE(local + 28);
    if (start + compressed > directory || bytes.subarray(local + 30, local + 30 + localNameSize).toString('utf8') !== filename)
      throw new Error('市场技能 ZIP 文件越界');
    total += size; if (total > MAX_SKILL_BYTES) throw new Error('技能最多 500 个文件、20 MB');
    const packed = bytes.subarray(start, start + compressed);
    const data = method === 8 ? inflateRawSync(packed, { maxOutputLength: Math.max(1, size) }) : packed;
    if (data.length !== size || checksum(data) !== crc) throw new Error('市场技能 ZIP 文件校验失败');
    if (filename.endsWith('/')) {
      if (size) throw new Error('市场技能 ZIP 目录项无效');
      addMarketFile(new Map(), filename.slice(0, -1), Buffer.alloc(0));
    } else {
      const type = external >>> 16 & 0xf000;
      if (type && type !== 0x8000) throw new Error('市场技能归档仅接受普通文件');
      addMarketFile(bundle, filename, Buffer.from(data));
    }
    offset = next;
  }
  if (offset !== end || !bundle.has('SKILL.md')) throw new Error('市场技能归档缺少 SKILL.md');
  return bundle;
}

export async function readMarketSkill(item: SkillMarketItem, signal: AbortSignal, fetchText: FetchText = fetchSkillCatalog) {
  let catalog = item.catalog;
  const bundle: SkillBundle = new Map();
  if (!catalog) {
    addMarketFile(bundle, 'SKILL.md', Buffer.from(`---\nname: ${JSON.stringify(item.name)}\ndescription: ${JSON.stringify(item.description)}\n---\n${item.body}`));
  } else if (catalog.kind === 'skillsh') {
    const parts = catalog.source.split('/');
    if (parts.length !== 2 || !parts.every(part => identifier.safeParse(part).success)) throw new Error('技能市场标识无效');
    identifier.parse(catalog.skillId);
    const url = `https://skills.sh/api/download/${parts.map(encodeURIComponent).join('/')}/${encodeURIComponent(catalog.skillId)}`;
    const payload = z.object({ files: z.array(z.object({ path: z.string(), contents: z.string() })).min(1).max(MAX_SKILL_FILES) })
      .parse(JSON.parse(await fetchText(url, signal)));
    for (const file of payload.files) addMarketFile(bundle, file.path, Buffer.from(file.contents));
  } else if (catalog.kind === 'skillhub') {
    identifier.parse(catalog.slug);
    if (catalog.namespace !== undefined) identifier.parse(catalog.namespace);
    const url = new URL(`https://api.skillhub.cn/api/v1/skills/${encodeURIComponent(catalog.slug)}`);
    if (catalog.namespace) url.searchParams.set('namespace', catalog.namespace);
    if (!catalog.version) {
      const detail = record(JSON.parse(await fetchText(url.href, signal)));
      catalog = { ...catalog, version: versionName.parse(record(detail?.latestVersion)?.version) };
    }
    versionName.parse(catalog.version);
    url.pathname += '/file'; url.searchParams.set('path', 'SKILL.md'); url.searchParams.set('version', catalog.version!);
    addMarketFile(bundle, 'SKILL.md', Buffer.from(await fetchText(url.href, signal)));
  } else {
    identifier.parse(catalog.owner); identifier.parse(catalog.slug);
    const url = new URL(`https://clawhub.ai/api/v1/skills/${encodeURIComponent(catalog.slug)}/file`);
    url.searchParams.set('owner', catalog.owner); url.searchParams.set('path', 'SKILL.md');
    addMarketFile(bundle, 'SKILL.md', Buffer.from(await fetchText(url.href, signal)));
  }
  const instruction = bundle.get('SKILL.md');
  if (!instruction) throw new Error('技能市场包缺少 SKILL.md');
  const content = readSkillDocument(instruction.toString('utf8'));
  return { item: { ...item, catalog, name: content.name, description: content.description, body: content.body, files: [...bundle.keys()].sort() }, bundle };
}

export function marketSkillArchiveUrl(catalog: Extract<NonNullable<SkillMarketItem['catalog']>, { kind: 'clawhub' | 'skillhub' }>) {
  identifier.parse(catalog.slug);
  const url = new URL(catalog.kind === 'skillhub' ? 'https://api.skillhub.cn/api/v1/download' : 'https://clawhub.ai/api/v1/download');
  url.searchParams.set('slug', catalog.slug);
  if (catalog.kind === 'clawhub') url.searchParams.set('owner', identifier.parse(catalog.owner));
  else {
    if (catalog.namespace) url.searchParams.set('namespace', identifier.parse(catalog.namespace));
    url.searchParams.set('version', versionName.parse(catalog.version));
  }
  return url.href;
}

/** 修改正文时保留市场文件的调用限制和其他 frontmatter。 */
export function marketSkillMarkdown(original: string, content: SkillContent) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(original.replace(/^\uFEFF/, ''));
  if (!match) throw new Error('市场技能说明格式无效');
  return skillMarkdown({ ...content, frontmatter: match[1]! });
}
