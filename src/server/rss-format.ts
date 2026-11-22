import { parseHTML } from 'linkedom';
import { RSS_LIMITS, rssContentTags, safeRssUrl, type RssContentNode } from '../shared/rss.js';

const allowed = new Set<string>(rssContentTags);
const omitted = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'nav', 'footer', 'form', 'button', 'input', 'select', 'textarea']);
const aliases: Record<string, string> = { h1: 'h2', b: 'strong', i: 'em', s: 'del', section: 'div', article: 'div', figure: 'div', figcaption: 'p' };

/** 只传递阅读语义；不传递源站属性、样式、资源或可执行HTML。 */
export function formatRssContent(html: string, base = '', plain = false): { nodes: RssContentNode[]; text: string } {
  if (Buffer.byteLength(html) > RSS_LIMITS.responseBytes) throw new Error('原文响应超过上限');
  if (plain) {
    const text = html.slice(0, 50_000).trim();
    return { nodes: [{ tag: 'pre', children: [{ text }] }], text };
  }
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  if (document.querySelectorAll('*').length > 50_000) throw new Error('原文元素数量超过上限');
  let remaining = 50_000, count = 0;
  const walk = (node: Node, depth: number, pre = false): RssContentNode[] => {
    if (depth > 32 || remaining <= 0 || count >= 5000) return [];
    if (node.nodeType === 3) {
      const text = (pre ? node.textContent ?? '' : (node.textContent ?? '').replace(/\s+/g, ' ')).slice(0, remaining);
      remaining -= text.length;
      if (!text) return [];
      count++;
      return [{ text }];
    }
    if (node.nodeType !== 1) return [];
    const element = node as Element, source = element.tagName.toLowerCase();
    if (omitted.has(source) || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return [];
    if (source === 'img') {
      const text = element.getAttribute('alt')?.trim().slice(0, Math.min(remaining, 1000));
      if (!text) return [];
      remaining -= text.length; count++;
      return [{ text: ` ${text} ` }];
    }
    const tag = aliases[source] ?? source;
    count++;
    const children = Array.from(node.childNodes).flatMap(child => walk(child, depth + 1, pre || tag === 'pre'));
    if (!children.length && tag !== 'br' && tag !== 'hr') return [];
    if (!allowed.has(tag)) return children;
    const href = tag === 'a' ? safeRssUrl(element.getAttribute('href') ?? '', base || undefined) : '';
    if (tag === 'a' && !href) return children;
    return [{ tag: tag as NonNullable<RssContentNode['tag']>, ...(href ? { href } : {}), ...(children.length ? { children } : {}) }];
  };
  const nodes = Array.from(document.body.childNodes).flatMap(node => walk(node as unknown as Node, 0));
  const textOf = (node: RssContentNode): string => {
    if (node.text !== undefined) return node.text;
    const text = node.children?.map(textOf).join('') ?? '';
    return ['div', 'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'tr', 'br', 'hr'].includes(node.tag ?? '') ? `${text}\n` : text;
  };
  return { nodes, text: nodes.map(textOf).join('').replace(/\n{3,}/g, '\n\n').trim().slice(0, 50_000) };
}
