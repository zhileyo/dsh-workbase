import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Workbase } from '../src/client/Workbase.js';
import { UiMemory, type ClientPort } from '../src/client/api.js';

test('加载态渲染骨架屏而不是纯文字', () => {
  const api = {
    call: async () => new Promise(() => undefined),
    openSession() {}, async newSession() {}, pickDirectory: async () => null,
    async revealDirectory() { return false; }, async addProject() { return false; },
    async archiveSession() {}, subscribe: () => () => {},
  } as unknown as ClientPort;
  const html = renderToStaticMarkup(createElement(Workbase, { api, memory: new UiMemory() }));
  assert.ok(html.includes('wb-skeleton'), '加载态渲染骨架占位');
  assert.ok(html.includes('正在读取 Harness 项目…'), '保留读屏文案');
  assert.equal((html.match(/class="wb-skeleton/g) ?? []).length, 1);
});

test('设置尚未返回时首帧使用已保存的主题', () => {
  for (const theme of ['follow', 'dsh', 'fresh', 'warm', 'violet']) {
    const storage = {
      getItem: () => JSON.stringify({ search: '', homeScroll: 0, theme }),
      setItem() {}, removeItem() {},
    };
    const html = renderToStaticMarkup(createElement(Workbase, { api: {} as ClientPort, memory: new UiMemory(storage) }));
    assert.ok(html.includes(`data-theme="${theme}"`), `${theme} 首帧不应使用默认蓝色`);
    assert.equal(html.includes('visibility:hidden'), false);
    if (theme === 'warm') assert.ok(html.includes('class="wb c warm'));
  }
});

test('主题缓存缺失或无效时先显示中性骨架，隐藏带主题色的顶栏', () => {
  for (const theme of [undefined, 'invalid']) {
    const storage = {
      getItem: () => JSON.stringify({ search: '', homeScroll: 0, theme }),
      setItem() {}, removeItem() {},
    };
    const html = renderToStaticMarkup(createElement(Workbase, { api: {} as ClientPort, memory: new UiMemory(storage) }));
    assert.ok(html.includes('wb-skeleton'));
    assert.ok(html.includes('visibility:hidden'));
  }
});

test('已确认主题跨初始化持久化且保留搜索和草稿', () => {
  let stored = '';
  const storage = { getItem: () => stored || null, setItem: (_key: string, value: string) => { stored = value; }, removeItem() {} };
  const memory = new UiMemory(storage);
  memory.search = '查询';
  memory.composer.draft = '保留草稿';
  memory.theme = 'warm';
  const restored = new UiMemory(storage);
  assert.equal(restored.theme, 'warm');
  assert.equal(restored.search, '查询');
  assert.equal(restored.composer.draft, '保留草稿');
});
