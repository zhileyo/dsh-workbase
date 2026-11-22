import { safeRssUrl, type RssContentNode } from '../shared/rss.js';

/** 将已清理的阅读结构交给宿主MarkdownText；源站HTML从不交给渲染器。 */
export function rssReadingMarkdown(nodes: RssContentNode[]): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]{}()#+.!|~>-])/g, '\\$1');
  const plain = (node: RssContentNode): string => node.text ?? node.children?.map(plain).join('') ?? '';
  const fence = (text: string) => '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1)));
  const render = (node: RssContentNode, depth: number): string => {
    if (depth > 32) return '';
    if (node.text !== undefined) return escape(node.text);
    const children = node.children ?? [];
    const value = children.map(child => render(child, depth + 1)).join('');
    switch (node.tag) {
      case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return `\n\n${'#'.repeat(Number(node.tag.slice(1)))} ${value.trim()}\n\n`;
      case 'div': case 'p': return `\n\n${value.trim()}\n\n`;
      case 'strong': return `**${value}**`;
      case 'em': return `*${value}*`;
      case 'del': return `~~${value}~~`;
      case 'br': return '  \n';
      case 'hr': return '\n\n---\n\n';
      case 'a': {
        const href = safeRssUrl(node.href ?? '');
        return href ? `[${value}](<${href.replace(/</g, '%3C').replace(/>/g, '%3E')}>)` : value;
      }
      case 'pre': {
        const text = plain(node), delimiter = fence(text);
        return `\n\n${delimiter}\n${text}\n${delimiter}\n\n`;
      }
      case 'code': {
        const text = plain(node).replace(/\n/g, ' '), delimiter = fence(text);
        return `${delimiter} ${text} ${delimiter}`;
      }
      case 'ul': case 'ol':
        return '\n\n' + children.map((child, i) => `${node.tag === 'ol' ? `${i + 1}.` : '-'} ${render(child, depth + 1).trim().replace(/\n/g, '\n  ')}`).join('\n') + '\n\n';
      case 'blockquote': return '\n\n' + value.trim().split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
      case 'table': {
        const rows: RssContentNode[] = [];
        const collect = (entries: RssContentNode[]) => entries.forEach(entry => {
          if (entry.tag === 'tr') rows.push(entry);
          else if (entry.tag === 'thead' || entry.tag === 'tbody') collect(entry.children ?? []);
        });
        collect(children);
        const columns = Math.max(0, ...rows.map(row => row.children?.length ?? 0));
        if (!columns) return value;
        const line = (row: RssContentNode) => '| ' + Array.from({ length: columns }, (_, i) => render(row.children?.[i] ?? {}, depth + 1).trim().replace(/\n/g, ' ')).join(' | ') + ' |';
        return '\n\n' + [line(rows[0]!), '| ' + Array(columns).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n') + '\n\n';
      }
      default: return value;
    }
  };
  return nodes.map(node => render(node, 0)).join('').trim();
}
