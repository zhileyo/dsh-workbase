import { mkdir, mkdtemp, readFile, writeFile, rename, rm, lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import type { BackupPort, BackupPreferences, BackupStatus, BackupManifest } from '../shared/backup.js';
import { copyObserved, safeDestination, jsonFile, canonical, type BackupSource, type BackupLink } from './backup-files.js';
import { encryptArchive, inventory, verifyArchive, archiveFilename, publishArchive } from './backup-archive.js';
import { pruneBackups } from './backup-retention.js';

export interface BackupOptions {
  home: string;
  settings(): BackupPreferences;
  state(): Promise<unknown>;
  sources(): Promise<BackupSource[]>;
  busy(): Promise<boolean>;
  claimStartup?(): boolean;
  retryMs?: number;
}
const initial = (): BackupStatus => ({ phase: 'idle', message: '尚未执行备份', coverage: [] });
const active = (phase: BackupStatus['phase']) => ['waiting', 'exporting', 'encrypting', 'verifying'].includes(phase);

/** 任务与 RPC/React 生命周期解耦；dispose 只中断任务，不在宿主退出时发起新备份。 */
export class BackupManager implements BackupPort {
  private value = initial();
  private loaded?: Promise<void>;
  private task?: Promise<void>;
  private startupClaimed = false;
  private stopped = false;
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private wake?: () => void;
  private restoreReservation?: symbol;
  constructor(private readonly options: BackupOptions) {}
  private get control() { return path.join(this.options.home, 'backup'); }
  private async load() {
    this.loaded ??= (async () => {
      try {
        const data = JSON.parse(await readFile(path.join(this.control, 'last-result.json'), 'utf8')) as BackupStatus;
        if (!data || !Array.isArray(data.coverage) || typeof data.message !== 'string'
          || !['idle','waiting','exporting','encrypting','verifying','completed','failed','interrupted'].includes(data.phase)) return;
        this.value = active(data.phase) ? { ...data, phase: 'interrupted', message: '上次任务随宿主退出中断，未发布的临时产物不能用于恢复' } : data;
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    })();
    try { await this.loaded; }
    catch (e) { this.loaded = undefined; throw e; }
  }
  async status() { await this.load(); return structuredClone(this.value); }
  private async persist() {
    await mkdir(this.control, { recursive: true, mode: 0o700 });
    if ((await lstat(this.control)).isSymbolicLink() || await canonical(this.control) !== path.join(await canonical(this.options.home), 'backup'))
      throw new Error('备份控制目录不允许符号链接');
    const temp = path.join(this.control, `result-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(this.value), { mode: 0o600, flag: 'wx' });
    await rename(temp, path.join(this.control, 'last-result.json'));
  }
  async start(trigger: 'manual' | 'startup') {
    await this.load();
    if (this.stopped) throw new Error('备份管理器已停止');
    if (trigger === 'startup') {
      if (this.startupClaimed) return this.status();
      this.startupClaimed = true;
      if (this.options.claimStartup && !this.options.claimStartup()) return this.status();
      if (!this.options.settings().autoOnStartup) return this.status();
    }
    if (this.task) return this.status();
    if (this.restoreReservation) throw new Error('恢复任务进行中，请稍后备份');
    this.controller = new AbortController();
    this.value = { phase: trigger === 'startup' ? 'waiting' : 'exporting', trigger, id: randomUUID(),
      startedAt: Date.now(), message: trigger === 'startup' ? '等待宿主空闲后自动备份' : '正在准备备份', coverage: [] };
    this.task = this.run().finally(() => { this.task = undefined; });
    return structuredClone(this.value);
  }
  settled() { return this.task ?? Promise.resolve(); }
  async reserveRestore() {
    await this.load();
    if (this.stopped || this.task || this.restoreReservation) throw new Error('备份或恢复任务进行中');
    const token = Symbol();
    this.restoreReservation = token;
    return () => { if (this.restoreReservation === token) this.restoreReservation = undefined; };
  }
  dispose() { this.stopped = true; this.controller.abort(); if (this.timer) clearTimeout(this.timer); this.wake?.(); }
  private async waitForIdle() {
    const signal = this.controller.signal;
    while (await this.options.busy()) {
      signal.throwIfAborted();
      this.value.message = '会话、附件或插件操作进行中，自动备份已延后';
      await this.persist();
      await new Promise<void>(resolve => {
        this.wake = resolve;
        this.timer = setTimeout(resolve, this.options.retryMs ?? 5000);
        this.timer.unref?.();
      });
      this.wake = undefined;
    }
    signal.throwIfAborted();
  }
  private async identity() {
    const file = path.join(this.control, 'identity.txt');
    try {
      await writeFile(file, `${await generateIdentity()}\n`, { flag: 'wx', mode: 0o600 });
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await fd.stat();
      if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new Error('备份密钥权限必须为 0600');
      const key = (await fd.readFile('utf8')).trim();
      await identityToRecipient(key);
      this.value.keyPath = file;
      return key;
    } finally { await fd.close(); }
  }
  private async run() {
    let temp: string | undefined;
    const signal = this.controller.signal;
    const settings = { ...this.options.settings() };
    try {
      await this.persist();
      if (!settings.directory.trim() || !path.isAbsolute(settings.directory)) throw new Error('请先配置备份目录的绝对路径');
      if (this.value.trigger === 'startup') await this.waitForIdle();
      const sources = await this.options.sources();
      const destination = await safeDestination(settings.directory, sources.flatMap(s => s.path ? [s.path] : []), this.options.home);
      temp = await mkdtemp(path.join(destination, '.dsh-backup-incomplete-'));
      const stage = path.join(temp, 'payload'); await mkdir(stage, { mode: 0o700 });
      const key = await this.identity();
      this.value.phase = 'exporting'; this.value.message = '正在导出数据'; await this.persist();
      await jsonFile(path.join(stage, 'locations.json'), sources.map(source => ({
        id: source.id, sourcePath: source.path, strategy: source.unsupported ? 'unsupported' : source.export ? 'api' : 'observation',
      })));
      await jsonFile(path.join(stage, 'workbase.json'), await this.options.state());
      this.value.coverage.push({ id: 'workbase', status: 'verified', message: '正式存储 API 的结构化副本；不同数据源不共享全局快照',
        startedAt: Date.now(), completedAt: Date.now() });
      const links: BackupLink[] = [];
      for (const source of sources) {
        signal.throwIfAborted();
        const startedAt = Date.now();
        const record = { id: source.id, startedAt, completedAt: startedAt, status: 'unsupported' as const, message: '' };
        this.value.message = `正在导出 ${source.id}`;
        if (!/^[a-z0-9][a-z0-9-]*$/.test(source.id)) throw new Error('无效的备份范围标识');
        try {
          const target = path.join(stage, 'files', source.id);
          if (source.unsupported) this.value.coverage.push({ ...record, message: source.unsupported });
          else if (source.export) {
            await mkdir(target, { recursive: true, mode: 0o700 });
            this.value.coverage.push({ ...record, status: source.guarantee ?? 'verified', message: await source.export(target, signal) });
          } else if (source.path) {
            try { await lstat(source.path); }
            catch (e) {
              if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
              this.value.coverage.push({ ...record, status: 'absent', message: '该范围未在当前根目录发现' });
              this.value.coverage.at(-1)!.completedAt = Date.now();
              await this.persist();
              continue;
            }
            const copied = await copyObserved(source.path, target, signal, links, `files/${source.id}`);
            this.value.coverage.push({ ...record, status: 'observation',
              message: `文件观察副本；${copied.sqlite} 个 SQLite 在线快照；${copied.skipped} 项运行锁、依赖目录或旁路文件未归档；链接仅记录、不跟随` });
          } else this.value.coverage.push({ ...record, message: '未提供在线导出能力' });
        } catch (e) {
          signal.throwIfAborted();
          if (['ENOSPC', 'EDQUOT', 'EIO'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e;
          // 源中途消失不能当作原本不存在，也不能把半份载荷保留为成功。
          await rm(path.join(stage, 'files', source.id), { recursive: true, force: true });
          this.value.coverage.push({ ...record, status: 'error', message: e instanceof Error ? e.message : '导出失败' });
        }
        this.value.coverage.at(-1)!.completedAt = Date.now();
        await this.persist();
      }
      await jsonFile(path.join(stage, 'links.json'), links);
      const manifest: BackupManifest = { format: 'dsh-workbase-online-backup', version: 1, globalConsistency: false,
        startedAt: this.value.startedAt!, completedAt: Date.now(), coverage: structuredClone(this.value.coverage), files: await inventory(stage, signal) };
      await jsonFile(path.join(stage, 'manifest.json'), manifest);
      this.value.phase = 'encrypting'; this.value.message = '正在加密归档'; await this.persist();
      const encrypted = path.join(temp, 'archive.age');
      await encryptArchive(stage, encrypted, key, signal);
      this.value.phase = 'verifying'; this.value.message = '正在解密回读并校验摘要'; await this.persist();
      await verifyArchive(encrypted, temp, key, manifest, signal);
      signal.throwIfAborted();
      const archiveHandle = await open(encrypted, 'r');
      try { await archiveHandle.sync(); } finally { await archiveHandle.close(); }
      const output = path.join(destination, archiveFilename('backup', this.value.startedAt!, this.value.id!));
      await publishArchive(encrypted, output);
      this.value = { ...this.value, phase: 'completed', completedAt: Date.now(), path: output,
        message: this.value.coverage.some(c => ['observation', 'unsupported', 'error'].includes(c.status))
          ? '备份完成（部分覆盖），请查看范围明细；不是全局一致恢复点' : '备份完成，各范围已校验；不是全局一致恢复点' };
      try {
        const cleanup = await pruneBackups(destination, settings.retentionDays, output, key, signal);
        if (cleanup.removed) this.value.message += `；已清理 ${cleanup.removed} 份过期备份`;
        if (cleanup.skipped) this.value.message += `；${cleanup.skipped} 份旧备份无法校验或清理，已保留`;
      } catch { this.value.message += '；过期备份清理未完成，旧文件已保留'; }
      await this.persist();
    } catch (e) {
      if (this.value.phase === 'completed') {
        this.value.message += '；最近结果持久化失败，请保留本次保存位置';
        return;
      }
      this.value = { ...this.value, phase: signal.aborted ? 'interrupted' : 'failed', completedAt: Date.now(),
        message: signal.aborted ? '宿主退出，备份已中断' : e instanceof Error ? e.message : '备份失败' };
      try { await this.persist(); } catch { /* 无法写入控制目录时仍可从运行中的 RPC 读取失败原因。 */ }
    } finally {
      if (temp) await rm(temp, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
