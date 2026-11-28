import { MAX_SKILL_UPLOAD, skillContentSchema, skillNameSchema, splitSkillDocument } from '../shared/skills.js';
import { createHash } from 'node:crypto';

/** 显示名和文件保持原值；宿主调用仍使用兼容的 ASCII 标识。 */
export function skillInvocationName(name: string): string | undefined {
  const parsed = skillNameSchema.safeParse(name);
  if (!parsed.success) return;
  name = parsed.data;
  if (/[^\x00-\x7F]/.test(name)) return `skill-${createHash('sha256').update(name).digest('hex').slice(0, 24)}`;
  const normalized = name.trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
    .replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized
    : `skill-${createHash('sha256').update(name).digest('hex').slice(0, 24)}`;
}
const documentContent = skillContentSchema;

/** 目录发现接受常见 YAML 标量及说明块；未知调用策略拒绝解析，避免扩大权限。 */
export function readSkillDocument(text: string) {
  if (Buffer.byteLength(text) > MAX_SKILL_UPLOAD) throw new Error('技能文件最大 2 MB');
  const { frontmatter, body } = splitSkillDocument(text);
  const lines = frontmatter.split(/\r?\n/), fields = new Map<string, string>();
  const relevant = new Set(['name', 'description', 'model-invocable', 'disable-model-invocation', 'user-invocable']);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.trimStart().startsWith('#') || /^\s/.test(line)) continue;
    const field = /^([\w-]+):[ \t]*(.*)$/.exec(line);
    if (!field) throw new Error('frontmatter 字段无法解析');
    const key = field[1]!, raw = field[2]!;
    if (!relevant.has(key)) continue;
    if (fields.has(key)) throw new Error('frontmatter 字段重复');
    let value: string;
    if (/^[>|][+-]?(?:\s+#.*)?$/.test(raw)) {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]!) || !lines[i + 1]!.trim())) block.push(lines[++i]!);
      const indent = Math.min(...block.filter(line => line.trim()).map(line => /^\s*/.exec(line)![0].length));
      value = block.map(line => line.slice(Number.isFinite(indent) ? indent : 0)).join(raw[0] === '>' ? ' ' : '\n').trim();
    } else if (raw.startsWith('"')) {
      const quoted = /^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/.exec(raw);
      if (!quoted) throw new Error('frontmatter 引号未闭合');
      const parsed: unknown = JSON.parse(quoted[1]!);
      if (typeof parsed !== 'string') throw new Error('frontmatter 需要字符串');
      value = parsed;
    } else if (raw.startsWith("'")) {
      const quoted = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(raw);
      if (!quoted) throw new Error('frontmatter 引号未闭合');
      value = quoted[1]!.replaceAll("''", "'");
    } else {
      if (/^[&*!{[]/.test(raw)) throw new Error('不支持此 YAML 字段形式');
      value = raw.replace(/\s+#.*$/, '').trim();
    }
    fields.set(key, value);
  }
  const boolean = (key: string, fallback: boolean) => {
    const value = fields.get(key);
    if (value === undefined) return fallback;
    if (value !== 'true' && value !== 'false') throw new Error('技能调用策略必须是 true 或 false');
    return value === 'true';
  };
  const content = documentContent.parse({ name: fields.get('name'), description: fields.get('description'), body });
  const invocationName = skillInvocationName(content.name);
  if (!invocationName) throw new Error('技能名称无法转换为宿主支持的调用名称');
  return {
    ...content, frontmatter, invocationName,
    invocation: {
      modelInvocable: boolean('model-invocable', true) && !boolean('disable-model-invocation', false),
      userInvocable: boolean('user-invocable', true),
    },
  };
}
