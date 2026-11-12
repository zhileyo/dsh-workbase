import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';

test('项目两种提交路径只校验当前模式，隐藏必填字段不拦截提交', async () => {
  const output = await build({ entryPoints: ['src/client/Workbase.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  for (const mode of ['existing', 'new']) {
    const seeds: unknown[] = ['/existing', 'new-project', mode, false];
    const require = createRequire(import.meta.url);
    const react = require('react');
    const module = { exports: {} as { AddProject(props: any): any } };
    runInNewContext(output.outputFiles[0]!.text, {
      module, exports: module.exports,
      require: (id: string) => id === 'react' ? { ...react, useState: (initial: unknown) => [seeds.length ? seeds.shift() : initial, () => {}] } : require(id),
    });
    let called: unknown[] | undefined, closed = false;
    const tree = module.exports.AddProject({ api: { pickDirectory: async () => null }, root: '/root', busy: false,
      save: async (...args: unknown[]) => { called = args; return true; }, onClose: () => { closed = true; } });
    const html = renderToStaticMarkup(tree);
    const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(m => m[0]);
    assert.equal(inputs.filter(i => i.includes('required') && !i.includes('disabled')).length, 1);
    assert.ok(inputs[mode === 'existing' ? 1 : 0]!.includes('disabled'));
    tree.props.onSubmit({ preventDefault() {} });
    await Promise.resolve();
    assert.deepEqual(called, mode === 'existing' ? ['/existing', undefined] : ['/root', 'new-project']);
    assert.equal(closed, true);
  }
});
