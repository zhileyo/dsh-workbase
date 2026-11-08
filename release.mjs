// 发布链路：改版本号 → 校验 → 构建 → 打包 → 生成 SHA-256 → 同步文档里的版本与哈希。
// 用法：node release.mjs patch|minor|major|<x.y.z> [--dry-run]
// 只做本地出包，不碰 registry；npm publish 仍需手动执行（见 README 的发布一节）。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const pkgPath = new URL('./package.json', import.meta.url);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const exec = (args, { capture = false } = {}) => {
  // shell 模式在 Windows 上才能执行 npm.cmd；命令拼成单串传入，避免 DEP0190（参数拼接不转义）。
  const command = [npm, ...args].join(' ');
  const result = spawnSync(command, {
    cwd: root, encoding: 'utf8', shell: true,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} 失败（退出码 ${result.status}）`);
  return (result.stdout ?? '').trim();
};

const compare = (a, b) => {
  const pa = a.split('-')[0].split('.').map(Number);
  const pb = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};

const bump = (version, kind) => {
  const [major, minor, patch] = version.split('-')[0].split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const request = argv.find(arg => !arg.startsWith('--')) ?? 'patch';
if (!['patch', 'minor', 'major'].includes(request) && !/^\d+\.\d+\.\d+$/.test(request))
  throw new Error(`无法识别的版本参数：${request}（用 patch／minor／major／x.y.z）`);
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
const current = pkg.version;
const target = /^\d+\.\d+\.\d+$/.test(request) ? request : bump(current, request);
const tarball = `dsh-workbase-${target}.tgz`;

if (compare(target, current) <= 0) throw new Error(`新版本 ${target} 必须大于当前版本 ${current}`);
if (existsSync(new URL(`./${tarball}`, root))) throw new Error(`${tarball} 已存在，先确认是否重复发布`);

// 文档里硬编码了版本号与哈希，发版时一并替换；任何一处没命中都报错，避免文档悄悄落后。
const docRules = (hash) => [
  ['README.md', /\.\/dsh-workbase-\d+\.\d+\.\d+\.tgz/, `./${tarball}`],
  ['.agents/notes/dev-log.md', /当前版本 `\d+\.\d+\.\d+`/, `当前版本 \`${target}\``],
  ['.agents/notes/dev-log.md', /dsh-workbase-\d+\.\d+\.\d+\.tgz/g, tarball],
  ['.agents/notes/dev-log.md', /SHA-256 `[0-9a-f]{64}`/, `SHA-256 \`${hash}\``],
];

console.log(`发布 ${current} → ${target}${dryRun ? '（演练，不写入任何文件）' : ''}`);

if (dryRun) {
  console.log(`将生成 ${tarball} 与其 .sha256，并改写 README.md、.agents/notes/dev-log.md 里的版本号与哈希。`);
  process.exit(0);
}

console.log('1/5 类型检查');
exec(['run', 'typecheck']);
console.log('2/5 测试');
exec(['test']);
console.log('3/5 构建');
exec(['run', 'build']);

const original = await readFile(pkgPath, 'utf8');
const plans = new Map();
let created = null;
try {
  console.log(`4/5 版本号 → ${target}`);
  await writeFile(pkgPath, original.replace(/"version":\s*"[^"]+"/, `"version": "${target}"`));

  const packed = JSON.parse(exec(['pack', '--json'], { capture: true }));
  const [info] = packed;
  if (info.filename !== tarball) throw new Error(`打包文件名不符：${info.filename}`);
  created = new URL(`./${tarball}`, root);

  const digest = createHash('sha256').update(await readFile(created)).digest('hex');
  await writeFile(new URL(`./${tarball}.sha256`, root), `${digest}  ${tarball}\n`);

  console.log('5/5 同步文档');
  // 先全部校验、再统一写入：文档漂移时不能留下改了一半的状态。
  for (const [file, pattern, replacement] of docRules(digest)) {
    const plan = plans.get(file) ?? { url: new URL(`./${file}`, root), original: await readFile(new URL(`./${file}`, root), 'utf8'), next: null };
    plans.set(file, plan);
    const text = plan.next ?? plan.original;
    if (!pattern.test(text)) throw new Error(`${file} 未命中 ${pattern}，版本号/哈希可能已漂移`);
    plan.next = text.replace(pattern, replacement);
  }
  for (const plan of plans.values()) await writeFile(plan.url, plan.next);

  console.log(`\n完成：${tarball}`);
  console.log(`  大小      ${(info.size / 1024).toFixed(1)} KB（解包 ${(info.unpackedSize / 1024).toFixed(1)} KB，${info.files.length} 个文件）`);
  console.log(`  SHA-256   ${digest}`);
  console.log(`  文件      ${info.files.map(entry => entry.path).join('、')}`);
  console.log('\n后续（脚本不代做）：');
  console.log(`  1. 提交：git add package.json README.md docs/ && git commit -m "${target}：…"`);
  console.log(`  2. 安装：dsh plugin --profile web|desktop add ./${tarball}`);
  console.log('  3. 重启宿主后更新 .agents/notes/dev-log.md 的「桌面 profile」已安装版本');
  console.log('  4. 需要上 registry 时再手动执行 npm run publish:check / publish:beta');
} catch (error) {
  await writeFile(pkgPath, original);
  for (const plan of plans.values()) if (plan.next) await writeFile(plan.url, plan.original);
  if (created) {
    await rm(created, { force: true });
    await rm(new URL(`./${tarball}.sha256`, root), { force: true });
  }
  console.error(`\n已回滚：package.json 恢复 ${current}，文档与未完成的 ${tarball} 一并还原`);
  throw error;
}
