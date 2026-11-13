import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Input, Menu, IconChevronDownOutlineRegular, SettingsForm, SettingsFormModel, SettingsValueField, settingsTextField,
  type SettingsFieldSpec, type SettingsFieldState, type SettingsFormScope, type SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client';
import { useWorkbaseLocale, t } from './i18n.js';
import { ansiKeys, colorKeys, flavours, resolveTerminalColors, terminalPaletteSchema, defaultTerminalColors,
  type TerminalColors, type TerminalPalette } from '../shared/terminal-palette.js';

export interface TerminalPalettePort {
  store: Readable<TerminalPalette | undefined>; supported: Readable<boolean>;
  save(expected: TerminalPalette, value: TerminalPalette, signal: AbortSignal): Promise<void>;
  download(signal: AbortSignal): Promise<{ catppuccin: NonNullable<TerminalPalette['catppuccin']>; sourceRevision: string }>;
}

export interface Readable<T> { getSnapshot(): T; subscribe(listener: () => void): () => void; }
export interface TerminalPort {
  launchShells(sessionId: string, signal: AbortSignal): Promise<{ shells: { path: string; name: string }[]; selectedShell: string | undefined }>;
  selectShell(path: string): void;
}
export interface TerminalTheme { terminalFontFamily: string; terminalFontSize: number; }
export interface OfficialShellState extends SettingsFormShell { timeoutMs: SettingsFieldState; maxOutputBytes: SettingsFieldState; }
export interface OfficialShellFace {
  hooks: { shellCard: Readable<OfficialShellState> };
  edit(field: string, text: string): void;
  resetField(field: string): void;
  save(): void;
  discard(): void;
}
export function officialShellFace(value: unknown): value is OfficialShellFace {
  const face = value as Partial<OfficialShellFace> | undefined;
  const store = face?.hooks?.shellCard;
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.subscribe !== 'function'
    || !['edit', 'resetField', 'save', 'discard'].every(key => typeof (face as unknown as Record<string, unknown>)[key] === 'function')) return false;
  const state = store.getSnapshot();
  return !!state && typeof state.dirty === 'boolean' && typeof state.saving === 'boolean'
    && typeof state.timeoutMs?.text === 'string' && typeof state.maxOutputBytes?.text === 'string';
}
const fields: SettingsFieldSpec[] = [
  { ...settingsTextField('terminalFontFamily'), parse: text => text.trim().length > 200 ? undefined
    : text.trim() ? { kind: 'set', value: text.trim() } : { kind: 'clear' } },
  { field: 'terminalFontSize', format: value => String(value ?? 13), parse: text => {
    if (!text.trim()) return { kind: 'clear' };
    const size = Number(text);
    return Number.isInteger(size) && size >= 10 && size <= 20 ? { kind: 'set', value: size } : undefined;
  } },
];
const activeSession = (list: SessionListState) => {
  const selected = Object.values(list.byId).filter(row => (row.retainedBy.mainView ?? 0) > 0);
  return selected.length === 1 ? selected[0]!.id : undefined;
};

// 官方动作返回 void，以官方发布的 saving/failed/dirty 确认结果，未知结果停止后续写入。
function saveOfficial(face: OfficialShellFace, signal: AbortSignal): Promise<void> {
  const store = face.hooks.shellCard;
  if (signal.aborted) return Promise.reject(new Error('cancelled'));
  if (!store.getSnapshot().dirty) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let started = false, settled = false;
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true; unsubscribe(); clearTimeout(timer); signal.removeEventListener('abort', cancelled);
      if (ok) resolve(); else reject(new Error('unconfirmed'));
    };
    const cancelled = () => finish(false);
    const observe = () => {
      const state = store.getSnapshot();
      if (state.saving) started = true;
      else if (started) finish(state.available && !state.failed && !state.dirty);
    };
    unsubscribe = store.subscribe(observe);
    signal.addEventListener('abort', cancelled, { once: true });
    timer = setTimeout(() => finish(false), 30000);
    try { face.save(); observe(); if (!started) finish(false); } catch { finish(false); }
  });
}

