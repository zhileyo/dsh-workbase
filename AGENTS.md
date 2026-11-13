# AGENTS.md

面向在本仓库工作的 AI 代理。人的安装与使用说明见 [README.md](README.md)；`docs/` 下是需求、UI 基线与验收脚本，实现状态与决策记录在 [`.agents/notes/dev-log.md`](.agents/notes/dev-log.md)。两者都不进入 npm 包。

## 项目是什么

DeepSeek Harness（DSH）的工作台插件：管理项目、会话与待办，并向宿主注册 Agent 工具（定义见 `src/server/tools.ts`）。单个 npm 包同时提供宿主服务端入口与浏览器客户端入口。

| 项 | 值 |
| --- | --- |
| 包名 / 版本 | `dsh-workbase`，版本以 `package.json` 为准（版本号即发布单元） |
| 技术栈 | TypeScript + React 18、esbuild、Cordis 插件、zod |
| 模块形态 | `type: "module"`；tsconfig 为 `strict` + `noUncheckedIndexedAccess` |
| 运行要求 | Node 22+（`build.mjs` 客户端 target `node22`／`es2022`）；`package.json` 未声明 `engines` |
| 宿主兼容 | `@deepseek-ai/cordis ~4.1.0`、DSH `0.2.2-rc.1` |

## 常用命令

```sh
npm ci                 # 安装依赖
npm run typecheck      # tsc --noEmit（src + test，无 lint 配置，别找 .eslintrc）
npm test               # tsx --test test/*.test.ts
npm run build          # node build.mjs：先同步原型资产，再打包两端
npx semantic-release --dry-run  # 看这次会发哪个版本（版本号由提交 type 推断，见「发版」）
```

改完源码必须重新 `npm run build` 并重启宿主才能看到效果——`dist/` 与 `lib/` 是被 git 忽略的构建产物。

## 构建链（理解这一点再动手）

```
docs/ui/ui-directions.html   ← 视觉单一真源（原型，同时是验收基线）
        │  sync-ui.mjs（build.mjs 第 4 行自动调用）
        ├→ src/client/prototype.css        生成物，已跟踪；包 @scope (.wb)
        └→ src/client/prototype-icons.ts   生成物，已跟踪
                │  build.mjs（esbuild）
                ├→ dist/index.js   服务端，ESM，external @deepseek-ai/*
                └→ lib/client.js   客户端，CJS，以 .css loader:text 内联样式后
                                   包进 window.__ModuleLoader__.load({id, factory})
```

`sync-ui.mjs` 做的是**语义改写**而不是格式搬运，四件事：

1. `.app` → `:scope`（约 700 处），让原型样式只在插件根内生效。
2. 宽度断点 `@media (max-width|min-width: Npx)` → `@container workbase <条件>`。纯宽度直接换；宽度 + 其他条件（如 `(pointer:coarse)`）嵌套为 `@media <其余>{@container workbase <宽度>{…}}`。**容器查询不支持 `pointer`／`hover`／`prefers-reduced-motion`，把这类特征塞进 `@container` 会让条件恒假、样式静默失效。**
3. 关键帧名加 `wb-` 前缀（`pulse`、`settings-slide-up`、`settings-mask-in`）。
4. `pruneRules` 剪掉原型专用死选择器：`:scope.b`、`.review`／`.review-tools`／`.review-label`／`.review-note`、`.design-intro`、`.directions`、`.chat-preview`。

## 硬性约束

- **官方宿主能力优先，自实现降级。** 官方插件提供的能力也属于宿主能力，Forge 是官方可选套件，可以优先使用其公开服务。宿主更新后按 [兼容维护流程](docs/HOST-COMPATIBILITY.md) 核对公开等价接口，确认契约再在适配层接线；使用时探测服务，不按版本号猜测，不引入第三方插件必需依赖。能力缺失或明确未生效的可降级失败才使用自实现；权限拒绝、取消、超时、未知状态及部分成功不能无条件降级。已有结果先复用或补齐持久化，禁止重复创建或删除。
- **Forge 按用户指定仅走官方原流程。** `dsh-experimental-forge-bundle` 启用并挂载 forgePanel 时显示分支与工作树，禁用时隐藏；工作树通过 `forgePanel.requestWorktree` 登记，首消息入队后由官方创建，不提供工作台自建降级。这是上一条通用降级规则的明确例外。

