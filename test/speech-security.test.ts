import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speech, type SpeechVault } from '../src/server/speech.js';
import { defaultSpeech } from '../src/shared/speech.js';
import { SpeechSave } from '../src/client/speech-save.js';

function setup(request?: typeof fetch) {
  let record: unknown;
  const vault: SpeechVault = { readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); } };
  return new Speech(() => vault, request);
}
test('旧格式缺少凭据归属证据时不继续发送密钥，显式重新填写后恢复认证', async () => {
  let record: unknown = { kind: 'grant', payload: {
    config: { ...defaultSpeech(), provider: 'compatible', enabled: true, endpoint: 'https://example.com/speech', voice: 'alloy' },
    key: 'unbound-synthetic',
  } };
  let authorization: string | undefined;
  const speech = new Speech(() => ({
    readRecord: async () => record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  }), async (_url, init) => {
    authorization = (init?.headers as Record<string, string>).Authorization;
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } });
  });
  const status = await speech.status();
  assert.equal(status.hasKey, false);
  await speech.synthesize('hello', new AbortController().signal);
  assert.equal(authorization, undefined);
  await speech.save(status.version, status.config, 'reentered-synthetic');
  await speech.synthesize('hello', new AbortController().signal);
  assert.equal(authorization, 'Bearer reentered-synthetic');
});
test('供应商与跨源切换清除旧凭据，同源路径修改保留；新凭据只发往新源', async () => {
  const headers: Record<string, string>[] = [];
  const speech = setup(async (_url, init) => {
    headers.push(init?.headers as Record<string, string>);
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } });
  });
  let status = await speech.save(null, { ...defaultSpeech(), enabled: true }, 'synthetic-old');
  status = await speech.save(status.version, { ...status.config, provider: 'compatible',
    endpoint: 'https://example.com/speech', voice: 'alloy' });
  assert.equal(status.hasKey, false);
  await speech.synthesize('hello', new AbortController().signal);
  assert.equal(headers[0]?.Authorization, undefined);
  status = await speech.save(status.version, status.config, 'synthetic-new');
  await speech.synthesize('hello', new AbortController().signal);
  assert.equal(headers[1]?.Authorization, 'Bearer synthetic-new');
  status = await speech.save(status.version, { ...status.config, endpoint: 'https://example.com/another' });
  assert.equal(status.hasKey, true);
  status = await speech.save(status.version, { ...status.config, endpoint: 'https://other.example/speech' });
  assert.equal(status.hasKey, false);
  await assert.rejects(speech.save(status.version, { ...defaultSpeech(), enabled: true }), /DeepSeek API Key/);
});

test('语音草稿改变供应商或源时丢弃未保存密钥并重新判断已有凭据', async () => {
  const speech = setup();
  const status = await speech.save(null, { ...defaultSpeech(), enabled: true }, 'synthetic-old');
  const draft = new SpeechSave(async () => status, () => {});
  await draft.load();
  draft.key = 'unsaved-synthetic';
  draft.config = { ...draft.config, provider: 'compatible', endpoint: 'https://example.com/speech', voice: 'alloy' };
  assert.equal(draft.key, '');
  draft.config = { ...defaultSpeech(), enabled: true };
  draft.config = { ...draft.config, provider: 'compatible', endpoint: 'https://example.com/speech', voice: 'alloy' };
  draft.key = 'compatible-synthetic';
  draft.config = { ...defaultSpeech(), enabled: true };
  assert.equal(draft.key, '');
});

for (const operation of ['save', 'dispose'] as const) test(`非流式请求在${operation}后取消且不返回旧音频`, async () => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let upstream: AbortSignal | undefined;
  const speech = setup(async (_url, init) => {
    upstream = init?.signal as AbortSignal;
    started();
    return await new Promise<Response>((_resolve, reject) => {
      upstream!.addEventListener('abort', () => reject(upstream!.reason), { once: true });
    });
  });
  const status = await speech.save(null, { ...defaultSpeech(), enabled: true }, 'synthetic');
  const pending = speech.synthesize('hello', new AbortController().signal);
  const rejection = assert.rejects(pending, /停止|修改|就绪/);
  await ready;
  if (operation === 'save') await speech.save(status.version, { ...status.config, enabled: false });
  else speech.dispose();
  assert.equal(upstream?.aborted, true);
  await rejection;
});

test('延迟凭据读回遇到配置更新不发送旧凭据', async () => {
  let record: unknown; let release!: (value: unknown) => void; let reads = 0; let requests = 0;
  const vault: SpeechVault = {
    readRecord: async () => ++reads === 1 ? await new Promise(resolve => { release = resolve; }) : record,
    modifyRecord: async (_key, update) => { record = await update(record); },
  };
  const speech = new Speech(() => vault, async () => { requests++; return new Response(); });
  const status = await speech.save(null, { ...defaultSpeech(), enabled: true }, 'synthetic');
  const old = record;
  const pending = speech.synthesize('hello', new AbortController().signal);
  const rejection = assert.rejects(pending, /停止|修改/);
  await speech.save(status.version, { ...status.config, enabled: false });
  release(old);
  await rejection;
  assert.equal(requests, 0);
});
