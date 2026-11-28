import { mkdir, lstat, open, rm, writeFile } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Parser, x } from 'tar';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { backupManifestSchema } from '../shared/backup.js';
import type { BackupManifest } from '../shared/backup.js';
import { isWindowsReservedName } from '../shared/fs-name.js';
import { canonical } from './backup-files.js';
import { decryptArchive, inventory } from './backup-archive.js';

export async function privateDirectory(parent: string, name: string) {
  const root = await canonical(parent), dir = path.join(root, name);
  try { await mkdir(dir, { mode: 0o700 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || await canonical(dir) !== dir) throw new Error('恢复暂存目录不得是符号链接');
  return dir;
}
export async function readIdentity(file: string) {
  if (!path.isAbsolute(file)) throw new Error('恢复密钥需要绝对路径');
  return readIdentityKey(file, info => {
    if (!info.isFile() || info.size > 4096 || (process.platform !== 'win32' && (info.mode & 0o077) !== 0))
      throw new Error('恢复密钥必须是权限为0600的小型普通文件');
  });
}
/** 密钥不存在则生成；已存在时保持原样，交由调用方的准入校验把关。 */
export async function writeIdentityOnce(file: string) {
  try { await writeFile(file, `${await generateIdentity()}\n`, { flag: 'wx', mode: 0o600 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
}
export async function ensureIdentity(control: string) {
  const keyPath = path.join(control, 'identity.txt');
  await writeIdentityOnce(keyPath);
  return { keyPath, key: await readIdentity(keyPath) };
}
/** 密钥读取的唯一机制：O_NOFOLLOW 打开、调用方准入校验、identityToRecipient 验键。
 * 备份与恢复的准入条件（大小、权限、文案）不同，作为参数传入，机制只留这一份。 */
export async function readIdentityKey(file: string,
  check: (info: { isFile(): boolean; size: number; mode: number }) => void) {
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await fd.stat();
    check(info);
    const key = (await fd.readFile('utf8')).trim();
    await identityToRecipient(key);
    return key;
  } finally { await fd.close(); }
}
export function archivePathSafe(name: string, directory = false) {
  const value = directory ? name.replace(/\/$/, '') : name;
  return value.length > 0 && value.length <= 4096 && !/[\\:\u0000-\u001f]/.test(value)
    && !value.startsWith('/') && value.split('/').every(segment =>
      segment !== '' && segment !== '.' && segment !== '..' && !/[. ]$/.test(segment)
      && !isWindowsReservedName(segment));
}
export function sameFiles(a: BackupManifest['files'], b: BackupManifest['files']) {
  const normalize = (files: BackupManifest['files']) => files.map(f => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 }))
    .sort((x, y) => x.path < y.path ? -1 : x.path > y.path ? 1 : 0);
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
/** 逐个条目扫描解密后的 tar：只做白名单、类型、大小与清单收集，不解包到磁盘。 */
export async function scanArchive(plain: string, signal: AbortSignal) {
  const names = new Map<string, number>(), folded = new Set<string>();
  let manifestText = '', manifestCount = 0, entryCount = 0, bytes = 0;
  let failure: Error | undefined;
  const decoder = new StringDecoder('utf8');
  const input = createReadStream(plain);
  const parser = new Parser({ strict: true, onReadEntry: entry => {
    try {
      signal.throwIfAborted();
      if (failure) { entry.resume(); return; }
      if (++entryCount > 150000 || !archivePathSafe(entry.path, entry.type === 'Directory')) throw new Error('归档包含不安全路径或过多条目');
      if (!['File', 'Directory'].includes(entry.type)) throw new Error('恢复归档不允许链接或特殊文件');
      const name = entry.path.replace(/\/$/, ''), foldedName = name.toLowerCase();
      if (folded.has(foldedName)) throw new Error('归档包含重复或大小写冲突的路径');
      folded.add(foldedName);
      if (entry.type === 'File') {
        if (entry.size < 0 || !Number.isSafeInteger(entry.size) || (bytes += entry.size) > 64 * 1024 ** 3) throw new Error('归档大小超出限制');
        names.set(name, entry.size);
        if (name === 'manifest.json') {
          if (++manifestCount !== 1 || entry.size > 32 * 1024 ** 2) throw new Error('备份清单缺失或过大');
          entry.on('data', chunk => { if (!failure) manifestText += decoder.write(chunk); });
          entry.on('end', () => { if (!failure) manifestText += decoder.end(); });
        }
      }
    } catch (e) {
      failure = e instanceof Error ? e : new Error('归档扫描失败');
      // 首个非法条目就停止读取：abort 必然抛出以打断解析，随后关闭底层文件流
      try { parser.abort(failure); } catch { /* 中断解析的预期抛出 */ }
      input.destroy();
    }
    entry.resume();
  } });
  await new Promise<void>((resolve, reject) => {
    const stop = (error: Error) => { input.destroy(); reject(error); };
    parser.once('error', stop);
    input.once('error', stop);
    parser.once('end', () => resolve());
    input.pipe(parser);
  });
  if (failure) throw failure;
  return { names, manifestText, manifestCount };
}
/** 解密后的 tar 先扫描全部条目，再按清单白名单解包；绝不激活归档中的源路径或链接。 */
export async function inspectArchive(archive: string, stage: string, key: string, signal: AbortSignal) {
  if (!path.isAbsolute(archive)) throw new Error('备份文件需要绝对路径');
  const fd = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if (!(await fd.stat()).isFile()) throw new Error('备份必须是普通文件'); }
  finally { await fd.close(); }
  const plain = path.join(stage, 'archive.tar'), payload = path.join(stage, 'payload');
  await decryptArchive(archive, plain, key, signal, 64 * 1024 ** 3);
  const { names, manifestText, manifestCount } = await scanArchive(plain, signal);
  if (manifestCount !== 1) throw new Error('备份没有唯一清单');
  const manifest = backupManifestSchema.parse(JSON.parse(manifestText));
  const allowed = new Set<string>(['manifest.json']);
  for (const file of manifest.files) {
    if (!archivePathSafe(file.path) || allowed.has(file.path) || names.get(file.path) !== file.bytes)
      throw new Error('清单路径、文件数量或大小不一致');
    allowed.add(file.path);
  }
  if (allowed.size !== names.size) throw new Error('归档包含清单以外的文件');
  for (const name of names.keys()) {
    const pieces = name.split('/');
    for (let i = 1; i < pieces.length; i++) if (names.has(pieces.slice(0, i).join('/'))) throw new Error('文件与目录路径冲突');
  }
  await mkdir(payload, { mode: 0o700 });
  await x({ file: plain, cwd: payload, strict: true, preservePaths: false, noChmod: true,
    umask: 0o077, fmode: 0o600, dmode: 0o700,
    filter: (name, entry) => {
      if (signal.aborted || !('type' in entry)) return false;
      return entry.type === 'Directory' ? archivePathSafe(name, true) : entry.type === 'File' && allowed.has(name);
    } });
  // 解包完成即删掉解密出来的明文 tar：里面是整份备份内容，留在暂存目录里毫无用处，还会随预览次数累积。
  await rm(plain, { force: true });
  signal.throwIfAborted();
  const actual = (await inventory(payload, signal)).filter(file => file.path !== 'manifest.json');
  if (!sameFiles(actual, manifest.files)) throw new Error('恢复文件摘要校验失败');
  return { manifest, payload };
}
