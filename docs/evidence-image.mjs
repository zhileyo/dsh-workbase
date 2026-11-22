import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
let encoder;
async function findEncoder() {
  if (!encoder) encoder = (async () => {
    for (const [command, args] of [['cwebp', ['-version']], ['magick', ['-version']], ['uv', ['--version']]]) {
      try { await exec(command, args); return command; } catch {}
    }
    throw new Error('截图编码需要 cwebp、ImageMagick 或 uv（Pillow）');
  })();
  return encoder;
}

export async function encodeWebp(bytes, output, quality = 82) {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('WebP 质量必须为 1–100');
  await mkdir(dirname(output), { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-image-'));
  try {
    const input = join(temporary, 'input.png'), encoded = join(temporary, 'output.webp');
    await writeFile(input, bytes);
    const command = await findEncoder();
    if (command === 'cwebp') await exec(command, ['-quiet', '-q', String(quality), input, '-o', encoded]);
    else if (command === 'magick') await exec(command, [input, '-quality', String(quality), encoded]);
    else await exec('uv', ['run', '--no-project', '--with', 'pillow', 'python', '-c',
      'from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=int(sys.argv[3]))',
      input, encoded, String(quality)]);
    const result = await readFile(encoded);
    if (result.subarray(0, 4).toString() !== 'RIFF' || result.subarray(8, 12).toString() !== 'WEBP') throw new Error('编码器未返回有效 WebP');
    // 临时输出与目标位于同目录，避免跨卷 rename。
    const staged = join(dirname(output), `.evidence-${temporary.split(/[\\/]/).at(-1)}.webp`);
    try { await writeFile(staged, result); await rename(staged, output); }
    finally { await rm(staged, { force: true }); }
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function screenshotWebp(target, output, options = {}) {
  const { path: _path, type: _type, quality: _quality, ...capture } = options;
  await encodeWebp(await target.screenshot({ ...capture, type: 'png' }), output);
}
