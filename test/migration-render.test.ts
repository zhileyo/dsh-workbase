import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MigrationPreviewBlockers, MigrationPreviewView, MigrationRecordEntitiesView, MigrationSourceStateView } from '../src/client/MigrationPanel.js';
import { MIGRATION_UNAVAILABLE, MIGRATION_UNDO_ACTIVE, migrationRecordSchema, type MigrationPreview, type MigrationRecord } from '../src/shared/migration.js';

test('迁移预览显示源与目标身份、全部统计、设置规则及宿主阻断原因', () => {
  const endpoint = { projectId: 'p1', workspaceId: 'w1', title: '<script>用户标题</script>', path: '/example/project',
    counts: { active: 1, archived: 2, pending: 3, done: 4 } };
  const preview: MigrationPreview = { token: 'unused', revision: 0, expiresAt: 1000, kind: 'merge',
    source: endpoint, target: { ...endpoint, projectId: 'p2', path: '/example/target' },
    executable: false, blockers: [MIGRATION_UNAVAILABLE] };
  const html = renderToStaticMarkup(createElement(MigrationPreviewView, { preview }));
  for (const text of ['活跃会话', '归档会话', '待处理待办', '已完成待办', '/example/target', '保留目标项目名称', MIGRATION_UNAVAILABLE])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<script>用户标题'));
  assert.equal((html.match(/wb-migration-counts/g) ?? []).length, 2);
  preview.kind = 'directory';
  const updated = renderToStaticMarkup(createElement(MigrationPreviewView, { preview }));
  assert.equal((updated.match(/wb-migration-counts/g) ?? []).length, 1);
  assert.ok(updated.includes('保留项目身份、名称、全部会话、待办及设置'));
});

test('单页迁移预览使用四行数量对照，能力提示留在正文，真正错误呈现于页脚', () => {
  const endpoint = { projectId: 'p1', workspaceId: 'w1', title: '源', path: '/example/source',
    counts: { active: 0, archived: 0, pending: 1, done: 0 } };
  const preview: MigrationPreview = { token: 'unused', revision: 0, expiresAt: 1000, kind: 'merge',
    source: endpoint, target: { ...endpoint, projectId: 'p2', counts: { active: 1, archived: 0, pending: 0, done: 0 } },
    resultCounts: { active: 1, archived: 0, pending: 1, done: 0 },
    notices: ['源项目目录已不存在；保留的会话与待办仍参与预览。'],
    executable: false, blockers: [MIGRATION_UNAVAILABLE] };
  let html = renderToStaticMarkup(createElement(MigrationPreviewView, { preview, identities: false }));
  assert.equal((html.match(/<table/g) ?? []).length, 1);
  assert.equal((html.match(/<tr/g) ?? []).length, 5);
  assert.match(html, /待处理待办<\/th><td>1<\/td><td class="wb-migration-zero">0<\/td><td>1<\/td>/);
  for (const text of ['迁出', '目标现有', '迁移后', '源项目目录已不存在', MIGRATION_UNAVAILABLE]) assert.ok(html.includes(text), text);
  assert.equal(html.includes('wb-warning'), false, '能力缺失及已核实目录缺失不伪装为数据错误');
  preview.blockers.push('项目存在运行中的会话');
  html = renderToStaticMarkup(createElement(MigrationPreviewView, { preview, identities: false }));
  assert.equal(html.includes('wb-warning'), false, '阻断原因不再占用滚动正文');
  html = renderToStaticMarkup(createElement(MigrationPreviewBlockers, { preview }));
  assert.ok(html.includes('wb-migration-footer-note'));
  assert.ok(html.includes('项目存在运行中的会话'));
  preview.blockers.push(MIGRATION_UNDO_ACTIVE);
  preview.undoBlockers = [{ id: 'r1', sourceTitle: '1234', targetTitle: '12345', undoUntil: Date.UTC(2026, 10, 25, 12, 0, 31) }];
  html = renderToStaticMarkup(createElement(MigrationPreviewBlockers, { preview }));
  for (const text of ['1234', '12345', '撤销截止', '请先撤销相关迁移', '等待到期后重试']) assert.ok(html.includes(text), text);
  assert.equal(html.includes(MIGRATION_UNDO_ACTIVE), false, '有具体撤销记录时不重复旧的笼统提示');
  delete preview.resultCounts;
  html = renderToStaticMarkup(createElement(MigrationPreviewView, { preview, identities: false }));
  assert.equal((html.match(/>—<\/td>/g) ?? []).length, 4, '旧预览缺少去重结果时不把相加数量冒充结果');
});

test('迁移记录详情留存迁移前源项目状态与逐个实体状态，旧记录不编造状态', () => {
  const base = { id: 'r1', kind: 'merge',
    source: { projectId: 'p1', workspaceId: 'w1', title: '源', path: '/example/source' },
    target: { projectId: 'p2', workspaceId: 'w2', title: '目标', path: '/example/target' },
    status: 'completed', completedAt: 0, undoUntil: 1000, revertedAt: null };
  const record: MigrationRecord = migrationRecordSchema.parse({ ...base,
    entities: [
      { kind: 'session', id: 's1', sourceProjectId: 'p1', targetProjectId: 'p2', title: '会话一', archived: false, running: true },
      { kind: 'session', id: 's2', sourceProjectId: 'p1', targetProjectId: 'p2', title: '会话二', archived: true, running: false },
      { kind: 'todo', id: 't1', sourceProjectId: 'p1', targetProjectId: 'p2', title: '待办一', done: false },
    ],
    sourceState: { available: false, archived: false, agentCanChangeStatus: true,
      counts: { active: 1, archived: 1, pending: 1, done: 0 } } });
  let html = renderToStaticMarkup(createElement(MigrationSourceStateView, { state: record.sourceState! }));
  for (const text of ['迁移前源项目状态', '目录不可用', '活跃会话', '归档会话', '待处理待办', '已完成待办'])
    assert.ok(html.includes(text), text);
  html = renderToStaticMarkup(createElement(MigrationRecordEntitiesView, { record }));
  for (const text of ['迁移的会话', '迁移的待办', '会话一', '会话二', '待办一', '运行中', '已归档', '待处理', '状态'])
    assert.ok(html.includes(text), text);
  assert.equal(html.includes('已完成</td>'), false);
  // 旧记录没有标题与状态快照：显示ID并以占位符呈现，不把缺失当作活跃/待处理。
  const legacy: MigrationRecord = migrationRecordSchema.parse({ ...base,
    entities: [{ kind: 'session', id: 's9', sourceProjectId: 'p1', targetProjectId: 'p2' }] });
  html = renderToStaticMarkup(createElement(MigrationRecordEntitiesView, { record: legacy }));
  assert.ok(html.includes('s9'));
  assert.match(html, /<td>—<\/td>/);
});
