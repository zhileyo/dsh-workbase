import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { todoSchema } from '../src/shared/model.js';

const nodes = (node: any): any[] => !node || typeof node !== 'object' ? []
  : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function harness(initial = false) {
  const built = await build({ entryPoints: ['src/client/TodoDetail.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react');
  const hooks: any[] = [], effects: (() => unknown)[] = [];
  let cursor = 0, failUpload = true, failAt = 0, creates = 0, opens = 0, uploads = 0;
  const calls: any[] = [];
  const module = { exports: {} as { TodoDetail(props: any): any } };
  runInNewContext(built.outputFiles[0]!.text, { module, exports: module.exports, AbortController, Error,
    require: (id: string) => id === 'react' ? { ...react,
      useId() { return 'todo-detail'; },
      useEffect(fn: () => unknown) { const i = cursor++; if (!hooks[i]) { hooks[i] = true; effects.push(fn); } },
      useRef(current: unknown) { const i = cursor++; return hooks[i] ??= { current }; },
      useState(value: unknown) { const i = cursor++; if (!(i in hooks)) hooks[i] = value;
        return [hooks[i], (next: any) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; },
    } : require(id),
  });
  let stored = todoSchema.parse({ id: 't1', projectId: 'p', title: '原标题', note: '原备注', done: false,
    creator: 'user', createdAt: 1, updatedAt: 1, completedAt: null, version: 1 });
  const project = { projectId: 'p', title: '项目', archived: false, todos: initial ? [stored] : [] };
  const props = { project, initial: initial ? stored : undefined, refresh: async () => { project.todos = [stored]; },
    onClose() {}, api: {
      call: async (command: any) => {
        calls.push(command);
        if (command.op === 'launch-catalog') return { presets: [{ id: 'standard', name: '标准模式' }] };
        if (command.op === 'create') creates++;
        else if (command.expectedVersion !== stored.version) throw new Error('版本变化');
        stored = todoSchema.parse({ ...stored, title: command.title, note: command.note, priority: command.priority,
          version: command.op === 'create' ? 1 : stored.version + 1 });
        return stored;
      },
      uploadTodoAttachment: async (todo: any, file: File) => {
        assert.equal(todo.version, stored.version);
        uploads++; if (failUpload || uploads === failAt) throw new Error('模拟上传失败');
        stored = { ...stored, attachments: [...stored.attachments, { attachmentId: `file-${uploads}`,
          name: file.name, mediaType: file.type || 'application/octet-stream', bytes: file.size }], version: stored.version + 1 };
        return stored;
      },
      openTodoSession: async () => { opens++; },
    } };
  const render = () => { cursor = 0; return nodes(module.exports.TodoDetail(props)); };
  render(); effects.forEach(effect => effect()); await flush();
  return { props, render, calls, succeed: () => { failUpload = false; }, failAt: (attempt: number) => { failAt = attempt; },
    counts: () => ({ creates, opens, uploads }), change: () => { stored = { ...stored, version: stored.version + 1 }; project.todos = [stored]; } };
}
test('完整创建选文件即保存字段并上传，失败保留同卡身份，单独重试不重复创建', async () => {
  const h = await harness();
  h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.onChange({ target: { value: '新任务' } });
  h.render().find(n => n.props?.label === '待办优先级')!.props.onChange('high');
  h.render().find(n => n.type === 'form')!.props.onDrop({ preventDefault() {}, dataTransfer: { files: [new File(['png'], '图.png', { type: 'image/png' })] } });
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '发起会话')!.props.disabled, true);
  await flush();
  assert.equal(h.counts().creates, 1);
  assert.ok(h.render().some(n => n.props?.role === 'alert' && String(n.props.children).includes('上传失败')));
  const error = h.render().find(n => n.props?.role === 'alert')!;
  assert.equal(h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props['aria-describedby'], error.props.id);
  assert.equal(h.calls.find(c => c.op === 'create').priority, 'high');
  h.succeed();
  h.render().find(n => n.type === 'button' && n.props.children === '重试上传')!.props.onClick(); await flush();
  assert.equal(h.counts().creates, 1); assert.equal(h.counts().uploads, 2);
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '发起会话')!.props.disabled, false);
  h.render().find(n => n.type === 'button' && n.props.children === '发起会话')!.props.onClick(); await flush();
  assert.equal(h.counts().opens, 1);
});
test('已有待办选文件即上传，正文草稿不被自动保存，上传使用最新版本串行完成', async () => {
  const h = await harness(true);
  h.succeed();
  h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.onChange({ target: { value: '尚未保存的标题' } });
  h.render().find(n => n.type === 'input' && n.props.type === 'file')!.props.onChange({
    target: { files: [new File(['a'], 'a.pdf'), new File(['b'], 'b.custom')], value: '' },
  });
  assert.equal(h.render().find(n => n.props.className === 'todo-detail-dialog')!.props.busy, true);
  await flush();
  assert.equal(h.counts().uploads, 2);
  assert.equal(h.calls.filter(c => c.op === 'update').length, 0);
  assert.equal(h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.value, '尚未保存的标题');
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '发起会话')!.props.disabled, false);
  h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush();
  assert.equal(h.calls.find(c => c.op === 'update').expectedVersion, 3);
});
test('新建未填标题先保留文件，标题编辑结束自动创建并上传，无需保存确认', async () => {
  const h = await harness();
  h.succeed();
  h.render().find(n => n.type === 'input' && n.props.type === 'file')!.props.onChange({
    target: { files: [new File(['a'], 'a.pdf')], value: '' },
  });
  await flush();
  assert.deepEqual(h.counts(), { creates: 0, opens: 0, uploads: 0 });
  const input = h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!;
  input.props.onChange({ target: { value: '完整标题' } });
  h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.onBlur();
  await flush();
  assert.deepEqual(h.counts(), { creates: 1, opens: 0, uploads: 1 });
  assert.equal(h.calls.find(c => c.op === 'create').title, '完整标题');
});
test('版本冲突时不上传，选择最新版本后可重试附件', async () => {
  const h = await harness(true);
  h.succeed(); h.change();
  h.render().find(n => n.type === 'form')!.props.onDrop({
    preventDefault() {}, dataTransfer: { files: [new File(['a'], 'a.pdf')] },
  });
  await flush();
  assert.equal(h.counts().uploads, 0);
  h.render().find(n => n.type === 'button' && n.props.children === '使用最新版本继续保存')!.props.onClick();
  h.render().find(n => n.type === 'button' && n.props.children === '重试上传')!.props.onClick();
  await flush();
  assert.equal(h.counts().uploads, 1);
});
test('批量第二个文件失败只保留未成功文件，重试不重复上传首个且保存按钮文案固定', async () => {
  const h = await harness(true);
  h.succeed(); h.failAt(2);
  const picker = h.render().find(n => n.type === 'input' && n.props.type === 'file')!;
  picker.props.onChange({ target: { files: [new File(['a'], 'a.pdf'), new File(['b'], 'b.zip')], value: '' } });
  // 同一帧重复事件也不能绕过处理中门禁。
  picker.props.onChange({ target: { files: [new File(['c'], 'c.txt')], value: '' } });
  await flush();
  assert.equal(h.counts().uploads, 2);
  assert.equal(h.render().filter(n => n.type === 'small' && String(n.props.children).includes('等待重试')).length, 1);
  assert.equal(h.render().find(n => n.type === 'button' && n.props.type === 'submit')!.props.children, '保存');
  h.render().find(n => n.type === 'button' && n.props.children === '重试上传')!.props.onClick();
  await flush();
  assert.equal(h.counts().uploads, 3);
  assert.equal(h.props.project.todos[0]!.attachments.length, 2);
  assert.deepEqual(h.props.project.todos[0]!.attachments.map(a => a.name), ['a.pdf', 'b.zip']);
});
test('并发更新保留输入草稿，显式接受最新版本后继续保存', async () => {
  const h = await harness(true);
  h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.onChange({ target: { value: '我的编辑' } });
  h.change();
  const submit = h.render().find(n => n.type === 'button' && n.props.type === 'submit')!;
  assert.equal(submit.props.disabled, true);
  assert.equal(h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props.value, '我的编辑');
  assert.equal(h.render().find(n => n.type === 'input' && n.props.maxLength === 500)!.props['aria-describedby'], 'todo-detail-conflict');
  h.render().find(n => n.type === 'button' && n.props.children === '使用最新版本继续保存')!.props.onClick();
  h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush();
  assert.equal(h.calls.find(c => c.op === 'update').expectedVersion, 2);
  assert.equal(h.calls.find(c => c.op === 'update').title, '我的编辑');
});
test('图片与文字同时粘贴保留原生文字输入，纯图片粘贴阻止默认处理', async () => {
  const h = await harness();
  let prevented = 0;
  const file = new File(['png'], '图.png', { type: 'image/png' });
  const paste = (text: string) => h.render().find(n => n.type === 'form')!.props.onPaste({
    preventDefault() { prevented++; }, clipboardData: { files: [file], getData: () => text },
  });
  paste('图文混排'); assert.equal(prevented, 0);
  paste(''); assert.equal(prevented, 1);
  assert.ok(h.render().some(n => n.props?.className === 'todo-attachment-card'));
});
test('详情状态只读，附件选择不限制格式，非图片也进入上传队列', async () => {
  const h = await harness(true);
  const tree = h.render();
  assert.ok(!tree.some(n => n.type === 'button' && ['标记完成', '重新打开', '关闭'].includes(n.props.children)));
  const picker = tree.find(n => n.type === 'input' && n.props.type === 'file')!;
  assert.equal(picker.props.accept, undefined);
  picker.props.onChange({ target: { files: [new File(['text'], '说明.custom')], value: 'x' } });
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '发起会话')!.props.disabled, true);
});
