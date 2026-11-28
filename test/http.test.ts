import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/server/http.js';
import { WorkbaseService } from '../src/server/service.js';
import { initialState } from '../src/shared/model.js';
import { RPC_ENDPOINT, ASSISTANT_ENDPOINT } from '../src/shared/commands.js';
import { caller } from '../src/client/api.js';
import { defaultProjectRules, RULES_ENDPOINT, MESSAGE_ENDPOINT, MAX_RULES_REQUEST_BYTES, MAX_MESSAGE_REQUEST_BYTES, projectRulesSchema } from '../src/shared/project-rules.js';
import { defaultProjectInitialization } from '../src/shared/project-initialization.js';
function fixture() {
  let state = initialState();
  return new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => [], sessions: async () => [], rename: async () => {},
  }, () => 'id');
}
const request = (body: string, type = 'application/json') => new Request('http://localhost/api/workbase/dispatch', {
  method: 'POST', headers: { 'content-type': type }, body,
});
test('HTTP拒绝错误内容类型、损坏JSON和非工作台RPC', async () => {
  const service = fixture();
  assert.equal((await handleRequest(service, request('{}', 'text/plain'))).status, 415);
  assert.equal((await handleRequest(service, request('{'))).status, 400);
  assert.equal((await handleRequest(service, request(JSON.stringify({ type: 'client-request', rpcId: 'r', method: 'other', payload: { op: 'snapshot' } })))).status, 400);
});
test('HTTP流式请求超过32KiB立即取消，无写入', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(17000)); },
    cancel() { cancelled = true; },
  });
  const req = new Request('http://localhost/api/workbase/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half',
  } as RequestInit);
  assert.equal((await handleRequest(fixture(), req)).status, 413);
  assert.equal(cancelled, true);
});
test('HTTP沿用官方RPC请求与响应封装，保留rpcId', async () => {
  const response = await handleRequest(fixture(), request(JSON.stringify({
    type: 'client-request', rpcId: 'r1', method: RPC_ENDPOINT, payload: { op: 'snapshot' },
  })));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.type, 'server-response');
  assert.equal(result.rpcId, 'r1');
  assert.equal(result.result.ok, true);
  assert.deepEqual(result.result.value.projects, []);
});

test('20000字中文档案走owner专用路由，其他操作不能借用该路由', async () => {
  const content = '中'.repeat(20000);
  const service = new WorkbaseService({ get: initialState, set: async () => {} }, {
    workspaces: async () => [], sessions: async () => [], rename: async () => {},
  }, () => 'id', Date.now, undefined, undefined, {
    list: async () => ({ directory: '/profiles', active: true, documents: [] }),
    save: async (file, version, text) => ({ file, version: 'saved', content: text }),
  });
  const call = caller({ call: async (_channel, endpoint, payload) => {
    assert.equal(endpoint, ASSISTANT_ENDPOINT);
    const response = await handleRequest(service, request(JSON.stringify({
      type: 'client-request', rpcId: 'profile', method: endpoint, payload,
    })), undefined, 'assistant');
    assert.equal(response.status, 200);
    return (await response.json()).result;
  } });
  assert.equal((await call({ op: 'personal-save', file: 'USER.md', content, version: null }) as { content: string }).content, content);
  const wrong = request(JSON.stringify({ type: 'client-request', rpcId: 'wrong',
    method: ASSISTANT_ENDPOINT, payload: { op: 'snapshot' } }));
  assert.equal((await handleRequest(service, wrong, undefined, 'assistant')).status, 400);
});

test('C08合法20k规则新旧全文通过专用传输，普通RPC仍拒绝超限', async () => {
  let state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => [], sessions: async () => [], rename: async () => {},
    saveRules: async () => ({ rollback: async () => {} }),
  }, () => 'id');
  const call = caller({ call: async (_channel, endpoint, payload) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'large', method: endpoint, payload });
    const response = await handleRequest(service, request(body), undefined, endpoint === 'workbase/rules' ? 'rules' : 'rpc');
    assert.equal(response.status, 200);
    return (await response.json()).result;
  } });
  for (const text of ['a'.repeat(20000), '中'.repeat(20000)]) {
    const previous = structuredClone(state.preferences.rules);
    const rules = defaultProjectRules(); rules.global = { enabled: true, content: text };
    await call({ op: 'rules-save', expectedRules: previous, rules });
    const edited = structuredClone(rules); edited.global.content = `b${text.slice(1)}`;
    await call({ op: 'rules-save', expectedRules: rules, rules: edited });
    assert.deepEqual(state.preferences.rules, edited);
    const body = JSON.stringify({ type: 'client-request', rpcId: 'large', method: RPC_ENDPOINT,
      payload: { op: 'rules-save', expectedRules: rules, rules: edited } });
    assert.equal((await handleRequest(service, request(body))).status, 413);
  }
});

