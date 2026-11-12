import { useId, useRef, useState } from 'react';
import { Icon } from './ui.js';

/** 复用宿主原生目录选择，不用浏览器上传接口伪造绝对路径。 */
export function DirectoryInput({ label, value, onChange, pickDirectory, disabled = false, required = false, autoFocus = false, placeholder = '输入文件夹的绝对路径', onPickingChange, describedBy }: {
  label: string; value: string; onChange(value: string): void;
  pickDirectory(): Promise<string | null>; disabled?: boolean; required?: boolean; autoFocus?: boolean;
  placeholder?: string; onPickingChange?(picking: boolean): void;
  describedBy?: string;
}) {
  const id = useId();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const choose = async () => {
    if (disabled || pending.current) return;
    pending.current = true; setPicking(true); setError(''); onPickingChange?.(true);
    try {
      const directory = await pickDirectory();
      if (directory) onChange(directory);
    } catch (error) {
      setError(error instanceof Error ? error.message : '目录选择失败，请重试或输入绝对路径');
    } finally {
      pending.current = false; setPicking(false); onPickingChange?.(false);
    }
  };
  return <div className="directory-field">
    <label className="field" htmlFor={id}>{label}</label>
    <div className="directory-picker" aria-busy={picking}>
      <input id={id} autoFocus={autoFocus} required={required} value={value} disabled={disabled || picking}
        maxLength={4096} placeholder={placeholder}
        title="输入或粘贴路径；点击右侧图标或按 Alt + ↓ 选择"
        aria-describedby={[describedBy, error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
        onChange={e => { setError(''); onChange(e.target.value); }}
        onKeyDown={e => { if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); void choose(); } }}/>
      <button type="button" className="flat" title={`选择${label}`} aria-label={`选择${label}`}
        disabled={disabled || picking} onClick={() => void choose()}><Icon name="folder"/></button>
    </div>
    {error && <p id={`${id}-error`} role="alert" className="wb-warning">{error}</p>}
  </div>;
}
