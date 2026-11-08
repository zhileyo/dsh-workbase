import * as React from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prototypeIcons } from './prototype-icons.js';
type IconName = keyof typeof prototypeIcons | 'up' | 'refresh' | 'fields';
const paths = { ...prototypeIcons, up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 1 6M20 3v5h-5"/>',
  fields: '<path d="M4 7h16M4 17h16"/><rect x="8" y="4" width="4" height="6" rx="1" fill="var(--surface)"/><rect x="14" y="14" width="4" height="6" rx="1" fill="var(--surface)"/>' };
export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[name] }}/>;
}
export function IconButton({ name, label, active, className, ...props }: { name: IconName; label: string; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`wb-icon flat ${active ? 'wb-active active' : ''} ${className ?? ''}`} {...props} title={label} aria-label={label} aria-pressed={active}><Icon name={name}/></button>;
}
function positionPopup(menu: HTMLElement, trigger: HTMLElement, align: 'left' | 'right', preferredWidth?: number) {
  const area = trigger.closest<HTMLElement>('.wb');
  const frame = area?.getBoundingClientRect() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth };
  const anchor = trigger.getBoundingClientRect(), gap = 8;
  menu.style.maxWidth = `${Math.max(0, frame.width - gap * 2)}px`;
  if (preferredWidth) menu.style.width = `${Math.min(preferredWidth, Math.max(0, frame.width - gap * 2))}px`;
  const below = Math.max(0, frame.bottom - anchor.bottom - gap * 2);
  const above = Math.max(0, anchor.top - frame.top - gap * 2);
  menu.style.maxHeight = `${Math.max(below, above)}px`;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(frame.left + gap, Math.min(frame.right - bounds.width - gap, align === 'right' ? anchor.right - bounds.width : anchor.left))}px`;
  menu.style.top = `${Math.max(frame.top + gap, Math.min(frame.bottom - bounds.height - gap, bounds.height <= below ? anchor.bottom + gap : anchor.top - bounds.height - gap))}px`;
}
export function Menu({ label, items, disabled, icon = 'more', className = '', heading, note }: { label: string; disabled?: boolean; icon?: IconName; className?: string; heading?: string; note?: string; items: { label: string; action(): void; danger?: boolean; checked?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const menu = popup.current!;
    menu.setAttribute('popover', 'manual');
    menu.showPopover();
    const place = () => positionPopup(menu, trigger.current!, 'right');
    place();
    const observer = new ResizeObserver(place);
    const area = trigger.current!.closest('.wb'); if (area) observer.observe(area);
    menu.querySelector<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => {
      if (!popup.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    const resize = () => close();
    const scroll = (e: Event) => { if (!menu.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', resize);
    document.addEventListener('scroll', scroll, true);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', resize); document.removeEventListener('scroll', scroll, true); };
  }, [open]);
  // Fragment 保留原型按钮的直接父子关系，避免破坏具名 Grid 列的定位规则。
  return <>
    <button className={`wb-icon ${icon === 'more' ? 'more' : 'field-settings'} ${className}`} type="button" ref={trigger} disabled={disabled} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Icon name={icon}/></button>
    {open && <div className={`wb-menu menu ${heading ? 'fields-menu' : ''}`} ref={popup} style={{ position: 'fixed', inset: 'auto', margin: 0 }} id={id} role="menu" onKeyDown={e => {
      const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)') ?? []);
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); }
      if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
        e.preventDefault();
        const index = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index]?.focus();
      }
    }}>{heading && <><h3>{heading}</h3><p className="fields-scope">仅影响当前展示方式</p></>}{items.map(item => <button type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked} disabled={item.disabled} key={item.label} className={item.danger ? 'wb-danger danger' : ''} onClick={() => { if (item.checked === undefined) close(); item.action(); }}>{item.label}{item.checked !== undefined && <span aria-hidden="true">{item.checked ? <Icon name="check"/> : ''}</span>}</button>)}{note && <p className="fields-note">{note}</p>}</div>}
  </>;
}
export function Picker({ value, options, onChange, label, disabled, kind, title, variant, renderValue }: {
  value: string; options: { value: string; label: React.ReactNode; description?: string; disabled?: boolean }[];
  onChange(value: string): void; label: string; disabled?: boolean;
  kind?: 'project' | 'mode' | 'model'; title?: string; variant?: string;
  /** 触发按钮上的文案可与菜单项文案不同（如基准分支菜单项只写分支名，按钮写「基于 分支名」）。 */
  renderValue?: (selected: { value: string; label: React.ReactNode; description?: string } | undefined) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find(o => o.value === value);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!open) return;
    const menu = popup.current!;
    menu.setAttribute('popover', 'manual'); menu.showPopover();
    const place = () => positionPopup(menu, trigger.current!, 'left', 360);
    place();
    const observer = new ResizeObserver(place);
    const area = trigger.current!.closest('.wb'); if (area) observer.observe(area);
    (menu.querySelector<HTMLButtonElement>('[aria-selected=true]:not(:disabled)') ?? menu.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const move = (e: Event) => { if (!menu.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('scroll', move, true); window.addEventListener('resize', close);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', move, true); window.removeEventListener('resize', close); };
  }, [open]);
  return <div className={kind ? `composer-picker composer-${kind}-picker` : `theme-select ${variant ? `theme-select-${variant}` : ''}`} ref={root}>
    <button type="button" className={kind ? 'composer-trigger' : 'theme-select-trigger'} ref={trigger} disabled={disabled}
      aria-label={label} title={title ?? selected?.description ?? (typeof selected?.label === 'string' ? selected.label : undefined)} aria-haspopup="listbox" aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}>
      {kind === 'project' && <Icon name="folder"/>}<span className={kind ? 'composer-picked' : 'theme-select-value'}>{renderValue ? renderValue(selected) : selected?.label ?? options[0]?.label ?? '暂无可用项'}</span><Icon name="down"/>
    </button>
    {open && <div className="composer-options" style={{ position: 'fixed', inset: 'auto', margin: 0 }} ref={popup} role="listbox" aria-label={label} id={id} onKeyDown={e => {
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); }
      const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>{options.map(option => <button type="button" className="composer-option" role="option" key={option.value} aria-selected={value === option.value} disabled={option.disabled} onClick={() => { onChange(option.value); close(); }}>
      <span className="composer-option-copy"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>{value === option.value && <Icon name="check"/>}
    </button>)}</div>}
  </div>;
}
export function Modal({ title, onClose, children, busy = false, drawer = false }: { title: string; onClose(): void; children: React.ReactNode; busy?: boolean; drawer?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const id = useId();
  useLayoutEffect(() => { setContainer(marker.current?.closest<HTMLElement>('.wb') ?? null); }, []);
  useLayoutEffect(() => {
    if (!container || !dialog.current) return;
    const previous = document.activeElement as HTMLElement | null;
    // 只阻止工作台背景交互，宿主侧栏与原生窗口控件不属于模态范围。
    const background = [...container.children].filter((node): node is HTMLElement => node instanceof HTMLElement && !node.classList.contains('wb-overlay'));
    const original = background.map(node => node.inert);
    background.forEach(node => { node.inert = true; });
    dialog.current.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled),[tabindex="0"]')?.focus({ preventScroll: true });
    return () => { background.forEach((node, i) => { node.inert = original[i]!; }); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [container]);
  const content = <div className={`wb-overlay ${drawer ? 'wb-overlay-drawer' : ''}`}>
    <dialog open className={`wb-dialog dialog ${drawer ? 'wb-drawer workspace-settings' : ''}`} ref={dialog} aria-labelledby={id} aria-modal="true" onKeyDown={e => {
      if (e.defaultPrevented) return;
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
    <header className="dialog-head"><h2 id={id}>{title}</h2><IconButton name="close" label="关闭" disabled={busy} onClick={onClose}/></header>
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
