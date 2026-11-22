import { useLayoutEffect, useRef } from 'react';
import type { Project } from '../shared/model.js';
import { Picker } from './ui.js';
import { t } from './i18n.js';
import { toggleSkillScope } from '../shared/skills.js';

/** 技能与连接器共用范围互斥、框内标签和按实际宽度折叠。 */
export function ScopePicker({ projects, values, onChange, disabled, variant = 'i-projects', describedBy }: {
  projects: Project[]; values: readonly string[]; onChange(values: string[]): void; disabled: boolean;
  variant?: string; describedBy?: string;
}) {
  const labels = values.map(id => id === 'global' ? t('全局') : projects.find(project => project.projectId === id)?.title ?? t('项目不可用'));
  return <Picker label={t('选择应用范围：{p0}', { p0: labels.join('、') || t('未选择') })} variant={variant}
    value={values[0] ?? ''} multipleValues={values} disabled={disabled} describedBy={describedBy}
    options={[{ value: 'global', label: t('全局') }, ...projects.map(project => ({
      value: project.projectId, label: project.title, description: project.path, disabled: project.archived || !project.available,
    }))]} onChange={value => onChange(toggleSkillScope(values, value))}
    renderValue={() => <ScopeTags labels={labels}/>}/>;
}
function ScopeTags({ labels }: { labels: string[] }) {
  const root = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const span = root.current; if (!span) return;
    const chips = [...span.querySelectorAll<HTMLElement>('[data-project-chip]')];
    const counter = span.querySelector<HTMLElement>('[data-project-overflow]');
    if (!counter || !chips.length) return;
    const measure = () => {
      chips.forEach(chip => { chip.hidden = false; }); counter.hidden = false;
      const widths = chips.map(chip => chip.getBoundingClientRect().width);
      const gap = parseFloat(getComputedStyle(span).columnGap) || 0;
      const available = span.getBoundingClientRect().width;
      let count = chips.length;
      while (count > 0) {
        counter.textContent = `+${chips.length - count}`;
        const total = widths.slice(0, count).reduce((sum, width) => sum + width, 0) + gap * Math.max(0, count - 1)
          + (count < chips.length ? counter.getBoundingClientRect().width + (count ? gap : 0) : 0);
        if (total <= available) break;
        count--;
      }
      chips.forEach((chip, index) => { chip.hidden = index >= count; });
      counter.hidden = count === chips.length; counter.textContent = `+${chips.length - count}`;
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(span);
    const fonts = document.fonts;
    fonts?.addEventListener('loadingdone', measure);
    return () => { observer.disconnect(); fonts?.removeEventListener('loadingdone', measure); };
  }, [labels.join('\0')]);
  return <span className="theme-select-value" ref={root} title={labels.join('、')}>
    {labels.length ? labels.map((label, index) => <span className="rules-project-tag" data-project-chip key={index}
      aria-hidden="true" title={label}>{label}</span>) : t('选择应用范围')}
    <span className="rules-project-tag" data-project-overflow aria-hidden="true" hidden/>
  </span>;
}
