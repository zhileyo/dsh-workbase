import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import * as hostFeatures from '../src/server/host.js';
import { initialState } from '../src/shared/model.js';
import { WorkbaseService, type HostPort } from '../src/server/service.js';

test('新建目录不覆盖已有文件，非法名称与未配置根目录被拒绝', async () => {
  assert.equal(typeof hostFeatures.createProjectDirectory, 'function');
  const { createProjectDirectory } = hostFeatures;
  const root = await mkdtemp(path.join(process.cwd(), 'test', '.project-'));
  try {
    await mkdir(path.join(root, '已有'));
    await writeFile(path.join(root, '已有', '重要.txt'), '保留');
    await assert.rejects(createProjectDirectory(root, '已有'), /已存在/);
    assert.equal(await readFile(path.join(root, '已有', '重要.txt'), 'utf8'), '保留');
    await assert.rejects(createProjectDirectory(root, '../越界'), /名称/);
    await assert.rejects(createProjectDirectory('', '新项目'), /根目录/);
    assert.equal(await createProjectDirectory(root, '新项目'), path.join(root, '新项目'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('全文检索只返回当前项目主会话，宿主上限必须标明部分结果', async () => {
  let state = initialState();
  const host: HostPort = {
    workspaces: async () => [{ workspaceId: 'w', path: '/项目', title: '项目', available: true, sessionIds: ['s'] }],
    sessions: async () => [{ sessionId: 's', title: '会话', archived: false, running: false, updatedAt: 10 }],
    rename: async () => {},
    search: async () => ({ items: [{ sessionId: 's', snippet: '真实正文' }, { sessionId: 'other', snippet: '不可访问' }], hasMore: true }),
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  const result = await service.searchSessions('正文', new AbortController().signal);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]!.snippet, '真实正文');
  assert.equal(result.hasMore, true);
});

test('快捷输入开始前重新核对目录，不为不可执行项目创建会话', async () => {
  let state = initialState();
  let creations = 0;
  const host: HostPort = {
    workspaces: async () => [{ workspaceId: 'w', path: '/失效', title: '项目', available: false, sessionIds: [] }],
    sessions: async () => [], rename: async () => {},
    begin: async () => { creations++; return { sessionId: 's' }; },
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  await service.snapshot();
  await assert.rejects(service.beginSession('p', 'standard'), /目录/);
  assert.equal(creations, 0);
});

test('目录创建后注册失败明确保留目录，并可通过已有目录重试', async () => {
  let state = initialState();
  state.preferences.root = '/root';
  let creations = 0;
  let fails = true;
  const host: HostPort = {
    workspaces: async () => [], sessions: async () => [], rename: async () => {},
    createDirectory: async () => { creations++; return '/root/new'; },
    register: async directory => {
      if (fails) throw new Error('不可用');
      return { workspaceId: 'w', path: directory, title: 'new', available: true, sessionIds: [] };
    },
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  await assert.rejects(service.addProject('/root', 'new'), /目录已创建：\/root\/new/);
  fails = false;
  await service.addProject('/root/new');
  assert.equal(creations, 1);
  assert.equal(state.bindings[0]!.path, '/root/new');
});
