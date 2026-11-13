import { useEffect, useId, useRef, useState } from 'react';
import type { Command } from '../shared/commands.js';
import type { RestoreArchive, RestoreStatus } from '../shared/restore.js';
import { DirectoryInput } from './DirectoryInput.js';
import { errorText, languageTag, statusText } from './i18n.js';
import { Icon, Picker, usePopup } from './ui.js';

export function ArchiveInput({ value, onChange, archives, disabled, refresh, describedBy }: {
  value: string; onChange(value: string): void; archives: RestoreArchive[]; disabled: boolean; refresh(): void;
  describedBy?: string;
}) {
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = archives.find(item => item.path === value);
  const { open, close, show: openPopup, onKeyDown: navigate } = usePopup({ trigger: root, popup, disabled, focusTarget: input,
    preferredWidth: () => root.current!.getBoundingClientRect().width, heightLimit: 320 });
  const show = () => { if (!disabled) { openPopup(); refresh(); } };
  return <div className="field">
    <label htmlFor={`${id}-input`}>备份文件</label>
    <div className="wb-archive-input" ref={root}>
      <input id={`${id}-input`} ref={input} className="settings-text-control" aria-label="备份文件绝对路径" aria-describedby={describedBy}
        role="combobox" aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={`${id}-options`}
        value={selected?.name ?? value.split(/[\\/]/).at(-1) ?? ''} title={value} readOnly disabled={disabled} placeholder="点击选择备份文件"
        onClick={show}
        onKeyDown={e => { if (['Enter', ' '].includes(e.key) || (!open && e.key === 'ArrowDown')) {
          e.preventDefault(); show();
        } else if (open) navigate(e); }}/>
      <button type="button" className="flat wb-archive-toggle" aria-label="选择最近备份与回滚副本" aria-haspopup="listbox"
        aria-expanded={open && !disabled} aria-controls={`${id}-options`} disabled={disabled}
        onClick={() => { if (open) close(); else show(); }}><Icon name="down"/></button>
      {open && !disabled && <div className="composer-options wb-archive-options" ref={popup} role="listbox"
        aria-label="最近备份与回滚副本" id={`${id}-options`} style={{ position: 'fixed', inset: 'auto', margin: 0 }}
        onKeyDown={navigate}>
        {!archives.length && <p className="settings-inline-note">暂无备份文件，请先创建备份或检查备份目录。</p>}
        {archives.map(item => <button type="button" className="composer-option" role="option" aria-selected={value === item.path}
          key={item.path} title={item.path} onClick={() => { onChange(item.path); close(); }}>
          <span className="composer-option-copy"><span>{item.name}</span>
            <small>{restoreArchiveLabel(item)} · {(item.bytes / 1024 ** 2).toFixed(1)} MB</small></span>
          {value === item.path && <Icon name="check"/>}
        </button>)}
      </div>}
    </div>
  </div>;
}

