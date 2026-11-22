import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { toggleSkillScope } from '../src/shared/skills.js';

const panel = readFileSync(new URL('../src/client/SkillsPanel.tsx', import.meta.url), 'utf8');
const scope = readFileSync(new URL('../src/client/ScopePicker.tsx', import.meta.url), 'utf8');
const prototype = readFileSync(new URL('../docs/ui/ui-directions.html', import.meta.url), 'utf8');
test('技能面板完全沿用原型类名与共用 Modal Picker IconButton', () => {
  for (const token of new Set([...(panel + scope).matchAll(/className="([^"]+)"/g)].flatMap(match => match[1]!.split(' '))))
    assert.ok(prototype.includes(`.${token}`), `不存在的原型 CSS: ${token}`);
  for (const component of ['ModalFlow', 'Modal', 'Picker', 'IconButton']) assert.ok(panel.includes(`<${component}`));
  for (const token of ['settings-layout', 'settings-content', 'settings-panel', 'settings-subtabs',
    'integration-record', 'integration-detail-layout', 'rules-project-tag'])
    assert.ok((panel + scope).includes(`className="${token}"`));
  assert.match(panel, /className=\{`integration-detail-body/);
  assert.match(panel, /title="工作台概览".*className="stats-drawer"/);
  assert.match(panel, /navigation\?: ReactNode/);
  assert.doesNotMatch(panel, /window\.confirm|style=\{/);
});
test('技能多选全局与项目双向互斥，空项目不能提交', () => {
  assert.deepEqual(toggleSkillScope(['global'], 'p1'), ['p1']);
  assert.deepEqual(toggleSkillScope(['p1', 'p2'], 'global'), ['global']);
  assert.deepEqual(toggleSkillScope(['p1'], 'p1'), []);
  assert.deepEqual(toggleSkillScope(['global'], 'global'), []);
  assert.match(panel, /!scopeValues\.length/);
  assert.match(panel, /<ScopePicker/);
  assert.match(scope, /multipleValues=\{values\}/);
  assert.match(scope, /ResizeObserver/);
  assert.match(scope, /while \(count > 0\)/);
});
test('技能页签、上传过期读取、来源输入法与读屏关联保留', () => {
  assert.match(panel, /aria-controls="skills-page"/);
  assert.match(panel, /id="skills-page"/);
  assert.match(panel, /aria-controls="skills-add-pane"/);
  assert.match(panel, /tabIndex=\{tab === key \? 0 : -1\}/);
  assert.match(panel, /revision !== requestRevision\.current/);
  assert.match(panel, /renameComposing\.current \|\| busy/);
  assert.match(panel, /row\.owner !== 'workbase'/);
  assert.match(panel, /active\?\.isConnected && document\.activeElement === document\.body/);
  assert.match(panel, /active\.focus\(\{ preventScroll: true \}\)/);
});
