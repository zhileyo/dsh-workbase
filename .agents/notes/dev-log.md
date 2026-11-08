# 开发日志

开发侧的唯一记录：**上半是当前状态**（实现、限制、证据、验证方式、版本与安装），**下半是按日期倒序的过程记录**。写什么、不写什么与四段式格式见 [AGENTS.md](../../AGENTS.md)。需求见 [PRD](../../docs/PRD.md)，视觉规则见 [UI 规范](../../docs/UI-DESIGN.md) 与 [HTML 原型](../../docs/ui/ui-directions.html)。

## 当前状态

更新日期：2026-11-07。当前源码与本地包为 `0.2.38`；Windows desktop profile 已安装 `0.2.38`，macOS 正式 desktop 仍为 `0.2.5`。Harness／SDK `0.2.2-rc.1`。

### 仍在约束当前实现的结论

0.2.4–0.2.38 的逐版本过程（皮肤对抗、间距多轮迭代、`margin-left:auto` 误诊、圆角令牌取证等已结案）不在本文重复，历史见 `git log`。下面只保留**仍然约束当前实现**的结论：

| 约束 | 结论 |
| --- | --- |
| 首页间距 | 三段章节缝隙 clamp：顶部与页尾 `clamp(48px,6vh,72px)`、hero→统计卡 `clamp(44px,5vh,64px)`、统计卡→项目总览 `clamp(56px,7vh,88px)`；hero 内部（输入框→最近会话）固定 `28px`；`@container workbase (max-width:750px)` 回落固定 `32/40/44/20`。节奏规则「章节分隔 > 区块内缝隙」（`statsToToolbar > composerToStats`）由 `docs/verify-header-motion.mjs` 守护 |
| 待办排序 | 待处理按最近更新倒序、已完成按完成时间倒序（`src/client/Detail.tsx` 分组排序） |
| 输入框圆角 | 插件保持 28/27；宿主官方 composer 为 `--dsw-radius-md` = 12px，两个参照物尚未统一，属待决项 |
| 样式来源 | `docs/ui/ui-directions.html` 是唯一来源，`src/client/prototype.css` 与 `prototype-icons.ts` 由 `sync-ui.mjs` 生成，不要手改 |
| 响应式断点 | 插件活在宿主侧栏里，断点按「面板宽度」判断：原型里的宽度 `@media` 由 `sync-ui.mjs` 的 `adaptBreakpoints()` 转成 `@container workbase` 的 max-width／min-width 条件；`pointer`/`hover`/`prefers-reduced-motion` 仍留 `@media`，出现两者组合时写成 `@media` 套容器查询，不要合并成容器查询的额外条件 |
| 存储标识 | DSH Workbase / `dsh-workbase` / `dsh_workbase` / `dsh-workbase-ui-v2`；旧标识只出现在启动迁移代码中，存储格式仍为版本 1 |

### 当前实现

| 模块 | 已接入行为 |
| --- | --- |
| 项目 | 汇总宿主工作区、已有目录注册、新目录创建、重复检测、重命名、移除与身份恢复 |
| 个人整理 | 宫格／列表、各自七字段显隐、项目／会话置顶与收藏、互斥范围标签、持久化偏好 |
| 会话 | 原会话导航、新建、重命名、归档及恢复、真实模式和模型目录 |
| 待办 | CRUD、备注、两态、完成时间、删除确认、状态撤销、版本冲突检查 |
| Agent | 三工具、执行身份、当前项目限制、状态权限、并发串行提交 |
| 搜索 | 项目名称／目录、会话标题、待办标题／备注；宿主正文接口与部分失败提示 |
| 首页 | 四模块配置、最近会话 5 张卡片／3 个按钮、统计强制按钮、统计明细 |
| 详情 | 65:35 默认分栏、保存比例、列表／整体卡片、窄屏页签、互斥分组与位置恢复 |
| 设置 | 四分类抽屉、根目录、项目权限、主题即时预览／取消／保存事务 |
| 主题 | 跟随 DSH、DSH 默认、清爽、温暖阅读、紫晶工作台；明暗跟随宿主 |

业务数据与设置由宿主持久化，草稿和滚动由浏览器保存。产品显示、加载名、存储域与浏览器标识已统一为 DSH Workbase／`dsh-workbase`／`dsh_workbase`／`dsh-workbase-ui-v2`（0.2.11）；存储域和浏览器键的一次性迁移在启动时执行，旧标识仅存于迁移代码，旧文件保留作回滚备份。存储格式仍使用版本 1，补充字段通过默认值兼容，不替换旧记录为空数据。

宿主订阅、窗口聚焦及可见状态下每 15 秒刷新同步数据；失败保留成功快照。项目移除不删除保留的待办和设置，外部绑定身份变化要求明确恢复选择。

### 限制与未完成验收

