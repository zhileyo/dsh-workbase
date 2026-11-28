import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayback } from '../src/client/speech-playback.js';
import { defaultSpeech } from '../src/shared/speech.js';
import { SpeechSessionWatch } from '../src/client/speech-session.js';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const enabled = { config: { ...defaultSpeech(), enabled: true },
  available: true, hasKey: false, version: 'v1' };

test('顶部自动开关按版本保存，无密钥回传；冲突不覆盖，重复点击不并发', async () => {
  let complete!: (value: unknown) => void;
  const commands: unknown[] = [];
  const playback = new SpeechPlayback(async command => {
    commands.push(command); return new Promise(resolve => { complete = resolve; });
  });
  playback.configure({ ...enabled, hasKey: true });
  const save = playback.toggleAutomatic();
  await playback.toggleAutomatic();
  assert.equal(playback.saving, true);
  assert.deepEqual(commands, [{ op: 'speech-save', version: 'v1', config: { ...enabled.config, enabled: false } }]);
  complete({ ...enabled, config: { ...enabled.config, enabled: false }, version: 'v2' });
  await save;
  assert.equal(playback.status.config.enabled, false);
  assert.equal(playback.saving, false);
  const failed = new SpeechPlayback(async () => { throw new Error('播报配置已在外部修改，请重新读取后保存'); });
  failed.configure({ ...enabled, hasKey: true });
  await failed.toggleAutomatic();
  assert.equal(failed.status.config.enabled, true);
  assert.match(failed.error, /外部修改/);
});

test('关闭自动播报后手动只播指定回复，切会话取消音频并清理对应正文', async () => {
  const commands: unknown[] = [];
  const playback = new SpeechPlayback(async command => { commands.push(command); return new Promise(() => {}); });
  playback.configure({ ...enabled, config: { ...defaultSpeech(), provider: 'compatible', enabled: false,
    endpoint: 'https://example.com/speech' } });
  const message = (id: string, text: string) => ({ type: 'event', event: { type: 'assistant/message', seq: 1,
    data: { turn: 1, message: { id, content: [{ type: 'text', text }, { type: 'reasoning', text: '私有推理' }] } } } });
  const watch = new SpeechSessionWatch(playback, 's');
  watch.seed([message('a', '第一条'), message('b', '第二条')]);
  assert.equal(playback.reply('s', 'a'), '第一条');
  assert.equal(playback.reply('s', 'b'), '第二条');
  assert.deepEqual(commands, []);
  watch.change({ kind: 'append', entries: [message('c', '第三条')] });
  assert.deepEqual(commands, []);
  playback.replayReply('s', 'a');
  assert.deepEqual(commands, [{ op: 'speech-synthesize', text: '第一条', manual: true }]);
  assert.equal(playback.isReplyPlaying('s', 'a'), true);
  assert.equal(playback.isReplyPlaying('s', 'b'), false);
  assert.equal(playback.isSessionPlaying('s'), true);
  assert.equal(playback.isSessionPlaying('other'), false);
  watch.dispose();
  assert.equal(playback.playing, false);
  assert.equal(playback.isSessionPlaying('s'), false);
  assert.equal(playback.reply('s', 'a'), '');
  await tick();
});

test('历史加载与重连仅更新逐条正文，自动播报不重读历史，手动播放不被自动chunk抢占', () => {
  const playback = new SpeechPlayback(async () => new Promise(() => {}));
  playback.configure({ ...enabled, config: { ...enabled.config, provider: 'compatible' } });
  const message = (id: string, text: string, extra = {}) => ({ type: 'event', event: { type: 'assistant/message', seq: 1,
    data: { turn: 1, ...extra, message: { id, content: [{ type: 'text', text }] } } } });
  const watch = new SpeechSessionWatch(playback, 's');
  watch.seed([message('a', '历史')]);
  watch.change({ kind: 'prepend', entries: [message('b', '更早历史')] });
  assert.equal(playback.playing, false);
  playback.replayReply('s', 'b');
  playback.enqueue('新回复。', 's');
  playback.streamAction({ kind: 'text', attempt: 'new', text: '新回复。' }, 's');
  assert.equal(playback.last, '更早历史');
  watch.change({ kind: 'replace', entries: [message('c', '重连历史'), message('d', '被取消', { interrupted: true })] });
  assert.equal(playback.reply('s', 'a'), '');
  assert.equal(playback.reply('s', 'c'), '重连历史');
  assert.equal(playback.reply('s', 'd'), '');
  assert.equal(playback.playing, false);
  watch.dispose();
});

test('手动停止保持当前attempt静音，最终正文只更新重播文本', () => {
  let requests = 0;
  const playback = new SpeechPlayback(async () => { requests++; });
  playback.configure(enabled);
  // 不启动AudioContext：先记录当前正文，验证停止后的后缀和durable message。
  playback.streamAction({ kind: 'text', attempt: 'a', text: '前缀。' });
  playback.stop();
  playback.streamAction({ kind: 'text', attempt: 'a', text: '后缀。' });
  assert.equal(playback.playing, false);
  assert.match(playback.last, /后缀/);
  playback.streamAction({ kind: 'remember', attempt: 'a', text: '完整正文。' });
  assert.equal(playback.last, '完整正文。');
  assert.equal(requests, 0);
  playback.stop(true);
});

