import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveRuleFiles } from '../src/server/project-rules.js';
import { defaultProjectRules } from '../src/shared/project-rules.js';
import { initialState } from '../src/shared/model.js';
import { WorkbaseService } from '../src/server/service.js';
import { commandSchema } from '../src/shared/commands.js';
import { dispatch } from '../src/server/rpc.js';

test('规则独立保存不改变其他偏好，拒绝旧版本及非所有者，存储失败回滚', async () => {
  let state = initialState(), writes = 0, rollbacks = 0, fail = false;
  state.preferences.theme = 'warm'; state.preferences.root = '/draft';
  const before = structuredClone(state.preferences);
  const service = new WorkbaseService({ get: () => state, set: async next => { if (fail) throw Error('存储失败'); state = next; } },
    { workspaces: async () => [], sessions: async () => [], rename: async () => {},
      saveRules: async () => { writes++; return { rollback: async () => { rollbacks++; } }; } }, () => 'id');
  const rules = defaultProjectRules(); rules.global.content = '# 草稿';
  const payload = { op: 'rules-save', rules, expectedRules: defaultProjectRules() };
  const signal = new AbortController().signal;
  assert.equal((await dispatch(service, payload, false, signal)).ok, false);
  assert.equal(writes, 0);
  assert.equal((await dispatch(service, payload, true, signal)).ok, true);
  assert.deepEqual({ ...state.preferences, rules: before.rules }, before);
  assert.equal(writes, 1);
  assert.equal((await dispatch(service, payload, true, signal)).ok, false);
  const next = structuredClone(rules); next.global.content = '修改';
  fail = true;
  assert.equal((await dispatch(service, { ...payload, rules: next, expectedRules: rules }, true, signal)).ok, false);
  assert.equal(rollbacks, 1);
  assert.deepEqual(state.preferences.rules, rules);
});

test('规则区块保留手写正文，多项目保存，禁用清理并保留草稿', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-rules-'));
  try {
    const a = path.join(root, 'a'), b = path.join(root, 'b');
    await mkdir(a); await mkdir(b);
    await writeFile(path.join(a, 'AGENTS.md'), '# 手写规范\n原文\n');
    const rules = defaultProjectRules();
    rules.global = { enabled: true, content: '全局中文' };
    rules.projects = [{ id: 'r1', name: '代码规范', enabled: true, projectIds: ['a', 'b'], content: '**规则**\n' }];
    const targets = [{ projectId: 'a', path: a }, { projectId: 'b', path: b }];
    await saveRuleFiles(root, defaultProjectRules(), rules, targets);
    assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /全局中文/);
    assert.match(await readFile(path.join(a, 'AGENTS.md'), 'utf8'), /^# 手写规范\n原文\n/);
    assert.match(await readFile(path.join(b, 'AGENTS.md'), 'utf8'), /代码规范/);
    const off = structuredClone(rules);
    off.global.enabled = false; off.projects[0]!.enabled = false;
    await saveRuleFiles(root, rules, off, targets);
    assert.equal(await readFile(path.join(a, 'AGENTS.md'), 'utf8'), '# 手写规范\n原文\n');
    assert.equal(off.projects[0]!.content, '**规则**\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('所有目标预检，外部区块改动与符号链接阻断；回滚不覆盖外部写入', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-rules-'));
  try {
    const a = path.join(root, 'a'); await mkdir(a);
    const rules = defaultProjectRules(); rules.global = { enabled: true, content: '旧规则' };
    rules.projects = [{ id: 'r1', name: '规范', enabled: true, projectIds: ['a'], content: '正文' }];
    await writeFile(path.join(root, 'external'), '外部');
    await symlink(path.join(root, 'external'), path.join(a, 'AGENTS.md'));
    await assert.rejects(saveRuleFiles(root, defaultProjectRules(), rules, [{ projectId: 'a', path: a }]), /符号链接/);
    await assert.rejects(readFile(path.join(root, 'AGENTS.md')), { code: 'ENOENT' });
    await rm(path.join(a, 'AGENTS.md'));
    const receipt = await saveRuleFiles(root, defaultProjectRules(), rules, [{ projectId: 'a', path: a }]);
    await receipt.rollback();
    await assert.rejects(readFile(path.join(root, 'AGENTS.md')), { code: 'ENOENT' });
    await saveRuleFiles(root, defaultProjectRules(), rules, [{ projectId: 'a', path: a }]);
    const next = structuredClone(rules); next.global.content = '新规则';
    await writeFile(path.join(a, 'AGENTS.md'), (await readFile(path.join(a, 'AGENTS.md'), 'utf8')).replace('正文', '外改'));
    await assert.rejects(saveRuleFiles(root, rules, next, [{ projectId: 'a', path: a }]), /已在外部修改/);
    assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /旧规则/);
    await writeFile(path.join(a, 'AGENTS.md'), (await readFile(path.join(a, 'AGENTS.md'), 'utf8')).replace('外改', '正文'));
    const update = await saveRuleFiles(root, rules, next, [{ projectId: 'a', path: a }]);
    await writeFile(path.join(root, 'AGENTS.md'), '外部后写');
    await assert.rejects(update.rollback(), /回滚/);
    assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), '外部后写');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('服务保存检测旧草稿，持久化失败回滚文件，旧请求不重置规则', async () => {
  let state = initialState(), rolledBack = 0, writes = 0;
  let fail = false;
  const service = new WorkbaseService({ get: () => state, set: async next => { if (fail) throw new Error('存储失败'); state = next; } },
    { workspaces: async () => [], sessions: async () => [], rename: async () => {},
      saveRules: async () => { writes++; return { rollback: async () => { rolledBack++; } }; } }, () => 'id');
  const rules = defaultProjectRules(); rules.global = { enabled: true, content: '规则' };
  await service.saveSettings('follow', {}, { home: state.preferences.home, root: '', rules, expectedRules: defaultProjectRules() });
  assert.equal(writes, 1);
  await assert.rejects(service.saveSettings('follow', {}, { home: state.preferences.home, root: '', rules, expectedRules: defaultProjectRules() }), /其他窗口/);
  assert.equal(writes, 1);
  fail = true;
  const next = structuredClone(rules); next.global.content = '新规则';
  await assert.rejects(service.saveSettings('warm', {}, { home: state.preferences.home, root: '', rules: next, expectedRules: rules }), /存储失败/);
  assert.equal(rolledBack, 1);
  assert.equal(state.preferences.theme, 'follow');
  const cmd = commandSchema.parse({ op: 'preferences', patch: { view: 'list' } });
  assert.equal(cmd.op === 'preferences' && 'rules' in cmd.patch, false);
  await assert.rejects(service.setPreferences({ rules }), /设置/);
});

