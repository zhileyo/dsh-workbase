/** 有界PCM播放器：24kHz、16位单声道，保留跨帧半个采样。 */
export class SpeechPcm {
  private tail?: number;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private stopped = false;
  private waits = new Set<() => void>();
  constructor(private readonly context: AudioContext = new AudioContext()) {}
  async resume() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.context.resume(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('自动播放受阻，请点击重播')), 1500);
      })]);
      if (this.context.state !== 'running') throw new Error('自动播放受阻，请点击重播');
    } finally { clearTimeout(timer); }
  }
  async write(bytes: Uint8Array) {
    if (this.stopped) return;
    const data = new Uint8Array(bytes.length + (this.tail === undefined ? 0 : 1));
    if (this.tail !== undefined) data[0] = this.tail;
    data.set(bytes, this.tail === undefined ? 0 : 1);
    this.tail = data.length % 2 ? data[data.length - 1] : undefined;
    const view = new DataView(data.buffer);
    for (let offset = 0; offset + 1 < data.length;) {
      while (!this.stopped && this.next - this.context.currentTime > 4) await this.wait(30);
      if (this.stopped) return;
      const count = Math.min(6000, Math.floor((data.length - offset) / 2));
      const buffer = this.context.createBuffer(1, count, 24000);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) samples[i] = view.getInt16(offset + 2 * i, true) / 32768;
      offset += count * 2;
      const source = this.context.createBufferSource();
      source.buffer = buffer; source.connect(this.context.destination);
      source.onended = () => { this.sources.delete(source); source.disconnect(); };
      this.sources.add(source);
      this.next = Math.max(this.next, this.context.currentTime + 0.08);
      source.start(this.next); this.next += buffer.duration;
    }
  }
  async finish() {
    if (this.tail !== undefined) throw new Error('流式播报返回无效数据');
    while (!this.stopped && this.sources.size) await this.wait(30);
  }
  private wait(ms: number) {
    return new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); this.waits.delete(done); resolve(); };
      const timer = setTimeout(done, ms); this.waits.add(done);
    });
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch { /* 音频已经结束。 */ }
    }
    this.sources.clear(); for (const wake of this.waits) wake();
    void this.context.close().catch(() => {});
  }
}
