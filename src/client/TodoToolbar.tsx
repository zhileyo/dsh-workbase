import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { priorityLabels, type Priority } from '../shared/todo.js';
import { Icon, IconButton, Picker } from './ui.js';

export interface TodoToolbarProps {
  draft: string; query: string; priority: Priority | 'all'; busy: boolean; archived: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onDraftChange(value: string): void;
  onQueryChange(value: string): void;
  onPriorityChange(value: Priority | 'all'): void;
  onCreate(title: string): Promise<boolean>;
  onFullCreate?(): void;
}

/** 添加草稿与查询分开保存，模式切换只改变展示值。 */
export function TodoToolbar(props: TodoToolbarProps) {
  const [search, setSearch] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  const nextMode = useRef(false);
  const switching = useRef(false);
  const creating = useRef(false);
  const focusAfterChange = useRef(false);
  const mounted = useRef(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const applyMode = (value: boolean) => {
    setSearch(value);
    if (!value) {
      latest.current.onQueryChange('');
      latest.current.onPriorityChange('all');
    }
  };
  useLayoutEffect(() => {
    if (phase === 'idle') {
      if (focusAfterChange.current && !props.busy && !submitting) {
        focusAfterChange.current = false;
        props.inputRef.current?.focus();
      }
      return;
    }
    const timer = setTimeout(() => {
      if (phase === 'out') { applyMode(nextMode.current); setPhase('in'); }
      else { switching.current = false; setPhase('idle'); }
    }, phase === 'out' ? 130 : 170);
    return () => clearTimeout(timer);
  }, [phase, search, submitting, props.busy]);
  const switchMode = () => {
    if (props.busy || creating.current || switching.current) return;
    focusAfterChange.current = true;
    nextMode.current = !search;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyMode(!search);
    } else {
      switching.current = true;
      searchButton.current?.focus();
      setPhase('out');
    }
  };
  const blocked = props.busy || submitting || phase !== 'idle';
  return <div className="todo-create-row todo-shared-toolbar" data-mode={search ? 'search' : 'create'}>
    <form className="todo-toolbar-face" data-phase={phase} style={{ '--todo-flip-direction': nextMode.current ? 1 : -1 } as CSSProperties}
      aria-busy={phase !== 'idle' || submitting} onSubmit={async e => {
        e.preventDefault();
        if (search || blocked || switching.current || creating.current || props.archived || !props.draft.trim()) return;
        creating.current = true; setSubmitting(true);
        try {
          if (await props.onCreate(props.draft)) {
            if (mounted.current) { latest.current.onDraftChange(''); focusAfterChange.current = true; }
          }
        } finally {
          creating.current = false;
          if (mounted.current) { setSubmitting(false); }
        }
      }}>
      <div className="wb-todo-input todo-input">
        {search && <span className="todo-search-leading"><Icon name="search" size={14}/></span>}
        <input id="todo-title" ref={props.inputRef} aria-label={search ? '搜索标题或备注' : '新建待办'}
          placeholder={search ? '搜索标题或备注…' : props.archived ? '项目已归档，恢复后可记录待办' : '记下一步，按 Enter 添加…'}
          maxLength={500} value={search ? props.query : props.draft}
          disabled={blocked || (!search && props.archived)}
          onChange={e => search ? props.onQueryChange(e.target.value) : props.onDraftChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (search || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault();
            if (e.key === 'Escape' && search && !e.nativeEvent.isComposing) { e.preventDefault(); switchMode(); }
          }}/>
        {search
          ? <IconButton name="close" label="清空搜索" disabled={blocked || !props.query} onClick={() => { props.onQueryChange(''); props.inputRef.current?.focus(); }}/>
          : <IconButton name="plus" label="添加待办" type="submit" disabled={blocked || props.archived || !props.draft.trim()}/>}
      </div>
      <div className="todo-action-slot">
        <button type="button" className="todo-full-create" aria-hidden={search} tabIndex={search ? -1 : undefined}
          disabled={blocked || search || props.archived || !props.onFullCreate} onClick={props.onFullCreate}><Icon name="plus"/>完整新建</button>
        {search && <Picker variant="todo-filter" label="筛选优先级" title="筛选优先级"
          disabled={blocked} value={props.priority ?? ''} onChange={value => props.onPriorityChange((value || null) as Priority | 'all')}
          renderValue={() => props.priority === 'all' ? '全部' : props.priority ? priorityLabels[props.priority] : '未设置'}
          options={[{ value: 'all', label: '全部' }, { value: '', label: '未设置' },
            ...Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))]}/>}
      </div>
    </form>
    <button type="button" ref={searchButton} className="wb-icon flat todo-search-toggle" disabled={props.busy || submitting}
      title={search ? '再次点击返回添加（Esc）' : '搜索待办'} aria-label={search ? '返回添加待办，清除筛选（Esc）' : '搜索待办'}
      aria-pressed={search} aria-controls="todo-title" onClick={switchMode}><Icon name="search"/></button>
  </div>;
}
