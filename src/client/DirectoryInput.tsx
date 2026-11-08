import { useId, useRef, useState } from 'react';
import { Icon } from './ui.js';

/** 复用宿主原生目录选择，不用浏览器上传接口伪造绝对路径。 */
export function DirectoryInput({ label, value, onChange, pickDirectory, disabled = false, required = false, autoFocus = false, onPickingChange }: {
  label: string; value: string; onChange(value: string): void;
  pickDirectory(): Promise<string | null>; disabled?: boolean; required?: boolean; autoFocus?: boolean;
  onPickingChange?(picking: boolean): void;
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
        maxLength={4096} placeholder="点击选择本地文件夹，或输入绝对路径"
        title="点击选择本地文件夹；也可用键盘输入，Alt + ↓ 打开选择器"
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => void choose()} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); void choose(); } }}/>
      <button type="button" className="flat" title="选择本地文件夹" aria-label={`选择${label}文件夹`}
        disabled={disabled || picking} onClick={() => void choose()}><Icon name="folder"/></button>
    </div>
    {error && <p id={`${id}-error`} role="alert" className="wb-warning">{error}</p>}
  </div>;
}
