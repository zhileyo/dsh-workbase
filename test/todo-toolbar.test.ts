import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { TodoToolbarProps } from '../src/client/TodoToolbar.js';

const built = await build({ entryPoints: ['src/client/TodoToolbar.tsx'], bundle: true, platform: 'node', format: 'cjs',
  jsx: 'automatic', write: false, external: ['react', 'react/jsx-runtime', './ui.js'] });
const nodes = (node: any): any[] => !node || typeof node !== 'object' ? []
  : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
function harness(reduced = false) {
  const require = createRequire(import.meta.url), react = require('react'), hooks: any[] = [];
  const effects: (() => void)[] = [], timers = new Map<number, { callback(): void; delay: number }>();
  let cursor = 0, timerId = 0, commands = 0, focus = 0;
  const module = { exports: {} as { TodoToolbar(props: TodoToolbarProps): any } };
  runInNewContext(built.outputFiles[0]!.text, {
    module, exports: module.exports, window: { matchMedia: () => ({ matches: reduced }) },
    setTimeout(callback: () => void, delay: number) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    require: (id: string) => id === './ui.js' ? { Icon: 'Icon', IconButton: 'IconButton', Picker: 'Picker' }
      : id !== 'react' ? require(id) : { ...react,
        useState(value: unknown) { const i = cursor++; if (!(i in hooks)) hooks[i] = value;
          return [hooks[i], (next: any) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; },
        useRef(current: unknown) { const i = cursor++; return hooks[i] ??= { current }; },
        useLayoutEffect(fn: () => (() => void) | undefined, deps: unknown[]) {
          const i = cursor++, previous = hooks[i];
          if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
            effects.push(() => { previous?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; });
          }
        },
      },
  });
  const props: TodoToolbarProps = {
    draft: '待添加草稿', query: '', priority: 'all', busy: false, archived: false,
    inputRef: { current: { focus() { focus++; } } as HTMLInputElement },
    onDraftChange(value) { props.draft = value; }, onQueryChange(value) { props.query = value; },
    onPriorityChange(value) { props.priority = value; }, onCreate: async () => { commands++; return true; },
    onFullCreate() {},
  };
  const render = () => {
    cursor = 0;
    const tree = nodes(module.exports.TodoToolbar(props));
    for (const node of tree) if (node.ref && !node.ref.current) node.ref.current = { focus() { focus++; } };
    effects.splice(0).forEach(effect => effect());
    return tree;
  };
  const toggle = () => { render().find(n => n.props?.className?.includes('todo-search-toggle'))!.props.onClick(); render(); };
  const tick = (delay: number) => {
    const entry = [...timers.entries()][0]; assert.ok(entry); assert.equal(entry[1].delay, delay);
    timers.delete(entry[0]); entry[1].callback(); return render();
  };
  return { props, render, toggle, tick, timers, commands: () => commands, focus: () => focus,
    unmount() { hooks.forEach(h => h?.cleanup?.()); } };
}
const input = (tree: any[]) => tree.find(n => n.props?.id === 'todo-title')!;
const form = (tree: any[]) => tree.find(n => n.type === 'form')!;
const phase = (tree: any[]) => form(tree).props['data-phase'];

test('优先级筛选使用短文案，保留清空优先级与全部两种含义', () => {
  const h = harness(true);
  h.toggle();
  const picker = () => h.render().find(n => n.type === 'Picker')!.props;
  assert.deepEqual(Array.from(picker().options, (option: any) => option.label), ['全部', '未设置', '高', '中', '低']);
  assert.equal(picker().renderValue(), '全部');
  picker().onChange('high'); assert.equal(picker().renderValue(), '高');
  picker().onChange(''); assert.equal(picker().renderValue(), '未设置');
});
test('翻转中锁住重复切换，搜索 Enter 不创建，退出恢复添加草稿并清除筛选', async () => {
  const h = harness();
  h.toggle(); assert.equal(phase(h.render()), 'out'); assert.equal(input(h.render()).props.disabled, true);
  h.toggle(); assert.equal(h.timers.size, 1);
  let tree = h.tick(130); assert.equal(phase(tree), 'in'); assert.equal(input(tree).props.value, '');
  tree = h.tick(170); assert.equal(phase(tree), 'idle');
  input(tree).props.onChange({ target: { value: '搜索词' } });
  h.render().find(n => n.type === 'Picker')!.props.onChange('high');
  let prevented = false;
  input(h.render()).props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await form(h.render()).props.onSubmit({ preventDefault() {} }); assert.equal(h.commands(), 0);
  h.toggle(); h.tick(130); tree = h.tick(170);
  assert.equal(input(tree).props.value, '待添加草稿');
  assert.equal(h.props.query, ''); assert.equal(h.props.priority, 'all');
  assert.equal(tree.find(n => n.props?.className?.includes('todo-search-toggle'))!.props.children.props.name, 'search');
});

test('减少动态效果时立即切换，Escape 返回，不将输入法确认当创建', () => {
  const h = harness(true);
  h.toggle(); assert.equal(h.timers.size, 0);
  input(h.render()).props.onKeyDown({ key: 'Escape', nativeEvent: { isComposing: false }, preventDefault() {} });
  assert.equal(input(h.render()).props.value, '待添加草稿');
  let prevented = false;
  input(h.render()).props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('创建期间阻止重复提交及模式切换，成功清空，失败保留草稿', async () => {
  const h = harness(true);
  let finish!: (ok: boolean) => void, calls = 0;
  h.props.onCreate = async () => { calls++; return new Promise<boolean>(resolve => { finish = resolve; }); };
  const initial = form(h.render());
  const pending = initial.props.onSubmit({ preventDefault() {} });
  await initial.props.onSubmit({ preventDefault() {} }); h.toggle();
  assert.equal(calls, 1); assert.equal(input(h.render()).props.value, '待添加草稿');
  finish(false); await pending; assert.equal(h.props.draft, '待添加草稿');
  const success = form(h.render()).props.onSubmit({ preventDefault() {} }); finish(true); await success;
  assert.equal(h.props.draft, '');
});

test('归档项目禁止新增但可进入搜索，繁忙状态不能切换', async () => {
  const h = harness(true); h.props.archived = true;
  assert.equal(input(h.render()).props.disabled, true); h.toggle();
  assert.equal(input(h.render()).props.disabled, false);
  input(h.render()).props.onChange({ target: { value: '归档内容' } });
  await form(h.render()).props.onSubmit({ preventDefault() {} });
  assert.equal(h.commands(), 0); assert.equal(h.props.query, '归档内容');
  h.props.busy = true; h.toggle(); assert.equal(input(h.render()).props.value, '归档内容');
});

test('卸载取消未完成翻转，不回写查询或移动焦点', () => {
  const h = harness(); h.toggle(); const focus = h.focus();
  h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.focus(), focus);
});
