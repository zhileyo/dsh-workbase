import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRss, previewOpml, exportOpml, cleanRssText } from '../src/server/rss-parser.js';
import { safeRssUrl } from '../src/shared/rss.js';

test('RSS/Atom/RDF parse real XML, CDATA, namespaces and safe article links', () => {
  const rss = parseRss(`<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>工程 &amp; 新闻</title><item><guid>x</guid><title>标题</title><link>/post</link><pubDate>Thu, 19 Nov 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>摘要<img src="https://tracking.invalid/pixel"></p>]]></description><content:encoded><![CDATA[<p>正文</p><script>alert(1)</script><iframe src="x">忽略</iframe>]]></content:encoded></item></channel></rss>`, 'https://news.org/feed');
  assert.equal(rss.title, '工程 & 新闻');
  assert.equal(rss.articles[0]?.url, 'https://news.org/post');
  assert.equal(rss.articles[0]?.body, '正文');
  assert.equal(rss.articles[0]?.summary, '摘要');
  assert.ok(rss.articles[0]!.publishedAt > 0);
  const atom = parseRss(`<a:feed xmlns:a="http://www.w3.org/2005/Atom" xml:base="https://news.org/"><a:title>Atom</a:title><a:entry xml:base="posts/"><a:id>id1</a:id><a:title>Entry</a:title><a:link rel="self" href="entry.xml"/><a:link rel="alternate" href="one"/><a:summary type="html">&lt;b&gt;摘要&lt;/b&gt;</a:summary><a:content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>正文</p></div></a:content></a:entry></a:feed>`, 'https://news.org/feed');
  assert.equal(atom.articles[0]?.url, 'https://news.org/posts/one');
  assert.equal(atom.articles[0]?.body, '正文');
  assert.equal(parseRss(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel><title>RDF</title></channel><item><title>X</title><link>javascript:alert(1)</link></item></rdf:RDF>`, 'https://news.org/feed').articles[0]?.url, '');
  assert.equal(safeRssUrl('https://user:secret@news.org/'), '');
  assert.equal(safeRssUrl('https://example.com/post', undefined, true), '');
  assert.equal(cleanRssText('<style>secret</style><p>A &amp; B</p><img src=x onerror=evil()>'), 'A & B');
});

test('malformed XML, entities, excessive nesting and non-feeds are rejected', () => {
  for (const xml of ['<rss><channel></rss>', '<rss/><rss/>', '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', '<html/>', '<rss><channel><title>&evil;</title></channel></rss>', '<rss a="1" a="2"/>', '<rss>' + '<x>'.repeat(70) + '</x>'.repeat(70) + '</rss>']) {
    assert.throws(() => parseRss(xml, 'https://news.org/feed'));
  }
});

test('OPML previews nested groups, invalid and duplicate URLs; exports escaped groups', () => {
  const xml = `<opml version="2.0"><body><outline text="工程"><outline text="内层"><outline text="A &amp; B" xmlUrl="https://news.org/feed"/></outline><outline text="Same" xmlUrl="https://news.org/feed#x"/><outline text="Bad" xmlUrl="file:///tmp/feed"/></outline></body></opml>`;
  const preview = previewOpml(xml, [], '');
  assert.equal(preview.candidates[0]?.groupName, '工程 / 内层');
  assert.equal(preview.duplicate, 1);
  assert.equal(preview.invalid, 1);
  const text = exportOpml([{ name: 'A & B', url: 'https://news.org/feed', groupId: 'g' }], [{ id: 'g', name: '工程', collapsed: false }, { id: 'empty', name: '空分组', collapsed: false }]);
  assert.match(text, /A &amp; B/);
  assert.match(text, /空分组/);
  assert.equal(previewOpml(text, [], '').valid, 1);
});
