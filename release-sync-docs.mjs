/**
 * semantic-release 本地插件：把新版本号同步进文档的「当前状态」。
 *
 * 三条设计约束：
 * 1. 只改现状，不改历史——开发日志的按日期条目是当时的记录，改写它们等于篡改证据，
 *    所以 `.agents/notes/dev-log.md` 只在「## 日志」分界之前替换。
 * 2. 不写死哈希：本地打包的 SHA-256 与 registry 上的 tarball 不一定逐字节相同
 *    （gzip 头含时间戳），改为指向 registry 的 integrity。
 * 3. 任一规则未命中即抛错，让整次发版中止——文档版本与 registry 不一致比不发版更糟。
 *    因此每条规则的正则都要同时匹配「首次改写」和「已改写过」两种形态。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const file = name => fileURLToPath(new URL(name, root));

/** 开发日志中「现状」与「历史」的分界标题。 */
const HISTORY_HEADING = '\n## 日志';

const INTEGRITY_HINT = version => `（完整性校验用 \`npm view dsh-workbase@${version} dist.integrity\`）`;

/** @returns {{file: string, scope: 'all'|'current', pattern: RegExp, replacement: string, label: string}[]} */
const rules = version => [
  {
    file: 'README.md',
    scope: 'all',
    pattern: /dsh-workbase-\d+\.\d+\.\d+\.tgz/g,
    replacement: `dsh-workbase-${version}.tgz`,
    label: '安装命令里的包名',
  },
  {
    file: '.agents/notes/dev-log.md',
    scope: 'current',
    pattern: /当前源码与本地包为 `\d+\.\d+\.\d+`/,
    replacement: `当前源码与本地包为 \`${version}\``,
    label: '当前源码与本地包版本',
  },
  {
    file: '.agents/notes/dev-log.md',
    scope: 'current',
    pattern: /当前版本 `\d+\.\d+\.\d+`/,
    replacement: `当前版本 \`${version}\``,
    label: '当前版本',
  },
  {
    file: '.agents/notes/dev-log.md',
    scope: 'current',
    pattern: /dsh-workbase-\d+\.\d+\.\d+\.tgz/g,
    replacement: `dsh-workbase-${version}.tgz`,
    label: '安装包名',
  },
  {
    file: '.agents/notes/dev-log.md',
    scope: 'current',
    pattern:
      /（(?:SHA-256 `[0-9a-f]{64}`|完整性校验用 `npm view dsh-workbase@\d+\.\d+\.\d+ dist\.integrity`)）/,
    replacement: INTEGRITY_HINT(version),
    label: '哈希说明',
  },
];

/** 把开发日志切成「现状」与「历史」两段，历史段原样返回。 */
function splitCurrentState(text) {
  const at = text.indexOf(HISTORY_HEADING);
  if (at === -1) {
    throw new Error(`[sync-docs] 开发日志缺少「${HISTORY_HEADING.trim()}」分界，无法安全改写。`);
  }
  return [text.slice(0, at), text.slice(at)];
}

export async function prepare(_pluginConfig, { nextRelease }) {
  const version = nextRelease.version;
  /** @type {Map<string, string>} */
  const pending = new Map();

  for (const { file: name, scope, pattern, replacement, label } of rules(version)) {
    const text = pending.get(name) ?? (await readFile(file(name), 'utf8'));
    const [head, tail] = scope === 'current' ? splitCurrentState(text) : [text, ''];
    const nextHead = head.replace(pattern, replacement);

    if (nextHead === head) {
      throw new Error(
        `[sync-docs] ${name} 未命中「${label}」，无法写入版本 ${version}。请先核对文档标记。`,
      );
    }
    pending.set(name, nextHead + tail);
  }

  for (const [name, text] of pending) {
    await writeFile(file(name), text);
  }

  console.log(`[sync-docs] 已把 ${version} 写入 README.md 与 .agents/notes/dev-log.md 的当前状态`);
}
