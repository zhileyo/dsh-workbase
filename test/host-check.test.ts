import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { inspectPluginUpdateContract, contractFingerprints, changedContracts } =
  await import(new URL('../check-host-contracts.mjs', import.meta.url).href) as {
    inspectPluginUpdateContract(host: string, client: string): { errors: string[]; gateField?: string };
    contractFingerprints(files: { file: string; text: string }[]): Record<string, string>;
    changedContracts(old: Record<string, string> | undefined, next: Record<string, string>): string[];
  };
const fields = `name: string; version?: string; installed: boolean;
  availability: 'profile' | 'installation' | 'missing'; official: boolean; source?: string;`;
const host = (update: string) => `export interface BundleInfo { ${fields} ${update} }`;

test('兼容检查必须覆盖插件管理服务及返回契约', async () => {
  const script = await readFile(new URL('../check-host.mjs', import.meta.url), 'utf8');
  assert.match(script, /\['plugin-manager', \['listBundles', 'listVersions', 'updateBundle'\]/);
  assert.match(script, /inspectPluginUpdateContract/);
});

test('没有基线也拒绝新版宿主配旧updatable门禁', () => {
  const old = `interface Bundle { ${fields} updatable: boolean; }
    function check(bundle: Bundle) { return bundle.updatable; }`;
  assert.match(inspectPluginUpdateContract(host("update?: 'registry' | 'git';"), old).errors.join('\n'),
    /未适配宿主字段 update/);
});

test('当前适配同时接受新旧官方契约，拒绝字段删除及类型变化', async () => {
  const client = await readFile(new URL('../src/client/plugin-update.ts', import.meta.url), 'utf8');
  assert.deepEqual(inspectPluginUpdateContract(host("update?: 'git' | 'registry';"), client).errors, []);
  assert.deepEqual(inspectPluginUpdateContract(host('updatable: boolean;'), client).errors, []);
  assert.match(inspectPluginUpdateContract(host(''), client).errors.join('\n'), /均缺失/);
  assert.match(inspectPluginUpdateContract(host('update?: boolean;'), client).errors.join('\n'), /类型/);
  assert.match(inspectPluginUpdateContract(host("update?: 'registry' | 'git';").replace('installed: boolean;', ''), client)
    .errors.join('\n'), /installed/);
});

test('仅返回声明或参数发生变化，方法名不变时仍产生待复核记录', () => {
  const fingerprint = (text: string) => contractFingerprints([{ file: 'src/types.ts', text }]);
  const old = fingerprint(host('updatable: boolean;') + 'interface Options { requestId?: string; }');
  const next = fingerprint(host("update?: 'registry' | 'git';") + 'interface Options { requestId: number; }');
  assert.deepEqual(changedContracts(old, next), ['src/types.ts:BundleInfo', 'src/types.ts:Options']);
  assert.deepEqual(changedContracts(next, next), []);
  assert.deepEqual(changedContracts(undefined, next), ['src/types.ts:BundleInfo', 'src/types.ts:Options']);
  assert.deepEqual(changedContracts(next, {}), ['src/types.ts:BundleInfo', 'src/types.ts:Options']);
});
