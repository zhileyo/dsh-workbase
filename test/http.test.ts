import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/server/http.js';
import { WorkbaseService } from '../src/server/service.js';
import { initialState } from '../src/shared/model.js';
import { RPC_ENDPOINT } from '../src/shared/commands.js';
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
