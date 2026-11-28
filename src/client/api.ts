import type { Command } from '../shared/commands.js';
import { RPC_CHANNEL, RPC_ENDPOINT, EXTENSIONS_ENDPOINT, ASSISTANT_ENDPOINT } from '../shared/commands.js';
import { RULES_ENDPOINT, MESSAGE_ENDPOINT, MAX_RULES_REQUEST_BYTES, MAX_MESSAGE_REQUEST_BYTES, MAX_RPC_REQUEST_BYTES } from '../shared/project-rules.js';
import type { ExtensionModule } from '../shared/extensions.js';
import { preferencesSchema, type Preferences, type Snapshot } from '../shared/model.js';
import { t } from './i18n.js';
import type { ReactNode } from 'react';
import type { DraftSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { Todo } from '../shared/model.js';
import type { TodoImage, TodoAttachment } from '../shared/todo.js';
import type { SidebarProject } from './project-sidebar.js';
export interface ComposerBridge {
  sessionId: string;
  change(text: string): void;
  /** 委托宿主导入文件／图片／目录；失败返回提示，保留已有草稿。 */
  addFiles(files: readonly File[], directories?: ReadonlySet<File>): string | null;
  toggle(start: number, end: number): void;
  key(key: string, composing: boolean): boolean;
  submit(): Promise<boolean>;
}
export interface ComposerMenuProps {
  workspaceId: string; preset: string; disabled: boolean;
  /** 延迟创建的首次激活：输入框本地文字以替换语义写入会话草稿（附件保留）；仅在本次挂载内有效。 */
  activationDraft?: string;
  modelTarget?: HTMLElement | null;
  activityTarget?: HTMLElement | null;
  activityLocked?: boolean;
  onActivityChange?(active: boolean): void;
  onModelState?(state: { ready: boolean; busy: boolean }): void;
  onReady(bridge: ComposerBridge | null): void;
  onState(draft: string, attachments: boolean, busy: boolean): void;
}
export interface ComposerProjectProps {
  projects: Snapshot['projects']; value: string; disabled: boolean;
  onChange(projectId: string): void;
}
export interface ClientPort {
  projectSidebar?: { select(project: SidebarProject | null): void };
  renderProjectSidebar?(): ReactNode;
  uploadTodoAttachment?(todo: Todo, file: File): Promise<Todo>;
  readTodoAttachment?(todo: Todo, attachment: TodoImage | TodoAttachment, signal?: AbortSignal): Promise<Blob>;
  renderMarkdown?(text: string): ReactNode;
  uploadTodoImage?(todo: Todo, file: File): Promise<Todo>;
  readTodoImage?(todo: Todo, image: TodoImage, signal?: AbortSignal): Promise<Blob>;
  openTodoSession?(todo: Todo, preset: string): Promise<void>;
  call(command: Command, signal?: AbortSignal): Promise<unknown>;
  extensions?<T = unknown>(module: ExtensionModule, method: string, input?: unknown, signal?: AbortSignal): Promise<T>;
  openSession(id: string): void;
  newSession(workspaceId: string): Promise<void>;
  pickDirectory(): Promise<string | null>;
  /** 在系统文件管理器中显示项目目录；平台接口不可用且本机回退失败时返回 false。 */
  revealDirectory(projectId: string): Promise<boolean>;
  /** 官方 experimental-forge-bundle 是否已挂载 forgePanel。 */
  forgeAvailable(): boolean;
  /** 经官方 forgePanel 登记请求，首消息入队后由 Forge 在回合开始前创建。 */
  requestWorktree(sessionId: string, from: string): Promise<boolean>;
  addProject(path: string): Promise<boolean>;
  archiveSession(id: string, archived: boolean): Promise<void>;
  renderComposerMenu?(props: ComposerMenuProps): ReactNode;
  renderComposerProject?(props: ComposerProjectProps): ReactNode;
  /** 常驻后台更新任务的忙状态，不随设置页或更新弹窗卸载。 */
  pluginUpdateBusy?: { getSnapshot(): boolean; subscribe(listener: () => void): () => void };
  subscribe(listener: () => void): () => void;
}
export interface RpcPort {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<
    { ok: true; value: unknown } | { ok: false; error: { message: string } }>;
}
/** 真实的 UTF-8 字节数，超限即停，不做多余的整串遍历。 */
const utf8Bytes = (text: string, limit: number): number => {
  let total = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) total += 1;
    else if (code < 0x800) total += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00) {
      total += 4;
      index += 1;
    } else total += 3;
    if (total > limit) return total;
  }
  return total;
};
/** 信封占位标识：宿主按 method 分发并把 rpcId 原样回填，从不校验其唯一性，所以客户端统一用这个常量。 */
const PLACEHOLDER_RPC_ID = '00000000-0000-4000-8000-000000000000';
/**
 * 信封的固定开销（类型、rpcId、method 与 payload 两侧的标点）：只算一次，不为每次请求再拼一整串信封。
 * 骨架里 payload 是空字符串（两个引号），真实信封里由 payload 的 JSON 正文替代，因此减 2。
 */
