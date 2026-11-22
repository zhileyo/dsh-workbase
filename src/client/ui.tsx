import * as React from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prototypeIcons } from './prototype-icons.js';
import type { ClientPort } from './api.js';
import type { ExtensionModule } from '../shared/extensions.js';
export type Notify = (message: string, tone?: 'success' | 'info') => void;
export type ModalState = { busy: boolean; suspended: boolean; presentation?: { title: string; className?: string; leading?: React.ReactNode; onClose(): void } };
const panelSnapshots = new WeakMap<ClientPort, Map<ExtensionModule, unknown>>();
/** 同一连接重新进入管理页时先复用已读快照，后台刷新仍由面板负责。 */
export function usePanelSnapshot<T>(api: ClientPort, key: ExtensionModule) {
  const [state, setState] = useState(() => ({ api, key, value: panelSnapshots.get(api)?.get(key) as T | undefined }));
  const value = state.api === api && state.key === key ? state.value : panelSnapshots.get(api)?.get(key) as T | undefined;
  const save = useCallback((value: T) => {
    let snapshots = panelSnapshots.get(api);
    if (!snapshots) { snapshots = new Map(); panelSnapshots.set(api, snapshots); }
    snapshots.set(key, value); setState({ api, key, value });
  }, [api, key]);
  return [value, save] as const;
}
type IconName = keyof typeof prototypeIcons | 'up' | 'refresh' | 'fields' | 'info';
const paths = { ...prototypeIcons, up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 1 6M20 3v5h-5"/>',
  fields: '<path d="M4 7h16M4 17h16"/><rect x="8" y="4" width="4" height="6" rx="1" fill="var(--surface)"/><rect x="14" y="14" width="4" height="6" rx="1" fill="var(--surface)"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>' };
