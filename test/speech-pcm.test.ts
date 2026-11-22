import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPcm } from '../src/client/speech-pcm.js';
class Context {
  currentTime = 1; state = 'running';
  destination = {};
  buffers: Float32Array[] = [];
  starts: number[] = [];
  stopped = 0; closed = false;
  sources: { onended: (() => void) | null }[] = [];
  async resume() {}
  async close() { this.closed = true; }
  createBuffer(_channels: number, count: number, rate: number) {
    const data = new Float32Array(count); this.buffers.push(data);
    return { getChannelData: () => data, duration: count / rate };
  }
  createBufferSource() {
    const source = { buffer: undefined, onended: null as (() => void) | null,
      connect() {}, disconnect() {}, start: (time: number) => { this.starts.push(time); },
      stop: () => { this.stopped++; } };
    this.sources.push(source); return source;
  }
}
test('跨帧半采样拼接，PCM小端符号正确，连续调度和停止全部source', async () => {
  const context = new Context(), pcm = new SpeechPcm(context as unknown as AudioContext);
  await pcm.resume();
  await pcm.write(new Uint8Array([0]));
  assert.equal(context.starts.length, 0);
  await pcm.write(new Uint8Array([128, 255, 127, 0, 0]));
  assert.deepEqual([...context.buffers[0]!], [-1, 32767 / 32768, 0]);
  await pcm.write(new Uint8Array([0, 64]));
  assert.equal(context.starts[1], context.starts[0]! + 3 / 24000);
  pcm.stop();
  assert.equal(context.stopped, 2); assert.equal(context.closed, true);
  await pcm.write(new Uint8Array([0, 64]));
  assert.equal(context.starts.length, 2);
});
test('不完整PCM结尾报错；播放提前量有界，停止唤醒背压等待', async () => {
  const context = new Context(), pcm = new SpeechPcm(context as unknown as AudioContext);
  await pcm.write(new Uint8Array([1]));
  await assert.rejects(pcm.finish(), /无效/);
  const pending = pcm.write(new Uint8Array(480000));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(context.starts.length <= 17);
  pcm.stop(); await pending;
});
