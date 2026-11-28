import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitsRequestLimit } from '../src/client/api.js';
import { RPC_ENDPOINT } from '../src/shared/commands.js';
import type { Command } from '../src/shared/commands.js';
import { MAX_RPC_REQUEST_BYTES } from '../src/shared/project-rules.js';

// 这里只关心体积，不关心命令字段是否齐全，按体积样本构造即可。
const command = (value: Record<string, unknown>) => value as unknown as Command;
const envelopeBytes = (value: Record<string, unknown>, method: string) => Buffer.byteLength(JSON.stringify({
  type: 'client-request',
  rpcId: '00000000-0000-4000-8000-000000000000',
  method,
  payload: value,
}));

test('请求体积判定与实际信封字节数一致，且不会把超限请求放过去', () => {
  const cases = [
    { op: 'snapshot' },
    { op: 'extensions', module: 'rss', method: 'snapshot', input: { query: '订阅' } },
    { op: 'submit-message', text: `emoji 😀 与汉字 ${'x'.repeat(1024)}` },
  ];
  for (const value of cases) {
    const limit = envelopeBytes(value, RPC_ENDPOINT);
    assert.equal(fitsRequestLimit(command(value), RPC_ENDPOINT, limit), true);
    assert.equal(fitsRequestLimit(command(value), RPC_ENDPOINT, limit - 1), false);
  }
});

test('大体积纯 ASCII 与多字节正文都在上限处被拦下', () => {
  const ascii = { op: 'submit-message', text: 'a'.repeat(MAX_RPC_REQUEST_BYTES) };
  assert.equal(fitsRequestLimit(command(ascii), RPC_ENDPOINT, MAX_RPC_REQUEST_BYTES), false);
  const cjk = { op: 'submit-message', text: '汉'.repeat(Math.ceil(MAX_RPC_REQUEST_BYTES / 2)) };
  assert.equal(fitsRequestLimit(command(cjk), RPC_ENDPOINT, MAX_RPC_REQUEST_BYTES), false);
  const small = { op: 'submit-message', text: '汉'.repeat(16) };
  assert.equal(fitsRequestLimit(command(small), RPC_ENDPOINT, envelopeBytes(small, RPC_ENDPOINT)), true);
});

test('孤立代理不会让体积判定低估真实字节数', () => {
  const value = { op: 'submit-message', text: `\ud800${'x'.repeat(8)}` };
  const actual = envelopeBytes(value, RPC_ENDPOINT);
  assert.equal(fitsRequestLimit(command(value), RPC_ENDPOINT, actual), true);
  assert.equal(fitsRequestLimit(command(value), RPC_ENDPOINT, actual - 1), false);
});