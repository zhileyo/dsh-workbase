import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// AGENTS.md 硬性约束：不要在 src/ 里随手加运行时依赖。宿主技能包的调用判定只是读候选对象上的
// invocation 字段，不需要值导入；保留值导入会让 dist/index.js 依赖一个未在 package.json 声明的包。
test('对宿主技能包只做类型导入，不引入未声明的运行时依赖', async () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const files = (await readdir(root, { recursive: true })).filter(name => /\.tsx?$/.test(name));
  assert.ok(files.length > 0, 'src 下应当可以读到 TypeScript 源码');
  let imports = 0;
  for (const name of files) {
    const text = await readFile(join(root, name), 'utf8');
    for (const match of text.matchAll(/import\s[^;]*?from\s+'@deepseek-ai\/dsh-skill'/g)) {
      imports++;
      assert.match(match[0], /^import type /, `${name} 必须以 import type 引用 @deepseek-ai/dsh-skill`);
    }
  }
  assert.ok(imports > 0, '应当至少有一处对宿主技能包的类型引用，避免断言空转');
});