export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[name] }}/>;
}
export function IconButton({ name, label, active, outlined, className, ...props }: { name: IconName; label: string; active?: boolean; outlined?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`wb-icon ${outlined ? '' : 'flat'} ${active ? 'wb-active active' : ''} ${className ?? ''}`} {...props} title={label} aria-label={label} aria-pressed={active}><Icon name={name}/></button>;
}
/** 扩展表单沿用原型标签和字段间距，不叠加通用弹窗 label 的外边距。 */
export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field">{label}</label>{children}</div>;
}
/** 简短选项跟随控件；含说明的项目、模式等选择器统一使用360px。 */
export function pickerWidth(triggerWidth: number, hasDescription: boolean) {
  return hasDescription ? 360 : Math.min(360, Math.max(140, triggerWidth));
}
export function positionPopup(menu: HTMLElement, trigger: HTMLElement, align: 'left' | 'right', preferredWidth?: number, heightLimit = Infinity) {
  const area = trigger.closest<HTMLElement>('.wb');
  const panel = area?.getBoundingClientRect() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const dialog = trigger.closest<HTMLElement>('dialog')?.getBoundingClientRect();
  // Popover 在顶层绘制，不受祖先 overflow 裁剪，必须显式限制在弹窗与工作台的可见交集内。
  const frame = {
    left: Math.max(panel.left, dialog?.left ?? panel.left, 0),
    top: Math.max(panel.top, dialog?.top ?? panel.top, 0),
    right: Math.min(panel.right, dialog?.right ?? panel.right, typeof innerWidth === 'number' ? innerWidth : panel.right),
    bottom: Math.min(panel.bottom, dialog?.bottom ?? panel.bottom, typeof innerHeight === 'number' ? innerHeight : panel.bottom),
  };
  const anchor = trigger.getBoundingClientRect(), gap = 8;
  menu.style.maxWidth = `${Math.max(0, frame.right - frame.left - gap * 2)}px`;
  if (preferredWidth) menu.style.width = `${Math.min(preferredWidth, Math.max(0, frame.right - frame.left - gap * 2))}px`;
  const below = Math.max(0, frame.bottom - anchor.bottom - gap * 2);
  const above = Math.max(0, anchor.top - frame.top - gap * 2);
  menu.style.maxHeight = `${Math.min(heightLimit, Math.max(below, above))}px`;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(frame.left + gap, Math.min(frame.right - bounds.width - gap, align === 'right' ? anchor.right - bounds.width : anchor.left))}px`;
  menu.style.top = `${Math.max(frame.top + gap, Math.min(frame.bottom - bounds.height - gap, bounds.height <= below ? anchor.bottom + gap : anchor.top - bounds.height - gap))}px`;
}
/** 未选中时向下从首项、向上从末项开始；已有选项则循环导航。 */
export function popupIndex(key: string, current: number, count: number) {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (current < 0) return key === 'ArrowUp' ? count - 1 : 0;
  return (current + (key === 'ArrowUp' ? -1 : 1) + count) % count;
}
export function preventImeSubmit(e: React.KeyboardEvent) {
  if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault();
}
/** 自有菜单统一定位、关闭、禁用和焦点；异步列表刷新不抢走已有选项焦点。 */
export function usePopup({ trigger, popup, disabled = false, align = 'left', preferredWidth, heightLimit, focusTarget, focusSelected = true }: {
  trigger: React.RefObject<HTMLElement>; popup: React.RefObject<HTMLElement>; disabled?: boolean;
  align?: 'left' | 'right'; preferredWidth?(): number; heightLimit?: number;
  focusTarget?: React.RefObject<HTMLElement>; focusSelected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const latest = useRef({ preferredWidth, focusSelected });
  latest.current = { preferredWidth, focusSelected };
  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) (focusTarget ?? trigger).current?.focus({ preventScroll: true });
  }, [focusTarget, trigger]);
  useEffect(() => { if (disabled) close(false); }, [disabled, close]);
  useEffect(() => {
    if (!open || disabled || !popup.current || !trigger.current) return;
    const menu = popup.current, anchor = trigger.current;
    menu.setAttribute('popover', 'manual'); menu.showPopover();
    const place = () => positionPopup(menu, anchor, align, latest.current.preferredWidth?.(), heightLimit);
    const focusOption = () => {
      const selected = latest.current.focusSelected ? menu.querySelector<HTMLButtonElement>('[aria-selected=true]:not(:disabled)') : null;
      (selected ?? menu.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    };
    place(); focusOption();
    const observer = new ResizeObserver(place);
    for (const node of [anchor, menu, anchor.closest('.wb'), anchor.closest('dialog')]) if (node) observer.observe(node);
    const mutation = new MutationObserver(() => {
      place();
      // 首次展开为空列表时，异步选项到达后才把焦点从入口移到选项。
      if ((focusTarget ?? trigger).current === document.activeElement) focusOption();
    });
    mutation.observe(menu, { childList: true, subtree: true });
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(false);
    };
    const scroll = (e: Event) => { if (!menu.contains(e.target as Node)) close(menu.contains(document.activeElement)); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect(); mutation.disconnect();
      document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, disabled, align, heightLimit, trigger, popup, focusTarget, close]);
  const show = () => { if (!disabled) setOpen(true); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) return;
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    buttons[popupIndex(e.key, buttons.indexOf(document.activeElement as HTMLButtonElement), buttons.length)]?.focus({ preventScroll: true });
  };
  return { open: open && !disabled, show, close, toggle: () => open ? close() : show(), onKeyDown };
}
export function Menu({ label, items, disabled, icon = 'more', className = '', heading, note }: { label: string; disabled?: boolean; icon?: IconName; className?: string; heading?: string; note?: string; items: { label: string; action(): void; danger?: boolean; separatorBefore?: boolean; checked?: boolean; disabled?: boolean }[] }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const { open, close, toggle, onKeyDown } = usePopup({ trigger, popup, disabled, align: 'right', focusSelected: false });
  // Fragment 保留原型按钮的直接父子关系，避免破坏具名 Grid 列的定位规则。
  return <>
    <button className={`wb-icon ${icon === 'more' ? 'more' : 'field-settings'} ${className}`} type="button" ref={trigger} disabled={disabled} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={toggle}><Icon name={icon}/></button>
    {open && <div className={`wb-menu menu ${heading ? 'fields-menu' : ''}`} ref={popup} style={{ position: 'fixed', inset: 'auto', margin: 0 }} id={id} role="menu" onKeyDown={onKeyDown}>{heading && <><h3>{heading}</h3><p className="fields-scope">仅影响当前展示方式</p></>}{items.map((item, index) => <React.Fragment key={item.label}>
      {index > 0 && (item.separatorBefore || item.danger && !items[index - 1]?.danger) && <div className="menu-separator" role="separator"/>}
      <button type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked} disabled={item.disabled} className={item.danger ? 'wb-danger danger' : ''} onClick={() => { if (item.checked === undefined) close(); item.action(); }}><span className="menu-label">{item.label}</span>{item.checked !== undefined && <span className="menu-checkbox" aria-hidden="true">{item.checked ? <Icon name="check"/> : ''}</span>}</button>
    </React.Fragment>)}{note && <p className="fields-note">{note}</p>}</div>}
  </>;
}
export function Picker({ value, options, onChange, label, disabled, kind, title, variant, renderValue, renderDescription, describedBy, multipleValues }: {
  value: string; options: { value: string; label: React.ReactNode; description?: string; disabled?: boolean }[];
  onChange(value: string): void; label: string; disabled?: boolean;
  kind?: 'project' | 'mode' | 'model'; title?: string; variant?: string;
  describedBy?: string;
  /** 多选沿用同一菜单与焦点规则，点击选项不关闭；父组件维护选择集合。 */
  multipleValues?: readonly string[];
  /** 触发按钮上的文案可与菜单项文案不同（如基准分支菜单项只写分支名，按钮写「基于 分支名」）。 */
  renderValue?: (selected: { value: string; label: React.ReactNode; description?: string } | undefined) => React.ReactNode;
  renderDescription?: (description: string) => React.ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find(o => o.value === value);
  const { open, close, toggle, onKeyDown } = usePopup({ trigger, popup, disabled,
    preferredWidth: () => pickerWidth(trigger.current!.getBoundingClientRect().width, options.some(option => !!option.description)) });
  return <div className={kind ? `composer-picker composer-${kind}-picker` : `theme-select ${variant ? `theme-select-${variant}` : ''}`}>
    <button type="button" className={kind ? 'composer-trigger' : 'theme-select-trigger'} ref={trigger} disabled={disabled}
      aria-label={label} aria-describedby={describedBy} title={title ?? selected?.description ?? (typeof selected?.label === 'string' ? selected.label : undefined)} aria-haspopup="listbox" aria-controls={id} aria-expanded={open} onClick={toggle}>
      {kind === 'project' && <Icon name="folder"/>}<span className={kind ? 'composer-picked' : 'theme-select-value'}>{renderValue ? renderValue(selected) : selected?.label ?? options[0]?.label ?? '暂无可用项'}</span><Icon name="down"/>
    </button>
    {open && <div className={`composer-options${variant ? ` composer-options-${variant}` : ''}`} style={{ position: 'fixed', inset: 'auto', margin: 0 }} ref={popup} role="listbox" aria-multiselectable={multipleValues ? true : undefined} aria-label={label} id={id} onKeyDown={onKeyDown}>{options.map(option => <button type="button" className="composer-option" role="option" key={option.value} aria-selected={multipleValues ? multipleValues.includes(option.value) : value === option.value} disabled={option.disabled} title={option.description} onClick={() => { onChange(option.value); if (!multipleValues) close(); }}>
      <span className="composer-option-copy"><span>{option.label}</span>{option.description && <small>{renderDescription ? renderDescription(option.description) : option.description}</small>}</span>{(multipleValues ? multipleValues.includes(option.value) : value === option.value) && <Icon name="check"/>}
    </button>)}</div>}
  </div>;
}
export interface ModalProps { title: string; onClose(): void; children: React.ReactNode; busy?: boolean; drawer?: boolean; className?: string; suspended?: boolean; leading?: React.ReactNode; embedded?: boolean; onModalState?(state: ModalState): void }
/** 同尺寸管理页共用外壳；main/detail仅作为内容描述，不各自挂载Modal。 */
export function ModalFlow({ main, detail, embedded, onModalState, fallbackFocus }: {
  main: React.ReactElement<ModalProps>; detail?: React.ReactElement<ModalProps> | false | null;
  embedded?: boolean; onModalState?(state: ModalState): void;
  fallbackFocus?: string;
}) {
  const active = (detail || main).props;
  const hasDetail = !!detail, busy = active.busy ?? false;
  const latest = useRef(active); latest.current = active;
  const close = useCallback(() => latest.current.onClose(), []);
  const leadingClick = useCallback((event: React.MouseEvent) => {
    const leading = latest.current.leading as React.ReactElement<{ onClick?(event: React.MouseEvent): void }> | undefined;
    leading?.props.onClick?.(event);
  }, []);
  const origin = useRef<HTMLElement | null>(null);
  const positions = useRef(new Map<HTMLElement, { top: number; left: number }>());
  const mainRoot = useRef<HTMLElement>(null);
  const detailRoot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!embedded) return;
    const leading = React.isValidElement(latest.current.leading)
      ? React.cloneElement(latest.current.leading as React.ReactElement<{ onClick(event: React.MouseEvent): void }>, { onClick: leadingClick })
      : latest.current.leading;
    onModalState?.({ busy, suspended: false, presentation: { title: active.title, className: active.className, leading, onClose: close } });
    return () => onModalState?.({ busy: false, suspended: false });
    // 回调与返回按钮由ref读取，不因父组件重渲染产生状态回传循环。
  }, [embedded, busy, active.title, active.className, hasDetail, close, leadingClick, onModalState]);
  useLayoutEffect(() => {
    if (hasDetail) {
      detailRoot.current?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled),[tabindex="0"]')?.focus({ preventScroll: true });
    } else {
      for (const [node, position] of positions.current) if (node.isConnected) {
        node.scrollTop = position.top; node.scrollLeft = position.left;
      }
      positions.current.clear();
      if (origin.current) (origin.current.isConnected ? origin.current
        : fallbackFocus ? mainRoot.current?.querySelector<HTMLElement>(fallbackFocus) : null)?.focus({ preventScroll: true });
    }
  }, [hasDetail, fallbackFocus]);
  const mainElement = main.props.children as React.ReactElement<React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>>;
  const mainContent = React.cloneElement(mainElement, {
    ref: mainRoot,
    hidden: hasDetail, style: hasDetail ? { ...mainElement.props.style, display: 'none' } : mainElement.props.style,
    onFocusCapture: event => { if (!hasDetail) origin.current = event.target as HTMLElement; mainElement.props.onFocusCapture?.(event); },
    onScrollCapture: event => {
      const node = event.target as HTMLElement;
      if (!hasDetail) positions.current.set(node, { top: node.scrollTop, left: node.scrollLeft });
      mainElement.props.onScrollCapture?.(event);
    },
  });
  const contents = <>{mainContent}{detail && React.cloneElement(detail.props.children as React.ReactElement<{ ref?: React.Ref<HTMLDivElement> }>, { ref: detailRoot })}</>;
  return embedded ? contents : <Modal {...active} suspended={false} onClose={close}>{contents}</Modal>;
}
export function Modal({ title, onClose, children, busy = false, drawer = false, className = '', suspended = false, leading, embedded = false, onModalState }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const id = useId();
  useLayoutEffect(() => { if (!embedded) setContainer(marker.current?.closest<HTMLElement>('.wb') ?? null); }, [embedded]);
  // 嵌入共享概览时不创建第二个遮罩；详情与保存状态由外层统一处理。
  useLayoutEffect(() => {
    if (!embedded) return;
    onModalState?.({ busy, suspended });
    return () => onModalState?.({ busy: false, suspended: false });
  }, [embedded, busy, suspended, onModalState]);
  useLayoutEffect(() => {
    if (embedded || !container || !dialog.current || suspended) return;
    const previous = document.activeElement as HTMLElement | null;
    // 只阻止工作台背景交互，宿主侧栏与原生窗口控件不属于模态范围。
    const background = [...container.children].filter((node): node is HTMLElement => node instanceof HTMLElement && !node.contains(dialog.current) && !node.classList.contains('wb-toast'));
    const original = background.map(node => node.inert);
    background.forEach(node => { node.inert = true; });
    dialog.current.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled),[tabindex="0"]')?.focus({ preventScroll: true });
    return () => { background.forEach((node, i) => { node.inert = original[i]!; }); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [container, suspended, embedded]);
  if (embedded) return <>{children}</>;
  // 保留布局及已完成的入场动画；恢复时不重播抽屉与遮罩动画。
  const content = <div className={`wb-overlay ${drawer ? 'wb-overlay-drawer' : ''}`}
    aria-hidden={suspended || undefined} style={suspended ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>
    <dialog open className={`wb-dialog dialog ${drawer ? 'wb-drawer workspace-settings' : ''} ${className}`} ref={dialog} aria-labelledby={id} aria-modal="true" onKeyDown={e => {
      if ((e.target as HTMLElement).closest('dialog') !== dialog.current) return;
      if (e.defaultPrevented) return;
      if (e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) onClose(); }
      if (e.key === 'Tab') {
        const targets = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')]
          .filter(node => node.tabIndex >= 0 && node.getClientRects().length > 0 && !node.closest('[inert]'));
        const first = targets[0], last = targets.at(-1);
        if (!first) { e.preventDefault(); dialog.current?.focus({ preventScroll: true }); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus({ preventScroll: true }); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
      }
    }} tabIndex={-1}>
    <header className="dialog-head">{leading}<h2 id={id} title={title}>{title}</h2><IconButton name="close" label="关闭" disabled={busy} onClick={onClose}/></header>
    {children}
    </dialog>
  </div>;
  return <><span ref={marker} hidden/>{container && createPortal(content, container)}</>;
}
export function Tabs<T extends string>({ value, options, onChange, disabled, label = '筛选' }: { value: T; options: readonly { value: T; label: React.ReactNode }[]; onChange(value: T): void; disabled?: boolean; label?: string }) {
  return <div className="wb-tabs tabs entity-filter-tabs" role="tablist" aria-label={label}>
    {options.map((option, i) => <button type="button" role="tab" aria-selected={option.value === value} tabIndex={option.value === value ? 0 : -1} aria-pressed={option.value === value} className={option.value === value ? 'wb-active active' : ''} disabled={disabled} key={option.value} onClick={() => onChange(option.value)} onKeyDown={e => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
        e.preventDefault();
        const index = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
        onChange(options[index]!.value);
        (e.currentTarget.parentElement?.children[index] as HTMLElement)?.focus();
      }
    }}>{option.label}</button>)}
  </div>;
}
export const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
export const dateText = (time: number) => {
  if (!time) return '暂无活动';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
};
