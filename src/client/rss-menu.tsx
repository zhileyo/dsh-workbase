import * as React from 'react';
import { useEffect, useRef } from 'react';
import { Menu } from './ui.js';
import { prototypeIcons } from './prototype-icons.js';

export type RssMenuItem = React.ComponentProps<typeof Menu>['items'][number] & { icon?: keyof typeof prototypeIcons; direction?: 'up' | 'down' };
/** Shared Menu owns keyboard, popover and focus. RSS only adapts prototype placement and icons. */
export function RssMenu({ label, items, className = 'rss-nav-menu', disabled }: {
  label: string; items: RssMenuItem[]; className?: string; disabled?: boolean;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const latest = useRef(items); latest.current = items;
  useEffect(() => {
    const parent = marker.current?.parentElement;
    if (!parent) return;
    let frame = 0;
    const place = () => {
      const trigger = marker.current?.nextElementSibling as HTMLButtonElement | null;
      const id = trigger?.getAttribute('aria-controls'), menu = id ? document.getElementById(id) : null;
      if (!trigger || !menu) return;
      menu.dataset.menuKind = 'rss';
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
      buttons.forEach((button, index) => {
        const item = latest.current[index];
        button.title = item?.label ?? '';
        if (item?.direction) button.dataset.action = `rss-${item.direction}`;
        if (!item?.icon || button.querySelector('[data-rss-menu-icon]')) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
        svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
        svg.setAttribute('aria-hidden', 'true'); svg.dataset.rssMenuIcon = '';
        svg.innerHTML = prototypeIcons[item.icon];
        button.prepend(svg);
      });
      const anchor = trigger.getBoundingClientRect();
      const root = trigger.closest('.wb')?.getBoundingClientRect();
      const left = Math.max(8, root?.left ?? 8), right = Math.min(innerWidth - 8, root?.right ?? innerWidth - 8);
      const top = Math.max(8, root?.top ?? 8), bottom = Math.min(innerHeight - 8, root?.bottom ?? innerHeight - 8);
      const below = bottom - anchor.bottom - 5, above = anchor.top - top - 5;
      menu.style.width = `${Math.min(180, right - left)}px`;
      menu.style.maxHeight = `${Math.max(0, below, above)}px`;
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(left, Math.min(anchor.left, right - rect.width))}px`;
      menu.style.top = `${Math.max(top, rect.height > below && above >= rect.height ? anchor.top - rect.height - 5 : Math.min(bottom - rect.height, anchor.bottom + 5))}px`;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const mutation = new MutationObserver(schedule);
    mutation.observe(parent, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(parent); const root = parent.closest('.wb'); if (root) resize.observe(root);
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); mutation.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); };
  }, []);
  return <><span ref={marker} hidden/><Menu label={label} items={items} icon="more-vertical" className={className} disabled={disabled}/></>;
}