| 项目 | 当前边界 |
| --- | --- |
| 项目归档／恢复 | 0.2.14 起由插件实现（`binding.archived`）：归档后业务只读、会话锁定状态、个人标记可改、可恢复；宿主原生归档接口仍缺失，宿主自身的归档视图不感知该状态 |
| 修改绑定目录、迁移及 72 小时撤销 | 缺少安全宿主接口，尚无真实迁移记录；需求保留 |
| 会话永久删除 | 无公开删除接口，不使用私有 detach 或自行删除转录 |
| 正文搜索 | 默认索引 `openAt: never` 不可用，需显式启用 `first-search` 或 `startup` 并重启；插件不自动修改 |
| 全文命中与定位 | 当前最多返回 20 条，不支持消息精确定位和命中次数；真实正文命中尚待验收 |
| 实际模型发送 | 已验证配置目录、提交合同及失败重试；尚未通过真实模型调用验收 |
| 桌面 profile | macOS 正式 desktop 为 0.2.5（0.2.5 已验收工作台读取、展开／收起顶栏、工作台返回入口及设置打开／关闭）；Windows desktop profile 已安装 0.2.38（欢迎页认证 Cookie 堆积问题已于 0.2.28 清理），工作树真实链路等交互验收继续进行；原生目录选择和统计完整持久化流程仍需逐项验收 |
| 紫晶视觉 | 令牌同步、持久化与数值对比度已测；未新增真实宿主截图验收 |
| 完整体验 | 低高度、软键盘、缩放、跨平台字体和快速操作仍需实际运行复验 |

原型中的模拟功能不作为真实功能通过证据，不将受阻项标为全部 PRD 已完成。

### 保留的验收证据

- [逐模块视觉对照](../../docs/ui/verification/index.html)：DSH／清爽／温暖阅读的明暗外观，首页、项目、详情、搜索、设置、统计、菜单与操作弹窗。包括不同宽度及控件悬停／键盘焦点。
- `docs/ui/verification/checks.json`、`geometry.json`、`details.json`：同数据布局与计算样式对照。主要尺寸／位置容差 2px，不等同于整张图片逐像素差异为零。
- 宿主功能记录覆盖待办创建／完成／搜索定位、重启恢复、项目和已完成任务恢复、模式与模型读取。正文接口成功返回空结果，仅证明接口可用，不证明真实正文命中。

这些是对应版本和范围的已有证据；文档清理没有重新执行浏览器、桌面或模型验收。自动测试的当前结果须以重新运行输出为准。

### 有意保留的东西（不要当作垃圾清理）

| 内容 | 为什么留着 |
| --- | --- |
| 源码、`test/`、`build.mjs`／`sync-ui.mjs`／`release.config.mjs`／`release-sync-docs.mjs` | 交付物本体与生成链 |
| [HTML 原型](../../docs/ui/ui-directions.html) 与两个生成物 | 唯一视觉真源；生成物改了会被下一次构建覆盖 |
| `docs/isolated-search.patch.yml` | 隔离环境的正文搜索补丁，「验证方式」要用 |
| [视觉报告](../../docs/ui/verification/index.html) 及其引用的截图矩阵（`details.json`、`details-before.json`、`checks.json`、`geometry.json`、`header-motion-checks.json`、`current-contrast-evidence.json`、`navigation-settings-026.webp`、`host-stats-*.webp`） | 已被当前报告引用的有效证据；目录本身被 git 忽略，删了不在仓库历史里 |
| `dsh-workbase-0.2.38.tgz` 与 `.sha256` | 已安装版本的校验依据；历史包不再归档 |
| `.agents/notes/`（本文件） | 随仓库提交；`.gitignore` 只忽略 `.agents/worktrees/` |

### 验证方式

项目根目录：

```sh
npm ci
npm test
npm run typecheck
npm run build
```

原型隔离检查：

```sh
node docs/ui/pin-favorite-check.cjs
node docs/ui/design-fix-check.cjs
node docs/ui/design-color-check.cjs
```

视觉工具 `docs/verify-ui.mjs`、`docs/verify-host-ui.mjs` 和 `docs/verify-host-details.mjs` 仍为本地验收工具；当前依赖 `/tmp/dsh-ui-visual-checks/node_modules/playwright/index.mjs`、本机 Chrome 及对应预览／隔离宿主服务，不能在未准备环境时直接视为通用 CI 命令。`verify-header-motion.mjs` 支持 `DSH_UI_PLAYWRIGHT`（playwright 入口）与 `DSH_UI_CHROME`（浏览器可执行文件）环境变量覆盖，缺省保持 macOS 本地路径；2026-11-07 已在 Windows 11、Edge 156 下实际运行通过。注意 `node_modules` 含平台相关二进制（如 esbuild），跨 macOS／Windows 切换需重新 `npm ci`。`docs/verify-isolated-host.mjs` 用于该隔离环境的只读接口核对。截图统一写 WebP：Playwright 只能输出 PNG，故经 `docs/evidence-image.mjs` 落临时 PNG 再编码（`cwebp`／ImageMagick／Pillow 探测其一），`node docs/compress-evidence.mjs` 可把遗留 PNG 批量转 WebP 并改写报告引用。

