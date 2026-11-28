import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// 词典正则只在建立索引时编译一次；这条用例在导入前装计数器，用来确认调用路径不再现场编译。
const RealRegExp = globalThis.RegExp;
let compiled = 0;
class CountingRegExp extends RealRegExp {
  constructor(...args: (string | RegExp | undefined)[]) {
    super(args[0] as string, args[1] as string | undefined);
    compiled += 1;
  }
}
(globalThis as { RegExp: RegExpConstructor }).RegExp = CountingRegExp as unknown as RegExpConstructor;

const { errorText, statusText, setLanguage } = await import('../src/client/i18n.js');
// 计数器要活到用例结束；统计期间模块里的 `new RegExp` 仍走这个构造函数。
after(() => { (globalThis as { RegExp: RegExpConstructor }).RegExp = RealRegExp; });

test('错误与状态文案的模板匹配不在调用路径上重复编译正则', () => {
  setLanguage('en');
  try {
    // 预热：第一次调用建立索引。
    errorText('技能来源设置已保存');
    errorText('文件已保存，来源监听失败：a.txt');
    statusText('已保存；部分内容未写入');
    compiled = 0;
    for (let index = 0; index < 40; index += 1) {
      errorText('技能来源设置已保存');
      errorText(`文件已保存，来源监听失败：${index}.txt`);
      statusText(`已保存；第 ${index} 项未写入`);
    }
    assert.equal(compiled, 0);
  } finally {
    setLanguage('zh');
  }
});

test('预编译索引与逐条匹配结果一致', () => {
  assert.equal(errorText('Skill source settings saved'), '技能来源设置已保存');
  assert.equal(errorText('Files saved, but source monitoring failed: a.txt'), '文件已保存，来源监听失败：a.txt');
  setLanguage('en');
  try {
    assert.equal(errorText('技能来源设置已保存'), 'Skill source settings saved');
    assert.equal(errorText('文件已保存，来源监听失败：a.txt'), 'Files saved, but source monitoring failed: a.txt');
    assert.equal(statusText('已保存；第三项未写入'), 'Saved；第三项未写入');
    assert.equal(errorText('未知错误原样返回'), '未知错误原样返回');
  } finally {
    setLanguage('zh');
  }
  assert.equal(errorText('Skill source settings saved'), '技能来源设置已保存');
});
