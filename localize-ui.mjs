import ts from 'typescript';
import { readFile } from 'node:fs/promises';

/**
 * 在构建时把界面静态文案接入词典。只处理源码中的中文文字与模板片段，
 * 不遍历 DOM、React 元素或用户数据；不生成/改写受跟踪的客户端源文件。
 * 模块级标签表延迟取译文，避免切换语言后仍保留首次加载时的文本。
 */
export function localizeClientSource(source, filename) {
  if (!/[\\/]src[\\/]client[\\/]/.test(filename) || /(?:i18n(?:-en)?|prototype-icons|todo-session)\.ts$/.test(filename)) return source;
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const f = ts.factory, chinese = text => /[\u4e00-\u9fff]/.test(text);
  const call = (name, args) => f.createCallExpression(f.createIdentifier(name), undefined, args);
  let used = false;
  const translate = (text, params) => {
    used = true;
    return call('__wbText', [f.createStringLiteral(text), ...(params ? [params] : [])]);
  };
  const hasText = node => {
    let found = false;
    const visit = child => {
      if (ts.isFunctionLike(child)) return;
      if ((ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) && chinese(child.text)) found = true;
      ts.forEachChild(child, visit);
    };
    visit(node); return found;
  };
  const result = ts.transform(file, [context => {
    const visit = node => {
      // 类型、属性键及字符串比较是契约或判断条件，不参与界面翻译。
      if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'errorText'].includes(node.expression.text)) return node;
      if (ts.isVariableStatement(node) && node.parent === file) {
        const declarations = node.declarationList.declarations.map(declaration => {
          const initial = declaration.initializer;
          if (!initial || ts.isFunctionLike(initial) || !hasText(initial)) return ts.visitEachChild(declaration, visit, context);
          // 只对本模块的静态数组/对象建延迟视图，内部值与源码保持中文。
          const table = ts.isArrayLiteralExpression(initial) || ts.isObjectLiteralExpression(initial)
            || ts.isAsExpression(initial) && (ts.isArrayLiteralExpression(initial.expression) || ts.isObjectLiteralExpression(initial.expression));
          if (!table) return ts.visitEachChild(declaration, visit, context);
          used = true;
          return f.updateVariableDeclaration(declaration, declaration.name, declaration.exclamationToken, declaration.type, call('__wbLabels', [initial]));
        });
        return f.updateVariableStatement(node, node.modifiers, f.updateVariableDeclarationList(node.declarationList, declarations));
      }
      if (ts.isJsxText(node) && chinese(node.text)) {
        // 与 JSX 的换行/缩进规则保持一致，保留同一行用于拼句的首尾空格。
        const text = node.text.split(/\r?\n/).map((line, index, lines) =>
          (index ? line.trimStart() : line).replace(index === lines.length - 1 ? /$^/ : /\s+$/, '')
        ).filter(Boolean).join(' ');
        return f.createJsxExpression(undefined, translate(text));
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (!chinese(node.text)) return node;
        const parent = node.parent;
        if (ts.isPropertyAssignment(parent) && parent.name === node
          || ts.isElementAccessExpression(parent) && parent.argumentExpression === node
          || ts.isBinaryExpression(parent) && ![ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)) return node;
        const translated = translate(node.text);
        return ts.isJsxAttribute(parent) ? f.createJsxExpression(undefined, translated) : translated;
      }
      if (ts.isTemplateExpression(node)) {
        const segments = [node.head.text, ...node.templateSpans.map(span => span.literal.text)];
        if (segments.some(chinese)) {
          const text = segments.map((part, index) => part + (index < node.templateSpans.length ? `{p${index}}` : '')).join('');
          const params = f.createObjectLiteralExpression(node.templateSpans.map((span, index) =>
            f.createPropertyAssignment(`p${index}`, ts.visitNode(span.expression, visit))
          ));
          return translate(text, params);
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return root => ts.visitNode(root, visit);
  }]);
  try {
    if (!used) return source;
    const transformed = result.transformed[0];
    // 私有别名避免与待办循环中的 t 等本地变量冲突。
    return `import { t as __wbText, localized as __wbLabels } from './i18n.js';\n` + ts.createPrinter().printFile(transformed);
  } finally { result.dispose(); }
}

export const clientLocalization = {
  name: 'workbase-localization',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]client[\\/].+\.(?:ts|tsx)$/ }, async args => ({
      contents: localizeClientSource(await readFile(args.path, 'utf8'), args.path),
      loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
    }));
  },
};
