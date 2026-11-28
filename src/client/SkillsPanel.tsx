import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { extensionCall, type ClientPort, type UiMemory } from './api.js';
import type { Project, Snapshot } from '../shared/model.js';
import { Modal, ModalFlow, Picker, Icon, IconButton, FormField as Field, preventImeSubmit, usePanelSnapshot, type Notify, type ModalState } from './ui.js';
import { t, errorText as translatedError, statusText } from './i18n.js';
import { MAX_SKILL_UPLOAD, parseSkillUpload, skillContentSchema, type SkillRecord, type SkillReceipt,
  type SkillContent, type SkillMarketItem, type SkillSource, type SkillsSnapshot } from '../shared/skills.js';
import { ScopePicker } from './ScopePicker.js';

/** 保留具名包装：测试按组件名定位技能的范围选择器，直用 ScopePicker 会让定位退化成逐字段猜。 */
function SkillScopePicker({ projects, values, onChange, disabled }: {
  projects: Project[]; values: string[]; onChange(values: string[]): void; disabled?: boolean;
}) {
  return <ScopePicker projects={projects} values={values} onChange={onChange} disabled={disabled ?? false} describedBy="skills-form-error"/>;
}
import { apiScopedMap, downloadBlob, usePanelAction } from './panel-utils.js';
import { nextTabIndex } from './roving.js';
import { toScope, toScopeValues } from './scope-values.js';

const tabs = [['global', '全局技能'], ['project', '项目技能'], ['sources', '技能来源'], ['market', '技能市场']] as const;
type Tab = typeof tabs[number][0];
type Draft = { name: string; description: string; body: string; scope: 'global' | 'project'; projectIds: string[]; sourceId: string };
const emptyDraft = (): Draft => ({ name: '', description: '', body: '', scope: 'global', projectIds: [], sourceId: '' });
type Detail = { kind: 'add' | 'skill' | 'market' | 'market-source'; row?: SkillRecord; editing: boolean; candidate?: SkillMarketItem };
const errorText = (error: unknown) => translatedError(error instanceof Error ? error.message : String(error));
const sourceName = (source: SkillSource) => source.kind === 'agents' && source.name === '公共 Agent' ? t('公共 Agent') : source.name;
const skillError = (row: SkillRecord): row is SkillRecord & { issue: string } => Boolean(row.issue) && row.effective !== 'pending';
const marketInstallations = new WeakMap<object, Map<string, string>>();

