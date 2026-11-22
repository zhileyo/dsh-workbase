import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRssContent } from '../src/server/rss-format.js';
import { parseRss } from '../src/server/rss-parser.js';
import { extractRssContent } from '../src/server/rss-content.js';

test('统一正文保留标题列表代码表格及链接，丢弃网站样式与可执行内容', () => {
  const content = formatRssContent('<h2 style="font-size:99px">标题</h2><p>介绍 <a href="/repo" onclick="evil()">项目</a></p><ul><li>一</li><li>二</li></ul><pre><code>a  b\n  c</code></pre><table><tr><th>名称</th><td>值</td></tr></table><script>evil()</script><img src="/tracking"><a href="javascript:evil()">坏链接</a>', 'https://news.org/article');
  assert.equal(content.nodes[0]?.tag, 'h2');
  assert.match(JSON.stringify(content.nodes), /https:\/\/news.org\/repo/);
  assert.match(JSON.stringify(content.nodes), /"tag":"ul"|"tag":"pre"|"tag":"table"/);
  assert.ok(content.text.includes('a  b\n  c'));
  assert.doesNotMatch(JSON.stringify(content.nodes), /onclick|style|javascript:|tracking|evil\(\)/);
});

test('RSS HTML、Atom XHTML和纯文本正文使用相同结构且保留相对链接', () => {
  const rss = parseRss('<rss><channel><item><title>标题</title><content:encoded><![CDATA[<h2>小标题</h2><p><a href="/a">链接</a></p>]]></content:encoded></item></channel></rss>', 'https://news.org/rss');
  assert.equal(rss.articles[0]?.bodyContent?.[0]?.tag, 'h2');
  const atom = parseRss('<feed><entry><title>标题</title><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><h3>标题</h3><p><a href="/a">链接</a> &lt;文字&gt;</p></div></content></entry></feed>', 'https://news.org/feed');
  assert.match(JSON.stringify(atom.articles[0]?.bodyContent), /https:\/\/news.org\/a/);
  assert.match(atom.articles[0]!.body, /<文字>/);
  const plain = parseRss('<feed><entry><title>标题</title><content type="text">x &lt; y\n下一行</content></entry></feed>', 'https://news.org/feed');
  assert.equal(plain.articles[0]?.body, 'x < y\n下一行');
});
test('无语义的短链接卡片在正文抽取时保留标题，图标元信息合并为一行', () => {
  const content = extractRssContent(`<html><body><article><h1>文章名称</h1><div class="font-semibold">工具分类</div><div><div><div>1、</div><a href="/project"><div>项目名称</div></a></div><div><div><svg></svg><span>Star 285</span></div><div><svg></svg><span>7 天前</span></div></div><p>${'工具详细介绍，帮助读者了解功能和使用方法。'.repeat(20)}</p></div></article></body></html>`, 'https://news.org/article');
  const json = JSON.stringify(content.nodes);
  assert.match(json, /"tag":"h3"/);
  assert.match(json, /https:\/\/news.org\/project/);
  assert.match(json, /Star 285 · 7 天前/);
});
