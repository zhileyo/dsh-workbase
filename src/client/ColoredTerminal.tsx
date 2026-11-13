import { createElement, useEffect, useLayoutEffect, useRef, type ComponentType } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import xtermCss from '@xterm/xterm/css/xterm.css';
import { resolveTerminalColors, type TerminalPalette } from '../shared/terminal-palette.js';
import type { Readable } from './TerminalSettings.js';

// rc.2 的公开 TerminalView 窄契约；不引用或改写宿主私有 xterm 实例。
interface TerminalState {
  phase: string; writable: boolean; issue?: string; error?: string;
  environment?: { scrollback: number; maxCols: number; maxRows: number };
  info?: { cols: number; rows: number; state: string; error?: string; exitCode?: number };
  render?: { revision: number; frame: { type: 'snapshot'; screen: string; info: { cols: number; rows: number } }
    | { type: 'output'; data: string } };
}
interface TerminalView {
  mount(): () => void; connect(): void; refresh(): Promise<void>;
  write(text: string, typed: boolean): void; resize(cols: number, rows: number): void; acknowledge(revision: number): void;
  state: Readable<TerminalState>;
}
interface Theme { fontFamilies: { terminal: string }; fontSizes: { terminal: number }; }
interface Face {
  view(key: string): TerminalView;
  keyedHooks: { terminal(key: string): Readable<TerminalState> };
  hooks: { theme: Readable<Theme> };
}
interface TerminalProps {
  useTabInfo(): { tab: { id: string; visible: boolean; actions: { openTab(kind: string, options: { replaceTab: boolean }): void } } };
  useTerminal(key: string): TerminalState | undefined;
  useTheme(selector: (value: Theme) => Theme): Theme;
  usePalette(selector: (value: TerminalPalette | undefined) => TerminalPalette | undefined): TerminalPalette | undefined;
  view(key: string): TerminalView;
  t(key: string, params?: Record<string, string>): string;
}
interface Entry {
  component: unknown; options: { key?: string; priority?: number };
  locale?: string; store?: unknown; children?: unknown;
  inject?: (sessionId: string) => Face;
}
export interface TerminalSlots {
  entries(name: string): readonly Entry[];
  entriesOfSlot(name: string): readonly Entry[];
  subscribe(name: string, listener: () => void): () => void;
  inject(name: string, callback: () => (() => void)): () => void;
  register(options: { name: string; key: string; priority: number; locale: string;
    inject(sessionId: string): Face & { hooks: Face['hooks'] & { palette: Readable<TerminalPalette | undefined> } } },
    component: ComponentType<TerminalProps>): () => void;
}
const slot = 'sidebar.right.pane.tab';
const officialKey = '@deepseek-ai/dsh-client-ui-sidebar-terminal';

