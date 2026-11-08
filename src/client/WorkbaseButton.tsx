import { Icon } from './ui.js';

export function WorkbaseButton({ open }: { open(): void }) {
  return <button type="button" className="wb-return" aria-label="返回工作台" title="返回工作台" onClick={open}>
    <Icon name="grid" size={16}/><span>Workbase</span>
  </button>;
}