test('C08设置和20k中文消息走专用路径，规则版本冲突仍拒绝写入', async () => {
  let state = initialState();
  const texts: string[] = [];
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => [{ workspaceId: 'w', path: '/project', title: '项目', available: true, sessionIds: ['s'] }],
    sessions: async () => [], rename: async () => {}, saveRules: async () => ({ rollback: async () => {} }),
    submit: async input => { texts.push(input.text); },
  }, () => 'p');
  await service.snapshot();
  const endpoints: string[] = [];
  const call = caller({ call: async (_channel, endpoint, payload) => {
    endpoints.push(endpoint);
    const response = await handleRequest(service, request(JSON.stringify({
      type: 'client-request', rpcId: 'r', method: endpoint, payload,
    })), undefined, endpoint === RULES_ENDPOINT ? 'rules' : endpoint === MESSAGE_ENDPOINT ? 'message' : 'rpc');
    assert.equal(response.status, 200);
    return (await response.json()).result;
  } });
  const rules = defaultProjectRules(); rules.global = { enabled: true, content: '中'.repeat(20000) };
  await call({ op: 'settings', theme: 'follow', permissions: {}, options: {
    home: state.preferences.home, root: '', rules, expectedRules: defaultProjectRules(),
    projectInitialization: { ...defaultProjectInitialization(), agent: true, commitRuleContent: '中'.repeat(10000) },
  } });
  await assert.rejects(call({ op: 'rules-save', rules: defaultProjectRules(), expectedRules: defaultProjectRules() }), /其他窗口/);
  assert.deepEqual(state.preferences.rules, rules);
  await call({ op: 'submit-message', projectId: 'p', sessionId: 's', provider: 'provider', model: 'model',
    requestId: '11111111-1111-4111-8111-111111111111', text: '中'.repeat(20000) });
  assert.deepEqual(endpoints, [RULES_ENDPOINT, RULES_ENDPOINT, MESSAGE_ENDPOINT]);
  assert.deepEqual(texts, ['中'.repeat(20000)]);
});

test('C08专用路径拒绝其他操作或错配信封，流式超限立即取消', async () => {
  for (const [route, endpoint, limit] of [
    ['rules', RULES_ENDPOINT, MAX_RULES_REQUEST_BYTES], ['message', MESSAGE_ENDPOINT, MAX_MESSAGE_REQUEST_BYTES],
  ] as const) {
    for (const method of [endpoint, RPC_ENDPOINT]) {
      const response = await handleRequest(fixture(), request(JSON.stringify({
        type: 'client-request', rpcId: 'r', method, payload: { op: 'preferences', patch: { theme: 'warm' } },
      })), undefined, route);
      assert.equal(response.status, 400);
    }
    let cancelled = false;
    const bytes = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(bytes); }, cancel() { cancelled = true; },
    });
    const req = new Request('http://localhost/api', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half',
    } as RequestInit);
    assert.equal((await handleRequest(fixture(), req, undefined, route)).status, 413);
    assert.equal(cancelled, true);
    assert.ok(limit > 32768);
  }
});

test('C08全量合法规则最坏JSON转义预算仍在专用上限内', () => {
  const rules = defaultProjectRules();
  rules.global.content = '\0'.repeat(20000);
  rules.projects = Array.from({ length: 50 }, (_, i) => ({
    id: `rule-${i}`, name: `规则${i}`, enabled: false, content: '\0'.repeat(20000),
    projectIds: Array.from({ length: 200 }, (_, j) => `${'\0'.repeat(190)}${j}`),
  }));
  assert.equal(projectRulesSchema.safeParse(rules).success, true);
  assert.ok(Buffer.byteLength(JSON.stringify({
    type: 'client-request', rpcId: 'r', method: RULES_ENDPOINT, payload: { op: 'rules-save', rules, expectedRules: rules },
  })) < MAX_RULES_REQUEST_BYTES);
});

test('C08客户端按UTF-8预算提前拒绝普通RPC超限并保留输入', async () => {
  let calls = 0;
  const call = caller({ call: async () => { calls++; return { ok: true, value: {} }; } });
  const command = { op: 'update' as const, projectId: 'p', id: 't', expectedVersion: 1,
    title: '中'.repeat(500), note: '\0'.repeat(10000) };
  const before = structuredClone(command);
  await assert.rejects(call(command), /传输上限/);
  assert.equal(calls, 0);
  assert.deepEqual(command, before);
});