正文搜索补丁为 `docs/isolated-search.patch.yml`，只用于隔离环境。`--patch` 是 launcher 参数，需配合显式 `--profile web`，不放在 `dsh web` 应用参数末尾：

```sh
DSH_HOME=/tmp/dsh-workbase-host-022rc1 DSH_TELEMETRY_MODE=DISABLED dsh --profile web --patch "$(pwd)/docs/isolated-search.patch.yml" --no-open --port 8791
```

该路径与端口是测试配置，需要本地准备并启动，不代表服务正在运行。测试不得使用正式配置冒充隔离环境。

### 安装与发布

当前版本 `0.2.38`：`dsh-workbase-0.2.38.tgz`（SHA-256 `be72911e253011056504bcc03d3438ce727385ad8f3ae0f4f261282762a86326`）与源码构建一致，已在 Windows desktop profile 安装（重启宿主后生效）；macOS 正式 desktop 仍为 `0.2.5`。仓库只保留当前版本的 tgz 与 `.sha256`，历史安装包不随源码归档。

版本号由 semantic-release 从提交 type 推断（`release.config.mjs` 的 `releaseRules`），一次发版依次做：算版本 → 生成 `CHANGELOG.md` → 由本地插件 `release-sync-docs.mjs` 改写本节（`README.md` 不参与，安装命令用 `<版本>` 占位）→ `npm publish` → 打 tag `v<版本>` → 提交这些文档改动。任一步失败即中止；文档标记未命中同样中止——文档版本与 registry 不一致比不发版更糟。

本地出包用 `npm pack`，跑前先 `npm run build`：`npm pack` 不触发构建，容易把上一次的 `dist`／`lib` 打进新版本。版本号不由手工指定。

npm 白名单仅含服务端入口、客户端产物、patch、README 与自动包含的 package.json；源码、测试、设计与验收证据不进入包。`publish:check` 为演练，`publish:beta` 执行实际 beta 发布。当前没有实际发布成功记录。

## 日志

### 2026-11-08 · README 安装命令改用 `<版本>` 占位，发版只改开发日志

**背景**：`release-sync-docs.mjs` 曾有一条 README 规则，只为改写本地安装示例里的 `dsh-workbase-0.2.38.tgz`。这个文件名对读者没有信息量（版本在 `package.json` 与 tag 里），却让每次发版都要动 README，多一处可能与 registry 不一致的版本字面量。

**决策**：README 的本地安装命令改为 `./dsh-workbase-<版本>.tgz`，前面补一行 `npm pack`，正文说明替换方式；同时删掉插件里的 README 规则，`prepare()` 只改写开发日志的当前状态。没有删掉整节本地安装说明：离线安装仍是验收与内网路径，`npm pack` 要先构建这个坑也要留。代价是命令不能原样复制，需要读者替换一次占位符——比每次发版都改一次文档划算。

**证据**：删除前规则正则 `/dsh-workbase-\d+\.\d+\.\d+\.tgz/g` 在 README 全文件只命中第 44 行；删除后剩余四条规则仍逐条抛错校验（`release-sync-docs.mjs` 的 `if (nextHead === head) throw`），`node --check release-sync-docs.mjs` 通过，`npm run typecheck` 与 `npm test` 见提交前的运行记录。

**遗留**：README「npm 安装」节仍写「当前没有 npm 发布成功记录」，0.3.0 发布后这句话会失效，而插件不再碰 README，必须手动改。等真正发布时连同安装建议一起更新。

### 2026-11-08 · 提交身份统一为 zhileyo，历史 SHA 全部重写

**背景**：仓库没有本地提交身份，一直沿用全局的 `AlwaysFyo <zhangxy.live@outlook.com>`；GitHub 账号是 `zhileyo`，提交页的作者链接与账号对不上，作者名也不一致。

**决策**：本仓库设 `user.name=zhileyo`、`user.email=zhangxy.live@outlook.com`（邮箱不变，提交仍归属同一账号）；已存在的 8 个提交连同注记标签 `v0.2.38` 一起重写作者与提交者，保留原树、提交信息与作者/提交者时间及时区。没有用 `git filter-branch`：沙箱下 `sh.exe` 建不了信号管道（`couldn't create signal pipe, Win32 error 5`），filter-branch 直接以退出码 1 中止；改用 `git commit-tree -F <消息文件>`，逐个提交重建，不需要 shell，也不需要 stdin。标签原先指向根提交，重写后重新指向重写后的根提交，tagger 同样改为 `zhileyo`。

