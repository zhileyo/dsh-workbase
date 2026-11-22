import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RssArticleList, RssNavigation, RssReading } from '../src/client/RssPanel.js';
import type { RssSnapshot } from '../src/shared/rss.js';
import { setLanguage, errorText } from '../src/client/i18n.js';
import { rssReadingMarkdown } from '../src/client/rss-reading.js';

test('RSS统计短文案在中英文下按完整模板翻译', () => {
  try {
    setLanguage('en');
    assert.equal(errorText('缓存 12 篇'), '12 cached articles');
    assert.equal(errorText('缓存 12 篇 · 异常 2'), '12 cached articles · 2 issues');
    assert.equal(errorText('最近 14 天发布的已缓存文章'), 'Cached articles published in the last 14 days');
    assert.equal(errorText('最近 14 天发布的已缓存文章 · 1 个来源尚未刷新 · 异常 2'), 'Cached articles published in the last 14 days · 1 feeds not refreshed yet · 2 issues');
  } finally { setLanguage('zh'); }
});

const snapshot: RssSnapshot = {
  revision: 1, refreshing: [], recommendations: [],
  summary: { total: 1, failed: 0, enabled: 0, articles: 1, checkedAt: null },
  groups: [{ id: 'g', name: '工程', collapsed: false }],
  feeds: [{ id: 'f', name: '源', url: 'https://news.org/rss', groupId: 'g', enabled: false, trusted: false, revision: 1, installedAt: 1 }],
  articles: [{ id: 'a', feedId: 'f', key: 'k', title: '<script>title</script>', summary: '', body: '<img src=x>', url: 'javascript:evil()', publishedAt: 0, fetchedAt: 1, sequence: 1 }],
};
test('RSS近期列表与卡片口径一致，切回全部文章保留停用源和历史文章', () => {
  const now = Date.now(), day = 86400000;
  const data = structuredClone(snapshot);
  data.feeds.push({ ...data.feeds[0]!, id: 'enabled', enabled: true });
  data.articles = [
    { ...data.articles[0]!, id: 'recent', title: '近期文章', feedId: 'enabled', publishedAt: now - day },
    { ...data.articles[0]!, id: 'older', title: '十天前文章', feedId: 'enabled', publishedAt: now - 10 * day },
    { ...data.articles[0]!, id: 'paused', title: '暂停源文章', publishedAt: now - day },
    { ...data.articles[0]!, id: 'unknown', title: '未知时间文章', feedId: 'enabled', publishedAt: 0 },
  ];
  const render = (recentDays?: number) => renderToStaticMarkup(createElement(RssArticleList, {
    snapshot: data, query: {}, recentDays, onRead() {}, onFeed() {},
  }));
  assert.match(render(7), /近期文章/);
  assert.doesNotMatch(render(7), /十天前文章|暂停源文章|未知时间文章/);
  assert.match(render(14), /十天前文章/);
  assert.match(render(), /暂停源文章/);
  assert.match(render(), /未知时间文章/);
});
test('RSS article rendering uses prototype cards, plain text and safe independent links', () => {
  const html = renderToStaticMarkup(createElement(RssArticleList, { snapshot, query: {}, onRead() {}, onFeed() {} }));
  assert.match(html, /rss-article-row/);
  assert.match(html, /rss-article-open/);
  assert.match(html, /此来源未提供摘要/);
  assert.match(html, /已暂停更新/);
  assert.doesNotMatch(html, /<script>|javascript:evil|<img/);
  const reading = renderToStaticMarkup(createElement(RssReading, { article: snapshot.articles[0]!, feed: snapshot.feeds[0] }));
  assert.doesNotMatch(reading, /<img|footer|javascript:/);
  assert.match(reading, /&lt;img/);
});
test('RSS结构正文安全渲染，首帧只有加载占位且无摘要警告', () => {
  const article = { ...snapshot.articles[0]!, body: '', summary: '摘要', url: 'https://news.org/article' };
  const loading = renderToStaticMarkup(createElement(RssReading, { article, api: { call: async () => article } as any }));
  assert.match(loading, /rss-reader-loading|aria-busy="true"/);
  assert.doesNotMatch(loading, /rss-reader-summary-note|>摘要</);
  const html = renderToStaticMarkup(createElement(RssReading, { article: { ...article, body: '正文', bodyContent: [
    { tag: 'h2', children: [{ text: '标题' }] }, { tag: 'ul', children: [{ tag: 'li', children: [{ text: '列表' }] }] },
    { tag: 'a', href: 'javascript:evil()', children: [{ text: '<script>安全文本</script>' }] },
    { tag: 'a', href: 'https://news.org/a', children: [{ text: '原链接' }] },
  ] } }));
  assert.match(html, /<h2>标题<\/h2>|<ul><li>列表<\/li><\/ul>/);
  assert.match(html, /href="https:\/\/news.org\/a"/);
  assert.doesNotMatch(html, /javascript:|<script>/);
});
test('RSS优先复用宿主Markdown渲染，文本中的HTML和Markdown不能改变阅读结构', () => {
  const content = [{ tag: 'h2' as const, children: [{ text: '标题' }] }, { tag: 'p' as const, children: [{ text: '<img src=x> [冒充链接](javascript:evil())' }] }];
  const markdown = rssReadingMarkdown(content);
  assert.match(markdown, /## 标题/);
  assert.doesNotMatch(markdown, /<img|\[冒充链接\]\(javascript:/);
  let received = '';
  const api = { renderMarkdown(text: string) { received = text; return createElement('div', { 'data-host-markdown': true }, text); } } as any;
  const html = renderToStaticMarkup(createElement(RssReading, { article: { ...snapshot.articles[0]!, bodyContent: content }, api }));
  assert.equal(received, markdown);
  assert.match(html, /data-host-markdown/);
});
test('RSS navigation preserves groups, count, compact edit and narrow Picker controls', () => {
  const html = renderToStaticMarkup(createElement(RssNavigation, {
    snapshot, groupId: undefined, feedId: '', draft: { id: 'g', value: '草稿', error: '保存失败' },
    onGroup() {}, onFeed() {}, onEdit() {}, onDraft() {}, onFinish() {}, onAdd() {},
    onAction() {}, onMove() {},
  }));
  assert.match(html, /rss-group-name/);
  assert.match(html, /data-rss-group-name="g"/);
  assert.match(html, /value="草稿"/);
  assert.match(html, /保存失败/);
  assert.match(html, /rss-mobile-source/);
  assert.match(html, /选择订阅分组/);
  assert.match(html, /1 篇/);
  assert.doesNotMatch(html, /style="[^"]*(font-size|border-radius)/);
});
test('RSS分组和来源的选中区域包含整行独立操作', () => {
  const props = { snapshot, feedId: '', onGroup() {}, onFeed() {}, onEdit() {}, onDraft() {}, onFinish() {}, onAdd() {}, onAction() {}, onMove() {} };
  const group = renderToStaticMarkup(createElement(RssNavigation, { ...props, groupId: 'g' }));
  assert.match(group, /class="rss-nav-row rss-group-heading" data-rss-selected="true"/);
  const feed = renderToStaticMarkup(createElement(RssNavigation, { ...props, groupId: 'g', feedId: 'f' }));
  assert.match(feed, /class="rss-nav-row rss-group-heading" data-rss-selected="false"/);
  assert.match(feed, /class="rss-nav-row rss-source-row" data-rss-selected="true"/);
});
test('RSS默认分组显示固定名称且没有重命名菜单', () => {
  const html = renderToStaticMarkup(createElement(RssNavigation, {
    snapshot, groupId: '', feedId: '', onGroup() {}, onFeed() {}, onEdit() {},
    onDraft() {}, onFinish() {}, onAdd() {}, onAction() {}, onMove() {},
  }));
  assert.match(html, /默认分组/);
  assert.match(html, /class="rss-group-toggle"[^>]*data-default="true"[^>]*><svg/);
  assert.doesNotMatch(html, /未分组/);
  const fixed = html.slice(html.indexOf('aria-controls="rss-children-none"'), html.indexOf('id="rss-children-none"'));
  assert.match(fixed, /默认分组/);
  assert.match(fixed, /默认分组的分组操作/);
  assert.doesNotMatch(fixed, /重命名|删除分组|双击|F2/);
  assert.ok(html.indexOf('data-rss-group-select=""') < html.indexOf('data-rss-group-select="g"'));
  const moved = renderToStaticMarkup(createElement(RssNavigation, {
    snapshot: { ...snapshot, ungroupedPosition: 1 }, feedId: '', onGroup() {}, onFeed() {}, onEdit() {},
    onDraft() {}, onFinish() {}, onAdd() {}, onAction() {}, onMove() {},
  }));
  assert.ok(moved.indexOf('data-rss-group-select="g"') < moved.indexOf('data-rss-group-select=""'));
});
test('known RSS issues follow UI language but user content remains verbatim', () => {
  setLanguage('en');
  try {
    const value = { ...snapshot, feeds: snapshot.feeds.map(feed => ({ ...feed, error: '缓存不可用，请重新刷新' })) };
    const html = renderToStaticMarkup(createElement(RssNavigation, {
      snapshot: value, feedId: '', onGroup() {}, onFeed() {}, onEdit() {}, onDraft() {},
      onFinish() {}, onAdd() {}, onAction() {}, onMove() {},
    }));
    assert.doesNotMatch(html, /title="缓存不可用/);
    assert.match(html, /源/);
    const reading = renderToStaticMarkup(createElement(RssReading, { article: { ...snapshot.articles[0]!, body: '缓存不可用，请重新刷新' } }));
    assert.match(reading, /缓存不可用，请重新刷新/, 'user body is never translated as a known error');
  } finally { setLanguage('zh'); }
});
