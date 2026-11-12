# DSH Workbase · 工作台

[![GitHub](https://img.shields.io/badge/GitHub-zhileyo%2Fdsh--workbase-181717?logo=github)](https://github.com/zhileyo/dsh-workbase)
[![CNB 镜像](https://img.shields.io/badge/CNB-zhileyo%2Fdsh--workbase-1f6feb)](https://cnb.cool/zhileyo/dsh-workbase)

DeepSeek Harness 的工作台插件，集中管理项目、会话和待办，支持 Agent 管理当前项目待办，并提供项目诊断与用户插件更新。

## 功能

- **项目管理**：宫格与列表视图、添加目录、新建项目、重命名、移除、置顶、收藏，以及归档与恢复；归档项目变为只读，随时可以恢复。
- **会话管理**：查看最近会话、按项目浏览、正文预览、重命名、归档与恢复、置顶及收藏；永久删除需确认并启用 `dsh-archive-manager`。
- **快捷输入**：选择项目、Agent 预设、模式与模型发起会话；接入宿主输入服务、添加菜单、附件与引用，保留草稿并支持失败重试。
- **待办管理**：创建、编辑标题与备注、完成、重新打开；待处理与已完成互斥展开，支持删除后 5 秒撤销及状态变更撤销。
- **分支与工作树**：输入卡下方显示当前分支；宿主启用 `experimental-forge-bundle` 时可指定基准分支并在新工作树中发起，非 Git 项目自动降级为普通发起。
- **全局搜索**：搜索项目、会话标题与正文、待办标题与备注，并跳转到对应内容。
- **数据统计**：运行中会话、所选时间范围内的近期会话、未完成待办与项目诊断；会话及待办明细支持按项目筛选、搜索与跳转。
- **项目诊断**：检查目录可用性、普通冷会话列表缓存异常、孤儿子代理残留与空会话；按类型浏览和搜索，支持重新检测及查看日志大小。空会话支持单条删除和「一键删除全部空会话」，确认后逐项复查并跳过已变化的会话。重建缓存和永久清理需启用 `dsh-archive-manager`，支持失败重试。
- **插件更新**：在宿主插件页检查并串行更新用户安装的非官方插件；展示版本、安装来源、进度与失败恢复结果，关闭弹窗后可在后台继续。可选择开启启动时自动更新，默认关闭。
- **工作台设置**：首页模块、7／14／30 天统计窗口、主题、项目根目录、Agent 权限及布局偏好；通用设置支持桌面启动打开首页、侧边栏名称（默认「项目概览」）、入口显隐与排序，以及会话顶部工作台按钮显隐；其他组件配置插件更新入口与自动更新。
- **备份恢复**：设置 → 备份恢复中可立即后台备份或开启默认关闭的启动自动备份，忙时延后，关闭设置后继续。选择最近备份、回滚副本或输入文件路径，解密校验后预览并确认：可在线替换工作台状态，替换前保留加密回滚副本；也可将完整归档恢复到独立目录，会话、附件、SQLite 和 Profile 尚不原位激活。恢复密钥位于 DSH 数据目录的 `backup/identity.txt`，必须另行保存。在线备份不构成全局一致恢复点，客户端草稿、自定义附件根等尚未覆盖；SQLite 导出需要系统提供 `sqlite3`。
- **配色主题**：跟随 DSH、DSH 默认、清爽、温暖阅读和紫晶工作台；明暗外观跟随宿主，主题支持即时预览与保存。
- **响应式布局**：双栏列表或整体卡片，窄屏切换会话与待办页签；断点按面板宽度计算，不依赖浏览器视口。

项目、待办和设置由宿主持久化；未提交草稿及滚动位置保存在当前浏览器。

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

PATH 中的旧版 `dsh` 可能拒绝管理 `desktop` profile；此时应使用应用自带 CLI。

## Agent 工具

| 工具 | 功能 |
| --- | --- |
| `workbase_list_todos` | 查看当前项目待办 |
| `workbase_create_todo` | 创建待办 |
| `workbase_update_todo` | 更新待办内容或完成状态 |
| `workbase_delete_todo` | 按读取到的版本删除当前项目待办 |

Agent 只能操作所属会话的当前项目。「工作台设置 → 项目配置 → 全局配置」中的管理开关开启时允许待办增删改查，关闭后仅可查询；归档项目始终禁止写入，删除与更新必须匹配读取到的版本。

## 已知限制

- 项目归档由插件自行记录：归档后业务只读、可恢复，但宿主原生归档接口缺失，宿主自己的归档视图不感知这个状态。
- 修改绑定目录、跨目录迁移及 72 小时撤销缺少安全的宿主接口，暂无真实迁移记录。
- 会话永久删除依赖已启用的 `dsh-archive-manager`，删除目标及其子代理会话，保留独立 fork 和项目待办；运行中会话及归档项目禁止删除，删除不可撤销。
- 会话正文搜索要求宿主索引 `openAt` 为 `first-search` 或 `startup`；默认 `never` 时正文搜索不可用。插件不会自动修改宿主配置。
- 正文搜索最多返回 20 条结果，不支持消息精确定位或命中次数统计。
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
| `src/server/` | 插件入口、存储域（含旧标识迁移）、业务服务、宿主能力适配、诊断、RPC 与 Agent 工具 |
| `src/client/` | React 视图（首页／详情／搜索／设置）、统计与诊断面板、输入卡与宿主输入桥接、分支条、插件更新控制器、主题、`api` 与启动逻辑 |
| `src/shared/` | 前后端共享的 zod 模型、RPC 频道名、会话与诊断类型 |
| `src/client/prototype.css`<br>`src/client/prototype-icons.ts` | 由 `sync-ui.mjs` 从 `docs/ui/ui-directions.html` 生成，改样式要改原型而非这两个文件 |
| `test/` | `node:test` 测试，`npm test` 全量执行 |
| `docs/` | 需求、UI 基线、验收证据与验收脚本；不进入 npm 包 |
| `release.config.mjs`、`release-sync-docs.mjs`、`build.mjs`、`sync-ui.mjs` | 发版配置与文档同步、构建、原型样式与图标的同步生成 |
| `.github/workflows/release.yml` | GitHub Actions：push `main` 后跑类型／测试／构建门禁，交由 semantic-release 发版并建 Release |
| `.cnb.yml` | CNB 定时任务：每 10 分钟从 GitHub 拉取 `main` 与标签并强推对齐，不做构建 |

## 许可证

MIT，全文见 [LICENSE](LICENSE)。Copyright (c) 2026 AlwaysFyo。

## 项目文档

需求与视觉规则在 `docs/` 里，实现状态、验收证据与限制在 `.agents/notes/dev-log.md`（开发日志的上半部分）。两者都不随 npm 包分发：`docs/PRD.md`（需求）、`docs/UI-DESIGN.md`（视觉规则）、`docs/ui/ui-directions.html`（可交互原型）。
