import { useEffect, useId, useRef, useState } from 'react';
import type { LaunchCatalog, Project, Todo } from '../shared/model.js';
import { MAX_TODO_ATTACHMENT_BYTES, MAX_TODO_ATTACHMENTS, todoAttachments, priorityLabels, type Priority, type TodoImage, type TodoAttachment } from '../shared/todo.js';
import type { ClientPort } from './api.js';
import { dateText, Icon, IconButton, Menu, Modal, Picker, preventImeSubmit } from './ui.js';
import { errorText, presetText, t } from './i18n.js';

export function TodoDetail({ api, project, initial, refresh, onClose, closeOnSave = false }: {
  api: ClientPort; project: Project; initial?: Todo; refresh(): Promise<void>; onClose(): void; closeOnSave?: boolean;
}) {
  const [todo, setTodo] = useState(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? null);
  const [preview, setPreview] = useState(!!initial);
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [preset, setPreset] = useState('standard');
  const [presets, setPresets] = useState<LaunchCatalog['presets']>([{ id: 'standard', get name() { return t('标准模式'); }, builtIn: true, isDefault: true }]);
  const lock = useRef(false);
  const [deleted, setDeleted] = useState(false);
  const latest = todo && project.todos.find(t => t.id === todo.id);
  const conflict = !!todo && (!!latest && latest.version > todo.version || deleted);
  const id = useId();
  const describedBy = [error ? `${id}-error` : '', conflict ? `${id}-conflict` : ''].filter(Boolean).join(' ') || undefined;
  useEffect(() => {
    if (initial && !project.todos.some(t => t.id === initial.id)) setDeleted(true);
  }, [initial?.id, project.todos]);
  useEffect(() => {
    const controller = new AbortController();
    api.call({ op: 'launch-catalog' }, controller.signal).then(value => {
      const items = (value as LaunchCatalog).presets;
      if (controller.signal.aborted || !items.length) return;
      setPresets(items); setPreset(current => items.some(p => p.id === current) ? current : items[0]!.id);
    }).catch(() => {});
    return () => controller.abort();
  }, [api]);
  const selectedPreset = presets.find(p => p.id === preset);
  const presetName = selectedPreset ? presetText(selectedPreset).name : preset;
  const writable = !project.archived && !deleted;
  const dirty = !todo || title.trim() !== todo.title || note !== todo.note || priority !== todo.priority || pending.length > 0;
  const work = async (run: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await run(); }
    catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
      await refresh().catch(() => {});
    }
    finally { lock.current = false; setBusy(false); }
  };
  const saveFields = async (): Promise<Todo> => {
    if (!writable || conflict) throw new Error('待办或项目已经变化，请刷新后重试；编辑内容仍保留。');
    if (!title.trim()) throw new Error('请填写待办标题');
    const next = await api.call(todo ? { op: 'update', projectId: project.projectId, id: todo.id,
      expectedVersion: todo.version, title, note, priority } : { op: 'create', projectId: project.projectId, title, note, priority }) as Todo;
    setTodo(next);
    return next;
  };
  const uploadFiles = async (files: readonly File[], saved?: Todo): Promise<Todo> => {
    if (!writable || conflict) throw new Error('待办或项目已经变化，请刷新后重试；附件仍保留。');
    setUploading(true);
    let remaining = [...files];
    try {
      // 现有待办只更新附件，不提前保存正文草稿；新建时先建立同一张卡片的身份。
      let next = saved ?? todo ?? await saveFields();
      for (const file of files) {
        if (!api.uploadTodoAttachment) throw new Error('宿主未提供附件上传能力');
        next = await api.uploadTodoAttachment(next, file);
        setTodo(next); remaining = remaining.slice(1); setPending(remaining);
      }
      return next;
    } finally { setUploading(false); await refresh(); }
  };
  const save = async (): Promise<Todo> => {
    const next = await saveFields();
    try { return pending.length ? await uploadFiles(pending, next) : next; }
    finally { await refresh(); }
  };
  const addFiles = (files: readonly File[]) => {
    if (!writable || lock.current) return;
    if (!files.length) return;
    if ((todo ? todoAttachments(todo).length : 0) + pending.length + files.length > MAX_TODO_ATTACHMENTS) {
      setError('每个待办最多10个附件'); return;
    }
    if (files.some(file => file.size > MAX_TODO_ATTACHMENT_BYTES)) {
      setError('每个附件不能超过10MiB'); return;
    }
    const queue = [...pending, ...files];
    setError(''); setPending(queue);
    if (!todo && !title.trim()) {
      setError('请先填写待办标题，结束标题编辑后附件会自动上传。'); return;
    }
    void work(async () => { await uploadFiles(queue); });
  };
  return <Modal title={todo ? '待办详情' : '新建待办'} className="todo-detail-dialog" busy={busy} onClose={onClose}>
    <form className="todo-detail-form" aria-describedby={describedBy} onKeyDown={preventImeSubmit} onSubmit={e => { e.preventDefault(); void work(async () => { await save(); if (closeOnSave) onClose(); else setPreview(true); }); }}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); } }}
      onPaste={e => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) { if (!e.clipboardData.getData('text/plain')) e.preventDefault(); addFiles(files); }
      }}>
      <div className="todo-detail-summary">
        <div className="todo-detail-meta"><span className={`todo-status ${todo?.done ? 'done' : ''}`}><Icon name={todo?.done ? 'check' : 'clock'}/>{todo?.done ? '已完成' : '待处理'}</span>
          <span title={project.title}><Icon name="folder"/>{project.title}</span>
          {todo && <span>{todo.creator === 'agent' ? 'Agent' : '用户'} 创建 · {dateText(todo.createdAt)}</span>}
          {project.archived && <span>项目已归档 · 只读</span>}</div>
      </div>
      <div className="todo-detail-body">
      {error && <p id={`${id}-error`} className="wb-warning" role="alert">{errorText(error)}</p>}
      {conflict && <div id={`${id}-conflict`} className="wb-warning" role="alert">待办已被其他操作修改或删除，编辑内容仍保留。
        {latest && <button type="button" disabled={busy} onClick={() => { setTodo(latest); setDeleted(false); setError(''); }}>使用最新版本继续保存</button>}
      </div>}
      <section className="todo-detail-section">
      <div className="todo-compact-fields">
      <label className="todo-title-field"><span>标题</span><input autoFocus required maxLength={500} value={title} readOnly={!writable} disabled={busy} aria-describedby={describedBy} onChange={e => setTitle(e.target.value)}
        onBlur={() => { if (!todo && pending.length && title.trim()) void work(async () => { await uploadFiles(pending); }); }}/></label>
      <div className="todo-priority-field"><span>优先级</span><Picker variant="todo-priority" label="待办优先级" value={priority ?? ''} disabled={busy || !writable} describedBy={describedBy}
        onChange={value => setPriority((value || null) as Priority)}
        options={[{ value: '', label: <><i className="todo-priority-dot"/>未设置</> },
          ...Object.entries(priorityLabels).map(([value, text]) => ({ value, label: <><i className={`todo-priority-dot ${value}`}/>{t(text)}</> }))]}/></div>
      </div>
      </section>
      <section className="todo-detail-section">
      <div className="todo-note-tabs"><strong>描述</strong><button type="button" disabled={busy} onClick={() => setPreview(!preview)}>{preview ? '编辑' : '预览'}</button></div>
      {preview ? <div className="todo-markdown">{note.trim() ? api.renderMarkdown?.(note) ?? <pre>{note}</pre> : <p className="wb-help">暂无描述</p>}</div>
        : <textarea aria-label="待办描述" aria-describedby={describedBy} value={note} maxLength={10000} rows={8} disabled={busy} readOnly={!writable}
          placeholder="支持 Markdown：背景、实施步骤、验收标准…" onChange={e => setNote(e.target.value)}/>}
      </section>
      <section className="todo-detail-section">
      <div className="todo-attachment-heading"><strong>附件 <span>{(todo ? todoAttachments(todo).length : 0) + pending.length}/{MAX_TODO_ATTACHMENTS}</span></strong><span>单个不超过10MiB</span>
      </div>
      <div className="todo-attachment-grid">
        {todo && todoAttachments(todo).map(attachment => <div className="todo-attachment-card" key={`${attachment.attachmentId}-${'name' in attachment ? attachment.name : ''}`}><TodoAttachmentPreview api={api} todo={todo} attachment={attachment}/>
          {writable && <IconButton name="close" label="移除附件" disabled={busy || conflict} onClick={() => void work(async () => {
            const next = await api.call({ op: 'remove-todo-attachment', projectId: todo.projectId, id: todo.id,
              expectedVersion: todo.version, attachmentId: attachment.attachmentId }) as Todo;
            setTodo(next); await refresh();
          })}/>}</div>)}
        {pending.map((file, i) => <div className="todo-attachment-card" key={`${file.name}-${i}`}><PendingFile file={file}/>
          <span title={file.name}>{file.name}</span><small>{fileSize(file.size)} · {uploading ? '上传中' : todo ? '等待重试' : '待上传'}</small><IconButton name="close" label={`移除附件：${file.name}`} disabled={busy} onClick={() => setPending(files => files.filter((_, index) => index !== i))}/></div>)}
      </div>
      {writable && api.uploadTodoAttachment && <label className="todo-attachment-picker"><Icon name="plus"/><span>添加附件即上传，或拖入 / 粘贴文件</span><input type="file" multiple aria-label="添加待办附件" aria-describedby={describedBy}
        disabled={busy || conflict} onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}/></label>}
      {writable && pending.length > 0 && !busy && title.trim() && <button type="button" disabled={conflict}
        onClick={() => void work(async () => { await uploadFiles(pending); })}>重试上传</button>}
      </section>
      </div>
      <footer><span className="todo-save-state" role="status">{uploading ? `正在上传 ${pending.length} 个附件…` : busy ? '处理中…' : pending.length ? `${pending.length} 个附件待上传` : dirty ? '有未保存修改' : '已保存'}</span>
        {writable && <div className="todo-primary-actions"><div className="todo-session-action">
          <Menu icon="down" className="todo-mode-button" label={`待办会话模式：${presetName}`} disabled={busy}
            heading="会话模式" note="填入会话草稿，由你发送。" items={presets.map(p => ({ label: presetText(p).name, checked: preset === p.id, action: () => setPreset(p.id) }))}/>
          <button className="todo-session-start" type="button" disabled={busy || conflict || pending.length > 0 || !api.openTodoSession || !title.trim()} onClick={() => void work(async () => {
            const next = dirty ? await save() : todo!;
            await api.openTodoSession!(next, preset); onClose();
          })}>发起会话</button>
          </div><button className="wb-primary" type="submit" disabled={busy || conflict || !title.trim()}>{busy ? '处理中…' : '保存'}</button></div>}
      </footer>
    </form>
  </Modal>;
}
function fileSize(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`; }
function PendingFile({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (!file.type.startsWith('image/')) return; const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return url && !failed ? <img src={url} alt={file.name} onError={() => setFailed(true)}/> : <div className="todo-file-preview"><Icon name="file" size={32}/></div>;
}
function TodoAttachmentPreview({ api, todo, attachment }: { api: ClientPort; todo: Todo; attachment: TodoImage | TodoAttachment }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false), [requested, setRequested] = useState(false);
  const name = 'name' in attachment ? attachment.name : '待办图片';
  const image = attachment.mediaType.startsWith('image/');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setError(''); setUrl(''); setFailed(false);
    if (!image && !requested) return;
    if (!api.readTodoAttachment) { setError('宿主未提供附件读取能力'); return; }
    api.readTodoAttachment(todo, attachment, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '附件读取失败'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
}, [api, todo.id, attachment.attachmentId, name, retry, requested, image]);
  return <>{image && url && !failed ? <a href={url} download={name}><img src={url} alt={name} loading="lazy" onError={() => setFailed(true)}/></a>
    : <div className="todo-file-preview"><Icon name="file" size={32}/></div>}
    <span title={name}>{name}</span><small>{fileSize(attachment.bytes)} {error ? <button type="button" title={errorText(error)} onClick={() => setRetry(value => value + 1)}>重试</button>
      : url ? <a href={url} download={name}>下载</a> : <button type="button" disabled={requested || image} onClick={() => setRequested(true)}>{requested || image ? '读取中…' : '下载'}</button>}</small></>;
}
