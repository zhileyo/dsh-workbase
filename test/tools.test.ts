import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { assertSupportedJsonSchema, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { registerTools } from '../src/server/tools.js';
import { WorkbaseService } from '../src/server/service.js';
import { initialState } from '../src/shared/model.js';
function fixture(extra: Record<string, unknown> = {}, hostExtra: Record<string, unknown> = {}) {
  let state = initialState(), id = 0;
  const definitions: ToolDefinition[] = [];
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => [
      { workspaceId: 'w1', path: '/one', title: '一', available: true, sessionIds: ['s1'] },
      { workspaceId: 'w2', path: '/two', title: '二', available: true, sessionIds: ['s2'] },
    ],
    sessions: async () => [], rename: async () => {}, ...hostExtra,
  }, () => `id-${++id}`);
  registerTools({
    effect: (callback: () => unknown) => callback(),
    tools: { register: (definition: ToolDefinition) => { definitions.push(definition); return () => {}; } },
    workspaceRegistry: { list: () => [{ id: 'w1', sessionIds: ['s1'] }, { id: 'w2', sessionIds: ['s2'] }] },
    ...extra,
  } as unknown as Context, service);
  const execute = (name: string, args: unknown, sessionId?: string) => definitions.find(d => d.name === name)!.execute(args,
    { signal: new AbortController().signal, ...(sessionId ? { agent: { session: { id: sessionId } } } : {}) } as ToolRunContext);
  return { service, definitions, execute };
}
test('十一个工具的参数及输出schema符合官方注册器限制', () => {
  const f = fixture();
  assert.equal(f.definitions.length, 11);
  for (const d of f.definitions) {
    assert.doesNotThrow(() => assertSupportedJsonSchema(d.parameters));
    assert.doesNotThrow(() => assertSupportedJsonSchema(d.output!.schema));
  }
});
test('全局开关关闭保留查询并拒绝所有写入，开启后允许删除且保护归属和版本', async () => {
  const f = fixture();
  await f.execute('workbase_create_todo', { title: '保留任务' }, 's1');
  const snapshot = await f.service.snapshot();
  const todo = snapshot.projects[0]!.todos[0]!;
  await f.service.saveSettings('follow', {}, { home: snapshot.preferences.home, root: '', agentManageTodos: false });
  assert.ok(await f.execute('workbase_list_todos', {}, 's1'));
  for (const [name, args] of [
    ['workbase_create_todo', { title: '禁止创建' }],
    ['workbase_update_todo', { id: todo.id, expectedVersion: 1, title: '禁止修改' }],
    ['workbase_delete_todo', { id: todo.id, expectedVersion: 1 }],
  ] as const) {
    await assert.rejects(f.execute(name, args, 's1'), /管理待办/);
  }
  await f.service.saveSettings('follow', {}, { home: snapshot.preferences.home, root: '', agentManageTodos: true });
  await assert.rejects(f.execute('workbase_delete_todo', { id: todo.id, expectedVersion: 1 }, 's2'), /不存在/);
  await assert.rejects(f.execute('workbase_delete_todo', { id: todo.id, expectedVersion: 2 }, 's1'), /变化/);
  await f.execute('workbase_delete_todo', { id: todo.id, expectedVersion: 1 }, 's1');
  assert.equal((await f.service.snapshot()).projects[0]!.todos.length, 0);
});
test('工具入口拒绝缺失Agent、未归属会话以及伪造跨项目参数', async () => {
  const f = fixture();
  await assert.rejects(f.execute('workbase_list_todos', {}), /Agent/);
  await assert.rejects(f.execute('workbase_list_todos', {}, 'orphan'), /关联/);
  await assert.rejects(f.execute('workbase_create_todo', { title: '攻击', projectId: 'w2' }, 's1'));
  assert.equal((await f.service.snapshot()).projects.flatMap(p => p.todos).length, 0);
});
test('工具实际执行根据Agent会话选项目，状态权限仍由服务验证', async () => {
  const f = fixture();
  await f.execute('workbase_create_todo', { title: 'Agent任务' }, 's1');
  const view = await f.service.snapshot();
  const todo = view.projects.find(p => p.workspaceId === 'w1')!.todos[0]!;
  assert.equal(todo.creator, 'agent');
  assert.equal(view.projects.find(p => p.workspaceId === 'w2')!.todos.length, 0);
  await f.service.setAgentStatus(todo.projectId, false);
  await assert.rejects(f.execute('workbase_update_todo', { id: todo.id, expectedVersion: todo.version, done: true }, 's1'), /状态/);
  await assert.rejects(f.execute('workbase_update_todo', { id: todo.id, expectedVersion: todo.version, title: '窜改' }, 's2'), /不存在/);
});

