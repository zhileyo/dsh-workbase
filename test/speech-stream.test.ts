import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechStream, type SpeechSocket } from '../src/server/speech-stream.js';
class Socket extends EventTarget implements SpeechSocket {
  readyState = 0;
  binaryType = '';
  sent: string[] = [];
  send(text: string) { this.sent.push(text); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  frame(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
test('首音频在finish前可读，严格序号，结束释放资源，密钥不回显', async () => {
  const socket = new Socket();
  let protocols: string[] = [];
  const stream = new SpeechStream('stella', true, 'test-key', new AbortController().signal,
    (_url, auth) => { protocols = auth; return socket; });
  const reader = stream.body.getReader();
  socket.open();
  assert.match(new TextDecoder().decode((await reader.read()).value), /"ready"/);
  stream.push(0, '您好。', false);
  assert.throws(() => stream.push(0, '重复', false), /序号/);
  socket.frame(new Uint8Array([0, 1, 2, 3]).buffer);
  const audio = new TextDecoder().decode((await reader.read()).value);
  assert.match(audio, /"audio"/); assert.doesNotMatch(audio, /test-key/);
  assert.deepEqual(protocols, ['tts', 'bearer.test-key']);
  stream.push(1, '', true);
  socket.frame(JSON.stringify({ event: 'finish', code: 'success' }));
  assert.match(new TextDecoder().decode((await reader.read()).value), /"end"/);
  assert.equal((await reader.read()).done, true);
  assert.equal(socket.readyState, 3);
});
test('取消、提前断连和文字上限停止连接', async () => {
  for (const reason of ['abort', 'close', 'limit']) {
    const socket = new Socket(), cancellation = new AbortController();
    const stream = new SpeechStream('tide', true, 'key', cancellation.signal, () => socket);
    const reader = stream.body.getReader(); socket.open(); await reader.read();
    if (reason === 'abort') cancellation.abort();
    if (reason === 'close') socket.dispatchEvent(new Event('close'));
    if (reason === 'limit') assert.throws(() => stream.push(0, '汉'.repeat(5001), false), /10000/);
    assert.match(new TextDecoder().decode((await reader.read()).value), /"error"/);
    assert.equal(socket.readyState, 3);
  }
});

test('慢消费者输出缓冲有界，未知finish不能当作成功', async () => {
  const socket = new Socket();
  const stream = new SpeechStream('stella', true, 'key', new AbortController().signal, () => socket);
  socket.open();
  for (let i = 0; i < 12; i++) socket.frame(new Uint8Array(1024 * 1024).buffer);
  assert.equal(stream.closed, true); assert.equal(socket.readyState, 3);
  const socket2 = new Socket();
  const stream2 = new SpeechStream('stella', true, 'key', new AbortController().signal, () => socket2);
  const reader = stream2.body.getReader(); socket2.open(); await reader.read();
  stream2.push(0, '正文。', true);
  socket2.frame(JSON.stringify({ event: 'finish', code: 'unknown', message: 'secret-key' }));
  const frame = new TextDecoder().decode((await reader.read()).value);
  assert.match(frame, /"error"/); assert.doesNotMatch(frame, /secret-key/);
  assert.equal(socket2.readyState, 3);
});

test('finish_text后按音频活跃刷新超时，不发送非官方JSON心跳', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = new Socket();
  const stream = new SpeechStream('stella', true, 'key', new AbortController().signal, () => socket);
  const reader = stream.body.getReader(); socket.open(); await reader.read();
  context.mock.timers.tick(26000);
  assert.deepEqual(socket.sent, []);
  stream.push(0, '正文。', true);
  context.mock.timers.tick(40000);
  socket.frame(new Uint8Array([0, 0]).buffer); await reader.read();
  context.mock.timers.tick(16000);
  assert.equal(stream.closed, false);
  socket.frame(JSON.stringify({ event: 'finish', code: 'success' }));
  assert.match(new TextDecoder().decode((await reader.read()).value), /"end"/);
});
