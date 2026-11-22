import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import { exists, safePath, type SkillFileOperations } from './skills-files.js';

// 固定程序只解释结构化数据；技能正文、路径与二进制附件绝不拼入代码或 Shell。
// 不依赖包外脚本，Electron 宿主以 RUN_AS_NODE 执行同一个 Node 程序。
const program = `
const { lstat, mkdir, rename, rm, writeFile, open, link } = require('node:fs/promises');
const { dirname, join, relative, resolve, isAbsolute, sep } = require('node:path');
const { randomUUID } = require('node:crypto');
async function safe(path) {
  let current = resolve(path);
  while (true) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('技能路径不可使用符号链接'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { operation, path, value } = JSON.parse(input);
  await safe(path);
  if (operation === 'mkdir') { await mkdir(path, { mode: 0o700 }); return; }
  if (operation === 'rename') { await safe(value); await rename(path, value); return; }
  if (operation === 'remove') { await rm(path, value); return; }
  if (operation === 'bundle') {
    await mkdir(path, { mode: 0o700 });
    for (const [name, encoded] of value) {
      const target = join(path, name), part = relative(path, target);
      if (!name || name.includes('\\\\') || !part || isAbsolute(part) || part === '..' || part.startsWith('..' + sep))
        throw new Error('关联文件路径越界');
      await safe(target);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, Buffer.from(encoded, 'base64'), { flag: 'wx', mode: 0o600 });
    }
    return;
  }
  if (operation === 'json') {
    const temporary = path + '.' + randomUUID() + '.tmp';
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(value.data)); await handle.sync(); }
      finally { await handle.close(); }
      if (value.exclusive) await link(temporary, path); else await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
    return;
  }
  throw new Error('未知技能文件操作');
}
main().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; });
`;

/** 同宿主执行世界映射成立后，每个变更只授权其父目录；没有无沙箱重试。 */
export function sandboxSkillFileOperations(fs: FileSystem, sandbox: SandboxProvider): SkillFileOperations {
  const mapped = async (path: string) => {
    await safePath(path);
    const value = fs.processPathFromHostPath(path);
    if (value === undefined || resolve(value) !== resolve(path))
      throw new Error('宿主文件系统无法映射技能目录事务路径');
  };
  const run = async (operation: string, path: string, value: unknown, root = dirname(path)) => {
    await mapped(path); await mapped(root);
    if (operation === 'rename') {
      await mapped(value as string);
      if (dirname(value as string) !== dirname(path)) throw new Error('技能事务只能在同一父目录内发布');
    }
    if (fs.sandboxMode === 'read-only') throw new Error('宿主文件系统为 read-only，不能安装或修改技能');
    const confined = await sandbox.confine([process.execPath, '-e', program],
      { mode: 'workspace-write', workspaceRoot: root });
    if (confined.enforcement !== 'full' || !confined.argv.length)
      throw new Error('宿主沙箱不能完整约束技能目录事务');
    await new Promise<void>((accept, reject) => {
      const child = spawn(confined.argv[0]!, confined.argv.slice(1),
        { stdio: ['pipe', 'ignore', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      let detail = '';
      child.stderr.on('data', chunk => { detail = (detail + chunk.toString()).slice(-4_096); });
      child.on('error', reject);
      child.stdin.on('error', reject);
      child.on('close', (code, signal) => code === 0 ? accept()
        : reject(new Error(`宿主技能目录事务失败：${detail || signal || code}`)));
      child.stdin.end(JSON.stringify({ operation, path, value }));
    });
  };
  const directory = async (path: string) => {
    const missing: string[] = [];
    let current = path;
    while (!await exists(current)) {
      missing.push(current);
      const parent = dirname(current);
      if (parent === current) throw new Error('技能安装目录没有可用父目录');
      current = parent;
    }
    // bind mount 的根必须存在；逐级创建只临时授权最近的现有父目录。
    for (const entry of missing.reverse()) await run('mkdir', entry, undefined, dirname(entry));
  };
  return {
    async writeBundle(path, bundle) {
      await directory(dirname(path));
      await run('bundle', path, [...bundle].map(([name, data]) => [name, data.toString('base64')]));
    },
    async atomicJson(path, value, exclusive = false) {
      await directory(dirname(path));
      await run('json', path, { data: value, exclusive });
    },
    rename: (source, destination) => run('rename', source, destination),
    remove: (path, options) => run('remove', path, options),
  };
}
