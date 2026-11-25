import { randomUUID, createHash } from 'node:crypto';
import { access, lstat, mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { constants, watch, type FSWatcher } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { z } from 'zod';
import { isModelInvocable, isUserInvocable, type SkillProvider, type SkillRegistry, type SkillLookupOptions, type SkillDefinition, type SkillCandidate,
  type SkillCatalogSnapshot, type SkillViewOptions } from '@deepseek-ai/dsh-skill';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import {
  skillSaveSchema, skillScopeSchema, skillContentSchema, skillMarkdown, parseSkillUpload,
  type SkillRecord, type SkillSource, type SkillMarketSource, type SkillMarketItem, type SkillsSnapshot,
  type SkillReceipt, type SkillsSummary,
} from '../shared/skills.js';
import { absent, atomicJson, canonicalDirectory, contained, digest, exists, fileTransaction, readBundle, recoverTransaction, safePath,
  MAX_SKILL_BYTES, localSkillFileOperations, SkillCommitUncertainError, type SkillFileOperations, type FilePlan, type SkillBundle } from './skills-files.js';
import { sandboxSkillFileOperations } from './skills-sandbox.js';
import { fetchSkillCatalog, fetchSkillResource } from './skills-network.js';
import { canonicalSkillMarketUrl, skillMarketKind, loadSkillMarket, readMarketSkill, readMarketZip, marketSkillMarkdown, marketSkillArchiveUrl } from './skills-market.js';
import { readSkillRepository, type RepositorySkill } from './skills-repository.js';
import { SkillsHost } from './skills-host.js';
import { readSkillDocument, skillInvocationName } from './skills-document.js';

export interface SkillsProject { projectId: string; path: string; title: string; available: boolean; archived: boolean }
export interface SkillsContext {
  get(name: 'skills'): SkillRegistry | undefined;
  get(name: 'fs'): FileSystem | undefined;
  get(name: 'sandbox'): SandboxProvider | undefined;
}
export interface SkillsManagerOptions {
  ctx?: SkillsContext; home: string; agentsHome?: string;
  projects(): readonly SkillsProject[] | Promise<readonly SkillsProject[]>;
  config(): { defaultSourceId: string; defaultEnabled: boolean };
  /** 主代理 owner/授权边界的可选附加检查；抛出的拒绝直接传播，绝不降级。 */
  authorize?(paths: readonly string[], operation: 'read' | 'write'): Promise<void>;
  /** 宿主路径显示适配；未提供时使用公开 sessionController.openWorkspacePath。 */
  reveal?(path: string): Promise<void>;
  /** 隔离测试的网络替身；生产默认使用固定DNS、逐跳校验的公开资源传输。 */
  fetchMarket?: typeof fetchSkillCatalog;
  fetchMarketResource?: typeof fetchSkillResource;
}
interface SkillsState {
  revision: number; skills: SkillRecord[]; sources: SkillSource[]; marketSources: SkillMarketSource[];
  committedTransaction?: string;
  policies: Record<string, boolean>;
}
const stateSchema = z.object({
  revision: z.number().int().nonnegative(),
  policies: z.record(z.string(), z.boolean()).default({}),
  sources: z.array(z.object({
    id: z.string(), name: z.string(), path: z.string(), enabled: z.boolean(), writable: z.boolean(),
    kind: z.enum(['dsh', 'agents', 'project', 'custom']), projectId: z.string().optional(), issue: z.string().optional(),
  })),
  marketSources: z.array(z.object({ id: z.string(), name: z.string(), url: z.string(), enabled: z.boolean(), issue: z.string().optional() })),
  skills: z.array(skillContentSchema.extend({
    name: z.string(), description: z.string(), body: z.string(),
    id: z.string().regex(/^[\w-]+$/), version: z.number().int().positive(), sourceId: z.string(), scope: z.enum(['global', 'project']),
    projectIds: z.array(z.string()), enabled: z.boolean(), installedAt: z.number(), owner: z.enum(['workbase', 'external']),
    installations: z.array(z.object({ path: z.string(), digest: z.string(), projectId: z.string().optional() })),
    files: z.array(z.string()), issue: z.string().optional(), deletedAt: z.number().optional(),
    effective: z.enum(['effective', 'pending', 'unavailable', 'shadowed', 'disabled', 'error']).optional(),
    invocation: z.object({ modelInvocable: z.boolean(), userInvocable: z.boolean() }).optional(),
    invocationName: z.string().optional(),
  })),
  committedTransaction: z.string().optional(),
});
const idInput = z.object({ id: z.string().min(1) }).strict();
const toggleInput = idInput.extend({ enabled: z.boolean() }).strict();
const nameInput = z.string().trim().min(1).max(80);
const providerName = 'workbase-skills';
const builtinMarkets = [
  { id: 'builtin-skillhub', name: 'SkillHub', kind: 'skillhub', url: canonicalSkillMarketUrl('https://skillhub.cn'), enabled: true },
  { id: 'builtin-clawhub', name: 'ClawHub', kind: 'clawhub', url: canonicalSkillMarketUrl('https://clawhub.ai'), enabled: false },
] as const;
function marketKind(url: string) {
  try { return skillMarketKind(url); } catch { return 'custom'; }
}
type EffectReader = (cwd?: string, scope?: SkillViewOptions['scope']) => Promise<SkillCatalogSnapshot>;

export class SkillsManager {
  readonly directory: string;
  private state: SkillsState = { revision: 0, skills: [], sources: [], marketSources: [], policies: {} };
  private initialized = false;
  private initializing?: Promise<void>;
  private watchers = new Map<string, FSWatcher>();
  private queue: Promise<unknown> = Promise.resolve();
  private closing = false;
  private commitUncertain = false;
  private abort = new AbortController();
  private host: SkillsHost;
  private market: SkillMarketItem[] = [];
  private marketPage?: { query: string; token: string; signature: string; cursors: Map<string, string>; visited: Map<string, Set<string>> };
  private marketDetails = new Map<string, { createdAt: number; item: SkillMarketItem; bundle: SkillBundle }>();
  private checkedAt: number | null = null;
  private viewIssue?: string;
  private importDigests = new Map<string, string>();
  private repositoryPreviews = new Map<string, { createdAt: number; rows: RepositorySkill[] }>();
  private discovery = new Map<string, { rows: SkillRecord[]; stamps: Map<string, string>; directories: string[] }>();
  private discovering = new Map<string, Promise<SkillRecord[]>>();
  private discoveryEpoch = 0;
  private discoveryFs?: FileSystem;
  private scanSignature?: string;
  private integrity = new Map<string, { digest: string; stamps: Map<string, string> }>();
  private checkingIntegrity = new Map<string, Promise<boolean>>();
  constructor(private readonly options: SkillsManagerOptions) {
    this.directory = join(resolve(options.home), 'workbase', 'skills');
    this.host = new SkillsHost(options.ctx, scoped => this.provider(scoped));
  }
  private registry() { return this.options.ctx?.get('skills'); }
  private serial<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.closing) return Promise.reject(new Error('技能模块已卸载'));
    const task = this.queue.then(async () => {
      if (this.closing) throw new Error('技能模块已卸载');
      signal?.throwIfAborted();
      await this.initialize();
      signal?.throwIfAborted();
      this.assertWritableState();
      return job();
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  private initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    return this.initializing ??= this.initializeOnce().catch(error => { this.initializing = undefined; throw error; });
  }
  private async initializeOnce() {
    if (this.initialized) return;
    await safePath(this.directory);
    try { this.state = stateSchema.parse(JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8'))) as SkillsState; }
    catch (error) { if (!absent(error)) throw new Error(`技能状态读取失败，未覆盖原文件：${message(error)}`); }
    // 市场来源的失败提示只描述最近一次读取，每次读取都会重新判定；旧文件里的记录不跨重启继续显示。
    for (const source of this.state.marketSources) delete source.issue;
    await recoverTransaction(this.directory, this.state.committedTransaction, paths => this.fileOperations(paths));
    for (const row of this.state.skills.filter(row => row.owner === 'workbase' && !row.deletedAt && !row.invocation)) {
      try {
        const content = readSkillDocument(await this.readInstruction(join(this.bundlePath(row.id), 'SKILL.md')));
        row.invocation = content.invocation; row.invocationName = content.invocationName; row.frontmatter = content.frontmatter;
      } catch (error) { row.issue = message(error); row.effective = 'error'; }
    }
    for (const builtin of builtinMarkets) {
      const old = this.state.marketSources.find(source => marketKind(source.url) === builtin.kind);
      if (old) Object.assign(old, { name: builtin.name, url: builtin.url });
      else this.state.marketSources.push({ id: this.state.marketSources.some(source => source.id === builtin.id) ? randomUUID() : builtin.id,
        name: builtin.name, url: builtin.url, enabled: builtin.enabled });
    }
    if (!this.state.sources.some(source => source.id === 'dsh')) this.state.sources.push({
      id: 'dsh', name: 'DSH', path: join(resolve(this.options.home), 'skills'), enabled: true, writable: true, kind: 'dsh',
    });
    if (this.options.agentsHome && !this.state.sources.some(source => source.id === 'agents')) this.state.sources.push({
      id: 'agents', name: '公共 Agent', path: join(resolve(this.options.agentsHome), 'skills'), enabled: true, writable: true, kind: 'agents',
    });
    this.initialized = true;
  }
  private async store(next: SkillsState, transaction?: string) {
    this.assertWritableState();
    const value = { ...next, revision: this.state.revision + 1,
      committedTransaction: transaction ?? this.state.committedTransaction };
    // 外部条目是发现缓存，可能含解析错误，不作为可编辑正文持久化。
    const path = join(this.directory, 'state.json');
    await this.options.authorize?.([path], 'write');
    await safePath(path);
    const persisted = { ...value, skills: value.skills.filter(row => row.owner === 'workbase'),
      // 市场读取失败是瞬时结果，只留在内存里给这次请求的界面用，不写进配置。
      marketSources: value.marketSources.map(source => ({ ...source, issue: undefined })) };
    const fs = this.options.ctx?.get('fs');
    const text = JSON.stringify(persisted);
    const readState = async () => {
      await this.options.authorize?.([path], 'read');
      await safePath(path);
      if (!await exists(path)) return undefined;
      if (!fs) return readFile(path, 'utf8');
      const mapped = fs.processPathFromHostPath(path);
      if (mapped === undefined) throw new Error('宿主文件系统无法映射工作台技能配置路径');
      return fs.readText(await fs.resolve(mapped), this.abort.signal);
    };
    const previous = transaction ? await readState() : undefined;
    try {
      if (fs) {
        const mapped = fs.processPathFromHostPath(path), root = fs.processPathFromHostPath(this.directory);
        if (mapped === undefined || root === undefined) throw new Error('宿主文件系统无法映射工作台技能配置路径');
        // 插件自有配置是单文件发布，不是技能安装目录事务。
        // 按调用限定配置目录；只读模式仍由官方拒绝，任何失败都不回落本机写入。
        await fs.writeText(await fs.resolve(mapped), text, undefined, this.abort.signal,
          { mode: fs.sandboxMode === 'read-only' ? 'read-only' : 'workspace-write', workspaceRoot: root });
      } else {
        await atomicJson(path, persisted);
      }
    } catch (error) {
      if (!transaction) throw error;
      let actual: string | undefined;
      try { actual = await readState(); }
      catch (readError) {
        this.commitUncertain = true;
        this.viewIssue = '技能提交结果无法确认，禁止继续操作；请重新初始化以核对状态与事务日志';
        throw new SkillCommitUncertainError(new AggregateError([error, readError]));
      }
      // 只有完整新状态相同才能确认提交，完整旧状态相同才能回滚。
      if (actual !== text) {
        if (actual === previous) throw error;
        this.commitUncertain = true;
        this.viewIssue = '技能提交结果无法确认，禁止继续操作；请重新初始化以核对状态与事务日志';
        throw new SkillCommitUncertainError(error);
      }
    }
    const changedFiles = transaction !== undefined;
    this.state = value;
    if (changedFiles) this.invalidateDiscovery();
    this.host.refresh();
  }
  private assertWritableState() {
    if (this.commitUncertain) throw new Error('技能提交结果无法确认，禁止继续操作；请重新初始化以核对状态与事务日志');
  }
  private async projects() { return [...await this.options.projects()]; }
  private async allSources() {
    const projects = await this.projects();
    return [...this.state.sources, ...projects.flatMap(project => [
      { id: `project-${project.projectId}`, name: project.title, path: join(resolve(project.path), '.dsh', 'skills'),
        enabled: true, writable: project.available && !project.archived, kind: 'project' as const, projectId: project.projectId },
      { id: `project-agents-${project.projectId}`, name: `${project.title} · 公共 Agent`, path: join(resolve(project.path), '.agents', 'skills'),
        enabled: true, writable: false, kind: 'project' as const, projectId: project.projectId },
    ])];
  }
  private async permission(paths: readonly string[], operation: 'read' | 'write') {
    await this.options.authorize?.(paths, operation);
    const fs = this.options.ctx?.get('fs');
    // 官方 fs 没有目录级提交/回滚契约；受限执行世界不可绕过为本机文件事务。
    if (operation === 'write' && fs?.sandboxMode !== undefined)
      throw new Error('宿主文件系统受限，不能使用本机目录事务；需要宿主授权的目录事务能力');
  }
  private async fileOperations(paths: readonly string[]): Promise<SkillFileOperations> {
    await this.options.authorize?.(paths, 'write');
    const fs = this.options.ctx?.get('fs');
    if (fs?.sandboxMode === undefined) return localSkillFileOperations;
    if (fs.sandboxMode === 'read-only') throw new Error('宿主文件系统为 read-only，不能安装或修改技能');
    const sandbox = this.options.ctx?.get('sandbox');
    if (typeof sandbox?.confine !== 'function')
      throw new Error('宿主文件系统受限，不能使用本机目录事务；需要宿主授权的目录事务能力');
    for (const path of paths) {
      await safePath(path);
      const mapped = fs.processPathFromHostPath(path);
      if (mapped === undefined || resolve(mapped) !== resolve(path))
        throw new Error('宿主文件系统无法映射技能目录事务路径');
    }
    return sandboxSkillFileOperations(fs, sandbox);
  }
  private async readInstruction(path: string) {
    const target = await realpath(path);
    await this.permission([...new Set([path, target])], 'read');
    const fs = this.options.ctx?.get('fs');
    if (fs) {
      const mapped = fs.processPathFromHostPath(path);
      if (mapped === undefined) throw new Error('宿主文件系统无法映射此技能路径');
      return fs.readText(await fs.resolve(mapped), this.abort.signal);
    }
    return readFile(path, 'utf8');
  }
  handle(method: string, input: unknown = {}, signal?: AbortSignal): Promise<unknown> {
    // 页面先展示当前已提交状态；不能排在慢的目录生效检查或写事务之后。
    if (method === 'snapshot') return this.readSnapshot(signal);
    return this.serial(async () => {
      switch (method) {
        case 'snapshot': return this.snapshotNow();
        case 'summary': await this.scan(); return this.summaryNow();
        case 'reveal-staging': {
          const path = join(this.directory, 'disabled');
          await this.permission([path], 'write'); await safePath(path); await mkdir(path, { recursive: true, mode: 0o700 });
          if (!this.options.reveal) throw new Error('宿主目录显示能力未接线，停用目录路径可查看');
          await this.options.reveal(path); return { revealed: true, path };
        }
        case 'scan': this.invalidateDiscovery(); await this.scan(); return this.snapshotNow();
        case 'save': return this.save(skillSaveSchema.parse(input));
        case 'toggle': {
          const value = toggleInput.parse(input);
          await this.scan();
          const row = this.find(value.id);
          if (row.issue && row.effective === 'error') throw new Error(row.issue);
          // 旧版本停用文件仍在中转目录；首次重新启用复用原事务恢复。
          if (row.owner === 'workbase' && value.enabled && row.installations.some(entry => contained(join(this.directory, 'disabled'), entry.path)))
            return this.save({ ...editable(row), enabled: true, id: row.id, version: row.version });
          const next = structuredClone(this.state), saved = next.skills.find(skill => skill.id === row.id)!;
          saved.enabled = value.enabled; saved.version++;
          next.policies[row.id] = value.enabled;
          for (const installation of row.installations) {
            const real = row.realInstructionPath ?? await realpath(row.instructionPath ?? join(installation.path, 'SKILL.md'));
            next.policies[this.realPolicyKey(real, installation.projectId)] = value.enabled;
          }
          await this.store(next);
          await this.checkEffects();
          return { skill: structuredClone(saved), saved: true, effective: saved.effective ?? 'pending',
            message: saved.effective === 'disabled' ? '启停策略已保存 · 后续技能调用已停用；当前会话已加载内容不保证撤回'
              : saved.effective === 'effective' ? '启停策略已保存 · 技能已生效' : `启停策略已保存 · ${saved.issue ?? '等待宿主确认生效'}` };
        }
        case 'detail': {
          const row = this.find(idInput.parse(input).id);
          if (row.owner === 'workbase') {
            const text = await this.readInstruction(join(this.bundlePath(row.id), 'SKILL.md'));
            return { ...row, ...readSkillDocument(text) };
          }
          const path = row.instructionPath ?? join(row.installations[0]!.path, 'SKILL.md');
          const content = readSkillDocument(await this.readInstruction(path));
          await this.permission([dirname(path)], 'read');
          return { ...row, ...content, files: await this.bundleNames(dirname(path)) };
        }
        case 'export': return skillMarkdown(this.find(idInput.parse(input).id));
        case 'source.add': return this.addSource(input);
        case 'source.rename': return this.renameSource(input);
        case 'source.toggle': return this.toggleSource(input);
        case 'market.source.save':
        case 'market.source.remove': throw new Error('技能市场仅支持内置来源');
        case 'market.source.toggle': {
          const value = toggleInput.parse(input), next = structuredClone(this.state);
          const source = next.marketSources.find(row => row.id === value.id && this.marketSources().some(source => source.id === row.id));
          if (!source) throw new Error('市场数据源不存在');
          source.enabled = value.enabled; await this.store(next); return this.snapshotNow();
        }
        case 'market.load': return this.loadMarket(input, signal);
        case 'market.detail': return this.marketDetail(idInput.parse(input).id, signal);
        case 'market.install': {
          const { marketId, ...value } = skillSaveSchema.extend({ marketId: z.string().min(1) }).parse(input);
          const cached = this.marketDetails.get(marketId);
          if (!cached || Date.now() - cached.createdAt > 10 * 60_000
            || !this.marketSources().some(source => source.id === cached.item.marketSourceId && source.enabled))
            throw new Error('市场技能预览已失效，请重新打开详情');
          let bundle = new Map(cached.bundle);
          if (cached.item.catalog?.kind === 'clawhub' || cached.item.catalog?.kind === 'skillhub') {
            bundle = readMarketZip(await (this.options.fetchMarketResource ?? fetchSkillResource)(marketSkillArchiveUrl(cached.item.catalog), this.marketSignal(signal), 0, MAX_SKILL_BYTES));
            if (bundle.get('SKILL.md')?.toString('utf8') !== cached.bundle.get('SKILL.md')?.toString('utf8'))
              throw new Error('市场技能版本已变化，请重新打开详情');
          }
          signal?.throwIfAborted();
          return this.save(value, bundle, bundle.get('SKILL.md')!.toString('utf8'));
        }
        case 'import.preview': return this.previewImport(input);
        case 'import.confirm': return this.confirmImport(input);
        default: throw new Error(`未知技能操作：${method}`);
      }
    }, signal);
  }
  snapshot(): Promise<SkillsSnapshot> { return this.readSnapshot(); }
  private async readSnapshot(signal?: AbortSignal) {
    if (this.closing) throw new Error('技能模块已卸载');
    signal?.throwIfAborted();
    await this.initialize();
    signal?.throwIfAborted();
    if (this.closing) throw new Error('技能模块已卸载');
    return this.snapshotNow();
  }
  summary(): Promise<SkillsSummary> { return this.serial(async () => { await this.scan(); return this.summaryNow(); }); }
  private summaryNow(): SkillsSummary {
    const usable = this.state.skills.filter(row => !row.deletedAt && row.effective === 'effective' && !row.issue);
    const global = new Set(usable.filter(row => row.scope === 'global').map(row => row.invocationName ?? row.name)).size;
    const project = new Set(usable.filter(row => row.scope === 'project').map(row => row.id)).size;
    const errors = this.state.skills.filter(row => !row.deletedAt && row.issue && row.effective !== 'pending').length
      + this.state.sources.filter(row => row.issue).length;
    return { count: this.checkedAt === null ? null : global, detail: this.checkedAt === null ? `技能生效尚未确认 · 异常 ${errors}` : `项目 ${project} · 异常 ${errors}`, errors,
      global: this.checkedAt === null ? null : global,
      project: this.checkedAt === null ? null : new Set(usable.filter(row => row.scope === 'project').map(row => row.id)).size,
      issues: errors,
      checkedAt: this.checkedAt };
  }
  private async snapshotNow(): Promise<SkillsSnapshot> {
    const sources = await this.allSources();
    return structuredClone({ revision: this.state.revision, skills: this.state.skills.filter(row => !row.deletedAt),
      sources: sources.map(source => ({ ...source, readonly: !source.writable, scope: source.kind === 'project' ? 'project' as const : 'global' as const })),
      marketSources: this.marketSources(), market: this.market.filter(row => this.marketSources().some(source => source.id === row.marketSourceId && source.enabled)),
      marketPage: this.marketPage && { query: this.marketPage.query, token: this.marketPage.token,
        hasMore: this.marketPage.signature === this.marketSignature() && this.marketPage.cursors.size > 0 },
      summary: this.summaryNow(), disabledDirectory: join(this.directory, 'disabled'), stagingPath: join(this.directory, 'disabled'),
      legacyStagedCount: this.state.skills.filter(row => !row.deletedAt && row.installations.some(entry => contained(join(this.directory, 'disabled'), entry.path))).length,
      issue: this.viewIssue ?? this.host.failure });
  }
  private find(id: string) {
    const row = this.state.skills.find(skill => skill.id === id && !skill.deletedAt);
    if (!row) throw new Error('技能已不存在，请重新扫描');
    return row;
  }
  private owned(id: string) {
    const row = this.find(id);
    if (row.owner !== 'workbase') throw new Error('此技能由外部提供器或技能管理器拥有，尚未接管，仅可读取');
    return row;
  }
  private bundlePath(id: string) { return join(this.directory, 'bundles', id); }
  private async targetPaths(row: Pick<SkillRecord, 'scope' | 'projectIds' | 'sourceId' | 'name'>) {
    const sources = await this.allSources();
    if (row.scope === 'global') {
      const source = sources.find(value => value.id === row.sourceId && value.kind !== 'project');
      if (!source?.writable) throw new Error('安装来源已不可写，请重新选择');
      return [{ path: join(source.path, row.name) }];
    }
    const projects = await this.projects();
    if (!row.projectIds.length || row.projectIds.some(id => !projects.some(project => project.projectId === id && project.available && !project.archived)))
      throw new Error('应用范围包含未登记、不可用或已归档项目');
    return row.projectIds.map(id => ({ path: join(projects.find(project => project.projectId === id)!.path, '.dsh/skills', row.name), projectId: id }));
  }
  private async installationPaths(row: SkillRecord) {
    return this.targetPaths(row);
  }
  private async save(input: z.infer<typeof skillSaveSchema>, importedBundle?: SkillBundle, marketInstruction?: string): Promise<SkillReceipt> {
    skillScopeSchema.parse(input);
    const previous = input.id ? this.owned(input.id) : undefined;
    if (previous && input.version !== previous.version) throw new Error('技能版本已变化，草稿已保留，请重新读取');
    if (this.state.skills.some(row => row.owner === 'workbase' && !row.deletedAt && row.name === input.name && row.id !== previous?.id))
      throw new Error('已存在同名技能，请编辑已有技能的应用范围');
    const sourceId = input.scope === 'project' ? 'project' : input.sourceId ?? this.defaultSource();
    const row: SkillRecord = {
      id: previous?.id ?? randomUUID(), version: (previous?.version ?? 0) + 1,
      name: input.name, description: input.description, body: input.body, sourceId, scope: input.scope,
      projectIds: [...new Set(input.projectIds)], enabled: input.enabled ?? previous?.enabled ?? this.options.config().defaultEnabled,
      installedAt: previous?.installedAt ?? Date.now(), owner: 'workbase', installations: [], files: [],
    };
    const paths = await this.installationPaths(row);
    const oldBundle = previous ? await readBundle(this.bundlePath(previous.id)) : new Map<string, Buffer>();
    // 目录由工作台创建后才归本模块拥有；关联文件保持原样，正文单独更新。
    const bundle: SkillBundle = new Map(importedBundle ?? oldBundle);
    const original = marketInstruction ?? bundle.get('SKILL.md')?.toString('utf8');
    const markdown = original ? marketSkillMarkdown(original, row) : skillMarkdown({ ...row, frontmatter: input.frontmatter });
    Object.assign(row, readSkillDocument(markdown));
    bundle.set('SKILL.md', Buffer.from(markdown));
    row.files = [...bundle.keys()].sort();
    const sum = digest(bundle);
    row.installations = paths.map(path => ({ ...path, digest: sum }));
    const plans: FilePlan[] = [];
    for (const target of row.installations) plans.push({ path: target.path, next: bundle,
      expected: previous?.installations.find(old => old.path === target.path)?.digest });
    for (const old of previous?.installations ?? []) {
      if (!row.installations.some(target => target.path === old.path)) plans.push({ path: old.path, expected: old.digest });
    }
    plans.push({ path: this.bundlePath(row.id), next: bundle, expected: previous ? digest(oldBundle) : undefined });
    await this.validatePreviousPaths(previous);
    const files = await this.fileOperations([...plans.map(plan => plan.path), join(this.directory, 'transaction.json')]);
    const next = structuredClone(this.state);
    next.skills = next.skills.filter(skill => skill.id !== row.id); next.skills.push(row);
    delete next.policies[row.id];
    // 正文保存中的显式启停同步更新真实文件策略，不能遗留上次关闭的链接策略。
    for (const installation of row.installations)
      next.policies[this.realPolicyKey(join(installation.path, 'SKILL.md'), installation.projectId)] = row.enabled;
    await fileTransaction(this.directory, plans, id => this.store(next, id), files);
    try { await this.watchSources(); }
    catch (error) { this.viewIssue = `文件已保存，来源监听失败：${message(error)}`; }
    await this.observeEffect(row);
    return { skill: structuredClone(row), saved: true, effective: row.effective ?? 'pending',
      message: row.effective === 'effective' ? '文件已保存 · 技能已生效' : row.effective === 'disabled' ? '文件已保存 · 后续技能调用已停用；当前会话已加载内容不保证撤回'
        : `文件已保存 · ${row.issue ?? '等待宿主确认生效'}` };
  }
  private defaultSource() {
    const writable = this.state.sources.filter(source => source.writable && source.kind !== 'project');
    return writable.find(source => source.id === this.options.config().defaultSourceId)?.id
      ?? writable.find(source => source.id === 'dsh')?.id ?? writable[0]?.id ?? '';
  }
  private async validatePreviousPaths(row?: SkillRecord) {
    if (!row) return;
    const sources = await this.allSources(), projects = await this.projects();
    for (const entry of row.installations) {
      const disabled = contained(join(this.directory, 'disabled', row.id), entry.path);
      const source = sources.find(value => value.id === row.sourceId);
      const project = projects.find(value => value.projectId === entry.projectId);
      if (project && (!project.available || project.archived)) throw new Error('原范围项目已归档或不可用，禁止修改');
      const active = entry.projectId ? project && entry.path === join(project.path, '.dsh/skills', row.name)
        : source && entry.path === join(source.path, row.name);
      if (!active && !disabled) throw new Error('技能安装路径与登记归属不匹配');
      await safePath(entry.path);
    }
  }
  private async addSource(input: unknown) {
    const value = z.object({ path: z.string().min(1), name: nameInput.optional() }).strict().parse(input);
    const path = await canonicalDirectory(value.path);
    const current = (await this.allSources()).find(source => resolve(source.path) === path);
    if (current) return { source: current, duplicate: true, snapshot: await this.snapshotNow() };
    if (contained(path, this.directory) || contained(this.directory, path)
      || (await this.allSources()).some(source => contained(path, source.path) || contained(source.path, path)))
      throw new Error('技能来源不可与已登记来源或工作台中转存储重叠');
    await this.permission([path], 'read');
    let writable = true; try { await access(path, constants.W_OK); } catch { writable = false; }
    let name = value.name ?? basename(path), index = 2;
    if (value.name && this.state.sources.some(source => source.name === value.name)) throw new Error('来源名称重复');
    while (this.state.sources.some(source => source.name === name)) name = `${basename(path)} ${index++}`;
    const source: SkillSource = { id: randomUUID(), name, path, enabled: true, writable, kind: 'custom' };
    const next = structuredClone(this.state); next.sources.push(source); await this.store(next);
    await this.scan();
    return { source, duplicate: false, snapshot: await this.snapshotNow() };
  }
  private async renameSource(input: unknown) {
    const value = z.object({ id: z.string(), name: nameInput }).strict().parse(input);
    const next = structuredClone(this.state), source = next.sources.find(row => row.id === value.id);
    if (!source) throw new Error('来源不存在');
    if (next.sources.some(row => row.id !== source.id && row.name === value.name)) throw new Error('来源名称重复');
    source.name = value.name; await this.store(next); return this.snapshotNow();
  }
  private async toggleSource(input: unknown) {
    const value = toggleInput.parse(input), source = this.state.sources.find(row => row.id === value.id);
    if (!source) throw new Error('来源不存在');
    if (source.enabled === value.enabled) return this.snapshotNow();
    await this.scan();
    const next = structuredClone(this.state);
    next.sources.find(row => row.id === source.id)!.enabled = value.enabled;
    await this.store(next);
    if (value.enabled) {
      for (const row of this.state.skills.filter(row => row.owner === 'workbase' && row.sourceId === source.id && row.enabled
        && row.installations.some(entry => contained(join(this.directory, 'disabled'), entry.path)))) {
        try { await this.save({ ...editable(row), id: row.id, version: row.version }); }
        catch (error) { this.viewIssue = `来源策略已保存，旧版技能恢复失败：${message(error)}`; }
      }
    }
    await this.checkEffects(); return this.snapshotNow();
  }
  private marketSources() {
    // 保留旧自定义配置，但只有每家首个内置来源参与市场读取与操作。
    return builtinMarkets.flatMap(builtin => {
      const source = this.state.marketSources.find(source => marketKind(source.url) === builtin.kind);
      return source ? [source] : [];
    });
  }
  private marketSignal(signal?: AbortSignal) {
    return AbortSignal.any([this.abort.signal, ...(signal ? [signal] : []), AbortSignal.timeout(20_000)]);
  }
  private async marketDetail(id: string, signal?: AbortSignal) {
    const row = this.market.find(row => row.id === id);
    if (!row || !this.marketSources().some(source => source.id === row.marketSourceId && source.enabled))
      throw new Error('市场技能不存在或来源已停用');
    const cached = this.marketDetails.get(id);
    if (cached && Date.now() - cached.createdAt < 10 * 60_000) return structuredClone(cached.item);
    const detail = await readMarketSkill(row, this.marketSignal(signal), this.options.fetchMarket ?? fetchSkillCatalog);
    // 正文与包仅保留有限预览，不将市场资源持久化为用户技能。
    if (this.marketDetails.size >= 5) this.marketDetails.delete(this.marketDetails.keys().next().value!);
    this.marketDetails.set(id, { createdAt: Date.now(), ...detail });
    return structuredClone(detail.item);
  }
  private async loadMarket(input: unknown = {}, signal?: AbortSignal) {
    const value = z.object({ query: z.string().max(100).default('').transform(value => value.normalize('NFKC').trim()),
      pageToken: z.string().max(100).optional() }).strict().parse(input);
    const append = value.pageToken !== undefined, signature = this.marketSignature();
    if (append && (!this.marketPage || value.pageToken !== this.marketPage.token || signature !== this.marketPage.signature))
      return this.snapshotNow();
    const paging = append ? this.marketPage! : {
      query: value.query, token: randomUUID(), signature, cursors: new Map<string, string>(), visited: new Map<string, Set<string>>(),
    };
    // 读取整批后才发布，取消不会把半批旧查询写进共享缓存。
    let rows = append ? [...this.market] : [];
    const cursors = new Map(paging.cursors), visited = new Map([...paging.visited].map(([id, entries]) => [id, new Set(entries)]));
    const issues = new Map<string, string | undefined>();
    // 开始新一轮读取时先撤下上一轮的失败提示，界面不会把历史错误当成当前状态。
    for (const source of this.marketSources().filter(row => row.enabled)) source.issue = undefined;
    for (const source of this.marketSources().filter(row => row.enabled)) {
      if (append && !cursors.has(source.id)) continue;
      try {
        const cursor = append ? cursors.get(source.id) : undefined;
        const page = await loadSkillMarket(source, paging.query, this.marketSignal(signal), this.options.fetchMarket ?? fetchSkillCatalog, cursor);
        const seen = visited.get(source.id) ?? new Set<string>();
        if (page.next && seen.has(page.next)) throw new Error('技能市场分页游标无效');
        if (cursor) seen.add(cursor);
        visited.set(source.id, seen);
        const ids = new Set(rows.map(row => row.id));
        rows.push(...page.rows.filter(row => !ids.has(row.id)));
        if (page.next) cursors.set(source.id, page.next); else cursors.delete(source.id);
        issues.set(source.id, undefined);
      } catch (error) {
        signal?.throwIfAborted(); this.abort.signal.throwIfAborted();
        issues.set(source.id, message(error));
      }
    }
    signal?.throwIfAborted(); this.abort.signal.throwIfAborted();
    this.market = rows;
    this.marketPage = { ...paging, cursors, visited, token: randomUUID() };
    for (const source of this.state.marketSources) if (issues.has(source.id)) source.issue = issues.get(source.id);
    return this.snapshotNow();
  }
  private marketSignature() {
    return this.marketSources().filter(source => source.enabled).map(source => `${source.id}:${source.url}`).join(',');
  }
  private async previewImport(input: unknown) {
    const value = z.object({ text: z.string().optional(), sourceId: z.string().optional(), repositoryUrl: z.string().optional() }).strict().parse(input);
    if ([value.text, value.sourceId, value.repositoryUrl].filter(item => item !== undefined).length !== 1)
      throw new Error('请选择一个文件、已登记目录或仓库地址');
    if (value.repositoryUrl) {
      const rows = await readSkillRepository(value.repositoryUrl, AbortSignal.any([this.abort.signal, AbortSignal.timeout(120000)]),
        this.options.fetchMarketResource ?? fetchSkillResource);
      const token = randomUUID();
      while (this.repositoryPreviews.size >= 4) this.repositoryPreviews.delete(this.repositoryPreviews.keys().next().value!);
      this.repositoryPreviews.set(token, { createdAt: Date.now(), rows });
      const seen = new Set(this.state.skills.filter(row => !row.deletedAt).map(row => row.name));
      return rows.map(row => {
        const duplicate = seen.has(row.content.name); seen.add(row.content.name);
        return { ...row.content, files: [...row.bundle.keys()], commit: row.commit, path: row.path, token, duplicate };
      });
    }
    if (value.sourceId) {
      const source = (await this.allSources()).find(row => row.id === value.sourceId);
      if (!source) throw new Error('仅扫描已登记技能来源');
      const rows = await this.discoverSource(source);
      return Promise.all(rows.map(async row => {
        const key = `${source.id}\0${row.name}`;
        this.importDigests.delete(key);
        let files = row.files, issue = row.issue;
        try {
          const path = row.installations[0]!.path;
          await this.permission([path], 'read');
          const bundle = await readBundle(path);
          files = [...bundle.keys()];
          this.importDigests.set(key, digest(bundle));
        } catch (error) { issue = message(error); }
        return { ...editable(row), files, issue,
          duplicate: this.state.skills.some(old => old.owner === 'workbase' && !old.deletedAt && old.name === row.name) };
      }));
    }
    const candidates = value.text !== undefined ? parseSkillUpload(value.text)
      : value.sourceId ? (await this.discoverSource((await this.allSources()).find(source => source.id === value.sourceId)
        ?? (() => { throw new Error('仅扫描已登记技能来源'); })())).map(row => editable(row)) : [];
    const seen = new Set(this.state.skills.filter(row => !row.deletedAt).map(row => row.name));
    return candidates.map(row => {
      const duplicate = seen.has(row.name); seen.add(row.name);
      return { ...row, duplicate };
    });
  }
  private async confirmImport(input: unknown) {
    const value = z.object({ text: z.string().optional(), fromSourceId: z.string().optional(), token: z.string().optional(),
      scope: z.enum(['global', 'project']), projectIds: z.array(z.string()).default([]),
      names: z.array(z.string()).max(200), sourceId: z.string().optional() }).strict().parse(input);
    skillScopeSchema.parse(value);
    if ([value.text, value.fromSourceId, value.token].filter(item => item !== undefined).length !== 1)
      throw new Error('请选择一个已登记来源、仓库预览或上传文件');
    const preview = value.token ? this.repositoryPreviews.get(value.token) : undefined;
    if (value.token && (!preview || Date.now() - preview.createdAt > 10 * 60 * 1000))
      throw new Error('仓库预览已过期，请重新加载');
    const source = value.fromSourceId ? (await this.allSources()).find(row => row.id === value.fromSourceId) : undefined;
    if (value.fromSourceId && !source) throw new Error('仅扫描已登记技能来源');
    const candidates = preview ? preview.rows.map(row => row.content) : source ? await this.discoverSource(source) : parseSkillUpload(value.text!);
    const receipts: SkillReceipt[] = [], skipped: string[] = [];
    let files = 0, bytes = 0;
    for (const row of candidates.filter(row => value.names.includes(row.name))) {
      if (this.state.skills.some(old => !old.deletedAt && old.name === row.name && (!source || old.owner === 'workbase'))) { skipped.push(row.name); continue; }
      try {
        let bundle = preview?.rows.find(candidate => candidate.content.name === row.name)?.bundle;
        if (source) {
          const imported = row as SkillRecord;
          const path = imported.installations[0]!.path;
          await this.permission([path], 'read');
          bundle = await readBundle(path);
          if (imported.issue || this.importDigests.get(`${source.id}\0${row.name}`) !== digest(bundle))
            throw new Error('目录候选已变化或解析失败，请重新预览');
        }
        if (bundle) {
          files += bundle.size; bytes += [...bundle.values()].reduce((sum, data) => sum + data.length, 0);
          if (files > 500 || bytes > 20 * 1024 * 1024) throw new Error('技能导入最多 500 个文件、20 MB');
        }
        receipts.push(await this.save({ name: row.name, description: row.description, body: row.body, enabled: row.enabled, frontmatter: row.frontmatter,
          scope: value.scope, projectIds: value.projectIds, sourceId: value.sourceId }, bundle));
      }
      catch (error) { return { receipts, skipped, error: message(error), failedName: row.name, snapshot: await this.snapshotNow() }; }
    }
    return { receipts, skipped, snapshot: await this.snapshotNow() };
  }
  private invalidateDiscovery() {
    this.discoveryEpoch++;
    this.discovery.clear(); this.discovering.clear();
    this.integrity.clear(); this.checkingIntegrity.clear();
    this.checkedAt = null;
  }
  private async fileStamp(path: string) {
    try {
      const real = await realpath(path), info = await stat(real), link = await lstat(path);
      return JSON.stringify([real, info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs,
        link.ino, link.mtimeMs, link.ctimeMs, link.isSymbolicLink()]);
    } catch (error) { if (absent(error)) return 'absent'; throw error; }
  }
  private async installationValid(path: string, expected: string): Promise<boolean> {
    await this.permission([path], 'read');
    await safePath(path);
    const key = JSON.stringify([path, expected]), running = this.checkingIntegrity.get(key);
    if (running) return running;
    const epoch = this.discoveryEpoch;
    const task = (async () => {
      const cached = this.integrity.get(key);
      if (cached) {
        await this.permission([...cached.stamps.keys()], 'read');
        if ((await Promise.all([...cached.stamps].map(async ([file, stamp]) =>
          await this.fileStamp(file) === stamp))).every(Boolean)) return cached.digest === expected;
        this.integrity.delete(key);
      }
      const stamps = new Map<string, string>();
      const visit = async (file: string, depth: number): Promise<void> => {
        if (depth > 20 || stamps.size > 1000) throw new Error('技能目录过大或层级过深');
        await safePath(file);
        stamps.set(file, await this.fileStamp(file));
        if ((await lstat(file)).isDirectory())
          for (const name of await readdir(file)) await visit(join(file, name), depth + 1);
      };
      await visit(path, 0);
      await this.permission([...stamps.keys()], 'read');
      const sum = digest(await readBundle(path));
      const stable = (await Promise.all([...stamps].map(async ([file, stamp]) =>
        await this.fileStamp(file) === stamp))).every(Boolean);
      if (stable && epoch === this.discoveryEpoch) this.integrity.set(key, { digest: sum, stamps });
      return stable && sum === expected;
    })();
    this.checkingIntegrity.set(key, task);
    try { return await task; }
    finally { if (this.checkingIntegrity.get(key) === task) this.checkingIntegrity.delete(key); }
  }
  private async bundleNames(path: string): Promise<string[]> {
    const names: string[] = [];
    const visit = async (directory: string, prefix: string, depth: number) => {
      if (depth > 20 || names.length > 2000) throw new Error('技能关联文件过多或层级过深');
      await this.permission([directory, await realpath(directory)], 'read');
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = `${prefix}${entry.name}`;
        if (entry.isFile()) names.push(name);
        else if (entry.isDirectory()) await visit(join(directory, entry.name), `${name}/`, depth + 1);
        else if (entry.isSymbolicLink()) names.push(name);
      }
    };
    await visit(path, '', 0);
    return names.sort();
  }
  private async discoverSource(source: SkillSource): Promise<SkillRecord[]> {
    const fs = this.options.ctx?.get('fs');
    if (fs !== this.discoveryFs) { this.invalidateDiscovery(); this.discoveryFs = fs; }
    const key = JSON.stringify([source.id, source.path, source.projectId]);
    const running = this.discovering.get(key);
    const applyPolicies = (records: SkillRecord[]) => {
      const rows = structuredClone(records);
      for (const row of rows) row.enabled = (row.realInstructionPath
        ? this.state.policies[this.realPolicyKey(row.realInstructionPath, source.projectId)] : undefined)
        ?? this.state.policies[row.id] ?? row.enabled;
      return rows;
    };
    if (running) return applyPolicies(await running);
    const epoch = this.discoveryEpoch;
    const task = (async () => {
      await this.permission([source.path], 'read');
      const cached = this.discovery.get(key);
      if (cached) {
        await this.permission([...cached.stamps.keys(), ...cached.directories], 'read');
        // 官方执行世界仍检查当前读权限；零字节读取不搬运或重新解析正文。
        if (fs) for (const row of cached.rows) {
          const mapped = fs.processPathFromHostPath(row.instructionPath!);
          if (mapped === undefined) throw new Error('宿主文件系统无法映射此技能路径');
          if (typeof fs.readByteRange !== 'function') { this.discovery.delete(key); break; }
          await fs.readByteRange(await fs.resolve(mapped), { offset: 0, length: 0 }, this.abort.signal);
        }
        const valid = (await Promise.all([...cached.stamps].map(async ([path, stamp]) =>
          await this.fileStamp(path) === stamp))).every(Boolean);
        if (valid && this.discovery.has(key) && epoch === this.discoveryEpoch) return cached.rows;
        this.discovery.delete(key);
      }
      const stamps = new Map<string, string>(), directories = new Set<string>();
      const rows = await this.discoverSourceNow(source, stamps, directories);
      // 扫描期间文件变更不发布缓存；错误下次重读，避免永久保留授权或解析失败。
      const stable = (await Promise.all([...stamps].map(async ([path, stamp]) =>
        await this.fileStamp(path) === stamp))).every(Boolean);
      if (!stable) throw new Error('技能来源扫描期间已变化，请重新读取');
      if (stable && epoch === this.discoveryEpoch && !rows.some(row => row.issue))
        this.discovery.set(key, { rows, stamps, directories: [...directories] });
      return rows;
    })();
    this.discovering.set(key, task);
    try {
      return applyPolicies(await task);
    } finally { if (this.discovering.get(key) === task) this.discovering.delete(key); }
  }
  private async discoverSourceNow(source: SkillSource, stamps: Map<string, string>, directories: Set<string>): Promise<SkillRecord[]> {
    await this.permission([source.path], 'read');
    const records: SkillRecord[] = [];
    const visited = new Set<string>(); let count = 0;
    const visit = async (path: string, depth: number): Promise<void> => {
      if (++count > 2000 || depth > 20) throw new Error('技能来源过大或层级过深，最多扫描 2000 个条目、20 层');
      stamps.set(path, await this.fileStamp(path));
      let target: string;
      try { target = await realpath(path); } catch (error) { if (absent(error)) return; throw error; }
      await this.permission([...new Set([path, target])], 'read');
      const info = await stat(target);
      if (info.isDirectory()) { directories.add(path); directories.add(target); }
      const instruction = info.isDirectory() ? join(path, 'SKILL.md') : path.endsWith('.md') ? path : undefined;
      if (!instruction || !await exists(instruction)) {
        if (!info.isDirectory() || visited.has(target)) return;
        visited.add(target);
        for (const name of (await readdir(path)).sort()) if (!name.startsWith('.')) await visit(join(path, name), depth + 1);
        return;
      }
      if (this.state.skills.some(row => row.owner === 'workbase' && row.installations.some(entry => entry.path === path))) return;
      const id = createHash('sha256').update(`${source.id}\0${path}`).digest('hex');
      try {
        stamps.set(instruction, await this.fileStamp(instruction));
        const content = readSkillDocument(await this.readInstruction(instruction));
        const realInstructionPath = await realpath(instruction);
        if (realInstructionPath !== instruction) stamps.set(realInstructionPath, await this.fileStamp(realInstructionPath));
        const row: SkillRecord = { ...content, id, sourceId: source.id, version: 1, scope: source.projectId ? 'project' : 'global',
          projectIds: source.projectId ? [source.projectId] : [], enabled: this.state.policies[id] ?? true, owner: 'external',
          installedAt: info.birthtimeMs || info.mtimeMs, installations: [{ path, projectId: source.projectId, digest: '' }],
          instructionPath: instruction, realInstructionPath, files: ['SKILL.md'], effective: 'pending' };
        row.enabled = this.state.policies[this.realPolicyKey(realInstructionPath, source.projectId)] ?? row.enabled;
        records.push(row);
      } catch (error) {
        const previous = this.state.skills.find(row => row.id === id);
        records.push({ id, name: previous?.name ?? basename(path, '.md'), description: '技能读取或解析异常', body: '', enabled: this.state.policies[id] ?? previous?.enabled ?? true,
          version: 1, sourceId: source.id, scope: source.projectId ? 'project' : 'global', projectIds: source.projectId ? [source.projectId] : [],
          owner: 'external', installedAt: info.birthtimeMs || info.mtimeMs, installations: [{ path, projectId: source.projectId, digest: '' }],
          instructionPath: instruction, realInstructionPath: previous?.realInstructionPath,
          files: [], issue: message(error), effective: 'error' });
      }
    };
    await visit(source.path, 0);
    return records;
  }
  private realPolicyKey(real: string, projectId?: string) {
    return `real:${JSON.stringify([projectId ?? null, real])}`;
  }
  private async scan() {
    const external: SkillRecord[] = [];
    for (const source of await this.allSources()) {
      try {
        external.push(...await this.discoverSource(source));
        const saved = this.state.sources.find(row => row.id === source.id); if (saved) delete saved.issue;
      } catch (error) {
        const saved = this.state.sources.find(row => row.id === source.id); if (saved) saved.issue = message(error);
        // 失败不清除该来源上次成功数据。
        external.push(...this.state.skills.filter(row => row.owner === 'external' && row.sourceId === source.id).map(row => ({ ...row, issue: message(error) })));
      }
    }
    this.state.skills = [...this.state.skills.filter(row => row.owner === 'workbase' || row.deletedAt), ...external];
    for (const row of this.state.skills.filter(row => row.owner === 'workbase' && !row.deletedAt)) {
      try {
        for (const entry of row.installations) if (!await this.installationValid(entry.path, entry.digest)) throw new Error('安装文件已被外部修改');
        delete row.issue; row.effective = 'pending';
      } catch (error) { row.issue = message(error); row.effective = 'error'; }
    }
    const signature = JSON.stringify([await this.allSources(), this.state.policies,
      this.state.skills.map(({ effective: _effective, ...row }) => row)]);
    if (signature !== this.scanSignature) { this.host.refresh(); this.scanSignature = signature; }
    await this.checkEffects();
    await this.watchSources();
  }
  private async checkEffects() {
    const read = this.effectReader(), epoch = this.discoveryEpoch;
    for (const row of this.state.skills.filter(row => !row.deletedAt)) {
      try {
        const flags = new Set<boolean>();
        for (const entry of row.installations) {
          const real = row.realInstructionPath ?? await realpath(row.instructionPath ?? join(entry.path, 'SKILL.md'));
          flags.add(this.state.policies[this.realPolicyKey(real, entry.projectId)] ?? row.enabled);
        }
        if (flags.size === 1) row.enabled = [...flags][0]!;
      } catch { /* 扫描和宿主观察负责报告缺失／异常文件；不在此改写策略。 */ }
      await this.observeEffect(row, read);
    }
    this.checkedAt = null;
    const registry = this.registry();
    if (!registry?.snapshot) return;
    try {
      const snapshot = await read();
      if (epoch === this.discoveryEpoch && snapshot.complete && !this.state.skills.some(row => !row.deletedAt && row.enabled && row.effective === 'pending'))
        this.checkedAt = Date.now();
    } catch (error) { this.viewIssue = `宿主技能摘要读取失败：${message(error)}`; }
  }
  private effectReader(): EffectReader {
    const snapshots = new Map<string | undefined, Map<SkillViewOptions['scope'], Promise<SkillCatalogSnapshot>>>();
    // 不完整快照只在本批次复用，下次请求仍重试；整批共享超时，不能逐技能累加。
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]);
    return (cwd, scope) => {
      let scopes = snapshots.get(cwd);
      if (!scopes) { scopes = new Map(); snapshots.set(cwd, scopes); }
      let snapshot = scopes.get(scope);
      if (!snapshot) {
        const registry = this.registry();
        snapshot = registry?.snapshot ? registry.snapshot({ cwd, scope, signal })
          : Promise.reject(new Error('宿主技能服务不可用'));
        scopes.set(scope, snapshot);
      }
      return snapshot;
    };
  }
  private async observeEffect(row: SkillRecord, read = this.effectReader()) {
    const enabled = row.enabled && this.state.sources.find(value => value.id === row.sourceId)?.enabled !== false;
    if (row.issue && row.effective === 'error' && !row.issue.startsWith('文件已保存，宿主')) { row.effective = 'error'; return; }
    const registry = this.registry();
    if (!registry?.snapshot) { row.effective = 'unavailable'; row.issue = '宿主技能服务不可用，文件已保存但未确认生效'; return; }
    try {
      const projects = await this.projects();
      const views = row.scope === 'global' ? [undefined] : row.projectIds.map(id => projects.find(project => project.projectId === id)?.path);
      for (const cwd of views) {
        const scopes = [undefined, ...this.host.agents()];
        for (const scope of scopes) {
          const snapshot = await read(cwd, scope);
          if (!snapshot.complete) { row.effective = 'pending'; row.issue = '宿主技能目录读取未完成'; return; }
          const winner = snapshot.skills.find(skill => skill.name === (row.invocationName ?? skillInvocationName(row.name)));
          const sameFile = winner && row.installations.some(entry => winner.path === join(entry.path, 'SKILL.md') || winner.path === entry.path);
          if (!enabled) {
            if (!winner || (!isModelInvocable(winner) && !isUserInvocable(winner))) continue;
            // 同名其他启用副本可以接替；不能把原生/预设漏过误报为已停用。
            if (winner.provider === providerName && !sameFile) continue;
            const source = (await this.allSources()).find(value => value.id === row.sourceId);
            if (!row.enabled || source?.kind !== 'custom') {
              row.effective = 'shadowed'; row.issue = `同名技能由 ${winner.provider} 优先提供，停用尚未确认`; return;
            }
            continue;
          }
          if (!winner || !sameFile) {
            row.effective = winner ? 'shadowed' : 'pending'; row.issue = winner ? `同名技能由 ${winner.provider} 优先提供` : '宿主尚未发现此技能'; return;
          }
          const invocation = row.invocation ?? { modelInvocable: true, userInvocable: true };
          if (isModelInvocable(winner) !== invocation.modelInvocable || isUserInvocable(winner) !== invocation.userInvocable) {
            row.effective = 'shadowed'; row.issue = '宿主技能调用策略与工作台不一致'; return;
          }
        }
      }
      row.effective = enabled ? 'effective' : 'disabled'; delete row.issue;
    } catch (error) { row.effective = 'error'; row.issue = `文件已保存，宿主生效确认失败：${message(error)}`; }
  }
  private provider(scoped: boolean): SkillProvider {
    return { name: providerName,
      list: async options => this.providerCandidates(options, scoped),
      get: async (candidate, options) => this.providerGet(candidate, options, scoped),
    };
  }
  private async providerCandidates(options: SkillLookupOptions, scoped: boolean) {
    await this.initialize();
    options.signal?.throwIfAborted(); this.abort.signal.throwIfAborted();
    const projects = await this.projects(), sources = await this.allSources();
    let complete = true;
    const rows = this.state.skills.filter(row => row.owner === 'workbase' && !row.deletedAt);
    // 不调用 registry.get/snapshot，也不进入串行队列；官方目录收集期间递归调用会死锁。
    for (const source of sources) {
      if (source.projectId && !projects.some(project => project.projectId === source.projectId && project.available
        && !project.archived && options.cwd && contained(project.path, options.cwd))) continue;
      try { rows.push(...await this.discoverSource(source)); }
      catch { complete = false; }
    }
    const groups = new Map<string, { row: SkillRecord; path: string; realKey: string; enabled: boolean; native: boolean; rank: number }[]>();
    for (const row of rows) {
      const name = row.invocationName ?? skillInvocationName(row.name);
      if (!name) { complete = false; continue; }
      const installation = row.installations.find(entry => !entry.projectId || projects.some(project => project.projectId === entry.projectId
        && project.available && !project.archived && options.cwd && contained(project.path, options.cwd)));
      if (!installation) continue;
      if (row.effective === 'error') complete = false;
      try {
        let valid = row.effective !== 'error';
        if (row.owner === 'workbase') {
          await this.permission([installation.path], 'read');
          if (!await this.installationValid(installation.path, installation.digest)) { complete = false; valid = false; }
        }
        const source = sources.find(source => source.id === row.sourceId);
        const rank = row.scope === 'project' ? 100 : source?.kind === 'dsh' ? 400 : source?.kind === 'agents' ? 450 : 300;
        const path = row.instructionPath ?? join(installation.path, 'SKILL.md');
        const real = row.realInstructionPath ?? await realpath(path);
        const realKey = this.realPolicyKey(real, installation.projectId);
        const enabled = valid && (this.state.policies[realKey]
          ?? row.enabled) && source?.enabled !== false;
        const group = groups.get(name) ?? [];
        group.push({ row, path, realKey, enabled, native: source?.kind !== 'custom', rank });
        groups.set(name, group);
      } catch { complete = false; }
    }
    const candidates: SkillCandidate[] = [];
    for (const group of groups.values()) {
      const disabledNativeFiles = new Set(group.filter(value => value.native
        && sources.find(source => source.id === value.row.sourceId)?.enabled === false).map(value => value.realKey));
      for (const value of group) if (disabledNativeFiles.has(value.realKey)) value.enabled = false;
      group.sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path));
      const winner = group.find(value => value.enabled) ?? group.find(value => value.native || !value.row.enabled || value.row.effective === 'error');
      if (!winner) continue; // 仅来源关闭的自定义副本让出 bundled。
      const { row, path, enabled } = winner;
      candidates.push({ name: row.invocationName ?? skillInvocationName(row.name)!, description: row.description, source: 'custom', provider: providerName,
        invocation: enabled ? row.invocation ?? { modelInvocable: true, userInvocable: true }
          : { modelInvocable: false, userInvocable: false },
        rank: scoped ? -1 : Math.min(...group.map(value => value.rank)) - 1,
        locator: { id: row.id, version: row.version }, path,
        resourceBase: { kind: 'directory', path: dirname(path) } });
    }
    await this.watchSources(rows);
    return { candidates, complete };
  }
  private async providerGet(candidate: SkillCandidate, options: SkillLookupOptions, scoped: boolean): Promise<SkillDefinition | undefined> {
    options.signal?.throwIfAborted(); this.abort.signal.throwIfAborted();
    const current = (await this.providerCandidates(options, scoped)).candidates.find(value => value.name === candidate.name);
    if (!current || current.path !== candidate.path) return;
    if (!isModelInvocable(current) && !isUserInvocable(current)) return { ...current, content: '' };
    const content = readSkillDocument(await this.readInstruction(current.path!));
    options.signal?.throwIfAborted();
    if (content.invocationName !== current.name) return;
    return { ...current, content: content.body, invocation: {
      modelInvocable: isModelInvocable(current) && content.invocation.modelInvocable,
      userInvocable: isUserInvocable(current) && content.invocation.userInvocable,
    } };
  }
  async dispose() {
    if (this.closing) { await this.queue; return; }
    this.closing = true; this.abort.abort(new Error('技能模块已卸载'));
    for (const watcher of this.watchers.values()) watcher.close(); this.watchers.clear();
    this.host.dispose(); await this.queue;
    this.repositoryPreviews.clear(); this.importDigests.clear();
    this.invalidateDiscovery();
  }
  private async watchSources(rows = this.state.skills) {
    if (this.closing) return;
    const sourceRoots = (await this.allSources()).map(source => source.path);
    const roots = [...new Set([...sourceRoots, ...rows.flatMap(row => row.realInstructionPath
      && !sourceRoots.some(root => contained(root, row.realInstructionPath!)) ? [dirname(row.realInstructionPath)] : [])])];
    // 全局和各项目查询共享监听；不因某次较窄视图删除其他视图的监听。
    for (const path of roots.slice(0, 256)) {
      if (!await exists(path)) continue;
      try {
        const target = await realpath(path);
        if (this.watchers.has(target)) continue;
        if (this.watchers.size >= 256) { this.viewIssue = '技能来源监听达到上限，请扫描确认文件变化'; break; }
        await this.permission([...new Set([path, target])], 'read');
        const watcher = watch(target, { recursive: true, persistent: false }, () => { this.invalidateDiscovery(); this.host.refresh(); });
        watcher.on('error', error => { this.viewIssue = `技能来源监听失败：${message(error)}`; this.invalidateDiscovery(); this.host.refresh(); });
        this.watchers.set(target, watcher);
      } catch (error) { this.viewIssue = `技能来源监听不可用：${message(error)}`; }
    }
  }
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function editable(row: SkillRecord) {
  return { name: row.name, description: row.description, body: row.body, scope: row.scope, projectIds: row.projectIds,
    sourceId: row.sourceId, enabled: row.enabled };
}
