import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorkbaseError } from '../shared/model.js';
import { projectRulesSchema, type ProjectRules, type RuleTarget, type RuleReceipt } from '../shared/project-rules.js';

const START = '<!-- dsh-workbase:rules:start -->';
const END = '<!-- dsh-workbase:rules:end -->';
const MAX_BYTES = 2 * 1024 * 1024;
function block(rules: ProjectRules, projectId?: string) {
  const sections = projectId === undefined
    ? rules.global.enabled ? [rules.global.content.trim()] : []
    : rules.projects.filter(rule => rule.enabled && rule.projectIds.includes(projectId))
      .map(rule => `### ${rule.name}\n\n${rule.content.trim()}`);
  return sections.length ? `\n${START}\n## 工作台规则\n\n${sections.join('\n\n')}\n${END}\n` : '';
}
interface FileValue { text: string; ino: number; dev: number; mode: number }
async function read(file: string): Promise<FileValue | null> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new WorkbaseError('rules-conflict', '规则文件必须是普通文件，不能使用符号链接或硬链接');
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const current = await handle.stat();
      if (current.ino !== info.ino || current.dev !== info.dev || current.size > MAX_BYTES)
        throw new WorkbaseError('rules-conflict', '规则文件已变化或超过 2 MiB');
      const bytes = await handle.readFile();
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      return { text, ino: current.ino, dev: current.dev, mode: current.mode };
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function equal(a: FileValue | null, b: FileValue | null) {
  return a === null || b === null ? a === b : a.text === b.text && a.ino === b.ino && a.dev === b.dev;
}
function replace(text: string, before: string, after: string) {
  const marker = text.indexOf(START), start = marker > 0 && text[marker - 1] === '\n' ? marker - 1 : marker, end = text.indexOf(END);
  if (start < 0 && end < 0) {
    if (text.includes('dsh-workbase:rules') || before)
      throw new WorkbaseError('rules-conflict', '工作台规则区块已在外部修改，请恢复原区块后重试');
    // 区块起始空行属于工作台，清理时一起移除，保留此前正文逐字一致。
    return after ? text + after : text;
  }
  if (start < 0 || end < start || text.indexOf(START, marker + START.length) >= 0 || text.indexOf(END, end + 1) >= 0
    || !before || text.slice(start, end + END.length + (text[end + END.length] === '\n' ? 1 : 0)) !== before)
    throw new WorkbaseError('rules-conflict', '工作台规则区块已在外部修改，请恢复原区块后重试');
  return text.slice(0, start) + after + text.slice(start + before.length);
}
interface Stage { file: string; source: string; directory: string; directoryId: { ino: number; dev: number }; before: FileValue | null; text: string; written?: FileValue }

/** 普通异常事务：先预检全部文件；每次替换前复查；存储失败仅回滚仍属于本次写入的文件。 */
export async function saveRuleFiles(home: string, previous: ProjectRules, value: ProjectRules, targets: RuleTarget[]): Promise<RuleReceipt> {
  const before = projectRulesSchema.parse(previous), next = projectRulesSchema.parse(value);
  const stages: Stage[] = [];
  const directories = new Set<string>();
  const plans = [{ path: home, projectId: undefined }, ...targets];
  for (const plan of plans) {
    const oldBlock = block(before, plan.projectId), newBlock = block(next, plan.projectId);
    if (!oldBlock && !newBlock) continue;
    if (!path.isAbsolute(plan.path)) throw new WorkbaseError('invalid-root', '规则目录必须使用绝对路径');
    // 目录缺失时报裸 realpath ENOENT 对用户不可读（典型场景：迁移撤销前的源目录），转成既有友好错误。
    const directory = await realpath(plan.path).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      throw new WorkbaseError('directory-unavailable', '项目目录不可用，无法保存规则');
    });
    const directoryId = await lstat(plan.path);
    if (!directoryId.isDirectory() || !(await lstat(directory)).isDirectory())
      throw new WorkbaseError('rules-conflict', '规则目录不能使用符号链接或已变化的路径');
    if (directories.has(directory)) throw new WorkbaseError('rules-conflict', '全局规则与项目规则目录不能重复');
    directories.add(directory);
    const file = path.join(directory, 'AGENTS.md'), current = await read(file);
    const text = replace(current?.text ?? '', oldBlock, newBlock);
    if (Buffer.byteLength(text) > MAX_BYTES) throw new WorkbaseError('invalid', '规则文件不能超过 2 MiB');
    if (text !== (current?.text ?? '')) stages.push({ file, source: plan.path, directory, directoryId, before: current, text });
  }
  async function check(stage: Stage, expected: FileValue | null) {
    const directory = await lstat(stage.directory);
    if (directory.ino !== stage.directoryId.ino || directory.dev !== stage.directoryId.dev
      || await realpath(stage.source) !== stage.directory || !equal(await read(stage.file), expected))
      throw new WorkbaseError('rules-conflict', '规则文件已在外部修改，保存已停止');
  }
  async function write(stage: Stage, text: string, expected: FileValue | null): Promise<FileValue> {
    const temp = path.join(stage.directory, `.wb-rules-${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx', expected?.mode ?? 0o600);
    try {
      await handle.writeFile(text, 'utf8');
      if (expected) await handle.chmod(expected.mode & 0o777);
      await handle.sync();
      const identity = await handle.stat();
      await handle.close();
      await check(stage, expected);
      // 新文件通过硬链接排他创建，不能把预检后创建的外部文件覆盖掉。
      if (expected === null) {
        const { link } = await import('node:fs/promises');
        await link(temp, stage.file);
        stage.written = { text, ino: identity.ino, dev: identity.dev, mode: identity.mode };
        await unlink(temp);
      } else await rename(temp, stage.file);
      stage.written = { text, ino: identity.ino, dev: identity.dev, mode: identity.mode };
      const written = await read(stage.file);
      if (!equal(written, stage.written)) throw new WorkbaseError('rules-conflict', '规则保存后被外部修改');
      if (!written) throw new WorkbaseError('rules-conflict', '规则保存后被外部删除');
      return written;
    } finally { await handle.close().catch(() => {}); await unlink(temp).catch(() => {}); }
  }
  const rollback = async () => {
    const failed: string[] = [];
    for (const stage of [...stages].reverse()) {
      if (!stage.written) continue;
      try {
        await check(stage, stage.written);
        if (stage.before) await write(stage, stage.before.text, stage.written);
        else await unlink(stage.file);
        stage.written = undefined;
      } catch { failed.push(stage.file); }
    }
    if (failed.length) throw new WorkbaseError('rollback-failed', `规则回滚失败，文件已保留，请检查：${failed.join('；')}`);
  };
  try {
    for (const stage of stages) stage.written = await write(stage, stage.text, stage.before);
  } catch (error) { await rollback(); throw error; }
  return { rollback };
}
