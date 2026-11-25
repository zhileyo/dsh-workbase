import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { initialState, emptyMark, type Snapshot, type Project } from '../src/shared/model.js';
import { createElement } from 'react';
import { Modal } from '../src/client/ui.js';
import { UiMemory } from '../src/client/api.js';
import { defaultProjectInitialization } from '../src/shared/project-initialization.js';
import { defaultProjectRules } from '../src/shared/project-rules.js';

const nodes = (node: any): any[] => !node || typeof node !== 'object' ? []
  : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children), ...nodes(node.props?.main), ...nodes(node.props?.detail)];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('项目迁移直接选择项目并内联预览，切换丢弃旧请求与令牌，无路径输入或二次预览', async () => {
  const { project } = fixture();
  const target = (id: string) => ({ ...project, projectId: id, workspaceId: id, path: `/project/${id}`, title: '同名项目' });
  const requests: { command: any; signal: AbortSignal; resolve(value: any): void }[] = [], discarded: string[] = [];
  const api = { call(command: any, signal: AbortSignal) {
    if (command.op === 'migration-discard') { discarded.push(command.token); return Promise.resolve(null); }
    return new Promise(resolve => requests.push({ command, signal, resolve }));
  } };
  const h = await harness('src/client/MigrationPanel.tsx', 'MigrationPanel', {
    api, project, projects: [project, target('b'), target('c')], onClose() {},
  }, { effects: true });
  const picker = () => h.render().find(n => n.props.label === '迁移到项目')!;
  const flow = () => h.render().find(n => n.type?.name === 'ModalFlow')!;
  assert.ok(picker(), '项目下拉框必须直接出现');
  assert.equal(picker().props.options.some((o: any) => o.value === project.projectId), false);
  assert.equal(h.render().some(n => n.type?.name === 'DirectoryInput'), false);
  assert.equal(h.render().some(n => n.type === 'button' && n.props.children === '预览迁移'), false);
  h.commitLayout();
  picker().props.onChange('b'); h.render(); h.commitLayout();
  assert.equal(requests[0]!.command.op, 'migration-preview-project');
  assert.equal(requests[0]!.command.targetProjectId, 'b');
  picker().props.onChange('c'); h.render(); h.commitLayout();
  assert.equal(requests[0]!.signal.aborted, true);
  const preview = (id: string, token: string) => ({ token, kind: 'merge', revision: 0, expiresAt: Date.now() + 600000,
    source: { projectId: project.projectId, counts: {} }, target: { projectId: id, counts: {} }, executable: false, blockers: ['阻断'] });
  requests[0]!.resolve(preview('b', 'old')); await flush();
  requests[1]!.resolve(preview('c', 'current')); await flush();
  assert.equal(h.render().find(n => n.type?.name === 'MigrationPreviewView')!.props.preview.target.projectId, 'c');
  assert.equal(Boolean(flow().props.detail), false);
  assert.ok(discarded.includes('old'));
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '确认迁移')!.props.disabled, true);
  h.unmount();
  assert.ok(discarded.includes('current'));
});

test('迁移确认只提交一次，核实成功回执才刷新，未知结果与刷新失败均禁止重复提交', async () => {
  for (const mode of ['success', 'unknown', 'refresh-failure']) {
    const { project } = fixture(), target = { ...project, projectId: 'target', workspaceId: 'target-w', title: '目标' };
    const identity = (p: Project) => ({ projectId: p.projectId, workspaceId: p.workspaceId, title: p.title, path: p.path });
    const counts = { active: 1, archived: 0, pending: 2, done: 0 };
    let writes = 0, closed = 0, refreshed = 0, resolve!: (value: any) => void;
    const api = { call(command: any) {
      if (command.op === 'migration-preview-project') return Promise.resolve({ token: 'token', kind: 'merge', revision: 0,
        expiresAt: Date.now() + 600000, source: { ...identity(project), counts }, target: { ...identity(target), counts },
        executable: true, blockers: [] });
      if (command.op === 'migration-discard') return Promise.resolve(null);
      writes++; return new Promise(done => { resolve = done; });
    } };
    const h = await harness('src/client/MigrationPanel.tsx', 'MigrationPanel', {
      api, project, projects: [project, target], onClose() { closed++; },
      async onMigrated(id: string) { assert.equal(id, 'target'); refreshed++; if (mode === 'refresh-failure') throw new Error('刷新失败'); },
    }, { effects: true });
    h.render(); h.commitLayout();
    h.render().find(n => n.props.label === '迁移到项目')!.props.onChange('target');
    h.render(); h.commitLayout(); await flush();
    const submit = () => h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
    const button = () => h.render().find(n => n.type === 'button' && n.props.children === '确认迁移')!;
    assert.equal(button().props.disabled, false);
    submit(); submit(); assert.equal(writes, 1); assert.equal(button().props.disabled, true);
    resolve(mode === 'unknown' ? {} : { id: 'record', kind: 'merge', status: 'completed',
      source: identity(project), target: identity(target), completedAt: 1, undoUntil: 2, revertedAt: null, entities: [] });
    await flush();
    assert.equal(refreshed, mode === 'unknown' ? 0 : 1);
    assert.equal(closed, mode === 'success' ? 1 : 0);
    submit(); assert.equal(writes, 1);
    assert.equal(button().props.disabled, true);
    if (mode !== 'success') assert.ok(h.render().some(n => n.props.role === 'alert'));
    h.unmount();
  }
});

test('迁移预览失败保留选择可重试，版本变化和目标归档立即禁用旧预览确认', async () => {
  const { project } = fixture(), target = { ...project, projectId: 'target', title: '目标' };
  let reads = 0;
  const props = { api: { call(command: any) {
    if (command.op === 'migration-discard') return Promise.resolve(null);
    reads++;
    return reads === 1 ? Promise.reject(new Error('读取失败')) : Promise.resolve({ token: 'ok', revision: 0, kind: 'merge',
      expiresAt: Date.now() + 600000, source: { projectId: project.projectId }, target: { projectId: 'target' }, executable: true, blockers: [] });
  } }, project, projects: [project, target], revision: 0, onClose() {} };
  const h = await harness('src/client/MigrationPanel.tsx', 'MigrationPanel', props, { effects: true });
  h.render(); h.commitLayout();
  h.render().find(n => n.props.label === '迁移到项目')!.props.onChange('target');
  h.render(); h.commitLayout(); await flush();
  assert.equal(h.render().find(n => n.props.label === '迁移到项目')!.props.value, 'target');
  h.render().find(n => n.type === 'button' && n.props.children === '重试')!.props.onClick();
  h.render(); h.commitLayout(); await flush();
  const disabled = () => h.render().find(n => n.type === 'button' && n.props.children === '确认迁移')!.props.disabled;
  assert.equal(disabled(), false);
  target.archived = true; assert.equal(disabled(), true);
  target.archived = false; props.revision = 1; assert.equal(disabled(), true);
  h.unmount();
});

test('迁移记录直接撤销，核验批次回执后刷新源项目，未知结果禁止重复提交', async () => {
  for (const mode of ['success', 'unknown']) {
    const { project } = fixture();
    const endpoint = { projectId: project.projectId, workspaceId: project.workspaceId, title: project.title, path: project.path };
    const record = { id: 'batch', kind: 'merge', status: 'completed', source: endpoint,
      target: { ...endpoint, projectId: 'target' }, completedAt: 1, undoUntil: Date.now() + 1000,
      revertedAt: null, entities: [], canUndo: true, expired: false };
    let writes = 0, refreshed = 0, closed = 0, resolve!: (value: any) => void;
    const api = { call(command: any) {
      if (command.op === 'migration-records') return Promise.resolve([record]);
      assert.equal(command.op, 'migration-undo'); assert.equal(command.id, 'batch'); writes++;
      return new Promise(done => { resolve = done; });
    } };
    const h = await harness('src/client/MigrationPanel.tsx', 'MigrationPanel', {
      api, project, projects: [project], records: true, onClose() { closed++; },
      async onMigrated(id: string, reverted: boolean) { assert.equal(id, project.projectId); assert.equal(reverted, true); refreshed++; },
    }, { effects: true });
    h.render(); h.commitLayout(); await flush();
    h.render().find(n => n.type === 'button' && n.props.className === 'stats-item')!.props.onClick();
    const button = () => h.render().find(n => n.type === 'button' && n.props.children === '撤销迁移')!;
    assert.equal(button().props.disabled, false);
    button().props.onClick(); button().props.onClick(); assert.equal(writes, 1);
    const { canUndo: _, expired: __, ...receipt } = record;
    resolve(mode === 'unknown' ? {} : { ...receipt, undoUntil: 1000, status: 'reverted', revertedAt: 2 });
    await flush();
    assert.equal(refreshed, mode === 'success' ? 1 : 0); assert.equal(closed, mode === 'success' ? 1 : 0);
    assert.equal(button().props.disabled, true);
    button().props.onClick(); assert.equal(writes, 1);
    if (mode === 'unknown') assert.ok(h.render().some(n => n.props.role === 'alert'));
    h.unmount();
  }
});

test('迁移撤销失败保留弹窗内联告警，失败信息不再转投 Toast', async () => {
  const { project } = fixture();
  const endpoint = { projectId: project.projectId, workspaceId: project.workspaceId, title: project.title, path: project.path };
  const record = { id: 'batch', kind: 'merge', status: 'completed', source: endpoint,
    target: { ...endpoint, projectId: 'target' }, completedAt: 1, undoUntil: Date.now() + 1000,
    revertedAt: null, entities: [], canUndo: true, expired: false };
  const api = { call(command: any) {
    if (command.op === 'migration-records') return Promise.resolve([record]);
    if (command.op === 'migration-undo') return Promise.reject(new Error('源项目目录已不存在，请恢复原目录后再撤销迁移'));
    return Promise.resolve(null);
  } };
  const h = await harness('src/client/MigrationPanel.tsx', 'MigrationPanel', {
    api, project, projects: [project], records: true, onClose() {},
    async onMigrated() {},
  }, { effects: true });
  h.render(); h.commitLayout(); await flush();
  h.render().find(n => n.type === 'button' && n.props.className === 'stats-item')!.props.onClick();
  const button = () => h.render().find(n => n.type === 'button' && n.props.children === '撤销迁移')!;
  button().props.onClick(); await flush();
  const alerts = h.render().filter(n => n.props.role === 'alert');
  assert.equal(alerts.length > 0, true, '撤销失败写回弹窗内联告警');
  assert.ok(alerts.some(n => String(n.props.children).includes('源项目目录已不存在，请恢复原目录后再撤销迁移')),
    '内联告警包含具体失败原因');
  assert.equal(button().props.disabled, true);
  h.unmount();
});

test('RSS摘要请求跟随统计天数变化，清除旧数字并丢弃迟到结果', async () => {
  const requests: { input: any; signal: AbortSignal; resolve(value: any): void }[] = [];
  const api = { call(command: any, signal: AbortSignal) {
    return new Promise(resolve => requests.push({ input: command.input, signal, resolve }));
  }, subscribe() { return () => {}; } };
  const enabled = { skills: false, mcp: false, rss: true };
  const h = await harness('src/client/extension-summary.ts', 'useExtensionSummaries', {}, {
    effects: true, setInterval() { return 1; }, clearInterval() {},
  });
  h.invoke(api, enabled, 7); h.commitLayout();
  assert.equal(requests[0]!.input.days, 7);
  h.invoke(api, enabled, 14); h.commitLayout();
  assert.equal(requests[0]!.signal.aborted, true);
  assert.equal(requests[1]!.input.days, 14);
  requests[0]!.resolve({ count: 99, detail: '旧结果', errors: 0 }); await flush();
  assert.equal(h.invoke(api, enabled, 14).rss.status, 'loading');
  requests[1]!.resolve({ count: 2, detail: '新结果', errors: 0 }); await flush();
  assert.equal(h.invoke(api, enabled, 14).rss.value.count, 2);
  h.unmount();
});

test('RSS统计入口清除旧筛选，无局部时间Picker并始终跟随统计天数', async () => {
  const api = { call: async () => ({}) }, memory = new UiMemory();
  memory.extensions.rss = { tab: 'catalog', group: 'old-group', search: '旧搜索', scroll: 0 };
  const data = { revision: 1, articles: [], groups: [], feeds: [], recommendations: [], refreshing: [], summary: {} };
  const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, memory, embedded: true, recentDays: 7, onClose() {} });
  h.seedPanelSnapshot(0, api, 'rss', data);
  const list = () => h.render().find(n => n.type?.name === 'RssArticleList')!;
  const hasPicker = () => h.render().some(n => n.props.label === '文章时间范围');
  assert.equal(list().props.recentDays, 7);
  assert.equal(list().props.query.groupId, undefined);
  assert.equal(list().props.query.feedId, '');
  assert.equal(list().props.query.query, '');
  assert.equal(hasPicker(), false);
  h.props.recentDays = 14;
  assert.equal(list().props.recentDays, 14);
  assert.equal(hasPicker(), false);
});

test('RSS默认分组菜单支持移动，拖拽能以默认分组为目标且不提供改名删除', async () => {
  const moved: any[] = [];
  const h = await harness('src/client/RssPanel.tsx', 'RssNavigation', {
    snapshot: { groups: [{ id: 'g', name: '工程', collapsed: false }], articles: [], feeds: [] }, feedId: '',
    onGroup() {}, onFeed() {}, onEdit() {}, onDraft() {}, onFinish() {}, onAdd() {}, onAction() {}, onMove(input: any) { moved.push(input); },
  });
  const menu = h.render().find(n => n.props.label === '默认分组的分组操作')!;
  assert.deepEqual(Array.from(menu.props.items, (item: any) => item.label), ['下移']);
  menu.props.items[0].action();
  assert.equal(JSON.stringify(moved[0]), JSON.stringify({ kind: 'group', id: '', targetId: 'g', position: 'after' }));
  const row = (id: string) => h.render().find(n => n.props['data-rss-target'] === 'group' && n.props['data-rss-id'] === id)!;
  assert.equal(row('').props.draggable, true);
  const event = { preventDefault() {}, stopPropagation() {}, clientY: 1, dataTransfer: { setData() {} },
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 40 }) } };
  row('g').props.onDragStart(event);
  row('').props.onDragOver(event);
  row('').props.onDrop(event);
  assert.equal(JSON.stringify(moved[1]), JSON.stringify({ kind: 'group', id: 'g', targetId: '', position: 'before' }));
});

