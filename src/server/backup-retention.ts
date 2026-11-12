import { readdir, lstat, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { BackupPreferences } from '../shared/backup.js';
import { inspectArchive } from './restore-archive.js';

/** 仅在新归档发布成功后调用；清单时间与完整校验共同决定删除，回滚永不参与。 */
export async function pruneBackups(directory: string, days: BackupPreferences['retentionDays'], current: string,
  key: string, signal: AbortSignal, now = Date.now()) {
  const result = { removed: 0, skipped: 0 };
  if (!days) return result;
  const cutoff = now - days * 86400000;
  for (const name of await readdir(directory)) {
    signal.throwIfAborted();
    const short = /^dsh-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[a-f0-9]{8}\.tar\.age$/.exec(name);
    const legacy = /^dsh-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.tar\.age$/.exec(name);
    if (!short && !legacy) continue;
    const time = short ? new Date(+short[1]!, +short[2]! - 1, +short[3]!, +short[4]!, +short[5]!, +short[6]!).getTime()
      : Date.parse(legacy![1]!.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z'));
    if (!Number.isFinite(time) || time >= cutoff) continue;
    const file = path.join(directory, name);
    if (file === current) continue;
    let stage: string | undefined;
    try {
      const before = await lstat(file);
      if (!before.isFile() || before.isSymbolicLink()) continue;
      stage = await mkdtemp(path.join(directory, '.dsh-retention-'));
      const { manifest } = await inspectArchive(file, stage, key, signal);
      if (manifest.startedAt >= cutoff || manifest.completedAt >= cutoff) continue;
      const after = await lstat(file);
      if (!after.isFile() || before.ino !== after.ino || before.dev !== after.dev
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
        throw new Error('归档在校验期间发生变化');
      signal.throwIfAborted();
      await rm(file);
      result.removed++;
    } catch {
      signal.throwIfAborted();
      result.skipped++;
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true });
    }
  }
  return result;
}
