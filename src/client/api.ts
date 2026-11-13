import type { Command } from '../shared/commands.js';
import { RPC_CHANNEL, RPC_ENDPOINT } from '../shared/commands.js';
import { preferencesSchema, type Preferences, type Snapshot } from '../shared/model.js';
import type { ReactNode } from 'react';
import type { DraftSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { Todo } from '../shared/model.js';
import type { TodoImage, TodoAttachment } from '../shared/todo.js';
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
  modelTarget?: HTMLElement | null;
  onModelState?(state: { ready: boolean; busy: boolean }): void;
  onReady(bridge: ComposerBridge | null): void;
  onState(draft: string, attachments: boolean, busy: boolean): void;
}
export interface ComposerProjectProps {
  projects: Snapshot['projects']; value: string; disabled: boolean;
  onChange(projectId: string): void;
}
export interface ClientPort {
  uploadTodoAttachment?(todo: Todo, file: File): Promise<Todo>;
  readTodoAttachment?(todo: Todo, attachment: TodoImage | TodoAttachment, signal?: AbortSignal): Promise<Blob>;
  renderMarkdown?(text: string): ReactNode;
  uploadTodoImage?(todo: Todo, file: File): Promise<Todo>;
  readTodoImage?(todo: Todo, image: TodoImage, signal?: AbortSignal): Promise<Blob>;
  openTodoSession?(todo: Todo, preset: string): Promise<void>;
  call(command: Command, signal?: AbortSignal): Promise<unknown>;
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
export function caller(rpc: RpcPort) {
  return async (command: Command, signal?: AbortSignal) => {
    const result = await rpc.call(RPC_CHANNEL, RPC_ENDPOINT, command, signal);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
}
export const readSnapshot = async (api: ClientPort, signal?: AbortSignal): Promise<Snapshot> =>
  await api.call({ op: 'snapshot' }, signal) as Snapshot;
export interface DetailMemory {
  draft: string; search: string; tab: 'sessions' | 'todos';
  sessions: number; pending: number; done: number;
}
export class UiMemory {
  readonly details = new Map<string, DetailMemory>();
  private values = { homeScroll: 0, search: '' };
  private savedTheme: Preferences['theme'] | null = null;
  composer = { draft: '', projectId: '', preset: '', model: '', branch: '', worktree: false,
    nativeWorkspaceId: '', nativeSessionId: '', nativePreset: '', nativeDraft: null as DraftSnapshot | null, pending: null as null | {
    projectId: string; sessionId: string; provider: string; model: string; text: string; requestId: string;
  } };
  targetTodo?: string;
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
      const saved = JSON.parse(raw ?? 'null');
      const theme = preferencesSchema.shape.theme.safeParse(saved?.theme);
      if (theme.success) this.savedTheme = theme.data;
      if (saved && typeof saved.search === 'string' && Number.isFinite(saved.homeScroll)) {
        this.values = { search: saved.search, homeScroll: saved.homeScroll };
        if (saved.composer && typeof saved.composer.draft === 'string') this.composer = { ...this.composer, ...saved.composer };
        for (const [id, detail] of Object.entries(saved.details ?? {})) {
          const d = detail as DetailMemory;
          if (typeof d.draft === 'string' && ['sessions', 'todos'].includes(d.tab))
            this.details.set(id, this.track(d));
        }
      }
    } catch { /* 损坏或不可用的浏览器存储不阻断宿主数据。 */ }
  }
  get homeScroll() { return this.values.homeScroll; }
  set homeScroll(value: number) { this.values.homeScroll = value; this.save(); }
  get search() { return this.values.search; }
  set search(value: string) { this.values.search = value; this.save(); }
  get theme() { return this.savedTheme; }
  set theme(value: Preferences['theme'] | null) {
    if (value === this.savedTheme) return;
    this.savedTheme = value;
    this.save();
  }
  save() {
    try { this.storage?.setItem('dsh-workbase-ui-v2', JSON.stringify({ ...this.values, theme: this.savedTheme, composer: this.composer, details: Object.fromEntries(this.details) })); }
    catch { /* 浏览器存储受限时仍保留本次会话草稿。 */ }
  }
  private track(detail: DetailMemory) {
    return new Proxy(detail, { set: (target, key, value) => { Reflect.set(target, key, value); this.save(); return true; } });
  }
  detail(projectId: string): DetailMemory {
    if (!this.details.has(projectId)) this.details.set(projectId, this.track({ draft: '', search: '', tab: 'sessions', sessions: 0, pending: 0, done: 0 }));
    return this.details.get(projectId)!;
  }
}
