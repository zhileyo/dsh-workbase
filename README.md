# DSH Workbase · 工作台

[![GitHub](https://img.shields.io/badge/GitHub-zhileyo%2Fdsh--workbase-181717?logo=github)](https://github.com/zhileyo/dsh-workbase)
[![CNB 镜像](https://img.shields.io/badge/CNB-zhileyo%2Fdsh--workbase-1f6feb)](https://cnb.cool/zhileyo/dsh-workbase)

DeepSeek Harness 的工作台插件，集中管理项目、会话和待办，支持 Agent 管理当前项目任务，并提供项目诊断、插件更新与加密备份恢复。

## 功能

| 功能 | 说明 |
| --- | --- |
| 项目管理 | 宫格与列表视图，支持新建、添加、重命名、置顶、收藏、归档与恢复。 |
| 会话管理 | 按项目浏览、预览正文、重命名、归档和删除会话。 |
| 快捷输入 | 选择 Agent 模式与模型，支持附件、引用、图文粘贴和草稿保留；启用 Harness 官方语音输入套件后可录音转写到草稿。 |
| 待办管理 | 优先级、Markdown 描述、附件、搜索筛选与删除撤销，可从待办准备会话草稿。 |
| 分支与工作树 | 启用宿主官方 `dsh-experimental-forge-bundle` 后显示分支与工作树控件，禁用时隐藏；工作树请求交给 Forge 在首消息入队后、回合开始前创建。 |
| 搜索与统计 | 搜索项目、会话与待办，查看运行、近期活动和待办统计。 |
| 项目诊断 | 检查目录、会话缓存、孤儿子代理与空会话；清理、缓存重建和永久删除由工作台独立实现，无需归档管理插件。 |
| 插件更新 | 检查并后台更新用户插件，可选启动自动更新。 |
| 备份恢复 | 加密备份、自动备份与保留策略，支持校验预览、工作台状态恢复和独立目录恢复。 |
| 设置与外观 | 通用配置置于首项；「外观布局」统一主题配色、首页模块与统计卡片，配置项目、Agent 权限及导航入口；多套配色跟随宿主明暗模式，布局适配面板宽度。 |
| 界面语言 | 简体中文与英文，默认跟随 Harness；在「通用配置」中选择，保存后即时生效，用户内容保持原样。 |
| 终端扩展 | 在「其他组件 → 终端扩展」开启后，到官方「插件 → 终端」设置字体、字号、独立配色和默认 Shell，整页统一保存。配色支持跟随平台、自定义完整 ANSI 色板及一键下载 Catppuccin 四种风格，保存后可离线切换。本机字体列表需浏览器授权，不支持时可手动输入；默认 Shell 仅影响后续新建终端。 |

项目、待办和设置由宿主持久化，附件使用宿主附件服务；工作台搜索、输入草稿记忆及滚动位置保存在当前浏览器。

### 待实现功能

- [ ] **统计卡片**：增加技能管理、MCP 连接、RSS 订阅统计卡片。
- [ ] **主题选项整合**：评估是否合并「跟随平台」与「平台默认主题」。
- [ ] **代码协作**：代码审查、变更、PR 和 Issue 对接 ONENPC 插件。

## 仓库

| 平台 | 地址 | 角色 |
| --- | --- | --- |
| GitHub | <https://github.com/zhileyo/dsh-workbase> | 主库：提交、Actions、发版与 Release |
| CNB | <https://cnb.cool/zhileyo/dsh-workbase> | 只读镜像：CNB 定时任务每 10 分钟从 GitHub 拉取 `main` 与标签 |

CNB 侧的分支与标签由 `.cnb.yml` 的定时任务拉取后强推对齐，提交 SHA 与 GitHub 一致（最多滞后一个周期）；改动请提到 GitHub，不要在镜像侧直接推。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| DeepSeek Harness | 当前适配 `0.2.2-rc.1` |
| Cordis | `~4.1.0` |
| Node.js | 本地开发使用 22 或以上版本 |
| 运行环境 | Web 与桌面 `desktop` profile；已有 macOS、Windows 安装记录，当前修改的验收范围见[开发日志](.agents/notes/dev-log.md) |

## 安装

### 本地安装包

```sh
npm run build                              # 在源码项目根目录先构建
npm pack                                   # 产出 dsh-workbase-<版本>.tgz
dsh plugin --profile web add ./dsh-workbase-<版本>.tgz
dsh web
```

把 `<版本>` 换成 `npm pack` 实际输出的版本号。

### npm 安装

已发布到 npm，装最新版：

```sh
dsh plugin --profile web add dsh-workbase
dsh web
```

需要固定版本时写成 `dsh-workbase@<版本>`。本地源码可能包含尚未发布的改动，npm 包内容以实际发布版本为准。

### 桌面端安装

桌面端使用应用自带的官方 CLI 和 `desktop` profile。macOS 默认安装位置下，可安装 npm 包：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-workbase
```

安装本地包时，将最后的 `dsh-workbase` 替换为 `.tgz` 的完整路径；固定版本使用 `dsh-workbase@<版本>`。安装后重启桌面应用，并在插件页确认工作台已启用。Windows 请使用桌面应用安装目录内的 CLI。

PATH 中的旧版 `dsh` 可能拒绝管理 `desktop` profile；此时应使用应用自带 CLI。安装与功能验收是两个步骤，验收边界见「已知限制」。

## 使用

### 待办与会话草稿

在项目详情中快速添加待办，点击待办标题打开统一详情页。待处理事项按高、中、低、未设置优先级排序，同优先级按最近更新排序；已完成事项按完成时间排序。

描述支持 Markdown 编辑与预览。附件不限文件格式，每个待办最多 10 个，每个不超过 10 MiB，旧图片与通用文件共用数量上限。选择、拖入或粘贴文件后自动上传；新建待办需先填写标题，上传失败可重试。移除附件仅移除待办引用，不删除宿主共享文件对象。

选择 Agent 模式后点击「发起会话」，会先保存待办修改、读取附件，再准备会话草稿；消息由你确认发送。附件读取或草稿交接失败时不会自动发送。

### 备份与恢复

打开「工作台设置 → 备份恢复」，在「数据备份」「数据恢复」「执行状态」之间切换。

| 配置或操作 | 行为 |
| --- | --- |
| 立即备份 | 保存当前备份配置并启动后台任务，关闭设置页后继续执行 |
| 启动自动备份 | 默认关闭；开启后在后续启动时触发，繁忙时延后 |
| 保留策略 | 永久（默认）、7、14 或 30 天；新备份成功后仅清理校验通过的过期普通备份，回滚副本不参与清理 |
| 工作台状态恢复 | 先校验预览，确认时重新核验项目关联与数据版本；替换前生成加密回滚副本 |
| 完整归档恢复 | 恢复到新的独立目录，不原位替换会话、附件、SQLite 或 Profile |

备份文件名为 `dsh-YYYYMMDD-HHMMSS-短ID.tar.age`。数据恢复页点击「备份文件」选择配置目录中的备份或回滚副本，列表最多显示最近 30 个文件；预览通过后选择恢复范围并执行。

密钥在首次备份时生成，位于 DSH 数据目录的 `backup/identity.txt`，同机恢复自动使用。请将密钥与备份文件分开保管；更换机器恢复前，需将对应密钥放到新环境的同一位置。

在线备份包含工作台状态，以及已发现、可导出的会话、默认附件目录、配置和部分插件数据；每项覆盖结果显示在执行状态中。各数据源的导出时间不同，归档不构成全局一致恢复点。客户端草稿、自定义或远端附件根尚未覆盖，项目源码与 Profile 的 `node_modules` 不包含在归档内；SQLite 在线导出需要系统提供 `sqlite3`。

## Agent 工具

当前注册 11 个工具，均根据调用会话确定所属项目：

| 工具 | 功能 |
| --- | --- |
| `workbase_list_todos` | 查询待办，支持摘要、状态、关键词与优先级筛选 |
| `workbase_get_todo` | 读取单项待办完整内容、附件引用与最新版本 |
| `workbase_create_todo` | 创建待办，可填写描述与优先级 |
| `workbase_update_todo` | 更新标题、描述、优先级或完成状态 |
| `workbase_delete_todo` | 按读取到的版本删除当前项目待办 |
| `workbase_attach_todo_attachment` | 将当前会话消息中的文件引用附到待办 |
| `workbase_read_todo_attachment` | 读取待办已保存的通用附件或旧图片 |
| `workbase_remove_todo_attachment` | 移除待办附件引用，包括旧图片 |
| `workbase_attach_todo_image` | 将当前会话消息中的图片引用附到待办 |
| `workbase_read_todo_image` | 读取待办已保存的图片 |
| `workbase_remove_todo_image` | 移除待办图片引用 |

「工作台设置 → 项目配置 → 全局配置」中的管理开关开启时允许 Agent 写入，关闭后仅可查询；归档项目始终禁止写入。更新、删除和附件增删必须传入读取到的 `version` 作为 `expectedVersion`；发生冲突后应重新读取。

附加文件或图片只接受当前会话真实消息中的 `attachmentId`，不接受本地路径、URL 或跨会话伪造引用。建议先查询已有待办并读取详情，再更新或创建任务，完成验证后标记为已完成。用户界面的删除撤销不适用于 Agent 删除。

## 已知限制

- 项目归档由插件自行记录：归档后业务只读、可恢复，但宿主原生归档接口缺失，宿主自己的归档视图不感知这个状态。
- 默认项目根目录仅用于新建项目，不迁移已有项目；移除项目保留本地目录与待办数据。
- 会话永久删除由工作台处理目标及其子代理日志、缓存和宿主列表关联，保留独立 fork、项目待办及工作树代码；运行中会话及归档项目禁止删除，删除不可撤销。当前物理清理适配官方 JSONL 存储，宿主底层能力不足时拒绝操作。
- 官方「历史会话搜索」实验套件（`@deepseek-ai/dsh-experimental-session-search`）启用且就绪时，工作台搜索会话标题和正文，不显示依赖提示；停用时只搜索标题。仅当套件可用且未默认隐藏时显示添加启用提示，当前默认隐藏时不提示。工作台只使用套件隔离索引，无需修改宿主主索引配置。
- 正文搜索最多返回 20 条结果，不支持消息精确定位或命中次数统计。
- 备份恢复的覆盖范围与两种恢复方式见「使用 → 备份与恢复」；完整归档导出成功不代表可以原位激活全部宿主数据。
- 诊断仅读取头部和官方缓存，不提供完整日志损坏、模型或网络检查；能力缺失与读取失败明确显示未完成。空会话须由官方投影确认为未开始对话且没有用户消息；跳过正在使用的输入会话、活动会话、分支及有后代的会话，缺少投影时不判为空。缓存检查跳过 IM、子代理与活动会话，孤儿检查保护用户 fork 及母会话日志尚存的记录；日志大小不含附件及完整目录占用。
- 真实模型发送、附件与引用、正文命中、在线插件升级及自动更新、会话永久删除、诊断缓存重建与残留清理仍待完整验收；桌面环境的逐主题外观、低高度、软键盘、缩放与跨平台字体也需实际复验。安装与启用验证不代表这些行为已验收。

## 开发

在源码项目根目录执行：

```sh
npm ci
npm test          # node:test：存储、RPC、HTTP、Agent 工具、视图渲染、主题与样式生成
npm run typecheck
npm run build
```

改动源码后需重新构建并重启宿主。服务端入口 `src/server/index.ts` 产出 `dist/index.js`，客户端入口 `src/client/entry.tsx` 产出 `lib/client.js`（样式以文本形式打进客户端产物）。

出本地安装包用 `npm pack`，但**先 `npm run build`**——`npm pack` 不会触发构建，可能把上一次的 `dist`／`lib` 打进包。版本号与发版流程由 semantic-release 从提交类型推断，push 到 `main` 后由 GitHub Actions 自动发版，规则见 [AGENTS.md](AGENTS.md)。

本地链接安装：

```sh
dsh plugin --profile web add "$(pwd)"
dsh web
```

### 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/server/` | 插件入口、存储域（含旧标识迁移）、业务服务、宿主适配、备份恢复、诊断、附件 HTTP 路由、RPC 与 Agent 工具 |
| `src/client/` | 首页／详情／搜索／设置、待办详情与工具栏、备份恢复、统计与诊断面板、宿主输入桥接、分支条、插件更新与主题 |
| `src/shared/` | 前后端共享模型、RPC 合同、待办附件与优先级、会话、备份恢复及诊断类型 |
| `src/client/prototype.css`<br>`src/client/prototype-icons.ts` | 由 `sync-ui.mjs` 从 `docs/ui/ui-directions.html` 生成，改样式要改原型而非这两个文件 |
| `test/` | `node:test` 测试，`npm test` 全量执行 |
| `docs/` | 需求、UI 基线、验收证据与验收脚本；不进入 npm 包 |
| `release.config.mjs`、`release-sync-docs.mjs`、`build.mjs`、`sync-ui.mjs` | 发版配置与文档同步、构建、原型样式与图标的同步生成 |
| `.github/workflows/release.yml` | GitHub Actions：push `main` 后跑类型／测试／构建门禁，交由 semantic-release 发版并建 Release |
| `.cnb.yml` | CNB 定时任务：每 10 分钟从 GitHub 拉取 `main` 与标签并强推对齐，不做构建 |

## 许可证

MIT，全文见 [LICENSE](LICENSE)。Copyright (c) 2026 AlwaysFyo；文件夹展开图标作品版权归 DeepSeek，具体声明见许可证。

## 项目文档

需求与视觉规则在 `docs/` 里，实现状态、验收证据与限制在 `.agents/notes/dev-log.md`（开发日志的上半部分）。两者都不随 npm 包分发：`docs/PRD.md`（需求）、`docs/UI-DESIGN.md`（视觉规则）、`docs/ui/ui-directions.html`（可交互原型）。

原型中的 RSS 订阅、MCP 连接器和自动化管理为交互演示，尚未接入真实服务，不属于当前插件已实现的功能。