test('真实文件与RPC事务：存储失败撤销全部文件，所有者和项目身份校验先于文件写入', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-rules-'));
  try {
    const directory = path.join(root, 'project'); await mkdir(directory);
    await writeFile(path.join(directory, 'AGENTS.md'), '\ufeff# 原文\r\n最后一行');
    let state = initialState(), fail = true;
    const service = new WorkbaseService({ get: () => state, set: async next => { if (fail) throw new Error('存储失败'); state = next; } },
      { workspaces: async () => [{ workspaceId: 'w', path: directory, title: '项目', available: true, sessionIds: [] }],
        sessions: async () => [], rename: async () => {},
        saveRules: (before, next, targets) => saveRuleFiles(root, before, next, targets) }, () => 'p');
    const rules = defaultProjectRules(); rules.global = { enabled: true, content: '全局' };
    rules.projects = [{ id: 'r', name: '规范', enabled: true, projectIds: ['p'], content: '项目' }];
    const payload = { op: 'settings', theme: 'warm', permissions: {}, options: { home: state.preferences.home, root: '', rules, expectedRules: defaultProjectRules() } };
    const signal = new AbortController().signal;
    assert.equal((await dispatch(service, payload, false, signal)).ok, false);
    assert.equal((await dispatch(service, payload, true, signal)).ok, false);
    assert.equal(await readFile(path.join(directory, 'AGENTS.md'), 'utf8'), '\ufeff# 原文\r\n最后一行');
    await assert.rejects(readFile(path.join(root, 'AGENTS.md')), { code: 'ENOENT' });
    assert.deepEqual(state.preferences.rules, defaultProjectRules());
    fail = false;
    assert.equal((await dispatch(service, payload, true, signal)).ok, true);
    assert.match(await readFile(path.join(directory, 'AGENTS.md'), 'utf8'), /^\ufeff# 原文\r\n最后一行\n<!--/);
    assert.equal(state.preferences.theme, 'warm');
    const next = structuredClone(rules); next.projects[0]!.projectIds = ['unknown'];
    assert.equal((await dispatch(service, { ...payload, options: { ...payload.options, rules: next, expectedRules: rules } }, true, signal)).ok, false);
    assert.deepEqual(state.preferences.rules, rules);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('批量写入后一个目录无权限时撤销前一个文件；残缺标记拒绝覆盖', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-rules-'));
  const directory = path.join(root, 'project');
  try {
    await mkdir(directory); await chmod(directory, 0o500);
    const rules = defaultProjectRules(); rules.global = { enabled: true, content: '全局' };
    rules.projects = [{ id: 'r', name: '规范', enabled: true, projectIds: ['p'], content: '项目' }];
    await assert.rejects(saveRuleFiles(root, defaultProjectRules(), rules, [{ projectId: 'p', path: directory }]), { code: 'EACCES' });
    await assert.rejects(readFile(path.join(root, 'AGENTS.md')), { code: 'ENOENT' });
    await chmod(directory, 0o700);
    const damaged = '# 原文\n<!-- dsh-workbase:rules:start -->\n外部正文';
    await writeFile(path.join(directory, 'AGENTS.md'), damaged);
    await assert.rejects(saveRuleFiles(root, defaultProjectRules(), rules, [{ projectId: 'p', path: directory }]), /已在外部修改/);
    assert.equal(await readFile(path.join(directory, 'AGENTS.md'), 'utf8'), damaged);
  } finally { await chmod(directory, 0o700).catch(() => {}); await rm(root, { recursive: true, force: true }); }
});
