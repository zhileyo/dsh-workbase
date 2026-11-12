import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readlink, realpath, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { digest } from './backup-archive.js';

const exec = promisify(execFile);
export interface BackupSource {
  id: string;
  path?: string;
  unsupported?: string;
  guarantee?: 'verified' | 'observation';
  export?(destination: string, signal: AbortSignal): Promise<string>;
}
export interface BackupLink { path: string; target: string; type: 'symlink' | 'hardlink' }
export const within = (parent: string, child: string) => {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};
export async function canonical(target: string): Promise<string> {
  try { return await realpath(target); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const parent = path.dirname(target);
    if (parent === target) throw e;
    return path.join(await canonical(parent), path.basename(target));
  }
}
export async function safeDestination(directory: string, roots: string[], home: string) {
  if (!directory.trim() || !path.isAbsolute(directory)) throw new Error('请先配置备份目录的绝对路径');
  const dest = await canonical(directory);
  for (const root of [home, ...roots]) {
    const source = await canonical(root);
    if (within(source, dest) || within(dest, source)) throw new Error('备份目录不得与数据源目录重叠');
  }
  await mkdir(dest, { recursive: true, mode: 0o700 });
  if (await realpath(directory) !== dest) throw new Error('备份目录在创建时发生变化');
  return dest;
}

/**
 * lstat 识别出的符号链接仅记录指向，不遍历或复制其目标；硬链接存内容并记录关系。
 * realpath 用于根路径规范化与越界检查，会解析路径中的符号链接；O_NOFOLLOW 仅保护普通文件打开时的最后一段路径。
 * 检查与后续读取并非原子操作，无法保证阻止并发替换父目录或 SQLite 按路径重新打开时发生的链接跟随。
 * 普通文件是观察副本，SQLite 使用在线 backup；此流程不提供对恶意并发路径替换的完整隔离。
 */
export async function copyObserved(source: string, destination: string, signal: AbortSignal,
  links: BackupLink[], label: string): Promise<{ sqlite: number; skipped: number }> {
  const root = await canonical(source), inodes = new Map<string, string>();
  const totals = { sqlite: 0, skipped: 0 };
  async function visit(from: string, to: string, rel: string) {
    signal.throwIfAborted();
    const before = await lstat(from);
    if (before.isSymbolicLink()) {
      links.push({ path: rel, target: await readlink(from), type: 'symlink' });
      return;
    }
    if (!within(root, await realpath(from))) throw new Error('数据源在复制时越界');
    if (before.isDirectory()) {
      await mkdir(to, { recursive: true, mode: 0o700 });
      for (const name of (await readdir(from)).sort()) {
        if (name === 'node_modules' || name === '.git' || name === 'backup' || name.endsWith('.lock')) {
          totals.skipped++; continue;
        }
        // 仅排除已确认 SQLite 主库的运行时旁路文件；其他同名文件仍保留。
        if (name.endsWith('-wal') || name.endsWith('-shm')) {
          const base = path.join(from, name.slice(0, -4));
          try {
            const fd = await open(base, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
              const header = Buffer.alloc(16); await fd.read(header, 0, 16, 0);
              if (header.toString() === 'SQLite format 3\u0000') { totals.skipped++; continue; }
            } finally { await fd.close(); }
          } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        }
        await visit(path.join(from, name), path.join(to, name), `${rel}/${name}`);
      }
      const after = await lstat(from);
      if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs) throw new Error('源目录在读取时发生变化，请重试');
      return;
    }
    if (!before.isFile()) { totals.skipped++; return; }
    await mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
    const fd = await open(from, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await fd.stat();
      if (opened.ino !== before.ino || opened.dev !== before.dev) throw new Error('源文件在打开时发生变化');
      const header = Buffer.alloc(16); await fd.read(header, 0, 16, 0);
      if (header.toString() === 'SQLite format 3\u0000') {
        const dbDir = `${to}.sqlite-stage`;
        await mkdir(dbDir, { mode: 0o700 });
        await exec('sqlite3', ['-readonly', from, '.backup snapshot.db'],
          { cwd: dbDir, signal, timeout: 60_000, maxBuffer: 1024 * 1024 });
        // 在线 backup 继承主库的 WAL 标记；只转换暂存副本，使单文件归档可独立只读打开。
        await exec('sqlite3', [path.join(dbDir, 'snapshot.db'), 'PRAGMA journal_mode=DELETE;'],
          { signal, timeout: 60_000 });
        const check = await exec('sqlite3', ['-readonly', path.join(dbDir, 'snapshot.db'), 'PRAGMA integrity_check;'],
          { signal, timeout: 60_000 });
        if (check.stdout.trim() !== 'ok') throw new Error('SQLite 完整性检查失败');
        await rename(path.join(dbDir, 'snapshot.db'), to); await chmod(to, 0o600);
        // SQLite 退出后可能保留副本的 shm；仅清理本次创建的暂存目录。
        await rm(dbDir, { recursive: true, force: true });
        const current = await lstat(from);
        if (current.ino !== before.ino || current.dev !== before.dev || current.isSymbolicLink()) throw new Error('数据库源在备份时被替换');
        totals.sqlite++;
      } else {
        // FileHandle 流固定已打开 inode；逐次读取不会把整份历史日志装进内存。
        const output = await open(to, 'wx', 0o600);
        try {
          const buffer = Buffer.alloc(256 * 1024);
          let offset = 0;
          while (true) {
            signal.throwIfAborted();
            const { bytesRead } = await fd.read(buffer, 0, buffer.length, offset);
            if (!bytesRead) break;
            let written = 0;
            while (written < bytesRead) written += (await output.write(buffer, written, bytesRead - written, offset + written)).bytesWritten;
            offset += bytesRead;
          }
        } finally { await output.close(); }
        const sourceHash = createHash('sha256'), buffer = Buffer.alloc(256 * 1024);
        for (let offset = 0;;) {
          signal.throwIfAborted();
          const result = await fd.read(buffer, 0, buffer.length, offset);
          if (!result.bytesRead) break;
          sourceHash.update(buffer.subarray(0, result.bytesRead)); offset += result.bytesRead;
        }
        const after = await lstat(from), read = await fd.stat();
        if (before.ino !== after.ino || before.size !== read.size || before.mtimeMs !== read.mtimeMs
          || before.ctimeMs !== read.ctimeMs || sourceHash.digest('hex') !== (await digest(to, signal)).sha256)
          throw new Error('文件在读取时发生变化，请重试');
      }
      const inode = `${before.dev}:${before.ino}`, prior = inodes.get(inode);
      if (prior) links.push({ path: rel, target: prior, type: 'hardlink' });
      else inodes.set(inode, rel);
    } finally { await fd.close(); }
  }
  await visit(source, destination, label);
  return totals;
}
export async function jsonFile(destination: string, value: unknown) {
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
}