**证据**：重写前后 `git diff 8f03033 6300996` 为空——树完全一致；逐提交比较 commit 对象中 `\n\n` 之后的消息体，8/8 一致；`git log --format='%an <%ae>'` 全部为 `zhileyo <zhangxy.live@outlook.com>`；`v0.2.38` 现指向 `eb931e3`，与 `git rev-list --max-parents=0 main` 相同，标签消息与旧标签逐字节一致。新 tip `6300996`（原 `8f03033`）。

**遗留**：所有既有 SHA 变了，CNB 只能 force push，GitHub 镜像由流水线覆写；任何本地克隆或分支需要重新 fetch 后 reset。GitHub 上旧提交页面的对象会保留一段时间，直到服务端 GC，属镜像侧不可控。

### 2026-11-08 · 补 MIT 许可证，README 不再复述发版流程

**背景**：仓库已经公开，但既没有 `LICENSE` 也没有 `license` 字段，README 结尾只写「当前尚未指定开源许可证」——别人无法合法复用。同时发版规则在 README、`AGENTS.md`、本文件三处各写一份，改一次提交类型表要同步三处，漂移只是时间问题。

**决策**：许可证取 MIT，与同组织 `dsh-overview` 保持一致，版权行 `Copyright (c) 2026 AlwaysFyo`；`LICENSE` 放仓库根，`package.json` 补 `"license": "MIT"`（npm 会自动把 `LICENSE` 打进包，不必改 `files` 白名单）。README 删掉整个「发布」章节：面向使用者的文档不再复述维护者流程，只在「开发」末尾留一句指向 `AGENTS.md`；许可证节改成一行指向 `LICENSE`。README 仍保留 `npm pack` 的「先构建」提示，那是使用者出本地包时会踩的坑，不属于内部发版规则。

**证据**：此前 `git ls-files` 无 `LICENSE`，`package.json` 无 `license` 字段（只有 `private: false`）；`dsh-overview` 的 `LICENSE` 为 MIT + `Copyright (c) 2026 AlwaysFyo`，直接对齐。删除的是 README 原 112-132 行（type 表、semantic-release 命令、`NPM_TOKEN` 说明、白名单说明），目录结构里 `release.config.mjs`／`release-sync-docs.mjs` 的说明保留。

**遗留**：真正的发版仍未发生——没有 npm 发布记录，GitHub 上只有 tag 没有 Release。若要让 GitHub 出 Release，需要在发版链上接 `@semantic-release/github`（或流水线里另建 release），镜像本身只搬 ref，不产出 Release。

### 2026-11-08 · 托管到 CNB，GitHub 由流水线镜像

**背景**：仓库此前只有本地历史，既没有远程也没有同步；需要放到 CNB 作为主库，并在 GitHub 留一份可读镜像。两个平台手工各推一次必然漂移，镜像只能由流水线在提交后自动完成。

**决策**：主库为 `zhileyo/dsh-workbase`（CNB，public），同名的 GitHub 仓库承接镜像。流水线照抄同组织 `dsh-overview` 的 `.cnb.yml` 结构：凭据来自密钥仓库 `${CNB_ROOT_SLUG}/secrets` 的 `GITHUB_USERNAME`／`GITHUB_TOKEN`，`align` 阶段先把本地 ref 与 CNB 对齐、删掉 GitHub 侧多余的 ref，再由 `tencentcom/git-sync` 推送——该插件没有 prune，只推不删会让镜像越积越脏。没有沿用 `dsh-fairy` 早期的模板：那版用 `filter-branch` 把 `.cnb.yml` 从 GitHub 历史摘掉，两边同一提交的 SHA 不同，就失去了「SHA 一致即镜像同步」这个判据。测试门禁取 `typecheck`／`test`／`build` 三关，与本地发版前自检一致；另加 `check-credentials` 阶段，把「fine-grained PAT 没把本仓库加入 Repository access」这类错误提前暴露成可读信息，而不是让 align 阶段报一个含糊的认证失败。

**证据**：`git -c http.sslBackend=openssl push https://cnb.cool/zhileyo/dsh-workbase.git refs/heads/main:refs/heads/main --tags` 推出 `main` 与 `v0.2.38`；随后 `gh api repos/zhileyo/dsh-workbase/branches` 得 `main`、`.../tags` 得 `v0.2.38`、`.../commits` 首条为 `5afc229`，与 CNB 的 HEAD 同一 SHA，证明 preflight → test → align → mirror 四个阶段都实际跑过。本机侧受沙箱限制：`npm test`（tsx）与 `npm run build`（esbuild）的子进程 spawn 均报 `EPERM`，只能断言 `npm run typecheck` 通过、`node -e "import('./sync-ui.mjs').then(m=>m.syncPrototypeUi())"` 生成物与提交版本无差异；完整三关由 CNB 流水线在 `node:24` 上执行，镜像成功即为通过证据。公开前的脱敏：`docs/ui/ui-directions.html` 的 9 处 `/Users/<user>` 改为 `/Users/example`（同一提交）。

