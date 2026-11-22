import { createHash } from 'node:crypto';
import { RSS_LIMITS, safeRssUrl, type RssOpmlPreview, type RssGroup } from '../shared/rss.js';
import { formatRssContent } from './rss-format.js';
import type { RssContentNode } from '../shared/rss.js';

interface XmlNode { name: string; attrs: Record<string, string>; parts: (string | XmlNode)[]; base: string }
const local = (name: string) => name.split(':').at(-1)!.toLowerCase();
const children = (node: XmlNode, name?: string): XmlNode[] => node.parts.filter((p): p is XmlNode => typeof p !== 'string' && (!name || local(p.name) === name));
const child = (node: XmlNode, name: string) => children(node, name)[0];
const text = (node?: XmlNode): string => node?.parts.map(p => typeof p === 'string' ? p : text(p)).join('') ?? '';
const field = (node: XmlNode, name: string) => text(child(node, name)).trim();
function entity(value: string, strict = true): string {
  return value.replace(/&([^;\s<&]+);/g, (original, key: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (named[key] !== undefined && (!strict || key !== 'nbsp')) return named[key]!;
    if (/^#(?:x[\da-f]+|\d+)$/i.test(key)) {
      const n = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      if (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) return String.fromCodePoint(n);
    }
    if (strict) throw new Error('XML 包含未知或非法实体');
    return original;
  });
}

/** Bounded XML tree scanner: no DTD, external entities, recovery or regex-based feed extraction. */
function xmlTree(xml: string, base = ''): XmlNode {
  if (Buffer.byteLength(xml) > RSS_LIMITS.responseBytes) throw new Error('XML 超过 2 MB 上限');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不允许 XML DTD 或实体声明');
  const document: XmlNode = { name: '#document', attrs: {}, parts: [], base };
  const stack = [document];
  let i = xml.charCodeAt(0) === 0xfeff ? 1 : 0, nodes = 0;
  const fail = (): never => { throw new Error('XML 格式无效'); };
  const name = () => {
    const match = /^[A-Za-z_][\w.:-]*/.exec(xml.slice(i));
    if (!match) return fail();
    i += match[0].length;
    return match[0];
  };
  const space = () => { while (/\s/.test(xml[i] ?? '') && i < xml.length) i++; };
  while (i < xml.length) {
    const current = stack.at(-1)!;
    if (xml[i] !== '<') {
      const end = xml.indexOf('<', i), next = end < 0 ? xml.length : end;
      const raw = xml.slice(i, next);
      if (/&(?!(?:[A-Za-z][\w]*|#\d+|#x[\da-f]+);)/i.test(raw)) fail();
      const value = entity(raw);
      if (stack.length === 1 && value.trim()) fail();
      current.parts.push(value); i = next; continue;
    }
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      if (end < 0 || xml.slice(i + 4, end).includes('--')) fail();
      i = end + 3; continue;
    }
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i + 2); if (end < 0) fail();
      i = end + 2; continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9); if (end < 0 || stack.length === 1) fail();
      current.parts.push(xml.slice(i + 9, end)); i = end + 3; continue;
    }
    if (xml.startsWith('</', i)) {
      i += 2; const close = name(); space();
      if (xml[i++] !== '>' || stack.length < 2 || current.name !== close) fail();
      stack.pop(); continue;
    }
    i++;
    const node: XmlNode = { name: name(), attrs: Object.create(null) as Record<string, string>, parts: [], base: current.base };
    for (;;) {
      const previous = i; space();
      if (xml[i] === '>' || xml.startsWith('/>', i)) break;
      if (i === previous) fail();
      const key = name(); space(); if (xml[i++] !== '=') fail(); space();
      const quote = xml[i++]; if (quote !== '"' && quote !== "'") fail();
      const end = xml.indexOf(quote!, i); if (end < 0) fail();
      const raw = xml.slice(i, end);
      if (raw.includes('<') || Object.hasOwn(node.attrs, key)) fail();
      node.attrs[key] = entity(raw); i = end + 1;
    }
    if (node.attrs['xml:base']) {
      try { node.base = new URL(node.attrs['xml:base'], current.base || undefined).href; } catch { fail(); }
    }
    current.parts.push(node);
    if (++nodes > 50_000 || stack.length > 64) throw new Error('XML 嵌套或元素数量超过上限');
    if (xml.startsWith('/>', i)) i += 2;
    else { i++; stack.push(node); }
  }
  if (stack.length !== 1 || children(document).length !== 1) fail();
  return children(document)[0]!;
}