test('RSS阅读自动拉取正文，失败保留摘要可重试，切换与关闭后丢弃旧结果', async () => {
  const pending: { resolve(value: any): void; reject(error: Error): void; signal: AbortSignal }[] = [];
  const calls: any[] = [];
  const article = { id: 'a', sequence: 1, title: '文章', url: 'https://news.org/a', body: '', summary: '摘要' };
  const props: any = { article, api: { call(command: any, signal: AbortSignal) {
    calls.push(command); return new Promise((resolve, reject) => pending.push({ resolve, reject, signal }));
  } } };
  const h = await harness('src/client/RssPanel.tsx', 'RssReading', props, { effects: true });
  const text = () => h.render().filter(n => ['integration-reading', 'rss-reader-summary-note', 'rss-reader-loading'].includes(n.props.className)).map(n => JSON.stringify(n.props.children)).join('');
  assert.match(text(), /正在拉取/);
  assert.doesNotMatch(text(), /摘要/);
  assert.equal(h.render().some(n => n.props.className === 'rss-reader-summary-note'), false);
  h.commitLayout();
  assert.equal(calls[0].method, 'article.fetch');
  pending[0]!.reject(new Error('RSS HTTP 503')); await flush();
  assert.match(text(), /503/); assert.match(text(), /摘要/);
  h.render().find(n => n.type === 'button' && n.props.children === '重试')!.props.onClick();
  h.render(); h.commitLayout();
  assert.equal(calls.length, 2);
  props.article = { ...article, id: 'b', url: 'https://news.org/b', summary: '第二篇摘要' };
  h.render(); h.commitLayout();
  assert.equal(pending[1]!.signal.aborted, true);
  pending[1]!.resolve({ body: '迟到的第一篇正文' }); await flush();
  assert.doesNotMatch(text(), /迟到|第二篇摘要/); assert.match(text(), /正在拉取/);
  pending[2]!.resolve({ body: '第二篇完整正文' }); await flush();
  assert.match(text(), /第二篇完整正文/); assert.doesNotMatch(text(), /正在拉取|第二篇摘要/);
  h.unmount();
  assert.equal(pending[2]!.signal.aborted, true);
});

test('RSS分组名称每次点击立即筛选并切换折叠，双击不重命名', async () => {
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const selected: unknown[] = [], actions: any[] = [], edited: string[] = [];
  const props = {
    snapshot: { groups: [{ id: 'g', name: '工程', collapsed: false }], feeds: [], articles: [] },
    feedId: '', onGroup(id: unknown) { selected.push(id); }, onAction(...args: any[]) { actions.push(args); },
    onEdit(id: string) { edited.push(id); }, onFeed() {}, onDraft() {}, onFinish() {}, onAdd() {}, onMove() {},
  };
  const h = await harness('src/client/RssPanel.tsx', 'RssNavigation', props, {
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); }, effects: true,
  });
  const name = (id: string) => h.render().find(n => n.type === 'button' && (n.props['data-rss-group-select'] === id || n.props.title?.startsWith(id ? '工程 ·' : '默认分组 ·')))!;
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); };
  h.render(); h.commitLayout();
  name('g').props.onClick({ detail: 1 });
  assert.deepEqual(selected, ['g']);
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0], 'group.update');
  assert.equal(actions[0][1].collapsed, true);
  assert.equal(timers.size, 0, '单击不设置等待定时器');
  tick();
  assert.equal(actions.length, 1);
  selected.length = actions.length = 0;
  name('g').props.onClick({ detail: 1 });
  props.snapshot.groups[0]!.collapsed = true;
  name('g').props.onClick({ detail: 2 });
  assert.equal(name('g').props.onDoubleClick, undefined);
  tick();
  assert.deepEqual(edited, []);
  assert.deepEqual(selected, ['g', 'g']);
  assert.equal(actions.length, 2);
  assert.equal(actions[0][1].collapsed, true);
  assert.equal(actions[1][1].collapsed, false);
  selected.length = actions.length = 0;
  name('').props.onClick({ detail: 0 });
  assert.equal(selected.at(-1), '');
  assert.equal(actions.at(-1)[1].id, '');
  assert.equal(actions.at(-1)[1].collapsed, true);
  const all = h.render().find(n => n.type === 'button' && n.props['aria-pressed'] === true)!;
  all.props.onClick({ detail: 0 });
  assert.equal(selected.at(-1), undefined);
  assert.equal(actions.length, 1, '全部订阅只筛选');
});

test('RSS分组整行点击覆盖箭头数量和空白，名称只切换一次，菜单编辑拖拽不误触', async () => {
  const actions: any[] = [], selected: string[] = [];
  const props: any = { snapshot: { groups: [{ id: 'g', name: '工程', collapsed: false }], feeds: [], articles: [] },
    feedId: '', onGroup(id: string) { selected.push(id); }, onFeed() {}, onEdit() {}, onDraft() {}, onFinish() {}, onAdd() {}, onMove() {},
    onAction(_method: string, input: any) { actions.push(input); props.snapshot.groups[0].collapsed = input.collapsed; } };
  const h = await harness('src/client/RssPanel.tsx', 'RssNavigation', props);
  const row = () => h.render().find(n => n.props.className === 'rss-nav-row rss-group-heading' && n.props['data-rss-id'] === 'g')!;
  const event = (excluded = false) => ({ target: { closest() { return excluded ? {} : null; } } });
  for (const area of ['箭头', '数量', '空白']) {
    row().props.onClick(event());
    assert.equal(actions.length, selected.length, `${area}每次只执行一次`);
  }
  assert.deepEqual(actions.map(value => value.collapsed), [true, false, true]);
  const name = h.render().find(n => n.props['data-rss-group-select'] === 'g')!;
  name.props.onClick(); row().props.onClick(event(true));
  assert.equal(actions.length, 4, '名称按钮的冒泡不重复切换');
  row().props.onClick(event(true));
  assert.equal(actions.length, 4, '独立控件不折叠');
  props.draft = { id: 'g', value: '草稿', error: '' };
  row().props.onClick(event());
  assert.equal(actions.length, 4, '编辑期间整行不折叠');
  props.draft = undefined;
  row().props.onDragStart({ stopPropagation() {}, dataTransfer: { setData() {} } });
  row().props.onClick(event());
  assert.equal(actions.length, 4, '拖拽期间不折叠');
  row().props.onDragEnd();
  row().props.onClick(event());
  assert.equal(actions.length, 5);
});

test('RSS订阅名称无双击改名，F2保留原位编辑及Enter失焦保存去重', async () => {
  const writes: any[] = [];
  let resolve!: () => void;
  const feed = { id: 'f', name: '原名称', revision: 7, enabled: true };
  const h = await harness('src/client/RssPanel.tsx', 'RssFeedName', {
    feed, selected: false, onFeed() {},
    onRename(value: any, name: string) { writes.push({ value, name }); return new Promise<void>(r => { resolve = r; }); },
  });
  const label = () => h.render().find(n => n.type === 'strong')!;
  const input = () => h.render().find(n => n.type === 'input')!;
  assert.equal(label().props.onDoubleClick, undefined);
  assert.equal(label().props.title, undefined);
  h.render().find(n => n.type === 'button')!.props.onKeyDown({ key: 'F2', nativeEvent: {}, preventDefault() {} });
  assert.equal(input().props.value, '原名称');
  input().props.onChange({ target: { value: '  新名称  ' } });
  input().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() {}, stopPropagation() {} });
  assert.equal(writes.length, 0);
  input().props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() {}, stopPropagation() {} });
  input().props.onBlur();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, '新名称');
  assert.equal(writes[0].value.revision, 7);
  resolve(); await flush();
  assert.equal(h.render().some(n => n.type === 'input'), false);
});

test('RSS订阅原位改名拒绝空白，失败保留草稿，Escape取消且失焦不提交', async () => {
  const writes: string[] = [];
  const h = await harness('src/client/RssPanel.tsx', 'RssFeedName', {
    feed: { id: 'f', name: '原名称', revision: 1, enabled: true }, selected: false, onFeed() {},
    async onRename(_feed: any, name: string) { writes.push(name); throw new Error('保存失败'); },
  });
  const input = () => h.render().find(n => n.type === 'input')!;
  h.render().find(n => n.type === 'button')!.props.onKeyDown({ key: 'F2', nativeEvent: {}, preventDefault() {} });
  input().props.onChange({ target: { value: '   ' } }); input().props.onBlur(); await flush();
  assert.equal(writes.length, 0);
  assert.equal(input().props['aria-invalid'], true);
  input().props.onChange({ target: { value: '新名称' } }); input().props.onBlur(); await flush();
  assert.deepEqual(writes, ['新名称']);
  assert.equal(input().props.value, '新名称');
  assert.equal(input().props['aria-invalid'], true);
  const stale = input();
  stale.props.onKeyDown({ key: 'Escape', nativeEvent: {}, preventDefault() {}, stopPropagation() {} });
  stale.props.onBlur(); await flush();
  assert.equal(h.render().some(n => n.type === 'input'), false);
  assert.equal(writes.length, 1);
});

test('RSS订阅原位改名仅写名称与编辑时的revision', async () => {
  const snapshot = { revision: 1, articles: [], groups: [], recommendations: [], refreshing: [], summary: {},
    feeds: [{ id: 'f', name: '原名称', revision: 7, groupId: '', enabled: false, trusted: true, url: 'https://test.invalid/rss' }] };
  const writes: any[] = [];
  const api = { async call(command: any) {
    if (command.method === 'feed.update') { writes.push(command.input); return { ...snapshot.feeds[0], name: command.input.name }; }
    return snapshot;
  } };
  const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, embedded: true, onClose() {} });
  h.seedPanelSnapshot(0, api, 'rss', snapshot);
  const nav = h.render().find(n => n.type?.name === 'RssNavigation')!.props;
  await nav.onRenameFeed(snapshot.feeds[0], '新名称');
  assert.equal(JSON.stringify(writes), JSON.stringify([{ id: 'f', revision: 7, name: '新名称' }]));
});

test('RSS名称键盘立即操作，拖拽与编辑不产生额外折叠或迟到单击', async () => {
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const actions: any[] = [], edited: string[] = [];
  const props: any = { snapshot: { groups: [{ id: 'g', name: '工程', collapsed: false }], feeds: [], articles: [] },
    feedId: '', onGroup() {}, onAction(...args: any[]) { actions.push(args); }, onEdit(id: string) { edited.push(id); },
    onFeed() {}, onDraft() {}, onFinish() {}, onAdd() {}, onMove() {} };
  const h = await harness('src/client/RssPanel.tsx', 'RssNavigation', props, {
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); }, effects: true,
  });
  const name = () => h.render().find(n => n.type === 'button' && (n.props['data-rss-group-select'] === 'g' || n.props.title?.startsWith('工程 ·')))!;
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); };
  h.render(); h.commitLayout();
  name().props.onClick({ detail: 1 });
  h.render().find(n => n.props['data-rss-drag'] === 'group')!.props.onDragStart({
    stopPropagation() {}, dataTransfer: { setData() {} },
  });
  tick(); assert.equal(actions.length, 1, '拖拽不产生额外折叠');
  name().props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(actions.at(-1)[1].collapsed, true);
  props.snapshot.groups[0].collapsed = true;
  name().props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(actions.at(-1)[1].collapsed, false);
  props.snapshot.groups[0].collapsed = false;
  const before = actions.length;
  name().props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(actions.length, before, '同状态不重复保存');
  name().props.onKeyDown({ key: 'F2', preventDefault() {} });
  tick(); assert.deepEqual(edited, ['g']); assert.equal(actions.length, before);
  props.draft = { id: 'g', value: '工程', error: '' };
  h.render(); h.commitLayout(); tick(); assert.equal(actions.length, before);
  props.draft = undefined;
  props.snapshot = { ...props.snapshot, groups: [] };
  h.render(); h.commitLayout(); tick(); assert.equal(actions.length, before);
  h.unmount(); tick(); assert.equal(actions.length, before);
  assert.equal(timers.size, 0);
});

test('RSS折叠先更新本地，后台串行保存同组最新值，旧快照不覆盖待保存状态', async () => {
  const snapshot = { revision: 1, articles: [], feeds: [], recommendations: [], refreshing: [], summary: {},
    groups: [{ id: 'g', name: '工程', collapsed: false }] };
  const writes: any[] = [], pending: Array<(value: any) => void> = [];
  const api = { async call(command: any) {
    if (command.method === 'group.update') {
      writes.push(command.input);
      return new Promise(resolve => pending.push(value => {
        snapshot.groups[0]!.collapsed = command.input.collapsed; resolve(value);
      }));
    }
    return snapshot;
  } };
  const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, embedded: true, onClose() {} });
  h.seedPanelSnapshot(0, api, 'rss', snapshot);
  const nav = () => h.render().find(n => n.type?.name === 'RssNavigation')!.props;
  nav().onGroup('g');
  nav().onAction('group.update', { id: 'g', collapsed: true });
  assert.equal(nav().groupId, 'g');
  assert.equal(nav().snapshot.groups[0].collapsed, true, '后台未响应时立即折叠');
  assert.equal(writes.length, 1);
  h.seedPanelSnapshot(0, api, 'rss', { ...snapshot, revision: 2 });
  assert.equal(nav().snapshot.groups[0].collapsed, true, '旧快照不覆盖本地意图');
  nav().onEdit('g');
  assert.equal(nav().draft.id, 'g', '后台折叠保存不阻止改名');
  nav().onFinish(true);
  nav().onAction('group.update', { id: 'g', collapsed: false });
  assert.equal(nav().snapshot.groups[0].collapsed, false);
  assert.equal(writes.length, 1, '同组请求串行');
  pending.shift()!({ id: 'g', collapsed: true }); await flush();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].collapsed, false);
  assert.equal(nav().snapshot.groups[0].collapsed, false, '较旧成功不覆盖新意图');
  pending.shift()!({ id: 'g', collapsed: false }); await flush();
  assert.equal(nav().snapshot.groups[0].collapsed, false);
});

test('RSS折叠保存失败恢复最后成功值，较旧失败不回滚较新意图', async () => {
  const snapshot = { revision: 1, articles: [], feeds: [], recommendations: [], refreshing: [], summary: {},
    groups: [{ id: 'g', name: '工程', collapsed: false }] };
  const writes: any[] = [], pending: Array<{ resolve(value: any): void; reject(error: Error): void }> = [];
  const notices: any[] = [];
  const api = { async call(command: any) {
    if (command.method === 'group.update') {
      writes.push(command.input);
      return new Promise((resolve, reject) => pending.push({
        resolve(value) { snapshot.groups[0]!.collapsed = command.input.collapsed; resolve(value); }, reject,
      }));
    }
    return snapshot;
  } };
  const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, embedded: true, onClose() {}, notify(...args: any[]) { notices.push(args); } });
  h.seedPanelSnapshot(0, api, 'rss', snapshot);
  const nav = () => h.render().find(n => n.type?.name === 'RssNavigation')!.props;
  nav().onAction('group.update', { id: 'g', collapsed: true });
  pending.shift()!.reject(new Error('保存失败')); await flush();
  assert.equal(nav().snapshot.groups[0].collapsed, false, '首次失败回滚');
  assert.equal(notices.length, 1);
  nav().onAction('group.update', { id: 'g', collapsed: true });
  nav().onAction('group.update', { id: 'g', collapsed: false });
  pending.shift()!.reject(new Error('旧请求失败')); await flush();
  assert.equal(nav().snapshot.groups[0].collapsed, false);
  assert.equal(notices.length, 1, '较旧失败不打断较新意图');
  assert.equal(writes.at(-1).collapsed, false);
  pending.shift()!.resolve({ id: 'g', collapsed: false }); await flush();
  nav().onAction('group.update', { id: 'g', collapsed: true });
  nav().onAction('group.update', { id: 'g', collapsed: false });
  pending.shift()!.resolve({ id: 'g', collapsed: true }); await flush();
  pending.shift()!.reject(new Error('最终保存失败')); await flush();
  assert.equal(nav().snapshot.groups[0].collapsed, true, '失败恢复最后已保存值');
  assert.equal(notices.length, 2);
});