test('超官方计费字符在客户端跳过，不发合成请求', () => {
  let requests = 0;
  const playback = new SpeechPlayback(async () => { requests++; });
  playback.configure(enabled);
  playback.enqueue('汉'.repeat(5001));
  assert.match(playback.error, /10000/);
  assert.equal(requests, 0);
  assert.equal(playback.playing, false);
});

test('停止取消正在合成的请求，迟到音频不播放，待播队列清空', async () => {
  let resolve!: (value: unknown) => void;
  let signal: AbortSignal | undefined;
  let requests = 0;
  const playback = new SpeechPlayback(async (_command, cancellation) => {
    requests++; signal = cancellation;
    return new Promise(done => { resolve = done; });
  });
  playback.configure(enabled);
  playback.enqueue('第一段'); playback.enqueue('第二段');
  assert.equal(playback.playing, true);
  playback.stop();
  assert.equal(signal?.aborted, true);
  resolve({ data: 'AQI=', mime: 'audio/mpeg' });
  await tick();
  assert.equal(playback.playing, false);
  assert.equal(requests, 1);
  assert.equal(playback.last, '第一段');
  playback.stop(true);
  assert.equal(playback.last, '');
});

test('离开排队会话只移除其待播正文，不改变正在播放的会话身份', () => {
  const playback = new SpeechPlayback(async () => new Promise(() => {}));
  playback.configure({ ...enabled, config: { ...enabled.config, provider: 'compatible' } });
  playback.enqueue('第一会话', 'first'); playback.enqueue('第二会话', 'second');
  playback.releaseSession('second');
  assert.equal(playback.playing, true);
  playback.releaseSession('first');
  assert.equal(playback.playing, false);
});

test('自动播放受阻保留可重播正文；关闭配置停止并丢弃等待音频', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  class FakeAudio {
    onended?: () => void;
    onerror?: () => void;
    play() { return Promise.reject(new Error('blocked')); }
    pause() {}
  }
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio });
  try {
    const playback = new SpeechPlayback(async () => ({ data: 'AQI=', mime: 'audio/mpeg' }));
    playback.configure(enabled);
    playback.enqueue('回复');
    await tick();
    assert.match(playback.error, /重播/);
    assert.equal(playback.last, '回复');
    assert.equal(playback.playing, false);
    playback.configure({ ...enabled, config: defaultSpeech(), version: 'v2' });
    playback.enqueue('不会播放');
    assert.equal(playback.playing, false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'Audio', original);
    else Reflect.deleteProperty(globalThis, 'Audio');
  }
});

test('取消回执失败不淹掉后续播报，新流照常发起请求', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class {
    state = 'running'; currentTime = 0;
    async resume() {}
    async close() {}
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return { connect() {}, start() {}, stop() {}, buffer: null, onended: null }; }
  } });
  try {
    let fetches = 0;
    const request = (async (_input: unknown, init: any) => {
      fetches++;
      const signal: AbortSignal = init.signal;
      let delivered = false;
      const body = { getReader() { return {
        read: () => {
          if (!delivered) {
            delivered = true;
            return Promise.resolve({ value: new TextEncoder().encode('{"event":"ready","id":"11111111-1111-4111-8111-111111111111"}\n'), done: false });
          }
          return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        },
        cancel: async () => {}, releaseLock() {} }; } };
      return { ok: true, body };
    }) as any;
    const playback = new SpeechPlayback(async command => {
      if (command.op === 'speech-stream-cancel') throw new Error('取消回执失败');
      return null;
    }, request);
    playback.configure({ config: { ...defaultSpeech(), enabled: true, provider: 'deepseek' }, available: true, hasKey: true, version: 'v1' });
    playback.streamAction({ kind: 'text', attempt: 'a1', text: '第一段' }, 's');
    await tick(); await tick();
    assert.equal(fetches, 1, '首条流应发起请求');
    playback.stop();
    await tick(); await tick();
    playback.replay();
    await tick(); await tick();
    assert.equal(fetches, 2, '取消回执失败后新的流仍要发起请求');
    playback.stop();
    await tick();
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else delete (globalThis as any).AudioContext;
  }
});
test('重播索引按会话保留最近若干条回复，不随会话长度无限增长', () => {
  const playback = new SpeechPlayback(async () => new Promise(() => {}));
  playback.configure({ ...enabled, config: { ...defaultSpeech(), provider: 'compatible', enabled: false, endpoint: 'https://example.com/speech' } });
  const message = (id: string) => ({ type: 'event', event: { type: 'assistant/message', data: { message: { id, content: [{ type: 'text', text: id }] } } } });
  playback.updateReplies('s', Array.from({ length: 300 }, (_, index) => message(`m${index}`)));
  assert.equal(playback.reply('s', 'm0'), '', '过旧的回复不再常驻内存');
  assert.equal(playback.reply('s', 'm299'), 'm299');
  assert.equal(playback.reply('s', 'm100'), 'm100', '窗口内的回复仍可重播');
});