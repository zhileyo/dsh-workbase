import { randomUUID } from 'node:crypto';
import { WorkbaseError } from '../shared/model.js';

export interface SpeechSocket extends EventTarget {
  readyState: number; binaryType: string;
  send(text: string): void; close(): void;
}
export type SpeechSocketFactory = (url: string, protocols: string[]) => SpeechSocket;
export class SpeechStream {
  readonly id = randomUUID();
  readonly body: ReadableStream<Uint8Array>;
  closed = false;
  private socket: SpeechSocket;
  private output!: ReadableStreamDefaultController<Uint8Array>;
  private seq = 0;
  private characters = 0;
  private textBytes = 0;
  private audioBytes = 0;
  private finishedText = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private idle?: ReturnType<typeof setTimeout>;
  constructor(voice: string, filterMarkdown: boolean, key: string, private readonly signal: AbortSignal,
    factory: SpeechSocketFactory = (url, protocols) => new WebSocket(url, protocols),
    private readonly released: () => void = () => {}) {
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key))
      throw new WorkbaseError('invalid', 'DeepSeek API Key 格式不合法');
    this.body = new ReadableStream({
      start: controller => { this.output = controller; },
      cancel: () => { this.end(); },
    }, { highWaterMark: 8 * 1024 * 1024, size: chunk => chunk.byteLength });
    const url = new URL('wss://api.deepseek.com/v1/tools/tts');
    url.search = new URLSearchParams({ voice_id: voice, format: 'pcm', filter_markdown: String(filterMarkdown) }).toString();
    try { this.socket = factory(url.href, ['tts', `bearer.${key}`]); }
    catch { throw new WorkbaseError('unavailable', '流式播报连接失败'); }
    this.socket.binaryType = 'arraybuffer';
    this.socket.addEventListener('open', this.open);
    this.socket.addEventListener('message', this.message);
    this.socket.addEventListener('close', this.close);
    this.socket.addEventListener('error', this.close);
    signal.addEventListener('abort', this.abort, { once: true });
    this.after(15000, () => { if (this.socket.readyState !== 1) this.fail('流式播报连接超时'); });
    this.after(30 * 60 * 1000, () => this.fail('流式播报超过时长限制'));
    if (signal.aborted) this.abort();
  }
  private after(ms: number, callback: () => void) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.closed) callback(); }, ms);
    timer.unref(); this.timers.add(timer); return timer;
  }
  private open = () => {
    this.frame({ event: 'ready', id: this.id });
    // 官方服务端发WebSocket控制帧ping，原生WebSocket自动回复pong。
    this.resetIdle();
  };
  private resetIdle() {
    if (this.idle) { clearTimeout(this.idle); this.timers.delete(this.idle); }
    this.idle = this.after(this.finishedText ? 45000 : 55000, () => this.fail('流式播报等待超时'));
  }
  private frame(value: unknown) {
    if (this.closed) return;
    const bytes = new TextEncoder().encode(`${JSON.stringify(value)}\n`);
    if ((this.output.desiredSize ?? 0) < bytes.byteLength) { this.fail('流式播报缓冲超过上限', false); return; }
    this.output.enqueue(bytes);
  }
  private message = (event: Event) => {
    if (this.closed) return;
    const data: unknown = (event as MessageEvent).data;
    if (data instanceof ArrayBuffer) {
      if (this.finishedText) this.resetIdle();
      this.audioBytes += data.byteLength;
      if (this.audioBytes > 30 * 60 * 24000 * 2 || data.byteLength > 1024 * 1024)
        return this.fail('流式播报音频超过上限');
      this.frame({ event: 'audio', data: Buffer.from(data).toString('base64') }); return;
    }
    try {
      if (typeof data !== 'string' || data.length > 8192) throw new Error();
      const message = JSON.parse(data) as { event?: string; code?: string };
      if (message.event === 'finish') {
        if (message.code !== 'success' || !this.finishedText || !this.audioBytes)
          this.fail('流式语音合成失败');
        else { this.frame({ event: 'end' }); this.end(); }
      }
    } catch { this.fail('流式播报返回无效数据'); }
  };
  private close = () => this.fail('流式播报连接提前中断');
  private abort = () => this.fail('播报已停止');
  push(seq: number, text: string, finish: boolean) {
    if (this.closed || this.socket.readyState !== 1 || this.finishedText)
      throw new WorkbaseError('unavailable', '流式播报连接不可用');
    if (seq !== this.seq) throw new WorkbaseError('conflict', '流式播报文字序号不连续');
    let characters = this.characters;
    for (const char of text) characters += /\p{Script=Han}/u.test(char) ? 2 : 1;
    const bytes = this.textBytes + Buffer.byteLength(text);
    if (characters > 10000 || bytes > 64 * 1024) {
      this.fail('回复超过官方 10000 计费字符或 64KiB 限制');
      throw new WorkbaseError('invalid', '回复超过官方 10000 计费字符或 64KiB 限制');
    }
    this.seq++; this.characters = characters; this.textBytes = bytes; this.resetIdle();
    try {
      if (text) this.socket.send(JSON.stringify({ event: 'text', text }));
      if (finish) {
        this.finishedText = true; this.resetIdle();
        this.socket.send(JSON.stringify({ event: 'finish_text' }));
      }
    } catch { this.fail('流式播报连接中断'); throw new WorkbaseError('unavailable', '流式播报连接中断'); }
  }
  cancel() { this.abort(); }
  private fail(message: string, emit = true) {
    if (this.closed) return;
    if (emit) {
      const bytes = new TextEncoder().encode(`${JSON.stringify({ event: 'error', message })}\n`);
      if ((this.output.desiredSize ?? 0) >= bytes.byteLength) this.output.enqueue(bytes);
    }
    this.end();
  }
  private end() {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear(); this.signal.removeEventListener('abort', this.abort);
    this.socket.removeEventListener('open', this.open);
    this.socket.removeEventListener('message', this.message);
    this.socket.removeEventListener('close', this.close);
    this.socket.removeEventListener('error', this.close);
    try { this.socket.close(); } catch { /* 连接已关闭。 */ }
    try { this.output.close(); } catch { /* 下游已取消。 */ }
    this.released();
  }
}