**遗留**：`GITHUB_TOKEN` 若是 fine-grained PAT，Repository access 是按仓库授权的，**以后每建一个新仓库都要在 token 里加一次**，否则 `check-credentials` 会失败。CNB 仓库的 topics 还没设（`dsh-overview` 有 `dsh,dsh-plugin,deepseekruntime,dashboard`）。GitHub 侧是只读镜像，不要直接往镜像推提交或建分支——`align` 阶段会把 CNB 没有的 ref 删掉。本次提交 type 为「新增文件」，下次发版落到 `0.3.0`。

### 2026-11-07 · 接入 semantic-release 自动定版

**背景**：版本号一直靠手工拍，`release.mjs` 只负责把人工决定写进文件。问到「发布脚本能不能自己判断该发哪类版本」后，先否掉了 git 历史推断（仓库刚重建，只有 1 条提交，没有素材）与提交 type 直映射（type 记的是变更种类，不是影响级别），最后定为语义化提交 + semantic-release。

**决策**：`.agents/rules/git-commit-message.md` 增加「版本号」列，把 type 落成 major／minor／patch／不发版四档；`release.config.mjs` 用自定义 `headerPattern` 解析中文 type 与全角冒号（默认 `\w` 不匹配汉字，解析失败会静默不发版）。刻意不接 `@semantic-release/github`——主库在 CNB、GitHub 只是镜像，向镜像发布会让 tag 与发布错位。

**证据**：`headerPattern = /^([\u4e00-\u9fa5A-Za-z]+)(?:\(([^)]*)\))?[：:]\s*(.+)$/`；8 条用例（含带 scope、半角冒号、两个不发版档位）经真实 `analyzeCommits` 全部符合预期，当前唯一提交解析为 `null`；`npm test` 70 项通过，`lib/client.js` 566,004 字符、两次构建哈希一致。`release-sync-docs.mjs` 初版有两个缺陷——会改写历史条目、规则不可重入——改为按 `\n## 日志` 分界只写现状段、哈希规则同时匹配两种形态、任一规则未命中即抛错；0.3.0 → 0.3.1 连跑两次成功，历史段逐字节未变。

**后续修正**：type 表最终定为七个四字 type，并去掉「破坏变更」、加入「代码重构」。理由：这个仓库还没发布，破坏性改动与加能力都落在 0.x 的 minor 轴上，拆两个 type 只会让归类变成判断题；而每次重构都要在 type 里说明「行为等价」，反而是更有价值的约束。于是 `新增文件` 同时承担「加能力」与「改坏契约」（破坏性改动要在 body 首句写明不兼容），`代码重构` 映射为 major（0.x 期间这会直接把版本推到 1.0.0，是有意为之：重构被视为比加能力更重的动作）。改动位置：`release.config.mjs` 的 `releaseRules` 与注释、`.agents/rules/git-commit-message.md`（type 表、判定顺序、两处示例）、`AGENTS.md`（发版表、提交信息节的 type 列表）、`README.md`（发布表）。**type 名改了就必须同步已有提交，否则 analyzer 匹配不到、静默不发版**——原先那条标题会 amend 成 `新增文件：0.3.0 …`。复验：真实范围 `v0.2.38..HEAD` 仍为 `minor` → 0.3.0；`代码重构` 与旧五字 type 都解析成 `null`。顺带抓到一处真实漂移：早前演示 `npm version` 时把 `package.json` 留在了 `1.0.1-beta.0`，`git add -A` 把它带进了提交，已改回 `0.2.38`（发版算版本看 tag，不看这个字段，但它会对不上 README 与开发日志的三处标记）。

**再修正（宿主对接归入代码重构）**：用户要求「修复与宿主的对接问题，也归为代码重构」。理由：这类问题的根因在插件与宿主的接线，不是插件自己的业务逻辑——`entry.tsx` 的 slots 注入与页面记忆、`host.ts` 的能力探测与降级、`index.ts` 向宿主注册存储域／RPC／HTTP／工具、`cordis.patch.yml` 与 peer 依赖；按 `问题修复`（patch）算会让「宿主侧不兼容」被静默升级。分界写进规则：**接线层归 `代码重构`（major），插件自己的渲染／排序／交互仍归 `问题修复`（patch）**。改动位置：`.agents/rules/git-commit-message.md` 的 type 表场景列与判定顺序（新增一段分界说明）、`AGENTS.md` 发版表下的一段说明。

**再修正之二（破坏性改动也归入代码重构）**：用户要求「破坏性改动算到代码重构」。此前破坏性改动挂在 `新增文件`（minor）上，理由是 0.x 期 minor 即破坏轴、拆两个 type 只是增加判断题；但既然 `代码重构` 已是 major，破坏性改动放 major 才符合 semver 本义——**major 意味着契约变了**。于是 `新增文件` 收窄为「只加能力，不动既有契约」，`代码重构` 扩为「结构大改／宿主接线修复／破坏性契约变更」三类，判定顺序也随之改成三问：先问契约改坏没有（→ 代码重构），再问加能力没有（→ 新增文件），再问是否只动结构或只在修接线（→ 代码重构）。连带后果：0.x 期间破坏性提交会直接从 0.3 跳到 1.0.0，中间小版本不再出现，这条写进规则文件并注明「不想这样就把 `代码重构` 的 `release` 改成 `minor`」。改动位置：`.agents/rules/git-commit-message.md`（type 表两行、判定顺序、0.x 段落）、`AGENTS.md`（发版表与三类说明）、`README.md`（发布表两行）、`release.config.mjs`（两处注释，`releaseRules` 数值未变）。

