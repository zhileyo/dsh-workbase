import { z } from 'zod';
import { CATPPUCCIN_REVISION, catppuccinSchema, flavours, type TerminalColors } from '../shared/terminal-palette.js';
import { WorkbaseError } from '../shared/model.js';

// 固定官方版本，不接受任意URL。下载仅返回草稿，保存成功前不改变当前配置。
// fetcher 可注入：下载链路每条错误分支都要能被用例直接驱动，测试不触网。
// 远端响应是外部输入，解析失败一律包成带独立 code 的 WorkbaseError，
// 不把 ZodError / SyntaxError / TimeoutError 原样抛给 rpc 的统一映射（会被报成「参数不合法」）。
export async function downloadCatppuccin(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://raw.githubusercontent.com/catppuccin/palette/${CATPPUCCIN_REVISION}/palette.json`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: 'error',
  });
  if (!response.ok) throw new WorkbaseError('palette-download', 'Catppuccin 下载失败，请重试。');
  const reader = response.body?.getReader();
  if (!reader) throw new WorkbaseError('palette-incomplete', 'Catppuccin 色板不完整。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 262144) { await reader.cancel(); throw new WorkbaseError('palette-too-large', 'Catppuccin 色板过大。'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  let source: Record<string, unknown>;
  try {
    source = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { throw new WorkbaseError('palette-incomplete', 'Catppuccin 色板不完整。'); }
  const result: Record<string, TerminalColors> = {};
  for (const flavour of flavours) {
    const parsed = z.object({ colors: z.record(z.string(), z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })) }).safeParse(source[flavour]);
    if (!parsed.success) throw new WorkbaseError('palette-incomplete', 'Catppuccin 色板不完整。');
    const data = parsed.data;
    const get = (key: string) => {
      const value = data.colors[key]?.hex;
      if (!value) throw new WorkbaseError('palette-incomplete', 'Catppuccin 色板不完整。');
      return value;
    };
    result[flavour] = {
      background: get('base'), foreground: get('text'), cursor: get('rosewater'), selectionBackground: get('surface1'),
      black: get('surface1'), red: get('red'), green: get('green'), yellow: get('yellow'),
      blue: get('blue'), magenta: get('mauve'), cyan: get('teal'), white: get('subtext1'),
      brightBlack: get('surface2'), brightRed: get('red'), brightGreen: get('green'), brightYellow: get('yellow'),
      brightBlue: get('blue'), brightMagenta: get('mauve'), brightCyan: get('teal'), brightWhite: get('subtext0'),
    };
  }
  return { catppuccin: catppuccinSchema.parse(result), sourceRevision: CATPPUCCIN_REVISION };
}
