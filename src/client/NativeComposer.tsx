import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { errorText, useWorkbaseLocale } from './i18n.js';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import type { DraftSnapshot, SessionInput, ArbitrateKey, DraftAttachmentId, ComposerBarInjected } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ConversationController } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ComposerBridge, ComposerMenuProps, ComposerProjectProps, UiMemory } from './api.js';
import { Icon, positionPopup } from './ui.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workbase.command-menu': { kind: 'single'; scope: 'session'; };
    'workbase.model-selector': { kind: 'single'; scope: 'session'; owner: {
      locked: boolean; onState(state: { ready: boolean; busy: boolean }): void;
    }; };
  }
  interface LocaleNamespaceMap { 'slash.menu': string; model: string; }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { workbaseComposer: unknown; }
}

interface ModelDirectoryState {
  current: { provider: string; model: string; reasoningEffort?: string } | null;
  routable: boolean | null;
  pending: unknown | null;
}
export function composerDropdownBounds(anchor: { bottom: number }, frame: { top: number; bottom: number }) {
  const top = Math.max(frame.top, anchor.bottom) + 8;
  return { top, maxHeight: Math.min(360, Math.max(0, frame.bottom - top - 8)) };
}
/** 官方模型暂不开放方向参数；只按关联菜单调整几何，不复制其内容与交互。 */
function useComposerDropdown(menuClass?: string) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const doc = container.ownerDocument, view = doc.defaultView;
    if (!view) return;
    let menu: HTMLElement | null = null;
    let styles: MutationObserver | undefined;
    const resize = new ResizeObserver(() => sync());
    const set = (name: string, value: string) => {
      if (menu && (menu.style.getPropertyValue(name) !== value || menu.style.getPropertyPriority(name) !== 'important'))
        menu.style.setProperty(name, value, 'important');
    };
    const sync = () => {
      const trigger = container.querySelector<HTMLElement>('button[aria-haspopup="menu"]');
      const next = !trigger || trigger.getAttribute('aria-expanded') !== 'true' ? null
        : menuClass ? doc.getElementsByClassName(menuClass)[0] as HTMLElement | undefined
        : doc.getElementById(trigger.getAttribute('aria-controls') ?? '');
      if (menu !== (next ?? null)) {
        styles?.disconnect(); if (menu) resize.unobserve(menu);
        menu = next ?? null;
        if (menu) {
          styles = new MutationObserver(sync);
          styles.observe(menu, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
          resize.observe(menu);
        }
      }
      if (!menu || !trigger) return;
      const area = container.closest('.wb')?.getBoundingClientRect();
      const viewport = view.visualViewport;
      const frame = { top: Math.max(area?.top ?? 0, viewport?.offsetTop ?? 0),
        bottom: Math.min(area?.bottom ?? view.innerHeight, (viewport?.offsetTop ?? 0) + (viewport?.height ?? view.innerHeight)) };
      const bounds = composerDropdownBounds(trigger.getBoundingClientRect(), frame);
      set('top', `${bounds.top}px`);
      set('max-height', `${bounds.maxHeight}px`);
      // 项目列表的滚动层由官方 Menu 提供；模型列表保留搜索框与分组内部滚动。
    };
    const changes = new MutationObserver(sync);
    changes.observe(doc.body, { childList: true, subtree: true });
    const anchorChanges = new MutationObserver(sync);
    anchorChanges.observe(container, { attributes: true, attributeFilter: ['aria-expanded', 'aria-controls'], subtree: true });
    resize.observe(container);
    const area = container.closest('.wb'); if (area) resize.observe(area);
    view.addEventListener('resize', sync); doc.addEventListener('scroll', sync, true);
    view.visualViewport?.addEventListener('resize', sync); view.visualViewport?.addEventListener('scroll', sync);
    sync();
    return () => {
      changes.disconnect(); anchorChanges.disconnect(); styles?.disconnect(); resize.disconnect();
      view.removeEventListener('resize', sync); doc.removeEventListener('scroll', sync, true);
      view.visualViewport?.removeEventListener('resize', sync); view.visualViewport?.removeEventListener('scroll', sync);
    };
  }, [menuClass]);
  return root;
}
export function composerModelStatus(state: ModelDirectoryState) {
  return { ready: state.current !== null && state.routable === true, busy: state.pending !== null };
}
/** 共享官方目录状态：等待选择提交完成后才能发送，不复制模型和推理强度。 */
export function ComposerModelState({ directory, onState, children }: {
  directory: { getSnapshot(): ModelDirectoryState; subscribe(listener: () => void): () => void };
  onState(state: { ready: boolean; busy: boolean }): void; children: ReactNode;
}) {
  const state = useSyncExternalStore(listener => directory.subscribe(listener), () => directory.getSnapshot());
  const { ready, busy } = composerModelStatus(state);
  const root = useComposerDropdown();
  useEffect(() => { onState({ ready, busy }); return () => onState({ ready: false, busy: false }); }, [onState, ready, busy]);
  return <div ref={root} className="wb-model-selector">{children}</div>;
}
/** 项目列表用宿主同一 Menu，保留工作台归档与目录可用性限制。 */
export function ComposerProjectPicker({ projects, value, disabled, onChange }: ComposerProjectProps) {
  useWorkbaseLocale();
  const { Menu: NativeMenu, IconFolderCloseRegular } = require('@deepseek-ai/dsh-client-ui-primitives') as typeof import('@deepseek-ai/dsh-client-ui-primitives');
  const [open, setOpen] = useState(false);
  const menuClass = `wb-composer-project-menu-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const root = useComposerDropdown(menuClass);
  const selected = projects.find(project => project.projectId === value);
  return <div ref={root} className="composer-picker composer-project-picker">
    <NativeMenu open={open && !disabled} portal selectedId={value} side="bottom" listClassName={menuClass}
      anchor={<button type="button" className="composer-trigger" aria-label="会话项目" title={selected?.title}
        aria-haspopup="menu" aria-expanded={open && !disabled} disabled={disabled}
        onClick={() => setOpen(!open)}><IconFolderCloseRegular size={16}/><span className="composer-picked">{selected?.title ?? '暂无可用项目'}</span><Icon name="down"/></button>}
      items={projects.map(project => ({ id: project.projectId, label: project.title, icon: <IconFolderCloseRegular size={16}/>,
        disabled: !project.available || project.archived }))}
      onSelect={id => { if (!disabled && projects.some(project => project.projectId === id && project.available && !project.archived)) onChange(id); setOpen(false); }}
      onClose={() => setOpen(false)}/>
  </div>;
}

/** 保留未编辑区域的引用身份和偏移；编辑穿过引用时才解除该引用。 */
export function editDraft(previous: DraftSnapshot, text: string): DraftSnapshot {
  const before = previous.text;
  let start = 0, oldEnd = before.length, newEnd = text.length;
  while (start < oldEnd && start < newEnd && before[start] === text[start]) start++;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === text[newEnd - 1]) { oldEnd--; newEnd--; }
  const shift = newEnd - oldEnd;
  const move = <T extends { offset: number; length: number }>(items: readonly T[]) => items.flatMap(item =>
    item.offset + item.length <= start ? [item] : item.offset >= oldEnd ? [{ ...item, offset: item.offset + shift }] : []);
  return { text, references: move(previous.references),
    ...(previous.quotes ? { quotes: move(previous.quotes) } : {}),
    ...(previous.command && start >= previous.command.token.trimEnd().length ? { command: previous.command } : {}) };
}

type Shell = SessionInput & {
  setDraft(draft: DraftSnapshot): void;
  readonly draftSnapshot: DraftSnapshot;
  bindFilePicker(picker: { available(): boolean; open(): void }): () => void;
  bindDraftPersistence(write: (draft: DraftSnapshot) => void): () => void;
  notices: { getSnapshot(): { level: string; text: string; seq: number } | null; subscribe(fn: () => void): () => void };
};
interface ComposerImageLimits {
  mediaTypes: readonly string[]; maxImagesPerMessage: number; maxImageBytes: number; maxMessageImageBytes: number;
}
/** 使用当前会话的宿主限制；批次校验通过后才交给官方分配附件。 */
export function composerFileRejection(files: readonly File[], attachments: readonly { kind: string; file: File }[], limits?: ComposerImageLimits) {
  if (!limits) return null;
  const images = files.filter(file => limits.mediaTypes.includes(file.type));
  const existing = attachments.filter(attachment => attachment.kind === 'image');
  if (existing.length + images.length > limits.maxImagesPerMessage) return `每条消息最多添加 ${limits.maxImagesPerMessage} 张图片`;
  if (images.some(file => file.size > limits.maxImageBytes)) return `单张图片不能超过 ${limits.maxImageBytes} 字节`;
  if (existing.reduce((sum, a) => sum + a.file.size, 0) + images.reduce((sum, f) => sum + f.size, 0) > limits.maxMessageImageBytes)
    return `图片总大小不能超过 ${limits.maxMessageImageBytes} 字节`;
  return null;
}
export async function prepareNativeComposer(ctx: Context, memory: UiMemory, workspaceId: string, signal: AbortSignal, preset = '',
  from?: SessionReference, commit?: (reference: SessionReference) => void): Promise<SessionReference> {
  signal.throwIfAborted();
  const saved = memory.composer;
  const previous = saved.nativeWorkspaceId === workspaceId && saved.nativePreset === preset ? saved.nativeSessionId : '';
  const sessionId = await ctx.sessions.create({
    workspaceId: workspaceId as WorkspaceId, ...(preset ? { agentPreset: preset } : {}),
    ...(previous ? { sessionId: previous as SessionId } : {}),
  });
  signal.throwIfAborted();
  // 加载请求可取消；成功后的引用独立持有，不能随旧 effect 的 abort 释放附件。
  const reference = ctx.sessions.retain(sessionId, { source: 'workbaseComposer' });
  let released = false;
  const release = () => { if (!released) { released = true; reference.release(); } };
  signal.addEventListener('abort', release, { once: true });
  try {
    await reference.ready;
    signal.throwIfAborted();
    const shell = ctx.conversation.input.for(reference.binding.ctx) as Shell;
    if (from && from.sessionId !== reference.sessionId) {
      const source = ctx.conversation.input.for(from.binding.ctx) as Shell;
      const state = source.state.getSnapshot();
      if (!['plain', 'claimed'].includes(state.phase)) throw new Error('原会话正在提交，草稿尚未交接，请稍后重试');
      const ids = state.attachmentIds, draft = source.draftSnapshot;
      if (ids.length && !shell.addAttachments(ids)) throw new Error('目标会话未接受附件，原草稿和附件仍保留，请重试');
      try {
        (ctx.conversation as ConversationController).rebindDraftFiles(reference.sessionId, ids,
          reference.binding.session.getSnapshot().subagent === null);
        if (draft.text) { shell.setDraft(draft); source.setDraft({ text: '', references: [] }); }
      } catch (error) {
        // 目标释放时不得连带回收仍归原会话持有的附件。
        for (const id of ids) shell.removeAttachment(id);
        throw error;
      }
      for (const id of ids) source.removeAttachment(id);
    } else if (!from) {
      const sameDraft = !saved.nativeWorkspaceId || (saved.nativeWorkspaceId === workspaceId && saved.nativePreset === preset);
      if (sameDraft && saved.nativeDraft) shell.setDraft(saved.nativeDraft);
      else ctx.conversation.input.requestDraftInitialization(reference.binding, {
        prompt: sameDraft ? saved.draft : '', whenDraftExists: 'keep',
      });
    }
    Object.assign(saved, { nativeWorkspaceId: workspaceId, nativeSessionId: sessionId, nativePreset: preset });
    memory.save();
    signal.removeEventListener('abort', release);
    // 与交接同步提交所有权，避免 promise 返回至下一微任务前切换造成附件丢失。
    commit?.(reference);
    return reference;
  } catch (error) { release(); throw error; }
  finally { signal.removeEventListener('abort', release); }
}

type MenuRender = PropsRenderSlots<'workbase.command-menu' | 'workbase.model-selector'>;
/** 只挂菜单及输入服务桥接，不渲染官方输入栏或会话布局。 */
export function ComposerMenu({ ctx, memory, workspaceId, preset, disabled, modelTarget, onModelState, onReady, onState, SessionProvider, renderSlot }:
  ComposerMenuProps & MenuRender & { ctx: Context; memory: UiMemory }) {
  useWorkbaseLocale();
  const [reference, setReference] = useState<SessionReference | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [attachments, setAttachments] = useState<readonly { id: string; name: string; status?: string; message?: string }[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Element | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const callbacks = useRef({ onReady, onState, disabled });
  callbacks.current = { onReady, onState, disabled };
  const bridge = useRef<ComposerBridge | null>(null);
  const active = useRef<SessionReference | undefined>();
  useEffect(() => () => { active.current?.release(); active.current = undefined; }, []);
  useLayoutEffect(() => { setContainer(button.current?.closest('.composer-body') ?? null); }, []);
  useLayoutEffect(() => {
    const panel = popup.current, trigger = button.current;
    if (!panel || !trigger) return;
    const place = () => {
      positionPopup(panel, trigger, 'left', 640);
      panel.style.setProperty('--wb-command-max-height', `${Math.min(400, parseFloat(panel.style.maxHeight))}px`);
      // 菜单原先只向上展开；独立浮层的空间由此处重新裁定。
      positionPopup(panel, trigger, 'left', 640);
    };
    const sync = () => {
      const open = !!panel.querySelector('[data-trigger-menu]');
      setMenuOpen(open);
      if (open) {
        if (!panel.matches(':popover-open')) panel.showPopover();
        place();
      } else if (panel.matches(':popover-open')) panel.hidePopover();
    };
    const changes = new MutationObserver(sync);
    changes.observe(panel, { childList: true, subtree: true });
    const resize = new ResizeObserver(() => { if (panel.matches(':popover-open')) place(); });
    resize.observe(trigger); resize.observe(panel);
    const area = trigger.closest('.wb'); if (area) resize.observe(area);
    window.addEventListener('resize', sync);
    document.addEventListener('scroll', sync, true);
    sync();
    return () => {
      changes.disconnect(); resize.disconnect();
      window.removeEventListener('resize', sync); document.removeEventListener('scroll', sync, true);
      if (panel.matches(':popover-open')) panel.hidePopover();
    };
  }, [container]);
  useEffect(() => {
    const abort = new AbortController();
    const disposers: (() => void)[] = [];
    setReference(null); setError(''); bridge.current = null; callbacks.current.onReady(null);
    void prepareNativeComposer(ctx, memory, workspaceId, abort.signal, preset, active.current, next => {
      const previous = active.current;
      active.current = next;
      previous?.release();
    }).then(next => {
      if (abort.signal.aborted) return;
      const shell = ctx.conversation.input.for(next.binding.ctx) as Shell;
      const service = ctx.get('inputTriggers') as { sessionOf(ctx: Context): {
        toggleSource(source: string, hit: { trigger: '/'; query: string; quoted: boolean; position: 'leading' | 'inline'; span: { start: number; end: number; draftRev: number } }): void;
        arbitrate(key: ArbitrateKey, composing: boolean): string;
      } } | undefined;
      if (!service) throw new Error('Harness 添加菜单服务不可用');
      const trigger = service.sessionOf(next.binding.ctx);
      const fileActions = () => {
        const entry = ctx.slots.entriesOfSlot?.('conversation.composer.bar')[0];
        return entry ? (entry.inject as unknown as (id: SessionId) => ComposerBarInjected)(next.sessionId) : undefined;
      };
      const sync = () => {
        const state = shell.state.getSnapshot();
        memory.composer.nativeDraft = shell.draftSnapshot;
        memory.composer.draft = state.draft; memory.save();
        callbacks.current.onState(state.draft, state.attachmentIds.length > 0, !['plain', 'claimed'].includes(state.phase));
        const conversation = ctx.conversation as ConversationController;
        const uploads = conversation.fileUploads.getSnapshot();
        setAttachments(conversation.resolveDraftAttachments(state.attachmentIds).map(a => {
          const upload = uploads[a.id];
          return { id: a.id, name: a.file.name, status: upload?.status,
            message: upload?.status === 'error' ? upload.message : undefined };
        }));
      };
      disposers.push(shell.state.subscribe(sync));
      disposers.push((ctx.conversation as ConversationController).fileUploads.subscribe(sync));
      disposers.push(shell.notices.subscribe(() => {
        const notice = shell.notices.getSnapshot();
        if (notice?.level === 'error') setError(notice.text);
      }));
      disposers.push(shell.bindDraftPersistence(draft => { memory.composer.nativeDraft = draft; memory.save(); }));
      disposers.push(shell.bindFilePicker({ available: () => !callbacks.current.disabled, open: () => file.current?.click() }));
      bridge.current = {
        sessionId: next.sessionId,
        change(text) { shell.setDraft(editDraft(shell.draftSnapshot, text)); },
        addFiles(files, directories) {
          if (abort.signal.aborted) return '输入会话已切换，请重新添加文件';
          if (callbacks.current.disabled || !['plain', 'claimed'].includes(shell.state.getSnapshot().phase)) return '正在提交，请稍后添加文件';
          if (!files.length) return null;
          const access = ctx.get('remoteAccess') as { source(resource: string, id: string, action: string): { getSnapshot(): boolean | undefined } } | undefined;
          if (access?.source('session', next.sessionId, 'fileUploads/upload').getSnapshot() === false) return '当前会话没有上传文件的权限';
          const actions = fileActions();
          if (!actions?.addFiles) return 'Harness 文件导入服务暂不可用';
          const limits = next.binding.session.projections.faceOf('imageLimits').getSnapshot() as ComposerImageLimits | undefined;
          const existing = (ctx.conversation as ConversationController).resolveDraftAttachments(shell.state.getSnapshot().attachmentIds);
          return composerFileRejection(files, existing, limits) ?? actions.addFiles(files, directories);
        },
        toggle(start, end) {
          const state = shell.state.getSnapshot();
          trigger.toggleSource('command', { trigger: '/', query: '', quoted: false, position: start === 0 ? 'leading' : 'inline',
            span: { start, end, draftRev: state.draftRev } });
        },
        key(key, composing) {
          const mapped = ({ ArrowUp: 'up', ArrowDown: 'down', Enter: 'enter', Escape: 'escape', Tab: 'tab', ShiftTab: 'tabBack' } as Record<string, ArbitrateKey>)[key];
          return !!mapped && trigger.arbitrate(mapped, composing) !== 'pass';
        },
        submit() {
          const conversation = ctx.conversation as ConversationController;
          const uploads = conversation.fileUploads.getSnapshot();
          for (const id of shell.state.getSnapshot().attachmentIds) {
            const upload = uploads[id];
            if (upload?.status === 'error') return Promise.reject(new Error(upload.message));
            if (upload?.status === 'uploading') return Promise.reject(new Error('附件仍在上传，请稍后发送'));
          }
          return new Promise<boolean>((resolve, reject) => {
            let started = false, done = false;
            const finish = (error?: Error) => {
              if (done) return; done = true; stop(); abort.signal.removeEventListener('abort', cancelled);
              if (error) reject(error); else resolve(!next.binding.session.getSnapshot().blank);
            };
            const check = () => {
              const state = shell.state.getSnapshot();
              if (!['plain', 'claimed'].includes(state.phase)) started = true;
              else if (started) finish(state.draft.trim() || state.attachmentIds.length
                ? new Error(shell.notices.getSnapshot()?.text ?? '提交未完成，请检查附件或重试') : undefined);
            };
            const cancelled = () => finish(new Error('输入会话已切换，草稿仍保留'));
            const stop = shell.state.subscribe(check);
            abort.signal.addEventListener('abort', cancelled, { once: true });
            try { shell.submit('queue', 'click'); check(); if (!started && !done) finish(new Error('宿主未接受提交')); }
            catch (e) { finish(e instanceof Error ? e : new Error('提交失败')); }
          });
        },
      };
      callbacks.current.onReady(bridge.current); sync(); setReference(next);
    }).catch(e => {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '添加菜单加载失败');
    });
    return () => { abort.abort(); disposers.forEach(dispose => dispose()); bridge.current = null; callbacks.current.onReady(null); };
  }, [ctx, memory, workspaceId, preset, retry]);
  return <>
      <button ref={button} className="wb-icon field-settings" type="button" aria-label="添加上下文" aria-haspopup="menu" aria-expanded={menuOpen} title="添加上下文" disabled={disabled || !bridge.current} onClick={e => {
        const textarea = e.currentTarget.closest('.composer-shell')?.querySelector('textarea');
        textarea?.focus();
        bridge.current?.toggle(textarea?.selectionStart ?? 0, textarea?.selectionEnd ?? 0);
      }}><Icon name="plus"/></button>
      {container && createPortal(<div ref={popup} className="wb-command-popup" {...{ popover: 'manual' }} onKeyDown={e => {
        if (e.key === 'Escape') { bridge.current?.key('Escape', false); button.current?.focus(); }
      }}>{reference && <SessionProvider session={reference}>{renderSlot('workbase.command-menu', {})}</SessionProvider>}</div>, container)}
      {modelTarget && reference && onModelState && createPortal(
        <SessionProvider session={reference}>{renderSlot('workbase.model-selector', { locked: disabled, onState: onModelState })}</SessionProvider>, modelTarget)}
      <input ref={file} type="file" multiple hidden onChange={e => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) setError(bridge.current?.addFiles(files) ?? '');
      }}/>
    {attachments.length > 0 && <span className="wb-composer-attachments">{attachments.map(a =>
      <span key={a.id}>
      <button key={a.id} type="button" disabled={disabled} title={`移除附件 ${a.name}`} onClick={() => {
        if (!reference) return;
        const shell = ctx.conversation.input.for(reference.binding.ctx);
        const ids = shell.state.getSnapshot().attachmentIds.filter((id: DraftAttachmentId) => id === a.id);
        const conversation = ctx.conversation as ConversationController;
        const drafts = conversation.resolveDraftAttachments(ids);
        if (ids[0] && shell.removeAttachment(ids[0])) conversation.releaseDraftAttachments(drafts);
      }}>{a.name}{a.status === 'uploading' ? ' · 上传中' : a.status === 'error' ? ' · 上传失败' : ''} ×</button>
      {a.status === 'error' && <button type="button" disabled={disabled} title={a.message ? errorText(a.message) : undefined} onClick={() => {
        if (reference) (ctx.conversation as ConversationController).retryFileUpload(reference.sessionId, a.id as DraftAttachmentId);
      }}>重试上传</button>}
      </span>)}</span>}
    {error && <span role="alert" className="wb-warning">{errorText(error)}<button type="button" onClick={() => setRetry(n => n + 1)}>重试</button></span>}
  </>;
}