**遗留**：CNB 仓库、GitHub 同步与 npm 凭据都还没接通。仓库 0 个 tag，semantic-release 会把首个版本定成 `1.0.0`（`lib/get-next-version.js` 的 `FIRST_RELEASE`），所以先给当前提交打了 `v0.2.38` 基线 tag。`release.mjs` 同日决定删除，出包改走 `npm pack`。

### 2026-11-07 · 重建 Git 仓库

**背景**：旧 `.git` 只有一天的 41 条提交（`963614a` 基线 0.2.7 → `9be1c3b` 0.2.38），没有远程、没有 tag、没有 stash；清理后的工作区才是要长期保留的起点，中间态与「已删文件还能取回」的能力不再需要。

**决策**：删掉 `.git` 重开仓库，不做备份（用户选择）。同时删除外部工作树 `C:/Users/example/WorkBuddy/Worktrees/dsh-workbase/main-cde2b588`（HEAD `cab8785`，里面有 2 个未跟踪目录 `.workbuddy/`、`_build/`，均为工具产物）。提交信息规范改以 `.agents/rules/git-commit-message.md` 为准（type + 原因分析／修改方法），`AGENTS.md` 的「提交信息」节同批改写并加了「版本号写进 subject」的本仓库约定。

**证据**：重建前 `.git` 4.15 MB／41 提交／分支 `main`、`dsh-62f78e5e-779b`、`workbuddy/main-cde2b588`；16 个已跟踪但工作区已删的文件（`docs/README.md`、`docs/plugin-development-status.md`、`docs/sensitive-information-check.md`、`docs/reference-dsh-kanban.md`、`docs/cleanup-20261106.md`、`web-preview.html`、`designs/` 三份、`docs/ui/` 两份、5 张品牌图）在删除后不再有历史副本。重建后 `git init -b main` + 72 个文件入库；`git check-ignore -v` 确认 `node_modules/`、`dist/`、`lib/`、`*.tgz`、`docs/ui/verification/`、`.agents/worktrees/` 均按 `.gitignore` 对应行忽略，而 `.agents/notes/dev-log.md`、`AGENTS.md`、`release.mjs`、`test/prototype-css.test.ts`、`src/client/prototype.css` 正常入库。

**遗留**：仓库没有远程也没有 tag，历史从这次重建开始；`.agents/rules/git-commit-message.md` 的 type 表来自另一个（笔记类）仓库，其中「400_模板中心／300_Scripts」等场景与本仓库无关，只取格式部分使用。

### 2026-11-07 · 发布内容检查并入 AGENTS.md

**背景**：`docs/sensitive-information-check.md`（2,036 B，三节：npm 包范围／源码仓库与整目录分享／发布前复查）在清理时被单独留下，但它的读者是维护者与代理，不是装插件的人；而根 `README.md` 会随 npm 包分发，把「查私钥、邮箱、内部域名、本机路径」写进包内说明既跑题也把内部流程公开。

**决策**：并入 `AGENTS.md`，不并 README。理由是读者匹配（全是动手前要守的边界）、分发边界（README 随包发布）、以及 `AGENTS.md` 已有三个落点：硬性约束里的白名单、发版节、完成前自检。落地为硬性约束补一条、新增「发布边界与复查」一节（白名单／`.gitignore` 的作用范围／整目录分享前复查／发版前命令）、自检补第 7 条。原文件删除。

**证据**：合并时修掉三处过期事实——原文称「当前工程目录没有 `.git`」（实测 `.git` 存在，`git status`、`git log` 均可用）、提到已不存在的 `workbase-demo`、发版命令硬编码 `dsh-workbase-0.2.2.tgz`（当前包为 `0.2.38`，且包名由 `release.mjs` 产出，照抄会对不存在的文件执行 `tar -tzf`）。`AGENTS.md` 138 → 157 行。

**遗留**：`docs/` 只剩需求（PRD）、UI 规范、原型与验收脚本；发布边界的唯一出处是 `AGENTS.md`，与 README 的「发布」节靠一句白名单结论互相对应，未来改白名单要同时改这两处。

### 2026-11-07 · 清理记录并入本文件

**背景**：`docs/cleanup-20261106.md`（2,999 B）与 `docs/cleanup-20261107.md`（14,244 B）记的都是「删了什么、为什么」，读者与开发日志是同一批人；其中 20261107 从未提交过，只有工作区一份。