export function installColoredTerminal(slots: TerminalSlots, palette: Readable<TerminalPalette | undefined>,
  enabled: Readable<boolean>, availability: (ready: boolean) => void) {
  return slots.inject(slot, () => {
    let selected: Entry | undefined, dispose: (() => void) | undefined, closed = false, reconciling = false;
    let display: ComponentType<TerminalProps> | undefined;
    const activePalette: Readable<TerminalPalette | undefined> = {
      getSnapshot: () => enabled.getSnapshot() ? palette.getSnapshot() : undefined,
      subscribe(listener) {
        const stopPalette = palette.subscribe(listener), stopEnabled = enabled.subscribe(listener);
        return () => { stopPalette(); stopEnabled(); };
      },
    };
    const views = new WeakMap<TerminalView, TerminalView>();
    const recoveringView = (model: TerminalView) => {
      let adapted = views.get(model);
      if (adapted) return adapted;
      // 两种显示都使用公开 mount/connect。官方 mount 跳过 closed/failed，
      // 但 attach 对仍被宿主保留的已结束终端也会返回完整 screen 快照。
      adapted = {
        state: model.state,
        mount() {
          const release = model.mount(), state = model.state.getSnapshot();
          if (state.info && state.issue !== 'missingTerminal' && ['closed', 'failed'].includes(state.phase))
            model.connect();
          return release;
        },
        connect: () => model.connect(), refresh: () => model.refresh(),
        write: (text, typed) => model.write(text, typed),
        resize: (cols, rows) => model.resize(cols, rows),
        acknowledge: revision => model.acknowledge(revision),
      };
      views.set(model, adapted);
      return adapted;
    };
    const reconcile = () => {
      if (closed || reconciling) return;
      reconciling = true;
      try {
        const winner = slots.entries(slot).filter(entry => entry.options.key === officialKey && entry.component !== display)
          .sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0];
        const next = winner?.locale === 'sidebarTerminal' && winner.inject && !winner.store && !winner.children ? winner : undefined;
        availability(!!next);
        const desired = next;
        if (desired === selected) return;
        const previous = dispose; dispose = undefined; selected = undefined; previous?.();
        if (!desired?.inject) return;
        selected = desired;
        const Official = desired.component as ComponentType<TerminalProps>;
        // 跟随平台或停用扩展时渲染原官方组件；保留薄适配以保证下一次
        // 切换显示以及已结束终端重新挂载时都能取得完整画面。
        display = props => {
          const value = props.usePalette(value => value);
          return value && resolveTerminalColors(value)
            ? <ColoredTerminal {...props}/> : createElement(Official, props);
        };
        dispose = slots.register({
          name: slot, key: officialKey, priority: (desired.options.priority ?? 0) - 1, locale: 'sidebarTerminal',
          inject(sessionId) {
            const face = desired.inject!(sessionId);
            if (typeof face?.view !== 'function' || typeof face.keyedHooks?.terminal !== 'function'
              || typeof face.hooks?.theme?.getSnapshot !== 'function' || typeof face.hooks.theme.subscribe !== 'function')
              throw new Error('Terminal face changed');
            return { ...face, view: key => recoveringView(face.view(key)), hooks: { ...face.hooks, palette: activePalette } };
          },
        }, display);
      } finally { reconciling = false; }
    };
    const subscriptions = [slots.subscribe(slot, reconcile), palette.subscribe(reconcile), enabled.subscribe(reconcile)];
    reconcile();
    return () => { closed = true; subscriptions.forEach(remove => remove()); dispose?.(); availability(false); };
  });
}

function ColoredTerminal({ useTabInfo, useTerminal, useTheme, usePalette, view, t }: TerminalProps) {
  const { tab } = useTabInfo();
  const model = view(tab.id);
  const state = useTerminal(tab.id);
  const theme = useTheme(value => value);
  const palette = usePalette(value => value);
  useEffect(() => model.mount(), [model]);
  const create = <Button variant="outline" size="sm" onClick={() => tab.actions.openTab('terminal', { replaceTab: true })}>{t('new')}</Button>;
  if (!state || !palette) return null;
  if (state.issue === 'missingTerminal') return <section className="wb-terminal-display" data-sidebar-terminal>
    <p role="alert">{t('missingTerminal')}</p>{create}
  </section>;
  const ended = state.info?.state === 'exited' || state.phase === 'closed';
  const retry = !ended && (state.phase === 'disconnected' || state.phase === 'failed');
  const readOnly = state.phase === 'connected' && state.info?.state === 'running' && !state.writable;
  const status = state.info?.state === 'exited' ? t('exited', { code: String(state.info.exitCode ?? '—') })
    : state.info?.state === 'failed' ? t('unavailable')
    : ['idle', 'loading'].includes(state.phase) ? t('loading')
    : ['creating', 'connecting', 'disconnected', 'closed'].includes(state.phase) ? t(state.phase) : undefined;
  const error = state.phase === 'disconnected' ? undefined : state.issue ? t(state.issue) : state.error ?? state.info?.error;
  return <section className="wb-terminal-display" data-sidebar-terminal>
    {(status || retry || readOnly) && <div className="wb-terminal-status" role="status">
      {status}{readOnly && <>{t('readonly')}<Button size="sm" variant="outline" onClick={() => model.connect()}>{t('control')}</Button></>}
      {retry && <Button size="sm" variant="outline" onClick={() => {
        if (state.info) model.connect(); else void model.refresh();
      }}>{t(state.phase === 'disconnected' ? 'reconnect' : 'retry')}</Button>}
      {ended && create}
    </div>}
    {state.info && <Screen state={state} model={model} visible={tab.visible} theme={theme} palette={palette} label={t('title')}/>}
    {error && <p role="alert">{t('failed', { message: error })}</p>}
  </section>;
}

