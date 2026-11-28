import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import { bundleTarget, exists, safePath, temporaryPath, type SkillFileOperations } from './skills-files.js';

// 固定程序只解释结构化数据；技能正文、路径与二进制附件绝不拼入代码或 Shell。
// 不依赖包外脚本，Electron 宿主以 RUN_AS_NODE 执行同一个 Node 程序。
// 路径合法性与 payload 规范化只有一份实现（skills-files.ts）：这里只做传输与执行，
// 判定结果由父进程用同一组规则算好再送进来。
const program = `
const { mkdir, rename, rm, writeFile, open, link } = require('node:fs/promises');
const { dirname, join } = require('node:path');
async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { operation, path, value } = JSON.parse(input);
  if (operation === 'mkdir') { await mkdir(path, { mode: 0o700 }); return; }
  if (operation === 'rename') { await rename(path, value); return; }
  if (operation === 'remove') { await rm(path, value); return; }
  if (operation === 'bundle') {
    await mkdir(path, { mode: 0o700 });
    for (const [name, encoded] of value) {
      const target = join(path, name);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, Buffer.from(encoded, 'base64'), { flag: 'wx', mode: 0o600 });
    }
    return;
  }
  if (operation === 'json') {
    const { data, exclusive, temporary } = value;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); }
      finally { await handle.close(); }
      if (exclusive) await link(temporary, path); else await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
    return;
  }
  throw new Error('未知技能文件操作');
}
main().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; });
`;

/** 导出给一致性测试：同一组畸形输入必须让沙箱与本地写入给出相同结论。 */
export const skillSandboxProgram = program;

/** 同宿主执行世界映射成立后，每个变更只授权其父目录；没有无沙箱重试。 */
export function sandboxSkillFileOperations(fs: FileSystem, sandbox: SandboxProvider, timeoutMs = 60_000): SkillFileOperations {
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
      let detail = '', settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // 子进程挂住时不能让它无限等：技能事务共用一个串行队列，一次不退出就永久堵死后续全部技能操作。
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (error) reject(error); else accept();
      };
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        settle(new Error(`宿主技能目录事务超时（${timeoutMs}ms 未结束）：${detail || operation}`));
      }, timeoutMs);
      child.stderr.on('data', chunk => { detail = (detail + chunk.toString()).slice(-4_096); });
      child.on('error', settle);
      child.stdin.on('error', settle);
      child.on('close', (code, signal) => settle(code === 0 ? undefined
        : new Error(`宿主技能目录事务失败：${detail || signal || code}`)));
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
      const rows = [...bundle].map(([name, data]) => [name, data.toString('base64')] as [string, string]);
      // 与本地写入同一份判定：路径越界与符号链接必须在父进程就拒绝。
      for (const [name] of rows) await safePath(bundleTarget(path, name));
      await run('bundle', path, rows);
    },
    async atomicJson(path, value, exclusive = false) {
      await directory(dirname(path));
      const temporary = temporaryPath(path);
      await safePath(temporary);
      await run('json', path, { data: value, exclusive, temporary });
    },
    rename: (source, destination) => run('rename', source, destination),
    remove: (path, options) => run('remove', path, options),
  };
}