export function restoreArchiveLabel(item: RestoreArchive) {
  const id = item.name.match(/([0-9a-f]{8})(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.tar\.age$/i)?.[1];
  const name = item.name.replace(/\.tar\.age$/, '');
  return `${item.rollback ? '回滚' : '备份'} · ${new Date(item.modifiedAt).toLocaleString(languageTag())} · ${id ?? (name.length > 20 ? `${name.slice(0, 16)}…` : name)}`;
}

export function RestoreExecutionStatus({ status }: { status?: RestoreStatus }) {
  return status ? <div className="settings-inline-note" role="status" aria-live="polite"><p>{statusText(status.message)}</p>
    {status.result && <p style={{ overflowWrap: 'anywhere' }}>
      {status.result.mode === 'workbase' ? '回滚副本' : '恢复目录'}：{status.result.path}
    </p>}</div> : <p className="settings-inline-note">正在读取恢复状态…</p>;
}

export function RestoreSettings({ call, disabled, pickDirectory, onPickingChange, onBusyChange, onRestored, onStatusChange, showStatus = true }: {
  call?(command: Command): Promise<unknown>; disabled: boolean; pickDirectory(): Promise<string | null>;
  onPickingChange?(value: boolean): void; onBusyChange?(value: boolean): void; onRestored?(): void;
  onStatusChange?(value: RestoreStatus): void; showStatus?: boolean;
}) {
  const [status, setStatus] = useState<RestoreStatus>();
  const [archives, setArchives] = useState<RestoreArchive[]>([]);
  const [archive, setArchive] = useState('');
  const [directory, setDirectory] = useState('');
  const [mode, setMode] = useState<'workbase' | 'directory'>('directory');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const errorId = useId();
  const callbacks = useRef({ onBusyChange, onRestored, onStatusChange });
  callbacks.current = { onBusyChange, onRestored, onStatusChange };
  const active = useRef(false), submitting = useRef(false);
  const generation = useRef(0);
  const receive = (next: RestoreStatus) => {
    setStatus(next);
    callbacks.current.onStatusChange?.(next);
    const running = ['checking', 'restoring'].includes(next.phase);
    callbacks.current.onBusyChange?.(running);
    if (next.phase === 'completed' && next.result?.mode === 'workbase' && active.current) {
      active.current = false; callbacks.current.onRestored?.();
    }
    active.current = running;
  };
  useEffect(() => {
    if (!call) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const version = generation.current;
      try {
        const next = await call({ op: 'restore-status' }) as RestoreStatus;
        if (!stopped && !submitting.current && version === generation.current) receive(next);
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : '无法读取恢复状态'); }
      if (!stopped) timer = setTimeout(() => { void refresh(); }, 1500);
    };
    void refresh();
    void call({ op: 'restore-catalog' }).then(result => {
      if (!stopped) setArchives(result as RestoreArchive[]);
    }).catch(e => { if (!stopped) setError(e instanceof Error ? e.message : '无法读取最近备份'); });
    return () => { stopped = true; clearTimeout(timer); callbacks.current.onBusyChange?.(false); };
  }, [call]);
  const execute = async (command: Command) => {
    if (!call || submitting.current) return;
    generation.current++;
    submitting.current = true; setPending(true); setError('');
    // 请求发出即阻止设置提交，避免在后端返回前保存旧草稿。
    callbacks.current.onBusyChange?.(true);
    try {
      const next = await call(command) as RestoreStatus;
      receive(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢复操作失败');
      callbacks.current.onBusyChange?.(false);
    } finally { submitting.current = false; setPending(false); }
  };
  const preview = status?.phase === 'ready' ? status.preview : undefined;
  const running = !!status && ['checking', 'restoring'].includes(status.phase);
  const locked = disabled || pending || running || !call;
  return <div className="wb-restore-settings">
    <h3>数据恢复</h3>
    <p className="settings-inline-note">先解密校验，再预览确认。关闭设置后后台任务继续；恢复期间请勿退出宿主。</p>
    <ArchiveInput value={archive} onChange={setArchive} archives={archives} disabled={locked || !!preview} describedBy={error ? errorId : undefined}
      refresh={() => { if (call) void call({ op: 'restore-catalog' }).then(result => setArchives(result as RestoreArchive[]))
        .catch(e => setError(e instanceof Error ? e.message : '无法读取最近备份')); }}/>
    {!preview && <div className="setting-row wb-setting-row"><div><strong>校验备份</strong><small>不修改当前数据。</small></div>
      <button type="button" disabled={locked || !archive.trim()} onClick={() => void execute({
        op: 'restore-preview', archive: archive.trim(), keyPath: '',
      })}>预览恢复</button></div>}
    {preview && <>
      <div className="settings-inline-note" role="status">
        <p>{`备份时间：${new Date(preview.createdAt).toLocaleString(languageTag())} · ${preview.files} 个文件 · ${(preview.bytes / 1024 ** 2).toFixed(1)} MB`}</p>
        <p>{`${preview.projects} 个项目 · ${preview.todos} 个待办。预览有效至 ${new Date(preview.expiresAt).toLocaleTimeString(languageTag())}。`}</p>
      </div>
      <div className="setting-row wb-setting-row"><div><strong>恢复范围</strong></div>
        <Picker label="恢复范围" value={mode} disabled={locked} variant="restore-mode" describedBy={error ? errorId : undefined}
          options={[
            { value: 'directory', label: '恢复到独立目录', description: '导出完整归档到新目录，保留当前数据。' },
            { value: 'workbase', label: '恢复工作台状态', description: '替换项目关联、待办与偏好，先保存回滚副本。',
              disabled: !!preview.workbaseBlockers.length },
          ]} onChange={value => setMode(value as typeof mode)}/></div>
      {mode === 'directory' ? <>
        <DirectoryInput label="恢复保存目录" value={directory} onChange={setDirectory}
          pickDirectory={pickDirectory} disabled={locked} onPickingChange={onPickingChange} describedBy={error ? errorId : undefined}/>
        <p className="settings-inline-note">在所选目录内新建独立目录。会话、附件、SQLite 和 Profile 文件不会自动激活到当前宿主。</p>
      </> : <p className="wb-warning">将替换工作台的项目关联、待办、标记和偏好。替换前保存加密回滚副本，保留当前备份配置并关闭插件自动更新。</p>}
      {!!preview.workbaseBlockers.length && <p className="wb-warning">工作台替换不可用：{preview.workbaseBlockers.map(errorText).join(languageTag() === 'en-US' ? '; ' : '；')}</p>}
      <details><summary>备份覆盖明细（{preview.coverage.length} 项）</summary>
        {preview.coverage.map(item => <p className="settings-inline-note" key={item.id}>{item.id}：{errorText(item.message)}</p>)}</details>
      <div className="setting-row wb-setting-row">
        <button type="button" disabled={locked} onClick={() => void execute({ op: 'restore-discard', token: preview.token })}>取消预览</button>
        <button type="button" className="primary" disabled={locked || (mode === 'directory' ? !directory.trim() : !!preview.workbaseBlockers.length)}
          onClick={() => void execute({ op: 'restore-confirm', token: preview.token, mode,
            ...(mode === 'directory' ? { directory: directory.trim() } : {}) })}>开始恢复</button>
      </div>
    </>}
    {error && <p id={errorId} className="wb-warning" role="alert">{errorText(error)}</p>}
    {showStatus && <RestoreExecutionStatus status={status}/>}
  </div>;
}