**决策**：判定原则与体量并入本条，两份清理文档删除；逐文件清单不再保留，需要查某个具体文件时看 `git log`（已跟踪的能查到删除提交）。`docs/sensitive-information-check.md` 当时保留——它讲的是 npm 包里该有什么，不属于清理记录，当天稍后并入 `AGENTS.md` 的「发布边界与复查」。清理**不保留恢复区**：`.trash/` 本身已被删除，回滚只能靠 git，未跟踪文件没有历史。

**证据**：三轮合计第一轮 ≈120.4 MB——`.trash` 41.15、`.screenshots` 38.04、`.trae-html-share-packages` 31.71、28 个旧安装包 5.54、会话工作树 3.83、空目录与 `.DS_Store` 8 KB——另删 22 个历史文件 1,376.6 KB 与根目录 5 张品牌探索图 169.8 KB。分档原则是「会话垃圾／可重建产物／证据／旧样式」，证据按「是否被当前报告引用、是否属于旧版本」逐个判定，可重建的两份宿主证据（`host-details.json`、`host-checks.json`）不作为定稿保留；样式只剪原型评审外壳，`:scope.c` 与 `!important` 不动；当前版本只留 `0.2.38` 的包与哈希。

**遗留**：`docs/` 不再有清理记录文件。未跟踪文件（如当时的 20261107 记录）删掉即消失，这也是本条存在的理由——结论留在被跟踪的日志里，明细交给 `git log`。

### 2026-11-07 · 开发状态并入本文件

**背景**：`docs/plugin-development-status.md` 与本文都在记“开发侧的事实”，一个讲当前状态、一个讲过程，读的人要在两份文件间跳。

**决策**：并入本文上半「当前状态」，`docs/` 只留需求（PRD）、视觉规则（UI-DESIGN）、原型与验收脚本。版本号与哈希仍由 `release.mjs` 自动改写，规则路径同步改到本文件。

**证据**：合并前 `docs/plugin-development-status.md` 9,320 B / 99 行；`release.mjs` 的 `docRules` 三条规则与两处提示文案改指 `.agents/notes/dev-log.md`；`README.md`、`AGENTS.md`、`docs/PRD.md`、`docs/UI-DESIGN.md`、`docs/sensitive-information-check.md`（该文件随后并入 `AGENTS.md`）、`docs/ui/UI-EXPLORATION.md` 共 9 处链接同步。

**遗留**：`.agents/` 惯常被当作代理工具目录，当前状态放在这里对人不如图档显眼的 `docs/` 直观；若以后要对外开放，需再搬回 `docs/`。

### 2026-11-07 · 开发日志迁入 `.agents/notes/`

**背景**：决策依据只散在提交信息里，读代码的人看不到“为什么不这样改”。

**决策**：日志放 `.agents/notes/dev-log.md`，随仓库提交；`.gitignore` 由忽略整个 `.agents/` 改为只忽略 `.agents/worktrees/`。不把日志并进 `docs/`——`docs/` 是交付物（需求、UI 基线、验收状态），日志是过程记录，两类东西的更新节奏不同。

**证据**：`.gitignore` 第 35 行原为 `.agents/`；`git check-ignore -v .agents/notes/dev-log.md` 曾命中该规则。

**遗留**：历史条目只回溯到本次清理，更早的决策仍在 `git log` 与本文「仍在约束当前实现的结论」表里。

### 2026-11-07 · 删除文档入口与输入卡参考目录

**背景**：`docs/README.md`（10 行文档表 + 版本行）与根 `README.md` 职责交叉；`designs/composer-reference/` 只剩一个 v3 参考稿。

**决策**：两者都删。内容并不重复（根 README 是使用者视角并随包分发，`docs/README.md` 是文件级用途映射），但维护成本是两份版本行；删掉后由根 README 列举三份核心文档 + 本仓库 `AGENTS.md` 的目录表承担导航。

**证据**：`docs/README.md` 1,249 B、`docs/reference-dsh-kanban.md` 3,564 B、`designs/.../composer-reference v3.html` 10,014 B；删除前全仓 grep 引用分别只有 `release.mjs` 的文档规则、`docs/PRD.md:166`、cleanup 记录本身。连带修 5 处引用后，`node --check release.mjs` 通过、`node release.mjs patch --dry-run` 不再报“未命中”、全仓 md 本地链接 0 处缺失。

**遗留**：`docs/` 现在没有索引文件；若文档数量继续增长，需要在根 README 或 AGENTS.md 里重新组织导航。

### 2026-11-07 · 建立 AGENTS.md

**背景**：仓库没有任何代理约定文件，新代理容易手改生成物、把 `!important` 当垃圾清掉、或用视口查询写响应式。

**决策**：只写“会踩坑的约束 + 可执行的命令”，不复述 README；数字全部现测。

