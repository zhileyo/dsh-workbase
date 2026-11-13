import { open, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { contractFingerprints, inspectPluginUpdateContract, changedContracts } from './check-host-contracts.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const args = process.argv.slice(2);
const options = { app: '/Applications/DeepSeek Harness.app',
  profile: path.join(homedir(), '.dsh/profiles/desktop'), online: false, accept: false };
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === '--app' || key === '--profile') {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${key} 缺少路径`);
    options[key.slice(2)] = path.resolve(args[++i]);
  } else if (key === '--online') options.online = true;
  else if (key === '--accept-baseline') options.accept = true;
  else if (key === '--help') {
    console.log('node check-host.mjs [--app 应用路径] [--profile profile路径] [--online] [--accept-baseline]');
    process.exit(0);
  } else throw new Error(`未知参数：${key}`);
}
const output = path.join(root, 'docs/ui/verification/host');
// 对照的是实际宿主包；不执行包内代码，不读取 profile 配置或认证数据。
async function archive(filename) {
  const file = await open(filename, 'r');
  try {
    const prefix = Buffer.alloc(16);
    const read = async (buffer, offset) => {
      let done = 0;
      while (done < buffer.length) {
        const result = await file.read(buffer, done, buffer.length - done, offset + done);
        if (!result.bytesRead) throw new Error('应用包意外截断');
        done += result.bytesRead;
      }
      return buffer;
    };
    await read(prefix, 0);
    const size = prefix.readUInt32LE(12);
    if (size < 2 || size > 64 * 1024 * 1024) throw new Error('应用包索引大小异常');
    const index = JSON.parse((await read(Buffer.alloc(size), 16)).toString());
    const entries = new Map();
    const walk = (node, parent = '') => {
      for (const [name, entry] of Object.entries(node.files ?? {})) {
        const key = parent ? `${parent}/${name}` : name;
        if (entry.files) walk(entry, key);
        else entries.set(key, entry);
      }
    };
    walk(index);
    return { entries, close: () => file.close(), async text(name) {
      const entry = entries.get(name);
      if (!entry || entry.link) throw new Error(`应用包缺少文件：${name}`);
      if (entry.unpacked) return readFile(path.join(`${filename}.unpacked`, name), 'utf8');
      if (!Number.isSafeInteger(entry.size) || entry.size > 32 * 1024 * 1024)
        throw new Error(`应用包文件大小异常：${name}`);
      return (await read(Buffer.alloc(entry.size), 8 + prefix.readUInt32LE(4) + Number(entry.offset))).toString();
    } };
  } catch (error) { await file.close(); throw error; }
}
const specs = [
  ['workspace', ['enqueueOperation', 'requireTable', 'requireState', 'setState', 'archiveSession', 'unarchiveSession']],
  ['api-session-controller', ['create', 'rename', 'fork', 'prompt']],
  ['plugin-manager', ['listBundles', 'listVersions', 'updateBundle']],
  ['client-ui-plugin-manager', []],
  ['working-directory', ['get', 'set']],
  ['session', ['get', 'list', 'flush', 'liveEntryFor', 'detachEntered']],
  ['session-persistence-jsonl', ['list', 'stat', 'locate', 'open', 'flush']],
  ['session-projection', ['restore']],
  ['session-projection-cache', ['put', 'cachedSnapshot', 'requireTable']],
  ['session-query', []],
  ['agent', ['get', 'turnBoundaryOf']],
  ['storage-domain', []],
  ['api-remotes', []],
  ['client-connection', []],
  ['client-ui-conversation', []],
  ['client-ui-model-selection', []],
  ['client-ui-session', []],
  ['client-ui-renderer', []],
  ['client-ui-workspace', []],
  ['experimental-worktree', ['create'], true],
  ['experimental-client-ui-forge', ['requestWorktree', 'branches'], true],
];
const report = { scannedAt: new Date().toISOString(), errors: [], review: [],
  limitations: [
    '静态存在性与指纹检查，不证明参数、返回值、权限、事件及真实运行结果兼容。',
    '未执行界面验收、用户会话删除、恢复、安装或重启。',
    '客户端 slots 随 renderer 合并打包；只能比较渲染器指纹，插槽注册行为需源码复核。',
    '新增同名维护方法仅为线索，确认公开契约前不自动调用。',
  ], modules: [], installation: [] };
try {
  const app = await archive(path.join(options.app, 'Contents/Resources/app.asar'));
  try {
    const desktop = JSON.parse(await app.text('package.json'));
    report.host = { version: desktop.version, commit: desktop.dshBuildCommit ?? null,
      channel: desktop.dshDesktopUpdateChannel ?? null };
    report.sdk = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).dsh.compatibility.dsh;
    const runtime = path.join(options.app, 'Contents/Resources/runtime');
    const versions = JSON.parse(await readFile(path.join(runtime, 'versions.json'), 'utf8'));
    report.runtime = { node: versions.node, pnpm: versions.pnpm, source: 'runtime/versions.json' };
    for (const [short, required, optional] of specs) {
      const name = `@deepseek-ai/dsh-${short}`;
      const prefix = `dsh/node_modules/${name}/`;
      const files = [...app.entries.keys()].filter(key =>
        key.startsWith(`${prefix}lib/`) && /\.(?:js|css|d\.ts)$/.test(key)).sort();
      const methods = new Map(), contents = [];
      const contractFiles = [...app.entries.keys()].filter(key => key.startsWith(prefix)
        && (key.endsWith('.d.ts') || (key.startsWith(`${prefix}src/`) && key.endsWith('.ts')))).sort();
      const contracts = await Promise.all(contractFiles.map(async file =>
        ({ file: file.slice(prefix.length), text: await app.text(file) })));
      for (const filename of files) {
        const text = await app.text(filename);
        contents.push(`${filename.slice(prefix.length)}\0${text}`);
        if (!filename.endsWith('.js')) continue;
        const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const visit = node => {
          if (ts.isMethodDeclaration(node)) {
            const method = node.name.getText(source);
            const owner = node.parent.name?.getText(source) ?? '(匿名类)';
            const key = `${owner}.${method}`;
            methods.set(key, hash(node.getText(source)));
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
      const missing = required.filter(method => ![...methods.keys()].some(key => key.endsWith(`.${method}`)));
      const module = { name, optional: !!optional, available: files.length > 0,
        fingerprint: files.length ? hash(contents.join('\0')) : null,
        methods: Object.fromEntries([...methods].sort()), missing,
        contracts: contractFingerprints(contracts) };
      report.modules.push(module);
      if (short === 'plugin-manager') {
        const hostText = contracts.map(file => file.text).join('\n');
        report.pluginUpdateContract = inspectPluginUpdateContract(hostText,
          await readFile(path.join(root, 'src/client/plugin-update.ts'), 'utf8'));
        report.errors.push(...report.pluginUpdateContract.errors);
      }
      if (short === 'client-ui-model-selection'
          && contents.some(text => /position-anchor/.test(text))) {
        const composer = await readFile(path.join(root, 'src/client/NativeComposer.tsx'), 'utf8');
        if (composer.includes("set('top'") && !composer.includes("set('bottom'"))
          report.limitations.push('检测到官方 CSS 锚点与工作台 top 覆盖并存，模型菜单需适配和视觉验收。');
      }
      if ((!files.length || missing.length) && !optional)
        report.errors.push(`${name} 缺少文件或方法：${missing.join('、') || 'lib'}`);
    }
    report.candidates = [];
    // 扫描所有官方服务，候选仍需人阅读公开 API 和完整实现。
    for (const filename of app.entries.keys()) {
      if (!/^dsh\/node_modules\/@deepseek-ai\/[^/]+\/lib\/.*\.js$/.test(filename)) continue;
      // Electron 内置 Chromium 开发工具含浏览器会话和编辑器同名方法，与 DSH 服务无关。
      if (filename.includes('/lib/devtools/')) continue;
      const text = await app.text(filename);
      if (!/\b(?:deleteSession|removeSession|rebuildCache|backup|snapshot|createWorktree)\b/i.test(text)) continue;
      const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const visit = node => {
        if (ts.isMethodDeclaration(node) && /^(?:deleteSession|removeSession|rebuildCache|backup|createWorktree)$/i.test(node.name.getText(source)))
          report.candidates.push({ module: filename.split('/')[3], file: filename,
            owner: node.parent.name?.getText(source) ?? '(匿名类)', method: node.name.getText(source),
            fingerprint: hash(node.getText(source)) });
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  } finally { await app.close(); }
  for (const filename of ['dist/index.js', 'lib/client.js', 'package.json', 'cordis.patch.yml']) {
    try {
      const source = hash(await readFile(path.join(root, filename)));
      const installed = hash(await readFile(path.join(options.profile, 'node_modules/dsh-workbase', filename)));
      report.installation.push({ file: filename, source, installed, match: source === installed });
      if (source !== installed) report.errors.push(`已安装插件与工作区不一致：${filename}`);
    } catch (error) { report.errors.push(`无法核对安装文件 ${filename}：${error.message}`); }
  }
  const current = { host: report.host, runtime: report.runtime, sdk: report.sdk,
    modules: report.modules, candidates: report.candidates };
  let baseline;
  try { baseline = JSON.parse(await readFile(path.join(output, 'baseline.json'), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    report.review.push('没有已接受基线；需要首次源码评估。');
  }
  if (baseline) {
    if (JSON.stringify(baseline.host) !== JSON.stringify(current.host)) report.review.push('宿主版本或构建提交已变化。');
    if (JSON.stringify(baseline.runtime) !== JSON.stringify(current.runtime)) report.review.push('运行时版本已变化。');
    if (baseline.sdk !== current.sdk) report.review.push('工作台 SDK 声明已变化。');
    for (const module of report.modules) {
      const old = baseline.modules?.find(item => item.name === module.name);
      const declarations = changedContracts(old?.contracts, module.contracts);
      if (declarations.length)
        report.review.push(`${module.name} 类型契约待复核：${declarations.join('、')}`);
      if (old?.fingerprint !== module.fingerprint) {
        const changed = Object.keys(module.methods).filter(key => old?.methods?.[key] !== module.methods[key]);
        const removed = Object.keys(old?.methods ?? {}).filter(key => !(key in module.methods));
        report.review.push(`${module.name} 文件指纹变化；变化方法：${changed.join('、') || '无'}；移除：${removed.join('、') || '无'}`);
      }
    }
    if (JSON.stringify(baseline.candidates) !== JSON.stringify(current.candidates))
      report.review.push('官方维护能力候选发生变化，需要确认是否可替代自实现。');
  }
  if (options.online) {
    try {
      report.release = JSON.parse(execFileSync('gh', ['release', 'view', `dsh-v${report.host.version}`,
        '--repo', 'deepseek-ai/deepseek-harness', '--json', 'tagName,url,body,publishedAt'],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
    } catch { report.review.push('官方发行说明查询未完成；请核对 gh 登录及版本标签。'); }
  }
  await mkdir(output, { recursive: true });
  if (options.accept && !report.errors.length) {
    await writeFile(path.join(output, 'baseline.json'),
      `${JSON.stringify({ ...current, acceptedAt: report.scannedAt, limitations: report.limitations }, null, 2)}\n`);
    report.baselineAccepted = true;
  }
} catch (error) { report.errors.push(error.message); }
report.exitCode = report.errors.length ? 1 : report.review.length ? 2 : 0;
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const list = values => values.map(value => `- ${value}`).join('\n') || '- 无';
await writeFile(path.join(output, 'report.md'), `# 宿主兼容检查\n\n扫描时间：${report.scannedAt}\n\n`
  + `宿主：${report.host?.version ?? '未知'}；构建：${report.host?.commit ?? '未知'}；SDK：${report.sdk ?? '未知'}。\n\n`
  + `退出码：${report.exitCode}。${report.baselineAccepted ? '已显式保存当前基线；本次发现仍列在下方。' : ''}\n\n`
  + `## 阻断项\n\n${list(report.errors)}\n\n## 待复核变化\n\n${list(report.review)}\n\n`
  + `## 服务静态检查\n\n| 模块 | 文件 | 缺少方法 |\n| --- | --- | --- |\n`
  + report.modules.map(m => `| ${m.name} | ${m.available ? '存在' : m.optional ? '可选，缺失' : '缺失'} | ${m.missing.join('、') || '无'} |`).join('\n')
  + `\n\n## 插件更新返回契约\n\n${report.pluginUpdateContract
    ? `宿主更新字段：${report.pluginUpdateContract.gateField ?? '未识别'}。\n\n${list(report.pluginUpdateContract.errors.length
      ? report.pluginUpdateContract.errors : ['BundleInfo 字段及工作台更新门禁静态匹配；不代表真实在线更新已验收。'])}`
    : '未完成，见阻断项。'}`
  + `\n\n## 新能力候选（未确认公开契约）\n\n${list((report.candidates ?? []).map(c => `${c.module}：${c.method}`))}`
  + `\n\n## 验证边界\n\n${list(report.limitations)}\n\n`
  + (report.release ? `## 官方发行说明\n\n来源：${report.release.url}\n\n${report.release.body}\n` : ''));
console.log(`报告：${path.join(output, 'report.md')}\n阻断 ${report.errors.length} 项，待复核 ${report.review.length} 项；退出码 ${report.exitCode}`);
process.exitCode = report.exitCode;
