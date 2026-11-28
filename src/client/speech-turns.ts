import { assistantMessageText, type SpeechEntry } from '../shared/speech.js';
/** 仅接收新实时事件；历史replace/prepend由调用方排除。 */
export class SpeechTurns {
  private latest = new Map<number, string>();
  private seen = new Set<number>();
  accept(entry: SpeechEntry): string | undefined {
    if (entry.type !== 'event') return;
    const { type, seq } = entry.event;
    if (this.seen.has(seq)) return;
    this.seen.add(seq);
    if (this.seen.size > 2048) this.seen.delete(this.seen.values().next().value!);
    const data = entry.event.data as { turn?: number; interrupted?: boolean;
      message?: { content?: readonly { type: string; text?: string }[] }; reason?: { kind?: string } };
    if (typeof data.turn !== 'number') return;
    if (type === 'assistant/message') {
      this.latest.set(data.turn, assistantMessageText(data.interrupted, data.message?.content) || '');
      if (this.latest.size > 32) this.latest.delete(this.latest.keys().next().value!);
    }
    if (type !== 'turn/end') return;
    const text = this.latest.get(data.turn);
    this.latest.delete(data.turn);
    return data.reason?.kind === 'completed' && text ? text : undefined;
  }
}
