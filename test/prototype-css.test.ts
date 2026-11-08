import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 原型评审外壳与「设计方向 B」变体在插件里永不命中（根节点只有 .wb，主题表只有 follow/dsh/fresh/warm）。
// sync-ui.mjs 在生成时剪掉它们，这里守着剪枝结果，避免改原型后死样式又被打进包。
const css = await readFile(new URL('../src/client/prototype.css', import.meta.url), 'utf8');

test('生成的原型样式不含评审工具条与旧输入框预览的选择器', () => {
  assert.doesNotMatch(css, /:scope\.b(?![\w-])/);
  for (const dead of ['review', 'review-tools', 'review-label', 'review-note', 'design-intro', 'directions', 'chat-preview']) {
    assert.doesNotMatch(css, new RegExp(`(?:^|[^-\\w])\\.${dead}(?![\\w-])`), dead);
  }
});

test('温暖阅读主题与断点容器是活代码，剪枝不得波及', () => {
  assert.match(css, /:scope\.c(?![\w-])/);
  assert.match(css, /@scope \(\.wb\)/);
  assert.match(css, /@container workbase \(max-width:1100px\)/);
  assert.match(css, /\.composer-shell/);
});

// 插件活在宿主侧栏里：断点必须是「面板宽度」。原型用 @media 写，转换器负责改成容器查询。
test('宽度断点全部转成容器查询，视口能力查询仍留在 @media', () => {
  assert.doesNotMatch(css, /@media[^{]*\((?:max|min)-width/);
  assert.match(css, /@container workbase \(min-width:601px\)/);
  // pointer/hover 是视口能力，塞进 @container 会得到恒假条件，触屏窄屏的点按目标会静默失效。
  assert.match(css, /@media \(pointer:coarse\)\{@container workbase \(max-width:420px\)\{/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('剪枝后规则块仍然配平，且保留原型注释与关键帧', () => {
  assert.equal(css.split('{').length, css.split('}').length);
  assert.match(css, /@keyframes/);
  assert.match(css, /\/\* 自动从 docs\/ui\/ui-directions\.html 同步/);
});
