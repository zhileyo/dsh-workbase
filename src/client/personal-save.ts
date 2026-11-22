import type { Command } from '../shared/commands.js';
import { personalDocumentSchema, type PersonalCatalog, type PersonalDocument, type PersonalFile } from '../shared/personalization.js';

/** 菜单共享草稿，逐文件提交；部分成功只推进对应文件的版本。 */
export class PersonalSave {
  catalog?: PersonalCatalog;
  drafts = new Map<PersonalFile, string>();
  error = '';
  busy = false;
  private pending?: Promise<boolean>;
  constructor(private readonly send: (command: Command) => Promise<unknown>, private readonly changed: () => void) {}
  get dirty() { return this.catalog?.documents.some(doc => this.drafts.get(doc.file) !== doc.content) ?? false; }
  update(file: PersonalFile, content: string) { this.drafts.set(file, content); this.changed(); }
  load(): Promise<boolean> {
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async read() {
    this.busy = true; this.error = ''; this.changed();
    try {
      const catalog = await this.send({ op: 'personal-list' }) as PersonalCatalog;
      const documents = catalog.documents.map(doc => personalDocumentSchema.parse(doc));
      const modified = new Set(this.catalog?.documents.filter(doc => this.drafts.get(doc.file) !== doc.content).map(doc => doc.file));
      this.catalog = { ...catalog, documents };
      for (const doc of documents) if (!modified.has(doc.file)) this.drafts.set(doc.file, doc.content);
      return true;
    } catch (error) { this.error = error instanceof Error ? error.message : '档案读取失败'; return false; }
    finally { this.busy = false; this.changed(); }
  }
  flush(): Promise<boolean> {
    if (this.pending) return this.pending.then(ok => ok ? this.flush() : false);
    if (!this.dirty) return Promise.resolve(true);
    this.pending = this.write().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async write() {
    this.busy = true; this.error = ''; this.changed();
    try {
      for (const doc of this.catalog!.documents) {
        const content = this.drafts.get(doc.file)!;
        if (content === doc.content) continue;
        const result = personalDocumentSchema.parse(await this.send({ op: 'personal-save', file: doc.file, content, version: doc.version }));
        Object.assign(doc, result as PersonalDocument);
        this.changed();
      }
      return true;
    } catch (error) { this.error = error instanceof Error ? error.message : '档案保存失败'; return false; }
    finally { this.busy = false; this.changed(); }
  }
}
