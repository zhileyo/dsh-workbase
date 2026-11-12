import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { groupStatEntries, StatsProjectPanel, type StatEntry } from '../src/client/StatsProjectPanel.js';

const entries: StatEntry[] = [
  { id: 's1', title: '第一条', detail: '刚刚', project: { projectId: 'p1', title: '同名项目', path: '/one' }, open() {} },
  { id: 's2', title: '第二条', detail: '刚刚', project: { projectId: 'p2', title: '同名项目', path: '/two' }, open() {} },
  { id: 's3', title: '第三条', detail: '刚刚', project: { projectId: 'p1', title: '同名项目', path: '/one' }, open() {} },
];

test('统计分组按项目身份区分同名项目，保持首次出现顺序与组内记录顺序', () => {
  const groups = groupStatEntries(entries);
  assert.deepEqual(groups.map(group => [group.project.projectId, group.entries.map(entry => entry.id)]), [
    ['p1', ['s1', 's3']], ['p2', ['s2']],
  ]);
  assert.deepEqual(groupStatEntries([]), []);
});

test('统计分组默认展示全部记录，提供项目搜索和分组数量，空诊断保留成功说明', () => {
  const html = renderToStaticMarkup(createElement(StatsProjectPanel, { entries, empty: '暂无记录' }));
  assert.match(html, /aria-label="搜索统计项目"/);
  assert.match(html, /全部项目/);
  assert.match(html, /data-project-group="p1"[^>]*aria-pressed="false"/);
  assert.match(html, /data-project-group="p2"/);
  assert.equal((html.match(/class="wb-stat-item stats-item"/g) ?? []).length, 3);
  const empty = renderToStaticMarkup(createElement(StatsProjectPanel, { entries: [], empty: '所有项目目录可用' }));
  assert.match(empty, /所有项目目录可用/);
  assert.doesNotMatch(empty, /data-project-group="p1"/);
});
