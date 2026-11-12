import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Settings } from '../src/client/Settings.js';
import { BackupSettings } from '../src/client/BackupSettings.js';
import { initialState, type Snapshot } from '../src/shared/model.js';

function render(stats = true, selectedProject: string | null = null) {
  const preferences = initialState().preferences;
  preferences.home.stats = stats;
  preferences.selectedProject = selectedProject;
  const snapshot: Snapshot = { preferences, revision: 0, syncedAt: 0, projects: [], conflicts: [], sessionMarks: {} };
  return renderToStaticMarkup(createElement(Settings, {
    snapshot, busy: false, preview: () => {}, save: async () => true,
    onClose: () => {}, pickDirectory: async () => null,
  }));
}

test('更新期间显隐开关禁用，自动更新为子设置且其他配置可继续编辑', () => {
  const snapshot: Snapshot = { preferences: initialState().preferences, revision: 0, syncedAt: 0, projects: [], conflicts: [], sessionMarks: {} };
  const html = (pluginUpdateBusy: boolean) => renderToStaticMarkup(createElement(Settings, {
    snapshot, busy: false, pluginUpdateBusy, preview: () => {}, save: async () => true,
    onClose: () => {}, pickDirectory: async () => null,
  }));
  assert.match(html(true), /aria-label="显示插件更新"[^>]*disabled=""/);
  assert.doesNotMatch(html(false), /aria-label="显示插件更新"[^>]*disabled=""/);
  assert.match(html(true), /class="setting-dependent"[^>]*><label[^>]*>.*?开启自动更新/);
  assert.doesNotMatch(html(true), /aria-label="启动打开首页"[^>]*disabled=""/);
  assert.match(html(true), /aria-label="开启自动更新"/);
});

test('设置包含六个可访问分类及首页、项目两组子分类', () => {
  const html = render();
  for (const label of ['首页显示', '外观配置', '通用配置', '备份恢复', '项目配置', '其他组件', '模块布局', '统计设置', '全局配置', '数据备份', '数据恢复', '执行状态']) {
    assert.ok(html.includes(`>${label}</button>`), label);
  }
  assert.ok(html.includes('暂无项目专属配置'));
  assert.ok(html.includes('显示插件更新'));
  assert.ok(html.includes('显示快捷会话'));
  assert.ok(html.includes('显示数据统计'));
  assert.ok(html.includes('显示运行统计'));
  assert.ok(html.includes('允许 Agent 管理待办'));
  assert.ok(!html.includes('允许 Agent 修改待办状态'));
  assert.ok(html.indexOf('theme-mode-note') < html.indexOf('theme-choices'));
});

test('备份恢复子分类分别展示操作与状态，隐藏表单保留挂载及可访问关联', () => {
  for (const tab of ['backup', 'restore', 'status'] as const) {
    const html = renderToStaticMarkup(createElement(BackupSettings, {
      tab, value: initialState().preferences.backup, onChange: () => {},
      disabled: false, pickDirectory: async () => null,
    }));
    const backup = html.slice(html.indexOf('id="wb-settings-backup-panel-backup"'), html.indexOf('id="wb-settings-backup-panel-restore"'));
    const restore = html.slice(html.indexOf('id="wb-settings-backup-panel-restore"'), html.indexOf('id="wb-settings-backup-panel-status"'));
    const status = html.slice(html.indexOf('id="wb-settings-backup-panel-status"'));
    for (const [name, panel] of [['backup', backup], ['restore', restore], ['status', status]] as const) {
      const opening = panel.slice(0, panel.indexOf('>'));
      assert.equal(opening.includes('hidden=""'), name !== tab);
      assert.ok(opening.includes(`aria-labelledby="wb-settings-backup-tab-${name}"`));
    }
    assert.ok(backup.includes('启动时自动备份') && backup.includes('立即备份'));
    assert.ok(backup.includes('密钥位置：') && backup.includes('backup/identity.txt'));
    assert.ok(backup.includes('密钥不在备份文件内'));
    assert.ok(!restore.includes('恢复密钥文件路径') && !status.includes('恢复密钥：'));
    assert.ok(restore.includes('备份文件绝对路径') && restore.includes('预览恢复'));
    assert.ok(!backup.includes('预览恢复') && !status.includes('预览恢复'));
    assert.ok(status.includes('备份状态') && status.includes('恢复状态'));
    assert.ok(!status.includes('启动时自动备份'));
  }
});

test('关闭统计隐藏统计子菜单，项目详情入口默认选择项目配置', () => {
  const html = render(false, 'p');
  assert.match(html, /id="wb-settings-tab-project"[^>]*aria-selected="true"/);
  assert.match(html, /id="wb-settings-home-tab-stats"[^>]*hidden=""/);
  assert.match(html, /aria-label="最近会话样式"[^>]*aria-haspopup/);
  assert.ok(html.includes('settings-text-control'));
  assert.ok(!html.includes('required=""'), '隐藏分类不应被原生必填校验拦截');
});
