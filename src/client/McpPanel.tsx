import React, { useEffect, useRef, useState } from 'react';
import type { Project } from '../shared/model.js';
import { mcpDefaults, mcpStateLabels, type McpConfig, type McpConnectionView, type McpSnapshot,
  type McpSource, type McpCandidate } from '../shared/mcp.js';
import { extensionCall, type ClientPort, type UiMemory } from './api.js';
import { Icon, IconButton, Menu, Modal, ModalFlow, Picker, FormField, preventImeSubmit, usePanelSnapshot, type Notify, type ModalState } from './ui.js';
import { t, errorText, statusText } from './i18n.js';
import { ScopePicker } from './ScopePicker.js';
import { apiScopedMap, downloadBlob, usePanelAction } from './panel-utils.js';
import { nextTabIndex } from './roving.js';
import { toScope, toScopeValues, type ScopeValue } from './scope-values.js';

export interface McpPanelProps { api: ClientPort; projects: Project[]; onClose(): void; memory?: UiMemory; navigation?: React.ReactNode; notify?: Notify; embedded?: boolean; onModalState?(state: ModalState): void; onSettings?(): void }
type Tab = 'connections' | 'catalog';
type Detail = { kind: 'create' | 'read' | 'edit' | 'sources' | 'oauth' | 'remove' | 'clear'; id?: string; sourceId?: string; draftKey?: string; candidate?: McpCandidate };
type Form = Partial<McpConfig> & { id?: string; revision?: number; secret: string; argsText: string; envText: string; headersText: string; timeoutText: string; credentialValues: Record<string, string> };
type MarketResult = { candidates: McpCandidate[]; errors: {
  sourceId?: string; message: string; reason?: string; cached?: boolean;
}[] };
const marketConnections = new WeakMap<object, Map<string, string>>();
const candidateKey = (candidate: McpCandidate) => JSON.stringify([candidate.sourceId ?? '', candidate.id ?? candidate.name]);
function sameEndpoint(candidate: McpCandidate, record: McpConnectionView) {
  const config = candidate.config;
  if ((config.transport ?? 'http') !== record.transport) return false;
  if (record.transport === 'stdio') return !!config.command?.trim() && config.command.trim() === record.command.trim()
    && JSON.stringify(config.args ?? []) === JSON.stringify(record.args ?? []);
  try { return !!config.url && new URL(config.url).href === new URL(record.url).href; } catch { return false; }
}
function formFor(record?: Partial<McpConfig> & { id?: string; revision?: number }): Form {
  return { ...mcpDefaults, name: '', description: '', transport: 'http', auth: 'none', url: '', command: '', cwd: '',
    keyHeader: 'X-API-Key', scope: 'global', projectIds: [], enabled: true, ...record, secret: '', credentialValues: {},
    argsText: JSON.stringify(record?.args ?? []), envText: JSON.stringify(record?.env ?? {}),
    timeoutText: String(record?.timeoutSeconds ?? mcpDefaults.timeoutSeconds ?? 30),
    headersText: JSON.stringify(record?.headers ?? {}) };
}
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange(): void }) {
  return <label className="integration-card-toggle" title={label}><input type="checkbox" role="switch"
    className="integration-card-switch" aria-label={label} checked={checked} disabled={disabled} onChange={onChange}/></label>;
}
/** 管理、添加、详情及授权通过ModalFlow共用一个外层抽屉。 */
export function McpPanel({ api, projects, onClose, memory, navigation, notify, embedded, onModalState, onSettings }: McpPanelProps) {
  const connections = apiScopedMap(marketConnections, api);
  const saved = memory?.extensions.mcp;
  const [tab, setTab] = useState<Tab>(saved?.tab === 'catalog' || saved?.tab === 'marketSources' ? 'catalog' : 'connections');
  const [group, setGroup] = useState(saved?.group ?? '');
  const [query, setQuery] = useState(saved?.search ?? '');
  const [snapshot, setSnapshot] = usePanelSnapshot<McpSnapshot>(api, 'mcp');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form>(() => formFor());
  const [addTab, setAddTab] = useState<'create' | 'import'>('create');
  const [importText, setImportText] = useState('');
  const [importScope, setImportScope] = useState<{ scope: 'global' | 'project'; projectIds: string[] }>({ scope: 'global', projectIds: [] });
  const [preview, setPreview] = useState<{ name: string; duplicate: boolean }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [toolQuery, setToolQuery] = useState('');
  const [market, setMarket] = useState<McpCandidate[]>([]);
  const [marketError, setMarketError] = useState('');
  const [sourceDraft, setSourceDraft] = useState<Partial<McpSource>>({});
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [renameId, setRenameId] = useState('');
  const [renameText, setRenameText] = useState('');
  const [draftCache, setDraftCache] = useState<Record<string, Form>>({});
  const recordsRef = useRef<HTMLDivElement>(null);
  const fileRevision = useRef(0);
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [marketRevision, setMarketRevision] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const loadIssue = useRef('');
  const marketScope = useRef('');
  const [fileBusy, setFileBusy] = useState(false);
  const previewRequest = useRef<AbortController | null>(null);
  const snapshotRevision = useRef(0);
  const importBusy = previewBusy || fileBusy;
  const cancelImport = () => {
    fileRevision.current++; previewRequest.current?.abort();
    setFileBusy(false); setPreviewBusy(false);
  };
  const chooseAddTab = (next: 'create' | 'import') => {
    if (actionLock.current || next === addTab) return;
    cancelImport(); setAddTab(next);
  };
  const reportFailure = (message: string) => notify ? notify(errorText(message), 'info') : setError(message);
  const call = <T,>(method: string, input?: unknown, signal?: AbortSignal) => extensionCall<T>(api, 'mcp', method, input, signal);
  useEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    let inFlight = false;
    const refresh = () => {
      if (actionLock.current || inFlight) return;
      // 隐藏时不值得轮询；上一轮没回来也不叠加新请求，避免慢快照把请求排队堆起来。
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight = true;
      const revision = ++snapshotRevision.current;
      void call<McpSnapshot>('snapshot', undefined, controller.signal).then(value => {
        if (!controller.signal.aborted && revision === snapshotRevision.current) { setSnapshot(value); setLoadError(''); loadIssue.current = ''; }
      }).catch(reason => {
        if (controller.signal.aborted || revision !== snapshotRevision.current) return;
        const message = String(reason instanceof Error ? reason.message : reason);
        setLoadError(message);
        if (loadIssue.current !== message) notify?.(errorText(message), 'info');
        loadIssue.current = message;
      }).finally(() => { inFlight = false; });
    };
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => { mounted.current = false; controller.abort(); clearInterval(timer); fileRevision.current++; previewRequest.current?.abort(); snapshotRevision.current++; };
  }, [api]);
  useEffect(() => {
    if (memory) { memory.extensions.mcp = { tab, group, search: query, scroll: recordsRef.current?.scrollTop ?? saved?.scroll ?? 0 }; memory.save(); }
  }, [tab, group, query, memory]);
  useEffect(() => {
    if (snapshot && recordsRef.current && saved?.scroll) recordsRef.current.scrollTop = saved.scroll;
  }, [!!snapshot]);
  useEffect(() => {
    if (detail?.kind !== 'create' || addTab !== 'import' || !importText.trim()) { setPreview([]); setPreviewBusy(false); return; }
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewBusy(true); setImportError('');
    // 正文 textarea 每敲一个字符都会换 importText；预览按 250ms 合并，只把最后一次待发请求发出去（与 RSS 导入预览一致）。
    const timer = setTimeout(() => {
      void call<typeof preview>('previewImport', { text: importText, ...importScope }, controller.signal).then(value => {
        if (!controller.signal.aborted) { setPreview(value); setSelected(value.filter(c => !c.duplicate).map(c => c.name)); }
      }).catch(reason => { if (!controller.signal.aborted) { setPreview([]); setImportError(reason.message ?? '无法解析配置'); } })
        .finally(() => { if (!controller.signal.aborted && previewRequest.current === controller) setPreviewBusy(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [importText, importScope, detail?.kind, addTab, api]);
  useEffect(() => {
    if (tab !== 'catalog' || !snapshot || loadError) { setMarketLoading(false); return; }
    const controller = new AbortController();
    let remoteSettled = false;
    const scope = JSON.stringify([query, snapshot.sources.filter(source => source.enabled).map(source => [source.id, source.url])]);
    if (marketScope.current !== scope) { setMarket([]); marketScope.current = scope; }
    setMarketLoading(true); setMarketError('');
    // 独立只读入口不排在远端请求后面；迟到本地回执不能覆盖最新远端结果。
    void call<MarketResult>('market.cached', { query }, controller.signal).then(value => {
      if (!controller.signal.aborted && !remoteSettled && Array.isArray(value.candidates)) setMarket(value.candidates);
    }).catch(() => undefined);
    const timer = setTimeout(() => { void call<MarketResult>('market', { query }, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        remoteSettled = true;
        setMarket(value.candidates);
        setMarketError(value.errors.map(e => t('市场来源 {p0}：{p1}', {
          p0: snapshot.sources.find(source => source.id === e.sourceId)?.name ?? t('未知来源'),
          p1: e.reason ? t(e.cached ? '市场刷新失败：{p0}；当前显示上次成功加载的目录。'
            : '市场加载失败：{p0}；请重试或手工添加连接。', { p0: errorText(e.reason) }) : errorText(e.message),
        })).join('；'));
      }
    }).catch(reason => {
      if (!controller.signal.aborted) {
        remoteSettled = true;
        const message = reason.message ?? '市场加载失败';
        setMarketError(message); notify?.(errorText(message), 'info');
      }
    })
      .finally(() => { if (!controller.signal.aborted) setMarketLoading(false); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tab, query, !!snapshot, loadError, snapshot?.sources.map(s => `${s.id}:${s.url}:${s.enabled}`).join(','), api, marketRevision]);
  // 动作包装器与技能面板共用一份骨架（panel-utils）：锁、busy、失败回报与焦点恢复都在那里。
  const panelAction = usePanelAction({ lock: actionLock, setBusy, alive: mounted });
  async function act(method: string, input?: unknown, after?: (value: unknown) => void) {
    let committed = false;
    await panelAction(async () => {
      const value = await call(method, input);
      committed = true;
      if (mounted.current) {
        const messages: Record<string, string> = {
          save: '连接器配置已保存', export: '连接器配置导出已发起', sourceSave: '市场来源已保存',
          toggle: '连接器启停设置已保存', sourceToggle: '市场来源设置已保存', tool: '工具启停设置已保存',
          reconnect: '重新连接已请求，请查看连接状态', oauth: '授权已发起，请在授权页完成',
          refreshToken: '令牌刷新已完成，请查看连接状态', cancelOAuth: '授权已取消，配置已保留',
          clearCredentials: '凭据清理已执行，请核对连接状态', sourceRemove: '市场来源已移除',
        };
        if (messages[method]) notify?.(messages[method]!, ['reconnect', 'oauth', 'refreshToken', 'clearCredentials'].includes(method) ? 'info' : 'success');
        after?.(value);
        const revision = ++snapshotRevision.current;
        const next = await call<McpSnapshot>('snapshot');
        if (mounted.current && revision === snapshotRevision.current) { setSnapshot(next); setLoadError(''); loadIssue.current = ''; }
      }
    }, {
      start: () => { snapshotRevision.current++; setError(''); },
      report: reason => reportFailure(`${committed ? '操作已完成，但刷新失败：' : ''}${reason instanceof Error ? reason.message : '操作失败，请重试'}`),
    });
  }
  function show(record: McpConnectionView) { setError(''); setDetail({ kind: 'read', id: record.id }); setToolQuery(''); }
  function create(candidate?: McpCandidate) {
    const draftKey = candidate ? `market:${candidate.sourceId ?? ''}:${candidate.id ?? candidate.name}` : 'create';
    setError(''); setAddTab('create');
    setForm(draftCache[draftKey] ?? formFor({ ...snapshot?.defaults, ...candidate?.config, name: candidate?.name ?? '', description: candidate?.description ?? '' }));
    setDetail({ kind: 'create', draftKey, candidate });
  }
  function back() {
    cancelImport();
    if (detail?.kind === 'edit') {
      setDraftCache(cache => ({ ...cache, [detail.id!]: form })); setDetail({ kind: 'read', id: detail.id });
    } else if (detail?.kind === 'remove' && !detail.id) {
      setDetail({ kind: 'sources' });
    } else { if (detail?.kind === 'create') setDraftCache(cache => ({ ...cache, [detail.draftKey ?? 'create']: form })); setDetail(null); }
    setError('');
  }
  async function readFile(file?: File) {
    if (!file) return;
    const revision = ++fileRevision.current;
    if (!file.name.toLowerCase().endsWith('.json') || file.size > 2 * 1024 * 1024) { setFileBusy(false); setImportError('请选择最大 2 MB 的 .json 文件'); return; }
    setFileBusy(true);
    try {
      const text = await file.text();
      if (mounted.current && revision === fileRevision.current) { setImportText(text); setImportError(''); }
    } catch { if (revision === fileRevision.current) setImportError('文件读取失败，原内容已保留'); }
    finally { if (mounted.current && revision === fileRevision.current) setFileBusy(false); }
  }
  const item = snapshot?.connections.find(c => c.id === detail?.id);
  useEffect(() => { setAuthorizationUrl(item?.authorizationUrl ?? ''); }, [item?.authorizationUrl, item?.id]);
  const connectionProjects = projects.filter(p => snapshot?.connections.some(c => c.scope === 'project' && c.projectIds.includes(p.projectId)));
  const groups = [{ value: '', label: '全部连接' }, { value: 'global', label: '全局连接' },
    ...connectionProjects.map(p => ({ value: p.projectId, label: p.title }))];
  const activeGroup = snapshot && !groups.some(option => option.value === group) ? '' : group;
  useEffect(() => {
    if (activeGroup !== group) setGroup(activeGroup);
  }, [activeGroup, group]);
  const filtered = snapshot?.connections.filter(c => (!activeGroup || activeGroup === 'global' && c.scope === 'global' || c.projectIds.includes(activeGroup))
    && `${c.name} ${c.description}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.installedAt - a.installedAt) ?? [];
  const patch = (key: keyof Form, value: unknown) => setForm(current => ({ ...current, [key]: value }));
  const metadata = detail?.candidate?.metadata;
  const credentialFields = (metadata?.credentialFields ?? []).filter(field =>
    field.bindings.some(binding => binding.target === (form.transport === 'stdio' ? 'env' : 'headers')));
  const boundNames = (target: 'env' | 'headers') => new Set(credentialFields.flatMap(field =>
    field.bindings.filter(binding => binding.target === target).map(binding => binding.name)));
  const singleSecret = ['bearer', 'api-key'].includes(form.auth ?? '') && !boundNames('headers')
    .has(form.auth === 'bearer' ? 'Authorization' : form.keyHeader ?? 'X-API-Key');
  const manualCreate = detail?.kind === 'create' && !detail.candidate;
  const marketCreate = detail?.kind === 'create' && !!detail.candidate;
  const formSection = (title: string, children: React.ReactNode) => marketCreate
    ? <section className="mcp-form-section integration-span"><h3>{t(title)}</h3><div className="integration-form-grid">{children}</div></section>
    : children;
  const advancedSection = (children: React.ReactNode) => marketCreate
    ? <details className="integration-tools mcp-form-advanced integration-span" id="integration-mcp-advanced">
      <summary><Icon name="chevron"/>高级设置</summary><div className="integration-form-grid">{children}</div></details>
    : children;
  const field = (label: string, key: keyof Form, type = 'text') => <FormField label={label}><input aria-label={label} type={type}
    value={String(form[key] ?? '')} disabled={busy} onChange={e => patch(key, type === 'number' ? Number(e.target.value) : e.target.value)}/></FormField>;
  const jsonField = (label: string, key: 'argsText' | 'envText' | 'headersText') => {
    let value = form[key];
    if (key !== 'argsText' && credentialFields.length) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          value = JSON.stringify(Object.fromEntries(Object.entries(parsed).filter(([name]) =>
            !boundNames(key === 'envText' ? 'env' : 'headers').has(name))));
      } catch { /* 保留正在编辑的非法 JSON，提交时统一提示。 */ }
    }
    return <FormField label={label}><textarea aria-label={label} className="integration-code" value={value}
      disabled={busy} onChange={e => patch(key, e.target.value)}/></FormField>;
  };
  const picker = (label: string, key: keyof McpConfig, options: { value: string; label: string; disabled?: boolean }[]) =>
<FormField label={label}><Picker label={label} value={String(form[key] ?? '')} options={options} disabled={busy}
      onChange={value => patch(key, value)}/></FormField>;
  function scopePicker(value: ScopeValue, change: (next: { scope: 'global' | 'project'; projectIds: string[] }) => void) {
    return <FormField label="应用范围"><ScopePicker projects={projects} values={toScopeValues(value)} variant="i-mcp-scopes" disabled={busy}
      onChange={selected => change(toScope(selected))}/></FormField>;
  }
  function saveForm() {
    try {
      const { credentialValues, timeoutText, ...config } = form;
      // 数字字段保留字符串草稿：清空不该被当成 0，也不该让「05」这类输入被悄悄折叠。
      const timeout = Number(timeoutText);
      if (!timeoutText.trim() || !Number.isInteger(timeout) || timeout < 1 || timeout > 300) { setError(t('连接超时需为 1–300 的整数')); return; }
      config.timeoutSeconds = timeout;
      const input = { ...config, args: JSON.parse(form.argsText), env: JSON.parse(form.envText), headers: JSON.parse(form.headersText) };
      if (!input.env || typeof input.env !== 'object' || Array.isArray(input.env)
        || !input.headers || typeof input.headers !== 'object' || Array.isArray(input.headers) || !Array.isArray(input.args)) throw new Error();
      for (const field of credentialFields) {
        const value = credentialValues[field.key] ?? '';
        if (field.required && !value.trim()) {
          setError(t('请填写{p0}', { p0: field.label }));
          if (typeof document.getElementById === 'function') document.getElementById(`integration-mcp-credential-${field.key}`)?.focus();
          return;
        }
        for (const binding of field.bindings) {
          if (binding.target !== (form.transport === 'stdio' ? 'env' : 'headers')) continue;
          if (value) input[binding.target][binding.name] = value;
          else delete input[binding.target][binding.name];
        }
      }
      if (detail?.candidate && singleSecret && !form.secret.trim()) {
        setError(t('请填写{p0}', { p0: metadata?.credentialName || t('密钥') }));
        return;
      }
      void act('save', input, value => {
        const record = value as McpConnectionView;
        if (detail?.candidate) connections.set(candidateKey(detail.candidate), record.id);
        if (snapshot) setSnapshot({ ...snapshot, connections: [...snapshot.connections.filter(row => row.id !== record.id), record] });
        setDraftCache(cache => { const next = { ...cache }; delete next[record.id]; delete next[detail?.draftKey ?? 'create']; return next; });
        setDetail({ kind: record.auth === 'oauth' && record.enabled ? 'oauth' : 'read', id: record.id });
      });
    } catch {
      if (typeof document.getElementById === 'function') {
        const advanced = document.getElementById('integration-mcp-advanced');
        if (advanced?.tagName === 'DETAILS') (advanced as HTMLDetailsElement).open = true;
      }
      setError('参数、环境变量和请求头需要有效 JSON');
    }
  }
  async function exportItem() {
    await act('export', { id: item?.id }, value => {
      const result = value as { content: string; filename: string };
      downloadBlob(new Blob([result.content], { type: 'application/json' }), result.filename);
    });
  }
  const sourceRename = (source: McpSource) => {
    if (!renameText.trim()) { setError('请输入来源名称'); return; }
    if (renameText.trim() === source.name) { setRenameId(''); return; }
    void act('sourceSave', { ...source, name: renameText }, () => setRenameId(''));
  };
  return <ModalFlow embedded={embedded} onModalState={onModalState} main={
    <Modal title="工作台概览" onClose={onClose} drawer className="stats-drawer" busy={busy}>
      <div className="settings-layout">{navigation}<div className="settings-content"><section className="settings-panel" id="workbase-mcp-panel">
      <div className="integration-manager" data-integration="mcp">
        <div className="integration-heading"><h3>连接器管理</h3><button className="primary" type="button" onClick={() => create()}><Icon name="plus"/>添加连接</button>
          {onSettings && <IconButton name="settings" label="连接器设置" outlined disabled={busy || importBusy} onClick={onSettings}/>}</div>
        <p className="integration-caption">管理自有连接、工具和市场来源；外部连接不自动接管。</p>
        <div className="settings-subtabs" role="tablist" aria-label="连接器分类" onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const keys: Tab[] = ['connections', 'catalog'];
          const next = keys[nextTabIndex(e.key, keys.indexOf(tab), keys.length)]!; setTab(next); document.getElementById(`integration-mcp-tab-${next}`)?.focus();
        }}>
          {([['connections', '我的连接'], ['catalog', '连接器市场']] as const).map(([key, label]) =>
            <button type="button" role="tab" id={`integration-mcp-tab-${key}`} aria-controls="integration-mcp-page"
              tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{label}</button>)}
        </div>
        <div className="integration-workspace" data-grouped={tab === 'connections'} id="integration-mcp-page"
          role="tabpanel" aria-labelledby={`integration-mcp-tab-${tab}`}>
          {tab === 'connections' && <aside className="integration-groups" aria-label="连接器应用范围分组">
            <label className="stats-group-search"><Icon name="search"/><input type="search" aria-label="搜索连接"
              placeholder="搜索连接" value={query} onChange={e => setQuery(e.target.value)}/></label>
            <p className="integration-group-title">按应用范围</p><div className="integration-group-list">
              {groups.map(option => <button type="button" className="stats-group-entry" aria-pressed={activeGroup === option.value} key={option.value}
                title={option.label} onClick={() => setGroup(option.value)}><Icon name={option.value ? 'folder' : 'grid'}/>
                <span className="stats-group-copy"><strong>{option.label}</strong></span></button>)}</div>
            <div className="integration-mobile-group">{scopeGroup()}</div>
          </aside>}
          <div className="integration-main">
            {tab === 'catalog' && <div className="integration-toolbar" data-compact-search><label className="stats-group-search"><Icon name="search"/>
              <input type="search" aria-label="搜索连接器市场" value={query} placeholder="搜索名称或说明" onChange={e => setQuery(e.target.value)}/></label>
              <IconButton name="settings" label="市场来源" outlined disabled={busy || !snapshot}
                onClick={() => { setError(''); setDetail({ kind: 'sources' }); }}/>
              <IconButton name="refresh" label={marketLoading ? '正在加载市场目录' : '加载市场'} outlined disabled={busy || marketLoading || !snapshot}
                onClick={() => { setMarketLoading(true); setMarketRevision(revision => revision + 1); }}/></div>}
            {error && <p role="alert" className="integration-form-error">{errorText(error)}</p>}
            {loadError && <p role="alert" className="integration-form-error">{errorText(loadError)}</p>}
            {!snapshot && !loadError && <p role="status">正在读取连接器配置</p>}
            {snapshot && !snapshot.capabilities.connection && <p className="integration-status-line" role="status">官方连接器客户端不可用；可管理配置，不能建立连接。</p>}
            <div className="integration-records" ref={recordsRef} tabIndex={0} aria-label="连接器管理记录" aria-busy={tab === 'catalog' && marketLoading} onScroll={e => {
              if (memory) { memory.extensions.mcp = { tab, group, search: query, scroll: e.currentTarget.scrollTop }; memory.save(); }
            }}>
              {tab === 'connections' && filtered.map(record => <article className="integration-record" key={record.id} data-i-row={record.id}>
                <span className="integration-record-icon"><Icon name="plug"/></span><div className="integration-record-copy">
                  <div className="integration-record-title"><button type="button" title={record.name} onClick={() => show(record)}>{record.name}</button>
                    {record.issue && <span className="integration-card-warning" role="img" title={errorText(record.issue)} aria-label={errorText(record.issue)}><Icon name="alert"/></span>}</div>
                  <p title={record.description || '连接器'}>{record.description || '连接器'}</p>
                </div><div className="integration-record-actions">
                  <Toggle label={`${record.enabled ? '停用' : '启用'} ${record.name}`} checked={record.enabled} disabled={busy}
                    onChange={() => { void act('toggle', { id: record.id, enabled: !record.enabled }); }}/></div>
              </article>)}
              {tab === 'connections' && snapshot?.foreign.map(record => <div className="integration-record" key={`foreign:${record.name}`}>
                <span className="integration-record-icon"><Icon name="plug"/></span><div className="integration-record-copy">
                  <div className="integration-record-title"><strong>{record.name}</strong></div><p>{t(record.source)} · 只读，未接管</p></div>
              </div>)}
              {tab === 'catalog' && market.map((candidate, index) => {
                const id = connections.get(candidateKey(candidate));
                const record = snapshot?.connections.find(row => id ? row.id === id : sameEndpoint(candidate, row));
                const open = () => record ? show(record) : create(candidate);
                return <article className="integration-record" key={`${candidate.sourceId}:${index}`}>
                <span className="integration-record-icon"><Icon name="plug"/></span><div className="integration-record-copy">
                  <div className="integration-record-title"><button type="button" disabled={busy} onClick={open}>{candidate.name}</button>
                    {candidate.issue && <span className="integration-card-warning" role="img" title={errorText(candidate.issue)} aria-label={errorText(candidate.issue)}><Icon name="alert"/></span>}</div>
                  <p title={candidate.description}>{candidate.description}</p></div><div className="integration-record-actions">
                  <button type="button" className={record ? undefined : 'primary'} disabled={busy} onClick={open}>{record ? t(mcpStateLabels[record.state]) : '连接'}</button></div></article>;
              })}
              {tab === 'catalog' && marketError && !loadError && <p role="status" className="integration-help">{errorText(marketError)}</p>}
              {tab === 'catalog' && marketLoading && !market.length && <p role="status" className="integration-help">正在加载市场目录</p>}
              {snapshot && tab === 'connections' && !filtered.length && <p className="integration-help">没有符合条件的连接</p>}
            </div>
          </div>
        </div>
      </div>
      </section></div></div>
    </Modal>
    } detail={detail && <Modal title={detail.kind === 'create' ? '添加连接' : detail.kind === 'sources' ? '市场来源'
      : detail.kind === 'edit' ? '编辑连接' : detail.kind === 'remove' ? '确认移除' : item?.name ?? '连接详情'}
      onClose={back} busy={busy || importBusy} drawer className="stats-drawer"
      leading={<IconButton name="back" label="返回" disabled={busy || importBusy} onClick={back}/>}>
      <div className="settings-layout"><section className="integration-detail"><div className="integration-detail-layout" data-single={!manualCreate}>
      {manualCreate && <nav className="integration-detail-nav" role="tablist" aria-label="添加方式" onKeyDown={e => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); const addKeys = ['create', 'import'] as const;
        const next = addKeys[nextTabIndex(e.key, addKeys.indexOf(addTab), addKeys.length)]!;
        chooseAddTab(next); document.getElementById(`integration-mcp-add-${next}`)?.focus();
      }}>
        {(['create', 'import'] as const).map(key => <button type="button" role="tab" id={`integration-mcp-add-${key}`}
          aria-controls="integration-mcp-add-pane" tabIndex={addTab === key ? 0 : -1} aria-selected={addTab === key} key={key}
          onClick={() => chooseAddTab(key)}><Icon name={key === 'create' ? 'plug' : 'archive'}/>{key === 'create' ? '添加连接' : '导入配置'}</button>)}
      </nav>}
      <div className="integration-detail-main">
        {detail.kind === 'sources' && <div className="todo-detail-summary skill-detail-summary">
          <p className="integration-detail-caption">开关设置即时保存；目录仅用于浏览，不自动连接。</p></div>}
        {(detail.kind === 'read' || detail.kind === 'oauth') && item && <div className="todo-detail-summary skill-detail-summary"><div className="todo-detail-meta">
          <span className={`todo-status ${item.state === 'connected' ? 'done' : ''}`}><Icon name={item.state === 'connected' ? 'check-circle' : ['error', 'auth'].includes(item.state) ? 'alert' : 'clock'}/>{t(mcpStateLabels[item.state])}</span>
          <span>{item.scope === 'global' ? '全局' : item.projectIds.map(id => projects.find(p => p.projectId === id)?.title ?? '不可用项目').join('、')}</span><span>{item.transport === 'http' ? 'HTTP' : '本地命令'} · {item.auth === 'none' ? '无需认证' : item.auth === 'oauth' ? 'OAuth' : '密钥认证'}</span>
          <button type="button" className="skill-export" disabled={busy} onClick={() => { void exportItem(); }}>导出配置</button>
          {['error', 'unknown', 'auth'].includes(item.state) && <button type="button" className="skill-export" disabled={busy || !snapshot?.capabilities.connection || item.auth === 'oauth'}
            onClick={() => { void act('reconnect', { id: item.id }); }}>重新连接</button>}
          {item.auth === 'oauth' && <button type="button" className="skill-export" disabled={busy || !snapshot?.capabilities.oauth || !item.enabled}
            onClick={() => { setAuthorizationUrl(''); setDetail({ kind: 'oauth', id: item.id }); }}>授权管理</button>}
        </div></div>}
        <div className="integration-detail-body" id="integration-mcp-add-pane"
        role={manualCreate ? 'tabpanel' : undefined} aria-labelledby={manualCreate ? `integration-mcp-add-${addTab}` : undefined}>
        {error && <p className="integration-form-error" role="alert">{errorText(error)}</p>}
        {detail.candidate && <section className="mcp-market-overview" aria-label="服务介绍">
          <div className="integration-detail-identity"><span className="integration-record-icon"><Icon name="plug"/></span>
            <div><h3>{detail.candidate.name}</h3>{(metadata?.vendor || metadata?.category) &&
              <p className="integration-help">{[metadata.vendor, metadata.category].filter(Boolean).join(' · ')}</p>}</div>
            {metadata?.homepage && <a className="integration-help" href={metadata.homepage} target="_blank" rel="noopener noreferrer">服务主页</a>}</div>
          <p className="integration-reading integration-description">{metadata?.description || detail.candidate.description}</p>
          {detail.candidate.issue && <p className="integration-help" role="status">{errorText(detail.candidate.issue)}</p>}
        </section>}
        {detail.kind === 'sources' && <>
          <form id="integration-mcp-source-form" className="integration-source-form" onSubmit={e => {
            e.preventDefault(); void act('sourceSave', { name: sourceDraft.name, url: sourceDraft.url, enabled: true },
              () => setSourceDraft({ name: '', url: '' }));
          }} onKeyDown={preventImeSubmit}>
            <div className="integration-form-grid">
              <FormField label="来源名称"><input required disabled={busy} aria-label="来源名称" value={sourceDraft.name ?? ''}
                onChange={e => setSourceDraft(current => ({ ...current, name: e.target.value }))}/></FormField>
              <FormField label="目录地址"><input required disabled={busy} aria-label="目录地址" value={sourceDraft.url ?? ''}
                onChange={e => setSourceDraft(current => ({ ...current, url: e.target.value }))}/></FormField>
            </div>
          </form>
          <section className="integration-market-sources" aria-label="市场来源">
            {snapshot?.sources.map(source => <article className="integration-record integration-source-record" key={source.id}>
              <span className="integration-record-icon"><Icon name="plug"/></span><div className="integration-record-copy"><div className="integration-record-title">
                {renameId === source.id ? <input aria-label="来源名称" value={renameText} autoFocus disabled={busy}
                  onChange={e => setRenameText(e.target.value)} onBlur={() => sourceRename(source)}
                  onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === 'Enter') { e.preventDefault(); sourceRename(source); }
                    if (e.key === 'Escape') { e.preventDefault(); setRenameId(''); } }}/>
                  : <><span className="integration-source-name" title={source.name}>{source.name}</span>{!source.builtin && <button type="button"
                    className="integration-source-edit" aria-label={`修改 ${source.name} 的名称`}
                    onClick={() => { setRenameId(source.id); setRenameText(source.name); }}><Icon name="pencil"/></button>}</>}
              </div><p title={source.url}>{source.url}</p></div><div className="integration-record-actions">
                <Toggle label={`启停 ${source.name}`} checked={source.enabled} disabled={busy}
                  onChange={() => { void act('sourceToggle', { id: source.id, enabled: !source.enabled }); }}/>
                {!source.builtin && <Menu label="来源操作" disabled={busy} items={[{ label: '移除来源', danger: true, action: () => {
                  setDetail({ kind: 'remove', sourceId: source.id });
                } }]}/>}</div></article>)}
            {!snapshot?.sources.length && <p className="integration-help">暂无数据源</p>}
          </section></>}
        {((detail.kind === 'edit' && !!item) || detail.kind === 'create' && addTab === 'create') && <form id="integration-mcp-edit-form"
          onSubmit={e => { e.preventDefault(); saveForm(); }} onKeyDown={preventImeSubmit}>
          <div className="integration-form-grid">
            {formSection('基本设置', <>
            {field('连接名称', 'name')}{scopePicker(form, next => setForm(current => ({ ...current, ...next })))}
            {marketCreate ? <div className="integration-span">{field('简短说明', 'description')}</div> : field('简短说明', 'description')}
            </>)}
            {formSection('连接配置', <>
            {picker('传输方式', 'transport', [{ value: 'http', label: 'HTTP' }, { value: 'stdio', label: 'stdio' }])}
            {!marketCreate && picker('注入方式', 'injection', [{ value: 'always', label: '始终注入' }, { value: 'session', label: '按会话启用（宿主不支持）', disabled: true }])}
            {marketCreate && picker('认证方式', 'auth', [{ value: 'none', label: '无认证' }, { value: 'bearer', label: 'Bearer Token', disabled: form.transport === 'stdio' },
              { value: 'api-key', label: 'API Key', disabled: form.transport === 'stdio' }, { value: 'oauth', label: 'OAuth', disabled: form.transport === 'stdio' }])}
            {form.transport === 'http' ? <div className="integration-span">{field('服务地址', 'url')}</div>
              : <>{field('命令', 'command')}{field('工作目录', 'cwd')}{jsonField('参数（JSON 数组）', 'argsText')}{jsonField('环境变量（JSON 对象）', 'envText')}</>}
            {!marketCreate && picker('认证方式', 'auth', [{ value: 'none', label: '无认证' }, { value: 'bearer', label: 'Bearer Token', disabled: form.transport === 'stdio' },
              { value: 'api-key', label: 'API Key', disabled: form.transport === 'stdio' }, { value: 'oauth', label: 'OAuth', disabled: form.transport === 'stdio' }])}
            {credentialFields.map(credential => <FormField key={credential.key} label={credential.label}>
              <input id={`integration-mcp-credential-${credential.key}`} aria-label={credential.label}
                type={credential.secret ? 'password' : 'text'} autoComplete="off" required={credential.required} disabled={busy}
                placeholder={credential.placeholder} value={form.credentialValues[credential.key] ?? ''}
                onChange={e => setForm(current => ({ ...current, credentialValues: { ...current.credentialValues, [credential.key]: e.target.value } }))}/>
              {credential.description && <p className="integration-help">{credential.description}</p>}
              {credential.helpUrl && <p className="integration-help"><a href={credential.helpUrl} target="_blank" rel="noopener noreferrer">{credential.helpLabel || t('凭据申请说明')}</a></p>}
            </FormField>)}
            {singleSecret && <FormField label={metadata?.credentialName || t('密钥（留空保留）')}>
              <input aria-label={metadata?.credentialName || t('密钥（留空保留）')} type="password" autoComplete="off" disabled={busy}
                required={!!detail.candidate} placeholder={metadata?.credentialPlaceholder} value={form.secret}
                onChange={e => patch('secret', e.target.value)}/></FormField>}
            {metadata?.credentialDescription && <p className="integration-help integration-span">{metadata.credentialDescription}</p>}
            {metadata?.credentialHelpUrl && <p className="integration-help integration-span"><a href={metadata.credentialHelpUrl}
              target="_blank" rel="noopener noreferrer">{metadata.credentialHelpLabel || t('凭据申请说明')}</a></p>}
            {form.auth === 'api-key' && field('API Key 请求头', 'keyHeader')}
            {form.auth === 'oauth' && <>{field('OAuth 公开客户端 ID（留空尝试动态注册）', 'oauthClientId')}
              {field('OAuth scopes（空格分隔）', 'oauthScope')}<p className="integration-help integration-span">
                保存后进行授权，令牌由官方凭据库保管。</p>
              {snapshot && !snapshot.capabilities.oauth && <p className="integration-help integration-span" role="status">官方授权服务不可用，暂不可授权。</p>}</>}
            </>)}
            {advancedSection(<>
            {marketCreate && picker('注入方式', 'injection', [{ value: 'always', label: '始终注入' }, { value: 'session', label: '按会话启用（宿主不支持）', disabled: true }])}
            <FormField label="连接超时（秒）"><input aria-label="连接超时（秒）" inputMode="numeric" value={form.timeoutText} disabled={busy}
              onChange={e => patch('timeoutText', e.target.value)}/></FormField>
            <label className="setting-row integration-span"><strong>断线自动重连</strong><input type="checkbox" className="switch" role="switch" aria-label="断线自动重连"
              checked={form.autoReconnect ?? true} onChange={e => patch('autoReconnect', e.target.checked)} disabled={busy}/></label>
            {form.transport === 'http' && <div className="integration-span">{jsonField('请求头（JSON 对象）', 'headersText')}</div>}
            </>)}
          </div>
          {form.auth !== 'none' && form.auth !== 'oauth' && <p className="integration-help">密钥留空保留已有值，清除请在详情中操作。</p>}
        </form>}
        {detail.kind === 'create' && addTab === 'import' && <>
          <div className="integration-upload"><Icon name="archive"/><div><strong>选择连接器配置文件</strong><p className="integration-help">.json 文件最大 2 MB</p></div>
            <button type="button" onClick={() => fileInput.current?.click()}>选择文件</button><input type="file" accept=".json,application/json" hidden ref={fileInput}
              onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }}/></div>
          <div className="integration-form-grid">{scopePicker(importScope, setImportScope)}
            <label className="integration-span">JSON 配置<textarea className="integration-code" aria-label="JSON 配置" value={importText}
              onChange={e => { cancelImport(); setImportText(e.target.value); }}/></label></div>
          {importError && <p className="integration-form-error" role="alert">{errorText(importError)}</p>}
          <div className="integration-import-items">{preview.map(candidate => <label key={candidate.name}><input type="checkbox"
            disabled={candidate.duplicate || importBusy} checked={selected.includes(candidate.name)} onChange={e => setSelected(current =>
              e.target.checked ? [...current, candidate.name] : current.filter(name => name !== candidate.name))}/>
            {candidate.name}{candidate.duplicate ? ' · 同名保留原记录' : ''}</label>)}</div>
          <p className="integration-help">同名连接保留；请求头和环境变量存入官方凭据库，预览与导出不含敏感原文。</p>
        </>}
        {detail.kind === 'remove' && <p>移除{detail.id ? item?.name : snapshot?.sources.find(source => source.id === detail.sourceId)?.name}？仅影响工作台拥有的条目。</p>}
        {detail.kind === 'clear' && <p>明确清除此连接的全部凭据？配置保留，之后需要重新配置密钥。</p>}
        {(detail.kind === 'read' || detail.kind === 'oauth') && item && <>
          <h3>连接说明</h3>
          <p className="integration-reading integration-description">{item.description || '暂无连接说明。'}</p>
          {item.issue && <p className="integration-form-error" role="status">{errorText(item.issue)}</p>}
          {detail.kind === 'oauth' && <><p role="status">配置已保存。授权完成后会校验令牌并由官方客户端握手，未握手成功不会显示已连接。</p>
            <button type="button" disabled={busy || !snapshot?.capabilities.oauth || !!authorizationUrl || !!item.authorizationUrl}
              onClick={() => { void act('oauth', { id: item.id }, value => {
                setAuthorizationUrl((value as { authorizationUrl: string }).authorizationUrl);
              }); }}>开始授权</button>
            {(authorizationUrl || item.authorizationUrl) && <p className="integration-help"><a href={authorizationUrl || item.authorizationUrl}
              target="_blank" rel="noopener noreferrer">打开授权页</a> · 关闭面板后后台继续</p>}
            <button type="button" disabled={busy || !item.hasSecret || !snapshot?.capabilities.oauth}
              onClick={() => { void act('refreshToken', { id: item.id }, () => setAuthorizationUrl('')); }}>刷新令牌</button>
            <button type="button" disabled={busy} onClick={() => { void act('cancelOAuth', { id: item.id }, () => {
              setAuthorizationUrl(''); setDetail({ kind: 'read', id: item.id });
            }); }}>取消授权并保留配置</button></>}
          <h3>连接配置</h3>
          <pre className="integration-code-view">{item.transport === 'http' ? item.url : `${item.command}\n${JSON.stringify(item.args)}`}</pre>
          <p className="integration-help">超时 {item.timeoutSeconds} 秒 · {item.autoReconnect ? '自动重连' : '不自动重连'}</p>
          <details className="integration-tools"><summary>工具详情<small>{item.tools.filter(t => t.enabled).length} / {item.tools.length} 个已启用</small></summary>
            <label className="integration-tools-search"><Icon name="search"/><input type="search" aria-label="搜索工具名称或说明" value={toolQuery}
              onChange={e => setToolQuery(e.target.value)} placeholder="搜索工具名称或说明"/></label>
            {item.tools.filter(tool => `${tool.name} ${tool.description}`.toLowerCase().includes(toolQuery.toLowerCase())).map(tool =>
              <div className="integration-tool-item" key={tool.name}><div className="integration-tool-head"><details><summary>{tool.name}</summary><p className="integration-help">{tool.description}</p>
                <pre className="integration-code-view">{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>
                <Toggle label={`启停工具 ${tool.name}`} checked={tool.enabled} disabled={busy || item.state !== 'connected'}
                  onChange={() => { void act('tool', { id: item.id, name: tool.name, enabled: !tool.enabled }); }}/></div></div>)}
            {item.state !== 'connected' && <p className="integration-help">连接不可用，工具开关暂不可用。</p>}
          </details>
        </>}
        {(detail.kind === 'read' || detail.kind === 'edit') && !item && <p role="status">连接已经移除，请返回列表。</p>}
      </div><footer className="dialog-footer">
        {detail.kind === 'sources' && <button type="submit" form="integration-mcp-source-form" className="primary"
          disabled={busy || !sourceDraft.name?.trim() || !sourceDraft.url?.trim()}><Icon name="plus"/>添加数据源</button>}
        {((detail.kind === 'edit' && !!item) || detail.kind === 'create' && addTab === 'create') && <>
          {detail.kind === 'edit' && <button type="button" disabled={busy} onClick={back}>取消</button>}
          <button type="submit" form="integration-mcp-edit-form" className="primary" disabled={busy}>{detail.kind === 'edit' ? '保存配置' : form.auth === 'oauth' ? '保存并授权' : '添加连接'}</button></>}
        {detail.kind === 'create' && addTab === 'import' && <button type="button" className="primary"
          disabled={busy || importBusy || !selected.length} onClick={() => { void act('import',
            { text: importText, names: selected, ...importScope }, value => {
              const result = value as { added: number; skipped: number; failed: { name: string; message: string }[] };
              notify?.(statusText(t(`已导入 ${result.added} 个，跳过 ${result.skipped} 个，失败 ${result.failed.length} 个`)), result.failed.length || !result.added ? 'info' : 'success');
              if (result.failed.length) setError(result.failed.map(f => `${f.name}：${f.message}`).join('；'));
              else setDetail(null);
            }); }}>导入所选</button>}
        {detail.kind === 'remove' && <>
          <button type="button" disabled={busy} onClick={() => detail.id ? setDetail({ kind: 'read', id: detail.id }) : setDetail({ kind: 'sources' })}>取消</button>
          <button type="button" className="danger" disabled={busy} onClick={() => { void act(detail.id ? 'remove' : 'sourceRemove',
            { id: detail.id ?? detail.sourceId }, value => {
              const pending = (value as { credentialCleanupPending?: number }).credentialCleanupPending;
              if (pending) {
                const message = t(`条目已移除，${pending} 项凭据清理未确认，请检查官方凭据库`);
                notify?.(message, 'info'); setError(message);
              } else if (detail.id) notify?.('连接器已移除', 'success');
              setDetail(detail.id ? null : { kind: 'sources' });
            }); }}>确认移除</button></>}
        {detail.kind === 'clear' && <>
          <button type="button" disabled={busy} onClick={() => setDetail({ kind: 'read', id: detail.id })}>取消</button>
          <button type="button" className="danger" disabled={busy} onClick={() => { void act('clearCredentials',
            { id: detail.id }, () => setDetail({ kind: 'read', id: detail.id })); }}>确认清除凭据</button></>}
        {(detail.kind === 'read' || detail.kind === 'oauth') && item && <>
          <button type="button" className="primary" disabled={busy} onClick={() => {
            setForm(draftCache[item.id] ?? formFor(item)); setDetail({ kind: 'edit', id: item.id });
          }}>编辑配置</button>
            <Menu label="连接操作" disabled={busy} items={[{ label: '清除凭据', danger: true, disabled: !item.credentialRefs.length,
              action: () => setDetail({ kind: 'clear', id: item.id }) },
              { label: '移除连接', danger: true, action: () => setDetail({ kind: 'remove', id: item.id }) }]}/>
        </>}
      </footer></div></div></section></div>
    </Modal>}
  />;
  function scopeGroup() {
    return <Picker label="连接分组" value={activeGroup} options={groups} onChange={setGroup}/>;
  }
}