test('RSS多个分组后台保存互不覆盖，保存前的迟到读取被丢弃', async () => {
  const snapshot = { revision: 1, articles: [], feeds: [], recommendations: [], refreshing: [], summary: {},
    groups: [{ id: 'g', name: '工程', collapsed: false }, { id: 'h', name: '资讯', collapsed: false }] };
  const reads: Array<(value: any) => void> = [];
  const pending = new Map<string, (value: any) => void>();
  const api = { subscribe() { return () => {}; }, async call(command: any) {
    if (command.method === 'group.update') return new Promise(resolve => pending.set(command.input.id, resolve));
    return new Promise(resolve => { reads.push(resolve); });
  } };
  const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, embedded: true, onClose() {} }, {
    effects: true, setInterval() { return 1; }, clearInterval() {},
  });
  h.seedPanelSnapshot(0, api, 'rss', snapshot);
  const nav = () => h.render().find(n => n.type?.name === 'RssNavigation')!.props;
  h.render(); h.commitLayout();
  nav().onAction('group.update', { id: 'g', collapsed: true });
  nav().onAction('group.update', { id: 'h', collapsed: true });
  nav().onAction('group.update', { id: '', collapsed: true });
  assert.equal(nav().snapshot.ungroupedCollapsed, true);
  h.seedPanelSnapshot(0, api, 'rss', { ...snapshot, groups: snapshot.groups.map(g => ({ ...g, name: g.id === 'g' ? '最新名称' : g.name })) });
  nav();
  pending.get('h')!({ id: 'h', collapsed: true }); await flush();
  pending.get('')!({ id: '', collapsed: true }); await flush();
  pending.get('g')!({ id: 'g', collapsed: true }); await flush();
  reads[0]!(snapshot); await flush();
  assert.deepEqual(nav().snapshot.groups.map((g: any) => g.collapsed), [true, true]);
  assert.equal(nav().snapshot.groups[0].name, '最新名称', '折叠响应不覆盖名称');
  assert.equal(nav().snapshot.ungroupedCollapsed, true);
  assert.ok(reads.length > 1, '后台补读其他并发变更');
  reads.at(-1)!({ ...snapshot, ungroupedCollapsed: true, groups: snapshot.groups.map(g => ({ ...g, name: g.id === 'g' ? '后台改名' : g.name, collapsed: true })) });
  await flush();
  assert.equal(nav().snapshot.groups[0].name, '后台改名', '被旧读取丢弃的改名仍由后台补读恢复');
  h.unmount();
});

test('RSS失焦保存期间保留下一分组重命名请求，失败仍保留原草稿', async () => {
  for (const failed of [false, true]) {
    const snapshot = { revision: 1, articles: [], feeds: [], recommendations: [], refreshing: [], summary: {},
      groups: [{ id: 'g', name: '原分组' }, { id: 'h', name: '目标分组' }] };
    const calls: any[] = [];
    let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
    const api = { async call(command: any) {
      calls.push(command);
      if (command.method === 'group.update') return new Promise((yes, no) => { resolve = yes; reject = no; });
      return snapshot;
    } };
    const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, embedded: true, onClose() {} });
    h.seedPanelSnapshot(0, api, 'rss', snapshot);
    const navigation = () => h.render().find(n => n.type?.name === 'RssNavigation')!.props;
    navigation().onEdit('g');
    navigation().onDraft('修改名称');
    navigation().onFinish();
    navigation().onEdit('h');
    assert.equal(navigation().draft.id, 'g', '等待旧分组保存完成');
    assert.equal(calls.filter(call => call.method === 'group.update').length, 1, '不重复提交失焦保存');
    if (failed) reject(new Error('保存失败'));
    else resolve({});
    await flush();
    assert.equal(navigation().draft.id, failed ? 'g' : 'h');
    assert.equal(navigation().draft.value, failed ? '修改名称' : '目标分组');
    if (failed) assert.ok(navigation().draft.error);
  }
});

test('市场滚动接近底部续页只发送一次，搜索切换丢弃迟到分页响应', async () => {
  const snapshot = { skills: [], sources: [], summary: {}, marketSources: [],
    market: [{ id: 'old', name: 'Old', description: '说明', body: '' }],
    marketPage: { query: '', token: 'first', hasMore: true } };
  const calls: any[] = [];
  let resolve!: (value: unknown) => void;
  const api = { call: async (command: any) => { calls.push(command); return new Promise(done => { resolve = done; }); } };
  const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [], onClose() {},
    memory: { extensions: { skills: { tab: 'market' } }, save() {} } });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  const list = () => h.render().find(n => n.props?.['aria-label'] === '技能记录');
  list().ref.current = { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 };
  list().props.onScroll();
  assert.equal(calls.length, 0);
  list().ref.current.scrollTop = 400;
  list().props.onScroll(); list().props.onScroll();
  assert.equal(calls.length, 1, '同步锁阻止重复续页');
  assert.equal(calls[0].input.pageToken, 'first');
  h.render().find(n => n.props?.['aria-label'] === '搜索技能名称或说明').props.onChange({ target: { value: 'react' } });
  h.render();
  resolve({ ...snapshot, market: [{ id: 'late', name: 'React late', description: '旧页', body: '' }] });
  await flush();
  assert.ok(!h.render().some(n => n.props?.['data-i-row'] === 'late'));
});

test('技能市场搜索立即筛选远端目录卡片，清空恢复列表，等待结果显示搜索状态', async () => {
  const snapshot = { skills: [], sources: [], summary: {}, marketSources: [],
    market: [
      { id: 'react', name: 'React', description: '组件开发', body: '', catalog: { kind: 'clawhub', slug: 'react', owner: 'author' } },
      { id: 'python', name: 'Python', description: '数据分析', body: '', catalog: { kind: 'clawhub', slug: 'python', owner: 'author' } },
    ],
  };
  const api = { call: async () => snapshot };
  const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [], onClose() {},
    memory: { extensions: { skills: { tab: 'market' } }, save() {} } });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  const search = () => h.render().find(n => n.props?.['aria-label'] === '搜索技能名称或说明');
  search().props.onChange({ target: { value: 'Ｒｅａｃｔ' } });
  let rows = h.render().filter(n => n.props?.['data-i-row']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.props['data-i-row'], 'react');
  search().props.onChange({ target: { value: '' } });
  assert.equal(h.render().filter(n => n.props?.['data-i-row']).length, 2);
  search().props.onChange({ target: { value: '不存在' } });
  h.seedState(25, true);
  assert.ok(h.render().some(n => n.props?.children === '正在搜索技能'));
});

test('市场来源仅提供内置开关，失败保留原值，成功即时保存', async () => {
  const source = { id: 'source', name: 'SkillHub', url: 'https://api.skillhub.cn/api/skills', enabled: true, issue: '请求失败' };
  const snapshot = { skills: [], sources: [], market: [], marketSources: [source], summary: {} };
  const calls: any[] = [];
  let denied = true;
  const api = { call: async (command: any) => {
    calls.push(command);
    if (denied) throw new Error('拒绝写入');
    return { ...snapshot, marketSources: [{ ...source, enabled: false }] };
  } };
  const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', {
    api, projects: [], onClose() {}, memory: { extensions: { skills: { tab: 'market' } }, save() {} },
  });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  let tree = h.render();
  assert.equal(tree.filter(n => n.props?.className === 'integration-status-line').length, 0);
  assert.equal(tree.filter(n => n.props?.className === 'integration-form-error').length, 1);
  const entry = tree.find(n => n.props?.label === '市场来源');
  assert.equal(entry.props.outlined, true);
  entry.props.onClick();
  tree = h.render();
  assert.ok(tree.some(n => n.props?.['aria-label'] === '市场来源' && n.type === 'section'));
  assert.equal(tree.some(n => n.props?.label === `删除 ${source.name}` || n.props?.['aria-label'] === '目录地址'), false);
  let toggle = tree.find(n => n.props?.role === 'switch');
  await toggle.props.onChange({ target: { checked: false } }); await flush();
  tree = h.render();
  assert.equal(tree.find(n => n.props?.role === 'switch').props.checked, true, '失败保留原值');
  denied = false;
  toggle = tree.find(n => n.props?.role === 'switch');
  await toggle.props.onChange({ target: { checked: false } }); await flush();
  assert.equal(h.render().find(n => n.props?.role === 'switch').props.checked, false);
  assert.equal(calls.at(-1).method, 'market.source.toggle');
  assert.equal(calls.at(-1).input.id, source.id);
  assert.equal(calls.at(-1).input.enabled, false);
});

// 直接执行真实组件的事件处理；不把回调断言当作浏览器视觉或焦点验收。
async function harness(entry: string, component: string, props: any, runtime: { setTimeout?: any; clearTimeout?: any; setInterval?: any; clearInterval?: any; effects?: boolean; portal?: boolean } = {}) {
  const output = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
    ...(component === 'RssEditor' ? { footer: { js: 'module.exports.RssEditor = RssEditor;' } } : {}) });
  const require = createRequire(import.meta.url), react = require('react'), hooks: any[] = [];
  const layoutEffects: { effect: () => any; deps?: unknown[]; cleanup?: () => void; pending: boolean }[] = [];
  let cursor = 0;
  const module = { exports: {} as Record<string, (props: any) => any> };
  const effectHook = (effect: () => any, deps?: unknown[]) => {
    const i = cursor++, previous = layoutEffects[i];
    if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index])))
      layoutEffects[i] = { effect, deps, cleanup: previous?.cleanup, pending: true };
  };
  runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports, Error, TextEncoder, structuredClone, AbortController, AbortSignal, URL,
    setTimeout: runtime.setTimeout ?? setTimeout, clearTimeout: runtime.clearTimeout ?? clearTimeout,
    setInterval: runtime.setInterval ?? setInterval, clearInterval: runtime.clearInterval ?? clearInterval, crypto: { randomUUID: () => 'new-rule' },
    document: { activeElement: null, getElementById: () => null },
    window: { setInterval: runtime.setInterval ?? setInterval, clearInterval: runtime.clearInterval ?? clearInterval,
      addEventListener() {}, removeEventListener() {} }, HTMLElement: class {},
    requestAnimationFrame: (callback: () => void) => callback(),
    cancelAnimationFrame() {},
    require: (id: string) => id === 'react-dom' && runtime.portal ? { createPortal: (node: any) => node } : id !== 'react' ? require(id) : { ...react,
      useId: () => 'field-error',
      useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
      useEffect(effect: () => any, deps?: unknown[]) { if (runtime.effects) effectHook(effect, deps); },
      useLayoutEffect(effect: () => any, deps?: unknown[]) {
        const i = cursor++, previous = layoutEffects[i];
        if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index])))
          layoutEffects[i] = { effect, deps, cleanup: previous?.cleanup, pending: true };
      },
      useCallback(callback: any, deps: unknown[]) {
        const i = cursor++, previous = hooks[i];
        if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) hooks[i] = { callback, deps };
        return hooks[i].callback;
      },
      useState(initial: unknown) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
        return [hooks[i], (next: any) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
      },
      useRef(current: unknown) { const i = cursor++; return hooks[i] ??= { current }; },
    },
  });
  return { props, render() { cursor = 0; return nodes(module.exports[component]!(props)); },
    invoke(...args: any[]) { cursor = 0; return (module.exports[component] as any)(...args); },
    remount() { hooks.length = 0; },
    unmount() { for (const item of layoutEffects) item?.cleanup?.(); },
    seedSnapshot(snapshot: Snapshot) { hooks[0] = snapshot; },
    seedPanelSnapshot(index: number, api: unknown, key: string, value: unknown) { hooks[index] = { api, key, value }; },
    seedState(index: number, value: unknown) { hooks[index] = value; },
    commitLayout() {
      for (const item of layoutEffects) if (item?.pending) { item.pending = false; item.cleanup?.(); item.cleanup = item.effect(); }
    },
  };
}

function fixture() {
  const project: Project = { projectId: 'p', workspaceId: 'w', title: '项目', path: '/project', available: true,
    archived: false, todos: [], sessions: [], sessionIds: [], agentCanChangeStatus: true, mark: emptyMark(), updatedAt: 1 };
  const snapshot: Snapshot = { preferences: initialState().preferences, projects: [project], conflicts: [],
    revision: 1, syncedAt: 1, sessionMarks: {} };
  return { project, snapshot };
}

test('首页统计卡拖拽与键盘排序保存偏好，失败恢复，拖后不误开概览且外部拖拽无效', async () => {
  const { snapshot } = fixture(), writes: any[] = [], opened: string[] = [];
  snapshot.preferences.home.statCards = { running: true, recent: true, pending: true, diagnostic: true, skills: false, mcp: false, rss: false };
  snapshot.preferences.home.statOrder = ['running', 'recent', 'pending', 'diagnostic', 'skills', 'mcp', 'rss'];
  let success = true;
  const h = await harness('src/client/Home.tsx', 'Home', {
    snapshot, api: {}, memory: new UiMemory(), busy: false, navigate() {}, rename() {}, removeProject() {}, notify() {}, refresh() {},
    openOverview(key: string) { opened.push(key); }, async mutate(command: any) { writes.push(command); return success; },
  });
  const card = (key: string) => h.render().find(n => n.props['data-stat-tab'] === key)!;
  const order = () => h.render().filter(n => n.props['data-stat-tab']).map(n => n.props['data-stat-tab']);
  const event = { preventDefault() {}, dataTransfer: { setData() {} }, relatedTarget: null, clientX: 1, clientY: 1,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), parentElement: null } };
  card('pending').props.onDrop(event);
  assert.equal(writes.length, 0);
  card('running').props.onDragStart(event);
  card('pending').props.onDragOver(event);
  card('pending').props.onDrop(event);
  await flush();
  assert.deepEqual(order(), ['recent', 'running', 'pending', 'diagnostic']);
  assert.deepEqual(Array.from(writes[0].patch.home.statOrder), ['recent', 'running', 'pending', 'diagnostic', 'skills', 'mcp', 'rss']);
  card('running').props.onClick();
  assert.deepEqual(opened, []);
  snapshot.preferences.home = writes[0].patch.home;
  success = false;
  card('running').props.onKeyDown({ key: 'ArrowRight', altKey: true, nativeEvent: {}, preventDefault() {} });
  await flush();
  assert.deepEqual(order(), ['recent', 'running', 'pending', 'diagnostic']);
  h.props.busy = true;
  card('running').props.onKeyDown({ key: 'ArrowLeft', altKey: true, nativeEvent: {}, preventDefault() {} });
  assert.equal(writes.length, 2);
  assert.equal(card('running').props.draggable, false);
});

