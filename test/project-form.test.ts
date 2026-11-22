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
      require: (id: string) => id === 'react' ? { ...react, useRef: (current: unknown) => ({ current }),
        useState: (initial: unknown) => [seeds.length ? seeds.shift() : initial, () => {}] } : require(id),
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

test('添加项目不显示初始化配置，失败保留表单且重复提交只执行一次', async () => {
  const output = await build({ entryPoints: ['src/client/Workbase.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  for (const mode of ['existing', 'new']) {
    const seeds: unknown[] = ['/existing', 'new-project', mode, false];
    const require = createRequire(import.meta.url), react = require('react');
    const module = { exports: {} as { AddProject(props: any): any } };
    runInNewContext(output.outputFiles[0]!.text, {
      module, exports: module.exports,
      require: (id: string) => id === 'react' ? { ...react, useRef: (current: unknown) => ({ current }),
        useState: (initial: unknown) => [seeds.length ? seeds.shift() : initial, () => {}] } : require(id),
    });
    const calls: unknown[][] = [];
    let resolve!: (ok: boolean) => void, closed = false;
    const tree = module.exports.AddProject({ api: {}, root: '/root', busy: false,
      save: (...args: unknown[]) => { calls.push(args); return new Promise<boolean>(done => { resolve = done; }); },
      onClose: () => { closed = true; } });
    const html = renderToStaticMarkup(tree);
    assert.doesNotMatch(html, /初始化模板|初始化 Git|提交规则|将创建的文件/);
    tree.props.onSubmit({ preventDefault() {} });
    tree.props.onSubmit({ preventDefault() {} });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.[0], mode === 'new' ? '/root' : '/existing');
    assert.equal(calls[0]?.[1], mode === 'new' ? 'new-project' : undefined);
    assert.equal(calls[0]?.length, 2);
    resolve(false); await Promise.resolve(); await Promise.resolve();
    assert.equal(closed, false);
    tree.props.onSubmit({ preventDefault() {} });
    assert.equal(calls.length, 2);
    resolve(true); await Promise.resolve(); await Promise.resolve();
    assert.equal(closed, true);
  }
});

test('创建表单只传位置与名称，由服务端读取已保存默认值', async () => {
  const output = await build({ entryPoints: ['src/client/Workbase.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  for (const mode of ['existing', 'new']) {
    const seeds: unknown[] = ['/existing', 'new-project', mode, false];
    const require = createRequire(import.meta.url), react = require('react');
    const module = { exports: {} as { AddProject(props: any): any } };
    runInNewContext(output.outputFiles[0]!.text, {
      module, exports: module.exports,
      require: (id: string) => id === 'react' ? { ...react, useRef: (current: unknown) => ({ current }),
        useState: (initial: unknown) => [seeds.length ? seeds.shift() : initial, () => {}] } : require(id),
    });
    let called: unknown[] | undefined;
    const tree = module.exports.AddProject({ api: {}, root: '/root', busy: false,
      save: async (...args: unknown[]) => { called = args; return true; }, onClose() {} });
    tree.props.onSubmit({ preventDefault() {} }); await Promise.resolve();
    assert.deepEqual(called, mode === 'new' ? ['/root', 'new-project'] : ['/existing', undefined]);
  }
});
