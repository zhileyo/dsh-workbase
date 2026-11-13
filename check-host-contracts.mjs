import ts from 'typescript';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const parse = text => ts.createSourceFile('contract.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const normalized = node => {
  if (!node) return '';
  if (ts.isUnionTypeNode(node)) return node.types.map(normalized).sort().join('|');
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return JSON.stringify(node.literal.text);
  return node.getText().replace(/\s+/g, '');
};
const declarations = text => {
  const result = {};
  for (const node of parse(text).statements) {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))
      result[node.name.text] = hash(node.getText().replace(/\s+/g, ' '));
  }
  return result;
};

/** 包内没有 .d.ts 时仍读取随包源码；声明变化独立于 JS 方法指纹报告。 */
export function contractFingerprints(files) {
  return Object.fromEntries(files.flatMap(({ file, text }) =>
    Object.entries(declarations(text)).map(([name, fingerprint]) => [`${file}:${name}`, fingerprint])).sort());
}

function properties(text, name) {
  const declaration = parse(text).statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === name);
  if (!declaration) return undefined;
  return Object.fromEntries(declaration.members.filter(ts.isPropertySignature).map(node =>
    [node.name.getText(), { type: normalized(node.type), optional: !!node.questionToken }]));
}

/** 不依赖旧基线：核对工作台实际声明和更新门禁读到的字段。不是完整 TS/RPC 行为证明。 */
export function inspectPluginUpdateContract(hostText, clientText) {
  const host = properties(hostText, 'BundleInfo');
  const client = properties(clientText, 'Bundle');
  const errors = [];
  if (!host || !client) return { errors: ['插件更新契约缺少 BundleInfo 或 Bundle 声明'], fields: host ?? {} };
  for (const key of ['name', 'version', 'installed', 'availability', 'official', 'source']) {
    const actual = host[key], expected = client[key];
    if (!actual || !expected || actual.type !== expected.type || (actual.optional && !expected.optional))
      errors.push(`插件更新 BundleInfo.${key} 与工作台 Bundle 不兼容`);
  }
  const source = parse(clientText);
  const gate = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'registryUpdateAvailable');
  const reads = new Set();
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === 'bundle')
      reads.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  // 旧实现直接在 check 中读 updatable；也必须能被本检查拒绝。
  visit(gate ?? source);
  const field = host.update ? 'update' : host.updatable ? 'updatable' : undefined;
  if (!field || !reads.has(field))
    errors.push(`插件更新门禁未适配宿主字段 ${field ?? 'update/updatable（均缺失）'}`);
  else if (!client[field] || client[field].type !== host[field].type)
    errors.push(`插件更新字段 ${field} 的类型与宿主不兼容`);
  return { errors, fields: host, gateField: field };
}

export function changedContracts(previous, current) {
  return [...new Set([...Object.keys(previous ?? {}), ...Object.keys(current)])]
    .filter(key => previous?.[key] !== current[key]).sort();
}
