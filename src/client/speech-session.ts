import { SpeechTurns } from './speech-turns.js';
import { SpeechStreamTurns } from './speech-stream-turns.js';
import type { SpeechPlayback } from './speech-playback.js';
import type { SpeechEntry } from '../shared/speech.js';

type Change = { kind: string; entries?: readonly SpeechEntry[]; entry?: SpeechEntry; attemptId?: string };

/** 同一会话仅订阅一次；历史只建立按消息ID的重播索引。 */
export class SpeechSessionWatch {
  private turns = new SpeechTurns();
  private streamTurns: SpeechStreamTurns;
  constructor(private readonly playback: SpeechPlayback, private readonly session: string) {
    this.streamTurns = new SpeechStreamTurns(playback.status.config.filterMarkdown);
  }
  seed(entries: readonly SpeechEntry[]) {
    this.playback.stopSession(this.session);
    this.playback.updateReplies(this.session, entries, true);
    this.turns = new SpeechTurns(); this.streamTurns.seed(entries);
  }
  change(change: Change) {
    if (change.kind === 'replace') { this.seed(change.entries ?? []); return; }
    const entries = change.kind === 'append' || change.kind === 'prepend' ? change.entries ?? []
      : change.kind === 'settle-assistant' && change.entry ? [change.entry] : [];
    this.playback.updateReplies(this.session, entries);
    if (change.kind === 'prepend') return;
    if (!this.playback.status.config.enabled) {
      this.turns = new SpeechTurns();
      this.streamTurns.seed(entries); return;
    }
    if (this.playback.status.config.provider === 'deepseek') {
      if (change.kind === 'settle-assistant' && change.attemptId) {
        for (const action of this.streamTurns.settle(change.attemptId, !!change.entry))
          this.playback.streamAction(action, this.session);
      }
      for (const entry of entries) for (const action of this.streamTurns.accept(entry))
        this.playback.streamAction(action, this.session);
    } else {
      for (const entry of entries) {
        const text = this.turns.accept(entry);
        if (text) this.playback.enqueue(text, this.session);
      }
    }
  }
  dispose() { this.playback.releaseSession(this.session); }
}
