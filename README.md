# DSH Workbase · 工作台

DeepSeek Harness 的工作台插件，集中管理项目、会话和待办，并支持 Agent 在当前项目中创建和更新任务。

## 功能

- **项目管理**：宫格与列表视图、添加目录、新建项目、重命名、移除、置顶、收藏，以及归档与恢复；归档项目变为只读，随时可以恢复。
- **会话管理**：查看最近会话、按项目浏览、重命名、归档、置顶及收藏；选择 Agent 模式和模型发起会话。
- **待办管理**：创建、编辑、备注、完成、重新打开、删除确认及撤销。
- **分支与工作树**：输入卡下方显示当前分支；宿主启用 `experimental-forge-bundle` 时可指定基准分支并在新工作树中发起，非 Git 项目自动降级为普通发起。
- **全局搜索**：搜索项目、会话标题与正文、待办标题与备注，并跳转到对应内容。
- **工作台设置**：首页模块、主题、项目根目录、Agent 权限及布局偏好；通用设置支持侧边栏名称（默认「项目概览」）、侧边栏入口和会话 Header 工作台按钮显隐。
- **配色主题**：跟随 DSH、DSH 默认、清爽、温暖阅读和紫晶工作台；明暗外观跟随宿主，主题支持即时预览与保存。
- **响应式布局**：双栏列表或整体卡片，窄屏切换会话与待办页签；断点按面板宽度计算，不依赖浏览器视口。

项目、待办和设置由宿主持久化；未提交草稿及滚动位置保存在当前浏览器。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| DeepSeek Harness | 当前适配 `0.2.2-rc.1` |
| Cordis | `~4.1.0` |
| Node.js | 本地开发使用 22 或以上版本 |
| 运行环境 | Web；桌面 profile 验收进行中，已安装版本与验收范围见[开发日志](.agents/notes/dev-log.md) |

## 安装

### 本地安装包

```sh
dsh plugin --profile web add ./dsh-workbase-0.2.38.tgz
dsh web
```

### npm 安装

当前没有 npm 发布成功记录。发布预览版后，可执行：

```sh
dsh plugin --profile web add dsh-workbase@beta
dsh web
```

桌面端需将 `web` 替换为实际运行的 profile。

## Agent 工具

| 工具 | 功能 |
| --- | --- |
| `workbase_list_todos` | 查看当前项目待办 |
| `workbase_create_todo` | 创建待办 |
| `workbase_update_todo` | 更新待办内容或完成状态 |

Agent 只能操作所属会话的当前项目，不能删除待办；状态修改受项目权限设置控制。

## 已知限制

- 项目归档由插件自行记录：归档后业务只读、可恢复，但宿主原生归档接口缺失，宿主自己的归档视图不感知这个状态。
- 修改绑定目录、跨目录迁移及 72 小时撤销缺少安全的宿主接口，暂无真实迁移记录；会话永久删除同样没有公开接口。
- 会话正文搜索要求宿主索引 `openAt` 为 `first-search` 或 `startup`；默认 `never` 时正文搜索不可用。插件不会自动修改宿主配置。
- 正文搜索最多返回 20 条结果，不支持消息精确定位或命中次数统计。
- 真实模型发送、真实正文命中，以及桌面环境的低高度、软键盘、缩放与跨平台字体仍待完整验收。

## 开发

在源码项目根目录执行：

```sh
npm ci
npm test          # node:test：存储、RPC、HTTP、Agent 工具、视图渲染、主题与样式生成
npm run typecheck
npm run build
```

改动源码后需重新构建并重启宿主。服务端入口 `src/server/index.ts` 产出 `dist/index.js`，客户端入口 `src/client/entry.tsx` 产出 `lib/client.js`（样式以文本形式打进客户端产物）。

出本地安装包用 `npm pack`，但**先 `npm run build`**——`npm pack` 不会触发构建，可能把上一次的 `dist`／`lib` 打进包。正式发版见「发布」。

本地链接安装：

```sh
dsh plugin --profile web add "$(pwd)"
dsh web
```

### 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/server/` | 插件入口、存储域（含旧标识迁移）、业务服务、宿主能力适配、RPC 与 Agent 工具 |
| `src/client/` | React 视图（首页／详情／搜索／设置）、输入卡与分支条、主题、`api` 与启动逻辑 |
| `src/shared/` | 前后端共享的 zod 模型、RPC 频道名、会话类型 |
| `src/client/prototype.css`<br>`src/client/prototype-icons.ts` | 由 `sync-ui.mjs` 从 `docs/ui/ui-directions.html` 生成，改样式要改原型而非这两个文件 |
| `test/` | `node:test` 测试，`npm test` 全量执行 |
| `docs/` | 需求、UI 基线、验收证据与验收脚本；不进入 npm 包 |
| `release.config.mjs`、`release-sync-docs.mjs`、`build.mjs`、`sync-ui.mjs` | 发版配置与文档同步、构建、原型样式与图标的同步生成 |

## 发布

版本号由提交类型推断，不手工改：

| 提交类型 | 版本号 |
| --- | --- |
| 新增文件 | minor（含破坏性改动：0.x 期间 minor 即破坏轴） |
| 问题修复、编译代码、文档修改 | patch |
| 样式修改、代码重构、其他提交 | 不发版 |

```sh
npx semantic-release --dry-run   # 演练：只算版本，不写文件、不发布
npx semantic-release             # 完整链路：CHANGELOG、文档版本、npm 发布、打 tag
```

映射规则在 `release.config.mjs`。中文提交类型需要自定义 `headerPattern`——改动提交类型名或冒号形式必须同步这里，否则解析不到类型会静默跳过发版。发布凭据通过 `NPM_TOKEN` 环境变量提供，不写入仓库。

需要出本地安装包时用 `npm pack`（记得先构建）。版本号不由手工指定，全部交给 semantic-release 从提交类型推断。

npm 包仅包含运行资源、宿主 patch、README 与 `package.json`；同一版本不可覆盖。发布前可用 `npm run publish:check` 演练。

## 许可证

当前尚未指定开源许可证。

## 项目文档

需求与视觉规则在 `docs/` 里，实现状态、验收证据与限制在 `.agents/notes/dev-log.md`（开发日志的上半部分）。两者都不随 npm 包分发：`docs/PRD.md`（需求）、`docs/UI-DESIGN.md`（视觉规则）、`docs/ui/ui-directions.html`（可交互原型）。
