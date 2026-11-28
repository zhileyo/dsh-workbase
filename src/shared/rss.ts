import { z } from 'zod';

/** 系统分组名不占自定义分组身份：同名自定义分组会被拒绝，OPML 导入则归入默认分组。 */
export const RSS_RESERVED_GROUP_NAMES = ['默认分组', '未分组', '全部订阅'] as const;
export function rssGroupNameReserved(name: string): boolean {
  return (RSS_RESERVED_GROUP_NAMES as readonly string[]).includes(name);
}

export const RSS_LIMITS = {
  responseBytes: 2 * 1024 * 1024, cacheBytes: 8 * 1024 * 1024,
  articles: 2000, perFeed: 200, feeds: 500, groups: 100,
  concurrency: 4, timeoutMs: 15_000, redirects: 5, undoMs: 30_000,
} as const;
export type RssConfig = { refreshMinutes: 0 | 15 | 30 | 60 };
export const rssGroupSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(80), collapsed: z.boolean(),
});
export const rssFeedSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(80), url: z.string().max(2048),
  groupId: z.string(), enabled: z.boolean(), trusted: z.boolean(),
  revision: z.number().int().nonnegative(), installedAt: z.number(),
  checkedAt: z.number().optional(), error: z.string().max(1000).optional(),
  etag: z.string().max(1000).optional(), lastModified: z.string().max(1000).optional(),
});
export type RssGroup = z.infer<typeof rssGroupSchema>;
export type RssFeed = z.infer<typeof rssFeedSchema>;
export const rssContentTags = ['div', 'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'del', 'a', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'] as const;
export interface RssContentNode { tag?: typeof rssContentTags[number]; text?: string; href?: string; children?: RssContentNode[] }
const rssContentNodeSchema: z.ZodType<RssContentNode> = z.lazy(() => z.object({
  tag: z.enum(rssContentTags).optional(), text: z.string().max(50_000).optional(),
  href: z.string().max(2048).optional(), children: z.array(rssContentNodeSchema).max(5000).optional(),
}));
export const rssArticleSchema = z.object({
  id: z.string(), feedId: z.string(), key: z.string().max(2048),
  title: z.string().max(1000), summary: z.string().max(5000), body: z.string().max(50_000),
  bodySource: z.literal('original').optional(),
  bodyContent: z.array(rssContentNodeSchema).max(5000).optional(),
  url: z.string().max(2048), publishedAt: z.number(), fetchedAt: z.number(),
  sequence: z.number().int().nonnegative(),
});
export type RssArticle = z.infer<typeof rssArticleSchema>;
export interface RssSummary { total: number; failed: number; enabled: number; articles: number; checkedAt: number | null }
export interface RssSnapshot {
  revision: number; feeds: RssFeed[]; groups: RssGroup[]; articles: RssArticle[];
  ungroupedCollapsed?: boolean;
  ungroupedPosition?: number;
  undo?: { token: string; name: string; expiresAt: number }[];
  refreshing: string[]; summary: RssSummary; recommendations: RssRecommendation[];
}
export interface RssRecommendation {
  id: string; name: string; description: string; url: string; attribution: string;
  website?: string; category?: string; language?: 'zh' | 'en';
}
export interface RssArticleQuery { feedId?: string; groupId?: string; query?: string; limit?: number; offset?: number }
export interface RssIncrementalQuery extends RssArticleQuery { scope: string }
export interface RssOpmlCandidate { index: number; name: string; url: string; groupName: string; duplicate: boolean; error?: string }
export interface RssOpmlPreview { candidates: RssOpmlCandidate[]; valid: number; duplicate: number; invalid: number }
export interface RssRefreshResult { succeeded: number; failed: number; cancelled: number; errors: { feedId: string; message: string }[] }

/** 首页与详情共用近期发布口径；抓取时间不代表文章发布时间。 */
export function rssRecentArticles(snapshot: Pick<RssSnapshot, 'feeds' | 'articles'>, days: number, now = Date.now()): RssArticle[] {
  const feeds = new Set(snapshot.feeds.filter(feed => feed.enabled).map(feed => feed.id));
  const since = now - days * 86400000;
  return snapshot.articles.filter(article => feeds.has(article.feedId) && article.publishedAt > 0
    && article.publishedAt >= since && article.publishedAt <= now);
}

/** 系统分组不占自定义分组身份；旧配置默认紧随全部订阅。 */
export function rssNavigationGroups(snapshot: Pick<RssSnapshot, 'groups' | 'ungroupedCollapsed' | 'ungroupedPosition'>): RssGroup[] {
  const groups = [...snapshot.groups];
  const position = Math.max(0, Math.min(groups.length, snapshot.ungroupedPosition ?? 0));
  groups.splice(position, 0, { id: '', name: '默认分组', collapsed: snapshot.ungroupedCollapsed ?? false });
  return groups;
}

