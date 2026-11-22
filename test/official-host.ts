import { openSync, readSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface Entry { files?: Record<string, Entry>; offset?: string; size?: number; unpacked?: boolean }

/** 只读取实际桌面安装包，复制公开模块至临时测试目录；不加载用户 profile。 */
export async function copyOfficialPackages(home: string, packages: string[]) {
  const archive = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
  const fd = openSync(archive, 'r'), header = Buffer.alloc(16);
  try {
    readSync(fd, header, 0, 16, 0);
    const raw = Buffer.alloc(header.readUInt32LE(12)); readSync(fd, raw, 0, raw.length, 16);
    const entries = new Map<string, Entry>();
    const walk = (entry: Entry, name = '') => {
      for (const [key, value] of Object.entries(entry.files ?? {})) {
        const full = name ? `${name}/${key}` : key;
        if (value.files) walk(value, full); else entries.set(full, value);
      }
    };
    walk(JSON.parse(raw.toString()) as Entry);
    const root = 'dsh/node_modules/', seen = new Set<string>();
    const text = async (name: string) => {
      const entry = entries.get(name);
      if (!entry) throw new Error(`官方包文件缺失: ${name}`);
      if (entry.unpacked) return readFile(`${archive}.unpacked/${name}`, 'utf8');
      const data = Buffer.alloc(entry.size ?? 0);
      readSync(fd, data, 0, data.length, 8 + header.readUInt32LE(4) + Number(entry.offset));
      return data.toString();
    };
    const copy = async (name: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      const prefix = `${root}${name}/`;
      if (!entries.has(`${prefix}package.json`)) throw new Error(`官方运行时依赖缺失: ${name}`);
      const imports = new Set<string>();
      for (const filename of entries.keys()) {
        if (!filename.startsWith(prefix) || !/\.(?:[cm]?js|json)$/.test(filename)) continue;
        const value = await text(filename), target = join(home, 'node_modules', filename.slice(root.length));
        await mkdir(dirname(target), { recursive: true }); await writeFile(target, value);
        if (/\.[cm]?js$/.test(filename)) for (const match of value.matchAll(/(?:from\s*|import\s*(?:\(\s*)?|require\(\s*)["']([^"']+)["']/g)) {
          const specifier = match[1]!;
          if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) continue;
          const parts = specifier.split('/');
          const dependency = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
          if (entries.has(`${root}${dependency}/package.json`)) imports.add(dependency);
        }
      }
      for (const dependency of imports) await copy(dependency);
    };
    for (const name of packages) await copy(name);
  } finally { closeSync(fd); }
}
