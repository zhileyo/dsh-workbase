import assert from 'node:assert/strict';
import test from 'node:test';
import { composerActivityActions, composerInsertionRange } from '../src/client/NativeComposer.js';

// 剪贴板文本里每个引用占展开后的原文长度，宿主投影里只占一位；
// 这两套坐标只在选区边界靠原子时才可能错，所以下面按「原子位置 × 选区位置」穷举。
type Draft = any;
const draft = (text: string, atoms: { offset: number; length: number }[], extra: Partial<Draft> = {}): Draft =>
  ({ text, references: atoms, quotes: [], command: undefined, ...extra });
const at = (offset: number, length: number) => ({ offset, length });

test('选区落在纯文本区域时两套坐标只差被折叠的原子数', () => {
  const plain = draft('hello world', []);
  assert.deepEqual(composerInsertionRange(plain, 0, 0), { start: { detect: 0, clipboard: 0 }, end: { detect: 0, clipboard: 0 } });
  assert.deepEqual(composerInsertionRange(plain, 5, 11), { start: { detect: 5, clipboard: 5 }, end: { detect: 11, clipboard: 11 } });

  // 一个长度 10 的引用在开头：其后每个字符在宿主投影里都前移 9 位
  const leading = draft(`${'@ref'.padEnd(10, 'x')} after`, [at(0, 10)]);
  assert.deepEqual(composerInsertionRange(leading, 10, 16),
    { start: { detect: 1, clipboard: 10 }, end: { detect: 7, clipboard: 16 } });

  // 多个原子：偏移量逐段累加
  const twice = draft(`${'a'.repeat(10)}${'b'.repeat(10)}tail`, [at(0, 10), at(10, 10)]);
  assert.deepEqual(composerInsertionRange(twice, 20, 24),
    { start: { detect: 2, clipboard: 20 }, end: { detect: 6, clipboard: 24 } });
});

test('选区起点落在原子内部时移动到原子之后，终点同样按原子边界展开', () => {
  const text = `${'@ref'.padEnd(10, 'x')} tail`;
  const one = draft(text, [at(0, 10)]);
  assert.deepEqual(composerInsertionRange(one, 4, 4), { start: { detect: 1, clipboard: 10 }, end: { detect: 1, clipboard: 10 } });
  assert.deepEqual(composerInsertionRange(one, 4, 12), { start: { detect: 1, clipboard: 10 }, end: { detect: 3, clipboard: 12 } });
  // 选区跨越原子：起点在原子内、终点在原子后
  assert.deepEqual(composerInsertionRange(one, 2, 15), { start: { detect: 1, clipboard: 10 }, end: { detect: 6, clipboard: 15 } });
});

test('命令令牌作为长度为命令前缀的原子参与折叠', () => {
  const text = '/model foo 正文';
  const command = draft(text, [], { command: { token: '/model ', label: 'model' } });
  // 落在命令令牌之前时不动：插入点仍是文本开头
  assert.deepEqual(composerInsertionRange(command, 0, 0), { start: { detect: 0, clipboard: 0 }, end: { detect: 0, clipboard: 0 } });
  // 令牌按 trimEnd 后的长度折叠（'/model ' → '/model'，占 6 位），其后前移 5 位
  assert.deepEqual(composerInsertionRange(command, 7, 10), { start: { detect: 2, clipboard: 7 }, end: { detect: 5, clipboard: 10 } });
});

test('插入文本在版本、文本、长度或锁变化时被拒绝，成功后把光标放到插入末尾', async () => {
  const frames: (() => void)[] = [];
  (globalThis as any).requestAnimationFrame = (callback: () => void) => { frames.push(callback); return frames.length; };
  const make = (text = 'abcdef', maxLength = 100) => {
    const editor: any = { value: text, isConnected: true, disabled: false, maxLength,
      selectionStart: 3, selectionEnd: 3, focused: false, caret: -1,
      focus() { this.focused = true; }, setSelectionRange(start: number) { this.caret = start; } };
    let draftText = text, revision = 1, locked = false;
    const applied: { text: string; span: any }[] = [];
    const actions: any = {
      captureInsertion: () => ({ start: 0, end: 0, draftRev: revision }),
      insertText(text2: string, span: any) { applied.push({ text: text2, span }); draftText = draftText.slice(0, span.start ?? 0) + text2 + draftText.slice(span.end ?? 0); editor.value = draftText; return true; },
      persistDraft() {},
    };
    const wrapped = composerActivityActions(actions, editor, () => draft(draftText, []), () => locked);
    return { editor, actions, wrapped, applied, frames,
      setDraft(next: string) { draftText = next; }, bump() { revision++; }, lock() { locked = true; } };
  };

  const live = make();
  const span = live.wrapped.captureInsertion();
  assert.equal(span.start, 3);
  assert.equal(live.wrapped.insertText('XY', span), true);
  assert.equal(live.applied.length, 1);
  assert.equal(live.applied[0]!.text, 'XY');
  live.frames.at(-1)!();
  assert.equal(live.editor.focused, true);
  assert.equal(live.editor.caret, 5);

  const stale = make();
  const staleSpan = stale.wrapped.captureInsertion();
  stale.bump();
  assert.equal(stale.wrapped.insertText('XY', staleSpan), false);

  const drifted = make();
  const driftedSpan = drifted.wrapped.captureInsertion();
  drifted.editor.value = 'changed';
  assert.equal(drifted.wrapped.insertText('XY', driftedSpan), false);

  const tooLong = make('abc', 3);
  const longSpan = tooLong.wrapped.captureInsertion();
  assert.equal(tooLong.wrapped.insertText('XY', longSpan), false);

  const locked = make();
  const lockedSpan = locked.wrapped.captureInsertion();
  locked.lock();
  assert.equal(locked.wrapped.insertText('XY', lockedSpan), false);

  const detached = make();
  const detachedSpan = detached.wrapped.captureInsertion();
  detached.editor.isConnected = false;
  assert.equal(detached.wrapped.insertText('XY', detachedSpan), false);
});