test('附件工具在状态事务外翻页扫描会话，扫描未结束时其它状态操作不被挡住', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let scanning!: () => void; const started = new Promise<void>(resolve => { scanning = resolve; });
  const records = [{ type: 'event', event: { type: 'user/message',
    data: { content: [{ type: 'file', attachment: { attachmentId: 'a1', name: 'a.txt', bytes: 3 } }] } } }];
  const f = fixture({
    sessionController: {
      page: async () => { scanning(); await gate; return { records, hasMore: false }; },
      attachment: async () => ({}),
    },
    attachments: { readFileStream: async function* () { yield new Uint8Array(3); } },
  });
  await f.execute('workbase_create_todo', { title: '附件任务' }, 's1');
  const view = await f.service.snapshot();
  const todo = view.projects[0]!.todos[0]!;
  const attaching = f.execute('workbase_attach_todo_attachment',
    { id: todo.id, expectedVersion: todo.version, attachmentId: 'a1' }, 's1');
  await started;
  // 会话扫描还挂在 page() 上时，状态队列必须仍然可读可写。
  const raced = await Promise.race([f.service.snapshot().then(() => 'free'), new Promise(resolve => setTimeout(() => resolve('blocked'), 80))]);
  assert.equal(raced, 'free', '会话扫描不能占用状态事务队列');
  release();
  assert.match((await attaching as { data: string }).data, /a1/);
});
test('写入类工具只为解析项目身份读一次绑定，不再跑一遍待办列表', async () => {
  const f = fixture();
  const original = f.service.listForAgent;
  let listed = 0;
  f.service.listForAgent = async () => { listed++; throw new Error('不应为取项目身份列出待办'); };
  try {
    await f.execute('workbase_create_todo', { title: '直接落库' }, 's1');
    const created = (await f.service.snapshot()).projects[0]!.todos[0]!;
    await f.execute('workbase_update_todo', { id: created.id, expectedVersion: 1, title: '改名' }, 's1');
    await f.execute('workbase_delete_todo', { id: created.id, expectedVersion: 2 }, 's1');
  } finally { f.service.listForAgent = original; }
  assert.equal(listed, 0);
  assert.equal((await f.service.snapshot()).projects[0]!.todos.length, 0);
});
test('附件与图片工具往返：跨页找到引用、附上后可读可移除，越界与伪造引用被拒', async () => {
  const pages = [
    { records: [{ type: 'event', event: { type: 'user/message', seq: 9, data: { content: [{ type: 'text', text: '第一页' }] } } }], hasMore: true },
    { records: [{ type: 'event', event: { type: 'user/message', seq: 4, data: { content: [
      { type: 'file', attachment: { attachmentId: 'a2', name: 'b.txt', bytes: 3 } },
      { type: 'image', attachment: { attachmentId: 'i1', mediaType: 'image/png', bytes: 2, width: 1, height: 1 } },
    ] } } }], hasMore: false },
  ];
  let page = 0, yielded = 3;
  const f = fixture({
    sessionController: {
      page: async () => pages[Math.min(page++, pages.length - 1)]!,
      attachment: async () => ({}),
    },
    attachments: { readFileStream: async function* () { yield new Uint8Array(yielded); } },
  }, { readTodoAttachment: async (attachment: any) => new Uint8Array(attachment.bytes),
    readTodoImage: async (image: any) => new Uint8Array(image.bytes) });
  await f.execute('workbase_create_todo', { title: '附件往返' }, 's1');
  const todo = (await f.service.snapshot()).projects[0]!.todos[0]!;

  // 引用在第二页：翻页后仍应认出本会话的附件与图片
  assert.match((await f.execute('workbase_attach_todo_attachment', { id: todo.id, expectedVersion: todo.version, attachmentId: 'a2' }, 's1') as { data: string }).data, /a2/);
  assert.match((await f.execute('workbase_attach_todo_image', { id: todo.id, expectedVersion: todo.version + 1, attachmentId: 'i1' }, 's1') as { data: string }).data, /i1/);

  const detail = await f.execute('workbase_get_todo', { id: todo.id }, 's1') as { data: string };
  assert.match(detail.data, /b\.txt/);
  assert.match(detail.data, /i1/);

  const file = await f.execute('workbase_read_todo_attachment', { id: todo.id, attachmentId: 'a2' }, 's1') as any;
  assert.equal(file.message, '待办附件');
  assert.equal(file.attachment.name, 'b.txt');
  const image = await f.execute('workbase_read_todo_image', { id: todo.id, attachmentId: 'i1' }, 's1') as any;
  assert.equal(image.message, '待办图片');
  assert.equal(image.image.mediaType, 'image/png');

  await assert.rejects(f.execute('workbase_attach_todo_attachment', { id: todo.id, expectedVersion: todo.version + 2, attachmentId: 'zz' }, 's1'), /没有此文件引用/);
  await assert.rejects(f.execute('workbase_attach_todo_image', { id: todo.id, expectedVersion: todo.version + 2, attachmentId: 'zz' }, 's1'), /没有此图片引用/);

  // 长度与声明不符时拒绝，避免把截断内容当成合法附件
  yielded = 5;
  page = 0;
  await assert.rejects(f.execute('workbase_attach_todo_attachment', { id: todo.id, expectedVersion: todo.version + 2, attachmentId: 'a2' }, 's1'), /附件长度校验失败/);
  yielded = 3;

  await f.execute('workbase_remove_todo_attachment', { id: todo.id, expectedVersion: todo.version + 2, attachmentId: 'a2' }, 's1');
  await assert.rejects(f.execute('workbase_read_todo_attachment', { id: todo.id, attachmentId: 'a2' }, 's1'), /不存在/);
  await f.execute('workbase_remove_todo_image', { id: todo.id, expectedVersion: todo.version + 3, attachmentId: 'i1' }, 's1');
  await assert.rejects(f.execute('workbase_read_todo_image', { id: todo.id, attachmentId: 'i1' }, 's1'), /不存在/);
});