- **界面改动先读 [UI 规范第0节](docs/UI-DESIGN.md#0-共用一致性规则)。** 输入、选择器、按钮、弹窗、主题与焦点按用途复用现有组件和共享样式；同排控件等高，不自行新增字号、圆角或密度变体。共用规则只在该文档维护，调整时同步视觉真源及全部同类使用处，新增例外必须在同节说明场景与理由。`DirectoryInput`、`Picker`、`Menu`、`TodoToolbar`及宿主输入组件分别沿用已定义交互，不复制另一套控件。文档里的现行差异不代表全部视觉已验收，完成前核对最终样式与验收边界。
- **不要手改 `src/client/prototype.css` 或 `prototype-icons.ts`。** 每次构建都会重新生成，手改内容会被抹掉。改样式请改 `docs/ui/ui-directions.html`。
- **`:scope.c` 是活代码。** 它对应「温暖阅读」主题（`Workbase.tsx` 里 `chosenTheme === 'warm' ? 'c' : 'a'`），不在死选择器清单里；`:scope.b` 没有任何主题产出，已被剪除。
- **`src/client/styles.css` 是唯一手写样式**，只做宿主容器适配与必要覆盖。145 个规则块里有 32 个用了 `!important`（共 144 次），分两类，都不要「顺手清理」：
  - 抗外部皮肤插件（guizang-design、maid-atelier 会用同位选择器覆盖卡片与动作行）；
  - 抗内部基础层（`.composer-shell .composer-leading button` 归零左外边距——基础规则 `.composer-actions button{margin-left:auto}` 在 1100／850 两个容器断点内还有副本，删掉这一行不能等价替换）。
- **响应式一律按面板宽度**，不按浏览器视口。新增断点时写成容器查询，能力查询留在 `@media`。
- **改类名前先搜动态拼接。** 大量类名由模板字符串生成（`state-${state(p)}`、`wb-recent-${recentStyle}`、`wb-todo-${t.id}`），只做字面 grep 会把活代码误判为死代码。
- **不要在 `src/` 里随手加运行时依赖。** 客户端是单文件产物，体积变化记录在提交与文档中；引入新依赖前先确认必要性。
- **`docs/` 不进入 npm 包。** 包的 `files` 白名单只有 `dist/index.js`、`lib/client.js`、`cordis.patch.yml`、`README.md`（外加 npm 自动包含的 `package.json` 与 `LICENSE`）。
- **不发布源码映射，不等于源码保密。** 客户端产物是可读的 JavaScript，不要把秘密、内部域名或本机绝对路径写进 `src/`。

## 布局

| 路径 | 职责 |
| --- | --- |
| `src/server/index.ts` | 插件入口：注册存储域 `dsh_workbase`（含旧标识 `dsh_workbench` 迁移）、RPC、HTTP 与工具 |
| `src/server/service.ts` | 项目／会话／待办的业务规则 |
| `src/server/host.ts` | 宿主能力适配（能力探测与降级都集中在此） |
| `src/server/rpc.ts`、`http.ts`、`tools.ts` | RPC 分发、HTTP 端、Agent 工具定义 |
| `src/client/entry.tsx` | 客户端入口：注入宿主 slots 与页面记忆 |
| `src/client/Workbase.tsx` | 根组件与主题容器（`a`／`c` 两套作用域） |
| `src/client/{Home,Detail,Search,Settings}.tsx` | 四个视图 |
| `src/client/{Composer,BranchBar,DirectoryInput}.tsx` | 输入卡、分支条、目录输入 |
| `src/client/api.ts`、`launch.ts`、`theme.ts`、`ui.tsx` | 前端请求层、发起会话、主题令牌、图标集 |
| `src/shared/` | 前后端共享的 zod 模型、RPC 频道名、会话类型 |
| `test/` | `node:test` 用例，与实现一一对应（`*-render`、`rpc`、`store`、`theme`、`prototype-css` 等） |
| `docs/` | 需求、UI 基线与验收脚本 |
| `.agents/notes/` | 开发日志：当前状态 + 按日期的决策记录（随仓库提交） |
| `sync-ui.mjs`、`build.mjs` | 原型同步、构建 |
| `release.config.mjs`、`release-sync-docs.mjs` | 发版配置（中文 type 解析 + 版本级别映射）与发版时的文档版本同步 |
| `.github/workflows/release.yml` | GitHub Actions：push `main` 后跑 typecheck／test／build 门禁，交由 semantic-release 发版并建 Release |
| `.cnb.yml` | CNB 定时任务：每 10 分钟从 GitHub 拉取 `main` 与标签并强推对齐，不做构建 |

## 验收脚本与证据

- `docs/verify-ui.mjs` 生成 `docs/ui/verification/index.html` 与逐视口「设计稿 vs 实际组件」对照截图；证据目录被 git 忽略，不进仓库。
- 截图统一 WebP（`quality: 82`，编码器经 `docs/evidence-image.mjs` 探测 `cwebp`→`magick`→`python`）；批量转换用 `docs/compress-evidence.mjs`。几何走 `getBoundingClientRect`、颜色走 `getComputedStyle`，都不从像素取值，所以有损压缩不损证据效力。
- 已知环境问题：`verify-ui.mjs`、`verify-host-ui.mjs`、`verify-host-details.mjs` 硬编码 `/tmp/dsh-ui-visual-checks/...` 与 macOS 的 Chrome 路径；只有 `verify-header-motion.mjs` 支持 `DSH_UI_PLAYWRIGHT`／`DSH_UI_CHROME` 覆盖。仓库 `node_modules` 内没有 playwright，这些脚本默认跑不起来，改它们属于单独的任务。

## 测试与验证习惯

- 动了 `sync-ui.mjs` 或样式生成逻辑，除了跑测试，还要核对生成物本身：括号是否配平、宽度型 `@media` 是否残留 0、`@container workbase` 计数、`:scope.c` 是否仍在。
- 生成器是幂等的：连续两次 `npm run build`，`lib/client.js` 的 SHA-256 必须相同。这条是判断「有没有残留不确定输出」的最快办法。
- CSS 生成规则的不变量断言在 `test/prototype-css.test.ts`，新增转换规则时在同一文件补充断言。
- 声明「已验证」时区分层次：`tsc`／`npm test`／`npm run build` 是本机可断言的；浏览器视觉回归与真实宿主行为在没有 playwright 和真实 profile 的环境里属于**未验证**，要如实说明。

## 开发日志

[`.agents/notes/dev-log.md`](.agents/notes/dev-log.md) 是开发侧的唯一记录：上半「当前状态」（实现、限制、证据、验证方式、版本与安装），下半按日期倒序的过程记录。随仓库提交（`.gitignore` 只忽略 `.agents/worktrees/`）。**约定只写本节**，`notes/` 下不再放单独的说明文件——两处规则必然漂移。

- **写**：不可从代码直接读出的决策与理由（为什么选 A 不选 B）、排查过程有信息量的部分、验证只做到某一层的边界。
- **不写**，各自归属：版本变更清单 → `git log`（提交首行即版本号）；产品需求 → `docs/PRD.md`；当前实现状态与证据范围 → 本文件的「当前状态」上半部分（与按日期的条目分开写）；文件清理判据 → `git log` 与本文件同日的日志条目；截图与几何数据 → `docs/ui/verification/`（不入库）；待办 → Workbase 工具，不写进日志。
- **格式**：日志部分按日期倒序，标题行为 `### YYYY-MM-DD · 一句话标题`（在 `## 日志` 之下），每条四段；证据要能复现（命令、文件与行号、现测数字），否则不写。

```md
**背景**：为什么要动这次手。
**决策**：选了什么、放弃了什么、为什么。
**证据**：可复现的数字、命令、文件与行号。
**遗留**：没做的、已知风险、下一步。
```

## 发版

版本号由 **semantic-release 从提交 type 推断**，不再手工决定：

| 提交 type | 版本号 |
| --- | --- |
| 代码重构 | major（0.x 期间会直接升到 1.0.0） |
| 新增文件 | minor（只加能力，不动既有契约） |
| 问题修复／编译代码／文档修改 | patch |
| 样式修改／其他提交 | 不发版 |

「代码重构」收三类：结构大改（抽模块、合重复逻辑）、**与宿主的对接修复**（`entry.tsx` 的 slots 注入与页面记忆、`host.ts` 的能力探测与降级、`index.ts` 向宿主注册存储域／RPC／HTTP／工具、`cordis.patch.yml` 与 peer 依赖接线）、**破坏性契约变更**（删改 zod 字段、RPC 频道名、工具参数、存储域／键）。分界是「接线层归重构、插件自己的渲染与交互归问题修复」。

配置在 `release.config.mjs`：中文 type 需要自定义 `headerPattern`（默认的 `\w` 不匹配汉字）与 `releaseRules`；解析失败会静默降级成「不发版」，所以**改 type 名或分隔符必须同步这里**，见 `.agents/rules/git-commit-message.md`。

```sh
npx semantic-release --dry-run   # 本地预演：看这次会发哪个版本，不写文件、不发布
```

发版由 GitHub Actions 执行（`.github/workflows/release.yml`），不需要在本地跑 `semantic-release`：push `main` 后先跑 `npm ci`／`typecheck`／`test`／`build` 门禁，再依次做：算版本 → 生成 `CHANGELOG.md` → 由本地插件 `release-sync-docs.mjs` 改写开发日志的**当前状态**（README 不参与同步，历史条目不动）→ `npm publish` → 打 tag `v<版本>` → 提交这些文档改动并推回 GitHub → 由 `@semantic-release/github` 建 Release。发布凭据缺失时该步骤打印提示并跳过，门禁照常。

发布凭据二选一：仓库变量 `NPM_TRUSTED_PUBLISHING=true`（npm 可信发布，OIDC，带 provenance，推荐）或仓库 secret `NPM_TOKEN`（只用于首次自举）。`NPM_TOKEN` 必须是 **granular access token**（classic／Automation token 已于 2025-11 撤销）：勾 **Bypass two-factor authentication**、权限 **Read and write (publish and stage)**、范围限 `dsh-workbase`、设到期日；不勾 Bypass 2FA 时 CI 里的 `npm publish` 会卡在交互式 2FA。

首次发布要先自举：`npm trust` 要求包已存在于 registry，所以 0.3.0 用一次 `NPM_TOKEN` 发出去；随后在本地执行 `npm trust github --allow-publish ...`（交互 2FA，参数见 `npm trust github --help`），在仓库设变量 `NPM_TRUSTED_PUBLISHING=true`，再删掉 `NPM_TOKEN` secret。可信发布要求 npm CLI ≥ 11.5.1（workflow 里已 `npm install -g npm@latest`）与 `id-token: write`，且 npmjs 上登记的 workflow 文件名要与 `.github/workflows/release.yml` 逐字符一致。CNB 不在 npm 支持的 CI 名单（GitHub Actions／GitLab CI／CircleCI，自托管 runner 亦不支持）里，镜像侧无法发布；npm 已宣布 **2027-01** 起移除粒度 token 的直接发布能力，届时同样走可信发布。

CNB 侧不接收 GitHub 推送：仓库根的 `.cnb.yml` 每 10 分钟（crontab `*/10 * * * *`）跑一次，从 GitHub 拉取 `main` 与标签后强推对齐，手动触发用 CNB 界面上的 `web_trigger` 按钮。凭据用 CNB 内置的 `CNB_TOKEN`／`CNB_TOKEN_USER_NAME`，不需要在 GitHub 配 secret；因此镜像最多滞后一个周期。改动请提到 GitHub，不要在镜像侧直接推。

出包用 `npm pack`（先 `npm run build`）。此前的 `release.mjs` 已删除——它会改版本号，与 semantic-release 的推断重复。

注意：`npm pack` 本身**不触发** `prepublishOnly`，手工 pack 有可能把上一次的 `dist`／`lib` 打进新版本。

## 发布边界与复查

白名单之外的一切都不发布：源码映射、测试、设计文件、截图、临时录制与恢复归档。`.gitignore` 排除环境配置、私钥扩展、日志、构建产物、安装包、截图缓存与 `.agents/worktrees/`——它只作用于未跟踪文件，既不清历史，也不会让已跟踪内容消失。

整目录分享或公开仓库前要按**当前**文件重新复查，不能沿用旧结论：`docs/ui/ui-directions.html` 里仍保留本机路径形式的示例，设计稿与宿主截图也可能含环境信息，应替换成通用示例。

发版前的动作：

```sh
npm run typecheck && npm test && npm run build   # 先确认三关都过
npm run publish:check              # registry 侧演练，不上传
npm pack                           # 出 tarball 供检查（不触发构建，跑前先 build）
tar -tzf dsh-workbase-<版本>.tgz     # 用实际产出的文件名，别照抄旧版本号
```

核对白名单与版本，并确认 tarball 内没有凭据、私钥、邮箱、内部域名或本机绝对路径。任何扫描结论只对当次文件与方法有效，不能当作「以后也不会泄露」的保证。

## 提交信息

格式以 [`.agents/rules/git-commit-message.md`](.agents/rules/git-commit-message.md) 为准：`<type>：<subject>` 单行标题 + 「原因分析／修改方法」两段 body，子项用 `1）2）` 编号。type 取「新增文件／代码重构／文档修改／样式修改／问题修复／编译代码／其他提交」，混合变更按主体内容归类，无法归类用「其他提交」。

本仓库的补充约定：**版本号写进 subject**，便于和发版对齐（0.2.38 之前的提交是「版本号：说明」，已留在旧历史里，不再追溯）。

```text
问题修复：0.2.39 修复窄屏下统计卡溢出

1.原因分析：容器查询阈值是 750px，统计卡在该宽度下仍按三列排布
2.修改方法：
1）把统计卡断点下调到 720px
2）在 test/prototype-css.test.ts 补一条不变量断言
```

## 完成前自检

1. `npm run typecheck`、`npm test`、`npm run build` 全绿；改过生成逻辑则再构建一次比对哈希。
2. 手改的是真源（`docs/ui/ui-directions.html`、`src/**/*.ts(x)`、`styles.css`），不是生成物。
3. 若改过 `.agents/notes/dev-log.md`「当前状态」里的版本标记、tgz 名或哈希说明，确认 `release-sync-docs.mjs` 的正则仍能命中——未命中会让下次发版中止。README 的安装命令用 `<版本>` 占位，不随发版改写。
4. 新增或调整的能力写进 `.agents/notes/dev-log.md` 的「当前实现」与「仍在约束当前实现的结论」表，需求变化写进 `docs/PRD.md`。
5. 没有把 `docs/ui/verification/`、`*.tgz`、临时脚本带进提交。
6. 影响后续维护的决策、放弃的方案、尚未验证的边界，写进 `.agents/notes/dev-log.md`。
7. 涉及发布时：白名单与 tarball 内容按「发布边界与复查」重新核对，不引用上一次的扫描结论。
