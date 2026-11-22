import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-workspace';
import type {} from '@deepseek-ai/dsh-api-session-controller';
import type {} from '@deepseek-ai/dsh-session-query';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';
import { WorkspaceId } from '@deepseek-ai/dsh-workspace';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller';
import { lstat, mkdir, realpath, rmdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { WorkbaseError } from '../shared/model.js';
import { extractConversation } from '../shared/session.js';
import { z } from 'zod';
import type { HostPort } from './service.js';
import type { GitBranches } from '../shared/model.js';
import { createDiagnostics } from './diagnostics.js';
import { createSessionMaintenance } from './session-maintenance.js';
import { createSessionSearch } from './session-search.js';
import { AttachmentId, type AttachmentStore, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { todoImageSchema, todoAttachmentSchema, MAX_TODO_ATTACHMENT_BYTES } from '../shared/todo.js';
import { defaultProjectInitialization, projectInitializationSchema, type ProjectInitializationInput } from '../shared/project-initialization.js';
import { initializeProject, completeProjectInitialization } from './project-initialization.js';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { saveRuleFiles } from './project-rules.js';
const titleProjection = z.object({ title: z.string() });
const runGit = (cwd: string, args: string[]) => new Promise<{ code: number; out: string; err: string }>(resolve => {
  const child = spawn('git', args, { cwd, windowsHide: true });
  let out = '', err = '';
  child.stdout?.on('data', chunk => { out += String(chunk); });
  child.stderr?.on('data', chunk => { err += String(chunk); });
  child.on('error', () => resolve({ code: -1, out, err: 'git 命令不可用' }));
  child.on('close', code => resolve({ code: code ?? -1, out, err }));
});
export async function createProjectDirectory(root: string, name: string, initialization?: ProjectInitializationInput) {
  const options = projectInitializationSchema.parse(initialization ?? defaultProjectInitialization());
  if (!root || !path.isAbsolute(root)) throw new WorkbaseError('invalid-root', '请先在设置中配置绝对路径项目根目录');
  if (!name.trim() || name !== name.trim() || name === '.' || name === '..' ||
      /[\\/\u0000-\u001f]/.test(name) ||
      process.platform === 'win32' && (/[<>:"|?*]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)))
    throw new WorkbaseError('invalid-name', '项目名称包含非法文件夹字符');
  const canonical = await realpath(root);
  if (!(await stat(canonical)).isDirectory()) throw new WorkbaseError('invalid-root', '项目根目录不是文件夹');
  const directory = path.join(canonical, name);
  try { await mkdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new WorkbaseError('directory-exists', '同名文件夹已存在，可打开该目录或修改名称');
    throw error;
  }
  const owned = await lstat(directory);
  try { await initializeProject(directory, name, options); }
  catch (error) {
    let cleaned = false;
    try {
      const current = await lstat(directory);
      if (current.isDirectory() && current.ino === owned.ino && current.dev === owned.dev) {
        await rmdir(directory); cleaned = true;
      }
    } catch { /* 不删除非空或已被替换的目录。 */ }
    throw new WorkbaseError('initialization-failed',
      `${error instanceof Error ? error.message : '项目初始化失败'}。${cleaned ? '本次创建的目录已回滚，可重试。' : `目录已保留：${directory}。请检查残留内容后重试。`}`);
  }
  return directory;
}

export async function completeProjectDirectory(directory: string, name: string, initialization: ProjectInitializationInput) {
  const options = projectInitializationSchema.parse(initialization);
  if (!path.isAbsolute(directory)) throw new WorkbaseError('invalid-root', '请提供绝对路径项目目录');
  const canonical = await realpath(directory);
  if (!(await lstat(canonical)).isDirectory()) throw new WorkbaseError('invalid-root', '项目目录不是文件夹');
  try { return await completeProjectInitialization(canonical, name, options); }
  catch (error) {
    throw new WorkbaseError('initialization-failed', `项目初始化补齐失败：${error instanceof Error ? error.message : '目录不可用'}。已有内容已保留，请检查目录后重试：${canonical}`);
  }
}

export const runDirectoryOpener = (command: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
  child.once('error', error => reject(new WorkbaseError('reveal-failed', `目录打开失败：${error.message}`)));
  child.once('close', (code, signal) => {
    if (code === 0) resolve();
    else reject(new WorkbaseError('reveal-failed', `目录打开失败：${command} 退出 ${code ?? signal ?? '未知'}`));
  });
});

export function createHost(ctx: Context, openDirectory = runDirectoryOpener): HostPort {
  // updatedAt 仅随用户消息变化；标题缓存必须同时跟踪官方投影水位。
  // 没有投影时重新折叠，避免把手工改名永久留在旧缓存中。
  const titleCache = new Map<string, { stamp: string; title: string }>();
  const maintenance = createSessionMaintenance(ctx);
  const searchSessions = createSessionSearch(ctx);
  return {
    ...createDiagnostics(ctx, maintenance),
    saveRules: (previous, value, targets) => saveRuleFiles(resolveDshHome(), previous, value, targets),
    async saveTodoAttachment(data, mediaType, name) {
      const store = ctx.get('attachments') as AttachmentStore | undefined;
      if (!store) throw new WorkbaseError('unsupported', '宿主未启用附件服务');
      const ref = await store.saveFile({ data, name });
      return todoAttachmentSchema.parse({ attachmentId: ref.attachmentId, bytes: ref.bytes, name: ref.name, mediaType });
    },
    async readTodoAttachment(attachment, signal) {
      const store = ctx.get('attachments') as AttachmentStore | undefined;
      if (!store) throw new WorkbaseError('unsupported', '宿主未启用附件服务');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of store.readFileStream({ attachmentId: AttachmentId(attachment.attachmentId), name: attachment.name, bytes: attachment.bytes }, signal)) {
        size += chunk.length;
        if (size > MAX_TODO_ATTACHMENT_BYTES) throw new WorkbaseError('invalid', '附件不能超过10MiB');
        chunks.push(chunk);
      }
      if (size !== attachment.bytes) throw new WorkbaseError('invalid', '附件长度校验失败');
      return Buffer.concat(chunks);
    },
    async saveTodoImage(data, mediaType) {
      const store = ctx.get('attachments') as AttachmentStore | undefined;
      if (!store) throw new WorkbaseError('unsupported', '宿主未启用图片附件服务');
      const ref = await store.saveImage({ data, mediaType });
      return todoImageSchema.parse({ attachmentId: ref.attachmentId, mediaType: ref.mediaType,
        bytes: ref.bytes, width: ref.width, height: ref.height });
    },
    async readTodoImage(image, signal) {
      const store = ctx.get('attachments') as AttachmentStore | undefined;
      if (!store) throw new WorkbaseError('unsupported', '宿主未启用图片附件服务');
      return (await store.readImage(image as ImageAttachmentRef, signal)).data;
    },
    async workspaces() {
      return Promise.all(ctx.workspaceRegistry.list().map(async w => ({
        workspaceId: w.id, path: w.path,
        // 与平台工作区行一致：default-workspace 显示为「默认工作区」。
        title: w.title === 'default-workspace' ? '默认工作区' : w.title,
        available: await w.status() === 'ok', sessionIds: [...w.sessionIds],
      })));
    },
    async sessions(signal = new AbortController().signal) {
      const result = await ctx.sessionController.list({}, signal);
      const archived = new Set(ctx.workspaceRegistry.archivedSessionIds);
      const items = result.items.filter(s => s.origin !== 'subagent');
      const stamp = (s: typeof items[number]) => JSON.stringify([
        s.updatedAt, s.projections?.kind, s.projections?.asOfSeq, s.projections?.values.title,
      ]);
      const stale = items.filter(s => !s.projections || titleCache.get(s.sessionId)?.stamp !== stamp(s));
      if (stale.length) {
        try {
          const observations = await ctx.get('sessionQuery')?.readTitleSnapshots(stale.map(s => s.sessionId), signal) ?? [];
          for (const observation of observations) {
            const session = stale.find(s => s.sessionId === observation.sessionId);
            if (!session) continue;
            if (observation.status !== 'fulfilled') continue;
            const title = observation.value.title?.title.trim() ?? '';
            titleCache.set(session.sessionId, { stamp: stamp(session), title });
          }
        } catch { /* 折叠失败时沿用缓存与投影回退，不阻塞快照。 */ }
      }
      // 空会话也可能已有手工标题；仅在没有标题时使用默认名称。
      return items.map(s => {
        const projected = titleProjection.safeParse(s.projections?.values.title);
        const folded = titleCache.get(s.sessionId)?.title.trim();
        const title = folded || (projected.success && projected.data.title.trim()) || (s.blank ? '新会话' : '未命名会话');
        return { sessionId: s.sessionId, title,
          updatedAt: s.updatedAt, archived: archived.has(s.sessionId), running: s.running };
      });
    },
    async rename(workspaceId, title) {
      const workspace = ctx.workspaceRegistry.list().find(w => w.id === workspaceId);
      if (!workspace) throw new Error('项目已从宿主移除');
      await workspace.setTitle(title);
    },
    async remove(id) { await ctx.workspaceRegistry.delete(WorkspaceId(id)); },
    async register(directory, title) {
      const workspace = await ctx.workspaceRegistry.create(directory, title);
      return { workspaceId: workspace.id, title: workspace.title, path: workspace.path,
        available: await workspace.status() === 'ok', sessionIds: [...workspace.sessionIds] };
    },
    createDirectory: createProjectDirectory,
    completeInitialization: completeProjectDirectory,
    search: searchSessions,
    searchStatus: searchSessions.status,
    async catalog() {
      const [roster, catalog] = await Promise.all([ctx.agentPresets.remoteExportList(), ctx.sessionController.modelCatalog()]);
      return {
        presets: roster.presets.map(p => {
          const builtIn = p.name === undefined ? ({
            standard: ['标准模式', '处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。'],
            ptc: ['PTC 模式', '包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。'],
            minimal: ['极简模式', 'Agent 使用终端和图片读取工具，并支持上下文压缩，适合测试和对比其基础表现。'],
            cordis: ['创造模式', '用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。'],
          } as Record<string, [string, string]>)[p.id] : undefined;
          return { ...p, name: builtIn?.[0] ?? p.name ?? p.id, description: builtIn?.[1] ?? p.description, builtIn: !!builtIn,
            requiresCodingTools: p.name === undefined && (p.id === 'ptc' || p.id === 'minimal') };
        }),
        models: catalog.groups.flatMap(group => group.models.map(model => ({
          provider: group.id, providerName: group.name, id: model.id, name: model.name,
        }))),
        defaultModel: catalog.default, failures: catalog.failures.map(failure => ({ name: failure.name, message: failure.message })),
      };
    },
    async begin(workspaceId, agentPreset) {
      return ctx.sessionController.create({ workspaceId: WorkspaceId(workspaceId), agentPreset });
    },
    async configureModel(sessionId, provider, model) {
      await ctx.sessionController.selectModel({ sessionId: SessionId(sessionId), provider, model });
    },
    async submit(input, signal) {
      await ctx.sessionController.selectModel({ sessionId: SessionId(input.sessionId), provider: input.provider, model: input.model });
      await ctx.sessionController.prompt({
        sessionId: SessionId(input.sessionId), requestId: input.requestId as SessionRequestId,
        mode: 'queue', content: [{ type: 'text', text: input.text }],
      }, signal);
    },
    async renameSession(id, title) {
      await ctx.sessionController.rename({ sessionId: SessionId(id), title });
      titleCache.delete(id);
    },
    async deleteSession(id, expectedIdentity) {
      if (!await maintenance.deleteSession(id, { expectedIdentity }))
        throw new WorkbaseError('delete-failed', '会话状态已变化，请刷新后重试');
      titleCache.delete(id);
    },
    async readSession(sessionId, signal) {
      // 平台 SessionController.page 的消息对齐窗口；正文提取与 dsh-archive-manager 同规则。
      const result = await ctx.sessionController.page(
        { address: { kind: 'session', sessionId: SessionId(sessionId) }, maxMessages: 40 }, signal);
      return { hasEarlier: result.hasMore, messages: extractConversation(result.records).messages };
    },
    async reveal(path) {
      // 已核验公开接口：省略 action 打开目录本身，reveal 在父目录中选中它。
      const controller = ctx.sessionController;
      if (typeof controller?.canOpenWorkspacePath === 'function'
          && typeof controller.openWorkspacePath === 'function' && controller.canOpenWorkspacePath()) {
        const result = await controller.openWorkspacePath({ path }, new AbortController().signal);
        if (result?.opened !== true) throw new WorkbaseError('reveal-unconfirmed', '宿主未确认目录打开成功');
        return;
      }
      const command = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      await openDirectory(command, [path]);
    },
    async gitBranches(projectPath, signal) {
      // 平台未公开分支接口：直接在项目目录运行 git 读取当前分支与本地分支列表。
      const head = await runGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (head.code !== 0) return { git: false, current: '', branches: [] };
      signal.throwIfAborted();
      const list = await runGit(projectPath, ['branch', '--format=%(refname:short)']);
      const branches = list.out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      return { git: true, current: head.out.trim(), branches };
    },
  };
}
