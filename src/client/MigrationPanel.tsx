import { useEffect, useRef, useState } from 'react';
import type { ClientPort } from './api.js';
import type { Project } from '../shared/model.js';
import type { MigrationPreview, MigrationRecord, MigrationRecordView, MigrationCounts } from '../shared/migration.js';
import { MIGRATION_UNAVAILABLE, MIGRATION_SOURCE_MISSING, migrationRecordSchema } from '../shared/migration.js';
import { IconButton, Modal, ModalFlow, Picker, preventImeSubmit, type Notify } from './ui.js';
import { errorText, languageTag, t } from './i18n.js';

export function MigrationCountsView({ counts }: { counts: MigrationCounts }) {
  return <dl className="wb-migration-counts">
    <div><dt>活跃会话</dt><dd>{counts.active}</dd></div>
    <div><dt>归档会话</dt><dd>{counts.archived}</dd></div>
    <div><dt>待处理待办</dt><dd>{counts.pending}</dd></div>
    <div><dt>已完成待办</dt><dd>{counts.done}</dd></div>
  </dl>;
}
export function MigrationComparisonView({ preview }: { preview: MigrationPreview }) {
  const rows = [['active', '活跃会话'], ['archived', '归档会话'], ['pending', '待处理待办'], ['done', '已完成待办']] as const;
  const result = preview.resultCounts ?? (preview.kind === 'directory' ? preview.source.counts : null);
  return <div className="wb-migration-comparison"><table aria-label="迁移内容对照">
    <thead><tr><th scope="col">内容</th><th scope="col">迁出</th><th scope="col">目标现有</th><th scope="col">迁移后</th></tr></thead>
    <tbody>{rows.map(([key, label]) => <tr key={key}><th scope="row">{t(label)}</th>
      {[preview.source.counts[key], preview.kind === 'merge' ? preview.target.counts[key] : 0, result?.[key] ?? null].map((value, index) =>
        <td key={index} className={value === 0 || value === null ? 'wb-migration-zero' : undefined}>{value ?? '—'}</td>)}</tr>)}</tbody>
  </table></div>;
}
export function MigrationPreviewView({ preview, identities = true }: { preview: MigrationPreview; identities?: boolean }) {
  const issues = preview.blockers.filter(message => message !== MIGRATION_UNAVAILABLE);
  const notices = [...(preview.notices ?? []), ...(preview.blockers.includes(MIGRATION_UNAVAILABLE) ? [MIGRATION_UNAVAILABLE] : [])];
  return <div className="wb-migration">
    {identities ? <><p className="dialog-description">{preview.kind === 'merge' ? '迁入已有项目' : '更新原项目目录'}</p>
      <div className="path-preview">{t('源项目：{title}', { title: preview.source.title })}<code>{preview.source.path}</code></div>
      <MigrationCountsView counts={preview.source.counts}/>
      <div className="path-preview">{t('目标项目：{title}', { title: preview.target.title })}<code>{preview.target.path}</code></div>
      {preview.kind === 'merge' && <MigrationCountsView counts={preview.target.counts}/>}</>
      : <><p className="dialog-description">迁移预览</p><MigrationComparisonView preview={preview}/></>}
    <div className="wb-migration-notes"><p className="dialog-description">{preview.kind === 'merge'
      ? '保留目标项目名称、目录及设置；源项目设置与实体来源须随迁移保存。'
      : '保留项目身份、名称、全部会话、待办及设置。'}</p>
    <p className="dialog-description">不移动代码文件，不改写历史会话的原执行目录与日志。成功后 72 小时内可撤销。</p></div>
    {!!notices.length && <div className="wb-migration-notice" role="status">{notices.map(message =>
      <p key={message}>{errorText(message)}{message === MIGRATION_SOURCE_MISSING && <code>{preview.source.path}</code>}</p>)}</div>}
    {!!issues.length && <div className="wb-warning" role="status"><ul>{issues.map(message => <li key={message}>{errorText(message)}</li>)}</ul></div>}
  </div>;
}

export function MigrationSourceStateView({ state }: { state: NonNullable<MigrationRecord['sourceState']> }) {
  return <>
    <p className="dialog-description">{t('迁移前源项目状态')}</p>
    <MigrationCountsView counts={state.counts}/>
    <p className="dialog-description">{[state.available ? t('目录可用') : t('目录不可用'),
      state.archived ? t('项目已归档') : null].filter(Boolean).join(' · ')}</p>
  </>;
}
export function MigrationRecordEntitiesView({ record }: { record: MigrationRecord }) {
  const sessions = record.entities.filter(item => item.kind === 'session');
  const todos = record.entities.filter(item => item.kind === 'todo');
  const status = (item: MigrationRecord['entities'][number]) => {
    if (item.kind === 'todo') return item.done === undefined ? '—' : item.done ? t('已完成') : t('待处理');
    if (item.running) return t('运行中');
    return item.archived === undefined ? '—' : item.archived ? t('已归档') : t('活跃');
  };
  const section = (label: string, items: MigrationRecord['entities']) => !items.length ? null :
    <>
      <p className="dialog-description">{label}</p>
      <div className="wb-migration-comparison"><table aria-label={label}>
        <thead><tr><th scope="col">{t('内容')}</th><th scope="col">{t('状态')}</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}><th scope="row">{item.title ?? item.id}</th>
          <td>{status(item)}</td></tr>)}</tbody>
      </table></div>
    </>;
  return <>{section(t('迁移的会话'), sessions)}{section(t('迁移的待办'), todos)}</>;
}

