import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { encodeWebp } from './evidence-image.mjs';

// 保留原图；只转换证据目录中的 PNG/JPEG，不触碰源码素材。
const root = resolve(process.argv[2] ?? 'docs/ui/verification');
let count = 0;
async function convert(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await convert(path);
    else if (entry.isFile() && /\.(?:png|jpe?g)$/i.test(entry.name)) {
      await encodeWebp(await readFile(path), path.replace(/\.(?:png|jpe?g)$/i, '.webp')); count++;
    }
  }
}
await convert(root);
console.log(`已转换 ${count} 张证据图片为 WebP（原图保留）`);
