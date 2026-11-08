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
