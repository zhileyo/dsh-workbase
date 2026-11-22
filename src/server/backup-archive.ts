import { constants, createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, lstat, open, link } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Readable, Transform } from 'node:stream';
import { pipeline, finished } from 'node:stream/promises';
import path from 'node:path';
import { Encrypter, Decrypter, identityToRecipient } from 'age-encryption';
import { c } from 'tar';
import type { BackupManifest } from '../shared/backup.js';

export function archiveFilename(kind: 'backup' | 'rollback', time: number, id: string) {
  const date = new Date(time), pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `dsh-${kind === 'rollback' ? 'rollback-' : ''}${day}-${clock}-${id.slice(0, 8)}.tar.age`;
}
/** 暂存文件与目标在同一文件系统；原子建立正式名称，EEXIST 时绝不覆盖。暂存链接由任务清理。 */
export async function publishArchive(source: string, destination: string) {
  await link(source, destination);
}

export async function digest(file: string, signal: AbortSignal) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const data of createReadStream(file, { signal })) { hash.update(data); bytes += data.length; }
  return { sha256: hash.digest('hex'), bytes };
}
export async function inventory(root: string, signal: AbortSignal, relative = ''): Promise<BackupManifest['files']> {
  const result: BackupManifest['files'] = [];
  for (const name of (await readdir(path.join(root, relative))).sort()) {
    signal.throwIfAborted();
    const rel = relative ? `${relative}/${name}` : name;
    const file = path.join(root, rel), info = await lstat(file);
    if (info.isDirectory()) result.push(...await inventory(root, signal, rel));
    else if (info.isFile()) result.push({ path: rel, ...await digest(file, signal) });
    else throw new Error('归档载荷不允许符号链接或特殊文件');
  }
  return result;
}
export async function encryptArchive(stage: string, output: string, identity: string, signal: AbortSignal) {
  const encrypter = new Encrypter();
  encrypter.addRecipient(await identityToRecipient(identity));
  const tar = c({ cwd: stage, portable: true, noMtime: true, gzip: false }, (await readdir(stage)).sort());
  const encrypted = await encrypter.encrypt(Readable.toWeb(Readable.from(tar)) as unknown as ReadableStream<Uint8Array>);
  await pipeline(Readable.fromWeb(encrypted as unknown as import('node:stream/web').ReadableStream),
    createWriteStream(output, { flags: 'wx', mode: 0o600 }), { signal });
}
export async function decryptArchive(input: string, output: string, identity: string, signal: AbortSignal, maxBytes = Infinity) {
  const decrypter = new Decrypter(); decrypter.addIdentity(identity);
  const handle = await open(input, constants.O_RDONLY | constants.O_NOFOLLOW);
  const source = handle.createReadStream({ signal });
  try {
    const decrypted = await decrypter.decrypt(Readable.toWeb(source) as unknown as ReadableStream<Uint8Array>);
    let bytes = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maxBytes ? new Error('解密载荷大小超出限制') : null, chunk);
    } });
    await pipeline(Readable.fromWeb(decrypted as unknown as import('node:stream/web').ReadableStream),
      limit, createWriteStream(output, { flags: 'wx', mode: 0o600 }), { signal });
  } finally { source.destroy(); await finished(source).catch(() => undefined); await handle.close(); }
}
/** 发布与恢复共用完整准入，回读成功意味着同一归档能通过恢复扫描。 */
export async function verifyArchive(input: string, directory: string, identity: string, expected: BackupManifest, signal: AbortSignal) {
  const stage = path.join(directory, 'verified');
  await mkdir(stage, { mode: 0o700 });
  const { inspectArchive } = await import('./restore-archive.js');
  const { manifest } = await inspectArchive(input, stage, identity, signal);
  if (!isDeepStrictEqual(manifest, expected)) throw new Error('备份清单校验失败');
}
