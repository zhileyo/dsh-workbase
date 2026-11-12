import type { Context } from '@deepseek-ai/cordis';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { resolveAgentsHome } from '@deepseek-ai/dsh-home-paths';
import { jsonFile, type BackupSource } from './backup-files.js';
import type { HostPort } from './service.js';

const header = z.object({ id: z.string().min(1), version: z.number(), createdAt: z.number(), isSeeded: z.boolean() }).passthrough();
const rowsSchema = z.array(z.object({ header, eventCount: z.number().int().nonnegative().optional(), revision: z.unknown().optional() }));
export interface OnlineSessionPersistence {
  flush(): Promise<void>;
  list(): Promise<unknown>;
  open(id: string, access: 'read', options: { signal: AbortSignal }): Promise<{
    header: unknown; inheritedEventCount: number;
    read(offset: number, length: number, options: { signal: AbortSignal }): Promise<{ events: readonly unknown[] }>;
    close(): Promise<void>;
  }>;
}
export async function exportSessions(persistence: OnlineSessionPersistence, directory: string, signal: AbortSignal) {
  signal.throwIfAborted();
  await persistence.flush();
  const rows = rowsSchema.parse(await persistence.list()), ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.header.id)) throw new Error('会话索引包含重复标识');
    ids.add(row.header.id);
    if (row.eventCount === undefined) throw new Error('宿主未提供会话稳定前缀长度，不能保证导出边界');
  }
  const index: unknown[] = [];
  for (const row of rows) {
    signal.throwIfAborted();
    const reader = await persistence.open(row.header.id, 'read', { signal });
    try {
      const logical = header.parse(reader.header), count = row.eventCount!;
      if (logical.id !== row.header.id || logical.createdAt !== row.header.createdAt || logical.isSeeded !== row.header.isSeeded)
        throw new Error('会话在索引读取后被替换');
      if (!Number.isSafeInteger(reader.inheritedEventCount) || reader.inheritedEventCount < 0
        || reader.inheritedEventCount > count || (!logical.isSeeded && reader.inheritedEventCount !== 0))
        throw new Error('会话继承前缀元数据不可用');
      const file = `${Buffer.from(logical.id, 'utf8').toString('hex')}.jsonl`;
      const output = await open(path.join(directory, file), 'wx', 0o600);
      try {
        await output.writeFile(`${JSON.stringify({ meta: logical, inheritedEventCount: reader.inheritedEventCount, eventCount: count })}\n`);
        for (let offset = 0; offset < count;) {
          signal.throwIfAborted();
          const size = Math.min(512, count - offset), slice = await reader.read(offset, size, { signal });
          if (slice.events.length === 0 || slice.events.length > size) throw new Error('会话前缀不完整');
          for (const event of slice.events) {
            if (typeof event !== 'object' || event === null || (event as { seq?: unknown }).seq !== offset++)
              throw new Error('会话事件序号不连续');
            await output.writeFile(`${JSON.stringify(event)}\n`);
          }
        }
      } finally { await output.close(); }
      index.push({ id: logical.id, file, eventCount: count, revision: row.revision,
        parentSession: logical.parentSession, inheritedEventCount: reader.inheritedEventCount });
    } finally { await reader.close(); }
  }
  await jsonFile(path.join(directory, 'index.json'), index);
  const missingParents = rows.filter(row => typeof row.header.parentSession === 'string' && !ids.has(row.header.parentSession)).length;
  return `已校验 ${rows.length} 个会话的连续事件前缀和继承边界；后续追加不在本次导出中；${missingParents} 个母会话不在索引内；附件引用与跨源关系未验证`;
}

