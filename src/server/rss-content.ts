import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { RSS_LIMITS, safeRssUrl } from '../shared/rss.js';
import { formatRssContent } from './rss-format.js';

/** 仅解析静态文档；DOM不执行脚本、不发起图片或其他资源请求。 */
export function extractRssContent(html: string, base = '') {
  if (Buffer.byteLength(html) > RSS_LIMITS.responseBytes) throw new Error('原文响应超过上限');
  const { document } = parseHTML(html);
  // 限制DOM规模，并移除交互、导航与隐藏内容，避免把登录页或页面脚本当正文。
  const elements = document.querySelectorAll('*');
  if (elements.length > 50_000) throw new Error('原文元素数量超过上限');
  for (const element of document.querySelectorAll('script,style,iframe,object,embed,template,math,nav,footer,form,[hidden],[aria-hidden="true"]')) element.remove();
  // 无语义的链接卡片会被Readability当成短导航删掉：先识别单链接标题及明确标题角色。
  // 不依赖站点域名、项目名称或栏目名称；仅在附近存在正文时补充标题语义。
  for (const element of document.querySelectorAll('div,[role="heading"]')) {
    if (!element.parentElement) continue;
    const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text || text.length > 100) continue;
    const links = Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'a');
    const link = links.length === 1 ? links[0] : undefined;
    let nearby: typeof element.parentElement | null = element.parentElement, hasProse = false;
    const titleParents: typeof element[] = [];
    for (let level = 0; nearby && level < 3; level++, nearby = nearby.parentElement) {
      titleParents.push(nearby);
      if ((nearby.textContent?.length ?? 0) > Math.max(60, text.length * 3)) { hasProse = true; break; }
    }
    const titleStyle = /(?:^|[-_\s])(title|heading|headline)(?:[-_\s]|$)|font-(?:bold|semibold)|text-(?:xl|2xl|3xl)/i;
    const linkHeading = /^\d+\s*[、.：:)]/.test(text) || titleStyle.test(element.className)
      || (link && Array.from(link.querySelectorAll('*')).some(child => titleStyle.test(child.className)));
    const linkTitle = link && (link.textContent?.trim().length ?? 0) >= text.length * 0.6
      && safeRssUrl(link.getAttribute('href') ?? '', base || undefined)
      && linkHeading && hasProse;
    const heading = element.getAttribute('role') === 'heading'
      || (/(?:^|[-_\s])(title|heading|headline)(?:[-_\s]|$)|font-(?:bold|semibold)/i.test(element.className)
        && !element.querySelector('p,ul,ol,table,pre') && (element.parentElement.textContent?.length ?? 0) > 150);
    if (!linkTitle && !heading) continue;
    if (linkTitle) for (const parent of titleParents) parent.classList.add('article-content');
    const replacement = document.createElement(linkTitle ? 'h3' : 'h2');
    if (linkTitle && link) {
      const anchor = document.createElement('a');
      anchor.setAttribute('href', safeRssUrl(link.getAttribute('href') ?? '', base || undefined));
      anchor.textContent = text; replacement.appendChild(anchor);
    } else replacement.textContent = text;
    element.replaceWith(replacement);
  }
  // 图标旁的日期、计数等短元信息按一行处理，避免每个布局div变成独立段落。
  for (const element of document.querySelectorAll('div')) {
    if (!element.parentElement || !element.querySelector('svg') || element.querySelector('a,h1,h2,h3,h4,pre,table,img')) continue;
    const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text || text.length > 120) continue;
    const parts = Array.from(element.children).filter(child => child.tagName.toLowerCase() !== 'svg');
    if (parts.some(child => (child.textContent?.trim().length ?? 0) > 50)) continue;
    const replacement = document.createElement('p');
    replacement.textContent = parts.map(child => child.textContent?.trim()).filter(Boolean).join(' · ') || text;
    element.replaceWith(replacement);
  }
  for (const element of document.querySelectorAll('svg')) element.remove();
  const article = new Readability(document as unknown as Document, { maxElemsToParse: 50_000, charThreshold: 100 }).parse();
  const content = formatRssContent(article?.content ?? '', base);
  if (content.text.length < 100) throw new Error('原文未提供可提取的正文，可能需要登录或动态加载');
  return content;
}
