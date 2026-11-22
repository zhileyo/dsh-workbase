import { readdir, readFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['provider-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|npm_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['credential-url', /(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s/'"<>:@]+:[^\s/'"<>@]+@/g],
];
// RSS URL 拒绝用例的固定合成值；只豁免该文件中的这个摘要，不能豁免整个 test/。
const syntheticFixtures = new Set(['test/rss-parser.test.ts:credential-url:ec25b8fa54a9']);
// 豁免键一律用正斜杠；Windows 的 relative() 返回反斜杠，不归一化会让豁免在本地失效。
const portable = path => path.split(sep).join('/');

export function detectSecrets(text, path) {
  const normalized = portable(path);
  const findings = [];
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      // CI/脚本中的变量引用不是凭据值。
      if (kind === 'credential-url' && /\$\{|\$\(|%[A-Z_]+%/.test(match[0])) continue;
      const fingerprint = createHash('sha256').update(match[0]).digest('hex').slice(0, 12);
      if (syntheticFixtures.has(`${normalized}:${kind}:${fingerprint}`)) continue;
      findings.push({
      path: normalized, line: text.slice(0, match.index).split('\n').length, kind,
      fingerprint,
      });
    }
  }
  return findings;
}

const ignored = new Set(['.git', 'node_modules', 'dist', 'lib', 'coverage', '.cache', '.screenshots', '.trash', '.trae-html-share-packages']);
async function files(root, directory = root) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), rel = portable(relative(root, path));
    if (ignored.has(entry.name) || rel.startsWith('.agents/worktrees') || rel.startsWith('docs/ui/verification')) continue;
    if (entry.isDirectory()) result.push(...await files(root, path));
    else if (entry.isFile() && !/\.(?:tgz|age|png|webp|jpg|jpeg|pdf|zip|log)$/i.test(entry.name)) result.push(path);
  }
  return result;
}

export async function scanWorktree(root) {
  const findings = [];
  for (const path of await files(root)) {
    const bytes = await readFile(path);
    if (!bytes.subarray(0, 8192).includes(0)) findings.push(...detectSecrets(bytes.toString('utf8'), portable(relative(root, path))));
  }
  return findings;
}

export async function scanHistory(repository) {
  const list = execFileSync('git', ['rev-list', '--objects', '--all'], { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const objects = new Map(list.trim().split('\n').filter(Boolean).map(line => {
    const space = line.indexOf(' ');
    return space < 0 ? [line, '(无路径对象)'] : [line.slice(0, space), line.slice(space + 1)];
  }));
  const child = spawn('git', ['cat-file', '--batch'], { cwd: repository, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end([...objects.keys()].join('\n') + '\n');
  let buffer = Buffer.alloc(0), header, size, count = 0;
  const findings = [];
  // stderr 不含 blob 正文；仅在命令失败时报告退出状态。
  child.stderr.resume();
  const exited = new Promise((resolveExit, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolveExit() : reject(new Error(`Git 历史读取失败（${code}）`)));
  });
  for await (const chunk of child.stdout) {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (!header) {
        const newline = buffer.indexOf(10);
        if (newline < 0) break;
        header = buffer.subarray(0, newline).toString().split(' ');
        if (!/^\d+$/.test(header[2] ?? '')) throw new Error('Git 对象读取不完整');
        size = Number(header[2]); buffer = buffer.subarray(newline + 1);
      }
      if (buffer.length < size + 1) break;
      if (header[1] === 'blob') {
        count++;
        const bytes = buffer.subarray(0, size);
        if (!bytes.subarray(0, 8192).includes(0)) {
          findings.push(...detectSecrets(bytes.toString('utf8'), objects.get(header[0])).map(row => ({ ...row, object: header[0] })));
        }
      }
      buffer = buffer.subarray(size + 1); header = undefined;
    }
  }
  await exited;
  if (header || buffer.length) throw new Error('Git 对象输出截断');
  return { objects: objects.size, blobs: count, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const history = process.argv.indexOf('--history');
  const result = history >= 0 ? await scanHistory(resolve(process.argv[history + 1] ?? '.'))
    : { findings: await scanWorktree(process.cwd()) };
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length) process.exitCode = 1;
}
