import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { syncPrototypeUi } from './sync-ui.mjs';
import { clientLocalization } from './localize-ui.mjs';
await syncPrototypeUi();
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await mkdir(new URL('./lib/', import.meta.url), { recursive: true });
await build({
  entryPoints: ['src/server/index.ts'], outfile: 'dist/index.js',
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: ['@deepseek-ai/*'], sourcemap: true,
});
const result = await build({
  entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'browser', format: 'cjs',
  target: 'es2022', jsx: 'automatic', minify: true, write: false,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  loader: { '.css': 'text' },
  plugins: [clientLocalization],
});
const code = result.outputFiles[0].text;
await writeFile(new URL('./lib/client.js', import.meta.url),
  `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:function(require){var module={exports:{}};var exports=module.exports;\n${code}\nreturn module.exports.default||module.exports;}});\n`);
console.log(`工作台构建完成：宿主 dist/index.js，客户端 lib/client.js（${code.length} 字符）`);
