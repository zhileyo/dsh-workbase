import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, realpath, mkdir, rename, rm, writeFile, open, link } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, isAbsolute, sep } from 'node:path';

export const MAX_SKILL_FILES = 500;
export const MAX_SKILL_BYTES = 20 * 1024 * 1024;
/** 限额提示与限额判断共用同一组常量：改上限只改上面两行，文案随之更新。 */
export const SKILL_LIMIT_MESSAGE = `技能最多 ${MAX_SKILL_FILES} 个文件、${MAX_SKILL_BYTES / (1024 * 1024)} MB`;
export const SKILL_IMPORT_LIMIT_MESSAGE = `技能导入最多 ${MAX_SKILL_FILES} 个文件、${MAX_SKILL_BYTES / (1024 * 1024)} MB`;
export type SkillBundle = Map<string, Buffer>;
export const absent = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
export const digest = (bundle: SkillBundle) => {
  const hash = createHash('sha256');
  for (const [name, data] of [...bundle].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(JSON.stringify([name, data.length])); hash.update(data);
  }
  return hash.digest('hex');
};
export async function exists(path: string) {
  try { await lstat(path); return true; } catch (error) { if (absent(error)) return false; throw error; }
}
export async function safePath(path: string) {
  const full = resolve(path); let current = full;
  while (true) {
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error('技能路径不可使用符号链接');
    } catch (error) { if (!absent(error)) throw error; }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return full;
}
export function contained(root: string, path: string) {
  const part = relative(resolve(root), resolve(path));
  return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
}
export async function canonicalDirectory(path: string) {
  if (!isAbsolute(path)) throw new Error('来源必须是绝对目录');
  await safePath(path);
  const result = await realpath(path);
  if (!(await lstat(result)).isDirectory()) throw new Error('来源不是目录');
  return result;
}
export async function readBundle(path: string): Promise<SkillBundle> {
  await safePath(path);
  const result: SkillBundle = new Map();
  let bytes = 0;
  async function visit(current: string, name: string, depth: number) {
    if (depth > 20) throw new Error('技能目录层级过深');
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('技能关联文件不可使用符号链接');
    if (info.isDirectory()) {
      for (const entry of await readdir(current)) await visit(join(current, entry), name ? `${name}/${entry}` : entry, depth + 1);
    } else if (info.isFile()) {
      if (result.size >= MAX_SKILL_FILES || (bytes += info.size) > MAX_SKILL_BYTES) throw new Error(SKILL_LIMIT_MESSAGE);
      result.set(name || 'SKILL.md', await readFile(current));
    } else throw new Error('技能目录仅接受普通文件');
  }
  await visit(path, '', 0);
  return result;
}
/** 关联文件必须落在技能目录内；本地写入与沙箱写入共用这一条判定。 */
export function bundleTarget(root: string, name: string) {
  const target = join(root, name);
  if (!contained(root, target) || !name || name.includes('\\')) throw new Error('关联文件路径越界');
  return target;
}
/** 原子写入的临时路径；本地写入与沙箱子进程共用同一命名规则。 */
export const temporaryPath = (path: string) => `${path}.${randomUUID()}.tmp`;
export async function writeBundle(path: string, bundle: SkillBundle) {
  await safePath(path); await mkdir(path, { recursive: true, mode: 0o700 });
  for (const [name, data] of bundle) {
    const target = bundleTarget(path, name);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, data, { flag: 'wx', mode: 0o600 });
  }
}
export async function atomicJson(path: string, value: unknown, exclusive = false) {
  await safePath(path); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = temporaryPath(path);
  try {
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
    // 独占发布完整日志，既不覆盖另一事务，也不暴露半写入的 JSON。
    if (exclusive) await link(temp, path); else await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
}
export interface FilePlan { path: string; next?: SkillBundle; expected?: string }
/** 目录事务的变更接点；受限宿主必须提供完整约束的实现，包括回滚与恢复。 */
export interface SkillFileOperations {
  writeBundle: typeof writeBundle;
  atomicJson: typeof atomicJson;
  rename(source: string, destination: string): Promise<void>;
  remove(path: string, options: { recursive?: boolean; force?: boolean }): Promise<void>;
}
export const localSkillFileOperations: SkillFileOperations = { writeBundle, atomicJson, rename, remove: rm };
interface JournalRow { path: string; backup: string; stage: string; hadOriginal: boolean; prepared?: boolean; digest?: string }
interface Journal { id: string; rows: JournalRow[] }
/** 备份与暂存路径的唯一公式：写入侧生成、恢复侧校验都调用它，命名变更无法只改一半。 */
export function journalPaths(id: string, path: string) {
  const base = join(dirname(path), `.wb-${id}-${basename(path)}`);
  return { backup: `${base}.backup`, stage: `${base}.stage` };
}
/** 写入可能已发布但无法读回确认，禁止回滚或删除恢复日志。 */
export class SkillCommitUncertainError extends Error {
  constructor(cause: unknown) {
    super('技能提交结果无法确认，文件与恢复日志已保留，请恢复宿主读取能力后重试', { cause });
  }
}
/** 全目标预检、预写，然后发布目标并撤下旧安装；失败反向回滚，崩溃保留可恢复日志。 */
export async function fileTransaction(root: string, plans: FilePlan[], commit: (id: string) => Promise<void>,
  files: SkillFileOperations = localSkillFileOperations) {
  const journal = join(root, 'transaction.json');
  if (await exists(journal)) throw new Error('技能事务尚未恢复，请先处理恢复日志');
  const id = randomUUID(), rows: JournalRow[] = [];
  for (let i = 0; i < plans.length; i++) {
    if (!isAbsolute(plans[i]!.path) || plans.some((plan, j) => j !== i
      && (contained(plans[i]!.path, plan.path) || contained(plan.path, plans[i]!.path))))
      throw new Error('技能事务目标重复或嵌套');
  }
  for (const plan of plans) {
    await safePath(plan.path);
    const hadOriginal = await exists(plan.path);
    if (hadOriginal) {
      if (!plan.expected || digest(await readBundle(plan.path)) !== plan.expected) throw new Error('技能文件已被外部修改或目标同名冲突，请重新扫描');
    } else if (plan.expected) throw new Error('原技能文件已消失，请重新扫描');
    rows.push({ path: plan.path, ...journalPaths(id, plan.path), hadOriginal,
      digest: plan.next ? digest(plan.next) : undefined });
  }
  let journalWritten = false;
  try {
    for (let i = 0; i < plans.length; i++) if (plans[i]!.next) {
      await files.writeBundle(rows[i]!.stage, plans[i]!.next!); rows[i]!.prepared = true;
    }
    await files.atomicJson(journal, { id, rows } satisfies Journal, true); journalWritten = true;
    for (const row of rows) {
      // 预写期间外部工具可能改变文件，发布前再次核对。
      const plan = plans.find(value => value.path === row.path)!;
      if (row.hadOriginal && digest(await readBundle(row.path)) !== plan.expected) throw new Error('技能文件发生并发修改');
      if (!row.hadOriginal && await exists(row.path)) throw new Error('目标技能被其他工具创建');
      if (row.hadOriginal) await files.rename(row.path, row.backup);
      if (row.digest) await files.rename(row.stage, row.path);
    }
    await commit(id);
  } catch (error) {
    if (error instanceof SkillCommitUncertainError) throw error;
    try {
      await rollback(rows, files);
      if (journalWritten) await files.remove(journal, { force: true });
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], `技能保存失败且回滚未完成，恢复副本已保留：${String(error)}`);
    }
    throw error;
  }
  try {
    await cleanup(rows, files);
    await files.remove(journal, { force: true });
  } catch { /* 状态已经提交；恢复日志保留到下次初始化，不能把已保存误报为未保存。 */ }
}
async function rollback(rows: JournalRow[], files: SkillFileOperations) {
  for (const row of [...rows].reverse()) {
    await safePath(row.path);
    const backupExists = await exists(row.backup), stageExists = await exists(row.stage);
    if (await exists(row.path) && row.digest && digest(await readBundle(row.path)) === row.digest
      && (backupExists || (!row.hadOriginal && row.prepared && !stageExists)))
      await files.remove(row.path, { recursive: true });
    if (backupExists) {
      if (await exists(row.path)) throw new Error('回滚路径被外部修改，恢复副本已保留');
      await files.rename(row.backup, row.path);
    }
    if (stageExists) await files.remove(row.stage, { recursive: true, force: true });
  }
}
async function cleanup(rows: JournalRow[], files: SkillFileOperations) {
  for (const row of rows) {
    await safePath(row.backup); await safePath(row.stage);
    if (await exists(row.backup)) await files.remove(row.backup, { recursive: true, force: true });
    if (await exists(row.stage)) await files.remove(row.stage, { recursive: true, force: true });
  }
}
export async function recoverTransaction(root: string, committedId?: string,
  operations?: (paths: string[]) => Promise<SkillFileOperations>) {
  const path = join(root, 'transaction.json');
  let journal: Journal;
  try { journal = JSON.parse(await readFile(path, 'utf8')) as Journal; } catch (error) { if (absent(error)) return; throw error; }
  if (!journal || typeof journal.id !== 'string' || !/^[\w-]+$/.test(journal.id)
    || !Array.isArray(journal.rows)) throw new Error('技能事务恢复日志损坏');
  for (const row of journal.rows) {
    if (!row || typeof row.path !== 'string' || !isAbsolute(row.path) || typeof row.hadOriginal !== 'boolean'
      || (row.digest !== undefined && !/^[a-f0-9]{64}$/.test(row.digest)))
      throw new Error('技能事务日志路径无效');
    const paths = journalPaths(journal.id, row.path);
    if (row.backup !== paths.backup || row.stage !== paths.stage) throw new Error('技能事务日志路径无效');
    await safePath(row.path); await safePath(row.backup); await safePath(row.stage);
  }
  const files = await operations?.([path, ...journal.rows.flatMap(row => [row.path, row.backup, row.stage])])
    ?? localSkillFileOperations;
  if (journal.id === committedId) await cleanup(journal.rows, files); else await rollback(journal.rows, files);
  await files.remove(path, { force: true });
}
