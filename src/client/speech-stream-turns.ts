import { assistantMessageText, SPEECH_TEXT_CHARACTERS, type SpeechEntry } from '../shared/speech.js';
export type SpeechAction = { kind: 'text'; attempt: string; text: string }
  | { kind: 'remember'; attempt: string; text: string }
  | { kind: 'finish'; attempt: string } | { kind: 'cancel'; attempt: string; message?: string };
type Attempt = { id: string; turn: number; step: number; blocks: Map<number, string>; pending: string;
  closed: boolean; cancelled: boolean; committed: boolean; retired: boolean };

/** 只消费新实时正文；历史窗口只建立静音基线。 */
export class SpeechStreamTurns {
  private current?: Attempt;
  private muted = new Set<string>();
  private latest = -Infinity;
  constructor(private readonly filterMarkdown = true) {}
  seed(entries: readonly SpeechEntry[]) {
    if (this.current) this.muted.add(this.current.id);
    this.current = undefined;
    for (const entry of entries) {
      this.latest = Math.max(this.latest, entry.event.seq);
      const data = entry.event.data as { attemptId?: string };
      if (data.attemptId) this.muted.add(data.attemptId);
    }
    if (this.muted.size > 128) this.muted = new Set([...this.muted].slice(-128));
  }
  private cancel(message?: string): SpeechAction[] {
    if (!this.current || this.current.cancelled) return [];
    this.current.closed = true; this.current.cancelled = true; this.current.pending = '';
    return [{ kind: 'cancel', attempt: this.current.id, ...(message ? { message } : {}) }];
  }
  settle(attempt: string, hasEntry: boolean): SpeechAction[] {
    return !hasEntry && this.current?.id === attempt && !this.current.retired ? this.cancel() : [];
  }
  accept(entry: SpeechEntry): SpeechAction[] {
    if (entry.event.seq <= this.latest) return [];
    this.latest = entry.event.seq;
    const data = entry.event.data as { attemptId?: string; turn?: number; step?: number; interrupted?: boolean;
      message?: { content: readonly { type: string; text?: string }[] };
      reason?: { kind?: string }; chunk?: { type: string; index?: number; text?: string;
        blockType?: string; block?: { type: string; text?: string }; reason?: { kind: string } } };
    if (entry.type !== 'transient' || entry.event.type !== 'assistant/live-chunk') {
      if (this.current && data.turn === this.current.turn &&
        (entry.event.type === 'assistant/attempt' || data.interrupted ||
          (entry.event.type === 'turn/end' && data.reason?.kind !== 'completed'))) return this.cancel();
      if (this.current && this.current.committed && data.turn === this.current.turn && data.step === this.current.step &&
        entry.event.type === 'step/end') this.current.retired = true;
      if (this.current && data.turn === this.current.turn && entry.event.type === 'assistant/message' &&
        data.message && !data.message.content.some(block => block.type === 'tool-call')) {
        this.current.committed = true;
        const text = assistantMessageText(undefined, data.message.content);
        if (text) return [{ kind: 'remember', attempt: this.current.id, text }];
      }
      return [];
    }
    if (!data.attemptId || !data.chunk || this.muted.has(data.attemptId)) return [];
    const actions: SpeechAction[] = [];
    if (this.current?.id !== data.attemptId) {
      actions.push(...this.cancel());
      this.current = { id: data.attemptId, turn: data.turn ?? -1, step: data.step ?? 0, blocks: new Map(),
        pending: '', closed: false, cancelled: false, committed: false, retired: false };
    }
    const state = this.current, chunk = data.chunk;
    if (state.closed) return actions;
    if (chunk.type === 'tool-call-delta' || chunk.blockType === 'tool-call' ||
      chunk.block?.type === 'tool-call') return [...actions, ...this.cancel()];
    if (chunk.type === 'finish') {
      if (!['stop', 'max-tokens'].includes(chunk.reason?.kind ?? '')) return [...actions, ...this.cancel()];
      actions.push(...this.flush(true)); state.closed = true;
      actions.push({ kind: 'finish', attempt: state.id }); return actions;
    }
    const index = chunk.index ?? 0;
    let addition = '';
    if (chunk.type === 'text-delta') {
      addition = chunk.text ?? '';
      state.blocks.set(index, (state.blocks.get(index) ?? '') + addition);
    } else if (chunk.type === 'block-end' && chunk.block?.type === 'text') {
      const before = state.blocks.get(index) ?? '', after = chunk.block.text ?? '';
      if (!after.startsWith(before)) return [...actions, ...this.cancel()];
      addition = after.slice(before.length); state.blocks.set(index, after);
    }
    if (addition) {
      state.pending += addition;
      if ([...state.blocks.values()].reduce((sum, text) => sum + text.length, 0) > SPEECH_TEXT_CHARACTERS)
        return [...actions, ...this.cancel('回复过长，已停止播报')];
      actions.push(...this.flush(false));
    }
    return actions;
  }
  private flush(final: boolean): SpeechAction[] {
    const state = this.current!;
    const actions: SpeechAction[] = [];
    // 保留未闭合围栏和链接，避免跨帧代码或URL被读出。
    while (state.pending) {
      if (this.filterMarkdown && state.pending.startsWith('```')) {
        const end = state.pending.indexOf('```', 3);
        if (end < 0) { if (final) state.pending = ''; break; }
        state.pending = state.pending.slice(end + 3); continue;
      }
      const fence = this.filterMarkdown ? state.pending.indexOf('```') : -1;
      let boundary = -1, brackets = 0, parentheses = 0, inlineCode = 0;
      for (let i = 0; i < state.pending.length; i++) {
        if (fence >= 0 && i >= fence) { boundary = fence; break; }
        const char = state.pending[i]!;
        if (this.filterMarkdown && char === '`') {
          let end = i + 1; while (state.pending[end] === '`') end++;
          const length = end - i;
          if (!inlineCode) inlineCode = length;
          else if (inlineCode === length) inlineCode = 0;
          i = end - 1; continue;
        }
        if (inlineCode) continue;
        if (char === '[') brackets++; if (char === ']') brackets = Math.max(0, brackets - 1);
        if (char === '(') parentheses++; if (char === ')') parentheses = Math.max(0, parentheses - 1);
        if (!brackets && !parentheses && (/[。！？!?\n]/.test(char) ||
          (char === '.' && /\s/.test(state.pending[i + 1] ?? '')) ||
          (i >= 240 && /[\s，,；;]/.test(char)))) { boundary = i + 1; break; }
      }
      if (boundary < 0) {
        if (!final) break;
        boundary = state.pending.length;
      }
      let text = state.pending.slice(0, boundary);
      state.pending = state.pending.slice(boundary);
      if (this.filterMarkdown) text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`+[^`]*`+/g, '').replace(/`+[^`]*$/g, '')
        .replace(/https?:\/\/\S+/g, '').replace(/[*_#>`~]/g, '');
      text = text.trim();
      if (text) actions.push({ kind: 'text', attempt: state.id, text });
    }
    return actions;
  }
}