/** Network-independent validation. Private address checks belong to the pinned transport. */
export function safeRssUrl(value: string, base?: string, excludeExamples = false): string {
  if (!value.trim() || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value.trim())) return '';
  try {
    const url = base ? new URL(value.trim(), base) : new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (excludeExamples && /(^|\.)(example\.(com|net|org)|example|test|invalid)$/i.test(url.hostname)) return '';
    url.hash = '';
    return url.href.length <= 2048 ? url.href : '';
  } catch { return ''; }
}
export function rssOriginalUrl(article: Pick<RssArticle, 'url'>, feed?: Pick<RssFeed, 'url'>): string {
  const url = safeRssUrl(article.url, undefined, true);
  return url && url !== feed?.url ? url : '';
}

export const RSS_RECOMMENDATIONS: readonly RssRecommendation[] = [
  { id: 'joho-no-todai-en', name: 'Joho no Todai', url: 'https://joho-todai.com/en/rss/', website: 'https://joho-todai.com/', category: 'technology', language: 'en', description: '' },
  { id: 'ithome', name: 'IT之家', url: 'https://www.ithome.com/rss/', website: 'https://www.ithome.com/', category: 'technology', language: 'zh', description: '数码产品、科技行业与软件资讯。' },
  { id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', website: 'https://sspai.com/', category: 'technology', language: 'zh', description: '数字生活、效率工具与使用经验。' },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', website: 'https://www.ifanr.com/', category: 'technology', language: 'zh', description: '科技产品、设计与数字生活观察。' },
  { id: 'hacker-news', name: 'Hacker News', url: 'https://news.ycombinator.com/rss', website: 'https://news.ycombinator.com/', category: 'technology', language: 'en', description: '技术社区的热门文章与讨论链接。' },
  { id: 'arxiv-ai', name: 'arXiv · Artificial Intelligence', url: 'https://rss.arxiv.org/rss/cs.AI', website: 'https://arxiv.org/list/cs.AI/recent', category: 'research', language: 'en', description: '人工智能论文更新；非发布日可能没有条目。' },
  { id: 'hugging-face', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', website: 'https://huggingface.co/blog', category: 'research', language: 'en', description: '开放模型、数据集与机器学习实践。' },
  { id: 'deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', website: 'https://deepmind.google/blog/', category: 'research', language: 'en', description: '研究团队发布的 AI 研究和产品进展。' },
  { id: 'appinn', name: '小众软件', url: 'https://www.appinn.com/feed/', website: 'https://www.appinn.com/', category: 'software', language: 'zh', description: '实用软件、工具推荐和更新介绍。' },
  { id: 'harness', name: 'DeepSeek Harness releases', url: 'https://github.com/deepseek-ai/DeepSeek-Harness/releases.atom', website: 'https://github.com/deepseek-ai/DeepSeek-Harness/releases', category: 'software', language: 'en', description: 'DSH 官方 GitHub 版本发布记录。' },
  { id: 'python', name: 'Python Insider', url: 'https://blog.python.org/feeds/posts/default', website: 'https://blog.python.org/', category: 'software', language: 'en', description: 'Python 官方版本发布与项目消息。' },
  { id: 'rust', name: 'Rust Blog', url: 'https://blog.rust-lang.org/feed.xml', website: 'https://blog.rust-lang.org/', category: 'software', language: 'en', description: 'Rust 官方版本与语言生态进展。' },
  { id: 'nodejs', name: 'Node.js Blog', url: 'https://nodejs.org/en/feed/blog.xml', website: 'https://nodejs.org/en/blog', category: 'software', language: 'en', description: 'Node.js 官方版本、安全更新与项目消息。' },
  { id: 'moonlight', name: '月光博客', url: 'https://www.williamlong.info/rss.xml', website: 'https://www.williamlong.info/', category: 'reading', language: 'zh', description: '互联网、技术应用与个人博客文章。' },
  { id: 'simon-willison', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', website: 'https://simonwillison.net/', category: 'reading', language: 'en', description: '开发实践、数据工具与 AI 使用笔记。' },
  { id: 'nasa', name: 'NASA', url: 'https://www.nasa.gov/feed/', website: 'https://www.nasa.gov/', category: 'interests', language: 'en', description: '航天任务、科学发现与宇宙探索。' },
  { id: 'xkcd', name: 'xkcd', url: 'https://xkcd.com/rss.xml', website: 'https://xkcd.com/', category: 'interests', language: 'en', description: '关于科学、技术和日常生活的漫画更新。' },
].map(value => ({ ...value, language: value.language as 'zh' | 'en', attribution: '发布者原生 RSS / Atom' }));
