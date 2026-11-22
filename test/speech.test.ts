import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speech, type SpeechVault } from '../src/server/speech.js';
import { defaultSpeech, speechConfigSchema } from '../src/shared/speech.js';
import { SpeechTurns } from '../src/client/speech-turns.js';

test('播报配置凭据保持私有，版本冲突拒绝覆盖，请求不跟随重定向', async () => {
  let record: unknown;
  const vault: SpeechVault = {
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  };
  let request: RequestInit | undefined;
  const speech = new Speech(() => vault, async (_url, init) => {
    request = init;
    return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/mpeg' } });
  });
  const initial = await speech.status();
  const saved = await speech.save(initial.version, { ...defaultSpeech(), provider: 'compatible', enabled: true,
    endpoint: 'https://example.com/v1/audio/speech' }, 'private-key');
  assert.equal(saved.hasKey, true);
  assert.ok(!JSON.stringify(saved).includes('private-key'));
  await assert.rejects(speech.save(initial.version, saved.config), /外部修改/);
  const audio = await speech.synthesize('你好', new AbortController().signal);
  assert.equal(audio.mime, 'audio/mpeg');
  assert.equal(request?.redirect, 'error');
  assert.equal((request?.headers as Record<string, string>).Authorization, 'Bearer private-key');
});

test('禁用与错误响应不返回音频或服务端秘密', async () => {
  let record: unknown;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async () => new Response('provider-secret', { status: 401 }));
  await assert.rejects(speech.synthesize('hello', new AbortController().signal), /未启用/);
  const status = await speech.status();
  await speech.save(status.version, { ...defaultSpeech(), provider: 'compatible', enabled: true, endpoint: 'https://example.com/speech' });
  await assert.rejects(speech.synthesize('hello', new AbortController().signal), error =>
    error instanceof Error && /401/.test(error.message) && !error.message.includes('provider-secret'));
});

test('手动播放可使用已关闭自动播报的配置，默认合成仍拒绝，未配置仍拒绝', async () => {
  let record: unknown;
  let requests = 0;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async () => { requests++; return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } }); });
  const signal = new AbortController().signal;
  await assert.rejects(speech.synthesize('回复', signal, true), /未启用/);
  await speech.save(null, { ...defaultSpeech(), provider: 'compatible', endpoint: 'https://example.com/speech' });
  await assert.rejects(speech.synthesize('回复', signal), /未启用/);
  await speech.synthesize('回复', signal, true);
  assert.equal(requests, 1);
});

test('超大音频在读流时终止，无凭据服务时不另存敏感配置', async () => {
  await assert.rejects(new Speech(() => undefined).save(null, defaultSpeech(), 'secret'), /凭据存储不可用/);
  let record: unknown;
  let cancelled = false;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'audio/mpeg' } }));
  await speech.save(null, { ...defaultSpeech(), provider: 'compatible', enabled: true, endpoint: 'https://example.com/speech' });
  await assert.rejects(speech.synthesize('hello', new AbortController().signal), /大小上限/);
  assert.equal(cancelled, true);
});

test('仅完整回合播报正文，工具中间输出、推理、取消和重复事件不触发', () => {
  const turns = new SpeechTurns();
  const event = (type: string, seq: number, data: unknown) => ({ type: 'event' as const, event: { type, seq, data } });
  const first = event('assistant/message', 2, { turn: 1, message: { content: [
    { type: 'text', text: '完成' }, { type: 'reasoning', text: '内部推理' },
  ] } });
  assert.equal(turns.accept(first), undefined);
  const end = event('turn/end', 3, { turn: 1, reason: { kind: 'completed' } });
  assert.equal(turns.accept(end), '完成');
  assert.equal(turns.accept(end), undefined);
  turns.accept(event('assistant/message', 4, { turn: 2, interrupted: true, message: { content: [{ type: 'text', text: '取消片段' }] } }));
  assert.equal(turns.accept(event('turn/end', 5, { turn: 2, reason: { kind: 'aborted' } })), undefined);
});

test('新配置默认官方TTS，旧配置继续使用兼容协议', async () => {
  assert.equal(defaultSpeech().provider, 'deepseek');
  assert.equal(defaultSpeech().endpoint, 'https://api.deepseek.com/v1/tools/tts');
  assert.equal(defaultSpeech().voice, 'stella');
  const legacy = { enabled: true, endpoint: 'https://example.com/speech', model: 'custom', voice: 'alloy', speed: 1.5 };
  assert.equal(speechConfigSchema.parse(legacy).provider, 'compatible');
  let record: unknown = { kind: 'grant', payload: { config: legacy, key: 'legacy-key' } };
  let body: unknown;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } });
  });
  await speech.synthesize('hello', new AbortController().signal);
  assert.deepEqual(body, { model: 'custom', voice: 'alloy', speed: 1.5, input: 'hello', response_format: 'mp3' });
});

test('官方TTS使用Bearer与WAV协议，音色和Markdown选项按配置发送', async () => {
  let record: unknown; let endpoint: unknown; let request: RequestInit | undefined;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async (url, init) => {
    endpoint = url; request = init;
    return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/wav' } });
  });
  await speech.save(null, { ...defaultSpeech(), enabled: true, voice: 'tide', filterMarkdown: false }, 'test-key');
  const audio = await speech.synthesize('**你好**', new AbortController().signal);
  assert.equal(endpoint, 'https://api.deepseek.com/v1/tools/tts');
  assert.equal((request?.headers as Record<string, string>).Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(String(request?.body)), { text: '**你好**', voice_id: 'tide', format: 'wav', filter_markdown: false });
  assert.equal(audio.mime, 'audio/wav');
  assert.equal(request?.redirect, 'error');
});

test('官方TTS拒绝缺密钥、非法音色及超计费字符，边界内文本可合成', async () => {
  let record: unknown; let requests = 0;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async () => {
    requests++;
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/wav' } });
  });
  await assert.rejects(speech.save(null, { ...defaultSpeech(), enabled: true }), /DeepSeek API Key/);
  assert.equal(record, undefined);
  assert.equal(speechConfigSchema.safeParse({ ...defaultSpeech(), voice: 'alloy' }).success, false);
  await speech.save(null, { ...defaultSpeech(), enabled: true }, 'test-key');
  await assert.rejects(speech.synthesize('汉'.repeat(5001), new AbortController().signal), /10000/);
  await assert.rejects(speech.synthesize(' '.repeat(5), new AbortController().signal), /朗读/);
  assert.equal(requests, 0);
  await speech.synthesize('汉'.repeat(5000), new AbortController().signal);
  await speech.synthesize('a'.repeat(10000), new AbortController().signal);
  assert.equal(requests, 2);
  const status = await speech.status();
  await assert.rejects(speech.save(status.version, status.config, undefined, true), /DeepSeek API Key/);
  assert.equal((await speech.status()).hasKey, true);
});

test('官方音频流中断时不返回部分音频或转用兼容服务', async () => {
  let record: unknown; let requests = 0;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async () => {
    requests++;
    let chunks = 0;
    return new Response(new ReadableStream({
      pull(controller) {
        if (chunks++ === 0) controller.enqueue(new Uint8Array([1]));
        else controller.error(new Error('private-network-error'));
      },
    }), { headers: { 'content-type': 'audio/wav' } });
  });
  await speech.save(null, { ...defaultSpeech(), enabled: true }, 'test-key');
  await assert.rejects(speech.synthesize('hello', new AbortController().signal), /合成失败或超时/);
  assert.equal(requests, 1);
});
