import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechStreamTurns } from '../src/client/speech-stream-turns.js';
let seq = 0;
const live = (chunk: unknown, attemptId = 'a', turn = 1) => ({
  type: 'transient', event: { type: 'assistant/live-chunk', seq: ++seq,
    data: { attemptId, turn, step: 0, chunk } },
});
test('正文完整句立即输出，半句结束补齐，最终message不重播', () => {
  const turns = new SpeechStreamTurns();
  assert.deepEqual(turns.accept(live({ type: 'text-delta', index: 0, text: '第一句。第二' })),
    [{ kind: 'text', attempt: 'a', text: '第一句。' }]);
  assert.deepEqual(turns.accept(live({ type: 'block-end', index: 0,
    block: { type: 'text', text: '第一句。第二句' } })), []);
  assert.deepEqual(turns.accept(live({ type: 'finish', reason: { kind: 'stop' } })), [
    { kind: 'text', attempt: 'a', text: '第二句' }, { kind: 'finish', attempt: 'a' },
  ]);
  assert.deepEqual(turns.accept({ type: 'event', event: { type: 'assistant/message', seq: ++seq,
    data: { turn: 1, message: { content: [{ type: 'text', text: '第一句。第二句' }] } } } }),
    [{ kind: 'remember', attempt: 'a', text: '第一句。第二句' }]);
});
test('推理不播报，工具调用停止当前attempt', () => {
  const turns = new SpeechStreamTurns();
  assert.deepEqual(turns.accept(live({ type: 'reasoning-delta', index: 0, text: '推理。' })), []);
  turns.accept(live({ type: 'text-delta', index: 1, text: '正文。' }));
  assert.deepEqual(turns.accept(live({ type: 'tool-call-delta', index: 2 })),
    [{ kind: 'cancel', attempt: 'a' }]);
  assert.deepEqual(turns.accept(live({ type: 'text-delta', index: 1, text: '不播。' })), []);
});
test('基线和重连前缀抑制，新的attempt可播报；跨chunk代码不读', () => {
  const turns = new SpeechStreamTurns();
  turns.seed([live({ type: 'text-delta', index: 0, text: '历史。' })]);
  assert.deepEqual(turns.accept(live({ type: 'text-delta', index: 0, text: '旧后缀。' })), []);
  assert.deepEqual(turns.accept(live({ type: 'text-delta', index: 0, text: '新句。```js\n秘密。' }, 'b', 2)),
    [{ kind: 'text', attempt: 'b', text: '新句。' }]);
  assert.deepEqual(turns.accept(live({ type: 'text-delta', index: 0, text: '\n```后文。' }, 'b', 2)),
    [{ kind: 'text', attempt: 'b', text: '后文。' }]);
});
test('相同seq只处理一次，改写和失败取消不重发', () => {
  const turns = new SpeechStreamTurns();
  const entry = live({ type: 'text-delta', index: 0, text: '已读。' });
  turns.accept(entry);
  assert.deepEqual(turns.accept(entry), []);
  assert.deepEqual(turns.accept(live({ type: 'block-end', index: 0,
    block: { type: 'text', text: '改写。' } })), [{ kind: 'cancel', attempt: 'a' }]);
  assert.deepEqual(turns.accept(live({ type: 'finish', reason: { kind: 'error' } })), []);
});

test('正文finish之后放弃或取消仍停止音频；正常step退休不会停止', () => {
  const turns = new SpeechStreamTurns();
  turns.accept(live({ type: 'text-delta', index: 0, text: '正文。' }));
  turns.accept(live({ type: 'finish', reason: { kind: 'stop' } }));
  assert.deepEqual(turns.settle('a', false), [{ kind: 'cancel', attempt: 'a' }]);
  assert.deepEqual(turns.settle('a', false), []);
  const completed = new SpeechStreamTurns();
  completed.accept(live({ type: 'text-delta', index: 0, text: '正常正文。' }, 'b'));
  completed.accept(live({ type: 'finish', reason: { kind: 'stop' } }, 'b'));
  completed.accept({ type: 'event', event: { type: 'assistant/message', seq: ++seq,
    data: { turn: 1, step: 0, message: { content: [{ type: 'text', text: '正常正文。' }] } } } });
  completed.accept({ type: 'event', event: { type: 'step/end', seq: ++seq, data: { turn: 1, step: 0 } } });
  assert.deepEqual(completed.settle('b', false), []);
  assert.deepEqual(completed.accept({ type: 'event', event: { type: 'turn/end', seq: ++seq,
    data: { turn: 1, reason: { kind: 'cancelled' } } } }), [{ kind: 'cancel', attempt: 'b' }]);
});

test('行内代码跨chunk标点不提前朗读，无标点超长正文有明确提示', () => {
  const turns = new SpeechStreamTurns();
  assert.deepEqual(turns.accept(live({ type: 'text-delta', index: 0, text: '看看`secret。' })), []);
  assert.deepEqual(turns.accept(live({ type: 'text-delta', index: 0, text: 'hidden`[文档](https://example.com/a)。' })),
    [{ kind: 'text', attempt: 'a', text: '看看文档。' }]);
  const long = new SpeechStreamTurns();
  assert.deepEqual(long.accept(live({ type: 'text-delta', index: 0, text: 'x'.repeat(12001) }, 'c')),
    [{ kind: 'cancel', attempt: 'c', message: '回复过长，已停止播报' }]);
});
