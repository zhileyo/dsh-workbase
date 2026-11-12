import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, todoSchema } from '../src/shared/model.js';
import { WorkbaseService, type HostPort } from '../src/server/service.js';
import { prepareTodoSession, releaseAfterAdoption } from '../src/client/todo-session.js';
import { handleTodoImage, handleTodoAttachment, todoFetchRoutes } from '../src/server/todo-images.js';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { sessionImage, sessionFile } from '../src/server/tools.js';

function fixture(extra: Partial<HostPort> = {}) {
  let state = initialState(), id = 0, fail = false;
  const service = new WorkbaseService({
    get: () => state, set: async next => { if (fail) throw new Error('写入失败'); state = next; },
  }, {
    workspaces: async () => [
      { workspaceId: 'w1', title: '一', path: '/one', available: true, sessionIds: ['s1'] },
      { workspaceId: 'w2', title: '二', path: '/two', available: true, sessionIds: ['s2'] },
    ], sessions: async () => [], rename: async () => {}, ...extra,
  }, () => `id-${++id}`);
  return { service, failWrite: () => { fail = true; } };
}
const image = { attachmentId: 'image-1', mediaType: 'image/png' as const, bytes: 8, width: 1, height: 1 };
test('官方HTTP桥接能上传并下载待办文件和旧图片，GET不携带流式正文', async () => {
  const source = await readFile(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-connection'), 'utf8');
  const start = source.indexOf('async function bridge(');
  assert.ok(start >= 0, '官方桥接实现必须存在');
  const bridge = runInNewContext(`${source.slice(start, source.indexOf('//#endregion', start))}; bridge`,
    { Readable, Request, Response, URL, Buffer, AbortController, DEFAULT_MAX_REQUEST_BODY_BYTES: 300 * 1024 * 1024 });
  const f = fixture({
    saveTodoImage: async () => image, readTodoImage: async () => new Uint8Array(8),
    saveTodoAttachment: async (data, mediaType, name) => ({ attachmentId: 'file', bytes: data.length, mediaType, name }),
    readTodoAttachment: async () => new Uint8Array([1, 2, 3]),
  });
  const { projectId } = await f.service.listForAgent('w1');
  let todo = await f.service.createTodo({ projectId, title: '桥接' });
  const routes = todoFetchRoutes(f.service);
  const server = createServer((req, res) => {
    const route = routes.find(route => route.path === new URL(req.url!, 'http://localhost').pathname
      && route.methods.includes(req.method as 'GET' | 'POST'));
    if (!route) { res.writeHead(405); res.end(); return; }
    void bridge(req, res, { requestBodyMode: () => route.requestBody, fetch: route.fetch }, {})
      .catch((error: Error) => { res.writeHead(400); res.end(error.message); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const root = `http://127.0.0.1:${address.port}`;
  try {
    for (const [path, attachmentId, data] of [
      ['/api/workbase/todo-image', image.attachmentId, new Uint8Array(8)],
      ['/api/workbase/todo-attachment', 'file', new Uint8Array([1, 2, 3])],
    ] as const) {
      const query = new URLSearchParams({ projectId, id: todo.id, expectedVersion: String(todo.version), name: '文件.bin' });
      const upload = await fetch(`${root}${path}?${query}`, { method: 'POST', body: data,
        headers: { 'content-type': path.endsWith('image') ? 'image/png' : 'application/octet-stream' } });
      assert.equal(upload.status, 200);
      todo = await upload.json();
      query.set('attachmentId', attachmentId);
      const download = await fetch(`${root}${path}/content?${query}`);
      assert.equal(download.status, 200);
      assert.deepEqual(new Uint8Array(await download.arrayBuffer()), data);
      assert.equal((await fetch(`${root}${path}?${query}`)).status, 405);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
test('通用附件路由保留文件名，未知MIME回退且下载隔离主动内容', async () => {
  const f = fixture({
    saveTodoAttachment: async (data, mediaType, name) => ({ attachmentId: 'f', mediaType, name, bytes: data.length }),
    readTodoAttachment: async () => new Uint8Array(),
  });
  const { projectId } = await f.service.listForAgent('w1');
  const todo = await f.service.createTodo({ projectId, title: '文件路由' });
  const url = `http://localhost/api/workbase/todo-attachment?projectId=${projectId}&id=${todo.id}`;
  const uploaded = await handleTodoAttachment(f.service, new Request(`${url}&expectedVersion=1&name=${encodeURIComponent('空文件.custom')}`,
    { method: 'POST', body: new Uint8Array() }));
  assert.equal(uploaded.status, 200);
  assert.equal((await uploaded.json()).attachments[0].mediaType, 'application/octet-stream');
  const read = await handleTodoAttachment(f.service, new Request(`${url}&attachmentId=f`));
  assert.match(read.headers.get('content-disposition')!, /attachment; filename\*=UTF-8/);
  assert.match(read.headers.get('content-security-policy')!, /sandbox/);
});
test('Agent通用附件仅认可当前会话file消息块，文本与伪造工具记录无效', () => {
  const file = { attachmentId: 'f', name: '数据.any', bytes: 1 };
  const block = { type: 'file', attachment: file };
  assert.equal(sessionFile([{ type: 'tool/call', data: { content: [block] } }], 'f'), null);
  assert.deepEqual(sessionFile([{ type: 'user/message', data: { content: [block] } }], 'f'), { ...file, mediaType: 'application/octet-stream' });
});
test('通用附件支持任意格式与空文件，保留旧图片且校验归属、版本和总容量', async () => {
  const file = { attachmentId: 'file-1', name: '设计.svg', mediaType: 'image/svg+xml', bytes: 0 };
  let writes = 0;
  const f = fixture({
    saveTodoAttachment: async () => { writes++; return file; },
    readTodoAttachment: async () => new Uint8Array(),
  });
  const { projectId } = await f.service.listForAgent('w1');
  const todo = await f.service.createTodo({ projectId, title: '通用文件' });
  const uploaded = await f.service.uploadTodoAttachment({ projectId, id: todo.id, expectedVersion: 1 },
    new Uint8Array(), 'image/svg+xml', '设计.svg');
  assert.deepEqual(uploaded.attachments, [file]);
  assert.deepEqual(uploaded.images, []);
  await assert.rejects(f.service.uploadTodoAttachment({ projectId, id: todo.id, expectedVersion: 1 },
    new Uint8Array(), '', '未知格式.bin'), /变化/);
  assert.equal(writes, 1);
  await assert.rejects(f.service.readAttachment({ projectId, id: todo.id, attachmentId: 'forged' }), /不存在/);
  const result = await f.service.readAttachment({ projectId, id: todo.id, attachmentId: file.attachmentId });
  assert.equal(result.data.length, 0);
  assert.deepEqual((await f.service.removeTodoAttachment({ projectId, id: todo.id,
    expectedVersion: 2, attachmentId: file.attachmentId })).attachments, []);
});
test('通用文件交接保留名称和原始字节，读取失败不创建会话', async () => {
  const attachment = { attachmentId: 'f', name: '说明.pdf', mediaType: 'application/pdf', bytes: 3 };
  const todo = todoSchema.parse({ id: 't', projectId: 'p', title: '文件', note: '', done: false,
    creator: 'user', createdAt: 1, updatedAt: 1, completedAt: null, version: 1, attachments: [attachment] });
  let begun = 0;
  await prepareTodoSession(todo, {
    read: async () => new Blob(['pdf'], { type: 'application/pdf' }),
    begin: async () => { begun++; return 's'; },
    draft: async (_id, _text, files) => {
      assert.equal((files[0] as File).name, '说明.pdf');
      assert.equal(await files[0]!.text(), 'pdf');
    }, open: () => {},
  });
  assert.equal(begun, 1);
  await assert.rejects(prepareTodoSession(todo, {
    read: async () => { throw new Error('读取失败'); },
    begin: async () => { begun++; return 's'; }, draft: async () => {}, open: () => {},
  }), /读取失败/);
  assert.equal(begun, 1);
});
test('旧图片和通用文件共享10个额度，超限、归档和权限拒绝时不读取文件', async () => {
  const f = fixture({ saveTodoImage: async () => image });
  const { projectId } = await f.service.listForAgent('w1');
  const todo = await f.service.createTodo({ projectId, title: '额度' });
  let current = await f.service.uploadTodoImage({ projectId, id: todo.id, expectedVersion: 1 }, new Uint8Array(8), 'image/png');
  for (let i = 0; i < 9; i++) current = await f.service.attachTodoAttachment({
    projectId, id: todo.id, expectedVersion: current.version,
  }, async () => ({ attachmentId: `file-${i}`, name: `${i}.any`, bytes: 0, mediaType: 'application/octet-stream' }));
  let reads = 0;
  const read = async () => { reads++; return { attachmentId: 'overflow', name: '文件', bytes: 0, mediaType: 'application/octet-stream' }; };
  await assert.rejects(f.service.attachTodoAttachment({ projectId, id: todo.id, expectedVersion: current.version }, read), /最多10/);
  assert.equal(reads, 0);
  await f.service.setPreferences({ agentManageTodos: false });
  await assert.rejects(f.service.attachTodoAttachment({ projectId, id: todo.id, expectedVersion: current.version }, read,
    { kind: 'agent', workspaceId: 'w1' }), /管理待办/);
  await f.service.archiveProject({ projectId, archived: true });
  await assert.rejects(f.service.attachTodoAttachment({ projectId, id: todo.id, expectedVersion: current.version }, read), /归档/);
  assert.equal(reads, 0);
});
test('旧待办补齐可选优先级和图片引用，不引入日期或评论', () => {
  const todo = todoSchema.parse({ id: 't', projectId: 'p', title: '旧任务', note: '', done: false,
    creator: 'user', createdAt: 1, updatedAt: 1, completedAt: null, version: 1 });
  assert.equal(todo.priority, null);
  assert.deepEqual(todo.images, []);
  assert.throws(() => todoSchema.parse({ ...todo, deadline: 1 }));
});
test('优先级清空、版本冲突和摘要筛选及单项读取保护项目归属', async () => {
  const f = fixture();
  const { projectId } = await f.service.listForAgent('w1');
  const todo = await f.service.createTodo({ projectId, title: '修复附件', note: '详细验收', priority: 'high' });
  const summary = await f.service.listForAgent('w1', undefined, { summary: true, query: '验收', priority: 'high', status: 'pending' });
  assert.equal(summary.todos.length, 1);
  assert.equal('note' in summary.todos[0]!, false);
  assert.equal((await f.service.getForAgent('w1', todo.id)).note, '详细验收');
  await assert.rejects(f.service.getForAgent('w2', todo.id), /不存在/);
  const next = await f.service.updateTodo({ projectId, id: todo.id, expectedVersion: 1, priority: null });
  assert.equal(next.priority, null);
  await assert.rejects(f.service.updateTodo({ projectId, id: todo.id, expectedVersion: 1, priority: 'low' }), /变化/);
});
test('图片上传先核验归属和版本，保存失败不发布引用，只移除卡片引用', async () => {
  let saves = 0;
  const f = fixture({ saveTodoImage: async () => { saves++; return image; }, readTodoImage: async () => new Uint8Array(8) });
  const { projectId } = await f.service.listForAgent('w1');
  const todo = await f.service.createTodo({ projectId, title: '图片' });
  await assert.rejects(f.service.uploadTodoImage({ projectId: 'id-2', id: todo.id, expectedVersion: 1 }, new Uint8Array(8), 'image/png'), /不存在/);
  assert.equal(saves, 0);
  const uploaded = await f.service.uploadTodoImage({ projectId, id: todo.id, expectedVersion: 1 }, new Uint8Array(8), 'image/png');
  assert.deepEqual(uploaded.images, [image]);
  await assert.rejects(f.service.readImage({ projectId, id: todo.id, attachmentId: 'forged' }), /不存在/);
  const removed = await f.service.removeTodoImage({ projectId, id: todo.id, expectedVersion: 2, attachmentId: image.attachmentId });
  assert.deepEqual(removed.images, []);
  f.failWrite();
  await assert.rejects(f.service.uploadTodoImage({ projectId, id: todo.id, expectedVersion: 3 }, new Uint8Array(8), 'image/png'), /写入失败/);
  assert.deepEqual((await f.service.getForAgent('w1', todo.id)).images, []);
});
test('从待办创建草稿先读取所有附件，交接失败不导航，草稿按任务、ID和描述排布', async () => {
  const todo = todoSchema.parse({ id: 't', projectId: 'p', title: '修复', note: '验收要求', done: false,
    creator: 'user', createdAt: 1, updatedAt: 1, completedAt: null, version: 1, images: [image] });
  const events: string[] = [];
  const port = { read: async () => { events.push('read'); return new Blob(); },
    begin: async () => { events.push('begin'); return 'session'; },
    draft: async (_id: string, text: string) => { events.push(text); throw new Error('交接失败'); },
    open: () => { events.push('open'); } };
  await assert.rejects(prepareTodoSession(todo, port), /交接失败/);
  assert.deepEqual(events.slice(0, 2), ['read', 'begin']);
  assert.equal(events[2], '待办任务：修复\n待办 ID：t\n任务描述：\n验收要求\n\n请按上述要求处理此待办，并在验证完成后更新待办状态。');
  assert.ok(!events.includes('open'));
  events.length = 0;
  port.read = async () => { throw new Error('读取失败'); };
  await assert.rejects(prepareTodoSession(todo, port), /读取失败/);
  assert.deepEqual(events, []);
});
test('草稿引用在真实界面接管后释放，取消与重复通知不会重复释放', () => {
  let count = 1, releases = 0, stops = 0, notify = () => {};
  const dispose = releaseAfterAdoption({ release: () => { releases++; } }, {
    getSnapshot: () => ({ referenceCount: count }), subscribe: fn => { notify = fn; return () => { stops++; }; },
  });
  notify(); assert.equal(releases, 0);
  count = 2; notify(); notify(); dispose();
  assert.equal(releases, 1); assert.equal(stops, 1);
});
test('图片HTTP路由严格限制正文，项目归属、引用匹配和过期版本均由服务校验', async () => {
  const f = fixture({ saveTodoImage: async () => image, readTodoImage: async () => new Uint8Array(8) });
  const { projectId } = await f.service.listForAgent('w1');
  const todo = await f.service.createTodo({ projectId, title: '图片HTTP' });
  const path = `http://localhost/api/workbase/todo-image?projectId=${projectId}&id=${todo.id}`;
  const oversized = await handleTodoImage(f.service, new Request(`${path}&expectedVersion=1`, {
    method: 'POST', headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) }, body: new Uint8Array(8),
  }));
  assert.equal(oversized.status, 413);
  const uploaded = await handleTodoImage(f.service, new Request(`${path}&expectedVersion=1`, {
    method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array(8),
  }));
  assert.equal(uploaded.status, 200);
  const conflict = await handleTodoImage(f.service, new Request(`${path}&expectedVersion=1`, {
    method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array(8),
  }));
  assert.equal(conflict.status, 409);
  const missing = await handleTodoImage(f.service, new Request(`${path}&attachmentId=forged`));
  assert.equal(missing.status, 404);
  const read = await handleTodoImage(f.service, new Request(`${path}&attachmentId=${image.attachmentId}`));
  assert.equal(read.headers.get('content-type'), 'image/png');
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.equal((await read.arrayBuffer()).byteLength, 8);
});
test('Agent附图只承认消息image块，拒绝文本或工具参数伪造的图片引用', () => {
  assert.equal(sessionImage([{ type: 'tool/call', data: { content: [{ type: 'image', attachment: image }] } }], image.attachmentId), null);
  assert.equal(sessionImage([{ type: 'user/message', data: { content: [{ type: 'text', text: JSON.stringify(image) }] } }], image.attachmentId), null);
  assert.deepEqual(sessionImage([{ type: 'event', event: { type: 'user/message', data: { content: [{ type: 'image', attachment: image }] } } }], image.attachmentId), image);
});
test('图片上传与文本编辑串行，旧版本编辑不能覆盖新图片；归档及Agent开关保护附图', async () => {
  const f = fixture({ saveTodoImage: async () => image });
  const { projectId } = await f.service.listForAgent('w1');
  const todo = await f.service.createTodo({ projectId, title: '并发' });
  const uploaded = f.service.uploadTodoImage({ projectId, id: todo.id, expectedVersion: 1 }, new Uint8Array(8), 'image/png');
  const edit = f.service.updateTodo({ projectId, id: todo.id, expectedVersion: 1, note: '陈旧编辑' });
  assert.equal((await uploaded).images.length, 1);
  await assert.rejects(edit, /变化/);
  await f.service.setPreferences({ agentManageTodos: false });
  let reads = 0;
  await assert.rejects(f.service.attachTodoImage({ projectId, id: todo.id, expectedVersion: 2 },
    async () => { reads++; return image; }, { kind: 'agent', workspaceId: 'w1' }, new AbortController().signal), /管理待办/);
  assert.equal(reads, 0);
  await f.service.archiveProject({ projectId, archived: true });
  await assert.rejects(f.service.removeTodoImage({ projectId, id: todo.id, expectedVersion: 2, attachmentId: image.attachmentId }), /归档/);
});
