import type { Command } from '../shared/commands.js';
import { assistantMessageText, defaultSpeech, speechTextError, type SpeechReplyEntry,
  type SpeechStatus, type SpeechAudio } from '../shared/speech.js';
import { errorText } from './i18n.js';
import { ClientSpeechStream } from './speech-stream.js';
import type { SpeechAction } from './speech-stream-turns.js';
/** 每个会话保留的可重播回复条数；长会话正文全量驻留会随使用时长线性膨胀。 */
const MAX_REPLIES = 200;

export class SpeechPlayback {
  status: SpeechStatus = { config: defaultSpeech(), available: false, hasKey: false, version: null };
  error = '';
  playing = false;
  last = '';
  saving = false;
  private replies = new Map<string, Map<string, string>>();
  private session?: string;
  private manualReply?: string;
  private manual = false;
  private queue: { text: string; session?: string }[] = [];
  private controller?: AbortController;
  private audio?: HTMLAudioElement;
  private url?: string;
  private finish?: () => void;
  /** 播报世代：每次 stop 递增，用于丢弃过期流/音频的回调结果。 */
  private playbackEpoch = 0;
  private listeners = new Set<() => void>();
  /** 通知序号：useSyncExternalStore 的快照值，只增不回退。 */
  private notifyRevision = 0;
  /** 配置轮询世代：refresh 在途时 configure 递增，过期回执直接丢弃。 */
  private pollEpoch = 0;
  private stream?: ClientSpeechStream;
  private streamRelease?: Promise<void>;
  private attempt?: string;
  /** 最近一次失败后静默的 attempt，防止同一条自动播报反复报错刷屏。 */
  private mutedAttempt?: string;
  private suppressed = new Set<string>();
  constructor(private readonly send: (command: Command, signal?: AbortSignal) => Promise<unknown>,
    private readonly streamRequest?: typeof fetch) {}
  streamAction(action: SpeechAction, session?: string) {
    if (this.manual) {
      if (action.kind === 'text') {
        this.suppressed.add(action.attempt);
        if (this.suppressed.size > 32) this.suppressed.delete(this.suppressed.values().next().value!);
      }
      return;
    }
    if (this.suppressed.has(action.attempt) || !this.status.config.enabled || this.status.config.provider !== 'deepseek') return;
    if (action.kind === 'cancel') {
      if (action.attempt === this.attempt) this.stop();
      if (action.message) { this.error = errorText(action.message); this.changed(); }
      return;
    }
    if (action.kind === 'remember') {
      if (action.attempt === this.attempt) { this.last = action.text; this.changed(); }
      return;
    }
    if (action.kind === 'finish') {
      if (this.attempt === action.attempt) this.stream?.push('', true);
      return;
    }
    if (this.attempt !== action.attempt) {
      this.stop(); this.session = session; this.attempt = action.attempt; this.last = '';
    }
    this.last += `${this.last ? '\n' : ''}${action.text}`;
    if (action.attempt === this.mutedAttempt) { this.changed(); return; }
    if (!this.stream) this.beginStream();
    this.stream?.push(action.text);
  }
  private beginStream(manual = false) {
    const playbackEpoch = this.playbackEpoch;
    this.playing = true; this.error = ''; this.changed();
    try {
      const release = this.streamRelease;
      const request: typeof fetch = async (input, init) => {
        await release;
        init?.signal?.throwIfAborted();
        return (this.streamRequest ?? fetch)(input, init);
      };
      const stream = this.stream = new ClientSpeechStream(this.send, this.status.version, request, undefined, manual);
      void stream.done.catch(error => {
        if (playbackEpoch === this.playbackEpoch) {
          this.error = errorText(error instanceof Error ? error.message : '语音播报失败');
          this.mutedAttempt = this.attempt;
        }
      }).finally(() => {
        if (playbackEpoch === this.playbackEpoch) {
          this.stream = undefined; this.playing = false; this.manual = false; this.manualReply = undefined; this.changed();
        }
      });
    } catch (error) {
      this.error = errorText(error instanceof Error ? error.message : '语音播报失败');
      this.playing = false; this.manual = false; this.manualReply = undefined; this.mutedAttempt = this.attempt; this.changed();
    }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.notifyRevision;
  private changed() { this.notifyRevision++; for (const listener of this.listeners) listener(); }
  configure(value: SpeechStatus) {
    this.pollEpoch++;
    if (value.version !== this.status.version || value.config.enabled !== this.status.config.enabled) this.stop();
    this.status = value; this.changed();
  }
  get unavailableReason() {
    return !this.status.available ? '官方凭据存储不可用，暂不能保存播报配置'
      : !this.status.config.endpoint ? '请填写播报服务地址'
      : this.status.config.provider === 'deepseek' && !this.status.hasKey ? '请配置 DeepSeek API Key 后启用官方播报' : '';
  }
  async toggleAutomatic() {
    if (this.saving) return;
    if (!this.status.config.enabled && this.unavailableReason) {
      this.error = errorText(this.unavailableReason); this.changed(); return;
    }
    const before = this.status;
    this.saving = true; this.error = ''; this.changed();
    try {
      const value = await this.send({ op: 'speech-save', version: before.version,
        config: { ...before.config, enabled: !before.config.enabled } }) as SpeechStatus;
      this.configure(value);
    } catch (error) {
      this.error = errorText(error instanceof Error ? error.message : '播报配置保存失败'); this.changed();
    } finally { this.saving = false; this.changed(); }
  }
  reply(session: string, id: string) { return this.replies.get(session)?.get(id) ?? ''; }
  updateReplies(session: string, entries: readonly SpeechReplyEntry[], replace = false) {
    const replies = replace ? new Map<string, string>() : this.replies.get(session) ?? new Map<string, string>();
    for (const entry of entries) {
      if (entry.type !== 'event' || entry.event.type !== 'assistant/message') continue;
      const data = entry.event.data as { interrupted?: boolean; message?: {
        id?: string; content?: readonly { type: string; text?: string }[];
      } } | null;
      const message = data?.message;
      if (!message?.id) continue;
      const text = assistantMessageText(data?.interrupted, message.content);
      if (text) replies.set(message.id, text); else replies.delete(message.id);
    }
    // 长会话的回复全文不该永久驻留：只保留最近若干条供重播，淘汰按插入顺序。
    while (replies.size > MAX_REPLIES) {
      const oldest = replies.keys().next();
      if (oldest.done) break;
      replies.delete(oldest.value);
    }
    this.replies.set(session, replies); this.changed();
  }
  releaseSession(session: string) {
    this.stopSession(session); this.replies.delete(session); this.changed();
  }
  stopSession(session: string) {
    this.queue = this.queue.filter(item => item.session !== session);
    if (this.session === session) this.stop(true);
  }
  isReplyPlaying(session: string, id: string) {
    return this.playing && this.session === session && this.manualReply === id;
  }
  isSessionPlaying(session: string) {
    return this.playing && this.session === session;
  }
  replayReply(session: string, id: string) {
    const text = this.reply(session, id);
    if (!text) return;
    this.playText(text, session, id);
  }
  async refresh() {
    const epoch = this.pollEpoch;
    try {
      const value = await this.send({ op: 'speech-status' }) as SpeechStatus;
      if (epoch === this.pollEpoch) this.configure(value);
    } catch (error) {
      if (epoch !== this.pollEpoch) return;
      this.error = errorText(error instanceof Error ? error.message : '播报配置读取失败'); this.changed();
    }
  }
  enqueue(text: string, session?: string) {
    if (this.manual || !this.status.config.enabled) return;
    const invalidText = speechTextError(this.status.config, text);
    if (invalidText) { this.error = invalidText; this.changed(); return; }
    if (this.queue.length >= 3) { this.error = '播报队列已满，已跳过新回复'; this.changed(); return; }
    this.queue.push({ text, session }); void this.drain();
  }
  replay() {
    this.playText(this.last);
  }
  private playText(text: string, session?: string, id?: string) {
    this.stop();
    if (!text) return;
    const invalidText = speechTextError(this.status.config, text);
    if (invalidText) { this.error = errorText(invalidText); this.changed(); return; }
    this.manual = true; this.session = session; this.manualReply = id; this.last = text;
    if (this.status.config.provider === 'deepseek') {
      this.beginStream(true); this.stream?.push(text, true);
    } else { this.queue.push({ text, session }); void this.drain(); }
  }
  stop(clearLast = false) {
    this.mutedAttempt = this.attempt;
    if (this.stream) {
      const released = this.stream.stop();
      // 取消回执失败只影响这一条流：等待链条必须恒为 fulfilled，否则新流会在 beginStream 的
      // await release 处永久被拒，一次取消失败就淹掉此后全部播报。
      this.streamRelease = Promise.all([this.streamRelease ?? Promise.resolve(), released]
        .map(item => item.catch(() => {}))).then(() => {});
    }
    this.stream = undefined;
    this.playbackEpoch++; this.queue = [];
    this.controller?.abort(); this.controller = undefined;
    this.audio?.pause(); this.audio = undefined; this.finish?.(); this.finish = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined; this.playing = false;
    this.manual = false; this.manualReply = undefined; this.session = undefined;
    if (clearLast) { this.last = ''; this.attempt = undefined; this.mutedAttempt = undefined; this.suppressed.clear(); }
    this.changed();
  }
  private async drain() {
    if (this.playing || !this.queue.length) return;
    const { text, session } = this.queue.shift()!;
    this.session = session;
    const playbackEpoch = this.playbackEpoch;
    const controller = this.controller = new AbortController();
    this.playing = true; this.last = text; this.error = ''; this.changed();
    try {
      const result = await this.send({ op: 'speech-synthesize', text, ...(this.manual ? { manual: true } : {}) }, controller.signal) as SpeechAudio;
      if (playbackEpoch !== this.playbackEpoch) return;
      const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
      const url = this.url = URL.createObjectURL(new Blob([bytes], { type: result.mime }));
      const audio = this.audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        this.finish = resolve;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('音频播放失败，请重播或检查设备'));
        void audio.play().catch(() => reject(new Error('自动播放受阻，请点击重播')));
      });
    } catch (error) {
      if (playbackEpoch !== this.playbackEpoch) return;
      this.error = errorText(error instanceof Error ? error.message : '语音播报失败');
      this.queue = [];
    } finally {
      if (playbackEpoch === this.playbackEpoch) {
        this.audio?.pause(); this.audio = undefined; this.finish = undefined;
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = undefined; this.controller = undefined; this.playing = false;
        this.manual = false; this.manualReply = undefined;
        this.changed(); void this.drain();
      }
    }
  }
}
