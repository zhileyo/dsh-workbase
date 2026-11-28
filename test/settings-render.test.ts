import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { Settings } from '../src/client/Settings.js';
import { ExtensionSettings, sessionIsolationView } from '../src/client/ExtensionSettings.js';
import { SettingsSubtabs } from '../src/client/settings-subtabs.js';
import { defaultExtensionConfig } from '../src/shared/extensions.js';
import { BackupSettings, coverageLabel } from '../src/client/BackupSettings.js';
import { ProjectRulesSettings } from '../src/client/ProjectRulesSettings.js';
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

test('扩展设置快捷入口定位对应分类，订阅命名与导航顺序统一', () => {
  const snapshot: Snapshot = { preferences: initialState().preferences, revision: 0, syncedAt: 0, projects: [], conflicts: [], sessionMarks: {} };
  for (const initialExtension of ['skills', 'mcp', 'rss'] as const) {
    const html = renderToStaticMarkup(createElement(Settings, {
      snapshot, busy: false, preview() {}, save: async () => true, onClose() {}, pickDirectory: async () => null, initialExtension,
    }));
    assert.match(html, /id="wb-settings-tab-extensions"[^>]*aria-selected="true"/);
    assert.match(html, new RegExp(`id="wb-extension-tab-${initialExtension}"[^>]*aria-selected="true"`));
    assert.match(html, /id="wb-extension-tab-rss"[^>]*>订阅<\/button>/);
    assert.doesNotMatch(html, /旧版停用目录/);
    const nav = html.split('aria-label="设置分类"')[1]!.split('</nav>')[0]!;
    assert.ok(nav.indexOf('wb-settings-tab-extensions') < nav.indexOf('wb-settings-tab-tools'));
    assert.ok(nav.indexOf('wb-settings-tab-tools') < nav.indexOf('wb-settings-tab-backup'));
  }
});

test('其他组件默认显示通用组件，语音二级菜单仅在组件开关开启时可见', () => {
  const snapshot: Snapshot = { preferences: initialState().preferences, revision: 0, syncedAt: 0, projects: [], conflicts: [], sessionMarks: {} };
  const html = (enabled: boolean) => renderToStaticMarkup(createElement(Settings, {
    snapshot: { ...snapshot, preferences: { ...snapshot.preferences, speechComponentEnabled: enabled } },
    busy: false, preview: () => {}, save: async () => true, onClose: () => {}, pickDirectory: async () => null,
  }));
  assert.doesNotMatch(html(false), /id="wb-settings-tab-speech"/);
  assert.match(html(false), /id="wb-settings-tools-tab-general"[^>]*aria-selected="true"/);
  assert.match(html(false), /id="wb-settings-tools-tab-speech"[^>]*hidden=""/);
  assert.doesNotMatch(html(true), /id="wb-settings-tools-tab-speech"[^>]*hidden=""/);
  const general = html(false).split('id="wb-settings-tools-panel-general"')[1]!.split('id="wb-settings-tools-panel-speech"')[0]!;
  assert.match(general, /插件更新/);
  assert.match(general, /终端扩展/);
  assert.match(general, /aria-label="语音播报"/);
});

test('更新期间显隐开关禁用，自动更新为子设置且其他配置可继续编辑', () => {
  const snapshot: Snapshot = { preferences: initialState().preferences, revision: 0, syncedAt: 0, projects: [], conflicts: [], sessionMarks: {} };
  const html = (pluginUpdateBusy: boolean) => renderToStaticMarkup(createElement(Settings, {
    snapshot, busy: false, pluginUpdateBusy, preview: () => {}, save: async () => true,
    onClose: () => {}, pickDirectory: async () => null,
  }));
  assert.match(html(true), /aria-label="插件更新"[^>]*disabled=""/);
  assert.doesNotMatch(html(false), /aria-label="插件更新"[^>]*disabled=""/);
  assert.match(html(true), /class="setting-dependent"[^>]*><label[^>]*>.*?开启自动更新/);
  assert.doesNotMatch(html(true), /aria-label="启动打开首页"[^>]*disabled=""/);
  assert.match(html(true), /aria-label="开启自动更新"/);
});

