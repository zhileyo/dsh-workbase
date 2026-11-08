import { readFile, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// 原型里只在原型自身生效、进插件后永不命中的选择器：
// - `:scope.b` 是原型「设计方向 B」变体，插件主题表只有 follow/dsh/fresh/warm(/c)；
// - review 外壳与 .design-intro/.directions/.chat-preview 是原型评审工具条与旧输入框预览。
const DEAD_SELECTORS = [
  /(?:^|[\s>+~,:]):scope\.b(?![\w-])/,
  /(?:^|[^-\w])\.(?:review|review-tools|review-label|review-note|design-intro|directions|chat-preview)(?![\w-])/,
];
const GROUPING_AT_RULE = /^@(?:container|media|supports|layer|scope|document)\b/i;

const isDeadSelector = selector => DEAD_SELECTORS.some(pattern => pattern.test(selector));

const skipString = (css, index) => {
  const quote = css[index];
  let cursor = index + 1;
  while (cursor < css.length) {
    if (css[cursor] === '\\') { cursor += 2; continue; }
    if (css[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return css.length;
};

const skipComment = (css, index) => {
  const end = css.indexOf('*/', index + 2);
  return end < 0 ? css.length : end + 2;
};

const findBlockEnd = (css, open) => {
  let depth = 0;
  let cursor = open;
  while (cursor < css.length) {
    const char = css[cursor];
    if (char === '"' || char === "'") { cursor = skipString(css, cursor); continue; }
    if (char === '/' && css[cursor + 1] === '*') { cursor = skipComment(css, cursor); continue; }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
    cursor += 1;
  }
  return css.length;
};

const splitSelectors = prelude => {
  const parts = [];
  let depth = 0;
  let start = 0;
  let cursor = 0;
  while (cursor < prelude.length) {
    const char = prelude[cursor];
    if (char === '"' || char === "'") { cursor = skipString(prelude, cursor); continue; }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(prelude.slice(start, cursor));
      start = cursor + 1;
    }
    cursor += 1;
  }
  parts.push(prelude.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
};

// 原型样式是「多条规则挤一行」的压缩格式，只能做括号/引号感知的规则级过滤。
const pruneRules = css => {
  let output = '';
  let cursor = 0;
  while (cursor < css.length) {
    const char = css[cursor];
    if (/\s/.test(char)) { output += char; cursor += 1; continue; }
    if (char === '/' && css[cursor + 1] === '*') {
      const end = skipComment(css, cursor);
      output += css.slice(cursor, end);
      cursor = end;
      continue;
    }
    let scan = cursor;
    let parens = 0;
    let brackets = 0;
    while (scan < css.length) {
      const current = css[scan];
      if (current === '"' || current === "'") { scan = skipString(css, scan); continue; }
      if (current === '/' && css[scan + 1] === '*') { scan = skipComment(css, scan); continue; }
      if (current === '(') parens += 1;
      else if (current === ')') parens -= 1;
      else if (current === '[') brackets += 1;
      else if (current === ']') brackets -= 1;
      else if (parens === 0 && brackets === 0 && (current === '{' || current === ';')) break;
      scan += 1;
    }
    const prelude = css.slice(cursor, scan);
    if (scan >= css.length) { output += prelude; break; }
    if (css[scan] === ';') { output += `${prelude};`; cursor = scan + 1; continue; }
    const close = findBlockEnd(css, scan);
    const body = css.slice(scan + 1, close);
    const head = prelude.trim();
    if (head.startsWith('@')) {
      const inner = GROUPING_AT_RULE.test(head) ? pruneRules(body) : body;
      output += `${prelude}{${inner}}`;
    } else {
      const kept = splitSelectors(head).filter(selector => !isDeadSelector(selector));
      if (kept.length > 0) output += `${kept.join(',')}{${body}}`;
      // 选择器全部失效时整条规则丢弃
    }
    cursor = close + 1;
  }
  return output;
};

export { pruneRules };

// 宽度断点必须按「面板宽度」判断：插件活在宿主侧栏里，视口宽度不等于可用宽度。
// 原型用 @media 写断点，这里统一改成容器查询；纯视口能力（pointer/hover/动效偏好）仍留在 @media。
const WIDTH_CONDITION = /\(\s*(max|min)-width\s*:\s*(\d+)px\s*\)/gi;

const splitWidthCondition = prelude => {
  const matches = [...prelude.matchAll(WIDTH_CONDITION)];
  if (matches.length === 0) return null;
  let rest = prelude;
  for (const match of matches) rest = rest.replace(match[0], '');
  rest = rest.replace(/^\s*and\s+/i, '').replace(/\s+and\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
  const width = matches.map(match => `(${match[1].toLowerCase()}-width:${match[2]}px)`).join(' and ');
  return { width, rest };
};

// 例：`@media(max-width:420px) and (pointer:coarse)` → `@media(pointer:coarse){@container workbase (max-width:420px){…}}`
// 直接把 pointer 塞进容器查询会得到恒假条件，触屏窄屏规则会静默失效。
const adaptBreakpoints = css => {
  let output = '';
  let cursor = 0;
  while (cursor < css.length) {
    const at = css.indexOf('@media', cursor);
    if (at < 0) { output += css.slice(cursor); break; }
    output += css.slice(cursor, at);
    let scan = at + '@media'.length;
    let parens = 0;
    while (scan < css.length) {
      const char = css[scan];
      if (char === '"' || char === "'") { scan = skipString(css, scan); continue; }
      if (char === '(') parens += 1;
      else if (char === ')') parens -= 1;
      else if (parens === 0 && (char === '{' || char === ';')) break;
      scan += 1;
    }
    const prelude = css.slice(at, scan);
    if (scan >= css.length) { output += prelude; break; }
    if (css[scan] === ';') { output += `${prelude};`; cursor = scan + 1; continue; }
    const close = findBlockEnd(css, scan);
    const body = adaptBreakpoints(css.slice(scan + 1, close));
    const split = splitWidthCondition(prelude.slice('@media'.length));
    if (!split) output += `${prelude}{${body}}`;
    else if (!split.rest) output += `@container workbase ${split.width}{${body}}`;
    else output += `@media ${split.rest}{@container workbase ${split.width}{${body}}}`;
    cursor = close + 1;
  }
  return output;
};

export { adaptBreakpoints };

// 原型为唯一视觉来源。只提取静态 CSS 和图标，不执行原型业务脚本。
export async function syncPrototypeUi() {
  const html = await readFile(new URL('./docs/ui/ui-directions.html', import.meta.url), 'utf8');
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  const css = pruneRules(adaptBreakpoints(styles.replace(/\.app(?![\w-])/g, ':scope'))
    .replace(/\b(pulse|settings-slide-up|settings-mask-in)\b/g, 'wb-$1'));
  const iconSource = html.match(/const icons=(\{[\s\S]*?\n\});/)?.[1];
  if (!iconSource) throw new Error('原型图标表未找到');
  const icons = runInNewContext(`(${iconSource})`, Object.create(null), { timeout: 100 });
  await writeFile(new URL('./src/client/prototype.css', import.meta.url),
    `/* 自动从 docs/ui/ui-directions.html 同步；请修改原型后重新构建。 */\n@scope (.wb) {\n${css}\n}\n`);
  await writeFile(new URL('./src/client/prototype-icons.ts', import.meta.url),
    `// 自动从 UI 原型同步。\nexport const prototypeIcons = ${JSON.stringify(icons, null, 2)} as const;\n`);
}
