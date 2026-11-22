import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { initialState } from '../src/shared/model.js';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const nodes = (node: any): any[] => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children), ...nodes(node.props?.main), ...nodes(node.props?.detail)];

async function panel(defaultSourceId: string, sources: any[], failConfig = false) {
  const output = await build({ entryPoints: ['src/client/SkillsPanel.tsx'], bundle: true, platform: 'node',
    format: 'cjs', jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react'), hooks: any[] = [], effects: any[] = [];
  const candidate = { id: 'market', name: 'market-skill', description: '说明', body: '# 正文', files: ['SKILL.md'] };
  const snapshot = { skills: [], sources, market: [candidate], marketSources: [], summary: {} };
  const calls: any[] = [];
  const api = { async call(command: any) {
    calls.push(command);
    if (command.op === 'snapshot') {
      if (failConfig) throw new Error('配置读取失败');
      const preferences = initialState().preferences;
      preferences.extensionConfig.skills.defaultSourceId = defaultSourceId;
      return { preferences };
    }
    if (command.method === 'market.detail') return candidate;
    if (['save', 'market.install'].includes(command.method)) return { saved: true,
      skill: { ...command.input, id: 'saved' }, message: '已保存', effective: 'effective' };
    if (command.method === 'import.confirm') return { receipts: [], skipped: [], snapshot };
    return snapshot;
  } };
  let cursor = 0;
  const module = { exports: {} as any };
  const effect = (fn: () => any, deps?: any[]) => {
    const i = cursor++, old = effects[i];
    if (!old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index])))
      effects[i] = { fn, deps, cleanup: old?.cleanup, pending: true };
  };
  runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports, AbortController, AbortSignal,
    TextEncoder, structuredClone, URL, Error, setTimeout, clearTimeout,
    requestAnimationFrame: (fn: () => void) => fn(), document: { activeElement: null }, HTMLElement: class {},
    require: (id: string) => id !== 'react' ? require(id) : { ...react,
      useId: () => 'test-field', useEffect: effect, useLayoutEffect: effect,
      useCallback(callback: any, deps: any[]) {
        const i = cursor++, old = hooks[i];
        if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) hooks[i] = { callback, deps };
        return hooks[i].callback;
      },
      useState(initial: any) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
        return [hooks[i], (next: any) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; },
      useRef(current: any) { const i = cursor++; return hooks[i] ??= { current }; },
    },
  });
  const render = () => { cursor = 0; return nodes(module.exports.SkillsPanel({ api, projects: [], onClose() {} })); };
  const settle = async () => {
    render();
    for (const item of effects) if (item?.pending) { item.pending = false; item.cleanup?.(); item.cleanup = item.fn(); }
    await flush(); render();
  };
  await settle(); await settle();
  return { calls, render, settle, close() { for (const item of effects) item?.cleanup?.(); },
    open(kind: string) {
      if (kind === 'market') {
        render().find(n => n.props.role === 'tab' && n.props.children === '技能市场')!.props.onClick();
        render().find(n => n.type === 'button' && n.props.children === '安装')!.props.onClick();
      } else render().find(n => n.type === 'button' && n.props.children?.includes?.('添加技能'))!.props.onClick();
    },
  };
}

const sources = [
  { id: 'dsh', kind: 'dsh', scope: 'global', path: '/test/dsh', writable: true, enabled: true },
  { id: 'agents', kind: 'agents', scope: 'global', path: '/test/agents', writable: true, enabled: true },
];
for (const kind of ['create', 'market', 'return-global']) {
  test(`A20 ${kind}预选和提交遵守已保存的默认来源`, async () => {
    const h = await panel('agents', sources);
    try {
      h.open(kind === 'market' ? 'market' : 'create'); await h.settle();
      const picker = () => h.render().find(n => n.type?.name === 'Picker' && n.props.label === '安装位置')!;
      if (kind === 'return-global') {
        const scope = () => h.render().find(n => n.type?.name === 'SkillScopePicker')!;
        picker().props.onChange('dsh');
        scope().props.onChange(['project']); scope().props.onChange(['global']);
      }
      assert.equal(picker().props.value, 'agents');
      if (kind !== 'market') for (const [label, value] of [['技能名称', 'test-skill'], ['简短说明', '说明'], ['技能正文', '# 正文']])
        h.render().find(n => n.props['aria-label'] === label)!.props.onChange({ target: { value } });
      h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush();
      assert.equal(h.calls.find(c => c.method === (kind === 'market' ? 'market.install' : 'save'))?.input.sourceId, 'agents');
    } finally { h.close(); }
  });
}

test('A20 默认来源缺失或只读才回退到DSH或首个可写全局来源', async () => {
  for (const [id, list, expected] of [['missing', sources, 'dsh'], ['agents', sources.map(s => ({ ...s, writable: s.id !== 'agents' })), 'dsh'],
    ['missing', sources.filter(s => s.id !== 'dsh'), 'agents']] as const) {
    const h = await panel(id, [...list]);
    try { h.open('create'); await h.settle(); assert.equal(h.render().find(n => n.type?.name === 'Picker' && n.props.label === '安装位置')!.props.value, expected); }
    finally { h.close(); }
  }
});

test('A20 配置读取失败不得静默把全局新技能写入DSH', async () => {
  const h = await panel('agents', sources, true);
  try {
    h.open('create'); await h.settle();
    for (const label of ['技能名称', '简短说明', '技能正文'])
      h.render().find(n => n.props['aria-label'] === label)!.props.onChange({ target: { value: 'test' } });
    assert.equal(h.render().find(n => n.type === 'button' && n.props.className === 'primary' && n.props.children === '创建技能')!.props.disabled, true);
    assert.ok(h.render().some(n => n.props.role === 'alert' && String(n.props.children).includes('配置读取失败')));
    h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush();
    assert.equal(h.calls.some(c => c.method === 'save'), false);
  } finally { h.close(); }
});

test('A20 上传全局技能不指定来源，保留服务端配置的默认解析', async () => {
  const h = await panel('agents', sources);
  try {
    h.open('create'); await h.settle();
    h.render().find(n => n.props.role === 'tab' && n.props.children === '上传技能')!.props.onClick();
    const file = { name: 'skills.json', size: 100, async text() {
      return JSON.stringify({ version: 1, skills: [{ name: 'upload-skill', description: '说明', body: '# 正文' }] });
    } };
    h.render().find(n => n.type === 'input' && n.props.type === 'file')!.props.onChange({ target: { files: [file], value: '' } });
    await flush();
    h.render().find(n => n.type === 'button' && n.props.className === 'primary' && n.props.children === '上传技能')!.props.onClick();
    await flush();
    const input = h.calls.find(c => c.method === 'import.confirm')!.input;
    assert.equal(input.scope, 'global');
    assert.equal('sourceId' in input, false);
  } finally { h.close(); }
});