test('设置包含可访问分类及外观布局、项目、私人订制子分类', () => {
  const html = render();
  for (const label of ['通用配置', '外观布局', '项目配置', '私人订制', '通用组件', '语音播报', '伙伴档案', '用户档案', '行为准则', '记忆进化', '备份恢复', '其他组件', '主题配色', '首页模块', '统计卡片', '全局设置', '初始化设置', '项目规则', '数据备份', '数据恢复', '执行状态']) {
    assert.ok(html.includes(`>${label}</button>`), label);
  }
  assert.doesNotMatch(html, />全局配置<\/button>|>项目初始化<\/button>/);
  assert.ok(html.includes('添加规则'));
  assert.ok(html.includes('插件更新'));
  assert.ok(html.includes('显示快捷会话'));
  assert.ok(html.includes('显示数据统计'));
  assert.ok(html.includes('显示运行统计'));
  assert.ok(html.includes('允许 Agent 管理待办'));
  assert.ok(!html.includes('允许 Agent 修改待办状态'));
  assert.ok(html.indexOf('theme-mode-note') < html.indexOf('theme-choices'));
});

test('全局规则在首项，项目规则使用可搜索列表及同一正文编辑器', () => {
  const html = render();
  const panel = html.slice(html.indexOf('id="wb-settings-project-panel-global"'), html.indexOf('id="wb-settings-project-panel-initialization"'));
  assert.ok(panel.indexOf('全局规则') < panel.indexOf('默认项目根目录'));
  assert.doesNotMatch(panel, /rules-md-field/);
  assert.match(html, /aria-label="搜索规则名称或应用项目"/);
  assert.match(html, /aria-label="项目规则列表"/);
});

