import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createProjectDirectory } from '../src/server/host.js';
import * as hostModule from '../src/server/host.js';
import { commandSchema } from '../src/shared/commands.js';
import { WorkbaseService, type HostPort } from '../src/server/service.js';
import { initialState } from '../src/shared/model.js';
import { dispatch } from '../src/server/rpc.js';
import { defaultProjectInitialization, projectInitializationSchema } from '../src/shared/project-initialization.js';

const completionOptions = () => ({ ...defaultProjectInitialization(), basic: true, agent: true, git: true, completeOnImport: true });

test('C13补齐失败后同步不加入项目，原路径复用已登记工作区继续补齐', async () => {
  let state = initialState(), failed = true, registered = 0, completed = 0;
  state.preferences.projectInitialization = completionOptions();
  const workspaces: Awaited<ReturnType<HostPort['workspaces']>> = [];
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => workspaces, sessions: async () => [], rename: async () => {},
    register: async directory => {
      registered++;
      const workspace = { workspaceId: 'w', path: directory, title: '项目', available: true, sessionIds: [] };
      workspaces.push(workspace); return workspace;
    },
    completeInitialization: async () => { completed++; if (failed) throw new Error('补齐失败'); return { created: ['README.md'], preserved: [] }; },
  }, () => 'p');
  await assert.rejects(service.addProject('/project'), /补齐失败/);
  assert.equal((await service.snapshot()).projects.length, 0);
  assert.equal(state.bindings.length, 0);
  failed = false;
  const result = await service.addProject('/project');
  assert.equal(result.duplicate, false);
  assert.equal(completed, 2);
  assert.equal(registered, 1);
  assert.equal((await service.snapshot()).projects.length, 1);
});

test('C13待补齐记录重启后仍抑制同步，重试沿用失败时配置且成功后清理', async () => {
  let state = initialState(), fail = true, registerCalls = 0;
  state.preferences.projectInitialization = completionOptions();
  const workspaces: Awaited<ReturnType<HostPort['workspaces']>> = [];
  const options: unknown[] = [];
  const host: HostPort = {
    workspaces: async () => workspaces, sessions: async () => [], rename: async () => {},
    register: async directory => {
      registerCalls++;
      const workspace = { workspaceId: 'w', path: directory, title: '项目', available: true, sessionIds: [] };
      workspaces.push(workspace); return workspace;
    },
    completeInitialization: async (_path, _name, initialization) => {
      options.push(initialization);
      if (fail) throw new Error('补齐失败');
      return { created: [], preserved: ['README.md'] };
    },
  };
  const make = () => new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  await assert.rejects(make().addProject('/project'), /补齐失败/);
  const service = make();
  assert.equal((await service.snapshot()).projects.length, 0);
  await service.setPreferences({ projectInitialization: defaultProjectInitialization() });
  fail = false;
  assert.equal((await service.addProject('/project')).duplicate, false);
  assert.equal(registerCalls, 1);
  assert.deepEqual(options, [completionOptions(), completionOptions()]);
  assert.deepEqual(state.pendingImports, []);
  assert.equal((await make().snapshot()).projects.length, 1);
});

test('C13存储恢复后同步补存待重试记录，重启仍不会吞掉补齐', async () => {
  let state = initialState(), failSave = true, failComplete = true;
  state.preferences.projectInitialization = completionOptions();
  const workspaces: Awaited<ReturnType<HostPort['workspaces']>> = [];
  const host: HostPort = {
    workspaces: async () => workspaces, sessions: async () => [], rename: async () => {},
    register: async directory => {
      const workspace = { workspaceId: 'w', path: directory, title: '项目', available: true, sessionIds: [] };
      workspaces.push(workspace); return workspace;
    },
    completeInitialization: async () => {
      if (failComplete) throw new Error('补齐失败');
      return { created: [], preserved: [] };
    },
  };
  const make = () => new WorkbaseService({ get: () => state, set: async next => {
    if (failSave) throw new Error('存储失败');
    state = next;
  } }, host, () => 'p');
  const service = make();
  await assert.rejects(service.addProject('/project'), /待重试记录保存失败/);
  failSave = false;
  assert.equal((await service.snapshot()).projects.length, 0);
  assert.equal(state.pendingImports.length, 1);
  failComplete = false;
  assert.equal((await make().addProject('/project')).duplicate, false);
  assert.equal(state.bindings.length, 1);
});