const gestures = ['keydown', 'beforeinput', 'paste', 'compositionend', 'drop', 'mousedown', 'touchstart'] as const;
function Screen({ state, model, visible, theme, palette, label }: {
  state: TerminalState; model: TerminalView; visible: boolean; theme: Theme; palette: TerminalPalette; label: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal>();
  const fit = useRef<FitAddon>();
  const lastRevision = useRef(0);
  const fontFamily = `${theme.fontFamilies.terminal || ''}${theme.fontFamilies.terminal ? ', ' : ''}ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const fontSize = theme.fontSizes.terminal;
  const colors = resolveTerminalColors(palette);
  const current = useRef({ state, visible, fontFamily, fontSize, colors });
  current.current = { state, visible, fontFamily, fontSize, colors };
  const measure = () => {
    const live = current.current;
    if (!live.visible || !live.state.writable || !element.current?.clientWidth || !element.current.clientHeight) return;
    const dimensions = fit.current?.proposeDimensions(), env = live.state.environment, xterm = terminal.current;
    if (!dimensions || !env || !xterm) return;
    const cols = Math.min(dimensions.cols, env.maxCols), rows = Math.min(dimensions.rows, env.maxRows);
    if (cols < 2 || rows < 1) return;
    xterm.resize(cols, rows); model.resize(cols, rows);
  };
  useLayoutEffect(() => {
    const node = element.current!;
    const live = current.current;
    const xterm = new Terminal({ fontFamily: live.fontFamily, fontSize: live.fontSize, cursorBlink: true,
      minimumContrastRatio: 1, scrollback: live.state.environment?.scrollback ?? 0, theme: live.colors });
    const addon = new FitAddon();
    xterm.loadAddon(addon); xterm.open(node);
    xterm.textarea?.setAttribute('aria-label', label);
    terminal.current = xterm; fit.current = addon; lastRevision.current = 0;
    let gestureAt = -Infinity;
    const gesture = () => { gestureAt = performance.now(); };
    gestures.forEach(type => node.addEventListener(type, gesture, { capture: true, passive: true }));
    const input = xterm.onData(data => model.write(data,
      performance.now() - gestureAt < 250 && data !== '\x1b[I' && data !== '\x1b[O'));
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect(); input.dispose();
      gestures.forEach(type => node.removeEventListener(type, gesture, { capture: true }));
      xterm.dispose(); terminal.current = undefined; fit.current = undefined;
    };
  }, [model]);
  useLayoutEffect(() => {
    if (!terminal.current) return;
    terminal.current.options.theme = colors ? { ...colors, cursorAccent: colors.background } : {};
    terminal.current.options.fontFamily = fontFamily;
    terminal.current.options.fontSize = fontSize;
    terminal.current.options.scrollback = state.environment?.scrollback ?? 0;
    measure();
  }, [colors, fontFamily, fontSize, state.environment?.scrollback, model]);
  useLayoutEffect(() => {
    const xterm = terminal.current!, render = state.render;
    if (!render || render.revision <= lastRevision.current) return;
    lastRevision.current = render.revision;
    if (render.frame.type === 'snapshot') {
      xterm.reset();
      xterm.resize(render.frame.info.cols, render.frame.info.rows);
    }
    let live = true;
    xterm.write(render.frame.type === 'snapshot' ? render.frame.screen : render.frame.data, () => {
      if (live && terminal.current === xterm) model.acknowledge(render.revision);
    });
    return () => { live = false; };
  }, [state.render, model]);
  useLayoutEffect(() => {
    const xterm = terminal.current!;
    xterm.options.disableStdin = !state.writable;
    if (!state.writable && state.info) xterm.resize(state.info.cols, state.info.rows); else measure();
  }, [visible, state.writable, state.info?.cols, state.info?.rows, model]);
  useEffect(() => { terminal.current?.textarea?.setAttribute('aria-label', label); }, [label]);
  useEffect(() => { if (visible && state.writable) terminal.current?.focus(); }, [visible, state.writable]);
  return <div className="wb-terminal-screen" ref={element} style={{ background: colors?.background, color: colors?.foreground }}>
    <style>{xtermCss}</style>
  </div>;
}