const ENVELOPE_BYTES = utf8Bytes(JSON.stringify({
  type: 'client-request', rpcId: PLACEHOLDER_RPC_ID, method: '', payload: '',
}), Number.MAX_SAFE_INTEGER) - 2;/**
 * 判断一次请求是否还装得下。每个 UTF-16 单元最多占 6 字节（BMP 3 字节、孤立代理被 JSON 转义成 6 个 ASCII 字符），
 * 先用这个上界排除绝大多数请求，只有接近上限才逐字符精确计数；信封按字节常量加回，不再复制整份请求体。
 */
export const fitsRequestLimit = (command: Command, method: string, limit: number): boolean => {
  const payload = JSON.stringify(command);
  if (payload.length * 6 + ENVELOPE_BYTES + method.length <= limit) return true;
  return ENVELOPE_BYTES + method.length + utf8Bytes(payload, limit) <= limit;
};
/** op 到端点的归属：一个 op 只登记一次，请求上限再按端点查表，新增端点不必改两条链。 */
const ENDPOINT_BY_OP: Partial<Record<Command['op'], string>> = {
  extensions: EXTENSIONS_ENDPOINT,
  'personal-save': ASSISTANT_ENDPOINT,
  'speech-save': ASSISTANT_ENDPOINT,
  'speech-synthesize': ASSISTANT_ENDPOINT,
  'speech-stream-text': ASSISTANT_ENDPOINT,
  'speech-stream-cancel': ASSISTANT_ENDPOINT,
  'rules-save': RULES_ENDPOINT,
  settings: RULES_ENDPOINT,
  'submit-message': MESSAGE_ENDPOINT,
};
const LIMIT_BY_ENDPOINT: Record<string, number> = {
  [RULES_ENDPOINT]: MAX_RULES_REQUEST_BYTES,
  [MESSAGE_ENDPOINT]: MAX_MESSAGE_REQUEST_BYTES,
  [ASSISTANT_ENDPOINT]: MAX_MESSAGE_REQUEST_BYTES,
  [EXTENSIONS_ENDPOINT]: 3 * 1024 * 1024,
};
export function caller(rpc: RpcPort) {
  return async (command: Command, signal?: AbortSignal) => {
    const endpoint = ENDPOINT_BY_OP[command.op] ?? RPC_ENDPOINT;
    const limit = LIMIT_BY_ENDPOINT[endpoint] ?? MAX_RPC_REQUEST_BYTES;
    if (!fitsRequestLimit(command, endpoint, limit)) throw new Error('请求内容超过传输上限，请缩短内容后重试');
    const result = await rpc.call(RPC_CHANNEL, endpoint, command, signal);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
}
export const extensionCall = async <T = unknown>(api: ClientPort, module: ExtensionModule, method: string, input?: unknown, signal?: AbortSignal): Promise<T> =>
  await api.call({ op: 'extensions', module, method, ...(input !== undefined ? { input } : {}) }, signal) as T;
/**
 * 宿主为工作区与会话标题准备了中文兜底（「默认工作区」「新会话」「未命名会话」）；
 * 界面语言由客户端决定，读入时统一过一遍译文，别让服务端硬编码的中文绕过翻译链。
 */
const localizedSnapshot = (snapshot: Snapshot): Snapshot => ({
  ...snapshot,
  projects: snapshot.projects.map(project => ({
    ...project,
    title: t(project.title),
    sessions: project.sessions.map(session => ({ ...session, title: t(session.title) })),
  })),
  conflicts: snapshot.conflicts.map(conflict => ({ ...conflict, title: t(conflict.title) })),
});

export const readSnapshot = async (api: ClientPort, signal?: AbortSignal): Promise<Snapshot> =>
  localizedSnapshot(await api.call({ op: 'snapshot' }, signal) as Snapshot);
export interface DetailMemory {
  draft: string; search: string; tab: 'sessions' | 'todos';
  sessions: number; pending: number; done: number;
}
export class UiMemory {
  readonly extensions: Partial<Record<ExtensionModule, { tab: string; group: string; search: string; scroll: number }>> = {};
  readonly details = new Map<string, DetailMemory>();
  private values = { search: '' };
  private savedTheme: Preferences['theme'] | null = null;
  composer = { draft: '', projectId: '', preset: '', model: '', branch: '', worktree: false,
    creationRequests: {} as Record<string, string>,
    /** 工作区+预设 → 已创建的原生会话；随 composer 一起持久化，重挂载后复用同一会话。 */
    nativeHandoffs: {} as Record<string, string>,
    nativeWorkspaceId: '', nativeSessionId: '', nativePreset: '', nativeArmed: false, nativeDraft: null as DraftSnapshot | null, pending: null as null | {
    projectId: string; sessionId: string; provider: string; model: string; text: string; requestId: string; key?: string;
  } };
  targetTodo?: string;

  private lastWritten = '';
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    try {
      const key = 'dsh-workbase-ui-v2';
      let raw = storage?.getItem(key) ?? null;
      // 0.2.10 及更早的浏览器标识 dsh-workbench-ui-v2 一次性迁移；写入新键后清理旧键。
      if (raw === null) {
        const inherited = storage?.getItem('dsh-workbench-ui-v2') ?? null;
        if (inherited !== null) {
          try { storage?.setItem(key, inherited); storage?.removeItem('dsh-workbench-ui-v2'); }
          catch { /* 迁移写入失败时仍沿用旧键内容。 */ }
          raw = inherited;
        }
      }
      this.lastWritten = raw ?? '';
      const saved = JSON.parse(raw ?? 'null');
      const theme = preferencesSchema.shape.theme.safeParse(saved?.theme);
      if (theme.success) this.savedTheme = theme.data;
      if (saved && typeof saved.search === 'string') {
        for (const key of ['skills', 'mcp', 'rss'] as const) {
          const item = saved.extensions?.[key];
          if (item && typeof item.tab === 'string' && typeof item.group === 'string' && typeof item.search === 'string' && Number.isFinite(item.scroll))
            this.extensions[key] = item;
        }
        this.values = { search: saved.search };
        if (saved.composer && typeof saved.composer.draft === 'string') this.composer = { ...this.composer, ...saved.composer };
        for (const [id, detail] of Object.entries(saved.details ?? {})) {
          const d = detail as DetailMemory;
          if (typeof d.draft === 'string' && ['sessions', 'todos'].includes(d.tab))
            this.details.set(id, this.track(d));
        }
      }
    } catch { /* 损坏或不可用的浏览器存储不阻断宿主数据。 */ }
  }
  get search() { return this.values.search; }
  set search(value: string) { this.values.search = value; this.save(); }
  get theme() { return this.savedTheme; }
  set theme(value: Preferences['theme'] | null) {
    if (value === this.savedTheme) return;
    this.savedTheme = value;
    this.save();
  }
  save() { this.write(); }
  flush() { this.write(); }
  private write() {
    try {
      const text = JSON.stringify({ ...this.values, extensions: this.extensions, theme: this.savedTheme, composer: this.composer, details: Object.fromEntries(this.details) });
      if (text === this.lastWritten) return;
      this.lastWritten = text;
      this.storage?.setItem('dsh-workbase-ui-v2', text);
    } catch { /* 浏览器存储受限时仍保留本次会话草稿。 */ }
  }
  private track(detail: DetailMemory) {
    return new Proxy(detail, { set: (target, key, value) => { Reflect.set(target, key, value); this.save(); return true; } });
  }
  detail(projectId: string): DetailMemory {
    if (!this.details.has(projectId)) this.details.set(projectId, this.track({ draft: '', search: '', tab: 'sessions', sessions: 0, pending: 0, done: 0 }));
    return this.details.get(projectId)!;
  }
}
