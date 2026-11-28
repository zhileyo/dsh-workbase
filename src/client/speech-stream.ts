import type { Command } from '../shared/commands.js';
import { speechBilledCharacters, SPEECH_BILLED_CHARACTERS, SPEECH_TEXT_CHARACTERS } from '../shared/speech.js';
import { SpeechPcm } from './speech-pcm.js';
type Send = (command: Command, signal?: AbortSignal) => Promise<unknown>;
/** HTTP只读音频，owner RPC顺序写文字；取消不重连、不重发。 */
export class ClientSpeechStream {
  readonly done: Promise<void>;
  private controller = new AbortController();
  private pcm: SpeechPcm;
  private id?: string;
  private seq = 0;
  private pending: { text: string; finish: boolean }[] = [];
  private sending = false;
  private finished = false;
  private total = '';
  private failure?: Error;
  private released?: Promise<void>;
  constructor(private readonly send: Send, version: string | null,
    request: typeof fetch = fetch, createPcm = () => new SpeechPcm(), manual = false) {
    this.pcm = createPcm();
    // 在重播点击的同步调用链中启动resume，保留浏览器用户激活。
    const resumed = this.pcm.resume();
    this.done = this.run(version, request, resumed, manual).finally(() => this.pcm.stop());
  }
  push(text: string, finish = false) {
    if (this.finished || this.controller.signal.aborted) return;
    this.total += text;
    if (speechBilledCharacters(this.total) > SPEECH_BILLED_CHARACTERS || this.total.length > SPEECH_TEXT_CHARACTERS) {
      this.fail(new Error('回复超过官方 10000 计费字符限制，已停止播报')); return;
    }
    this.finished = finish;
    this.pending.push({ text, finish }); void this.flush();
  }
  stop(): Promise<void> {
    if (this.released) return this.released;
    this.controller.abort(); this.pcm.stop(); this.pending = [];
    // 有token时以取消RPC回执确认释放；ready前等待HTTP读者关闭。
    const cancel = this.id ? this.send({ op: 'speech-stream-cancel', id: this.id }, AbortSignal.timeout(15000)) : Promise.resolve();
    this.released = Promise.all([cancel, this.done.catch(() => {})]).then(() => {});
    void this.released.catch(() => {});
    return this.released;
  }
  private fail(error: Error) { this.failure = error; this.stop(); }
  private async flush() {
    if (!this.id || this.sending) return;
    this.sending = true;
    try {
      while (this.pending.length && !this.controller.signal.aborted) {
        const part = this.pending.shift()!;
        await this.send({ op: 'speech-stream-text', id: this.id, seq: this.seq++, ...part }, this.controller.signal);
      }
    } catch (error) { this.fail(error instanceof Error ? error : new Error('流式播报请求失败')); }
    finally { this.sending = false; }
  }
  private async run(version: string | null, request: typeof fetch, resumed: Promise<void>, manual: boolean) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const timeout = setTimeout(() => this.fail(new Error('流式播报连接超时')), 15000);
    try {
      await resumed;
      this.controller.signal.throwIfAborted();
      const response = await request('api/workbase/speech-stream', { method: 'POST', signal: this.controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, ...(manual ? { manual: true } : {}) }) });
      if (!response.ok || !response.body) throw new Error('流式播报请求失败，请检查播报配置');
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffered = '', ended = false;
      while (!this.controller.signal.aborted) {
        const part = await reader.read();
        if (this.controller.signal.aborted) break;
        buffered += decoder.decode(part.value, { stream: !part.done });
        if (buffered.length > 2 * 1024 * 1024) throw new Error('流式播报缓冲超过上限');
        let newline: number;
        while ((newline = buffered.indexOf('\n')) >= 0) {
          const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
          const frame = JSON.parse(line) as { event: string; id?: string; data?: string; message?: string };
          if (ended) throw new Error('流式播报返回无效数据');
          if (frame.event === 'ready' && !this.id && typeof frame.id === 'string' &&
            /^[a-f0-9-]{36}$/.test(frame.id)) {
            this.id = frame.id; clearTimeout(timeout); void this.flush();
          } else if (frame.event === 'audio' && this.id && typeof frame.data === 'string' && frame.data.length <= 1400000) {
            const bytes = Uint8Array.from(atob(frame.data), char => char.charCodeAt(0));
            await this.pcm.write(bytes);
          } else if (frame.event === 'end' && this.id && this.finished) ended = true;
          else if (frame.event === 'error') throw new Error(frame.message || '流式语音合成失败');
          else throw new Error('流式播报返回无效数据');
        }
        if (part.done) break;
      }
      if (this.failure) throw this.failure;
      if (!this.controller.signal.aborted) {
        if (!ended || buffered.trim()) throw new Error('流式播报连接提前中断');
        await this.pcm.finish();
      }
    } catch (error) {
      if (this.failure) throw this.failure;
      if (!this.controller.signal.aborted) { this.stop(); throw error; }
    } finally { clearTimeout(timeout); await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
  }
}
