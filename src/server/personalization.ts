import { constants } from 'node:fs';
import { lstat, open, realpath, rename, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { FileSystem, FsVersion } from '@deepseek-ai/dsh-fs';
import { personalFiles, personalDocumentSchema, personalFileSchema, type PersonalDocument, type PersonalFile, type PersonalPort } from '../shared/personalization.js';
import { WorkbaseError } from '../shared/model.js';

const MAX_BYTES = 80000;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
/** 文件是持久化真源；官方提示词提供者读取已校验的内存快照。 */
export class Personalization implements PersonalPort {
  private cache = new Map<PersonalFile, string>();
  private tail: Promise<unknown> = Promise.resolve();
  private fs?: FileSystem;
  active = false;
  constructor(private readonly home: string, private readonly source?: FileSystem | (() => FileSystem | undefined),
    private readonly changed: () => void = () => {}) {}
  private serial<T>(run: () => Promise<T>) {
    const pending = this.tail.then(() => {
      // 每次操作探测可选官方服务；同一次事务不因热插拔切换后端。
      this.fs = typeof this.source === 'function' ? this.source() : this.source;
      return run();
    });
    this.tail = pending.catch(() => {});
    return pending;
  }
  prompt() {
    return personalFiles.flatMap(file => {
      const text = this.cache.get(file);
      return text?.trim() ? [`## ${file}\n${text}`] : [];
    }).join('\n\n');
  }
  private async location(file: PersonalFile, signal?: AbortSignal) {
    const checked = personalFileSchema.parse(file);
    if (!path.isAbsolute(this.home)) throw new WorkbaseError('invalid', '档案目录必须为绝对路径');
    if (this.fs) {
      const root = this.fs.processPathFromHostPath(this.home);
      if (!root) throw new WorkbaseError('unavailable', '官方文件服务无法访问档案目录');
      const info = await this.fs.lstat(root, undefined, signal);
      if (info?.type !== 'directory') throw new WorkbaseError('invalid', '档案目录必须为普通目录，不能使用链接');
      const filename = path.join(root, checked);
      const meta = await this.fs.lstat(filename, undefined, signal);
      if (meta && meta.type !== 'file') throw new WorkbaseError('invalid', '档案必须为普通文件，不能使用链接');
      if ((meta?.size ?? 0) > MAX_BYTES) throw new WorkbaseError('invalid', '档案文件过大');
      return { root, filename };
    }
    const info = await lstat(this.home);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new WorkbaseError('invalid', '档案目录必须为普通目录，不能使用链接');
    const root = await realpath(this.home);
    return { root, filename: path.join(root, checked) };
  }
  private async read(file: PersonalFile, signal?: AbortSignal): Promise<PersonalDocument> {
    const { filename } = await this.location(file, signal);
    if (this.fs) {
      const target = await this.fs.resolve(filename, { signal });
      const info = await this.fs.stat(target, signal);
      if (!info) return { file, content: '', version: null };
      if (info.type !== 'file' || (info.size ?? 0) > MAX_BYTES) throw new WorkbaseError('invalid', '档案必须为普通文本文件');
      const content = await this.fs.readText(target, signal);
      const after = await this.fs.stat(target, signal);
      if (after?.version !== info.version) throw new WorkbaseError('conflict', '档案已在外部修改，请重新读取');
      return personalDocumentSchema.parse({ file, content, version: info.version });
    }
    try {
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_BYTES)
        throw new WorkbaseError('invalid', '档案必须为普通文件，不能使用链接');
      const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const opened = await handle.stat();
        if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size > MAX_BYTES)
          throw new WorkbaseError('conflict', '档案已在外部修改，请重新读取');
        const content = new TextDecoder('utf-8', { fatal: true }).decode(await handle.readFile());
        return personalDocumentSchema.parse({ file, content, version: `${opened.dev}:${opened.ino}:${hash(content)}` });
      } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { file, content: '', version: null };
      throw error;
    }
  }
  list(signal?: AbortSignal) {
    return this.serial(async () => {
      const documents = await Promise.all(personalFiles.map(file => this.read(file, signal)));
      this.cache = new Map(documents.map(doc => [doc.file, doc.content]));
      this.changed();
      return { directory: this.home, active: this.active, documents };
    });
  }
  save(file: PersonalFile, version: string | null, content: string, signal?: AbortSignal) {
    return this.serial(async () => {
      personalDocumentSchema.parse({ file, version, content });
      signal?.throwIfAborted();
      const before = await this.read(file, signal);
      if (before.version !== version) throw new WorkbaseError('conflict', '档案已在外部修改，请重新读取后保存');
      const { root, filename } = await this.location(file, signal);
      if (this.fs) {
        const target = await this.fs.resolve(filename, { signal });
        // 默认模式不是当前调用的授权；限定至档案目录，read-only仍拒绝。
        await this.fs.writeText(target, content, version === null ? { kind: 'createIfAbsent' }
          : { kind: 'replaceIfVersion', version: version as FsVersion }, signal,
        { mode: this.fs.sandboxMode === 'read-only' ? 'read-only' : 'workspace-write', workspaceRoot: root });
      } else {
        const temp = path.join(root, `.wb-personal-${randomUUID()}.tmp`);
        const handle = await open(temp, 'wx', 0o600);
        try {
          await handle.writeFile(content, 'utf8');
          await handle.sync();
          await handle.close();
          signal?.throwIfAborted();
          await this.location(file, signal);
          if ((await this.read(file, signal)).version !== version)
            throw new WorkbaseError('conflict', '档案已在外部修改，保存已停止');
          if (version === null) { await link(temp, filename); await unlink(temp); }
          else await rename(temp, filename);
        } finally { await handle.close().catch(() => {}); await unlink(temp).catch(() => {}); }
      }
      const saved = await this.read(file);
      this.cache.set(file, saved.content);
      this.changed();
      return saved;
    });
  }
}
