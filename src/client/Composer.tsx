import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GitBranches, LaunchCatalog, Snapshot } from '../shared/model.js';
import type { ClientPort, UiMemory } from './api.js';
import { Icon, Menu, Picker } from './ui.js';
import { BranchBar } from './BranchBar.js';
import { launchMessage } from './launch.js';

export function Composer({ snapshot, api, memory }: { snapshot: Snapshot; api: ClientPort; memory: UiMemory }) {
  const saved = memory.composer;
  const [draft, setDraft] = useState(saved.draft);
  const [projectId, setProject] = useState(saved.projectId || snapshot.projects.find(p => p.available && !p.archived)?.projectId || '');
  const [preset, setPreset] = useState(saved.preset);
  const [model, setModel] = useState(saved.model);
  const [branch, setBranch] = useState(saved.branch);
  const [worktree, setWorktree] = useState(saved.worktree);
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [catalog, setCatalog] = useState<LaunchCatalog | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
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
  // 分支条显隐跟随平台插件开关：@deepseek-ai/dsh-experimental-forge-bundle 启用时
  // client-ui-forge 经 remote.$mount 挂载 forgePanel，开关关闭时整个 bundle 不加载。
  // 挂载晚于首帧：未命中时每 500ms 重探（30s 封顶），窗口重新获得焦点时补探一次。
  const [forge, setForge] = useState(() => api.forgeAvailable());
  useEffect(() => {
    if (forge) return;
    const probe = () => { if (api.forgeAvailable()) setForge(true); };
    const timer = window.setInterval(probe, 500);
    const cap = window.setTimeout(() => window.clearInterval(timer), 30000);
    window.addEventListener('focus', probe);
    return () => { window.clearInterval(timer); window.clearTimeout(cap); window.removeEventListener('focus', probe); };
  }, [api, forge]);
  // 工作树开关只在 Git 项目且 forge 可用时出现；forge 丢失或非 Git 项目时勾选态静默失效。
  const worktreeOn = worktree && forge && !!branches?.git;
  const send = async () => {
    if (locked.current || !project?.available || (!pending && (!draft.trim() || !selectedModel || !preset))) return;
    if (worktreeOn && !branch) { setError('新建工作树需要先选择基准分支。'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
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
    <div className="composer-body">
    <textarea id="quick-input" ref={input} aria-label="新会话首条消息" placeholder="有什么我能帮你的吗？" title="Enter 换行，⌘ / Ctrl + Enter 发送" maxLength={20000} value={draft} disabled={busy || !!pending}
      onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}/>
    <div className="wb-composer-actions composer-actions">
      <div className="wb-composer-leading composer-leading">
        <Menu icon="plus" label="添加上下文" disabled={busy || !!pending} items={[
          { label: '插入 @ 上下文引用', action: insertAt },
          { label: '清空输入', action: () => { setDraft(''); input.current?.focus(); } },
        ]}/>
        <Picker kind="project" label="会话项目" value={projectId} disabled={busy || !!pending} onChange={setProject} title={project?.path}
          options={snapshot.projects.length ? snapshot.projects.map(p => ({ value: p.projectId, label: p.title, description: p.path, disabled: !p.available || p.archived })) : [{ value: '', label: '暂无可用项目', disabled: true }]}/>
        <Picker kind="mode" label="Agent 模式" value={preset} disabled={!catalog || busy || !!pending} onChange={setPreset}
          options={catalog?.presets.map(p => ({ value: p.id, label: ({ standard: '标准模式', ptc: 'PTC 模式', minimal: '极简模式', creator: '创造模式' } as Record<string, string>)[p.name] ?? p.name, description: p.broken, disabled: !!p.broken })) ?? [{ value: '', label: '读取模式…' }]}/>
      </div>
      <div className="composer-trailing">
      <Picker kind="model" label="会话模型" value={model} disabled={!catalog || busy || !!pending} onChange={setModel}
        options={catalog?.models.map(m => ({ value: JSON.stringify([m.provider, m.id]), label: m.name, description: m.providerName })) ?? [{ value: '', label: '读取模型…' }]}/>
      <button id="composer-send" className="wb-send wb-primary primary" type="button" title={pending ? '重试首条消息' : '发送 · ⌘ Enter'} aria-label={pending ? '重试首条消息' : '发送首条消息'}
        disabled={busy || !project?.available || (!pending && (!draft.trim() || !selectedModel || !preset))} onClick={() => void send()}>{busy ? '…' : <Icon name="up"/>}</button>
      </div>
    </div>
    {!project?.available && projectId && <p className="wb-warning">所选项目目录不可用，请选择可用项目。</p>}
    {catalog?.failures.map(f => <p className="wb-help" key={f.name}>{f.name}：{f.message}</p>)}
    {error && <p role="alert" className="wb-warning">{error}{!catalog && <button type="button" onClick={() => setAttempt(n => n + 1)}>重新读取</button>}</p>}
    </div>
    <BranchBar forge={forge} branches={branches} worktree={worktree} branch={branch} busy={busy} pending={!!pending}
      projectPath={project?.path} onBranch={setBranch} onWorktree={setWorktree}/>
  </section>;
}
