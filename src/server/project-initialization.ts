import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rm, rmdir, unlink } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { WorkbaseError } from '../shared/model.js';
import type { ProjectInitialization, ProjectInitializationResult } from '../shared/project-initialization.js';

const execute = promisify(execFile);
function projectFiles(name: string, options: ProjectInitialization): Map<string, Buffer> {
  const title = name.replace(/[#`*<>[\]]/g, '').trim() || '新项目';
  return new Map([
    ['README.md', `# ${title}\n\n## 项目介绍\n\n在此说明项目用途与使用场景。\n\n## 安装与使用\n\n按实际技术栈补充安装、启动与验证命令。\n${options.agent ? '\n## 开发协作\n\n代理协作约定见 [AGENTS.md](AGENTS.md)。\n' : ''}`],
    ['AGENTS.md', `# AGENTS.md\n\n本文件是本项目的代理协作入口。${options.basic ? '面向人的介绍与使用说明见 [README.md](README.md)。' : ''}\n\n## 工作约定\n\n- 开始修改前读取相关源码，沿用现有项目结构与风格。\n- 命令与技术栈以实际项目配置为准，不把示例命令当作已经可用。\n- 修改后执行与变更相关的验证，如实说明未验证范围。\n- 不覆盖无关修改；不将凭据、密钥或本机绝对路径写入源码。\n- Python 项目使用 uv 管理环境。\n- 未经用户明确要求，不提交、推送或发布。\n\n## 规则与记录\n\n${options.commitRules ? '- 执行 Git 提交前，读取并遵循 [提交规范](.agents/rules/git-commit-message.md)。\n' : ''}- 记录重要决策前，读取 [开发日志](.agents/notes/dev-log.md) 中的记录约定；在同一文件记录背景、决策、证据与遗留，避免复制代码和待办清单。\n\n## 首次开发与项目说明\n\n首次开发时先核实源码、依赖清单与构建配置，在本文件补充技术栈、构建／测试／启动命令及主要目录职责。${options.basic ? '面向人的环境要求与安装使用说明同步补充到 README.md。' : ''}无法确认的内容标为待核实，不编造命令或宣称已经验证。\n`],
    ['.gitignore', `.DS_Store\nThumbs.db\n.env\n.env.*\n!.env.example\n*.pem\n*.key\nnode_modules/\ndist/\nbuild/\ncoverage/\n.venv/\n__pycache__/\n*.py[cod]\n.pytest_cache/\n.ruff_cache/\n`],
    ['.editorconfig', `root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\ntrim_trailing_whitespace = true\n\n[*.py]\nindent_size = 4\n\n[Makefile]\nindent_style = tab\nindent_size = tab\n\n[*.md]\ntrim_trailing_whitespace = false\n`],
    ['.agents/rules/git-commit-message.md', options.commitRuleContent],
    ['.agents/notes/dev-log.md', `# 开发日志\n\n## 当前状态\n\n协作记录已初始化，项目实现与验证状态待核实。\n\n## 记录约定\n\n- 当前状态记录已核实的实现、限制与验证范围，随实际进展更新。\n- 日志按日期倒序，记录重要决策、理由、有信息量的排查过程与验证边界。\n- 证据注明命令、结果与必要的文件位置；未执行的验证明确说明。\n- 不复制代码、提交变更清单、原始运行日志或待办清单，不写入凭据与环境隐私。\n\n新增条目使用以下格式；日期与内容按实际填写，不把示例当作已完成记录。\n\n\`\`\`md\n### YYYY-MM-DD · 一句话标题\n\n**背景**：为什么需要这次修改。\n\n**决策**：采用什么方案、放弃什么方案及原因。\n\n**证据**：实际执行的命令、结果与可复现信息。\n\n**遗留**：未验证范围、已知限制与后续处理事项。\n\`\`\`\n\n## 日志\n`],
  ].filter(([file]) => file === 'README.md' || file === '.editorconfig' ? options.basic
    : file === '.gitignore' ? options.git
    : options.agent && (file !== '.agents/rules/git-commit-message.md' || options.commitRules))
    .map(([file, text]) => [file!, Buffer.from(text!, 'utf8')]));
}

/** 新建要求空目录；补齐仅独占创建缺失文件，回滚不递归删除项目。 */
async function writeInitialization(directory: string, name: string, options: ProjectInitialization, fillMissing: boolean): Promise<ProjectInitializationResult> {
  const result: ProjectInitializationResult = { created: [], preserved: [] };
  if (!options.basic && !options.agent && !options.git) return result;
  if (!fillMissing && (await readdir(directory)).length) throw new WorkbaseError('initialization-failed', '初始化目标不是空目录');
  const rootInfo = await lstat(directory);
  if (!rootInfo.isDirectory()) throw new WorkbaseError('initialization-failed', '初始化目录不可用');
  const files = projectFiles(name, options);
  let dirs: string[] = options.agent
    ? ['.agents', path.join('.agents', 'notes'), ...(options.commitRules ? [path.join('.agents', 'rules')] : [])] : [];
  const parents = new Map<string, { ino: number; dev: number }>();
  const inspect = async (target: string) => {
    try { return await lstat(target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  };
  // 先核实已有父目录，禁止通过 .agents 等链接写到项目之外。
  if (fillMissing) {
    for (const relative of dirs) {
      const dir = path.join(directory, relative), info = await inspect(dir);
      if (!info) continue;
      if (!info.isDirectory()) throw new WorkbaseError('initialization-failed', '初始化子目录不是普通目录，不能通过符号链接补齐');
      parents.set(dir, { ino: info.ino, dev: info.dev });
    }
    for (const file of files.keys()) {
      if (await inspect(path.join(directory, file))) { files.delete(file); result.preserved.push(file); }
    }
    dirs = dirs.filter(dir => [...files.keys()].some(file =>
      file.split(path.sep).join('/').startsWith(`${dir.split(path.sep).join('/')}/`)));
  }
  const existingGit = fillMissing && options.git && await inspect(path.join(directory, '.git'));
  if (existingGit) result.preserved.push('.git');
  let stage: string | undefined;
  const written: { file: string; data: Buffer; ino: number; dev: number }[] = [];
  const created: { dir: string; ino: number; dev: number }[] = [];
  const assertParent = async (target: string) => {
    const root = await lstat(directory);
    if (!root.isDirectory() || root.ino !== rootInfo.ino || root.dev !== rootInfo.dev)
      throw new WorkbaseError('initialization-failed', '初始化期间项目目录已变化');
    let parent = path.dirname(target);
    while (parent !== directory) {
      const owned = parents.get(parent);
      const info = await lstat(parent);
      if (!owned || !info.isDirectory() || info.ino !== owned.ino || info.dev !== owned.dev)
        throw new WorkbaseError('initialization-failed', '初始化期间子目录已变化');
      parent = path.dirname(parent);
    }
  };
  try {
    if (options.git && !existingGit) {
      stage = await mkdtemp(path.join(tmpdir(), 'wb-git-'));
      // 不继承 GIT_DIR/GIT_WORK_TREE/配置注入；不复制用户 Git 模板中的 hooks。
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
      env.GIT_CONFIG_NOSYSTEM = '1'; env.GIT_CONFIG_GLOBAL = devNull;
      try {
        await execute('git', ['init', '--initial-branch=main', '--template=', stage], {
          cwd: stage, env, windowsHide: true, timeout: 15000, maxBuffer: 65536,
        });
      } catch {
        throw new WorkbaseError('initialization-failed', 'Git 初始化失败，请确认已安装 Git，或取消 Git 初始化后重试');
      }
      const collect = async (relative: string): Promise<void> => {
        const source = path.join(stage!, relative);
        const info = await lstat(source);
        if (info.isDirectory()) {
          dirs.push(relative);
          for (const child of await readdir(source)) await collect(path.join(relative, child));
        } else if (info.isFile()) files.set(relative, await readFile(source));
        else throw new WorkbaseError('initialization-failed', 'Git 初始化产生了不支持的文件类型');
      };
      await collect('.git');
      const configPath = path.join('.git', 'config');
      const config = files.get(configPath)?.toString('utf8') ?? '';
      if (!config || !files.has(path.join('.git', 'HEAD')))
        throw new WorkbaseError('initialization-failed', 'Git 初始化结果不完整');
    }
    for (const relative of dirs) {
      const dir = path.join(directory, relative);
      await assertParent(dir);
      if (fillMissing && parents.has(dir)) { await assertParent(path.join(dir, '.parent-check')); continue; }
      try { await mkdir(dir); }
      catch (error) {
        if (!fillMissing || relative === '.git' || relative.startsWith(`.git${path.sep}`) ||
            (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const info = await lstat(dir);
        if (!info.isDirectory()) throw new WorkbaseError('initialization-failed', '初始化子目录不是普通目录，不能通过符号链接补齐');
        parents.set(dir, { ino: info.ino, dev: info.dev });
        continue;
      }
      const info = await lstat(dir);
      created.push({ dir, ino: info.ino, dev: info.dev }); parents.set(dir, { ino: info.ino, dev: info.dev });
    }
    for (const [relative, data] of files) {
      const file = path.join(directory, relative);
      await assertParent(file);
      let handle;
      try { handle = await open(file, 'wx', 0o644); }
      catch (error) {
        if (!fillMissing || relative.startsWith(`.git${path.sep}`) ||
            (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        result.preserved.push(relative); continue;
      }
      try {
        const info = await handle.stat();
        // 先登记；写入中断的部分内容保守保留，不冒充完整回滚。
        written.push({ file, data, ino: info.ino, dev: info.dev });
        await handle.writeFile(data);
        if (!relative.startsWith(`.git${path.sep}`)) result.created.push(relative);
      } finally { await handle.close(); }
    }
    if (options.git && !existingGit) result.created.push('.git');
  } catch (error) {
    for (const entry of written.reverse()) {
      try {
        await assertParent(entry.file);
        const info = await lstat(entry.file);
        if (info.isFile() && info.ino === entry.ino && info.dev === entry.dev &&
            (await readFile(entry.file)).equals(entry.data)) await unlink(entry.file);
      } catch { /* 已删除、被修改或无法清理的文件保留。 */ }
    }
    for (const entry of created.reverse()) {
      try {
        await assertParent(entry.dir);
        const info = await lstat(entry.dir);
        if (info.isDirectory() && info.ino === entry.ino && info.dev === entry.dev) await rmdir(entry.dir);
      } catch { /* 非空目录保留，不递归删除外部内容。 */ }
    }
    throw error;
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {});
  }
  return result;
}

export async function initializeProject(directory: string, name: string, options: ProjectInitialization) {
  await writeInitialization(directory, name, options, false);
}

export async function completeProjectInitialization(directory: string, name: string, options: ProjectInitialization) {
  return writeInitialization(directory, name, options, true);
}
