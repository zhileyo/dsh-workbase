import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { assertSupportedJsonSchema, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { registerTools } from '../src/server/tools.js';
import { WorkbaseService } from '../src/server/service.js';
import { initialState } from '../src/shared/model.js';
function fixture() {
  let state = initialState(), id = 0;
  const definitions: ToolDefinition[] = [];
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => [
      { workspaceId: 'w1', path: '/one', title: '一', available: true, sessionIds: ['s1'] },
      { workspaceId: 'w2', path: '/two', title: '二', available: true, sessionIds: ['s2'] },
    ],
    sessions: async () => [], rename: async () => {},
  }, () => `id-${++id}`);
  registerTools({
    effect: (callback: () => unknown) => callback(),
    tools: { register: (definition: ToolDefinition) => { definitions.push(definition); return () => {}; } },
    workspaceRegistry: { list: () => [{ id: 'w1', sessionIds: ['s1'] }, { id: 'w2', sessionIds: ['s2'] }] },
  } as unknown as Context, service);
  const execute = (name: string, args: unknown, sessionId?: string) => definitions.find(d => d.name === name)!.execute(args,
    { signal: new AbortController().signal, ...(sessionId ? { agent: { session: { id: sessionId } } } : {}) } as ToolRunContext);
  return { service, definitions, execute };
}
test('三个工具的参数及输出schema符合官方注册器限制', () => {
  const f = fixture();
  assert.equal(f.definitions.length, 3);
  for (const d of f.definitions) {
    assert.doesNotThrow(() => assertSupportedJsonSchema(d.parameters));
    assert.doesNotThrow(() => assertSupportedJsonSchema(d.output!.schema));
  }
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