test('C05：MCP预览未完成时鼠标和键盘离开导入页都释放busy', async () => {
  for (const key of ['Home', 'ArrowLeft', 'click']) {
    const api = { call: async (command: any) => command.method === 'previewImport' ? new Promise(() => {}) : {
      connections: [], sources: [], foreign: [], capabilities: {}, defaults: {},
    } };
    const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} },
      { effects: true, setInterval() { return 1; }, clearInterval() {} });
    h.render(); h.commitLayout(); await flush();
    h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加连接'))!.props.onClick();
    h.render().find(n => n.props.id === 'integration-mcp-add-import')!.props.onClick();
    h.render().find(n => n.props['aria-label'] === 'JSON 配置')!.props.onChange({ target: { value: '{}' } });
    h.render(); h.commitLayout();
    const flow = () => h.render().find(n => n.type?.name === 'ModalFlow')!;
    assert.equal(flow().props.detail.props.busy, true);
    if (key === 'click') h.render().find(n => n.props.id === 'integration-mcp-add-create')!.props.onClick();
    else h.render().find(n => n.props['aria-label'] === '添加方式')!.props.onKeyDown({ key, nativeEvent: {}, preventDefault() {} });
    h.render(); h.commitLayout();
    assert.equal(flow().props.detail.props.busy, false);
    flow().props.detail.props.onClose();
    assert.equal(Boolean(flow().props.detail), false);
    h.unmount();
  }
});

test('C16：MCP合法文件未读完时选择非法文件，不遗留busy或覆盖原内容', async () => {
  for (const invalid of [{ name: 'large.json', size: 3 * 1024 * 1024 }, { name: 'invalid.txt', size: 1 }]) {
    let resolve!: (text: string) => void;
    const api = {}, h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} });
    h.seedPanelSnapshot(3, api, 'mcp', { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} });
    h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加连接'))!.props.onClick();
    h.render().find(n => n.props.id === 'integration-mcp-add-import')!.props.onClick();
    const text = () => h.render().find(n => n.props['aria-label'] === 'JSON 配置')!;
    text().props.onChange({ target: { value: '原内容' } });
    const choose = (file: any) => h.render().find(n => n.type === 'input' && n.props.type === 'file')!.props.onChange({ target: { files: [file], value: '' } });
    choose({ name: 'ok.json', size: 1, text: () => new Promise(r => { resolve = r; }) });
    choose(invalid);
    resolve('迟到内容'); await flush();
    assert.equal(text().props.value, '原内容');
    assert.equal(h.render().find(n => n.type?.name === 'ModalFlow')!.props.detail.props.busy, false);
  }
});

test('C05/C16：预览完成不释放另一文件读取busy，重复当前页签不取消预览', async () => {
  const previews: { resolve(value: any): void; signal: AbortSignal }[] = [];
  let resolveFile!: (text: string) => void;
  const api = { call: (command: any, signal: AbortSignal) => command.method === 'previewImport'
    ? new Promise(resolve => previews.push({ resolve, signal }))
    : Promise.resolve({ connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} }) };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} },
    { effects: true, setInterval() { return 1; }, clearInterval() {} });
  h.render(); h.commitLayout(); await flush();
  h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加连接'))!.props.onClick();
  h.render().find(n => n.props.id === 'integration-mcp-add-import')!.props.onClick();
  h.render().find(n => n.props['aria-label'] === 'JSON 配置')!.props.onChange({ target: { value: '{}' } });
  h.render(); h.commitLayout();
  h.render().find(n => n.props.id === 'integration-mcp-add-import')!.props.onClick();
  assert.equal(previews[0]!.signal.aborted, false);
  h.render().find(n => n.type === 'input' && n.props.type === 'file')!.props.onChange({ target: {
    files: [{ name: 'ok.json', size: 1, text: () => new Promise(resolve => { resolveFile = resolve; }) }], value: '',
  } });
  previews[0]!.resolve([]); await flush();
  const busy = () => h.render().find(n => n.type?.name === 'ModalFlow')!.props.detail.props.busy;
  assert.equal(busy(), true, '文件读取仍在进行');
  resolveFile('{"new":true}'); await flush();
  h.render(); h.commitLayout();
  assert.equal(busy(), true, '新内容启动新预览');
  previews[1]!.resolve([]); await flush();
  assert.equal(busy(), false);
  h.unmount();
});

test('C06：技能详情迟到时保留编辑模式及未修改或已修改的草稿', async () => {
  for (const changed of [false, true]) {
    let resolve!: (value: any) => void;
    const row = { id: 's', name: 'sample', description: '说明', body: '原正文', scope: 'global', projectIds: [],
      sourceId: 'global', files: [], enabled: true, owner: 'workbase', version: 1 };
    const api = { call: () => new Promise(r => { resolve = r; }) };
    const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [], embedded: true, onClose() {} });
    h.seedPanelSnapshot(3, api, 'skills', { skills: [row], sources: [], market: [], marketSources: [], summary: {} });
    h.render().find(n => n.type === 'button' && n.props.title === 'sample')!.props.onClick();
    h.render().find(n => n.type === 'button' && n.props.children?.includes?.('编辑技能'))!.props.onClick();
    if (changed) h.render().find(n => n.props['aria-label'] === '技能正文')!.props.onChange({ target: { value: '编辑草稿' } });
    resolve({ ...row, body: '迟到正文', version: 2 }); await flush();
    assert.match(h.render().find(n => n.type?.name === 'ModalFlow')!.props.detail.props.title, /编辑技能/);
    assert.equal(h.render().find(n => n.props['aria-label'] === '技能正文')!.props.value, changed ? '编辑草稿' : '原正文');
  }
});

test('C15：A切到B未读取分支时，工作树不携带A分支也不降级普通发送', async () => {
  const { snapshot, project } = fixture();
  snapshot.projects.push({ ...project, projectId: 'b', workspaceId: 'wb' });
  const memory = new UiMemory();
  Object.assign(memory.composer, { projectId: 'p', draft: '消息', preset: 'default', model: '["x","m"]', branch: 'only-a', worktree: true });
  const requests: any[] = [], writes: any[] = [];
  const api = { forgeAvailable: () => true, subscribe: () => () => {}, openSession() {},
    call(command: any) {
      if (command.op === 'launch-catalog') return Promise.resolve({ presets: [{ id: 'default' }], models: [{ id: 'm', provider: 'x' }], defaultModel: { provider: 'x', model: 'm' }, failures: [] });
      if (command.op === 'git-branches') return new Promise(resolve => requests.push({ command, resolve }));
      writes.push(command); return Promise.resolve({});
    } };
  const h = await harness('src/client/Composer.tsx', 'Composer', { snapshot, api, memory },
    { effects: true, setInterval() { return 1; }, clearInterval() {} });
  h.render(); h.commitLayout(); await flush();
  requests[0].resolve({ git: true, current: 'only-a', branches: ['only-a'] }); await flush();
  h.render(); h.commitLayout();
  h.render().find(n => n.props.label === '会话项目')!.props.onChange('b');
  const send = () => h.render().find(n => n.props.id === 'composer-send')!;
  assert.equal(send().props.disabled, true, '切项目后首帧即禁止发送');
  send().props.onClick(); await flush();
  assert.equal(writes.length, 0);
  h.render(); h.commitLayout();
  assert.equal(h.render().find(n => n.type?.name === 'BranchBar')!.props.branches, null);
  requests[1].resolve({ git: true, current: 'main-b', branches: ['main-b'] }); await flush();
  h.render(); h.commitLayout();
  assert.equal(h.render().find(n => n.type?.name === 'BranchBar')!.props.branch, 'main-b');
  assert.equal(send().props.disabled, false);
  h.render().find(n => n.props.label === '会话项目')!.props.onChange('p');
  h.render(); h.commitLayout();
  assert.equal(send().props.disabled, true);
  requests[2].resolve({ git: false, current: '', branches: [] }); await flush();
  assert.equal(send().props.disabled, false, '所选项目确认非Git后允许普通会话');
  h.unmount();
});

test('C17：MCP两个表单组合Enter不写入，普通Enter仍提交', async () => {
  for (const source of [false, true]) {
    const calls: any[] = [], api = { call: async (command: any) => { calls.push(command); throw new Error('拒绝写入'); } };
    const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} });
    h.seedPanelSnapshot(3, api, 'mcp', { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} });
    if (source) {
      h.render().find(n => n.props.role === 'tab' && n.props.children === '连接器市场')!.props.onClick();
      h.render().find(n => n.props.label === '市场来源')!.props.onClick();
    } else h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加连接'))!.props.onClick();
    const form = () => h.render().find(n => n.type === 'form')!;
    for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }]) {
      let prevented = false;
      form().props.onKeyDown?.({ key: 'Enter', nativeEvent, preventDefault() { prevented = true; } });
      if (!prevented) form().props.onSubmit({ preventDefault() {} });
      await flush();
      assert.equal(calls.length, 0);
      assert.equal(prevented, true);
    }
    let prevented = false;
    form().props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() { prevented = true; } });
    if (!prevented) form().props.onSubmit({ preventDefault() {} });
    await flush(); assert.equal(calls.length, 1);
  }
});

test('C18：Modal组合Escape和229不关闭，普通Escape关闭', async () => {
  let closed = 0;
  const h = await harness('src/client/ui.tsx', 'Modal', { title: '编辑', onClose() { closed++; }, children: createElement('input') }, { portal: true });
  h.seedState(2, {});
  const dialog = h.render().find(n => n.type === 'dialog')!;
  dialog.ref.current = {};
  for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }]) {
    dialog.props.onKeyDown({ key: 'Escape', nativeEvent, target: { closest: () => dialog.ref.current },
      preventDefault() { assert.fail('保留IME原生取消'); }, stopPropagation() {} });
    assert.equal(closed, 0);
  }
  dialog.props.onKeyDown({ key: 'Escape', nativeEvent: {}, target: { closest: () => dialog.ref.current }, preventDefault() {}, stopPropagation() {} });
  assert.equal(closed, 1);
});

test('C19：MCP写后新snapshot不被迟到的旧轮询覆盖', async () => {
  const snapshot = { connections: [], sources: [{ id: 's', name: '源', url: 'https://example.org', enabled: true }], foreign: [], capabilities: {}, defaults: {} };
  const reads: ((value: any) => void)[] = [];
  let poll!: () => void;
  const api = { call: (command: any) => command.method === 'snapshot' ? new Promise(r => reads.push(r)) : Promise.resolve({}) };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} },
    { effects: true, setInterval(callback: () => void) { poll = callback; return 1; }, clearInterval() {} });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  h.render(); h.commitLayout(); reads[0]!(snapshot); await flush();
  poll();
  h.render().find(n => n.props.role === 'tab' && n.props.children === '连接器市场')!.props.onClick();
  h.render().find(n => n.props.label === '市场来源')!.props.onClick();
  const toggle = () => h.render().find(n => n.type?.name === 'Toggle')!;
  toggle().props.onChange(); await flush();
  reads[2]!({ ...snapshot, sources: [{ ...snapshot.sources[0], enabled: false }] }); await flush();
  assert.equal(toggle().props.checked, false);
  reads[1]!(snapshot); await flush();
  assert.equal(toggle().props.checked, false);
  h.unmount();
});

test('RSS添加和导入默认系统分组，编辑及未保存草稿保留用户分组', async () => {
  const remembered = { groupId: 'g', drafts: {}, importText: '', importGroup: 'g' };
  const props: any = { api: {}, snapshot: { groups: [{ id: 'g', name: '工程' }], feeds: [] },
    detail: { kind: 'create' }, remembered, busy: false, onMode() {}, onSave() {}, onCancel() {}, onRead() {}, onAction() {} };
  const groupValue = async (extra: any) => {
    const h = await harness('src/client/RssPanel.tsx', 'RssEditor', { ...props, ...extra });
    return h.render().find(n => n.props.label === (extra.detail?.kind === 'import' ? '导入默认分组' : '订阅分组'))!.props.value;
  };
  assert.equal(await groupValue({}), '');
  assert.equal(await groupValue({ detail: { kind: 'import' } }), '');
  assert.equal(await groupValue({ detail: { kind: 'edit', id: 'f' }, source: { id: 'f', groupId: 'g' } }), 'g');
  assert.equal(await groupValue({ remembered: { ...remembered, drafts: { create: { name: '草稿', url: '', groupId: 'g' } } } }), 'g');
  assert.equal(await groupValue({ detail: { kind: 'import' }, remembered: { ...remembered, importText: '<opml/>', importGroup: 'g' } }), 'g');
});

test('推荐订阅添加不沿用当前浏览分组，也不沿用上一推荐草稿', async () => {
  const api = {}, memory = new UiMemory();
  memory.extensions.rss = { tab: 'catalog', group: 'g', search: '', scroll: 0 };
  const snapshot = { revision: 1, feeds: [], groups: [{ id: 'g', name: '工程' }], articles: [], refreshing: [], summary: {},
    recommendations: [{ id: 'a', name: '推荐甲', url: 'https://news.org/a', description: '', attribution: '' },
      { id: 'b', name: '推荐乙', url: 'https://news.org/b', description: '', attribution: '' }] };
  const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, memory, onClose() {}, notify() {} });
  h.seedPanelSnapshot(0, api, 'rss', snapshot);
  assert.ok(h.render().some(n => n.props.children === '推荐订阅'));
  h.render().find(n => n.props.value?.id === 'a')!.props.onAdd();
  let editor = h.render().find(n => n.type?.name === 'RssEditor')!;
  assert.equal(editor.props.remembered.drafts.create.groupId, '');
  editor.props.remembered.drafts.create.groupId = 'g';
  h.render().find(n => n.props.value?.id === 'b')!.props.onAdd();
  editor = h.render().find(n => n.type?.name === 'RssEditor')!;
  assert.equal(editor.props.remembered.drafts.create.groupId, '');
  assert.equal(editor.props.remembered.drafts.create.url, 'https://news.org/b');
});

test('推荐添加单栏，普通添加保留方式导航', async () => {
  const props = { api: {}, snapshot: { groups: [], feeds: [] }, remembered: { drafts: {}, importText: '', importGroup: '' },
    busy: false, onMode() {}, onSave() {}, onCancel() {}, onRead() {}, onAction() {} };
  for (const recommendation of [true, false]) {
    const h = await harness('src/client/RssPanel.tsx', 'RssEditor', { ...props, detail: { kind: 'create', recommendation } });
    const tree = h.render();
    assert.equal(tree.some(n => n.props?.className === 'integration-detail-nav'), !recommendation);
    assert.equal(tree.find(n => n.props?.className === 'integration-detail-layout').props['data-single'], recommendation ? 'true' : 'false');
    if (recommendation) assert.ok(!tree.some(n => n.props?.role === 'tabpanel'));
  }
});

test('添加订阅定位我的订阅并单源刷新，刷新失败仍保留新增来源', async () => {
  const calls: any[] = [], memory = new UiMemory();
  memory.extensions.rss = { tab: 'catalog', group: '*', search: '旧搜索', scroll: 90 };
  const feed = { id: 'new', name: '新增来源', url: 'https://news.org/feed', groupId: 'g', enabled: true };
  let snapshot = { revision: 1, feeds: [] as any[], groups: [{ id: 'g', name: '工程' }], articles: [], refreshing: [], summary: {},
    recommendations: [{ id: 'r', name: '旧搜索', url: feed.url, description: '', attribution: '' }] };
  const api = { call: async (command: any) => {
    calls.push(command);
    if (command.method === 'feed.create') { snapshot = { ...snapshot, feeds: [feed] }; return feed; }
    if (command.method === 'refresh') throw new Error('来源暂时不可用');
    return snapshot;
  } };
  const h = await harness('src/client/RssPanel.tsx', 'RssPanel', { api, memory, recentDays: 7, onClose() {} });
  h.seedPanelSnapshot(0, api, 'rss', snapshot);
  h.render().find(n => n.props?.children === '推荐订阅' && n.props?.onClick)!.props.onClick();
  h.render().find(n => n.props?.value?.id === 'r')!.props.onAdd();
  await h.render().find(n => n.type?.name === 'RssEditor')!.props.onSave('feed.create', feed);
  await flush();
  const tree = h.render(), list = tree.find(n => n.type?.name === 'RssArticleList')!;
  assert.ok(list);
  assert.equal(list.props.query.feedId, 'new');
  assert.equal(list.props.query.groupId, 'g');
  assert.equal(list.props.query.query, '');
  assert.equal(list.props.recentDays, 7, '新增订阅也不能覆盖全局时间范围');
  assert.ok(!tree.some(n => n.type?.name === 'RssEditor'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c => c.method === 'refresh').input)), { feedId: 'new' });
  assert.equal(list.props.snapshot.feeds[0].id, 'new');
});