/** 盘点的 39 类均有结果；机器路径仅运行时解析，不把盘点报告中的本机路径打进包。 */
export function createBackupSources(ctx: Context, home: string, host: HostPort) {
  const get = <T>(name: string): T | undefined => {
    try { return (ctx as unknown as { get(name: string): T | undefined }).get(name); }
    catch { return undefined; }
  };
  const userHome = homedir(), env = process.env;
  const xdg = (key: string, fallback: string) => path.resolve(env[key]?.trim() || path.join(userHome, fallback));
  const biliConfig = path.join(xdg('XDG_CONFIG_HOME', '.config'), 'billion-context');
  const biliData = path.join(xdg('XDG_DATA_HOME', '.local/share'), 'billion-context');
  const dsh = (id: string, relative: string): BackupSource => ({ id, path: path.join(home, relative) });
  return async (): Promise<BackupSource[]> => {
    const persistence = get<OnlineSessionPersistence>('sessionPersistence');
    const sources: BackupSource[] = [
      { id: 'sessions', path: path.join(home, 'sessions'),
        ...(persistence && typeof persistence.flush === 'function' && typeof persistence.open === 'function'
          ? { export: (dest: string, signal: AbortSignal) => exportSessions(persistence, dest, signal) }
          : { unsupported: '宿主缺少 flush／只读会话导出能力' }) },
      { id: 'workspace', path: path.join(home, 'storages/workspace.json'), export: async dest => {
        const projects = await host.workspaces();
        await jsonFile(path.join(dest, 'workspace.json'), { projects,
          archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds],
          pinnedSessionIds: [...ctx.workspaceRegistry.pinnedSessionIds] });
        return '项目、会话成员、归档与置顶的 API 副本；与会话导出的时间区间不同，跨源关联未验证';
      } },
      dsh('workbench-legacy', 'storages/dsh_workbench.json'),
      dsh('archive-favorites', 'storages/archive_manager_favorites.json'),
      dsh('archive-settings', 'archive-manager/settings.json'),
      dsh('projection-cache', 'storages/session_projcache'),
      dsh('context-overview', 'storages/dsh-context/overview-cache.v1.json'),
      dsh('image-objects', 'attachments/v1/objects'),
      dsh('file-objects', 'attachments/v1/file-objects'),
      dsh('file-reference-links', 'attachments/v1/files'),
      dsh('attachment-request-cache', 'cache/attachments/request-images'),
      dsh('profiles', 'profiles'),
      dsh('market-profile-state', 'profiles'),
      dsh('market-build-markers', 'dsh-market/printed-build-keys.json'),
      dsh('agent-presets', '.agent-presets'),
      dsh('credentials', '.credentials.yaml'),
      dsh('legacy-settings', 'settings.yaml.imported'),
      dsh('remote-devices', 'remote-web-ui-devices.json'),
      dsh('skills-manager', 'skills-manager'),
      dsh('dsh-user-skills', 'skills'),
      { id: 'shared-agent-skills', path: path.join(resolveAgentsHome(), 'skills') },
      { id: 'project-skills', unsupported: '按项目分别发现，见 project-skills-N 范围；不包含项目源码' },
      { id: 'bili-config', path: biliConfig },
      { id: 'bili-data', path: biliData },
      { id: 'bili-sessions', path: path.resolve(env.BILI_SESSIONS_DIR?.trim() || path.join(biliData, 'sessions')) },
      { id: 'bili-ca', path: path.join(biliData, 'ca') },
      { id: 'bili-state', path: path.join(xdg('XDG_STATE_HOME', '.local/state'), 'billion-context') },
      { id: 'bili-cache', path: path.join(xdg('XDG_CACHE_HOME', '.cache'), 'billion-context') },
      { id: 'tui-state', path: path.join(userHome, '.dsh-tui') },
      dsh('pet-config-assets', 'dsh-pet'), dsh('pet-legacy', 'pet.json'),
      { id: 'desktop-client', unsupported: '未接入客户端状态白名单导出；不复制运行中的 LevelDB' },
      { id: 'pet-client', unsupported: '宠物客户端没有在线结构化导出适配器' },
      dsh('task-board', 'task-board'), dsh('skin-state', 'skin-center-active.json'),
      dsh('skin-resources', 'skin-center'), dsh('voice-models', 'speech-to-text/sensevoice'),
      dsh('recycle-bin-legacy', 'trash'),
      dsh('sessions-history', 'sessions'), dsh('projection-cache-legacy', 'storages/session_projcache.json'),
    ];
    // market 状态随 profiles 一并归档，避免重复扫描安装负载。
    sources.find(s => s.id === 'market-profile-state')!.export = async dest => {
      await jsonFile(path.join(dest, 'included.json'), { includedIn: 'profiles', excluded: ['node_modules', '运行锁'] });
      return '包含在 profiles 文件观察副本中；安装环境依赖和运行锁排除，恢复后需重新安装依赖';
    };
    sources.find(s => s.id === 'market-profile-state')!.guarantee = 'observation';
    if (env.BILI_CONFIG_FILE?.trim()) sources.push({ id: 'bili-config-override', path: path.resolve(env.BILI_CONFIG_FILE) });
    const projects = await host.workspaces();
    projects.forEach((project, index) => sources.push({ id: `project-skills-${index}`, path: path.join(project.path, '.dsh/skills') }));
    // 附件后端覆盖目录无法从公共读取协议完整推断，明确暴露覆盖限制。
    sources.push({ id: 'attachment-references', unsupported: '仅发现默认本地对象路径；自定义附件根、远端附件及会话引用摘要关联尚未适配' });
    return sources;
  };
}

export function backupBusy(ctx: Context, host: HostPort) {
  return async () => {
    const sessions = await host.sessions();
    if (sessions.some(s => s.running)) return true;
    for (const workspace of await host.workspaces()) {
      for (const id of workspace.sessionIds) {
        const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id as never }, () => Promise.resolve([]));
        if (activity.length) return true;
      }
    }
    return false;
  };
}
