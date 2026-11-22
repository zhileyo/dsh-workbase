import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayback } from '../src/client/speech-playback.js';
import { defaultSpeech } from '../src/shared/speech.js';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

for (const consecutive of [false, true]) test(`替换等待旧取消确认，缓存正文按顺序发送（连续替换=${consecutive}）`, async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  class Context { state = 'running'; async resume() {} async close() {} }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  let release!: () => void; let closeOld!: () => void; let requests = 0;
  const commands: { op: string; text?: string; finish?: boolean }[] = [];
  const first = 'e069d73c-d82f-46a7-a83b-dce17cc99872';
  const second = 'e069d73c-d82f-46a7-a83b-dce17cc99873';
  const playback = new SpeechPlayback(async command => {
    commands.push(command);
    if (command.op === 'speech-stream-cancel' && command.id === first) {
      await new Promise<void>(resolve => {
        let released = false;
        release = () => { if (!released) { released = true; closeOld(); resolve(); } };
      });
    }
  }, async () => {
    const number = ++requests;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ event: 'ready', id: number === 1 ? first : second })}\n`));
        if (number === 1) closeOld = () => controller.close();
      },
    }));
  });
  try {
    playback.configure({ config: { ...defaultSpeech(), enabled: true }, version: 'v1', available: true, hasKey: true });
    playback.streamAction({ kind: 'text', attempt: 'a', text: '旧回复' });
    await tick();
    playback.streamAction({ kind: 'text', attempt: 'b', text: '新前缀' });
    playback.streamAction({ kind: 'text', attempt: 'b', text: '新后缀' });
    playback.streamAction({ kind: 'finish', attempt: 'b' });
    if (consecutive) {
      playback.streamAction({ kind: 'text', attempt: 'c', text: '最终回复' });
      playback.streamAction({ kind: 'finish', attempt: 'c' });
    }
    await tick();
    assert.equal(requests, 1);
    release(); await tick(); await tick();
    assert.equal(requests, 2);
    assert.deepEqual(commands.filter(command => command.op === 'speech-stream-text').slice(1).map(({ text, finish }) => ({ text, finish })),
      consecutive ? [{ text: '最终回复', finish: false }, { text: '', finish: true }]
        : [{ text: '新前缀', finish: false }, { text: '新后缀', finish: false }, { text: '', finish: true }]);
    assert.equal(playback.error, '');
  } finally {
    release?.(); playback.stop(true);
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});
