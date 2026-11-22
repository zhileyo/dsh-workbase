import assert from 'node:assert/strict';
import { test } from 'node:test';
import { english } from '../src/client/i18n-en.js';
import { setLanguage, t } from '../src/client/i18n.js';
import { readFileSync } from 'node:fs';

test('C20：诊断结果成功、跳过、失败计数使用完整英文模板', () => {
  const key = '{p0}：成功 {p1} · 跳过 {p2} · 失败 {p3}';
  assert.ok(english[key]);
  const panel = readFileSync(new URL('../src/client/DiagnosticsPanel.tsx', import.meta.url), 'utf8');
  assert.ok(panel.includes(`t('${key}'`));
  setLanguage('en');
  try {
    assert.equal(t(key, { p0: t('缓存重建'), p1: 2, p2: 1, p3: 0 }),
      'Cache rebuild: succeeded 2 · skipped 1 · failed 0');
  } finally { setLanguage('follow'); }
});
