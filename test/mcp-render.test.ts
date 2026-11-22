import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const panel = readFileSync(new URL('../src/client/McpPanel.tsx', import.meta.url), 'utf8');
const prototype = readFileSync(new URL('../docs/ui/ui-directions.html', import.meta.url), 'utf8');
test('连接器面板所有原型职责类均有实际样式，不自造开关、卡片或布局', () => {
  for (const token of new Set([...panel.matchAll(/className="([^"]+)"/g)].flatMap(match => match[1]!.split(' '))))
    if (!token.startsWith('wb-')) assert.ok(prototype.includes(`.${token}`), `不存在的原型 CSS: ${token}`);
  for (const token of ['settings-layout', 'settings-content', 'settings-panel', 'settings-subtabs', 'stats-group-search',
    'integration-group-title', 'integration-group-list', 'stats-group-entry', 'stats-group-copy',
    'integration-record-icon', 'integration-record-title', 'integration-record-actions',
    'integration-detail-layout', 'integration-detail-main', 'integration-detail-body'])
    assert.ok(panel.includes(`className="${token}"`), token);
  assert.match(panel, /<label className="integration-card-toggle"/);
  assert.match(panel, /<input type="checkbox" role="switch"/);
  assert.match(panel, /navigation\?: React.ReactNode/);
  assert.match(panel, /title="工作台概览".*className="stats-drawer"/);
  assert.doesNotMatch(panel, /integration-(switch|tabs|search|detail-content|add")/);
});
test('连接器两级标签页使用 roving tabIndex、方向键与真实 aria-controls 关联', () => {
  for (const id of ['integration-mcp-page', 'integration-mcp-add-pane'])
    assert.ok(panel.includes(`aria-controls="${id}"`) && panel.includes(`id="${id}"`));
  assert.match(panel, /tabIndex=\{tab === key \? 0 : -1\}/);
  assert.match(panel, /tabIndex=\{addTab === key \? 0 : -1\}/);
  assert.match(panel, /ArrowLeft.*ArrowRight.*Home.*End/);
  assert.doesNotMatch(panel, /window\.confirm/);
});
test('连接器市场按钮和来源详情复用技能市场控件，刷新取消过期响应', () => {
  assert.match(panel, /type Tab = 'connections' \| 'catalog'/);
  assert.match(panel, /name="settings" label="市场来源" outlined/);
  assert.match(panel, /name="refresh".*outlined disabled=\{busy \|\| marketLoading/);
  assert.match(panel, /className="integration-toolbar" data-compact-search/);
  assert.match(panel, /marketRevision\]/);
  assert.match(panel, /clearTimeout\(timer\); controller.abort\(\)/);
  assert.match(panel, /finally\(\(\) => \{ if \(!controller.signal.aborted\) setMarketLoading\(false\)/);
  assert.match(panel, /<footer className="dialog-footer">/);
  assert.match(panel, /type="submit" form="integration-mcp-source-form"/);
  assert.match(panel, /<section className="integration-market-sources" aria-label="市场来源"/);
  assert.match(panel, /detail.kind === 'sources' && <>[\s\S]*?<form id="integration-mcp-source-form"/);
  assert.doesNotMatch(panel, /kind: 'source'/);
  assert.doesNotMatch(prototype, /data-i-action="add-market-source"/);
  assert.match(prototype, /mcp:\[\['connections','我的连接'\],\['catalog','连接器市场'\]\]/);
  assert.ok(prototype.includes('data-i-action="mcp-market-sources"'));
  assert.ok(prototype.includes('data-i-action="refresh-mcp-market"'));
});