export function TerminalSettings({ theme, terminal, sessions, official, officialText, isLive, palette }: {
  theme: SettingsFormScope<TerminalTheme>; terminal: Readable<TerminalPort | undefined>;
  sessions: Readable<SessionListState>; official: OfficialShellFace;
  officialText: (key: string) => string; isLive: () => boolean;
  palette: TerminalPalettePort;
}) {
  useWorkbaseLocale();
  const id = useId();
  const model = useMemo(() => new SettingsFormModel(theme, fields), [theme]);
  const store = useMemo(() => model.bind(() => ({
    shell: model.shell(), font: model.field('terminalFontFamily'), size: model.field('terminalFontSize'),
  })), [model]);
  const state = useSyncExternalStore<{ shell: SettingsFormShell; font: SettingsFieldState; size: SettingsFieldState }>(
    store.subscribe, store.getSnapshot);
  const actions = useMemo(() => model.actions(), [model]);
  const command = useSyncExternalStore(official.hooks.shellCard.subscribe, official.hooks.shellCard.getSnapshot);
  const port = useSyncExternalStore(terminal.subscribe, terminal.getSnapshot);
  const list = useSyncExternalStore(sessions.subscribe, sessions.getSnapshot);
  const confirmedPalette = useSyncExternalStore(palette.store.subscribe, palette.store.getSnapshot);
  const paletteSupported = useSyncExternalStore(palette.supported.subscribe, palette.supported.getSnapshot);
  const [paletteBaseline, setPaletteBaseline] = useState(confirmedPalette);
  const [paletteDraft, setPaletteDraft] = useState(confirmedPalette);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const paletteDirty = JSON.stringify(paletteDraft) !== JSON.stringify(paletteBaseline);
  useEffect(() => {
    if (!paletteDirty) { setPaletteBaseline(confirmedPalette); setPaletteDraft(confirmedPalette); }
  }, [confirmedPalette, paletteDirty]);
  const sessionId = activeSession(list);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>();
  const [result, setResult] = useState<{ port: TerminalPort; sessionId: string;
    shells: { path: string; name: string }[]; selectedShell: string | undefined }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shellSaveFailed, setShellSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const lifetime = useMemo(() => new AbortController(), [model, official]);
  const busy = useRef(false);
  useEffect(() => () => { lifetime.abort(); model.dispose(); }, [model, lifetime]);
  useEffect(() => {
    setOpen(false); setResult(undefined); setDraft(undefined); setError(false);
    if (!port || !sessionId) { setLoading(false); return; }
    const request = new AbortController();
    setLoading(true);
    void port.launchShells(sessionId, request.signal).then(value => {
      if (request.signal.aborted) return;
      setResult({ ...value, port, sessionId }); setDraft(value.selectedShell); setLoading(false);
    }, () => { if (!request.signal.aborted) { setError(true); setLoading(false); } });
    return () => request.abort();
  }, [port, sessionId, attempt]);
  const current = result?.port === port && result?.sessionId === sessionId ? result : undefined;
  const canChoose = !!current?.shells.length && !loading && !!port && !!sessionId;
  const choice = current?.shells.find(shell => shell.path === draft);
  const shellDirty = !!current && draft !== current.selectedShell;
  const locked = saving || downloading || command.saving || state.shell.saving;
  const writable = (!command.dirty || command.available && command.writable)
    && (!state.shell.dirty || state.shell.available && state.shell.writable)
    && (!shellDirty || canChoose)
    && (!paletteDirty || !!paletteDraft && (paletteDraft.mode === 'follow' || paletteSupported));
  const paletteInvalid = !!paletteDraft && (!terminalPaletteSchema.safeParse(paletteDraft).success
    || paletteDraft.mode !== 'follow' && !resolveTerminalColors(paletteDraft));
  const invalid = command.invalid || state.shell.invalid || shellDirty && !choice || paletteInvalid;
  const save = async () => {
    if (busy.current || locked || !writable || invalid || lifetime.signal.aborted) return;
    busy.current = true; setSaving(true); setFailed(false); setShellSaveFailed(false); setSaved(false);
    try {
      if (!isLive()) throw new Error('cancelled');
      await saveOfficial(official, lifetime.signal);
      if (lifetime.signal.aborted || !isLive()) throw new Error('cancelled');
      if (model.shell().dirty) {
        await model.save();
        if (model.shell().failed || model.shell().dirty) throw new Error('font');
      }
      if (lifetime.signal.aborted || !isLive()) throw new Error('cancelled');
      if (paletteDirty && paletteDraft && paletteBaseline) {
        await palette.save(paletteBaseline, paletteDraft, lifetime.signal);
        if (lifetime.signal.aborted) return;
        setPaletteBaseline(paletteDraft);
      }
      if (lifetime.signal.aborted || !isLive()) throw new Error('cancelled');
      if (shellDirty) {
        if (!canChoose || !choice || !current || !port || terminal.getSnapshot() !== port
          || activeSession(sessions.getSnapshot()) !== sessionId) throw new Error('shell');
        try { port.selectShell(choice.path); }
        catch (error) { setShellSaveFailed(true); throw error; }
        setResult({ ...current, selectedShell: choice.path });
      }
      setSaved(true);
    } catch { if (!lifetime.signal.aborted) setFailed(true); }
    finally { busy.current = false; if (!lifetime.signal.aborted) setSaving(false); }
  };
  const edit = (field: string, text: string) => { setFailed(false); setSaved(false); actions.edit(field, text); };
  const editPalette = (value: TerminalPalette) => { setPaletteDraft(value); setFailed(false); setSaved(false); };
  const download = async () => {
    if (locked || lifetime.signal.aborted) return;
    setDownloading(true); setDownloadFailed(false); setSaved(false);
    try {
      const library = await palette.download(lifetime.signal);
      if (!lifetime.signal.aborted && isLive()) setPaletteDraft(previous => previous
        ? { ...previous, ...library, mode: flavours.includes(previous.mode as typeof flavours[number]) ? previous.mode : 'mocha' } : previous);
    } catch { if (!lifetime.signal.aborted) setDownloadFailed(true); }
    finally { if (!lifetime.signal.aborted) setDownloading(false); }
  };
  const previewColors = paletteDraft ? resolveTerminalColors(paletteDraft) : undefined;
  return <section data-workbase-terminal-settings>
    <SettingsForm state={{ available: true, writable,
      dirty: command.dirty || state.shell.dirty || shellDirty || paletteDirty, invalid: invalid || !writable, saving: locked,
      failed: failed || command.failed || state.shell.failed }}
      onSave={() => { void save(); }} onDiscard={() => {
        lifetime.abort(); actions.discard(); official.discard(); setPaletteDraft(paletteBaseline);
      }} labels={{ unavailable: '当前宿主未提供终端服务。', readOnly: '当前配置为只读。',
        saveFailed: '部分设置可能已保存，未保存草稿已保留，请重试。', save: '保存', saving: '正在保存…' }}>
      <h4>交互终端</h4>
      {!state.shell.available && <p className="wb-terminal-description">当前宿主未提供终端字体配置。</p>}
      <div className="wb-terminal-row">
        <div><label htmlFor={`${id}-font`}>字体</label><p>选择本机字体，或输入名称；留空恢复默认。</p></div>
        <div className="wb-terminal-control">
          <FontPicker id={`${id}-font`} value={state.font.text} disabled={!state.shell.available || !state.shell.writable || locked}
            onEdit={text => edit('terminalFontFamily', text)}/>
          {state.font.invalid && <p className="wb-terminal-error">字体名称最多 200 个字符。</p>}
        </div>
      </div>
      <div className="wb-terminal-value-field"><SettingsValueField id={`${id}-size`} label="字体大小" hint="支持 10–20 px，官方默认 13 px；留空恢复默认。"
        invalidLabel="请输入 10–20 之间的整数。" {...state.size} numeric overriddenLabel="已自定义" resetLabel="恢复默认"
        disabled={!state.shell.available || !state.shell.writable || locked}
        onEdit={text => edit('terminalFontSize', text)} onReset={() => { setFailed(false); setSaved(false); actions.resetField('terminalFontSize'); }}/></div>
      {paletteDraft && <PaletteFields value={paletteDraft} disabled={locked} supported={paletteSupported}
        onEdit={editPalette} onDownload={() => { void download(); }} downloading={downloading} downloadFailed={downloadFailed}/>}
      {paletteInvalid && <p className="wb-terminal-error" role="alert">请输入完整的六位十六进制颜色，或先下载 Catppuccin 色板。</p>}
      <div className="wb-terminal-preview" style={{ background: previewColors?.background, color: previewColors?.foreground }}>
      <pre aria-label="字体预览" style={{ fontFamily: state.font.text.trim() || 'var(--ds-font-family-code)',
        fontSize: state.size.invalid ? 13 : Number(state.size.text.trim() || 13) }}>
        {'$ echo "Hello, terminal"\n'}{t('终端预览')}{' · 0123456789 · {} [] =>'}
      </pre>
      {previewColors && <div className="wb-terminal-swatches" aria-label={t('ANSI 色板')}>
        {ansiKeys.map(key => <span key={key} title={key} style={{ background: previewColors[key] }}/>)}
      </div>}
      </div>
      <div className="wb-terminal-row">
        <div><label>默认 Shell</label><p>仅影响后续新建终端，保存在当前浏览器。</p></div>
        <div className="wb-terminal-control">
          <Menu open={open && canChoose && !locked} portal autoFocus minWidthFromAnchor selectedId={draft}
            className="wb-terminal-picker" listClassName="wb-terminal-shell-menu"
            items={current?.shells.map(shell => ({ id: shell.path, label: `${shell.name} · ${shell.path}` })) ?? []}
            onClose={() => setOpen(false)} onSelect={path => { setDraft(path); setFailed(false); setShellSaveFailed(false); setSaved(false); setOpen(false); }}
            anchor={<Button variant="outline" disabled={!canChoose || locked} aria-label="默认 Shell" aria-haspopup="menu"
              aria-expanded={open && canChoose} onClick={() => setOpen(value => !value)}>{choice?.name ?? t('选择 Shell')}</Button>}/>
          {!canChoose && <p className="wb-terminal-description">{!port ? t('当前宿主未提供终端服务。')
            : !sessionId ? t('请先打开一个会话，再返回此页选择默认 Shell。')
            : loading ? t('正在读取可用 Shell…') : error ? t('读取 Shell 失败，请重试。') : t('当前会话环境没有可用 Shell。')}</p>}
          {error && <Button variant="outline" disabled={locked} onClick={() => setAttempt(value => value + 1)}>重试</Button>}
          {shellSaveFailed && <p className="wb-terminal-error" role="alert">默认 Shell 未能保存在当前浏览器，请检查存储权限或空间后重试。</p>}
        </div>
      </div>
      <h4 className="wb-terminal-command-heading">命令执行限制</h4>
      {(['timeoutMs', 'maxOutputBytes'] as const).map(field => <div key={field} className="wb-terminal-value-field"><SettingsValueField
        id={`${id}-${field}`} label={officialText(field)} hint={officialText(`${field}Hint`)}
        overriddenLabel={officialText('overridden')} resetLabel={officialText('reset')}
        invalidLabel={officialText('invalidNumber')} numeric {...command[field]}
        disabled={!command.available || !command.writable || locked}
        onEdit={text => { setFailed(false); setSaved(false); official.edit(field, text); }}
        onReset={() => { setFailed(false); setSaved(false); official.resetField(field); }}/></div>)}
      {saved && <p className="wb-terminal-description" role="status">设置已保存。</p>}
    </SettingsForm>
  </section>;
}

