import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadCatppuccin } from '../src/server/terminal-palette.js';
import { CATPPUCCIN_REVISION, flavours } from '../src/shared/terminal-palette.js';

const keys: Record<string, string> = {
  base: '#1e1e2e', text: '#cdd6f4', rosewater: '#f5e0dc', surface1: '#45475a', surface2: '#585b70',
  subtext0: '#a6adc8', subtext1: '#bac2de', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
  blue: '#89b4fa', mauve: '#cba6f7', teal: '#94e2d5',
};

function palette(overrides: Record<string, unknown> = {}) {
  return {
    ...Object.fromEntries(flavours.map(flavour => [flavour, { colors: Object.fromEntries(Object.entries(keys).map(([key, hex]) => [key, { hex }])) }])),
    ...overrides,
  };
}

function streamOf(chunks: string[]) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  }), { status: 200 });
}

const signal = () => new AbortController().signal;

test('Catppuccin 色板下载按官方结构落地四套配色', async () => {
  const result = await downloadCatppuccin(signal(), async () => streamOf([JSON.stringify(palette())]));
  assert.equal(result.sourceRevision, CATPPUCCIN_REVISION);
  for (const flavour of flavours) {
    assert.equal(result.catppuccin[flavour].background, keys.base);
    assert.equal(result.catppuccin[flavour].brightMagenta, keys.mauve);
  }
});

test('Catppuccin 色板下载拒绝非 200、缺配色、缺色键与超限体积', async () => {
  await assert.rejects(downloadCatppuccin(signal(), async () => new Response('', { status: 503 })), /下载失败/);
  await assert.rejects(downloadCatppuccin(signal(), async () => new Response(null, { status: 200 })), /不完整/);
  const missingFlavour = palette(); delete (missingFlavour as Record<string, unknown>)[flavours[0]!];
  await assert.rejects(downloadCatppuccin(signal(), async () => streamOf([JSON.stringify(missingFlavour)])), /不完整/);
  const missingKey = palette();
  delete (missingKey as any)[flavours[0]!].colors.rosewater;
  await assert.rejects(downloadCatppuccin(signal(), async () => streamOf([JSON.stringify(missingKey)])), /不完整/);
  const broken = ['{"latte":'];
  await assert.rejects(downloadCatppuccin(signal(), async () => streamOf(broken)), /不完整/);
  const oversized = ['{"pad":"', 'x'.repeat(300 * 1024), '"}'];
  await assert.rejects(downloadCatppuccin(signal(), async () => streamOf(oversized)), /过大/);
});

test('Catppuccin 结构不合法带独立错误码，不被 rpc 报成参数不合法', async () => {
  const rejected = await downloadCatppuccin(signal(), async () => streamOf(['{"latte":{}}'])).then(() => null, error => error);
  assert.equal((rejected as { code?: string } | null)?.code, 'palette-incomplete');
  assert.match(String((rejected as Error | null)?.message), /色板不完整/);
});

test('Catppuccin 色板下载把请求中止与超时原样抛出，不改写成格式错误', async () => {
  const aborted = new AbortController();
  const failure = new DOMException('已取消', 'AbortError');
  const pending = downloadCatppuccin(aborted.signal, async (_input, init) => {
    const reason = (init?.signal as AbortSignal | undefined);
    return new Promise<Response>((_resolve, reject) => {
      reason?.addEventListener('abort', () => reject(failure), { once: true });
    });
  });
  aborted.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
});
