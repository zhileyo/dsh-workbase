import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function run(script: string) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }));
}

test('秘密扫描只输出位置与类别，拦截合成凭据并允许变量引用', () => {
  const result = run(`
    import { detectSecrets } from './secret-scan.mjs';
    const text = ['const key = "' + 'gh' + 'p_' + 'A'.repeat(36) + '";',
      'NPM_TOKEN: \${{ secrets.NPM_TOKEN }}', 'token: process.env.TOKEN',
      'https://\${CNB_TOKEN_USER_NAME}:\${CNB_TOKEN}@example.com/repo'].join('\\n');
    console.log(JSON.stringify(detectSecrets(text, 'synthetic.ts')));
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].line, 1);
  assert.equal(result[0].kind, 'provider-token');
  assert.equal(JSON.stringify(result).includes('A'.repeat(36)), false);
});

test('第三方许可从实际内嵌输入收集，合并两端且输出确定', () => {
  const result = run(`
    import { collectThirdPartyNotices } from './third-party.mjs';
    const inputs = {'node_modules/age-encryption/dist/index.js': {}, 'node_modules/linkedom/esm/index.js': {},
      'node_modules/cssomnom/dist/index.js': {}, 'src/server/index.ts': {}};
    const text = await collectThirdPartyNotices([{inputs}, {inputs}], process.cwd());
    console.log(JSON.stringify({text, same: text === await collectThirdPartyNotices([{inputs}], process.cwd())}));
  `);
  assert.equal(result.same, true);
  assert.match(result.text, /age-encryption/);
  assert.match(result.text, /Redistribution and use/);
  assert.match(result.text, /linkedom/);
  assert.match(result.text, /Permission to use, copy, modify/);
  assert.match(result.text, /Apache License/);
  assert.match(result.text, /TERMS AND CONDITIONS/);
});

test('秘密扫描的合成用例豁免只匹配固定文件及摘要', () => {
  const result = run(`
    import { detectSecrets } from './secret-scan.mjs';
    const url = 'https://' + 'user:secret@' + 'news.org/';
    console.log(JSON.stringify([
      detectSecrets(url, 'test/rss-parser.test.ts').length,
      detectSecrets(url, 'src/accidental.ts').length,
      detectSecrets(url.replace('secret', 'different'), 'test/rss-parser.test.ts').length
    ]));
  `);
  assert.deepEqual(result, [0, 1, 1]);
});

test('截图模块生成真正的 WebP，并保留截图选项', () => {
  const result = run(`
    import { mkdtemp, readFile, rm } from 'node:fs/promises';
    import { tmpdir } from 'node:os'; import { join } from 'node:path';
    import { screenshotWebp } from './docs/evidence-image.mjs';
    const dir = await mkdtemp(join(tmpdir(), 'dsh-evidence-test-'));
    let options;
    try {
      await screenshotWebp({screenshot: async value => {
        options = value;
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6qkAAAAASUVORK5CYII=', 'base64');
      }}, join(dir, 'nested/result.webp'), {animations: 'disabled'});
      const bytes = await readFile(join(dir, 'nested/result.webp'));
      console.log(JSON.stringify({signature: bytes.subarray(8,12).toString(), options}));
    } finally { await rm(dir, {recursive:true,force:true}); }
  `);
  assert.equal(result.signature, 'WEBP');
  assert.equal(result.options.type, 'png');
  assert.equal(result.options.animations, 'disabled');
});