test('市场卡片显示安装与真实连接状态，删除记录后恢复操作', async () => {
  const api = {};
  const skill = { id: 's', name: '技能', owner: 'workbase', enabled: true, effective: 'effective' };
  const skills = { skills: [skill], sources: [], marketSources: [], market: [{ id: 'market-s', name: '技能', description: '' }] };
  const sh = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [], onClose() {} });
  sh.seedPanelSnapshot(3, api, 'skills', skills); sh.seedState(0, 'market');
  assert.ok(sh.render().some(n => n.type === 'button' && n.props.children === '已安装'));
  sh.seedPanelSnapshot(3, api, 'skills', { ...skills, skills: [{ ...skill, deletedAt: 1 }] });
  assert.ok(sh.render().some(n => n.type === 'button' && n.props.children === '安装'));
  const candidate = { id: 'market-m', name: '服务', config: { transport: 'http', url: 'https://example.org/mcp' } };
  const mh = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], onClose() {} });
  mh.seedState(0, 'catalog'); mh.seedState(17, [candidate]);
  for (const [state, label] of [['connected', '已连接'], ['connecting', '连接中'], ['error', '连接失败']]) {
    mh.seedPanelSnapshot(3, api, 'mcp', { connections: [{ id: 'm', name: '改名服务', transport: 'http', url: candidate.config.url, state }],
      sources: [], foreign: [], capabilities: {}, defaults: {} });
    assert.ok(mh.render().some(n => n.type === 'button' && n.props.children === label));
  }
  mh.seedPanelSnapshot(3, api, 'mcp', { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} });
  assert.ok(mh.render().some(n => n.type === 'button' && n.props.children === '连接'));
});

test('七类菜单包含诊断共用同一概览弹窗，详情挂起和保存状态传给外层', async () => {
  const { snapshot } = fixture();
  const h = await harness('src/client/Workbase.tsx', 'WorkbaseOverview', {
    kind: 'skills', api: { call: async () => ({}) }, snapshot, navigation: null,
    busy: false, refresh: async () => {}, navigate() {}, onReport() {},
    onClose() {}, notify() {},
  });
  const shell = () => h.render().find(n => n.props?.title === '工作台概览')!;
  const type = shell().type;
  for (const kind of ['skills', 'diagnostic', 'mcp', 'running', 'rss', 'pending', 'recent']) {
    h.props.kind = kind;
    assert.equal(shell().type, type);
    assert.equal(shell().key, null);
    const panel = h.render().find(n => n.props?.embedded)!;
    assert.ok(panel);
    if (kind === 'rss') assert.equal(panel.props.recentDays, snapshot.preferences.home.statDays);
    panel.props.onModalState({ busy: true, suspended: true });
    assert.equal(shell().props.busy, true);
    assert.equal(shell().props.suspended, true);
    panel.props.onModalState({ busy: false, suspended: false });
    assert.equal(shell().props.suspended, false);
  }
});

test('管理列表与添加详情复用外层，返回保留原列表元素，标题及关闭动作同步', async () => {
  const mainContent = createElement('div', { className: 'settings-layout' }, '列表');
  const detailContent = createElement('div', { className: 'settings-layout' }, '添加');
  let closed = 0;
  const h = await harness('src/client/ui.tsx', 'ModalFlow', {
    main: createElement(Modal, { title: '工作台概览', onClose() {}, children: mainContent, drawer: true }),
    detail: null,
  });
  const shell = () => h.render().find(n => n.props?.title)!;
  const type = shell().type;
  h.commitLayout();
  let focused = 0;
  const origin = { isConnected: true, scrollTop: 120, scrollLeft: 8, focus() { focused++; } };
  const list = h.render().find(n => n.props?.className === 'settings-layout')!;
  list.props.onFocusCapture({ target: origin });
  list.props.onScrollCapture({ target: origin });
  h.props.detail = createElement(Modal, { title: '添加技能', onClose: () => closed++, children: detailContent, drawer: true });
  assert.equal(shell().type, type);
  assert.equal(shell().key, null);
  assert.equal(shell().props.title, '添加技能');
  assert.equal(shell().props.suspended, false);
  shell().props.onClose();
  assert.equal(closed, 1);
  const hidden = h.render().find(n => n.props?.hidden)!;
  assert.equal(hidden.props.children, '列表');
  assert.equal(hidden.props.style.display, 'none');
  h.commitLayout();
  origin.scrollTop = 0; origin.scrollLeft = 0;
  h.props.detail = null;
  assert.equal(shell().type, type);
  assert.equal(shell().props.title, '工作台概览');
  assert.equal(h.render().find(n => n.props?.className === 'settings-layout')?.props.hidden, false);
  h.commitLayout();
  assert.equal(origin.scrollTop, 120);
  assert.equal(origin.scrollLeft, 8);
  assert.equal(focused, 1, '返回列表恢复原入口焦点且不滚动页面');
});

test('概览外层采用二级页标题返回及关闭，保留唯一Modal', async () => {
  const { snapshot } = fixture();
  const h = await harness('src/client/Workbase.tsx', 'WorkbaseOverview', {
    kind: 'skills', snapshot, api: {}, onClose() {}, onReport() {}, navigate() {}, refresh() {}, notify() {},
  });
  const panel = h.render().find(n => n.props?.embedded)!;
  const close = () => {};
  panel.props.onModalState({ busy: true, suspended: false, presentation: { title: '添加技能', onClose: close, leading: '返回' } });
  const modal = h.render().find(n => n.props?.title === '添加技能');
  assert.ok(modal, '二级页标题同步到持续挂载的外层');
  assert.equal(modal.props.onClose, close);
  assert.equal(modal.props.leading, '返回');
  assert.equal(modal.props.busy, true);
});

test('规则详情原入口被筛掉时，返回聚焦规则搜索并保留列表滚动', async () => {
  let focused = 0;
  const search = { focus(options: any) { assert.equal(options.preventScroll, true); focused++; } };
  const h = await harness('src/client/ui.tsx', 'ModalFlow', {
    main: createElement(Modal, { title: '设置', onClose() {}, children: createElement('form', { className: 'wb-settings' }) }),
    detail: null, fallbackFocus: '.rules-search input',
  });
  const list = h.render().find(n => n.type === 'form')!;
  list.ref.current = { querySelector(selector: string) { assert.equal(selector, '.rules-search input'); return search; } };
  const origin = { isConnected: true, focus() { assert.fail('已筛掉的行不应接收焦点'); } };
  const scroll = { isConnected: true, scrollTop: 220, scrollLeft: 0 };
  list.props.onFocusCapture({ target: origin });
  list.props.onScrollCapture({ target: scroll });
  h.props.detail = createElement(Modal, { title: '规则', onClose() {}, children: createElement('div') });
  h.render(); h.commitLayout();
  origin.isConnected = false; scroll.scrollTop = 0;
  h.props.detail = null;
  h.render(); h.commitLayout();
  assert.equal(focused, 1);
  assert.equal(scroll.scrollTop, 220);
});

test('设置外层接收规则标题样式和返回动作，切换内容不更换Modal', async () => {
  const { snapshot } = fixture();
  const h = await harness('src/client/Workbase.tsx', 'Workbase', { api: {}, memory: new UiMemory() });
  h.seedSnapshot(snapshot);
  h.render().find(n => n.props?.label === '工作台设置')!.props.onClick();
  const settings = () => h.render().find(n => n.type?.name === 'Settings')!;
  const shell = () => h.render().find(n => n.props?.drawer && n.props?.title)!;
  const type = shell().type;
  let returned = 0;
  const onClose = () => returned++, leading = createElement('button', { onClick: onClose });
  assert.equal(settings().props.embedded, true);
  settings().props.onModalState({ busy: false, suspended: false,
    presentation: { title: '规则详情', className: 'rules-detail-dialog', leading, onClose } });
  assert.equal(shell().type, type);
  assert.equal(shell().key, null);
  assert.equal(shell().props.title, '规则详情');
  assert.equal(shell().props.className, 'rules-detail-dialog');
  assert.equal(shell().props.leading, leading);
  shell().props.onClose();
  assert.equal(returned, 1);
  settings().props.onModalState({ busy: false, suspended: false,
    presentation: { title: '工作台设置', onClose() {} } });
  assert.equal(shell().type, type);
  assert.equal(shell().props.className, undefined);
  assert.equal(shell().props.leading, undefined);
});

test('嵌入二级页不产生回传循环，同标题更新后关闭及返回使用最新动作', async () => {
  const states: any[] = [], calls: string[] = [];
  const report = (state: any) => states.push(state);
  const h = await harness('src/client/ui.tsx', 'ModalFlow', {
    embedded: true, onModalState: report,
    main: createElement(Modal, { title: '概览', onClose() {}, children: createElement('div') }),
    detail: createElement(Modal, { title: '订阅', onClose: () => calls.push('旧关闭'), leading: createElement('button', { onClick: () => calls.push('旧返回') }), children: createElement('div') }),
  });
  h.render(); h.commitLayout();
  assert.equal(states.length, 1);
  const presentation = states[0].presentation;
  h.props.detail = createElement(Modal, { title: '订阅', onClose: () => calls.push('新关闭'), leading: createElement('button', { onClick: () => calls.push('新返回') }), children: createElement('div') });
  h.render(); h.commitLayout();
  assert.equal(states.length, 1, '普通重渲染不会向父组件反复setState');
  presentation.onClose();
  presentation.leading.props.onClick({});
  assert.deepEqual(calls, ['新关闭', '新返回']);
  h.props.detail = null;
  h.render(); h.commitLayout();
  assert.equal(states.at(-1).presentation.title, '概览');
  assert.equal(states.at(-1).suspended, false);
});

test('技能连接器 RSS添加入口及返回均使用ModalFlow，列表一直保留', async () => {
  const cases = [
    { component: 'SkillsPanel', key: 'skills', index: 3, label: '添加技能', snapshot: { revision: 1, skills: [], sources: [], market: [], marketSources: [], summary: {}, disabledDirectory: '', stagingPath: '' } },
    { component: 'McpPanel', key: 'mcp', index: 3, label: '添加连接', snapshot: { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} } },
    { component: 'RssPanel', key: 'rss', index: 0, label: '添加订阅', snapshot: { revision: 1, articles: [], groups: [], feeds: [], recommendations: [], refreshing: [], summary: {} } },
  ];
  for (const item of cases) {
    const api = {}, h = await harness(`src/client/${item.component}.tsx`, item.component, { api, projects: [], embedded: true, onClose() {} });
    h.seedPanelSnapshot(item.index, api, item.key, item.snapshot);
    const flow = () => h.render().find(n => n.type?.name === 'ModalFlow')!;
    const main = () => nodes(flow().props.main);
    const button = main().find(n => n.type === 'button' && (n.props.children === item.label || n.props.children?.includes?.(item.label)))!;
    assert.ok(button, item.component);
    const mainType = flow().props.main.type;
    button.props.onClick();
    assert.equal(flow().props.embedded, true);
    assert.equal(flow().props.main.type, mainType);
    assert.ok(flow().props.detail, `${item.component}以内容描述接入详情，不挂载独立Modal`);
    assert.equal(flow().props.detail.props.title, item.label);
    flow().props.detail.props.onClose();
    assert.ok(!flow().props.detail, `${item.component}返回原列表`);
    assert.equal(flow().props.main.type, mainType);
  }
});

test('三个管理页设置直达对应扩展子页，共用外壳并在返回时执行关闭保护', async () => {
  const { snapshot } = fixture();
  for (const kind of ['skills', 'mcp', 'rss'] as const) {
    let resets = 0, allowed = false;
    const h = await harness('src/client/Workbase.tsx', 'WorkbaseOverview', {
      kind, api: {}, snapshot, busy: false, onReport() {}, refresh() {}, navigate() {}, notify() {}, onClose() {},
      settings: { preview() {}, save: async () => true, resetPreview() { resets++; } },
    });
    const before = h.render(), panel = before.find(n => n.type?.name === { skills: 'SkillsPanel', mcp: 'McpPanel', rss: 'RssPanel' }[kind])!;
    const shell = before.find(n => n.type?.name === 'Modal')!;
    panel.props.onSettings();
    const settings = h.render().find(n => n.type?.name === 'Settings')!;
    assert.equal(settings.props.initialExtension, kind);
    assert.equal(settings.props.embedded, true);
    assert.equal(h.render().filter(n => n.type?.name === 'Modal').length, 1);
    assert.equal(h.render().find(n => n.type?.name === 'Modal')!.type, shell.type);
    assert.equal(h.render().find(n => n.type?.name === 'Modal')!.props.className, '', '设置采用普通设置滚动区域，避免继承概览的overflow:hidden');
    assert.ok(h.render().find(n => n.type === 'div' && n.props.hidden === true));
    settings.props.registerCloseGuard(async () => allowed);
    settings.props.onClose(); await flush();
    assert.ok(h.render().find(n => n.type?.name === 'Settings'));
    allowed = true;
    settings.props.onClose(); await flush();
    assert.ok(!h.render().find(n => n.type?.name === 'Settings'));
    assert.equal(resets, 1);
    assert.equal(h.render().find(n => n.type === panel.type)!.props.api, panel.props.api);
  }
});

test('技能来源仅在存在旧版停用安装时显示目录入口', async () => {
  const api = {}, h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', {
    api, projects: [], embedded: true, onClose() {},
  });
  const snapshot = { revision: 1, skills: [], sources: [], market: [], marketSources: [], summary: {}, stagingPath: '/legacy', legacyStagedCount: 0 };
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  h.render().find(n => n.props?.id === 'skills-tab-sources')!.props.onClick();
  const directory = () => h.render().find(n => n.type === 'button' && n.props.children === '打开目录');
  assert.ok(!directory());
  h.seedPanelSnapshot(3, api, 'skills', { ...snapshot, legacyStagedCount: 1 });
  assert.ok(directory());
  h.seedPanelSnapshot(3, api, 'skills', { ...snapshot, legacyStagedCount: 0 });
  assert.ok(!directory());
});

