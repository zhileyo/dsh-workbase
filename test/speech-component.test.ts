import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayback } from '../src/client/speech-playback.js';
import { SpeechComponent } from '../src/client/speech-component.js';
import { defaultSpeech } from '../src/shared/speech.js';

test('组件默认关闭不读取配置，开启后读取，关闭停止音频并保留已存播报配置', async () => {
  const commands: string[] = [];
  const status = { config: { ...defaultSpeech(), provider: 'compatible' as const, enabled: true,
    endpoint: 'https://example.com/speech' }, available: true, hasKey: true, version: 'v1' };
  const playback = new SpeechPlayback(async command => {
    commands.push(command.op);
    if (command.op === 'speech-status') return status;
    return new Promise(() => {});
  });
  const feature = new SpeechComponent(playback);
  const target = new EventTarget();
  const disconnect = feature.connect(target);
  try {
    assert.equal(feature.getSnapshot(), false);
    target.dispatchEvent(new Event('focus'));
    assert.deepEqual(commands, []);
    feature.setEnabled(true);
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(commands, ['speech-status']);
    playback.enqueue('回复', 's');
    assert.equal(playback.playing, true);
    feature.setEnabled(false);
    assert.equal(playback.playing, false);
    assert.equal(playback.status.config.enabled, true);
    target.dispatchEvent(new Event('focus'));
    assert.deepEqual(commands, ['speech-status', 'speech-synthesize']);
  } finally { disconnect(); feature.dispose(); }
});