/** Deliberately text-only. Even malformed HTML never reaches innerHTML or loads resources. */
export function cleanRssText(html: string): string {
  return entity(html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|iframe|object|template|svg|math)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<\/?(?:p|div|br|li|h[1-6]|blockquote|tr|section)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*(?:>|$)/g, ''), false)
    .replace(/[ \t\r]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function content(node?: XmlNode): string {
  if (!node) return '';
  const render = (n: XmlNode): string => n.parts.map(p => typeof p === 'string' ? p : `<${local(p.name)}>${render(p)}</${local(p.name)}>`).join('');
  return cleanRssText(render(node));
}
export interface ParsedRssArticle { key: string; title: string; summary: string; body: string; bodyContent?: RssContentNode[]; url: string; publishedAt: number }
export function parseRss(xml: string, url: string): { title: string; articles: ParsedRssArticle[] } {
  const root = xmlTree(xml, url), kind = local(root.name);
  if (!['rss', 'feed', 'rdf'].includes(kind)) throw new Error('不是 RSS / Atom 订阅源');
  const channel = kind === 'feed' ? root : child(root, 'channel');
  if (!channel) throw new Error('RSS 缺少 channel');
  const items = kind === 'feed' ? children(root, 'entry') : kind === 'rdf' ? children(root, 'item') : children(channel, 'item');
  const articles = items.slice(0, 1000).map(item => {
    const link = kind === 'feed' ? children(item, 'link').find(n => (!n.attrs.rel || n.attrs.rel === 'alternate') && (!n.attrs.type || /html/.test(n.attrs.type))) : child(item, 'link');
    const original = safeRssUrl(kind === 'feed' ? link?.attrs.href ?? '' : text(link).trim(), link?.base ?? item.base);
    const summary = content(child(item, kind === 'feed' ? 'summary' : 'description')).slice(0, 5000);
    const full = kind === 'feed' ? child(item, 'content') : child(item, 'encoded');
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const renderFull = (n: XmlNode, nested = false): string => n.parts.map(p => typeof p === 'string' ? nested ? escape(p) : p
      : `<${local(p.name)}${p.attrs.href ? ` href="${escape(safeRssUrl(p.attrs.href, p.base))}"` : ''}>${renderFull(p, true)}</${local(p.name)}>`).join('');
    const formatted = full && !full.attrs.src ? formatRssContent(renderFull(full), full.base, kind === 'feed' && (!full.attrs.type || full.attrs.type === 'text')) : undefined;
    const body = formatted?.text ?? '';
    const title = content(child(item, 'title')).slice(0, 1000) || '无标题文章';
    const rawDate = field(item, 'published') || field(item, 'updated') || field(item, 'pubdate') || field(item, 'date');
    const date = Date.parse(rawDate);
    const key = (field(item, 'guid') || field(item, 'id') || original || createHash('sha256').update(title + '\n' + rawDate + '\n' + summary).digest('hex')).slice(0, 2048);
    return { key, title, summary, body, ...(formatted?.nodes.length ? { bodyContent: formatted.nodes } : {}), url: original === safeRssUrl(url) ? '' : original, publishedAt: Number.isFinite(date) ? date : 0 };
  });
  return { title: content(child(channel, 'title')).slice(0, 80), articles };
}
export function previewOpml(xml: string, existing: readonly { url: string }[], defaultGroup = ''): RssOpmlPreview {
  const root = xmlTree(xml);
  if (local(root.name) !== 'opml' || !child(root, 'body')) throw new Error('不是有效的 OPML 文档');
  const seen = new Set(existing.map(f => safeRssUrl(f.url)));
  const candidates: RssOpmlPreview['candidates'] = [];
  const walk = (node: XmlNode, groups: string[]) => {
    for (const outline of children(node, 'outline')) {
      const label = (outline.attrs.text || outline.attrs.title || '').trim();
      if (outline.attrs.xmlUrl !== undefined) {
        if (candidates.length >= RSS_LIMITS.feeds * 2) throw new Error('OPML 候选超过上限');
        const url = safeRssUrl(outline.attrs.xmlUrl);
        const groupName = groups.join(' / ') || defaultGroup;
        const error = !url ? '仅允许无凭据的 HTTP/HTTPS 地址' : label.length > 80 || groupName.length > 80 ? '名称或分组超过 80 字符' : undefined;
        const duplicate = !!url && seen.has(url);
        candidates.push({ index: candidates.length, name: label || url.slice(0, 80) || '无效订阅', url, groupName, duplicate, ...(error ? { error } : {}) });
        if (url) seen.add(url);
        walk(outline, groups);
      } else walk(outline, label ? [...groups, label] : groups);
    }
  };
  walk(child(root, 'body')!, []);
  return { candidates, valid: candidates.filter(c => !c.error && !c.duplicate).length,
    duplicate: candidates.filter(c => c.duplicate && !c.error).length, invalid: candidates.filter(c => c.error).length };
}
export function exportOpml(feeds: readonly { name: string; url: string; groupId: string }[], groups: readonly RssGroup[]): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
  const outlines = [...groups, { id: '', name: '未分组', collapsed: false }].map(group => {
    const items = feeds.filter(f => f.groupId === group.id).map(f => `    <outline text="${escape(f.name)}" type="rss" xmlUrl="${escape(f.url)}"/>`).join('\n');
    return `  <outline text="${escape(group.name)}">\n${items}\n  </outline>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>工作台订阅</title></head><body>\n${outlines}\n</body></opml>`;
}
