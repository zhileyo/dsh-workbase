/** 官方 pluginManager 的远程结果；失败与传输丢失分开处理。 */
type Answer<T> = { ok: true; value: T } | { ok: false; error: { message: string } };
export interface Bundle {
  name: string; version?: string; updatable?: boolean; update?: 'registry' | 'git';
  installed: boolean; availability: 'profile' | 'installation' | 'missing'; official: boolean;
  source?: string;
}
interface Versions {
  status: 'listed' | 'refused'; installed?: string; registry?: string | null; reason?: string;
  versions?: { version: string; bundle: boolean; prerelease?: boolean; deprecated?: string; incompatible?: unknown }[];
}
interface Change {
  application: string; error?: { diagnostic?: string; code?: string };
  packageResult?: { output?: string };
}
interface UpdateResult { from: string; to: string; step: 'check' | 'remove' | 'install'; result: Change; restore?: Change }
export type UpdateStep = 'checking' | 'removing' | 'installing' | 'restoring';
export interface UpdateProgress { requestId: string; step: UpdateStep }
export interface PluginManagerPort {
  listBundles(): Promise<Answer<Bundle[]>>;
  listVersions(name: string, options: object): Promise<Answer<Versions>>;
  updateBundle(name: string, version: string, options: { registry: string | null; requestId: string }): Promise<Answer<UpdateResult>>;
}
export interface UpdateItem extends Bundle {
  status: 'waiting' | 'checking' | 'available' | 'current' | 'skipped' | 'updating' | 'updated' | 'restart' | 'failed' | 'unknown';
  from?: string; to?: string; registry?: string | null; detail: string; output?: string;
  steps: UpdateStep[]; result?: UpdateResult; requestId?: string;
}
export interface UpdateState {
  phase: 'idle' | 'checking' | 'confirm' | 'updating' | 'done';
  open: boolean;
  items: UpdateItem[]; error: string;
}
/** 只保存浏览器生命周期内的批次数据，不保存旧宿主代理或控制器实例。 */
export interface PluginUpdateSession {
  version: 1;
  state: UpdateState;
  listeners: Set<() => void>;
  automaticStarted: boolean;
  automaticChoice?: boolean;
}
const sessionKey = Symbol.for('dsh-workbase.plugin-update-session.v1');
export function pluginUpdateSession(scope?: object): PluginUpdateSession {
  const record = scope as { [sessionKey]?: PluginUpdateSession } | undefined;
  const previous = record?.[sessionKey];
  if (previous?.version === 1) return previous;
  const session: PluginUpdateSession = {
    version: 1, state: { phase: 'idle', open: false, items: [], error: '' },
    listeners: new Set(), automaticStarted: false,
  };
  if (record) record[sessionKey] = session;
  return session;
}
const failed = (change: Change) => ['failed', 'cancelled'].includes(change.application);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const reason = (change: Change) => change.error?.diagnostic ?? change.error?.code ?? '宿主未能完成操作';
const stepOrder: UpdateStep[] = ['checking', 'removing', 'installing', 'restoring'];
/** 新接口优先；Git 更新需要 commit/spec，不能误走 registry 批量流程。 */
function registryUpdateAvailable(bundle: Bundle) {
  return bundle.update !== undefined ? bundle.update === 'registry' : bundle.updatable === true;
}

