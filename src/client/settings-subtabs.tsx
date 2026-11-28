/** 设置与扩展配置共用的二级页签控件：role=tablist + roving tabIndex + Home/End/左右键环游。 */
import { nextTabIndex } from './roving.js';

export function SettingsSubtabs<T extends string>({ scope, idPrefix, label, value, options, onChange }: {
  scope: string; idPrefix?: string; label: string; value: T; options: readonly { value: T; label: string; hidden?: boolean }[]; onChange(value: T): void;
}) {
  const prefix = idPrefix ?? `wb-settings-${scope}`;
  const visible = options.filter(option => !option.hidden);
  return <div className="settings-subtabs" role="tablist" aria-label={label}>{options.map(option => <button
    type="button" role="tab" key={option.value} id={`${prefix}-tab-${option.value}`}
    aria-controls={`${prefix}-panel-${option.value}`} aria-selected={value === option.value}
    tabIndex={value === option.value ? 0 : -1} hidden={option.hidden}
    onClick={() => onChange(option.value)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = visible.findIndex(item => item.value === option.value);
      const target = visible[nextTabIndex(e.key, i, visible.length)]!;
      onChange(target.value);
      e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#${prefix}-tab-${target.value}`)?.focus();
    }}>{option.label}</button>)}</div>;
}
