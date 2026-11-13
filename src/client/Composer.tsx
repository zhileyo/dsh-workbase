import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { GitBranches, LaunchCatalog, Snapshot } from '../shared/model.js';
import type { ClientPort, ComposerBridge, UiMemory } from './api.js';
import { Icon, Menu, Picker } from './ui.js';
import { BranchBar } from './BranchBar.js';
import { launchMessage, submitNativeMessage } from './launch.js';

/** 优先读 items 以保留目录身份；同批 files 仅作回退，避免重复添加。 */
export function composerTransferFiles(data: DataTransfer) {
  const files: File[] = [], directories = new Set<File>();
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (!file) continue;
    files.push(file);
    if (item.webkitGetAsEntry?.()?.isDirectory) directories.add(file);
  }
  if (!files.length) files.push(...Array.from(data.files ?? []));
  return { files, directories };
}

export function Composer({ snapshot, api, memory }: { snapshot: Snapshot; api: ClientPort; memory: UiMemory }) {
  const saved = memory.composer;
  const [draft, setDraft] = useState(saved.draft);
  const [projectId, setProject] = useState(saved.projectId || snapshot.projects.find(p => p.available && !p.archived)?.projectId || '');
  const [preset, setPreset] = useState(saved.preset);
  const [model, setModel] = useState(saved.model);
  const [branch, setBranch] = useState(saved.branch);
  const [worktree, setWorktree] = useState(saved.worktree);
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [forge, setForge] = useState(() => api.forgeAvailable?.() ?? false);
  const [catalog, setCatalog] = useState<LaunchCatalog | null>(null);
  const [error, setError] = useState('');
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState(false);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const [fileDrag, setFileDrag] = useState(false);
  const [modelTarget, setModelTarget] = useState<HTMLDivElement | null>(null);
  const [nativeModel, setNativeModel] = useState({ ready: false, busy: false });
  const onModelState = useCallback((state: { ready: boolean; busy: boolean }) =>
    setNativeModel(previous => previous.ready === state.ready && previous.busy === state.busy ? previous : state), []);
  const bridge = useRef<ComposerBridge | null>(null);
  const locked = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!snapshot.projects.some(p => p.projectId === projectId && p.available && !p.archived))
      setProject(snapshot.projects.find(p => p.available && !p.archived)?.projectId ?? '');
  }, [api, snapshot.projects, projectId]);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = '52px';
    input.current.style.height = `${Math.min(180, Math.max(52, input.current.scrollHeight))}px`;
  }, [draft]);
  useEffect(() => {
    const controller = new AbortController();
    void api.call({ op: 'launch-catalog' }, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      const next = value as LaunchCatalog;
      setCatalog(next); setError('');
      if (!next.presets.some(p => p.id === preset && !p.broken)) setPreset(next.presets.find(p => p.isDefault && !p.broken)?.id ?? next.presets.find(p => !p.broken)?.id ?? '');
      if (!next.models.some(m => JSON.stringify([m.provider, m.id]) === model)) setModel(JSON.stringify([next.defaultModel.provider, next.defaultModel.model]));
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '无法读取模式与模型'); });
    return () => controller.abort();
  }, [api, attempt]);
  useEffect(() => {
    // 读取所选项目的 git 分支；非 git 目录返回 git:false，工作树卡片随之隐藏。
    if (!projectId) { setBranches(null); return; }
    const controller = new AbortController();
    void api.call({ op: 'git-branches', projectId }, controller.signal).then(value => {
      if (!controller.signal.aborted) setBranches(value as GitBranches);
    }).catch(() => { if (!controller.signal.aborted) setBranches(null); });
    return () => controller.abort();
  }, [api, projectId]);
  useEffect(() => {
    // 切换项目后回填该项目的当前分支；手动选过的分支若仍存在则保留。
    if (branches?.git && !branches.branches.includes(branch)) setBranch(branches.current || branches.branches[0] || '');
  }, [branches, branch]);
  useEffect(() => {
    Object.assign(saved, { draft, projectId, preset, model, branch, worktree }); memory.save();
  }, [draft, projectId, preset, model, branch, worktree, memory]);
  const project = snapshot.projects.find(p => p.projectId === projectId);
  const selectedModel = catalog?.models.find(m => JSON.stringify([m.provider, m.id]) === model);
  const pending = saved.pending;
  const editingLocked = busy || nativeBusy || nativeModel.busy || !!pending;
  useEffect(() => { setFileDrag(false); }, [editingLocked, projectId, preset]);
  const importFiles = (files: readonly File[], directories: ReadonlySet<File>) => {
    if (editingLocked || locked.current) return;
    if (!project?.available || project.archived) { setError('请先选择可用项目'); return; }
    try {
      const rejection = bridge.current ? bridge.current.addFiles(files, directories) : '输入服务正在加载，暂时无法添加文件';
      setError(rejection ?? '');
    } catch (e) { setError(e instanceof Error ? e.message : '文件添加失败，草稿仍保留'); }
  };
  const modelReady = api.renderComposerMenu ? nativeModel.ready : !!selectedModel;
  useEffect(() => {
    const probe = () => setForge(api.forgeAvailable?.() ?? false);
    // 官方面板异步挂载；持续探测启停，关闭后同样隐藏，不永久缓存首次命中。
    const timer = window.setInterval(probe, 500);
    const unsubscribe = api.subscribe(probe);
    window.addEventListener('focus', probe);
    probe();
    return () => { window.clearInterval(timer); unsubscribe(); window.removeEventListener('focus', probe); };
  }, [api]);
  const worktreeOn = worktree && forge && !!branches?.git;
  const send = async () => {
    if (locked.current || nativeBusy || nativeModel.busy || !project?.available || project.archived || (!pending && ((!draft.trim() && !attachments) || !modelReady || !preset))) return;
    if (worktreeOn && !branch) { setError('新建工作树需要先选择基准分支。'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      if (api.renderComposerMenu && !pending) {
        const current = bridge.current;
        if (!current) throw new Error('输入服务正在加载，请稍后重试');
        if (await submitNativeMessage(api, memory, current, worktreeOn ? branch : undefined)) {
          setDraft(''); api.openSession(current.sessionId);
        }
        return;
      }
      const sessionId = await launchMessage(api, memory, {
        projectId, preset, provider: selectedModel?.provider ?? '', model: selectedModel?.id ?? '', text: draft,
        ...(worktreeOn ? { baseBranch: branch, worktree: true } : {}),
      });
      setDraft('');
      api.openSession(sessionId);
    } catch (e) { setError(`${e instanceof Error ? e.message : '提交失败'}${saved.pending ? '。重试将复用原会话和消息，不重复发送。' : ''}`); }
    finally { locked.current = false; setBusy(false); }
  };
  const insertAt = () => {
    const el = input.current;
    if (!el) return;
    const at = el.selectionStart ?? draft.length;
    setDraft(draft.slice(0, at) + '@' + draft.slice(at));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at + 1, at + 1); });
  };
  return <section className="wb-composer home-composer composer-shell" aria-label="开始新会话">
    <div className="composer-body" data-composer-card="" data-file-drag={fileDrag || undefined}
      onDragOver={e => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        const allowed = !editingLocked && !locked.current && !!bridge.current && !!project?.available && !project.archived;
        e.dataTransfer.dropEffect = allowed ? 'copy' : 'none'; setFileDrag(allowed);
      }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDrag(false); }}
      onDrop={e => {
        setFileDrag(false);
        const batch = composerTransferFiles(e.dataTransfer);
        if (!batch.files.length && !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        if (batch.files.length) importFiles(batch.files, batch.directories);
      }}>
    <textarea id="quick-input" ref={input} aria-label="新会话首条消息" aria-describedby={error ? errorId : undefined} placeholder={fileDrag ? '松开以添加文件或图片' : '有什么我能帮你的吗？'} title="Enter 换行，⌘ / Ctrl + Enter 发送；支持拖入文件和粘贴图片" maxLength={20000} value={draft} disabled={editingLocked || (!!api.renderComposerMenu && !nativeReady)}
      onPaste={e => {
        const batch = composerTransferFiles(e.clipboardData);
        if (!batch.files.length) return;
        e.preventDefault();
        if (editingLocked || locked.current) return;
        const text = e.clipboardData.getData('text/plain');
        if (text) {
          const el = e.currentTarget;
          const room = Math.max(0, 20000 - el.value.length + el.selectionEnd - el.selectionStart);
          const next = el.value.slice(0, el.selectionStart) + text.slice(0, room) + el.value.slice(el.selectionEnd);
          setDraft(next); bridge.current?.change(next);
        }
        importFiles(batch.files, batch.directories);
      }}
      onChange={e => { setDraft(e.target.value); bridge.current?.change(e.target.value); }} onKeyDown={e => {
        if (!e.metaKey && !e.ctrlKey && bridge.current?.key(e.key === 'Tab' && e.shiftKey ? 'ShiftTab' : e.key, e.nativeEvent.isComposing)) { e.preventDefault(); return; }
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
      }}/>
    <div className="wb-composer-actions composer-actions">
      <div className="wb-composer-leading composer-leading">
        {api.renderComposerMenu && project?.available && preset && !pending
          ? api.renderComposerMenu({ workspaceId: project.workspaceId, preset, disabled: busy || nativeBusy,
            modelTarget, onModelState,
            onReady: value => { bridge.current = value; setNativeReady(!!value); if (!value) onModelState({ ready: false, busy: false }); },
            onState: (text, hasAttachments, sending) => { setDraft(text); setAttachments(hasAttachments); setNativeBusy(sending); } })
          : api.renderComposerMenu ? <button className="wb-icon field-settings" type="button" aria-label="添加上下文" disabled><Icon name="plus"/></button>
          : <Menu icon="plus" label="添加上下文" disabled={busy || !!pending} items={[
          { label: '插入 @ 上下文引用', action: insertAt },
          { label: '清空输入', action: () => { setDraft(''); input.current?.focus(); } },
        ]}/>}
        {api.renderComposerProject ? api.renderComposerProject({ projects: snapshot.projects, value: projectId, disabled: editingLocked, onChange: setProject })
          : <Picker kind="project" label="会话项目" value={projectId} disabled={editingLocked} onChange={setProject}
          options={snapshot.projects.length ? snapshot.projects.map(p => ({ value: p.projectId, label: p.title, disabled: !p.available || p.archived })) : [{ value: '', label: '暂无可用项目', disabled: true }]}/>}
        <Picker kind="mode" label="Agent 模式" value={preset} disabled={!catalog || editingLocked} onChange={setPreset}
          options={catalog?.presets.filter(p => !p.broken).map(p => ({ value: p.id, label: p.name, description: p.description })) ?? [{ value: '', label: '读取模式…' }]}/>
      </div>
      <div className="composer-trailing">
      {api.renderComposerMenu ? <div className="wb-composer-model" ref={setModelTarget} aria-label="会话模型"/>
        : <Picker kind="model" label="会话模型" value={model} disabled={!catalog || editingLocked} onChange={setModel}
        options={catalog?.models.map(m => ({ value: JSON.stringify([m.provider, m.id]), label: m.name, description: m.providerName })) ?? [{ value: '', label: '读取模型…' }]}/>}
      <button id="composer-send" className="wb-send wb-primary primary" type="button" title={pending ? '重试首条消息' : '发送 · ⌘ Enter'} aria-label={pending ? '重试首条消息' : '发送首条消息'}
        disabled={busy || nativeBusy || nativeModel.busy || !project?.available || project.archived || (!pending && ((!draft.trim() && !attachments) || !modelReady || !preset))} onClick={() => void send()}>{busy || nativeBusy ? '…' : <Icon name="up"/>}</button>
      </div>
    </div>
    {!project?.available && projectId && <p className="wb-warning">所选项目目录不可用，请选择可用项目。</p>}
    {catalog?.failures.map(f => <p className="wb-help" key={f.name}>{f.name}：{f.message}</p>)}
    {error && <p id={errorId} role="alert" className="wb-warning">{error}{!catalog && <button type="button" onClick={() => setAttempt(n => n + 1)}>重新读取</button>}</p>}
    </div>
    <BranchBar forge={forge} branches={branches} worktree={worktree} branch={branch} busy={busy || nativeBusy} pending={!!pending}
      projectPath={project?.path} onBranch={setBranch} onWorktree={setWorktree}/>
  </section>;
}