/** 组件卸载和页面切换不启动第二个批次；更新始终交给官方服务处理。 */
export class PluginUpdateController {
  private listeners = new Set<() => void>();
  private disposed = false;
  constructor(private readonly host: PluginManagerPort, private readonly requestId: () => string = () => crypto.randomUUID(),
    private readonly session: PluginUpdateSession = pluginUpdateSession()) {}
  private get state() { return this.session.state; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener); this.session.listeners.add(listener);
    return () => { this.listeners.delete(listener); this.session.listeners.delete(listener); };
  };
  private publish(patch: Partial<UpdateState>) {
    // 卸载后只允许在途官方请求收尾；新实例继续读取同一份纯数据状态。
    this.session.state = { ...this.state, ...patch };
    for (const listener of this.session.listeners) listener();
  }
  private item(name: string, patch: Partial<UpdateItem>) {
    this.publish({ items: this.state.items.map(item => item.name === name ? { ...item, ...patch } : item) });
  }
  get busy() { return this.state.phase === 'checking' || this.state.phase === 'updating'; }
  /** 每次客户端启动最多一次；不覆盖已经开始的手动检查或更新。 */
  async autoUpdate(enabled = true) {
    if (this.session.automaticStarted || this.disposed) return;
    this.session.automaticStarted = true;
    if (!enabled || this.state.phase !== 'idle') return;
    await this.check();
    await this.update();
  }
  open() {
    if (this.disposed) return;
    this.publish({ open: true });
    if (this.state.phase === 'idle') void this.check();
  }
  close() { if (!this.disposed) this.publish({ open: false }); }
  dispose() {
    this.disposed = true;
    for (const listener of this.listeners) this.session.listeners.delete(listener);
    this.listeners.clear();
  }
  progress(progress: UpdateProgress) {
    if (this.disposed) return;
    const item = this.state.items.find(item => item.status === 'updating' && item.requestId === progress.requestId);
    if (item && stepOrder.includes(progress.step) && !item.steps.includes(progress.step))
      this.item(item.name, { steps: [...item.steps, progress.step] });
  }
  async check() {
    if (this.busy || this.disposed) return;
    this.publish({ phase: 'checking', items: [], error: '' });
    try {
      const bundles = await this.host.listBundles();
      if (!bundles.ok) throw new Error(bundles.error.message);
      if (this.disposed) return;
      // 官方库存同时包含宿主自带与未安装目录项，批量操作仅面向用户profile安装。
      const installed = bundles.value.filter(bundle => bundle.installed === true
        && bundle.availability === 'profile' && bundle.official === false);
      this.publish({ items: installed.map(bundle => ({ ...bundle, steps: [],
        status: registryUpdateAvailable(bundle) ? 'waiting' : 'skipped',
        detail: registryUpdateAvailable(bundle) ? '等待检查' : bundle.update === 'git'
          ? 'Git 来源请在官方插件页选择提交更新' : '当前安装来源不支持在线更新',
      })) });
      for (const bundle of installed.filter(registryUpdateAvailable)) {
        if (this.disposed) return;
        this.item(bundle.name, { status: 'checking', detail: '正在检查新版本' });
        try {
          const answer = await this.host.listVersions(bundle.name, {});
          if (!answer.ok) throw new Error(answer.error.message);
          const list = answer.value;
          if (list.status !== 'listed') throw new Error(list.reason ?? '无法检查版本');
          const target = list.versions?.find(version => version.bundle && version.incompatible === undefined
            && version.deprecated === undefined && !version.prerelease);
          if (target && (!list.installed || list.registry === undefined)) throw new Error('宿主返回的版本信息不完整');
          this.item(bundle.name, { status: target ? 'available' : 'current', from: list.installed,
            to: target?.version, registry: list.registry, detail: target ? '发现可更新版本' : '已是最新兼容正式版本' });
        } catch (error) { this.item(bundle.name, { status: 'failed', detail: message(error) }); }
      }
      this.publish({ phase: this.state.items.some(item => item.status === 'available') ? 'confirm' : 'done' });
    } catch (error) { this.publish({ phase: 'done', error: message(error) }); }
    finally {
      if (this.disposed && this.state.phase === 'checking') this.publish({
        phase: 'done', error: '工作台已重新加载，未开始的检查已停止。请重新检查。',
        items: this.state.items.map(item => ['waiting', 'checking'].includes(item.status)
          ? { ...item, status: 'unknown', detail: '检查结果未确认，请重新检查。' } : item),
      });
    }
  }
  async update() {
    if (this.state.phase !== 'confirm' || this.disposed) return;
    const targets = this.state.items.filter(item => item.status === 'available');
    // HMR 更新自身可能卸载控制器，其他插件先完成。
    targets.sort((a, b) => Number(a.name === 'dsh-workbase') - Number(b.name === 'dsh-workbase'));
    this.publish({ phase: 'updating' });
    for (const target of targets) {
      if (this.disposed) break;
      const requestId = this.requestId();
      this.item(target.name, { status: 'updating', detail: '正在更新', requestId, steps: [] });
      try {
        const answer = await this.host.updateBundle(target.name, target.to!, { registry: target.registry!, requestId });
        if (!answer.ok) throw new Error(answer.error.message);
        const result = answer.value;
        const steps = new Set(this.state.items.find(item => item.name === target.name)?.steps);
        steps.add('checking');
        if (result.step === 'remove') steps.add('removing');
        if (result.step === 'install') steps.add('installing');
        if (result.restore) steps.add('restoring');
        const unsuccessful = result.step !== 'install' || failed(result.result);
        const restart = result.result.application === 'restart-required';
        const detail = unsuccessful ? result.restore
          ? failed(result.restore) ? `更新失败，恢复旧版本也失败：${reason(result.restore)}`
            : `更新失败，已恢复 ${result.from}：${reason(result.result)}`
          : `更新失败：${reason(result.result)}`
          : restart ? `已更新至 ${result.to}，重启 Harness 后生效` : `已更新至 ${result.to}`;
        this.item(target.name, { status: unsuccessful ? 'failed' : restart ? 'restart' : 'updated',
          detail, result, steps: stepOrder.filter(step => steps.has(step)),
          output: [result.result, result.restore].find(change => change && failed(change) && change.packageResult?.output)?.packageResult?.output });
      } catch (error) {
        this.item(target.name, { status: 'unknown', detail: `更新结果未确认：${message(error)}` });
        this.publish({ error: `连接中断，已停止后续更新。请刷新插件页核对实际版本：${message(error)}` });
        break;
      }
    }
    this.publish({ phase: 'done',
      ...(this.disposed && this.state.items.some(item => item.status === 'available') && !this.state.error
        ? { error: '工作台已重新加载，未开始的更新已停止。请重新检查后继续。' } : {}),
    });
  }
}