test('全局规则停用时隐藏正文，重新启用显示原有草稿', () => {
  const value = initialState().preferences.rules;
  value.global.content = '保留的全局规则草稿';
  const html = () => renderToStaticMarkup(createElement(ProjectRulesSettings, {
    scope: 'global', value, projects: [], disabled: false, onChange: () => {},
  }));
  assert.doesNotMatch(html(), /全局规则正文|保留的全局规则草稿/);
  value.global.enabled = true;
  assert.match(html(), /全局规则正文/);
  assert.match(html(), /保留的全局规则草稿/);
  value.global.enabled = false;
  assert.doesNotMatch(html(), /全局规则正文|保留的全局规则草稿/);
  assert.equal(value.global.content, '保留的全局规则草稿');
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

test('关闭统计隐藏统计子菜单，设置默认进入通用配置', () => {
  const html = render(false, 'p');
  assert.match(html, /id="wb-settings-tab-general"[^>]*aria-selected="true"/);
  assert.match(html, /id="wb-settings-tab-project"[^>]*aria-selected="false"/);
  assert.match(html, /id="wb-settings-appearance-tab-stats"[^>]*hidden=""/);
  assert.match(html, /aria-label="最近会话样式"[^>]*aria-haspopup/);
  assert.ok(html.includes('settings-text-control'));
  assert.ok(!html.includes('required=""'), '隐藏分类不应被原生必填校验拦截');
});

test('项目初始化二级菜单包含分组及导入补齐，全局页只保留根目录与权限', () => {
  for (const enabled of [false, true]) {
    const preferences = initialState().preferences;
    preferences.projectInitialization = { ...preferences.projectInitialization, basic: enabled, agent: enabled, git: enabled };
    const snapshot: Snapshot = { preferences, revision: 0, syncedAt: 0, projects: [], conflicts: [], sessionMarks: {} };
    const html = renderToStaticMarkup(createElement(Settings, {
      snapshot, busy: false, preview: () => {}, save: async () => true, onClose: () => {}, pickDirectory: async () => null,
    }));
    const root = html.slice(html.indexOf('id="wb-settings-project-panel-global"'), html.indexOf('id="wb-settings-project-panel-initialization"'));
    assert.ok(root.includes('默认项目根目录') && root.includes('允许 Agent 管理待办'));
    assert.ok(!root.includes('项目基础文件') && !root.includes('添加已有项目时补齐缺失内容'));
    assert.match(html, /id="wb-settings-project-tab-initialization"[^>]*aria-controls="wb-settings-project-panel-initialization"/);
    const global = html.slice(html.indexOf('id="wb-settings-project-panel-initialization"'), html.indexOf('id="wb-settings-project-panel-single"'));
    assert.match(global, /aria-label="添加已有项目时补齐缺失内容"/);
    for (const label of ['项目基础文件', 'Agent 协作规范', 'Git 初始化']) {
      const checkbox = global.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0];
      assert.ok(checkbox);
      assert.equal(checkbox.includes('disabled=""'), false);
      assert.equal(checkbox.includes('checked=""'), enabled);
    }
    assert.match(global, /aria-label="提交规则内容"/);
    assert.match(global, /rules-md-field/);
    assert.match(global, /rules-md-preview/);
    assert.match(global, /maxLength="10000"/);
    assert.doesNotMatch(global, /<details|<summary|自定义提交规则|恢复默认提交规则/);
    assert.doesNotMatch(global, /<label[^>]*>提交规则内容<\/label>/);
  }
});

test('扩展配置二级页签复用设置页签控件，不再手写键盘公式', async () => {
  const source = await readFile(new URL('../src/client/ExtensionSettings.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ArrowLeft/, '不再手写键盘导航');
  assert.doesNotMatch(source, /% 3/, '不再硬编码页签数量');
  assert.match(source, /<SettingsSubtabs /);
  const html = renderToStaticMarkup(createElement(ExtensionSettings, {
    value: defaultExtensionConfig(), onChange: () => {}, disabled: false, tab: 'mcp', onTabChange: () => {},
  }));
  const shared = renderToStaticMarkup(createElement(SettingsSubtabs, {
    scope: 'extension', idPrefix: 'wb-extension', label: '扩展配置分类', value: 'mcp',
    options: [{ value: 'skills', label: '技能' }, { value: 'mcp', label: '连接器' }, { value: 'rss', label: '订阅' }],
    onChange: () => {},
  }));
  assert.ok(html.includes(shared), '扩展配置页签与设置页签由同一控件渲染');
});
test('连接器能力读取失败不冒充宿主不支持会话隔离，并可重试', async () => {
  const source = await readFile(new URL('../src/client/ExtensionSettings.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.catch\(\(\) => \{\}\)/, '读取失败不得静默吞掉');
  assert.match(source, /setMcpError/, '读取失败要留下可显示的原因');
  assert.match(source, /setAttempt/, '要能重试');
  const failed = sessionIsolationView(false, '连接器能力读取失败');
  assert.equal(failed.retry, true);
  assert.equal(failed.unsupported, false, '读失败不算确认不支持');
  assert.match(failed.help, /读取失败/);
  assert.doesNotMatch(failed.help, /不支持会话隔离/);
  const confirmed = sessionIsolationView(false, '');
  assert.equal(confirmed.unsupported, true);
  assert.equal(confirmed.retry, false);
  assert.match(confirmed.help, /不支持会话隔离/);
  assert.deepEqual(sessionIsolationView(true, ''), { help: '', unsupported: false, retry: false });
});
test('备份覆盖明细用用户能理解的措辞替代内部术语「观察副本」', async () => {
  assert.equal(coverageLabel.observation, '运行中读取');
  assert.equal(coverageLabel.verified, '已校验');
  const panel = await readFile(new URL('../src/client/BackupSettings.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /观察副本/);
  const dict = await readFile(new URL('../src/client/i18n-en.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(dict, /观察副本/, '词典不再保留内部术语');
  assert.match(dict, /运行中读取\|/);
  const backup = await readFile(new URL('../src/server/backup.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(backup, /文件观察副本/);
  assert.match(backup, /运行中读取，与磁盘写入并发时不保证一致/);
  const sources = await readFile(new URL('../src/server/backup-sources.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sources, /文件观察副本/);
});