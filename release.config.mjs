/**
 * semantic-release 配置。
 *
 * 提交规范见 `.agents/rules/git-commit-message.md`：那里改 type 名或分隔符时，
 * 下面的 headerPattern、releaseRules 必须同步，否则 commit-analyzer 解析不到 type，
 * 会静默降级成「不发版」。
 */

// type 允许中文；分隔符同时接受全角「：」与半角「:」；作用域可选。
export const headerPattern = /^([\u4e00-\u9fa5A-Za-z]+)(?:\(([^)]*)\))?[：:]\s*(.+)$/;
export const headerCorrespondence = ['type', 'scope', 'subject'];

// 导出 parserOpts 是为了能单独喂给 commit-analyzer 做校验：它不在 default 导出里，
// 探针若误取 config.parserOpts 会拿到 undefined，analyzer 悄悄退回默认 headerPattern、全部解析成 null。
export const parserOpts = { headerPattern, headerCorrespondence };

// 「新增文件」只表示加能力，落 minor；破坏性改动与结构大改都走「代码重构」的 major。
// 0.x 期间 major 的落点就是 1.0.0：一旦出现破坏性提交，版本会直接从 0.3 跳到 1.0.0。
export const releaseRules = [
  { type: '新增文件', release: 'minor' },
  { type: '问题修复', release: 'patch' },
  { type: '编译代码', release: 'patch' },
  { type: '文档修改', release: 'patch' },
  { type: '样式修改', release: false },
  // 代码重构推动 major：收结构大改、宿主接线修复与破坏性契约变更，0.x 期间直接到 1.0.0。
  { type: '代码重构', release: 'major' },
  { type: '其他提交', release: false },
];

const commitMessage = [
  '文档修改：${nextRelease.version} 同步版本标记与变更记录',
  '',
  '1.原因分析：发版后文档里的版本号与安装包名必须与 registry 一致，手工同步必然漂移',
  '2.修改方法：',
  '1）semantic-release 提升 package.json 版本并发布',
  '2）同步 README 与开发日志的版本标记',
  '3）生成 CHANGELOG 并一并提交',
].join('\n');

export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { parserOpts, releaseRules }],
    ['@semantic-release/release-notes-generator', { parserOpts }],
    '@semantic-release/changelog',
    // 本地插件：把新版本写进 README 与开发日志；顺序在 npm 之前，失败即整体中止。
    './release-sync-docs.mjs',
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'README.md', '.agents/notes/dev-log.md'],
        message: commitMessage,
      },
    ],
    // 不用 @semantic-release/github：主库在 CNB，GitHub 只是镜像，发布到镜像会与 tag 错位。
  ],
};