test('扩展设置跨一级分类保留当前子页与未保存配置', async () => {
  const { snapshot } = fixture();
  const h = await harness('src/client/Settings.tsx', 'Settings', {
    snapshot, initialExtension: 'rss', busy: false, preview() {}, save: async () => true, onClose() {}, pickDirectory: async () => null,
  });
  const extension = () => h.render().find(n => n.type?.name === 'ExtensionSettings')!;
  extension().props.onChange({ ...extension().props.value, rss: { refreshMinutes: 15 } });
  extension().props.onTabChange('mcp');
  h.render().find(n => n.props?.id === 'wb-settings-tab-general')!.props.onClick();
  assert.ok(!extension());
  h.render().find(n => n.props?.id === 'wb-settings-tab-extensions')!.props.onClick();
  assert.equal(extension().props.tab, 'mcp');
  assert.equal(extension().props.value.rss.refreshMinutes, 15);
});

test('技能创建拦截非法名称并明确提示，改成合法名称后按原范围提交', async () => {
  const { project } = fixture();
  const calls: any[] = [];
  const snapshot = { skills: [], sources: [], market: [], marketSources: [], summary: {} };
  const api = { call: async (command: any) => {
    calls.push(command);
    return command.method === 'save' ? { message: '已保存', effective: 'effective' } : snapshot;
  } };
  const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [project], embedded: true, onClose() {} });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加技能'))!.props.onClick();
  const field = (label: string) => h.render().find(n => n.props?.['aria-label'] === label && ['input', 'textarea'].includes(n.type))!;
  const change = (label: string, value: string) => field(label).props.onChange({ target: { value } });
  const scope = () => h.render().find(n => n.type?.name === 'SkillScopePicker')!;
  const button = () => h.render().find(n => n.type === 'button' && n.props.className === 'primary' && n.props.children === '创建技能')!;
  change('简短说明', '测试技能'); change('技能正文', '# 正文');
  scope().props.onChange(['p']);
  let focused = 0;
  for (const name of ['../test', 'a/b', 'a\\b', 'test:', 'a\u0000b', 'con', 'test.']) {
    change('技能名称', name);
    assert.equal(button().props.disabled, true);
    assert.equal(field('技能名称').props['aria-invalid'], true);
    const help = h.render().find(n => n.props?.id === field('技能名称').props['aria-describedby'])!;
    assert.equal(help.props.role, 'alert');
    assert.match(help.props.children, /路径分隔符、控制字符或系统保留名称/);
    field('技能名称').ref.current = { focus() { focused++; } };
    h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
    await flush();
    assert.equal(calls.length, 0, 'Enter提交也不能将非法名称发给后端');
  }
  assert.equal(focused, 7);
  change('技能名称', '团队 Code Review');
  assert.equal(button().props.disabled, false);
  assert.equal(field('技能名称').props['aria-invalid'], undefined);
  button().props.onClick(); await flush();
  const command = calls.find(command => command.method === 'save');
  assert.ok(command);
  assert.equal(command.input.name, '团队 Code Review');
  assert.equal(command.input.scope, 'project');
  assert.deepEqual(Array.from(command.input.projectIds), ['p']);
  assert.equal(command.input.sourceId, 'project');
});

test('市场技能等待真实详情，加载后按市场身份提交并保留项目选择', async () => {
  const { project } = fixture(), calls: any[] = [];
  const candidate = { id: 'candidate', marketSourceId: 'market', name: '目录名', description: '摘要', body: '',
    catalog: { kind: 'skillsh', source: 'owner/repo', skillId: 'test-skill' } };
  const snapshot = { skills: [], sources: [], market: [candidate], marketSources: [], summary: {} };
  let resolve!: (value: unknown) => void;
  const pending = new Promise(done => { resolve = done; });
  const api = { call: async (command: any) => {
    calls.push(command);
    if (command.method === 'market.detail') return pending;
    if (command.method === 'market.install') {
      const skill = { ...command.input, id: 'installed', owner: 'workbase', enabled: true, effective: 'effective' };
      Object.assign(snapshot, { skills: [skill] });
      return { skill, saved: true, message: '已保存', effective: 'effective' };
    }
    return snapshot;
  } };
  const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [project], embedded: true, onClose() {} });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  h.render().find(n => n.props?.role === 'tab' && n.props.children === '技能市场')!.props.onClick();
  h.render().find(n => n.type === 'button' && n.props.children === '安装')!.props.onClick();
  const button = () => h.render().find(n => n.type === 'button' && n.props.children === '添加技能' && n.props.onClick)!;
  const field = (label: string) => h.render().find(n => n.props?.['aria-label'] === label && ['input', 'textarea'].includes(n.type))!;
  assert.equal(button().props.disabled, true);
  assert.equal(field('技能名称').props['aria-invalid'], undefined);
  assert.ok(!h.render().some(n => n.props?.role === 'alert'), '首次打开和加载期间不显示空错误或名称红字');
  assert.ok(h.render().some(n => n.type === 'form' && n.props.className === 'skill-market-form'));
  assert.equal(calls[0]?.method, 'market.detail');
  resolve({ ...candidate, name: '代码审查', description: '完整说明', body: '# 真实正文', files: ['SKILL.md', 'help.txt'] });
  await flush();
  assert.equal(field('技能名称').props.value, '代码审查');
  assert.equal(field('技能正文').props.value, '# 真实正文');
  h.render().find(n => n.type?.name === 'SkillScopePicker')!.props.onChange(['p']);
  button().props.onClick(); await flush();
  const installed = calls.find(c => c.method === 'market.install');
  assert.equal(installed.input.marketId, candidate.id);
  assert.equal(installed.input.name, '代码审查');
  assert.deepEqual(Array.from(installed.input.projectIds), ['p']);
  assert.ok(h.render().some(n => n.type === 'button' && n.props.children === '已安装'), '名称与目录摘要不同仍匹配安装回执');
  Object.assign(snapshot, { skills: [] });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  assert.ok(h.render().some(n => n.type === 'button' && n.props.children === '安装'));
});

test('市场技能详情返回后，迟到响应不覆盖新的创建草稿', async () => {
  const candidate = { id: 'candidate', marketSourceId: 'market', name: '目录名', description: '摘要', body: '' };
  const snapshot = { skills: [], sources: [], market: [candidate], marketSources: [], summary: {} };
  let resolve!: (value: unknown) => void;
  const pending = new Promise(done => { resolve = done; });
  const api = { call: async (command: any) => command.method === 'market.detail' ? pending : snapshot };
  const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [], embedded: true, onClose() {} });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  h.render().find(n => n.props?.role === 'tab' && n.props.children === '技能市场')!.props.onClick();
  h.render().find(n => n.type === 'button' && n.props.children === '安装')!.props.onClick();
  h.render().find(n => n.type?.name === 'ModalFlow')!.props.detail.props.onClose();
  h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加技能'))!.props.onClick();
  resolve({ ...candidate, name: 'late-skill', body: '迟到正文' }); await flush();
  assert.equal(h.render().find(n => n.props?.['aria-label'] === '技能名称')!.props.value, '');
});

test('离开仍在搜索的技能市场后，目录来源的刷新可操作', async () => {
  const snapshot = { skills: [], sources: [], market: [], marketSources: [], summary: {} };
  const api = {}, h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [], embedded: true, onClose() {} });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  h.seedState(25, true);
  h.render().find(n => n.props?.role === 'tab' && n.props.children === '技能来源')!.props.onClick();
  const refresh = h.render().find(n => n.type?.name === 'IconButton' && n.props.label === '重新扫描')!;
  assert.equal(refresh.props.disabled, false);
});

test('连接器市场替代旧来源页签，详情保留添加且保存失败保留草稿', async () => {
  let denied = true;
  const source = { id: 'source', name: '自定义目录', url: 'https://example.org/mcp', enabled: true };
  let snapshot = { connections: [], sources: [source], foreign: [], capabilities: {}, defaults: {} };
  const calls: any[] = [];
  const api = { call: async (command: any) => {
    calls.push(command);
    if (command.method === 'sourceSave') {
      if (denied) throw new Error('拒绝写入');
      snapshot = { ...snapshot, sources: [...snapshot.sources, { ...command.input, id: 'new' }] };
    }
    return snapshot;
  } };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {},
    memory: { extensions: { mcp: { tab: 'marketSources', search: '保留搜索' } }, save() {} } });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  let tree = h.render();
  assert.deepEqual(tree.filter(n => n.props?.role === 'tab').map(n => n.props.children), ['我的连接', '连接器市场']);
  assert.equal(tree.find(n => n.props?.role === 'tab' && n.props.children === '连接器市场').props['aria-selected'], true);
  assert.equal(tree.find(n => n.props?.['aria-label'] === '搜索连接器市场').props.value, '保留搜索');
  for (const label of ['市场来源', '加载市场'])
    assert.equal(tree.find(n => n.props?.label === label).props.outlined, true);
  tree.find(n => n.props?.label === '市场来源').props.onClick();
  tree = h.render();
  assert.ok(tree.some(n => n.type === 'section' && n.props?.['aria-label'] === '市场来源'));
  const sourcesDetail = tree.find(n => n.type?.name === 'ModalFlow').props.detail;
  assert.equal(sourcesDetail.props.title, '市场来源');
  assert.ok(tree.some(n => n.type === 'form' && n.props.id === 'integration-mcp-source-form'));
  const addSource = tree.find(n => n.type === 'button' && n.props.form === 'integration-mcp-source-form');
  assert.ok(addSource, '底部按钮关联来源表单，仍支持原生提交');
  assert.equal(addSource.props.disabled, true);
  assert.ok(!tree.some(n => typeof n.props?.children === 'string' && n.props.children.startsWith('支持官方连接器注册表')));
  tree.find(n => n.props?.['aria-label'] === '来源名称').props.onChange({ target: { value: '新目录' } });
  tree.find(n => n.props?.['aria-label'] === '目录地址').props.onChange({ target: { value: 'https://example.org/new' } });
  h.render().find(n => n.type?.name === 'Menu' && n.props.label === '来源操作').props.items[0].action();
  h.render().find(n => n.type?.name === 'ModalFlow').props.detail.props.onClose();
  assert.equal(h.render().find(n => n.props?.['aria-label'] === '来源名称').props.value, '新目录', '取消移除不覆盖添加草稿');
  h.render().find(n => n.type === 'form' && n.props.id === 'integration-mcp-source-form').props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(h.render().find(n => n.props?.['aria-label'] === '来源名称').props.value, '新目录');
  denied = false;
  h.render().find(n => n.type === 'form' && n.props.id === 'integration-mcp-source-form').props.onSubmit({ preventDefault() {} });
  await flush();
  tree = h.render();
  assert.equal(calls.filter(c => c.method === 'sourceSave').length, 2);
  assert.equal(calls.find(c => c.method === 'sourceSave').input.id, undefined, '添加不复用被移除来源的身份');
  assert.ok(tree.some(n => n.type === 'section' && n.props?.['aria-label'] === '市场来源'));
  assert.ok(tree.some(n => n.props?.title === '新目录'));
  assert.equal(tree.find(n => n.type?.name === 'ModalFlow').props.detail.props.title, '市场来源');
  assert.equal(tree.find(n => n.props?.['aria-label'] === '来源名称').props.value, '');
  assert.equal(tree.find(n => n.props?.['aria-label'] === '目录地址').props.value, '');
  tree.find(n => n.type?.name === 'ModalFlow').props.detail.props.onClose();
  assert.equal(h.render().find(n => n.props?.['aria-label'] === '搜索连接器市场').props.value, '保留搜索');
});

test('连接器市场失败回执显示来源和原因，保留上次成功目录的连接入口', async () => {
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const snapshot = { connections: [], sources: [
    { id: 'community', name: '社区目录', url: 'https://example.org/catalog', enabled: true },
  ], foreign: [], capabilities: {}, defaults: {} };
  const candidate = { id: 'docs', sourceId: 'community', name: '文档服务', description: '检索文档',
    config: { transport: 'http', url: 'https://example.org/mcp' } };
  const api = { call: async (command: any) => command.method === 'market' ? {
    candidates: [candidate], errors: [{ sourceId: 'community', reason: '市场目录 HTTP 503', cached: true,
      message: '市场刷新失败：市场目录 HTTP 503；当前显示上次成功加载的目录。' }],
  } : snapshot };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {},
    memory: { extensions: { mcp: { tab: 'catalog' } }, save() {} } }, {
    effects: true, setInterval() { return 1; }, clearInterval() {},
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  h.render(); h.commitLayout();
  for (const [id, callback] of timers) { timers.delete(id); callback(); }
  await flush();
  const tree = h.render();
  assert.ok(tree.some(n => n.type === 'button' && n.props.children === '文档服务'));
  assert.ok(tree.some(n => n.type === 'button' && n.props.children === '连接'));
  const status = tree.find(n => n.props.role === 'status' && n.props.className === 'integration-help')!;
  assert.match(status.props.children, /社区目录/);
  assert.match(status.props.children, /HTTP 503/);
  assert.match(status.props.children, /上次成功加载/);
  assert.equal(tree.find(n => n.props.label === '加载市场')!.props.disabled, false);
  h.unmount();
});

test('连接器市场先显示本地目录再后台更新，迟到本地读取不能覆盖新目录', async () => {
  const timers = new Map<number, () => void>();
  let timerId = 0, localCalls = 0, remoteCalls = 0;
  let resolveRemote!: (value: unknown) => void, resolveLocal!: (value: unknown) => void;
  const snapshot = { connections: [], sources: [
    { id: 'community', name: '社区目录', url: 'https://example.org/catalog', enabled: true },
  ], foreign: [], capabilities: {}, defaults: {} };
  const result = (name: string) => ({ candidates: [{ id: name, sourceId: 'community', name, description: '',
    config: { transport: 'http', url: 'https://example.org/mcp' } }], errors: [] });
  const api = { call: async (command: any) => {
    if (command.method === 'market.cached') return ++localCalls === 1 ? result('本地目录')
      : new Promise(resolve => { resolveLocal = resolve; });
    if (command.method === 'market') return ++remoteCalls === 1
      ? new Promise(resolve => { resolveRemote = resolve; }) : result('最新目录');
    return snapshot;
  } };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {},
    memory: { extensions: { mcp: { tab: 'catalog' } }, save() {} } }, {
    effects: true, setInterval() { return 1; }, clearInterval() {},
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  const has = (name: string) => h.render().some(n => n.type === 'button' && n.props.children === name);
  const tick = () => { for (const [id, callback] of timers) { timers.delete(id); callback(); } };
  h.render(); h.commitLayout(); await flush();
  assert.equal(remoteCalls, 0);
  assert.equal(has('本地目录'), true, '远端还未开始或返回时本地卡片已经可读');
  tick(); await flush();
  assert.equal(has('本地目录'), true, '后台请求过程中保留本地卡片');
  resolveRemote(result('在线目录')); await flush();
  assert.equal(has('在线目录'), true);
  h.render().find(n => n.props.label === '加载市场')!.props.onClick();
  h.render(); h.commitLayout(); tick(); await flush();
  assert.equal(has('最新目录'), true);
  resolveLocal(result('迟到旧目录')); await flush();
  assert.equal(has('最新目录'), true);
  assert.equal(has('迟到旧目录'), false);
  h.unmount();
});

