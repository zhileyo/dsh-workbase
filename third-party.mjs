import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

// 只收集 esbuild 确认内嵌的包，external 的宿主和 React 不算入本包。
export async function collectThirdPartyNotices(metafiles, root) {
  const packages = new Map();
  for (const meta of metafiles) for (const input of Object.keys(meta.inputs)) {
    if (!input.split(/[\\/]/).includes('node_modules')) continue;
    let directory = dirname(resolve(root, input));
    while (directory !== dirname(directory)) {
      try {
        const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        if (pkg.name && pkg.version) { packages.set(directory, pkg); break; }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      directory = dirname(directory);
    }
  }
  const sections = [];
  for (const [directory, pkg] of [...packages].sort((a, b) =>
    `${a[1].name}@${a[1].version}`.localeCompare(`${b[1].name}@${b[1].version}`, 'en'))) {
    const names = (await readdir(directory)).filter(name => /^(?:licen[cs]e|copying|notice)(?:[.-]|$)/i.test(name)).sort();
    if (!names.some(name => /^(?:licen[cs]e|copying)/i.test(name))) {
      throw new Error(`内嵌依赖缺少许可正文：${pkg.name}@${pkg.version}`);
    }
    const texts = await Promise.all(names.map(async name => `${name}\n\n${await readFile(join(directory, name), 'utf8')}`));
    sections.push(`## ${pkg.name}@${pkg.version}\n\n声明许可：${pkg.license ?? '见下方原文'}\n来源：${directory.split(sep).join('/').slice(resolve(root).length + 1)}\n\n${texts.join('\n\n')}`);
  }
  return `# 内嵌第三方软件许可\n\n由 build.mjs 根据两端 esbuild 输入生成；各库保留其原始版权、许可与 NOTICE。工作台自身许可见 LICENSE。\n\n${sections.join('\n\n---\n\n')}\n`;
}