export function MigrationPanel({ api, project, projects, revision = 0, records = false, notify, onClose, onMigrated }: {
  api: ClientPort; project: Project; projects: Project[]; revision?: number; records?: boolean; notify?: Notify; onClose(): void;
  onMigrated?(targetProjectId: string, reverted?: boolean): Promise<void>;
}) {
  const [targetId, setTargetId] = useState('');
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [items, setItems] = useState<MigrationRecordView[]>([]);
  const [selected, setSelected] = useState<MigrationRecordView | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [loading, setLoading] = useState(records), [reload, setReload] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false), [finished, setFinished] = useState(false);
  const request = useRef<AbortController | null>(null);
  const token = useRef<string | null>(null);
  const pending = useRef(false);
  const release = (value: string | null) => { if (value) void api.call({ op: 'migration-discard', token: value }).catch(() => {}); };
  useEffect(() => () => {
    request.current?.abort();
    release(token.current); token.current = null;
  }, [api]);
  useEffect(() => {
    if (!records) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void api.call({ op: 'migration-records', projectId: project.projectId }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setItems(value as MigrationRecordView[]); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '迁移记录读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, project.projectId, records, reload]);
  const discard = () => {
    const previous = token.current;
    token.current = null; setPreview(null);
    release(previous);
  };
  useEffect(() => {
    discard(); setError('');
    if (records || !targetId || finished) { setPreviewLoading(false); return; }
    const controller = new AbortController(); request.current = controller;
    setPreviewLoading(true);
    void api.call({ op: 'migration-preview-project', projectId: project.projectId, targetProjectId: targetId }, controller.signal)
      .then(value => {
        const result = value as MigrationPreview;
        if (controller.signal.aborted) { release(result.token); return; }
        if (result.source.projectId !== project.projectId || result.target.projectId !== targetId) {
          release(result.token); throw new Error('迁移预览的项目关联不一致，请重新选择');
        }
        token.current = result.token; setPreview(result);
      })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '迁移预览失败'); })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [api, project.projectId, targetId, revision, records, reload]);
  const choices = projects.filter(p => p.projectId !== project.projectId);
  const target = choices.find(p => p.projectId === targetId);
  const canConfirm = !records && !busy && !finished && !previewLoading && !!target && target.available && !target.archived
    && !!preview && preview.target.projectId === targetId && preview.source.projectId === project.projectId
    && preview.revision === revision && preview.executable && !preview.blockers.length && preview.expiresAt > Date.now();
  const confirm = async () => {
    if (pending.current || !canConfirm || !preview) return;
    pending.current = true; setBusy(true); setFinished(true); setError('');
    let completed = false;
    try {
      const value = await api.call({ op: 'migration-confirm', token: preview.token });
      const result = migrationRecordSchema.safeParse(value);
      if (!result.success || result.data.status !== 'completed'
        || result.data.source.projectId !== project.projectId || result.data.target.projectId !== targetId)
        throw new Error('迁移结果尚未确认，请查看迁移记录后再操作');
      completed = true; setFinished(true); discard();
      await onMigrated?.(targetId);
      onClose();
    } catch (error) {
      const message = completed ? '迁移已完成，刷新失败，请重新打开工作台' : error instanceof Error ? error.message : '迁移失败，请重试';
      if (notify) notify(errorText(message), 'info'); else setError(message);
    } finally { setBusy(false); pending.current = false; }
  };
  const undo = async () => {
    if (pending.current || finished || !selected?.canUndo || selected.status !== 'completed') return;
    pending.current = true; setBusy(true); setFinished(true); setError('');
    let completed = false;
    try {
      const value = await api.call({ op: 'migration-undo', id: selected.id });
      const result = migrationRecordSchema.safeParse(value);
      if (!result.success || result.data.status !== 'reverted' || result.data.id !== selected.id
        || result.data.source.projectId !== selected.source.projectId || result.data.target.projectId !== selected.target.projectId)
        throw new Error('撤销结果尚未确认，请查看迁移记录后再操作');
      completed = true;
      await onMigrated?.(selected.source.projectId!, true);
      onClose();
    } catch (error) {
      const message = completed ? '迁移已撤销，刷新失败，请重新打开工作台' : error instanceof Error ? error.message : '撤销失败，请重试';
      if (notify) notify(errorText(message), 'info'); else setError(message);
    } finally { setBusy(false); pending.current = false; }
  };
  const main = <Modal drawer title={records ? '迁移记录' : '项目迁移'} busy={busy} onClose={onClose}>
    <form className="wb-migration-page" onKeyDown={preventImeSubmit} onSubmit={event => { event.preventDefault(); void confirm(); }}>
      <div className="wb-migration-body wb-migration">
      {records ? <>
        {loading && <p role="status">正在读取迁移记录…</p>}
        {!loading && !error && !items.length && <p className="dialog-description">暂无迁移记录。预览不会生成记录。</p>}
        {items.map(item => <button type="button" className="stats-item" key={item.id} onClick={() => setSelected(item)}>
          <span className="stats-item-copy"><strong>{item.source.title} → {item.target.title}</strong>
            <small>{new Date(item.completedAt).toLocaleString(languageTag())} · {item.status === 'reverted' ? '已撤销' : item.expired ? '已到期' : '已完成'}</small></span>
        </button>)}
        {error && <><p className="wb-warning" role="alert">{errorText(error)}</p><button type="button" onClick={() => setReload(value => value + 1)}>重试</button></>}
      </> : <>
        <div className="wb-migration-content">
        <div className="wb-migration-projects">
        <div className="wb-migration-target"><span className="field">当前项目</span>
          <div className="wb-migration-current theme-select-trigger" title={project.title}>{project.title}</div></div>
        <div className="wb-migration-target"><span className="field">迁移到项目</span>
          <Picker label="迁移到项目" value={targetId} disabled={busy || finished || !choices.some(p => p.available && !p.archived)}
            renderValue={selected => selected?.label ?? t('选择目标项目')}
            options={choices.map(p => ({ value: p.projectId, label: p.title, disabled: p.archived || !p.available,
              description: p.archived ? t('项目已归档') : !p.available ? t('项目目录不可用')
                : choices.filter(peer => peer.title === p.title).length > 1 ? p.path : undefined }))}
            onChange={value => { if (!busy && !finished) { discard(); setError(''); setTargetId(value); } }}/>
        </div></div>
        <section aria-label="迁移预览" aria-busy={previewLoading}>
          {!targetId && <p className="dialog-description">{choices.some(p => p.available && !p.archived)
            ? '选择目标项目后显示迁移预览。' : '暂无可迁入的项目。'}</p>}
          {previewLoading && <p className="dialog-description" role="status">正在检查迁移内容…</p>}
          {preview && preview.target.projectId === targetId && <MigrationPreviewView preview={preview} identities={false}/>}
        </section>
        {error && <p className="wb-warning" role="alert">{errorText(error)}</p>}
        {error && !busy && !finished && <button type="button" onClick={() => setReload(value => value + 1)}>重试</button>}
        </div>
      </>}
      </div>
      <footer className="dialog-footer">{records ? <button type="button" onClick={onClose}>关闭</button>
        : <><button type="button" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="wb-primary" disabled={!canConfirm}>确认迁移</button></>}</footer>
    </form>
  </Modal>;
  const detail = selected ? <Modal drawer title="迁移记录 · 详情" busy={busy} onClose={onClose}
    leading={<IconButton name="back" label="返回记录" disabled={busy} onClick={() => setSelected(null)}/>}>
    <div className="wb-migration-page"><div className="wb-migration-body wb-migration">
      <div className="path-preview">{t('源项目：{title}', { title: selected.source.title })}<code>{selected.source.path}</code></div>
      <div className="path-preview">{t('目标项目：{title}', { title: selected.target.title })}<code>{selected.target.path}</code></div>
      <p className="dialog-description">{t('完成时间：{time}', { time: new Date(selected.completedAt).toLocaleString(languageTag()) })}</p>
      <p className="dialog-description">{t('撤销截止：{time}', { time: new Date(selected.undoUntil).toLocaleString(languageTag()) })}</p>
      <p className="dialog-description">{selected.status === 'reverted' ? '已撤销' : selected.expired ? '已到期，仅可查看'
        : selected.canUndo ? '本批迁入内容及后续编辑回到源项目；目标原有和新增内容保留，已删除内容不恢复。' : errorText(MIGRATION_UNAVAILABLE)}</p>
      {selected.sourceState && <MigrationSourceStateView state={selected.sourceState}/>}
      <MigrationRecordEntitiesView record={selected}/>
      {error && <p className="wb-warning" role="alert">{errorText(error)}</p>}
      </div><footer className="dialog-footer"><button type="button" disabled={busy} onClick={() => { setSelected(null); setFinished(false); setError(''); setReload(value => value + 1); }}>返回记录</button>
        <button type="button" disabled={busy || finished || !selected.canUndo || selected.status !== 'completed'} onClick={() => void undo()}>撤销迁移</button></footer>
    </div>
  </Modal> : null;
  return <ModalFlow main={main} detail={detail}/>;
}
