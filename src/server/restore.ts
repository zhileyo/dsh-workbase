import { mkdtemp, readFile, writeFile, rename, rm, mkdir, cp, readdir, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { State } from '../shared/model.js';
import { stateSchema } from '../shared/model.js';
import { backupManifestSchema, type BackupManifest } from '../shared/backup.js';
import { restoreInputSchema, type RestorePort, type RestoreStatus, type RestoreArchive } from '../shared/restore.js';
import type { BackupManager } from './backup.js';
import { privateDirectory, readIdentity, ensureIdentity, inspectArchive, sameFiles } from './restore-archive.js';
import { jsonFile, safeDestination } from './backup-files.js';
import { inventory, encryptArchive, verifyArchive, archiveFilename, publishArchive } from './backup-archive.js';

export interface RestoreOptions {
  home: string; backup: Pick<BackupManager, 'reserveRestore'>;
  state(): Promise<State>;
  inspect(value: unknown): Promise<{ revision: number; blockers: string[] }>;
  apply(value: unknown, revision: number, beforeWrite: (before: State) => Promise<void>): Promise<{ revision: number }>;
  roots(): Promise<string[]>;
  ttlMs?: number;
}
const idle = (): RestoreStatus => ({ phase: 'idle', message: '请选择备份文件并预览' });
export class RestoreManager implements RestorePort {
  private value = idle();
  private loaded?: Promise<void>;
  private task?: Promise<void>;
  private pending?: { stage: string; payload: string; manifest: BackupManifest; state?: State };
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private acquiring = false;
  constructor(private readonly options: RestoreOptions) {}
  private async control() { return privateDirectory(this.options.home, 'backup'); }
  private async load() {
    this.loaded ??= (async () => {
      try {
        const data = JSON.parse(await readFile(path.join(this.options.home, 'backup', 'last-restore.json'), 'utf8')) as RestoreStatus;
        if (!data || typeof data.message !== 'string') return;
        if (['checking', 'ready', 'restoring'].includes(data.phase))
          this.value = { phase: 'interrupted', message: '上次恢复流程随宿主退出中断，请重新预览；已保留的回滚副本仍可使用', ...(data.result ? { result: data.result } : {}) };
        else if (['completed', 'failed', 'interrupted'].includes(data.phase)) this.value = { ...data, preview: undefined };
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    })();
    try { await this.loaded; } catch (e) { this.loaded = undefined; throw e; }
  }
  private async persist() {
    const control = await this.control(), temporary = path.join(control, `restore-result-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(this.value), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path.join(control, 'last-restore.json'));
  }
  async status() { await this.load(); return structuredClone(this.value); }
  async catalog() {
    const result: RestoreArchive[] = [];
    const directory = (await this.options.state()).preferences.backup.directory;
    for (const [root, rollback] of [[directory, false], [path.join(this.options.home, 'backup', 'restore-rollbacks'), true]] as const) {
      if (!root || !path.isAbsolute(root)) continue;
      try {
        for (const name of (await readdir(root)).filter(n => n.endsWith('.tar.age'))) {
          const file = path.join(root, name);
          try {
            const info = await lstat(file);
            if (info.isFile() && !info.isSymbolicLink()) result.push({ path: file, name, bytes: info.size, modifiedAt: info.mtimeMs, rollback });
          } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        }
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    return result.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 30);
  }
  settled() { return this.task ?? Promise.resolve(); }
  dispose() {
    this.stopped = true; this.controller.abort();
    if (this.timer) clearTimeout(this.timer);
    if (!this.task) void this.clearPending();
  }
  private async clearPending() {
    if (this.timer) clearTimeout(this.timer);
    const pending = this.pending; this.pending = undefined;
    if (pending) await rm(pending.stage, { recursive: true, force: true });
  }
  async preview(input: { archive: string; keyPath: string }) {
    await this.load();
    const parsed = restoreInputSchema.parse(input);
    if (this.stopped || this.task || this.acquiring) throw new Error('恢复任务进行中或宿主已停止');
    this.acquiring = true;
    try {
      const release = await this.options.backup.reserveRestore();
      if (this.stopped) { release(); throw new Error('宿主已停止'); }
      this.controller = new AbortController();
      this.value = { phase: 'checking', message: '正在解密并校验恢复文件' };
      this.task = this.prepare(parsed).finally(() => { release(); this.task = undefined; });
      return structuredClone(this.value);
    } finally { this.acquiring = false; }
  }
  private async prepare(input: { archive: string; keyPath: string }) {
    let stage: string | undefined;
    const signal = this.controller.signal;
    try {
      await this.clearPending();
      await this.persist();
      const control = await this.control(), staging = await privateDirectory(control, 'restore-staging');
      stage = await mkdtemp(path.join(staging, 'preview-'));
      const key = await readIdentity(input.keyPath || path.join(control, 'identity.txt'));
      const verified = await inspectArchive(input.archive, stage, key, signal);
      let state: State | undefined;
      const stateInfo = verified.manifest.files.find(f => f.path === 'workbase.json');
      if (stateInfo && stateInfo.bytes <= 32 * 1024 ** 2) {
        const parsed = stateSchema.safeParse(JSON.parse(await readFile(path.join(verified.payload, 'workbase.json'), 'utf8')));
        if (parsed.success) state = parsed.data;
      }
      const check = state ? await this.options.inspect(state) : { revision: (await this.options.state()).revision, blockers: ['备份中的工作台状态缺失或格式不支持'] };
      if (!verified.manifest.coverage.some(c => c.id === 'workbase' && c.status === 'verified')) check.blockers.push('备份没有已校验的工作台状态范围');
      signal.throwIfAborted();
      this.pending = { stage, ...verified, state };
      stage = undefined;
      const expiresAt = Date.now() + (this.options.ttlMs ?? 15 * 60 * 1000);
      this.value = { phase: 'ready', message: '文件和摘要已校验，请确认恢复范围', preview: {
        token: randomUUID(), archive: input.archive, createdAt: verified.manifest.startedAt, expiresAt,
        files: verified.manifest.files.length, bytes: verified.manifest.files.reduce((sum, f) => sum + f.bytes, 0),
        todos: state?.todos.length ?? 0, projects: state?.bindings.filter(b => !b.retired && !b.removed).length ?? 0,
        revision: check.revision, workbaseBlockers: check.blockers, coverage: verified.manifest.coverage,
      } };
      await this.persist();
      this.timer = setTimeout(() => {
        if (!this.task && !this.acquiring && this.value.phase === 'ready') {
          this.value = { phase: 'idle', message: '恢复预览已过期，请重新选择备份' };
          void this.clearPending().then(() => this.persist()).catch(() => undefined);
        }
      }, this.options.ttlMs ?? 15 * 60 * 1000);
      this.timer.unref?.();
    } catch (e) {
      this.value = { phase: signal.aborted ? 'interrupted' : 'failed', message: e instanceof Error ? e.message : '恢复预览失败' };
      await this.clearPending().catch(() => undefined);
      await this.persist().catch(() => undefined);
    } finally { if (stage) await rm(stage, { recursive: true, force: true }).catch(() => undefined); }
  }
  async discard(token: string) {
    await this.load();
    if (this.task || this.acquiring || this.value.preview?.token !== token) throw new Error('恢复预览已失效');
    this.acquiring = true;
    try {
      await this.clearPending();
      this.value = idle(); await this.persist();
      return await this.status();
    } finally { this.acquiring = false; }
  }
  async confirm(input: { token: string; mode: 'workbase' | 'directory'; directory?: string }) {
    await this.load();
    const preview = this.value.preview, pending = this.pending;
    if (this.stopped || this.task || this.acquiring || !pending || !preview || this.value.phase !== 'ready'
      || input.token !== preview.token || preview.expiresAt <= Date.now()) throw new Error('恢复预览已失效，请重新预览');
    if (input.mode === 'workbase' && (!pending.state || preview.workbaseBlockers.length)) throw new Error('当前无法恢复工作台，请查看预览中的原因');
    if (input.mode === 'directory' && !input.directory?.trim()) throw new Error('请选择恢复文件的保存目录');
    this.acquiring = true;
    try {
      const release = await this.options.backup.reserveRestore();
      if (this.stopped) { release(); throw new Error('宿主已停止'); }
      this.controller = new AbortController();
      this.value = { phase: 'restoring', message: '正在恢复，请勿退出宿主' };
      this.task = this.activate(input, preview, pending).finally(() => { release(); this.task = undefined; });
      return await this.status();
    } finally { this.acquiring = false; }
  }
  private async rollback(before: State, stage: string) {
    const control = await this.control(), rollbackRoot = await privateDirectory(control, 'restore-rollbacks');
    const { key } = await ensureIdentity(control), signal = this.controller.signal;
    const payload = path.join(stage, 'rollback'); await mkdir(payload, { mode: 0o700 });
    await jsonFile(path.join(payload, 'workbase.json'), before);
    const manifest: BackupManifest = { format: 'dsh-workbase-online-backup', version: 1, globalConsistency: false,
      startedAt: Date.now(), completedAt: Date.now(), coverage: [{ id: 'workbase', status: 'verified',
        startedAt: Date.now(), completedAt: Date.now(), message: '恢复前的工作台存储副本' }], files: await inventory(payload, signal) };
    await jsonFile(path.join(payload, 'manifest.json'), manifest);
    const encrypted = path.join(stage, 'rollback.age');
    await encryptArchive(payload, encrypted, key, signal);
    await verifyArchive(encrypted, stage, key, manifest, signal);
    const output = path.join(rollbackRoot, archiveFilename('rollback', manifest.startedAt, randomUUID()));
    await publishArchive(encrypted, output);
    this.value.result = { mode: 'workbase', path: output, completedAt: Date.now() };
    await this.persist();
    signal.throwIfAborted();
  }
  private async activate(input: { mode: 'workbase' | 'directory'; directory?: string },
    preview: NonNullable<RestoreStatus['preview']>, pending: NonNullable<RestoreManager['pending']>) {
    const signal = this.controller.signal;
    let publication: string | undefined;
    try {
      await this.persist();
      const actual = (await inventory(pending.payload, signal)).filter(f => f.path !== 'manifest.json');
      if (!sameFiles(actual, pending.manifest.files)) throw new Error('恢复暂存内容在预览后发生变化，请重新预览');
      const manifest = backupManifestSchema.parse(JSON.parse(await readFile(path.join(pending.payload, 'manifest.json'), 'utf8')));
      if (JSON.stringify(manifest) !== JSON.stringify(pending.manifest)) throw new Error('恢复清单在预览后发生变化，请重新预览');
      if (input.mode === 'workbase') {
        const result = await this.options.apply(pending.state, preview.revision, before => this.rollback(before, pending.stage));
        this.value = { ...this.value, phase: 'completed', message: '工作台状态已恢复，替换前的数据已保留为加密回滚副本',
          result: { ...this.value.result!, revision: result.revision, completedAt: Date.now() } };
      } else {
        const parent = await safeDestination(input.directory!, await this.options.roots(), this.options.home);
        publication = await mkdtemp(path.join(parent, 'dsh-restored-'));
        const copied = path.join(publication, 'incomplete'), target = path.join(publication, 'data');
        signal.throwIfAborted();
        await cp(pending.payload, copied, { recursive: true, errorOnExist: true, force: false });
        const copiedFiles = (await inventory(copied, signal)).filter(f => f.path !== 'manifest.json');
        if (!sameFiles(copiedFiles, pending.manifest.files)) throw new Error('目录恢复后的文件摘要不一致');
        signal.throwIfAborted();
        await rename(copied, target);
        this.value = { phase: 'completed', message: '备份文件已恢复到独立目录；会话、附件、数据库和插件配置尚未激活到当前宿主',
          result: { mode: 'directory', path: target, completedAt: Date.now() } };
        publication = undefined;
      }
      await this.persist();
    } catch (e) {
      if (this.value.phase === 'completed') this.value.message += '；最近结果保存失败，请保留显示的路径';
      else {
        this.value = { ...this.value, phase: signal.aborted ? 'interrupted' : 'failed', message: e instanceof Error ? e.message : '恢复失败' };
        await this.persist().catch(() => undefined);
      }
    } finally {
      await this.clearPending().catch(() => undefined);
      if (publication) await rm(publication, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