const paletteNames: Record<TerminalPalette['mode'], string> = {
  follow: '跟随平台', custom: '自定义配色', latte: 'Catppuccin Latte', frappe: 'Catppuccin Frappé',
  macchiato: 'Catppuccin Macchiato', mocha: 'Catppuccin Mocha',
};
const colorLabels: Record<typeof colorKeys[number], string> = {
  background: '背景', foreground: '文字', cursor: '光标', selectionBackground: '选区',
  black: '黑色', red: '红色', green: '绿色', yellow: '黄色', blue: '蓝色', magenta: '品红', cyan: '青色', white: '白色',
  brightBlack: '亮黑', brightRed: '亮红', brightGreen: '亮绿', brightYellow: '亮黄',
  brightBlue: '亮蓝', brightMagenta: '亮品红', brightCyan: '亮青', brightWhite: '亮白',
};
function PaletteFields({ value, disabled, supported, onEdit, onDownload, downloading, downloadFailed }: {
  value: TerminalPalette; disabled: boolean; supported: boolean; onEdit(value: TerminalPalette): void;
  onDownload(): void; downloading: boolean; downloadFailed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const editColor = (key: keyof TerminalColors, color: string) => onEdit({ ...value, custom: { ...value.custom, [key]: color } });
  const row = (key: keyof TerminalColors) => <div className="wb-terminal-row" key={key}>
    <div><label htmlFor={`${id}-${key}`}>{t(colorLabels[key])}</label></div>
    <div className="wb-terminal-control"><Input id={`${id}-${key}`} value={value.custom[key]} disabled={disabled}
      aria-invalid={!/^#[0-9a-fA-F]{6}$/.test(value.custom[key])} onChange={event => editColor(key, event.target.value)}
      placeholder="#1e1e2e"/></div>
  </div>;
  return <>
    <div className="wb-terminal-row">
      <div>
        <div className="wb-terminal-palette-heading">
          <label id={`${id}-label`}>配色方案</label>
          <button type="button" className="wb-terminal-text-action" disabled={disabled || !supported} onClick={onDownload}
            aria-label={value.catppuccin ? t('重新下载 Catppuccin') : t('下载并选择 Catppuccin')}>
            {downloading ? t('正在下载…') : value.catppuccin ? t('重新下载') : t('下载 Catppuccin')}
          </button>
        </div>
        <p>{value.catppuccin ? t('独立配色，保存后生效；Catppuccin 已下载，可离线使用。')
          : t('独立于平台主题，保存后应用到交互终端。')}</p>
        {downloadFailed && <p className="wb-terminal-error" role="alert">下载失败，原配色与草稿已保留，请重试。</p>}
        {!supported && <p>当前宿主未提供可扩展的终端显示入口。</p>}
      </div>
      <div className="wb-terminal-control">
        <Menu open={open && !disabled} portal autoFocus minWidthFromAnchor selectedId={value.mode}
          className="wb-terminal-picker" listClassName="wb-terminal-palette-menu"
          items={Object.entries(paletteNames).map(([key, label]) => ({ id: key, label: t(label),
            disabled: key !== 'follow' && (!supported || key !== 'custom' && !value.catppuccin) }))}
          onClose={() => setOpen(false)} onSelect={mode => {
            if (!Object.hasOwn(paletteNames, mode)) return;
            onEdit({ ...value, mode: mode as TerminalPalette['mode'],
              custom: mode === 'custom' && value.mode !== 'custom' ? resolveTerminalColors(value) ?? value.custom : value.custom });
            setOpen(false);
          }}
          anchor={<Button variant="outline" disabled={disabled} aria-labelledby={`${id}-label`} aria-haspopup="menu"
            aria-expanded={open && !disabled} onClick={() => setOpen(previous => !previous)}>
            {t(paletteNames[value.mode])}<IconChevronDownOutlineRegular size={12}/>
          </Button>}/>
      </div>
    </div>
    {value.mode === 'custom' && <>{colorKeys.slice(0, 4).map(row)}
      <details className="wb-terminal-ansi"><summary>ANSI 色板（16 色）</summary>{ansiKeys.map(row)}
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onEdit({ ...value, custom: defaultTerminalColors() })}>重置色板</Button>
      </details>
    </>}
  </>;
}

function FontPicker({ id, value, disabled, onEdit }: {
  id: string; value: string; disabled: boolean; onEdit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fonts, setFonts] = useState<string[]>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed' | 'unsupported'>('idle');
  const mounted = useRef(true);
  const request = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const expand = () => {
    if (disabled) return;
    setOpen(true); setQuery('');
    if (fonts || request.current) return;
    const local = window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> };
    if (!local.queryLocalFonts) { setStatus('unsupported'); return; }
    request.current = true; setStatus('loading');
    void local.queryLocalFonts().then(rows => {
      if (mounted.current) {
        setFonts([...new Set(rows.map(row => row.family).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
        setStatus('idle');
      }
    }, () => { if (mounted.current) setStatus('failed'); }).finally(() => { request.current = false; });
  };
  const filtered = (fonts ?? []).filter(font => font.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <Menu open={open && !disabled} portal minWidthFromAnchor className="wb-terminal-picker" listClassName="wb-terminal-font-menu"
      items={[{ id: '', label: t('恢复默认') }, ...filtered.map(font => ({ id: font, label: font }))]}
      onClose={() => setOpen(false)} onSelect={font => { onEdit(font); setOpen(false); }}
      anchor={<div className="wb-terminal-font-input">
        <Input id={id} value={value} disabled={disabled} placeholder={t('搜索或输入字体')}
          role="combobox" aria-autocomplete="list" aria-haspopup="menu" aria-expanded={open && !disabled}
          onClick={expand} onChange={event => { onEdit(event.target.value); setQuery(event.target.value); setOpen(true); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' && !open) { event.preventDefault(); expand(); }
            if (event.key === 'Escape' || event.key === 'Enter') setOpen(false);
          }}/>
        <span className="wb-terminal-font-chevron" aria-hidden="true"><IconChevronDownOutlineRegular size={12}/></span>
      </div>}>
      {/* 异步状态留在固定高度的 portal 内，避免改变表单高度及菜单锚点。 */}
      <div className="wb-terminal-font-status" role="status">
        {status === 'loading' && <p>正在读取本机字体…</p>}
        {(status === 'failed' || status === 'unsupported') && <p>无法读取本机字体，可手动输入字体名称。</p>}
        {fonts && !filtered.length && <p>没有匹配字体，可手动输入。</p>}
      </div>
    </Menu>
  </>;
}
