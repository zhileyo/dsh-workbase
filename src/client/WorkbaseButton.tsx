import { Icon } from './ui.js';
import { useWorkbaseLocale } from './i18n.js';

export function WorkbaseButton({ open }: { open(): void }) {
  useWorkbaseLocale();
  return <button type="button" className="wb-return" aria-label="返回工作台" title="返回工作台" onClick={open}>
    <Icon name="grid" size={16}/>
  </button>;
}