**证据**：121 行。核对项：17 个测试文件、`ui-directions.html` 里 699 处 `.app`、7 处待前缀关键帧、`styles.css` 145 个规则块中 32 个用 `!important`（144 次）、npm `files` 白名单 4 项、`dsh_workbase` + `dsh_workbench` 双域、`chosenTheme === 'warm' ? 'c' : 'a'`。

**遗留**：初稿把 `!important` 写成“33 处”（早前笔记的数），实测两种口径分别为 32 条规则／144 次出现，已改。

### 2026-11-07 · `release.mjs`：发版链路脚本化

**背景**：版本号手改、`npm pack` 不触发 `prepublishOnly`、文档里的版本与哈希靠人记，实测出现过 0.2.34 版本号被并行会话占用的撞车。

**决策**：一个脚本管到 tgz + 哈希 + 文档同步，但不碰 `git commit`／`npm publish`——发布仍需人工确认 registry 与渠道。文档改写改为“先在内存算完、全部校验通过再统一写”，避免半途失败留下自相矛盾的文档。

**证据**：`release.mjs` 118 行；`patch` → 0.2.39（208.6 KB／5 文件）、显式 `0.2.40` 均成功；故意破坏版本标记后脚本报“未命中”且零写入。期间修掉自身两个 bug：文档部分写入不回滚、Windows `spawnSync(..., {shell:true})` 的 `DEP0190` 警告。

**遗留**：`prepack` 钩子（`npm run typecheck && npm test`）尚未加，手工 `npm pack` 仍可能打入上一次产物。

### 2026-11-07 · 断点转换的两处漏洞

**背景**：查“能不能直接手维护 `prototype.css`”时顺手验证转换器，发现它是**有损**的。

**决策**：保留生成器（原型同时是验收基线，手维护会让“设计稿 vs 实际组件”退化为“实现 vs 另一份拷贝”），改转换器：新增 `splitWidthCondition()` / `adaptBreakpoints()`，宽度条件转容器查询、其余条件留在 `@media` 外层。

**证据**：两处漏洞为 `@media(min-width:601px)` 漏转（旧正则只认 `max-width`）、`@media(max-width:420px) and (pointer:coarse)` 被塞进容器查询导致条件恒假（触屏窄屏 44px 点按目标失效）。修复后 `prototype.css` 105,718 → 105,736 字符、`@container workbase` 45 → 46、宽度型 `@media` 残留 0、`lib/client.js` 566,004 字符、70 项测试通过；`test/prototype-css.test.ts` 增加不变量断言。

**遗留**：未做浏览器视觉回归——本机 `node_modules` 无 playwright，验收脚本依赖 `/tmp/dsh-ui-visual-checks/` 与 macOS Chrome 路径。

### 2026-11-07 · 证据库 PNG → WebP

**背景**：`docs/ui/verification/` 里 153 张 PNG 占 14.7 MB，且每次 `verify-ui.mjs` 重跑都会重新产出。

**决策**：统一转 WebP（`quality: 82`），并把生成链一起改（`docs/evidence-image.mjs` 的 `screenshotWebp()`、`docs/compress-evidence.mjs` 批量转换），否则重跑一次又回到 PNG。

**证据**：14.70 MB → 4.04 MB（−72.5%），目录 21.35 MB → 10.19 MB，152 处报告引用改 `.webp`，逐张解码验证通过；有损压缩不影响证据效力——几何走 `getBoundingClientRect`、颜色走 `getComputedStyle`，没有一处从像素取数。编码器探测顺序 `cwebp` → `magick` → `python`（本机只有 Pillow 带 WebP；注意 `C:\Windows\system32\convert.exe` 是磁盘转换工具，不是 ImageMagick）。

**遗留**：转换脚本仅在本机 Python/Pillow 路径下验证过，CI 或其他机器需要 `cwebp`。

### 2026-11-07 · 第一轮清理：废弃产物、文档腐化、死样式

**背景**：仓库里堆着会话垃圾、29 个历史 tgz、72 个类名的原型专用死样式。

**决策**：按“会话垃圾 / 可重建产物 / 证据 / 旧样式”分档，只删前两类中确证无引用的部分；证据按“是否被当前报告引用、是否属于旧版本”逐个判定。样式只剪**原型评审外壳**（`:scope.b`、`.review*` 等），不碰 `!important` 与 `:scope.c`。

**证据**：清理 ≈120.4 MB（`.trash` 41.15、`.screenshots` 38.04、`.trae-html-share-packages` 31.71、旧 tgz 5.54、worktree 3.83）+ 22 个历史文件 1,376.6 KB；`prototype.css` 110,206 → 105,718 字符（−4,488 B，行级估算的 11.3 KB 系高估，死选择器常与活选择器同行）。

**遗留**：`prototype.css` 仍有 62 个类名在 `src` 中无字面引用，但 `state-${state(p)}`、`wb-recent-${recentStyle}` 等是动态拼接，逐个核实的成本高于收益，暂不处理。