test('导入补齐保留现有文件与工作树Git指针，只补缺失内容且重复执行幂等', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-complete-'));
  try {
    await mkdir(path.join(root, '.agents/notes'), { recursive: true });
    const existing = {
      'README.md': '用户说明\0原文', 'AGENTS.md': '# 已有协作规范\n',
      '.git': 'gitdir: /existing/worktree\n', '.gitignore': '# 用户忽略\n',
      '.agents/notes/dev-log.md': '# 已有日志\n',
    };
    for (const [file, data] of Object.entries(existing)) await writeFile(path.join(root, file), data);
    const result = await hostModule.completeProjectDirectory(root, '导入项目', completionOptions());
    assert.deepEqual(result.created.sort(), ['.editorconfig', '.agents/rules/git-commit-message.md'].sort());
    assert.deepEqual(result.preserved.sort(), Object.keys(existing).sort());
    for (const [file, data] of Object.entries(existing)) assert.equal(await readFile(path.join(root, file), 'utf8'), data);
    assert.equal(await readFile(path.join(root, '.agents/rules/git-commit-message.md'), 'utf8'), completionOptions().commitRuleContent);
    assert.deepEqual((await hostModule.completeProjectDirectory(root, '再次导入', completionOptions())).created, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('导入补齐保留完整已有Git仓库，不调用Git；缺失Git时创建main空仓库', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-complete-git-'));
  const previous = process.env.PATH;
  try {
    const existing = await createProjectDirectory(root, '已有仓库', { ...completionOptions(), agent: false });
    const config = await readFile(path.join(existing, '.git/config'));
    await writeFile(path.join(existing, '.git/custom'), '自定义Git内容');
    process.env.PATH = '';
    await hostModule.completeProjectDirectory(existing, '已有仓库', completionOptions());
    assert.deepEqual(await readFile(path.join(existing, '.git/config')), config);
    assert.equal(await readFile(path.join(existing, '.git/custom'), 'utf8'), '自定义Git内容');
    if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous;
    const missing = path.join(root, '待补齐'); await mkdir(missing); await writeFile(path.join(missing, 'app.ts'), '保留业务代码');
    await hostModule.completeProjectDirectory(missing, '待补齐', { ...completionOptions(), basic: false, agent: false });
    assert.equal(await readFile(path.join(missing, '.git/HEAD'), 'utf8'), 'ref: refs/heads/main\n');
    assert.throws(() => execFileSync('git', ['-C', missing, 'rev-parse', '--verify', 'HEAD'], { stdio: 'pipe' }));
    assert.equal(await readFile(path.join(missing, 'app.ts'), 'utf8'), '保留业务代码');
    await assert.rejects(access(path.join(missing, 'README.md')));
  } finally {
    if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('补齐拒绝越过父目录符号链接，Git不可用时保留已有内容且不落盘新文件', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-complete-safe-'));
  const previous = process.env.PATH;
  try {
    const external = path.join(root, '外部'), target = path.join(root, '项目');
    await mkdir(external); await mkdir(target); await writeFile(path.join(target, 'README.md'), '保留');
    await symlink(external, path.join(target, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(hostModule.completeProjectDirectory(target, '项目', completionOptions()), /子目录|符号链接/);
    assert.deepEqual(await readdir(external), []);
    assert.deepEqual((await readdir(target)).sort(), ['.agents', 'README.md']);
    const failure = path.join(root, '失败'); await mkdir(failure); await writeFile(path.join(failure, 'README.md'), '保留');
    process.env.PATH = '';
    await assert.rejects(hostModule.completeProjectDirectory(failure, '失败', completionOptions()), /Git|git/);
    assert.deepEqual(await readdir(failure), ['README.md']);
    await assert.rejects(hostModule.completeProjectDirectory('relative', '失败', completionOptions()), /绝对路径/);
  } finally {
    if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('导入补齐读取已存开关，跳过重复及归档项目，失败不写绑定并支持重试', async () => {
  let state = initialState(), failing = false;
  const calls: unknown[][] = [];
  const host = {
    workspaces: async () => [], sessions: async () => [], rename: async () => {},
    register: async (directory: string) => ({ workspaceId: directory, path: directory, title: '导入', available: true, sessionIds: [] }),
    completeInitialization: async (...args: unknown[]) => { calls.push(args); if (failing) throw new Error('模拟补齐失败'); return { created: ['README.md'], preserved: [] }; },
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => `p-${state.bindings.length}`);
  await service.addProject('/disabled'); assert.equal(calls.length, 0);
  await service.setPreferences({ projectInitialization: completionOptions() });
  const result = await service.addProject('/enabled');
  assert.deepEqual(result.initialization, { created: ['README.md'], preserved: [] });
  assert.deepEqual(calls[0]?.[2], completionOptions());
  await service.addProject('/enabled'); await service.addProject('/disabled'); assert.equal(calls.length, 1);
  const binding = state.bindings.find(b => b.path === '/enabled')!;
  binding.removed = true; binding.archived = true;
  await service.addProject('/enabled'); assert.equal(calls.length, 1);
  failing = true; const count = state.bindings.length;
  await assert.rejects(service.addProject('/failed'), /补齐失败/); assert.equal(state.bindings.length, count);
  failing = false; await service.addProject('/failed'); assert.equal(state.bindings.length, count + 1);
  await service.setPreferences({ projectInitialization: { ...completionOptions(), basic: false, agent: false, git: false } });
  const previousCalls = calls.length;
  await service.addProject('/no-groups'); assert.equal(calls.length, previousCalls);
});

test('补齐保留文件位置的符号链接和异常已有条目，不跟随写入', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-complete-leaf-'));
  try {
    const external = path.join(root, 'external.md'), target = path.join(root, 'project');
    await writeFile(external, '外部原文'); await mkdir(target);
    await symlink(external, path.join(target, 'README.md'));
    await symlink(path.join(root, 'missing'), path.join(target, 'AGENTS.md'));
    await mkdir(path.join(target, '.editorconfig'));
    await symlink(path.join(root, 'missing-git'), path.join(target, '.git'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await hostModule.completeProjectDirectory(target, '项目', completionOptions());
    assert.deepEqual(result.preserved.sort(), ['README.md', 'AGENTS.md', '.editorconfig', '.git'].sort());
    assert.equal(await readFile(external, 'utf8'), '外部原文');
    assert.deepEqual(await readdir(path.join(target, '.editorconfig')), []);
    await assert.rejects(access(path.join(target, 'AGENTS.md')));
    assert.ok(result.created.includes('.agents/rules/git-commit-message.md'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('补齐后绑定保存失败保留生成文件，原路径重试只保留且不重复创建', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-complete-save-'));
  try {
    let state = initialState(), failSave = true;
    state.preferences.projectInitialization = { ...completionOptions(), git: false };
    const results: { created: string[]; preserved: string[] }[] = [];
    const service = new WorkbaseService({
      get: () => state,
      set: async next => { if (failSave) throw new Error('模拟存储失败'); state = next; },
    }, {
      workspaces: async () => [], sessions: async () => [], rename: async () => {},
      register: async directory => ({ workspaceId: 'w', path: directory, title: '项目', available: true, sessionIds: [] }),
      completeInitialization: async (...args) => { const result = await hostModule.completeProjectDirectory(...args); results.push(result); return result; },
    }, () => 'p');
    await assert.rejects(service.addProject(root), /补齐已完成.*保存失败/);
    assert.equal(state.bindings.length, 0);
    const content = await readFile(path.join(root, 'AGENTS.md'));
    failSave = false;
    const result = await service.addProject(root);
    assert.equal(state.bindings.length, 1); assert.deepEqual(result.initialization?.created, []);
    assert.deepEqual(result.initialization?.preserved.sort(), results[0]!.created.sort());
    assert.deepEqual(await readFile(path.join(root, 'AGENTS.md')), content);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('补齐开启时能力缺失或目录不可用拒绝绑定，不降级为成功导入', async () => {
  for (const available of [true, false]) {
    let state = initialState();
    state.preferences.projectInitialization = completionOptions();
    let completed = 0;
    const host: HostPort = {
      workspaces: async () => [], sessions: async () => [], rename: async () => {},
      register: async directory => ({ workspaceId: 'w', path: directory, title: '项目', available, sessionIds: [] }),
      ...(!available ? { completeInitialization: async () => { completed++; return { created: [], preserved: [] }; } } : {}),
    };
    const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
    await assert.rejects(service.addProject('/project'), available ? /不支持补齐/ : /目录不可用/);
    assert.equal(state.bindings.length, 0); assert.equal(completed, 0);
  }
});

test('三个分组独立生成文件，关闭的分组没有文件或悬空引用', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-groups-'));
  try {
    for (const basic of [false, true]) for (const agent of [false, true]) for (const git of [false, true]) for (const commitRules of [false, true]) {
      const options = { ...defaultProjectInitialization(), basic, agent, git, commitRules, commitRuleContent: '# 自定义提交规范\n\n使用 feat / fix，正文可选。\n' };
      const dir = await create(root, `project-${Number(basic)}${Number(agent)}${Number(git)}${Number(commitRules)}`, options);
      for (const [file, included] of [
        ['README.md', basic], ['.editorconfig', basic], ['.gitignore', git], ['.git', git],
        ['AGENTS.md', agent], ['.agents/notes/dev-log.md', agent], ['.agents/rules/git-commit-message.md', agent && commitRules],
      ] as const) {
        assert.equal(await access(path.join(dir, file)).then(() => true, () => false), included, file);
      }
      if (basic) {
        const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
        assert.equal(readme.includes('[AGENTS.md]'), agent);
      }
      if (agent) {
        const agents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
        assert.equal(agents.includes('[README.md]'), basic);
        assert.equal(agents.includes('.agents/rules/git-commit-message.md'), commitRules);
      }
      if (agent && commitRules) assert.equal(await readFile(path.join(dir, '.agents/rules/git-commit-message.md'), 'utf8'), options.commitRuleContent);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('新建服务使用最新已保存分组，打开已有目录不执行初始化', async () => {
  let state = initialState();
  state.preferences.root = '/configured';
  const calls: unknown[][] = [];
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => [], sessions: async () => [], rename: async () => {},
    createDirectory: async (...args: unknown[]) => { calls.push(args); return `/configured/${args[1]}`; },
    register: async directory => ({ workspaceId: directory, path: directory, title: '项目', available: true, sessionIds: [] }),
  }, () => `p-${calls.length}`);
  const initialization = { ...defaultProjectInitialization(), basic: false, agent: true, git: false, commitRules: true, commitRuleContent: '# 定制规则\n' };
  await service.saveSettings('follow', {}, { home: state.preferences.home, root: '/configured', projectInitialization: initialization });
  await service.addProject('/ignored', 'new');
  assert.deepEqual(calls[0]?.[2], initialization);
  await service.addProject('/existing');
  assert.equal(calls.length, 1);
  const next = { ...initialization, git: true, agent: false };
  await service.setPreferences({ projectInitialization: next });
  await service.addProject('/ignored', 'second');
  assert.deepEqual(calls[1]?.[2], next);
});

test('自定义提交规则按生成条件校验空白及长度，非法配置不创建目录', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-rule-validation-'));
  try {
    const options = { ...defaultProjectInitialization(), agent: true, commitRules: true };
    for (const content of ['  \n', 'x'.repeat(10001)]) {
      await assert.rejects(create(root, 'invalid', { ...options, commitRuleContent: content }));
      assert.deepEqual(await readdir(root), []);
    }
    await create(root, 'disabled', { ...options, commitRules: false, commitRuleContent: '' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

const create = createProjectDirectory;
const basic = { template: 'basic' as const, git: false };

test('基础协作模板包含代理入口、提交规则及开发记录，默认创建仍为空目录', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-init-'));
  try {
    const empty = await create(root, '空项目');
    assert.deepEqual(await readdir(empty), []);
    const dir = await create(root, '中文 项目', basic);
    for (const file of ['README.md', 'AGENTS.md', '.editorconfig',
      '.agents/rules/git-commit-message.md', '.agents/notes/dev-log.md']) {
      assert.ok((await readFile(path.join(dir, file), 'utf8')).length > 0, file);
    }
    const agents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.match(agents, /\.agents\/rules\/git-commit-message\.md/);
    const rule = await readFile(path.join(dir, '.agents/rules/git-commit-message.md'), 'utf8');
    assert.match(rule, /原因分析/);
    assert.match(rule, /修改方法/);
    assert.doesNotMatch(rule, /semantic-release|dsh-workbase|DSH|release\.config/);
    assert.match(await readFile(path.join(dir, 'README.md'), 'utf8'), /中文 项目/);
    await assert.rejects(access(path.join(dir, '.git')));
    await assert.rejects(access(path.join(dir, '.gitignore')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Git 初始化生成独立 main 仓库，不提交且不受外部 Git 目录变量影响', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-init-git-'));
  const oldDir = process.env.GIT_DIR, oldTree = process.env.GIT_WORK_TREE;
  try {
    process.env.GIT_DIR = path.join(root, '不能写入');
    process.env.GIT_WORK_TREE = root;
    const dir = await create(root, 'git 项目', { ...basic, git: true });
    assert.equal(await readFile(path.join(dir, '.git/HEAD'), 'utf8'), 'ref: refs/heads/main\n');
    await assert.rejects(access(path.join(root, '不能写入')));
    const env = { ...process.env }; delete env.GIT_DIR; delete env.GIT_WORK_TREE;
    assert.equal(execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { env, encoding: 'utf8' }).trim(), dir);
    assert.throws(() => execFileSync('git', ['-C', dir, 'rev-parse', '--verify', 'HEAD'], { env, stdio: 'pipe' }));
    assert.deepEqual(await readdir(path.join(dir, '.git/hooks')).catch(() => []), []);
  } finally {
    if (oldDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = oldDir;
    if (oldTree === undefined) delete process.env.GIT_WORK_TREE; else process.env.GIT_WORK_TREE = oldTree;
    await rm(root, { recursive: true, force: true });
  }
});

test('初始化拒绝已有非空目录且保留文件，Git 不可用时回滚新目录', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-init-fail-'));
  const previous = process.env.PATH;
  try {
    const dir = path.join(root, '已有');
    await mkdir(dir); await writeFile(path.join(dir, 'README.md'), '保留');
    await assert.rejects(create(root, '已有', basic), /已存在/);
    assert.equal(await readFile(path.join(dir, 'README.md'), 'utf8'), '保留');
    process.env.PATH = '';
    await assert.rejects(create(root, '失败', { ...basic, git: true }), /Git|git/);
    assert.deepEqual(await readdir(root), ['已有']);
  } finally {
    if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('创建 RPC 接受初始化选项，拒绝在已有目录执行、未知模板与任意命令', () => {
  const payload = { op: 'add-project', path: '/root', name: 'new', initialization: basic };
  assert.equal(commandSchema.safeParse(payload).success, true);
  for (const value of [
    { ...payload, name: undefined },
    { ...payload, initialization: { template: 'unknown', git: false } },
    { ...payload, initialization: { ...basic, command: 'npm install' } },
    { ...payload, initialization: { template: 'none', git: true } },
  ]) assert.equal(commandSchema.safeParse(value).success, false);
});

test('初始化完成后才注册；失败不写项目，RPC 仅 owner 可创建', async () => {
  let state = initialState(); state.preferences.root = '/configured';
  let registered = 0, options: unknown, failing = true;
  const host: HostPort = {
    workspaces: async () => [], sessions: async () => [], rename: async () => {},
    createDirectory: async (...args: unknown[]) => {
      assert.equal(args[0], '/configured'); options = args[2];
      if (failing) throw new Error('初始化失败');
      return '/configured/new';
    },
    register: async directory => {
      registered++;
      return { workspaceId: 'w', path: directory, title: 'new', available: true, sessionIds: [] };
    },
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  const payload = { op: 'add-project', path: '/untrusted', name: 'new', initialization: basic };
  const signal = new AbortController().signal;
  assert.equal((await dispatch(service, payload, false, signal)).ok, false);
  assert.equal(options, undefined);
  assert.equal((await dispatch(service, payload, true, signal)).ok, false);
  assert.deepEqual(options, projectInitializationSchema.parse(basic));
  assert.equal(registered, 0); assert.equal(state.bindings.length, 0);
  failing = false;
  assert.equal((await dispatch(service, payload, true, signal)).ok, true);
  assert.equal(registered, 1); assert.equal(state.bindings[0]?.path, '/configured/new');
});