/** 管理与详情共用ModalFlow，独立打开和嵌入概览使用同一内容。 */
export function SkillsPanel({ api, projects, onClose, memory, navigation, notify, embedded, onModalState, onSettings }: {
  api: ClientPort; projects: Project[]; onClose(): void; memory?: UiMemory; navigation?: ReactNode; notify?: Notify; embedded?: boolean; onModalState?(state: ModalState): void;
  onSettings?(): void;
}) {
  const installations = apiScopedMap(marketInstallations, api);
  const remembered = memory?.extensions.skills;
  const [tab, setTab] = useState<Tab>(tabs.some(([key]) => key === remembered?.tab) ? remembered!.tab as Tab : 'global');
  const [group, setGroup] = useState(remembered?.group ?? '');
  const [search, setSearch] = useState(remembered?.search ?? '');
  const [snapshot, setSnapshot] = usePanelSnapshot<SkillsSnapshot>(api, 'skills');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detail, setDetail] = useState<Detail>();
  const [addTab, setAddTab] = useState<'create' | 'upload'>('create');
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [uploadScope, setUploadScope] = useState<string[]>(['global']);
  const [uploadText, setUploadText] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadMode, setUploadMode] = useState<'file' | 'directory' | 'repository'>('file');
  const [uploadSource, setUploadSource] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [importToken, setImportToken] = useState('');
  const [previewMode, setPreviewMode] = useState<'file' | 'directory' | 'repository'>('file');
  const [candidates, setCandidates] = useState<(SkillContent & { duplicate: boolean })[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');
  const [marketReading, setMarketReading] = useState(false);
  const [marketSearching, setMarketSearching] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string; error: string }>();
  const records = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const nameHelpId = useId();
  const nameInvalid = !marketReading && !!draft.name && !skillContentSchema.shape.name.safeParse(draft.name).success;
  const fileInput = useRef<HTMLInputElement>(null);
  const requestRevision = useRef(0);
  const marketDetailRequest = useRef<AbortController>();
  const mounted = useRef(true);
  const lock = useRef(false);
  const renameComposing = useRef(false);
  const pageMemory = useRef(new Map<Tab, { group: string; search: string; scroll: number }>());
  const editDrafts = useRef(new Map<string, Draft>());
  const savedScroll = useRef(remembered?.scroll ?? 0);
  const [marketAppending, setMarketAppending] = useState(false);
  const [marketAppendFailed, setMarketAppendFailed] = useState(false);
  const marketPageRequest = useRef<AbortController>();
  const marketPageLock = useRef(false);
  const [sourceDefault, setSourceDefault] = useState<{ api: ClientPort; id: string }>();
  const [sourceError, setSourceError] = useState('');
  const marketSourceSignature = snapshot?.marketSources?.map(source => `${source.id}:${source.url}:${source.enabled}`).join(',');
  const marketView = useRef({ tab, search, signature: marketSourceSignature });
  marketView.current = { tab, search, signature: marketSourceSignature };
  const remember = () => {
    const value = { group, search, scroll: records.current?.scrollTop ?? savedScroll.current };
    pageMemory.current.set(tab, value);
    if (memory) { memory.extensions.skills = { tab, ...value }; memory.save(); }
  };
  const refresh = async (method = 'scan') => {
    const value = await extensionCall<SkillsSnapshot>(api, 'skills', method, method === 'market.load' ? { query: search } : undefined);
    if (mounted.current) setSnapshot(value);
    return value;
  };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void extensionCall<SkillsSnapshot>(api, 'skills', 'snapshot', undefined, controller.signal).then(value => {
      if (!mounted.current) return;
      setSnapshot(value);
      return extensionCall<SkillsSnapshot>(api, 'skills', 'scan', undefined, controller.signal).then(next => {
        if (mounted.current) setSnapshot(next);
      });
    }).catch(err => { if (mounted.current && !controller.signal.aborted) setError(errorText(err)); });
    return () => { mounted.current = false; requestRevision.current++; controller.abort(); marketDetailRequest.current?.abort(); };
  }, [api]);
  useEffect(() => {
    if (detail?.kind !== 'add' && detail?.kind !== 'market') return;
    const controller = new AbortController();
    void api.call({ op: 'snapshot' }, controller.signal).then(result => {
      const value = result as Snapshot;
      if (!controller.signal.aborted)
        setSourceDefault({ api, id: value.preferences.extensionConfig.skills.defaultSourceId });
    }).catch(reason => { if (!controller.signal.aborted) setSourceError(errorText(reason)); });
    return () => controller.abort();
  }, [api, detail?.kind]);
  useEffect(() => {
    if (tab !== 'market') return;
    const controller = new AbortController();
    setMarketAppendFailed(false);
    setMarketSearching(true);
    const timer = setTimeout(() => {
      void extensionCall<SkillsSnapshot>(api, 'skills', 'market.load', { query: search }, controller.signal).then(value => {
        if (!controller.signal.aborted) setSnapshot(value);
      }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); })
        .finally(() => { if (!controller.signal.aborted) setMarketSearching(false); });
    }, 250);
    return () => {
      clearTimeout(timer); controller.abort(); marketPageRequest.current?.abort();
      marketPageLock.current = false; setMarketAppending(false);
    };
  }, [tab, search, api, marketSourceSignature]);
  const loadNextMarketPage = async () => {
    const page = snapshot?.marketPage;
    if (tab !== 'market' || marketSearching || busy || marketPageLock.current || !page?.hasMore
      || page.query !== search.normalize('NFKC').trim()) return;
    const controller = new AbortController(), requestedSearch = search;
    marketPageRequest.current = controller; marketPageLock.current = true; setMarketAppending(true); setMarketAppendFailed(false);
    try {
      const value = await extensionCall<SkillsSnapshot>(api, 'skills', 'market.load', { pageToken: page.token }, controller.signal);
      if (!controller.signal.aborted && marketView.current.tab === 'market' && marketView.current.search === requestedSearch
        && marketView.current.signature === marketSourceSignature)
        setSnapshot(value);
    } catch (reason) { if (!controller.signal.aborted) { setError(errorText(reason)); setMarketAppendFailed(true); } }
    finally {
      if (marketPageRequest.current === controller) {
        marketPageLock.current = false;
        if (mounted.current) setMarketAppending(false);
      }
    }
  };
  const scrollRecords = () => {
    remember();
    const list = records.current;
    if (list && list.scrollHeight - list.scrollTop - list.clientHeight <= 240
      && !marketAppendFailed && !snapshot?.marketSources.some(source => source.enabled && source.issue)) void loadNextMarketPage();
  };
  useLayoutEffect(() => {
    // 首屏不足一屏时继续填充；失败后等待重试，避免循环请求。
    const list = records.current;
    if (list && list.scrollHeight <= list.clientHeight && !marketAppendFailed && !snapshot?.marketSources.some(source => source.enabled && source.issue))
      void loadNextMarketPage();
  }, [snapshot?.marketPage?.token, marketSearching, tab]);
  useLayoutEffect(() => {
    if (records.current) records.current.scrollTop = savedScroll.current;
  }, [tab]);
  useEffect(() => { remember(); }, [tab, group, search, memory]);
  // 动作包装器与 MCP 面板共用一份骨架（panel-utils）：锁、busy、失败回报与焦点恢复都在那里。
  const panelAction = usePanelAction({ lock, setBusy, alive: mounted });
  const run = (job: () => Promise<void>, field = false) => panelAction(job, {
    start: () => (field ? setFormError : setError)(''),
    report: error => {
      if (notify) notify(errorText(error), 'info');
      else (field ? setFormError : setError)(errorText(error));
    },
  });
  const switchTab = (next: Tab) => {
    remember(); const value = pageMemory.current.get(next);
    savedScroll.current = value?.scroll ?? 0; setGroup(value?.group ?? ''); setSearch(value?.search ?? ''); setTab(next);
  };
  const closeDetail = () => { requestRevision.current++; marketDetailRequest.current?.abort(); setMarketReading(false); setDetail(undefined); setFormError(''); };
  const chooseAddTab = (next: 'create' | 'upload') => {
    requestRevision.current++; setAddTab(next); setFormError('');
    if (next === 'create') setDraft(createDraft);
  };
  const openAdd = () => {
    remember(); setFormError(''); setSourceError(''); setSourceDefault(undefined); setAddTab('create'); setDraft(createDraft);
    setDetail({ kind: 'add', editing: true });
  };
  const openSkill = (row: SkillRecord) => {
    remember(); setFormError(''); setDetail({ kind: 'skill', row, editing: false });
    setDraft(editDrafts.current.get(row.id) ?? toDraft(row));
    const revision = ++requestRevision.current;
    void extensionCall<SkillRecord>(api, 'skills', 'detail', { id: row.id }).then(next => {
      if (!mounted.current || revision !== requestRevision.current) return;
      setDetail(active => active?.kind === 'skill' && active.row?.id === row.id ? { ...active, row: next } : active);
      if (!editDrafts.current.has(row.id)) setDraft(toDraft(next));
    }).catch(err => { if (revision === requestRevision.current) setFormError(errorText(err)); });
  };
  const openMarket = (candidate: SkillMarketItem) => {
    remember(); setSourceError(''); setSourceDefault(undefined); marketDetailRequest.current?.abort();
    const controller = new AbortController(); marketDetailRequest.current = controller;
    const revision = ++requestRevision.current;
    setMarketReading(true); setFormError(''); setDraft({ ...emptyDraft(), name: candidate.name, description: candidate.description, body: candidate.body });
    setDetail({ kind: 'market', candidate, editing: true });
    void extensionCall<SkillMarketItem>(api, 'skills', 'market.detail', { id: candidate.id }, controller.signal).then(value => {
      if (!mounted.current || controller.signal.aborted || revision !== requestRevision.current) return;
      setDraft({ ...emptyDraft(), name: value.name, description: value.description, body: value.body });
      setDetail({ kind: 'market', candidate: value, editing: true });
    }).catch(reason => {
      if (!controller.signal.aborted && revision === requestRevision.current) setFormError(errorText(reason));
    }).finally(() => {
      if (!controller.signal.aborted && revision === requestRevision.current) setMarketReading(false);
    });
  };
  const updateDraft = (value: Draft) => {
    setDraft(value); setFormError('');
    if (detail?.kind === 'add') setCreateDraft(value);
    if (detail?.row) editDrafts.current.set(detail.row.id, value);
  };
  const writableSources = snapshot?.sources.filter(source => source.writable && source.scope !== 'project') ?? [];
  const defaultSource = sourceDefault?.api === api
    ? writableSources.find(source => source.id === sourceDefault.id)?.id
      ?? writableSources.find(source => source.id === 'dsh')?.id ?? writableSources[0]?.id ?? ''
    : '';
  const defaultPending = draft.scope === 'global' && !draft.sourceId
    && (detail?.kind === 'market' || detail?.kind === 'add' && addTab === 'create')
    && sourceDefault?.api !== api;
  const scopeValues = toScopeValues(draft);
  const skillProjects = projects.filter(project => snapshot?.skills.some(row => row.scope === 'project'
    && row.sourceId === `project-agents-${project.projectId}` && !row.deletedAt && row.body.trim()));
  const groups = tab === 'global' ? [{ id: '', name: '全部来源' }, ...(snapshot?.sources.filter(source => source.scope !== 'project' && source.enabled) ?? []).map(source => ({ id: source.id, name: sourceName(source) }))]
    : tab === 'project' ? [{ id: '', name: '全部项目' }, ...skillProjects.map(project => ({ id: project.projectId, name: project.title }))] : [];
  const activeGroup = (tab === 'global' || tab === 'project') && snapshot && !groups.some(item => item.id === group) ? '' : group;
  useEffect(() => {
    if (activeGroup !== group) setGroup(activeGroup);
  }, [activeGroup, group]);
  const grouped = tab === 'global' || tab === 'project';
  const terms = search.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (row: { name: string; description?: string; path?: string }) =>
    terms.every(term => `${row.name} ${row.description ?? ''} ${row.path ?? ''}`.normalize('NFKC').toLocaleLowerCase().includes(term));
  const skills = (snapshot?.skills ?? []).filter(row => matches(row) && row.scope === tab
    && snapshot?.sources.find(source => source.id === row.sourceId)?.enabled !== false
    && (!activeGroup || (tab === 'global' ? row.sourceId === activeGroup : row.projectIds.includes(activeGroup))))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.installedAt - a.installedAt);
  const sources = snapshot?.sources.filter(source => source.scope !== 'project' && matches(source)) ?? [];
  const market = snapshot?.market.filter(matches) ?? [];
  const readOnly = (row: SkillRecord) => row.owner !== 'workbase' || row.projectIds.some(id =>
    !projects.some(project => project.projectId === id && project.available && !project.archived));
  const toggle = (row: SkillRecord, enabled: boolean) => void run(async () => {
    const receipt = await extensionCall<SkillReceipt>(api, 'skills', 'toggle', { id: row.id, enabled });
    notify?.(statusText(receipt.message), receipt.effective === 'effective' || receipt.effective === 'disabled' ? 'success' : 'info'); await refresh('snapshot');
  });
  const save = () => {
    if (defaultPending || marketReading || detail?.kind === 'market' && !detail.candidate?.files) return;
    if (!skillContentSchema.shape.name.safeParse(draft.name).success) {
      setFormError(t('技能名称不可包含路径分隔符、控制字符或系统保留名称，最多 100 个字符／240 字节'));
      nameInput.current?.focus({ preventScroll: true });
      return;
    }
    void run(async () => {
      const receipt = await extensionCall<SkillReceipt>(api, 'skills', detail?.kind === 'market' ? 'market.install' : 'save', {
        ...draft, sourceId: draft.scope === 'global' ? draft.sourceId || defaultSource : 'project',
        ...(detail?.row ? { id: detail.row.id, version: detail.row.version } : {}),
        ...(detail?.kind === 'market' ? { marketId: detail.candidate!.id } : {}),
      });
      if (detail?.kind === 'market' && receipt.saved && receipt.skill) {
        installations.set(detail.candidate!.id, receipt.skill.id);
        if (snapshot) setSnapshot({ ...snapshot, skills: [...snapshot.skills.filter(row => row.id !== receipt.skill.id), receipt.skill] });
      }
      notify?.(statusText(receipt.message), receipt.effective === 'effective' || receipt.effective === 'disabled' ? 'success' : 'info'); if (detail?.row) editDrafts.current.delete(detail.row.id);
      if (detail?.kind === 'add') { setCreateDraft(emptyDraft()); }
      closeDetail(); await refresh('snapshot');
    }, true);
  };
  const addPath = () => void run(async () => {
    const path = await api.pickDirectory(); if (!path) return;
    const value = await extensionCall<{ source: SkillSource; duplicate: boolean; snapshot: SkillsSnapshot }>(api, 'skills', 'source.add', { path });
    setSnapshot(value.snapshot);
    notify?.(value.duplicate ? '路径已存在，原有来源已保留' : '技能来源已添加', value.duplicate ? 'info' : 'success');
    if (!value.duplicate) setRename({ id: value.source.id, name: value.source.name, error: '' });
    requestAnimationFrame(() => records.current?.querySelector<HTMLElement>(`[data-i-row="${CSS.escape(value.source.id)}"] input`)?.focus());
  });
  const saveRename = (value: NonNullable<typeof rename>) => {
    if (!value.name.trim() || value.name.length > 80) { setRename({ ...value, error: '名称须为 1–80 字符' }); return; }
    if (lock.current) return;
    void run(async () => {
      try { setSnapshot(await extensionCall<SkillsSnapshot>(api, 'skills', 'source.rename', { id: value.id, name: value.name })); setRename(undefined); notify?.('来源名称已更新', 'success'); }
      catch (err) {
        if (notify) { notify(errorText(err), 'info'); setRename({ ...value, error: '' }); }
        else setRename({ ...value, error: errorText(err) });
      }
    });
  };
  const readUpload = async (file: File) => {
    if (lock.current) return;
    lock.current = true;
    const revision = ++requestRevision.current;
    setUploadError('');
    if (!/\.(md|json)$/i.test(file.name) || file.size > MAX_SKILL_UPLOAD) {
      setUploadError('请选择最大 2 MB 的 .md／.json 文件'); lock.current = false; return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      if (!mounted.current || revision !== requestRevision.current) return;
      const parsed = parseSkillUpload(text), seen = new Set(snapshot?.skills.map(row => row.name));
      const rows = parsed.map(row => { const duplicate = seen.has(row.name); seen.add(row.name); return { ...row, duplicate }; });
      setPreviewMode('file'); setImportToken('');
      setUploadText(text); setUploadName(file.name); setCandidates(rows); setSelected(rows.filter(row => !row.duplicate).map(row => row.name));
    } catch (err) { if (revision === requestRevision.current) setUploadError(errorText(err)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const previewRemote = () => void run(async () => {
    const revision = ++requestRevision.current;
    const rows = await extensionCall<(SkillContent & { duplicate: boolean; token?: string; files?: string[]; commit?: string; issue?: string })[]>(
      api, 'skills', 'import.preview', uploadMode === 'directory' ? { sourceId: uploadSource } : { repositoryUrl });
    if (!mounted.current || revision !== requestRevision.current) return;
    setPreviewMode(uploadMode); setImportToken(rows[0]?.token ?? '');
    setUploadText(rows.map(row => `${row.name}${row.commit ? ` · ${row.commit}` : ''}\n${row.description}\n${row.files?.join('\n') ?? ''}${row.issue ? `\n${translatedError(row.issue)}` : ''}`).join('\n\n'));
    setCandidates(rows.map(row => ({ ...row, duplicate: row.duplicate || !!row.issue })));
    setSelected(rows.filter(row => !row.duplicate && !row.issue).map(row => row.name)); setUploadError('');
  }, true);
  const upload = () => void run(async () => {
    const result = await extensionCall<{ receipts: SkillReceipt[]; skipped: string[]; error?: string; snapshot: SkillsSnapshot }>(api, 'skills', 'import.confirm', {
      ...(previewMode === 'file' ? { text: uploadText } : previewMode === 'directory' ? { fromSourceId: uploadSource } : { token: importToken }),
      names: selected, ...toScope(uploadScope),
    });
    setSnapshot(result.snapshot);
    const completed = new Set(result.receipts.map(receipt => receipt.skill.name));
    setSelected(selected.filter(name => !completed.has(name) && !result.skipped.includes(name)));
    const pending = result.receipts.filter(receipt => receipt.effective !== 'effective' && receipt.effective !== 'disabled').length;
    notify?.(t(`已保存 ${result.receipts.length} 项技能 · 跳过 ${result.skipped.length} 项 · 待确认生效 ${pending} 项`), result.error || pending || !result.receipts.length ? 'info' : 'success');
    if (result.error) throw new Error(`已保存 ${result.receipts.length} 项；${result.error}`);
    setUploadText(''); setUploadName(''); setCandidates([]); closeDetail();
  }, true);
  const download = () => void run(async () => {
    if (!detail?.row) return;
    const text = await extensionCall<string>(api, 'skills', 'export', { id: detail.row.id });
    downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${detail.row.name}.md`);
    notify?.('技能导出已发起', 'success');
  }, true);
  const marketFailures = snapshot?.marketSources.filter(source => source.enabled && source.issue) ?? [];
  const searchBox = <label className="stats-group-search"><Icon name="search"/><input type="search" aria-label="搜索技能名称或说明"
    placeholder="搜索名称或说明" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={preventImeSubmit}/></label>;
  const rescan = () => void run(async () => {
    setScanning(true);
    try {
      await refresh(tab === 'market' ? 'market.load' : 'scan');
      notify?.(tab === 'market' ? '市场目录已刷新' : '扫描完成', 'success');
    } finally { setScanning(false); }
  });
  const directoryAction = tab === 'market' || tab === 'sources'
    ? <IconButton name="refresh" outlined label={tab === 'market'
      ? t(scanning || marketSearching ? '正在加载市场目录' : '加载市场')
      : t(scanning ? '正在扫描…' : '重新扫描')}
      disabled={busy || !snapshot || tab === 'market' && marketSearching} aria-busy={scanning || tab === 'market' && marketSearching} onClick={rescan}/>
    : <button type="button" disabled={busy || !snapshot} aria-busy={scanning}
      onClick={rescan}><Icon name="refresh"/>{scanning ? '正在扫描…' : '重新扫描'}</button>;
  const card = (row: SkillRecord | SkillMarketItem) => {
    const marketCard = !('owner' in row);
    const installed = !marketCard ? row : snapshot?.skills.find(skill => !skill.deletedAt &&
      (installations.has(row.id) ? skill.id === installations.get(row.id) : skill.name === row.name));
    return <article className="integration-record" key={row.id} data-i-row={row.id}>
      <span className="integration-record-icon"><Icon name="skills"/></span>
      <div className="integration-record-copy"><div className="integration-record-title"><button type="button" title={row.name}
        onClick={() => installed ? openSkill(installed) : openMarket(row as SkillMarketItem)}>{row.name}</button>
        {installed && skillError(installed) && <span className="integration-card-warning" role="img" title={translatedError(installed.issue)} aria-label={translatedError(installed.issue)}><Icon name="alert"/></span>}
      </div><p title={row.description}>{row.description}</p></div>
      <div className="integration-record-actions">{installed && marketCard ? <button type="button" disabled={busy} onClick={() => openSkill(installed)}>已安装</button> : installed ? <label className="integration-card-toggle" title={installed.enabled ? '已启用，点击关闭' : '已关闭，点击启用'}>
        <input type="checkbox" role="switch" className="integration-card-switch" checked={installed.enabled} disabled={busy}
          aria-label={`启用 ${row.name}`} onChange={event => toggle(installed, event.target.checked)}/></label>
        : <button type="button" className="primary" disabled={busy} onClick={() => openMarket(row as SkillMarketItem)}>安装</button>}</div>
    </article>;
  };
  const formBusy = busy || marketReading;
  const detailError = formError || (defaultPending ? sourceError : '');
  const fields = <form className={detail?.kind === 'market' ? 'skill-market-form' : undefined} onSubmit={event => { event.preventDefault(); if (!formBusy) save(); }} onKeyDown={preventImeSubmit}>
    <div className="integration-form-grid">
      <Field label="技能名称"><input ref={nameInput} aria-label="技能名称" required maxLength={100} value={draft.name} disabled={formBusy}
        aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? nameHelpId : undefined} onChange={event => updateDraft({ ...draft, name: event.target.value })}/>
        {nameInvalid && <p id={nameHelpId} className="integration-form-error" role="alert">
          名称不可包含路径分隔符、控制字符或系统保留名称。</p>}</Field>
      <Field label="简短说明"><input aria-label="简短说明" required maxLength={2000} value={draft.description} disabled={formBusy}
        aria-describedby="skills-form-error" onChange={event => updateDraft({ ...draft, description: event.target.value })}/></Field>
      <Field label="应用范围"><SkillScopePicker projects={projects} values={scopeValues} disabled={formBusy}
        onChange={values => updateDraft({ ...draft, ...toScope(values), sourceId: '' })}/></Field>
      <Field label="安装位置"><Picker label="安装位置" variant="i-source" value={draft.scope === 'project' ? 'project' : draft.sourceId || defaultSource}
        disabled={formBusy || defaultPending} describedBy="skills-form-error" options={draft.scope === 'project' ? [{ value: 'project', label: '已登记项目的 .dsh/skills' }]
          : (snapshot?.sources.filter(source => source.scope !== 'project') ?? []).map(source => ({
            value: source.id, label: `${source.path}${source.writable ? '' : '（只读）'}`, description: source.path, disabled: !source.writable,
          }))} onChange={sourceId => updateDraft({ ...draft, sourceId })}/></Field>
      <div className="integration-span skill-body-field"><Field label="技能正文"><textarea aria-label="技能正文" required value={draft.body} disabled={formBusy}
        aria-describedby="skills-form-error" onChange={event => updateDraft({ ...draft, body: event.target.value })}/></Field></div>
      {detail?.kind === 'market' && detail.candidate?.files && <div className="integration-span">
        <details className="integration-tools"><summary>关联文件（随技能保存）</summary>
          <ul className="integration-file-list">{detail.candidate.files.map(file => <li key={file}>{file}</li>)}</ul>
        </details></div>}
    </div>
  </form>;
  return <ModalFlow embedded={embedded} onModalState={onModalState} main={
    <Modal title="工作台概览" drawer className="stats-drawer" onClose={() => { remember(); onClose(); }} busy={busy}>
      <div className="settings-layout">{navigation}<div className="settings-content"><section className="settings-panel"><div className="integration-manager" data-integration="skills">
        <div className="integration-heading"><h3>技能管理</h3>
          <button type="button" className="primary" disabled={busy || !snapshot} onClick={openAdd}><Icon name="plus"/>添加技能</button>{grouped && directoryAction}
          {onSettings && <IconButton name="settings" label="技能设置" outlined disabled={busy} onClick={() => { remember(); onSettings(); }}/>}</div>
        <p className="integration-caption">管理全局与项目技能、目录来源和技能市场。</p>
        <div className="settings-subtabs" role="tablist" aria-label="技能管理二级菜单">{tabs.map(([key, label], index) =>
          <button type="button" key={key} id={`skills-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="skills-page" tabIndex={tab === key ? 0 : -1}
            onClick={() => switchTab(key)} onKeyDown={event => {
              if (event.nativeEvent.isComposing || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault(); const next = nextTabIndex(event.key, index, tabs.length);
              switchTab(tabs[next]![0]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }}>{label}</button>)}</div>
        <div className="integration-workspace" data-grouped={grouped} id="skills-page" role="tabpanel" aria-labelledby={`skills-tab-${tab}`}>
          {grouped && <aside className="integration-groups" aria-label="技能分组">{searchBox}<p className="integration-group-title">{tab === 'global' ? '按技能来源' : '按项目'}</p>
            <div className="integration-group-list">{groups.map(item => <button type="button" className="stats-group-entry" key={item.id}
              aria-pressed={activeGroup === item.id} onClick={() => setGroup(item.id)} title={item.name}><Icon name={item.id ? 'folder' : 'grid'}/><span className="stats-group-copy"><strong>{item.name}</strong></span></button>)}</div>
            <div className="integration-mobile-group"><Picker label="选择技能分组" value={activeGroup} options={groups.map(item => ({ value: item.id, label: item.name }))} onChange={setGroup}/></div>
          </aside>}
          <div className="integration-main">{!grouped && <div className="integration-toolbar" data-compact-search>
            {searchBox}
            {tab === 'sources' && <button type="button" disabled={busy} onClick={addPath}><Icon name="plus"/>添加路径</button>}
            {tab === 'market' && <IconButton name="settings" label="市场来源" outlined disabled={busy} onClick={() => { setFormError(''); setDetail({ kind: 'market-source', editing: false }); }}/>}
            {directoryAction}
          </div>}
          {snapshot?.issue && <p className="integration-status-line" role="status"><Icon name="info"/>{translatedError(snapshot.issue)}
            {snapshot.recoverable && <button type="button" disabled={busy} onClick={() => void refresh('recover')
              .catch(reason => { if (mounted.current) setError(translatedError(reason)); })}>{t('重新核对')}</button>}</p>}
          {error && <p className="integration-form-error" role="alert">{translatedError(error)}</p>}
          {tab === 'market' && marketFailures.length > 0 && <p className="integration-form-error" role="status"
            title={marketFailures.map(source => `${source.name}：${translatedError(source.issue!)}`).join('\n')}>
            {`数据源加载失败：${marketFailures.map(source => source.name).join('、')}`}</p>}
          <div className="integration-records" ref={records} tabIndex={0} aria-label="技能记录" onScroll={scrollRecords} aria-busy={tab === 'market' && (marketSearching || marketAppending)}>
            {tab === 'sources' && !!snapshot?.legacyStagedCount && <article className="integration-record integration-source-record">
              <span className="integration-record-icon"><Icon name="archive"/></span><div className="integration-record-copy"><strong>旧版停用目录</strong>
                <p title={snapshot.stagingPath}>{snapshot.stagingPath}</p><p>新启停保留原文件；旧版中转技能重新启用时恢复原位置。</p></div>
              <div className="integration-record-actions"><button type="button" disabled={busy} onClick={() => void run(async () => { await extensionCall(api, 'skills', 'reveal-staging'); })}>打开目录</button></div>
            </article>}
            {tab === 'sources' ? sources.map(source => <article className="integration-record integration-source-record" key={source.id} data-i-row={source.id}>
              <span className="integration-record-icon"><Icon name="folder"/></span><div className="integration-record-copy"><div className="integration-record-title">
                {rename?.id === source.id ? <input autoFocus data-i-source-name={source.id} aria-label="来源名称" maxLength={80} value={rename.name} disabled={busy}
                  aria-describedby={`skills-source-error-${source.id}`} onChange={event => setRename({ ...rename, name: event.target.value, error: '' })}
                  onCompositionStart={() => { renameComposing.current = true; }}
                  onCompositionEnd={event => { renameComposing.current = false; setRename({ ...rename, name: event.currentTarget.value }); }}
                  onBlur={() => { if (renameComposing.current || busy) return; saveRename(rename); }}
                  onKeyDown={event => {
                    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRename(undefined); }
                    if (event.key === 'Enter') { event.preventDefault(); saveRename(rename); }
                  }}/> : <><span className="integration-source-name" title={sourceName(source)}>{sourceName(source)}</span><button type="button" className="integration-source-edit"
                    aria-label={`修改 ${sourceName(source)} 的名称`} title="修改名称" disabled={busy} onClick={() => setRename({ id: source.id, name: source.name, error: '' })}><Icon name="pencil"/></button></>}
              </div><p title={source.path}>{source.path}</p>{rename?.id === source.id && rename.error && <p id={`skills-source-error-${source.id}`} className="integration-source-error" role="alert">{rename.error}</p>}
              </div><div className="integration-record-actions"><label className="integration-card-toggle"><input type="checkbox" role="switch" className="integration-card-switch"
                aria-label={`启用 ${source.name}`} disabled={busy} checked={source.enabled} onChange={event => {
                  const enabled = event.target.checked; void run(async () => { setSnapshot(await extensionCall<SkillsSnapshot>(api, 'skills', 'source.toggle', { id: source.id, enabled })); notify?.('技能来源设置已保存', 'success'); });
                }}/></label></div>
            </article>) : tab === 'market' ? market.map(card) : skills.map(card)}
            {tab === 'market' && marketAppending && <p className="integration-status-line integration-pagination" role="status">正在加载更多技能</p>}
            {tab === 'market' && snapshot?.marketPage?.hasMore && (marketAppendFailed || marketFailures.length > 0) && !marketAppending &&
              <div className="integration-pagination integration-record-actions"><button type="button" disabled={busy || marketSearching} onClick={() => void loadNextMarketPage()}>重试加载更多</button></div>}
            {(!snapshot || (tab === 'sources' ? !sources.length : tab === 'market' ? !market.length : !skills.length)) &&
              <div className="integration-empty" role="status"><Icon name="skills"/><strong>{!snapshot ? '正在读取技能' : tab === 'market' && marketSearching ? '正在搜索技能' : '暂无匹配记录'}</strong>
                {!(tab === 'market' && marketSearching) && <p>试试调整筛选条件，或添加新的记录。</p>}</div>}
          </div></div>
        </div></div></section></div></div>
    </Modal>
    } detail={detail && <Modal title={detail.kind === 'market-source' ? '市场来源' : detail.row ? `${detail.row.name} · ${detail.editing ? '编辑技能' : '技能详情'}` : detail.kind === 'market' ? '添加市场技能' : '添加技能'}
      drawer className="stats-drawer" busy={busy} onClose={closeDetail} leading={<IconButton name="back" label={detail.row && detail.editing ? '返回详情' : '返回列表'} disabled={busy}
        onClick={() => detail.row && detail.editing ? setDetail({ ...detail, editing: false }) : closeDetail()}/>}>
      <div className="settings-layout"><section className="integration-detail"><div className="integration-detail-layout" data-single={detail.kind !== 'add'}>
        {detail.kind === 'add' && <nav className="integration-detail-nav" role="tablist" aria-label="添加技能方式">
          {(['create', 'upload'] as const).map((key, index) => <button type="button" key={key} role="tab" id={`skills-add-${key}`} aria-controls="skills-add-pane"
            tabIndex={key === addTab ? 0 : -1} aria-selected={key === addTab} disabled={busy} onClick={() => chooseAddTab(key)} onKeyDown={event => {
              if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault(); const next = nextTabIndex(event.key, index, 2);
              chooseAddTab(next ? 'upload' : 'create'); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }}>{key === 'create' ? '创建技能' : '上传技能'}</button>)}
        </nav>}
        <div className="integration-detail-main">
          {detail.kind === 'market-source' && <div className="todo-detail-summary skill-detail-summary">
            <p className="integration-detail-caption">内置 SkillHub 和 ClawHub，开关设置即时保存。</p></div>}
          {detail.row && <div className="todo-detail-summary skill-detail-summary"><div className="todo-detail-meta">
            <span className={`todo-status ${detail.row.effective === 'effective' ? 'done' : ''}`}><Icon name={skillError(detail.row) ? 'alert' : detail.row.effective === 'pending' ? 'clock' : detail.row.enabled ? 'check-circle' : 'clock'}/>
              {skillError(detail.row) ? '生效异常' : detail.row.effective === 'effective' ? '已生效' : detail.row.effective === 'pending' || detail.row.enabled ? '已保存，待确认生效' : '已停用'}</span>
            <span title={detail.row.projectIds.map(id => projects.find(project => project.projectId === id)?.title ?? '项目不可用').join('、')}>
              {detail.row.scope === 'global' ? '全局' : `指定项目 · ${detail.row.projectIds.length} 个项目`}</span>
            {!detail.editing && <button type="button" className="skill-export" disabled={busy} onClick={download}>导出技能</button>}
          </div></div>}
          <div className={`integration-detail-body${detail.kind === 'market' ? ' skill-market-body' : ''}`} id={detail.kind === 'add' ? 'skills-add-pane' : undefined} role={detail.kind === 'add' ? 'tabpanel' : undefined}
            aria-labelledby={detail.kind === 'add' ? `skills-add-${addTab}` : undefined}>
            {detail.kind === 'market-source' ? <>
              <section className="integration-market-sources" aria-label="市场来源">
                {snapshot?.marketSources.map(source =>
                <article className="integration-record integration-source-record" key={source.id}>
                  <span className="integration-record-icon"><Icon name="plug"/></span>
                  <div className="integration-record-copy"><div className="integration-record-title"><span className="integration-source-name" title={source.name}>{source.name}</span></div>
                    <p>{source.name === 'SkillHub' ? '评分排序 · 每页 24 条' : '下载榜单 · 每页 10 条'}</p>{source.enabled && source.issue && <p className="integration-form-error" role="status">{translatedError(source.issue)}</p>}</div>
                  <div className="integration-record-actions"><label className="integration-card-toggle"><input type="checkbox" role="switch" className="integration-card-switch" aria-label={`启用 ${source.name}`}
                    disabled={busy} checked={source.enabled} onChange={event => {
                      const enabled = event.target.checked; void run(async () => { setSnapshot(await extensionCall<SkillsSnapshot>(api, 'skills', 'market.source.toggle', { id: source.id, enabled })); notify?.('市场来源设置已保存', 'success'); }, true);
                    }}/></label></div></article>)}</section></>
              : detail.kind === 'add' && addTab === 'upload' ? <>
                <h3>上传技能</h3><p className="integration-caption">选择 SKILL.md 或技能 JSON，检查内容后安装到全局或多个项目。</p>
                <div className="integration-form-grid"><Field label="导入来源"><Picker label="导入来源" disabled={busy} value={uploadMode} options={[
                  { value: 'file', label: '技能文件' }, { value: 'directory', label: '已登记目录' }, { value: 'repository', label: 'GitHub 仓库' },
                ]} onChange={value => { setUploadMode(value as typeof uploadMode); setCandidates([]); setSelected([]); setImportToken(''); }}/></Field>
                  {uploadMode === 'directory' && <Field label="技能来源"><Picker label="技能来源" disabled={busy} value={uploadSource}
                    options={(snapshot?.sources ?? []).map(source => ({ value: source.id, label: source.path, description: source.path }))}
                    onChange={value => { setUploadSource(value); setCandidates([]); setSelected([]); }}/></Field>}
                  {uploadMode === 'repository' && <Field label="仓库地址"><input aria-label="仓库地址" value={repositoryUrl} disabled={busy}
                    onKeyDown={preventImeSubmit} onChange={event => { setRepositoryUrl(event.target.value); setCandidates([]); setSelected([]); setImportToken(''); }}/></Field>}
                  {uploadMode !== 'file' && <div className="integration-span"><button type="button" disabled={busy || (uploadMode === 'directory' ? !uploadSource : !repositoryUrl.trim())}
                    onClick={previewRemote}>加载候选</button><p className="integration-help">目录只读取已登记来源；仓库仅接受公开 GitHub HTTPS 地址，固定提交后保留关联文件。</p></div>}
                  {uploadMode === 'file' && <div className="integration-upload integration-span"><Icon name="archive"/><div><strong>{uploadName || '选择技能文件'}</strong>
                  <p className="integration-help" role="status">支持 .md／.json，单个文件最大 2 MB。</p></div>
                  <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>选择文件</button><input type="file" hidden ref={fileInput}
                    accept=".md,.json,text/markdown,application/json" aria-label="上传技能文件" onChange={event => {
                      const file = event.target.files?.[0]; event.target.value = ''; if (file) void readUpload(file);
                    }}/></div>}
                  <Field label="应用范围"><SkillScopePicker projects={projects} values={uploadScope} disabled={busy} onChange={setUploadScope}/></Field>
                  <div className="integration-span"><Field label="文件内容预览"><textarea className="integration-code" aria-label="文件内容预览" readOnly value={uploadText}/></Field></div>
                </div>
                {uploadError && <p className="integration-form-error" role="alert">{uploadError}</p>}
                <div className="integration-import-items">{candidates.map((candidate, index) => <label key={`${candidate.name}-${index}`}>
                  <input type="checkbox" checked={selected.includes(candidate.name) && !candidate.duplicate} disabled={busy || candidate.duplicate}
                    onChange={event => setSelected(event.target.checked ? [...selected, candidate.name] : selected.filter(name => name !== candidate.name))}/>
                  {candidate.name}{candidate.duplicate ? ' · 同名跳过' : ''}</label>)}</div>
              </> : detail.editing ? fields : <><h3>技能说明</h3><p className="integration-reading integration-description">{detail.row?.description}</p>
                <h3>SKILL.md</h3><pre className="integration-code-view">{detail.row?.body}</pre><h3>关联文件</h3>
                <ul className="integration-file-list">{detail.row?.files.map(file => <li key={file}>{file}</li>)}</ul>
                {detail.row?.issue && <p className={skillError(detail.row) ? 'integration-form-error' : 'integration-help'} role={skillError(detail.row) ? 'alert' : 'status'}>{translatedError(detail.row.issue)}</p>}
                <p className="integration-help">{detail.row?.owner === 'external' ? '外部技能正文只读，启停保留原文件。' : '正文与启停应用于全部所选范围。'}</p></>}
            {detail.kind === 'market' && marketReading && <p className="integration-help" role="status">正在读取技能正文和关联文件</p>}
            {detailError && <p className="integration-form-error" id="skills-form-error" role="alert">{translatedError(detailError)}</p>}
          </div>
          {detail.kind !== 'market-source' && <div className="dialog-footer">
            {detail.editing && <button type="button" disabled={busy} onClick={() => detail.row ? setDetail({ ...detail, editing: false }) : closeDetail()}>取消</button>}
            {detail.kind === 'add' && addTab === 'upload' ?
              <button type="button" className="primary" disabled={busy || !selected.length || !uploadScope.length} onClick={upload}>上传技能</button> :
              detail.editing ? <button type="button" className="primary" disabled={formBusy || defaultPending || detail.kind === 'market' && !detail.candidate?.files || nameInvalid || !draft.name.trim() || !draft.description.trim() || !draft.body.trim() || !scopeValues.length} onClick={save}>
                {detail.row ? '保存修改' : detail.kind === 'market' ? '添加技能' : '创建技能'}</button> :
                <button type="button" className="primary" disabled={busy || !detail.row || readOnly(detail.row)} title={detail.row && readOnly(detail.row) ? '此技能外部归属或项目只读，无法编辑' : undefined}
                  onClick={() => { editDrafts.current.set(detail.row!.id, draft); setDetail({ ...detail, editing: true }); }}><Icon name="pencil"/>编辑技能</button>}
          </div>}
        </div></div></section></div>
    </Modal>}
  />;
}
function toDraft(row: SkillRecord): Draft {
  return { name: row.name, description: row.description, body: row.body, scope: row.scope, projectIds: row.projectIds, sourceId: row.sourceId };
}
