import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientSpeechStream } from '../src/client/speech-stream.js';
import { SpeechPcm } from '../src/client/speech-pcm.js';
import { Speech, type SpeechVault } from '../src/server/speech.js';
import { speechFetch } from '../src/server/speech-fetch.js';
import { defaultSpeech } from '../src/shared/speech.js';
import type { SpeechSocket } from '../src/server/speech-stream.js';
import { dispatch } from '../src/server/rpc.js';
import type { WorkbaseService } from '../src/server/service.js';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const id = 'e069d73c-d82f-46a7-a83b-dce17cc99872';
test('音频在finish文字之前播放；ready前文字FIFO，断连不重试', async () => {
  let output!: ReadableStreamDefaultController<Uint8Array>;
  const commands: unknown[] = [], played: number[] = [];
  let stopped = false;
  const pcm = { async resume() {}, async write(bytes: Uint8Array) { played.push(bytes.length); },
    async finish() {}, stop() { stopped = true; } } as unknown as SpeechPcm;
  const request = (async () => new Response(new ReadableStream({
    start(controller) { output = controller; },
  }))) as typeof fetch;
  const client = new ClientSpeechStream(async command => { commands.push(command); }, 'v1', request, () => pcm);
  client.push('第一句。');
  await tick();
  const frame = (value: unknown) => output.enqueue(new TextEncoder().encode(`${JSON.stringify(value)}\n`));
  frame({ event: 'ready', id }); await tick();
  frame({ event: 'audio', data: 'AIAAQA==' }); await tick();
  assert.deepEqual(played, [4]);
  assert.deepEqual(commands, [{ op: 'speech-stream-text', id, seq: 0, text: '第一句。', finish: false }]);
  client.push('第二句。'); client.push('', true); await tick();
  frame({ event: 'end' }); output.close(); await client.done;
  assert.equal(commands.length, 3); assert.equal(stopped, true);
});
test('停止后迟到音频不播放，取消token，不重新连接', async () => {
  let output!: ReadableStreamDefaultController<Uint8Array>;
  let reads = 0, played = 0; const commands: { op: string }[] = [];
  const client = new ClientSpeechStream(async command => { commands.push(command); }, null,
    (async () => { reads++; return new Response(new ReadableStream({ start(controller) { output = controller; } })); }) as typeof fetch,
    () => ({ async resume() {}, async write() { played++; }, async finish() {}, stop() {} }) as unknown as SpeechPcm);
  await tick();
  output.enqueue(new TextEncoder().encode(`${JSON.stringify({ event: 'ready', id })}\n`)); await tick();
  client.stop();
  output.enqueue(new TextEncoder().encode(`${JSON.stringify({ event: 'audio', data: 'AAA=' })}\n`));
  output.close(); await client.done;
  assert.equal(played, 0); assert.equal(reads, 1);
  assert.equal(commands.at(-1)?.op, 'speech-stream-cancel');
});
class Socket extends EventTarget implements SpeechSocket {
  readyState = 0; binaryType = ''; sent: string[] = [];
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
}
test('专用路由限制请求，官方配置版本核对，配置保存取消流', async () => {
  let record: unknown;
  const vault: SpeechVault = { async readRecord() { return record; },
    async modifyRecord(_key, update) { record = await update(record); return record; } };
  const socket = new Socket();
  const speech = new Speech(() => vault, fetch, () => socket);
  const status = await speech.save(null, { ...defaultSpeech(), enabled: true }, 'test-key');
  const request = (body: string) => new Request('https://host/api/workbase/speech-stream', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await speechFetch(speech, request('x'.repeat(2049)))).status, 413);
  assert.equal((await speechFetch(speech, request(JSON.stringify({ version: 'stale' })))).status, 409);
  const response = await speechFetch(speech, request(JSON.stringify({ version: status.version })));
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  socket.readyState = 1; socket.dispatchEvent(new Event('open')); await reader.read();
  assert.equal((await speechFetch(speech, request(JSON.stringify({ version: status.version })))).status, 409);
  await speech.save(status.version, { ...status.config, enabled: false });
  assert.equal(socket.readyState, 3);
  assert.match(new TextDecoder().decode((await reader.read()).value), /"error"/);
  speech.dispose();
});

test('流式文字和取消RPC拒绝非owner；不合法序号和token不操作服务', async () => {
  let writes = 0;
  const service = { speech: { pushStream() { writes++; }, cancelStream() { writes++; } } } as unknown as WorkbaseService;
  for (const op of ['speech-stream-text', 'speech-stream-cancel']) {
    const result = await dispatch(service, { op, id, seq: 0, text: '正文。', finish: false }, false, new AbortController().signal);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'forbidden');
  }
  const result = await dispatch(service, { op: 'speech-stream-text', id: 'invalid', seq: -1, text: '', finish: true },
    true, new AbortController().signal);
  assert.equal(result.ok, false); assert.equal(writes, 0);
});

test('手动流请求显式标记且保留版本校验，关闭自动时可重播，缺密钥仍拒绝', async () => {
  let record: unknown;
  const vault: SpeechVault = { async readRecord() { return record; },
    async modifyRecord(_key, update) { record = await update(record); return record; } };
  const speech = new Speech(() => vault, fetch, () => new Socket());
  const status = await speech.save(null, defaultSpeech(), 'test-key');
  const request = (value: unknown) => new Request('https://host/api/workbase/speech-stream', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal((await speechFetch(speech, request({ version: status.version }))).status, 400);
  assert.equal((await speechFetch(speech, request({ version: 'stale', manual: true }))).status, 409);
  let payload: unknown;
  const client = new ClientSpeechStream(async () => {}, status.version, (async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return speechFetch(speech, request(payload));
  }) as typeof fetch, () => ({ async resume() {}, async write() {}, async finish() {}, stop() {} }) as unknown as SpeechPcm, true);
  await tick();
  assert.deepEqual(payload, { version: status.version, manual: true });
  speech.dispose(); await client.done.catch(() => {});
  const empty = new Speech(() => vault);
  const noKey = await empty.save(status.version, status.config, undefined, true);
  assert.equal((await speechFetch(empty, request({ version: noKey.version, manual: true }))).status, 400);
  empty.dispose();
});