test('连接器来源保存失败走 Toast，成功后刷新失败不重试写入且保留明确回执', async () => {
  const snapshot = { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} };
  const messages: [string, string][] = [], calls: any[] = [];
  let committed = false;
  const api = { call: async (command: any) => {
    calls.push(command);
    if (command.method === 'sourceSave') {
      if (!committed) throw new Error('拒绝写入');
      return {};
    }
    throw new Error('读取失败');
  } };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {},
    notify: (message: string, tone: string) => messages.push([message, tone]) });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  h.render().find(n => n.props?.role === 'tab' && n.props.children === '连接器市场')!.props.onClick();
  h.render().find(n => n.props?.label === '市场来源')!.props.onClick();
  for (const [label, value] of [['来源名称', '新目录'], ['目录地址', 'https://example.org/catalog']])
    h.render().find(n => n.props?.['aria-label'] === label)!.props.onChange({ target: { value } });
  const submit = async () => {
    h.render().find(n => n.props?.id === 'integration-mcp-source-form')!.props.onSubmit({ preventDefault() {} });
    await flush();
  };
  await submit();
  assert.deepEqual(messages, [['拒绝写入', 'info']]);
  assert.ok(!h.render().some(n => n.props?.role === 'alert'));
  assert.equal(h.render().find(n => n.props?.['aria-label'] === '来源名称')!.props.value, '新目录');
  committed = true; await submit();
  assert.deepEqual(messages.slice(1), [['市场来源已保存', 'success'], ['操作已完成，但刷新失败：读取失败', 'info']]);
  assert.equal(calls.filter(c => c.method === 'sourceSave').length, 2);
  assert.ok(!h.render().some(n => n.props?.role === 'alert'));
});

test('技能保存失败使用 Toast 并保留表单，名称校验仍在字段位置', async () => {
  const snapshot = { skills: [], sources: [], market: [], marketSources: [], summary: {} };
  const messages: [string, string][] = [];
  const api = { call: async (command: any) => {
    if (command.op === 'snapshot') return { preferences: initialState().preferences };
    if (command.method === 'snapshot' || command.method === 'scan') return snapshot;
    throw new Error('拒绝保存');
  } };
  const h = await harness('src/client/SkillsPanel.tsx', 'SkillsPanel', { api, projects: [], embedded: true, onClose() {},
    notify: (message: string, tone: string) => messages.push([message, tone]) }, { effects: true });
  h.seedPanelSnapshot(3, api, 'skills', snapshot);
  h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加技能'))!.props.onClick();
  h.render(); h.commitLayout(); await flush();
  const name = () => h.render().find(n => n.type === 'input' && n.props?.['aria-label'] === '技能名称')!;
  name().props.onChange({ target: { value: '团队审查' } });
  h.render().find(n => n.type === 'button' && n.props.className === 'primary' && n.props.children === '创建技能')!.props.onClick();
  await flush();
  assert.deepEqual(messages, [['拒绝保存', 'info']]);
  assert.equal(name().props.value, '团队审查');
  assert.ok(!h.render().some(n => n.props?.role === 'alert'));
  name().props.onChange({ target: { value: '../非法名称' } });
  assert.equal(name().props['aria-invalid'], true);
  h.unmount();
});

test('选择另一连接器市场候选时使用其配置，不被之前的创建草稿覆盖', async () => {
  const snapshot = { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} };
  const api = {}, h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加连接'))!.props.onClick();
  h.render().find(n => n.type === 'input' && n.props['aria-label'] === '连接名称')!.props.onChange({ target: { value: '原草稿' } });
  h.render().find(n => n.type?.name === 'ModalFlow')!.props.detail.props.onClose();
  h.render().find(n => n.props?.role === 'tab' && n.props.children === '连接器市场')!.props.onClick();
  h.seedState(17, [{ name: '新服务', description: '说明', config: { transport: 'http', url: 'https://example.org/new' } }]);
  h.render().find(n => n.type === 'button' && n.props.children === '连接')!.props.onClick();
  assert.equal(h.render().find(n => n.type === 'input' && n.props['aria-label'] === '连接名称')!.props.value, '新服务');
});

test('连接器市场添加单栏显示说明及凭据，必填校验和多目标绑定保留草稿隔离', async () => {
  const snapshot = { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} }, calls: any[] = [];
  const api = { call: async (command: any) => {
    calls.push(command); if (command.method === 'save') throw new Error('拒绝写入'); return snapshot;
  } };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  h.render().find(n => n.props?.role === 'tab' && n.props.children === '连接器市场')!.props.onClick();
  h.seedState(17, [{ name: '地图', description: '摘要', config: { transport: 'stdio', auth: 'none', command: 'npx',
    env: { MAP_KEY: '', SEARCH_KEY: '', REGION: '' } }, metadata: { description: '完整说明', vendor: '地图平台',
    credentialFields: [
      { key: 'key', label: '地图 Key', required: true, secret: true, bindings: [{ target: 'env', name: 'MAP_KEY' }, { target: 'env', name: 'SEARCH_KEY' }] },
      { key: 'region', label: '区域', required: false, secret: false, bindings: [{ target: 'env', name: 'REGION' }] },
    ] } }]);
  const add = () => h.render().find(n => n.type === 'button' && n.props.children === '连接')!.props.onClick();
  add();
  let tree = h.render();
  assert.ok(!tree.some(n => n.props?.className === 'integration-detail-nav'));
  assert.ok(tree.some(n => n.props?.className === 'integration-reading integration-description' && n.props.children === '完整说明'));
  assert.ok(tree.some(n => n.props?.['data-single'] === true));
  const submit = () => h.render().find(n => n.props?.id === 'integration-mcp-edit-form')!.props.onSubmit({ preventDefault() {} });
  submit(); await flush();
  assert.equal(calls.length, 0);
  assert.ok(h.render().some(n => n.props?.role === 'alert' && String(n.props.children).includes('地图 Key')));
  h.render().find(n => n.type === 'input' && n.props?.['aria-label'] === '地图 Key')!.props.onChange({ target: { value: 'test-key' } });
  submit(); await flush();
  assert.deepEqual(structuredClone(calls[0].input.env), { MAP_KEY: 'test-key', SEARCH_KEY: 'test-key' });
  assert.equal('credentialValues' in calls[0].input, false);
  h.render().find(n => n.type?.name === 'ModalFlow')!.props.detail.props.onClose();
  add();
  assert.equal(h.render().find(n => n.type === 'input' && n.props?.['aria-label'] === '地图 Key')!.props.value, 'test-key');
  h.render().find(n => n.type?.name === 'ModalFlow')!.props.detail.props.onClose();
  h.render().find(n => n.type === 'button' && n.props.children?.includes?.('添加连接'))!.props.onClick();
  tree = h.render();
  assert.ok(tree.some(n => n.props?.className === 'integration-detail-nav'));
  assert.ok(!tree.some(n => n.type === 'input' && n.props?.['aria-label'] === '地图 Key'));
});

test('连接器市场双请求头凭据不再显示重复单密钥，分别提交两个值', async () => {
  const snapshot = { connections: [], sources: [], foreign: [], capabilities: {}, defaults: {} }, calls: any[] = [];
  const api = { call: async (command: any) => { calls.push(command); throw new Error('拒绝写入'); } };
  const h = await harness('src/client/McpPanel.tsx', 'McpPanel', { api, projects: [], embedded: true, onClose() {} });
  h.seedPanelSnapshot(3, api, 'mcp', snapshot);
  h.render().find(n => n.props?.role === 'tab' && n.props.children === '连接器市场')!.props.onClick();
  h.seedState(17, [{ name: '数据服务', description: '摘要', config: { transport: 'http', auth: 'api-key', keyHeader: 'X-Client-Secret',
    url: 'https://example.org/mcp', headers: { 'X-Client-Id': '', 'X-Client-Secret': '' } }, metadata: { credentialFields: [
      { key: 'id', label: 'Client ID', required: true, secret: false, bindings: [{ target: 'headers', name: 'X-Client-Id' }] },
      { key: 'secret', label: 'Client Secret', required: true, secret: true, bindings: [{ target: 'headers', name: 'X-Client-Secret' }] },
    ] } }]);
  h.render().find(n => n.type === 'button' && n.props.children === '连接')!.props.onClick();
  assert.ok(!h.render().some(n => n.type === 'input' && n.props?.['aria-label'] === '密钥（留空保留）'));
  assert.equal(h.render().find(n => n.type === 'textarea' && n.props?.['aria-label'] === '请求头（JSON 对象）')!.props.value, '{}');
  for (const [label, value] of [['Client ID', 'test-id'], ['Client Secret', 'test-secret']])
    h.render().find(n => n.type === 'input' && n.props?.['aria-label'] === label)!.props.onChange({ target: { value } });
  h.render().find(n => n.props?.id === 'integration-mcp-edit-form')!.props.onSubmit({ preventDefault() {} }); await flush();
  assert.deepEqual(structuredClone(calls[0].input.headers), { 'X-Client-Id': 'test-id', 'X-Client-Secret': 'test-secret' });
  assert.equal(calls[0].input.secret, '');
});

test('技能详情编辑、连接器详情授权与RSS阅读返回保留同一管理流程', async () => {
  const skill = { id: 's', name: 'sample', description: '示例', body: '# 内容', scope: 'global', projectIds: [],
    sourceId: 'global', files: [], installations: [], enabled: true, owner: 'workbase', version: 1 };
  const connection = { id: 'c', name: '连接', tools: [], credentialRefs: [], projectIds: [], scope: 'global', enabled: true, state: 'connected', auth: 'oauth' };
  const article = { id: 'a', feedId: 'f', title: '文章', body: '', summary: '', sequence: 1 };
  const cases = [
    { component: 'SkillsPanel', key: 'skills', index: 3, title: 'sample', edit: '编辑技能', snapshot: { skills: [skill], sources: [], market: [], marketSources: [], summary: {} } },
    { component: 'McpPanel', key: 'mcp', index: 3, title: '连接', edit: '编辑配置', snapshot: { connections: [connection], sources: [], foreign: [], capabilities: {}, defaults: {} } },
    { component: 'RssPanel', key: 'rss', index: 0, title: '文章', edit: '', snapshot: { articles: [article], feeds: [{ id: 'f', name: '订阅', groupId: '', enabled: true }], groups: [], recommendations: [], refreshing: [], summary: {} } },
  ];
  for (const item of cases) {
    const api = {}, h = await harness(`src/client/${item.component}.tsx`, item.component, { api, projects: [], embedded: true, onClose() {} });
    h.seedPanelSnapshot(item.index, api, item.key, item.snapshot);
    const flow = () => h.render().find(n => n.type?.name === 'ModalFlow')!;
    const flowType = flow().type;
    if (item.key === 'rss') nodes(flow().props.main).find(n => n.props?.onRead)!.props.onRead(article);
    else nodes(flow().props.main).find(n => n.props?.title === item.title && n.type === 'button')!.props.onClick();
    assert.equal(flow().type, flowType);
    assert.ok(flow().props.detail);
    if (item.edit) {
      const edit = nodes(flow().props.detail).find(n => n.type === 'button' && (n.props.children === item.edit || n.props.children?.includes?.(item.edit)))!;
      edit.props.onClick();
      assert.equal(flow().type, flowType);
      assert.match(flow().props.detail.props.title, /编辑/);
      flow().props.detail.props.leading.props.onClick();
      assert.ok(flow().props.detail, '编辑返回详情');
      assert.doesNotMatch(flow().props.detail.props.title, /编辑/);
      if (item.key === 'mcp') {
        nodes(flow().props.detail).find(n => n.type === 'button' && n.props.children === '授权管理')!.props.onClick();
        assert.equal(flow().type, flowType);
        assert.ok(nodes(flow().props.detail).some(n => n.props?.children === '开始授权'));
      }
    } else assert.equal(flow().props.detail.props.title, '文章');
    flow().props.detail.props.onClose();
    assert.ok(!flow().props.detail, '详情关闭返回原列表');
    assert.equal(flow().type, flowType);
  }
});

test('首页入口和跨核心扩展导航始终持有同一个概览组件', async () => {
  const { snapshot } = fixture();
  const h = await harness('src/client/Workbase.tsx', 'Workbase', { api: {}, memory: new UiMemory() });
  h.seedSnapshot(snapshot);
  const home = () => h.render().find(n => n.type?.name === 'Home')!;
  home().props.openOverview('skills');
  const overview = () => h.render().find(n => n.type?.name === 'WorkbaseOverview')!;
  const type = overview().type;
  for (const tab of ['diagnostic', 'mcp', 'running', 'rss', 'pending', 'recent']) {
    overview().props.navigation.props.onChange(tab);
    assert.equal(overview().type, type);
    assert.equal(overview().key, null);
    assert.equal(overview().props.kind, tab);
    assert.ok(home(), '导航不卸载首页');
  }
  overview().props.onClose();
  assert.equal(overview(), undefined);
});

test('待办概览详情挂起外层，返回保留列表，诊断跳转关闭概览', async () => {
  const { snapshot, project } = fixture();
  const todo = { id: 't', projectId: 'p', title: '待办', note: '', done: false, creator: 'user',
    createdAt: 1, updatedAt: 1, version: 1 };
  project.todos = [todo as any];
  const opened: string[] = [];
  let closed = 0;
  const h = await harness('src/client/Home.tsx', 'StatsOverview', {
    stat: 'pending', snapshot, api: {}, busy: false, embedded: true,
    refresh: async () => {}, navigate: (id: string) => opened.push(id), onReport() {},
    onClose: () => closed++,
  });
  const panel = () => h.render().find(n => n.props?.entries)!;
  panel().props.entries[0].open();
  assert.equal(h.render().find(n => n.props?.embedded)?.props.suspended, true);
  const detail = h.render().find(n => n.props?.initial?.id === todo.id)!;
  assert.equal(detail.props.project, project);
  detail.props.onClose();
  assert.equal(h.render().find(n => n.props?.embedded)?.props.suspended, false);
  assert.equal(panel().props.entries[0].id, 't');
  h.props.stat = 'diagnostic';
  h.render().find(n => n.props?.openProject)!.props.openProject('p');
  assert.deepEqual(opened, ['p']);
  assert.equal(closed, 1);
});

test('概览运行中、近期会话与待办共用标题加说明页头，右侧列表不重复标题', async () => {
  const { snapshot } = fixture();
  const diagnosis = { checkedAt: 0, checks: [], issues: [], repair: { cache: false, orphan: false } };
  const h = await harness('src/client/Home.tsx', 'StatsOverview', {
    stat: 'running', snapshot, api: {}, busy: false, refresh: async () => {}, navigate() {},
    diagnosis, onReport() {}, onClose() {},
  });
  const heading = () => h.render().find(n => n.props?.className === 'stats-page-heading')!;
  const description = () => h.render().find(n => String(n.props?.className ?? '').includes('stats-page-description'))!;
  const expected = {
    running: ['运行中', /^当前正在运行的会话。$/],
    recent: ['近期会话', /^最近 \d+ 天更新的未归档会话。$/],
    pending: ['项目待办', /^尚未完成的待办，含手动创建与 Agent 创建。$/],
  } as const;
  for (const [stat, [title, text]] of Object.entries(expected)) {
    h.props.stat = stat; h.render();
    assert.equal(heading().props.children, title, stat);
    assert.match(description().props.children, text, stat);
    assert.equal(h.render().filter(n => n.props?.className === 'stats-page-heading').length, 1, stat);
    for (const label of ['运行中会话', '待办列表'])
      assert.equal(h.render().some(n => n.props?.children === label), false, `${stat}: ${label}`);
  }
});

