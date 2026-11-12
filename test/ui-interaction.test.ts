import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { initialState, emptyMark, type Snapshot, type Project } from '../src/shared/model.js';
import { UiMemory } from '../src/client/api.js';

const nodes = (node: any): any[] => !node || typeof node !== 'object' ? []
  : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// 直接执行真实组件的事件处理；不把回调断言当作浏览器视觉或焦点验收。
async function harness(entry: string, component: string, props: any) {
  const output = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react'), hooks: any[] = [];
  let cursor = 0;
  const module = { exports: {} as Record<string, (props: any) => any> };
  runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports,
    require: (id: string) => id !== 'react' ? require(id) : { ...react,
      useId: () => 'field-error',
      useEffect() {}, useLayoutEffect() {},
      useState(initial: unknown) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
        return [hooks[i], (next: any) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
      },
      useRef(current: unknown) { const i = cursor++; return hooks[i] ??= { current }; },
    },
  });
  return { props, render() { cursor = 0; return nodes(module.exports[component]!(props)); } };
}

function fixture() {
  const project: Project = { projectId: 'p', workspaceId: 'w', title: '项目', path: '/project', available: true,
    archived: false, todos: [], sessions: [], sessionIds: [], agentCanChangeStatus: true, mark: emptyMark(), updatedAt: 1 };
  const snapshot: Snapshot = { preferences: initialState().preferences, projects: [project], conflicts: [],
    revision: 1, syncedAt: 1, sessionMarks: {} };
  return { project, snapshot };
}

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
