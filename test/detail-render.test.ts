import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Detail, type DetailProps } from '../src/client/Detail.js';
import { UiMemory, type ClientPort } from '../src/client/api.js';
import { initialState, emptyMark, type Snapshot, type Project, type Todo } from '../src/shared/model.js';

function todo(id: string, title: string, createdAt: number, updatedAt: number, done = false, completedAt: number | null = null): Todo {
  return { id, projectId: 'p0', title, note: '', done, creator: 'user', createdAt, updatedAt, completedAt, version: 1, priority: null, images: [], attachments: [] };
}

function fixture(todos: Todo[]): { snapshot: Snapshot; project: Project } {
  const now = Date.now();
  const project: Project = {
    projectId: 'p0', workspaceId: 'w0', path: '/验收/项目', title: '项目', available: true,
    sessionIds: [], agentCanChangeStatus: true, mark: emptyMark(), updatedAt: now, archived: false, todos, sessions: [],
  };
  const snapshot: Snapshot = {
    revision: 1, syncedAt: now, conflicts: [], sessionMarks: {},
    preferences: initialState().preferences, projects: [project],
  };
  return { snapshot, project };
}

// 本测试验证实际组件的待办分组排序；不将服务端渲染当作浏览器视觉验收。
function render(snapshot: Snapshot, project: Project) {
  const noop = () => {};
  const props: DetailProps = {
    project, snapshot, api: {} as ClientPort, memory: new UiMemory(), busy: false,
    mutate: async () => true, run: async () => true, navigate: noop, rename: noop,
    edit: noop, remove: noop, archive: noop, renameSession: noop,
    removeProject: noop, notify: noop, showSession: noop,
  };
  return renderToStaticMarkup(createElement(Detail, props));
}

function serverWarnings(t: TestContext) {
  const original = console.error;
  t.mock.method(console, 'error', (...args: unknown[]) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    original(...args);
  });
}

test('待办附件数量显示在来源时间之后', t => {
  serverWarnings(t);
  const item = { ...todo('file', '附件位置', 1, 2),
    attachments: [{ attachmentId: 'a', name: '文件', bytes: 1, mediaType: 'application/octet-stream' }] };
  const { snapshot, project } = fixture([item]);
  const html = render(snapshot, project);
  assert.ok(html.indexOf('用户 创建') < html.indexOf('todo-attachment-count'));
});
test('待处理待办按最近更新倒序，已完成按完成时间倒序', t => {
  serverWarnings(t);
  const { snapshot, project } = fixture([
    todo('t-a', '早期创建后期修改', 1000, 5000),
    todo('t-b', '后期创建早期修改', 2000, 3000),
    todo('t-done-old', '完成甲', 300, 400, true, 8000),
    todo('t-done-new', '完成乙', 100, 200, true, 9000),
  ]);
  const html = render(snapshot, project);
  const order = [...html.matchAll(/id="wb-todo-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, ['t-a', 't-b', 't-done-new', 't-done-old']);
});
test('待处理先按优先级，同优先级按更新时间；已完成仍按完成时间', t => {
  serverWarnings(t);
  const { snapshot, project } = fixture([
    { ...todo('unset', '无优先级', 1, 9999), priority: null },
    { ...todo('low', '低', 1, 8888), priority: 'low' },
    { ...todo('high-old', '高旧', 1, 100), priority: 'high' },
    { ...todo('medium', '中', 1, 1000), priority: 'medium' },
    { ...todo('high-new', '高新', 1, 200), priority: 'high' },
  ]);
  const order = [...render(snapshot, project).matchAll(/id="wb-todo-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, ['high-new', 'high-old', 'medium', 'low', 'unset']);
});

test('完成时间缺失时已完成待办回退到更新时间倒序', t => {
  serverWarnings(t);
  const { snapshot, project } = fixture([
    todo('t-x', '完成于更早', 100, 9000, true, null),
    todo('t-y', '完成于更晚', 200, 3000, true, null),
  ]);
  const html = render(snapshot, project);
  const order = [...html.matchAll(/id="wb-todo-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, ['t-x', 't-y']);
});

test('归档项目待办整体只读：勾选与新增禁用，标题仅可查看', t => {
  serverWarnings(t);
  const { snapshot, project } = fixture([todo('t-a', '归档项目的待办', 1000, 5000)]);
  project.archived = true;
  const html = render(snapshot, project);
  assert.match(html, /class="[^"]*todo-complete[^"]*"[^>]*disabled/); // 勾选框禁用
  assert.match(html, /id="todo-title"[^>]*disabled/); // 新增输入禁用
  assert.match(html, /项目已归档，仅可查看/); // 标题点击降级为查看弹窗的提示
  assert.match(html, /项目已归档，恢复后可记录待办/); // 新增占位切换为归档文案
  assert.doesNotMatch(html, /todo-delete/);
});

test('待办标题打开统一详情与行尾直接删除，不显示冗余详情按钮和更多菜单', (t) => {
  serverWarnings(t);
  const { snapshot, project } = fixture([todo('t-a', '简单待办', 1000, 5000)]);
  const html = render(snapshot, project);
  assert.match(html, /class="[^"]*todo-delete[^"]*"/);
  assert.match(html, /aria-label="删除待办：简单待办"/);
  assert.doesNotMatch(html, /todo-details|待办更多操作|查看待办完整标题/);
});

test('待办工具区共用一个输入框，搜索按钮固定，移除独立筛选行', t => {
  serverWarnings(t);
  const { snapshot, project } = fixture([todo('t-a', '任务', 1000, 5000)]);
  const html = render(snapshot, project);
  assert.match(html, /class="[^"]*todo-search-toggle[^"]*"[^>]*aria-label="搜索待办"/);
  assert.match(html, /data-mode="create"/);
  assert.doesNotMatch(html, /class="todo-filters"/);
  assert.equal([...html.matchAll(/id="todo-title"/g)].length, 1);
});
