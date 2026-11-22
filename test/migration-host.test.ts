import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { copyOfficialPackages } from './official-host.js';
import { initialState, stateSchema } from '../src/shared/model.js';
import { WorkbaseService } from '../src/server/service.js';

test('实际桌面官方存储域原子持久化迁移，关闭重开可撤销且历史日志字节不变', {
  skip: process.env.DSH_MIGRATION_HOST_TEST !== '1', timeout: 90_000,
}, async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'dsh-migration-host-')));
  t.after(() => rm(home, { recursive: true, force: true }));
  await copyOfficialPackages(home, ['@deepseek-ai/cordis', '@deepseek-ai/dsh-storage-json', '@deepseek-ai/dsh-storage-domain', '@deepseek-ai/dsh-workspace']);
  const load = (name: string) => import(pathToFileURL(join(home, 'node_modules', name, 'lib/index.js')).href);
  const { Context, Service } = await load('@deepseek-ai/cordis');
  const { WorkspaceRegistry } = await load('@deepseek-ai/dsh-workspace');
  const { Storage } = await load('@deepseek-ai/dsh-storage');
  const { JsonStorageBackend } = await load('@deepseek-ai/dsh-storage-json');
  const { DomainFacility, defineDomain } = await load('@deepseek-ai/dsh-storage-domain');
  const ctx = new Context(), hub = new Storage(ctx), backend = new JsonStorageBackend(join(home, 'storages'));
  hub.backend.register('json', backend);
  const facility = new DomainFacility(ctx, { backend: 'json' });
  t.after(async () => { await facility.closeAll(); await backend.close(); });
  const spec = defineDomain({ name: 'dsh_workbase', version: 1, tables: {},
    global: { schema: stateSchema, initial: initialState() } });
  const source = join(home, 'source'), target = join(home, 'target');
  await mkdir(source); await mkdir(target);
  const log = join(home, 'session.log'), content = JSON.stringify({ header: { cwd: source }, messages: ['历史内容'] });
  await writeFile(log, content);
  const registry = async () => {
    const context = new Context();
    context.reflect.provide('storageDomain', facility);
    context.reflect.provide('sessionPersistence', {
      list: async () => [{ header: { version: 4, id: 's1', cwd: source, createdAt: 1, isSeeded: false } }],
    });
    const value = new WorkspaceRegistry(context);
    await value[Service.init]();
    return value;
  };
  let workspaces = await registry();
  const sourceWorkspace = workspaces.list().find((w: { path: string }) => w.path === source)!;
  const targetWorkspace = await workspaces.create(target, '目标');
  const host = {
    workspaces: async () => workspaces.list().map((w: { id: string; path: string; title: string; sessionIds: string[] }) =>
      ({ workspaceId: w.id, path: w.path, title: w.title, available: true, sessionIds: [...w.sessionIds] })),
    remove: async (id: string) => workspaces.delete(id),
    register: async (path: string, title?: string) => {
      const w = await workspaces.create(path, title);
      return { workspaceId: w.id, path: w.path, title: w.title, available: true, sessionIds: [...w.sessionIds] };
    },
    sessions: async () => [{ sessionId: 's1', title: '历史', running: false, archived: false, updatedAt: 1 }],
    rename: async () => { throw new Error('不应改写宿主'); },
  };
  let domain = await facility.open(spec), seq = 0;
  const make = () => new WorkbaseService({ get: () => domain.global.get(), set: next => domain.global.set(next) },
    host, () => `id-${++seq}`, () => 1000);
  let service = make(); await service.snapshot();
  const sourceId = domain.global.get().bindings.find((b: { path: string }) => b.path === source).projectId;
  const targetId = domain.global.get().bindings.find((b: { path: string }) => b.path === target).projectId;
  const todo = await service.createTodo({ projectId: sourceId, title: '迁移待办' });
  const preview = await service.previewProjectMigration({ projectId: sourceId, targetProjectId: targetId }, new AbortController().signal);
  const record = await service.confirmMigration(preview.token);
  const disk = JSON.parse(await readFile(join(home, 'storages', 'dsh_workbase.json'), 'utf8'));
  assert.equal(disk.global.migrations[0].id, record.id);
  assert.equal(disk.global.todos.find((t: { id: string }) => t.id === todo.id).projectId, targetId);
  assert.equal(disk.global.sessionOwnership[0].projectId, targetId);
  assert.ok(!workspaces.list().some((w: { path: string }) => w.path === source));
  await facility.closeAll(); workspaces = await registry(); domain = await facility.open(spec); service = make();
  assert.ok(!workspaces.list().some((w: { path: string }) => w.path === source), '重启不按历史头重建已删除登记');
  assert.equal(service.workspaceForSession('s1', sourceWorkspace.id), targetWorkspace.id);
  await service.undoMigration(record.id);
  const restored = workspaces.list().find((w: { path: string }) => w.path === source)!;
  assert.notEqual(restored.id, sourceWorkspace.id);
  await facility.closeAll(); workspaces = await registry(); domain = await facility.open(spec); service = make();
  assert.equal(service.workspaceForSession('s1', sourceWorkspace.id), restored.id);
  assert.equal((await service.snapshot()).projects.find(p => p.projectId === sourceId)!.sessions[0]!.sessionId, 's1');
  assert.equal(domain.global.get().todos[0].projectId, sourceId);
  assert.equal(await readFile(log, 'utf8'), content);
});