test('管理快照跨卸载复用，同模块不同连接及同连接不同模块保持隔离', async () => {
  const h = await harness('src/client/ui.tsx', 'usePanelSnapshot', {});
  const api = {}, otherApi = {}, snapshot = { revision: 7, records: ['已加载'] };
  const [empty, save] = h.invoke(api, 'skills');
  assert.equal(empty, undefined);
  save(snapshot);
  h.remount();
  assert.equal(h.invoke(api, 'skills')[0], snapshot);
  h.remount();
  assert.equal(h.invoke(api, 'mcp')[0], undefined);
  h.remount();
  assert.equal(h.invoke(otherApi, 'skills')[0], undefined);
  h.remount();
  assert.equal(h.invoke(api, 'skills')[0], snapshot);
});

test('规则跨页保留草稿并独立自动保存，无效规则不混入设置提交', async () => {
  const { snapshot } = fixture(), calls: any[] = [], rulesCalls: any[] = [];
  const h = await harness('src/client/Settings.tsx', 'Settings', { snapshot, busy: false,
    preview() {}, save: async (command: any) => { calls.push(command); return false; },
    call: async (command: any) => { rulesCalls.push(command); }, onClose() {}, pickDirectory: async () => null });
  const rules = defaultProjectRules();
  rules.global = { enabled: true, content: '# 全局' };
  rules.projects = [{ id: 'r1', name: '约定', enabled: true, projectIds: ['p'], content: '**项目**' }];
  const editor = () => h.render().find(n => n.props?.scope === 'global' && n.props?.value?.global)!;
  editor().props.onChange(rules);
  h.render().find(n => n.props?.id === 'wb-settings-tab-appearance')!.props.onClick();
  assert.equal(editor().props.value.projects[0].content, '**项目**');
  const submit = async () => { h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush(); };
  await submit();
  assert.deepEqual(JSON.parse(JSON.stringify(rulesCalls[0].rules)), rules);
  assert.deepEqual(JSON.parse(JSON.stringify(rulesCalls[0].expectedRules)), defaultProjectRules());
  assert.equal(calls[0].options.rules, undefined);
  assert.deepEqual(snapshot.preferences.rules, defaultProjectRules());
  const invalid = structuredClone(rules); invalid.global.content = '';
  editor().props.onChange(invalid);
  await submit(); assert.equal(calls.length, 2);
  assert.equal(rulesCalls.length, 1);
  invalid.global.enabled = false;
  editor().props.onChange(invalid);
  await submit(); assert.equal(calls.length, 3);
  assert.equal(rulesCalls.length, 2);
});

test('项目规则列表的添加及详情请求交给设置外层，不建立独立Modal', async () => {
  const value = { ...defaultProjectRules(), projects: [{ id: 'r', name: '规则', enabled: false, projectIds: [], content: '' }] };
  const selected: string[] = [], changed: any[] = [];
  const h = await harness('src/client/ProjectRulesSettings.tsx', 'ProjectRulesSettings', {
    scope: 'projects', value, projects: [], disabled: false,
    onChange: (next: any) => changed.push(next), select: (id: string) => selected.push(id),
  });
  h.render().find(n => n.props?.className === 'rules-name')!.props.onClick();
  assert.deepEqual(selected, ['r']);
  h.render().find(n => n.type === 'button' && n.props.children === '添加规则')!.props.onClick();
  assert.deepEqual(selected, ['r', 'new-rule']);
  assert.equal(changed[0].projects.at(-1).id, 'new-rule');
  assert.equal(h.render().some(n => n.type?.name === 'Modal'), false);
});

test('设置项目规则详情复用ModalFlow，返回保留设置及规则草稿，编辑不提交其他配置', async () => {
  const { snapshot } = fixture();
  snapshot.preferences.rules = { ...defaultProjectRules(), projects: [{ id: 'r', name: '规则', enabled: false, projectIds: [], content: '' }] };
  const saved: any[] = [];
  const h = await harness('src/client/Settings.tsx', 'Settings', {
    snapshot, busy: false, embedded: true, preview() {}, onClose() {}, pickDirectory: async () => null,
    save: async (command: any) => { saved.push(command); return true; },
  });
  const flow = () => h.render().find(n => n.type?.name === 'ModalFlow')!;
  assert.ok(flow(), '设置拥有与规则详情共用的内容描述');
  const type = flow().type;
  const list = () => h.render().find(n => n.props?.scope === 'projects' && n.type?.name === 'ProjectRulesSettings')!;
  list().props.select('r');
  assert.equal(flow().type, type);
  assert.equal(flow().props.detail.props.title, '规则');
  const detail = h.render().find(n => n.type?.name === 'ProjectRuleDetail')!;
  detail.props.onChange({ ...list().props.value, projects: [{ ...list().props.value.projects[0], name: '改名', content: '# 草稿' }] });
  assert.equal(flow().props.detail.props.title, '改名');
  assert.equal(saved.length, 0, '规则草稿不触发其他设置保存');
  flow().props.detail.props.onClose();
  assert.ok(!flow().props.detail);
  assert.equal(list().props.value.projects[0].content, '# 草稿');
  assert.equal(flow().type, type);
});

test('正文默认预览，点击进入原文，Escape回预览不关闭详情', async () => {
  const h = await harness('src/client/ProjectRulesSettings.tsx', 'RulesEditor', {
    label: '正文', value: '# 标题', disabled: false, onChange() {},
  });
  const field = () => h.render().find(n => n.type === 'textarea')!;
  assert.equal(field().props.hidden, true);
  h.render().find(n => n.props?.role === 'textbox')!.props.onClick({ preventDefault() {} });
  assert.equal(field().props.hidden, false);
  let stopped = false;
  field().props.onKeyDown({ key: 'Escape', nativeEvent: { isComposing: false }, preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(field().props.hidden, true); assert.equal(stopped, true);
});

test('规则预览中的复制按钮和链接保留原有点击及键盘行为', async () => {
  const h = await harness('src/client/ProjectRulesSettings.tsx', 'RulesEditor', {
    label: '正文', value: '```text\n规则\n```', disabled: false, onChange() {},
  });
  const preview = () => h.render().find(n => n.props?.role === 'textbox')!;
  const target = { closest: () => ({}) };
  const currentTarget = {};
  const preventDefault = () => assert.fail('不应拦截预览内控件的默认行为');
  preview().props.onClick({ target, currentTarget, preventDefault });
  for (const key of ['Enter', ' ']) preview().props.onKeyDown({ target, currentTarget, key, preventDefault });
  assert.equal(h.render().find(n => n.type === 'textarea')!.props.hidden, true);
});

test('规则项目多选点击保持展开，单选仍关闭菜单', async () => {
  for (const multiple of [true, false]) {
    const props: any = { value: '', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], label: '项目', onChange: () => {} };
    if (multiple) props.multipleValues = [];
    props.onChange = (value: string) => { if (multiple) props.multipleValues = [...props.multipleValues, value]; else props.value = value; };
    const h = await harness('src/client/ui.tsx', 'Picker', props);
    h.render().find(n => n.props?.['aria-haspopup'] === 'listbox')!.props.onClick();
    h.render().find(n => n.props?.role === 'option' && n.props.children[0].props.children[0].props.children === 'A')!.props.onClick();
    const list = h.render().find(n => n.props?.role === 'listbox');
    assert.equal(Boolean(list), multiple);
    if (multiple) {
      assert.equal(list.props['aria-multiselectable'], true);
      assert.equal(h.render().find(n => n.props?.role === 'option')!.props['aria-selected'], true);
      list.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
      assert.equal(h.render().some(n => n.props?.role === 'listbox'), false);
    }
  }
});

test('项目分组配置直接编辑提交规则，跨分类保留草稿，空白阻止保存，关闭后可恢复编辑', async () => {
  const { snapshot } = fixture();
  const calls: any[] = [];
  let ok = false, closed = false;
  const h = await harness('src/client/Settings.tsx', 'Settings', { snapshot, busy: false,
    preview() {}, save: async (command: any) => { calls.push(command); return ok; },
    onClose() { closed = true; }, pickDirectory: async () => null });
  const input = (label: string) => h.render().find(n => n.props?.['aria-label'] === label)!;
  const commitRule = () => h.render().find(n => n.props?.label === '提交规则内容')!;
  const toggle = (label: string, checked: boolean) => input(label).props.onChange({ target: { checked } });
  const submit = async () => { h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush(); };
  toggle('项目基础文件', true); toggle('Agent 协作规范', true); toggle('Git 初始化', true);
  const editor = () => h.render().find(n => n.props?.className === 'project-commit-rules')!;
  assert.equal(editor().type, 'div');
  assert.equal(editor().props.hidden, false);
  assert.equal(h.render().some(n => n.type === 'button' && n.props.children === '恢复默认提交规则'), false);
  toggle('添加已有项目时补齐缺失内容', true);
  commitRule().props.onChange('# 自定义规则\n使用 fix。\n');
  h.render().find(n => n.props?.id === 'wb-settings-tab-appearance')!.props.onClick();
  h.render().find(n => n.props?.id === 'wb-settings-tab-project')!.props.onClick();
  assert.equal(commitRule().props.value, '# 自定义规则\n使用 fix。\n');
  await submit();
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.projectInitialization)),
    { ...defaultProjectInitialization(), basic: true, agent: true, git: true, completeOnImport: true, commitRuleContent: '# 自定义规则\n使用 fix。\n' });
  assert.equal(closed, false);
  assert.deepEqual(snapshot.preferences.projectInitialization, defaultProjectInitialization());
  commitRule().props.onChange(' \n');
  await submit(); assert.equal(calls.length, 1);
  assert.equal(h.render().find(n => n.props?.type === 'submit')!.props.disabled, true);
  toggle('生成提交规则', false);
  assert.equal(editor().props.hidden, true);
  assert.equal(commitRule().props.disabled, true);
  await submit();
  assert.equal(calls[1].options.projectInitialization.commitRules, false);
  assert.equal(calls[1].options.projectInitialization.commitRuleContent, ' \n');
  toggle('生成提交规则', true);
  assert.equal(editor().props.hidden, false);
  assert.equal(commitRule().props.value, ' \n');
  commitRule().props.onChange('# 修改后的提交规则');
  ok = true;
  await submit();
  assert.equal(calls[2].options.projectInitialization.commitRuleContent, '# 修改后的提交规则');
  assert.equal(closed, true);
});

test('清空侧栏名称再隐藏入口仍能保存其他设置，恢复显示时继续校验草稿', async () => {
  const { snapshot } = fixture();
  const calls: any[] = [];
  const h = await harness('src/client/Settings.tsx', 'Settings', { snapshot, busy: false,
    preview() {}, save: async (command: any) => { calls.push(command); return true; }, onClose() {}, pickDirectory: async () => null });
  const name = () => h.render().find(n => n.props?.id === 'wb-sidebar-name')!;
  const visible = () => h.render().find(n => n.props?.['aria-label'] === '显示侧栏入口')!;
  const save = () => h.render().find(n => n.type === 'button' && n.props.type === 'submit')!;
  name().props.onChange({ target: { value: '  ' } });
  assert.equal(save().props.disabled, true);
  assert.equal(name().props['aria-invalid'], true);
  assert.equal(name().props['aria-describedby'], h.render().find(n => n.props?.role === 'alert')!.props.id);
  visible().props.onChange({ target: { checked: false } });
  assert.equal(name().props.disabled, true);
  assert.equal(save().props.disabled, false);
  h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.navigation.sidebarVisible, false);
  assert.equal(calls[0].options.navigation.sidebarName, snapshot.preferences.navigation.sidebarName);
  visible().props.onChange({ target: { checked: true } });
  assert.equal(name().props.value, '  ');
  assert.equal(save().props.disabled, true);
});

test('项目与会话重命名共用空白校验、处理中禁用与失败草稿保留', async () => {
  for (const label of ['项目名称', '会话名称']) {
    const calls: string[] = [];
    let closed = false;
    const h = await harness('src/client/Workbase.tsx', 'RenameForm', {
      label, initial: '原标题', busy: false, describedBy: 'save-error',
      save: async (value: string) => { calls.push(value); return false; }, onClose() { closed = true; },
    });
    const input = () => h.render().find(n => n.type === 'input')!;
    const form = () => h.render().find(n => n.type === 'form')!;
    input().props.onChange({ target: { value: '   ' } });
    form().props.onSubmit({ preventDefault() {} }); await flush();
    assert.equal(calls.length, 0);
    assert.equal(h.render().find(n => n.props?.type === 'submit')!.props.disabled, true);
    input().props.onChange({ target: { value: ' 修改后 ' } });
    form().props.onSubmit({ preventDefault() {} }); await flush();
    assert.deepEqual(calls, ['修改后']); assert.equal(closed, false);
    assert.equal(input().props.value, ' 修改后 ');
    assert.equal(input().props['aria-describedby'], 'save-error');
    h.props.busy = true; assert.equal(input().props.disabled, true);
    form().props.onSubmit({ preventDefault() {} }); await flush();
    assert.equal(calls.length, 1);
  }
});

test('分栏 Home 恢复默认、End 到上限，处理中不写入比例', async () => {
  const { project, snapshot } = fixture();
  const calls: any[] = [];
  const h = await harness('src/client/Detail.tsx', 'Detail', {
    project, snapshot, memory: new UiMemory(), api: {}, busy: false,
    mutate: async (command: any) => { calls.push(command); return true; },
  });
  const splitter = () => h.render().find(n => n.props?.role === 'separator')!;
  for (const [key, expected] of [['Home', 65], ['End', 70]] as const) {
    splitter().props.onKeyDown({ key, preventDefault() {} });
    await flush();
    assert.equal(calls.at(-1).patch.detail.p.ratio, expected);
  }
  h.props.busy = true;
  splitter().props.onKeyDown({ key: 'End', preventDefault() {} }); await flush();
  assert.equal(calls.length, 2);
});

test('全局搜索输入法 Enter 不打开结果，离开区域关闭，组合框关联实际选项', async () => {
  const { snapshot } = fixture();
  const memory = new UiMemory(); memory.search = '项目';
  let requests = 0;
  const h = await harness('src/client/Search.tsx', 'Search', { snapshot, memory,
    api: { call: async () => { requests++; return snapshot; } }, mutate: async () => true, notify() {} });
  const input = () => h.render().find(n => n.type === 'input')!;
  const root = () => h.render().find(n => n.props?.className?.includes('wb-search global-search'))!;
  input().ref.current = {};
  input().props.onFocus();
  for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }]) {
    root().props.onKeyDown({ key: 'Enter', nativeEvent, target: input().ref.current, preventDefault() {} });
  }
  await flush(); assert.equal(requests, 0);
  root().props.onKeyDown({ key: 'ArrowDown', nativeEvent: {}, preventDefault() {} });
  assert.equal(input().props['aria-activedescendant'], h.render().find(n => n.props?.role === 'option')!.props.id);
  assert.ok(h.render().some(n => n.props?.id === input().props['aria-controls'] && n.props.role === 'listbox'));
  root().props.onKeyDown({ key: 'Enter', nativeEvent: {}, target: input().ref.current, preventDefault() {} });
  await flush(); assert.equal(requests, 1);
  input().props.onFocus();
  root().props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.equal(input().props['aria-expanded'], false);
});
