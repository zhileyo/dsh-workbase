# 宿主更新与兼容维护

工作台随 DeepSeek Harness 频繁更新。每次更新先运行只读检查，再根据版本源码决定是否适配。脚本的“静态检查通过”仅说明当前核对项成立，不代表浏览器视觉、真实删除或恢复流程已经验收。

## 一条命令检查

项目迁移（2026-11-22）：本机rc.5的`workspace.attachSession`及成员列表按原始`header.cwd`的真实路径归属，`apiWorkspace`的插入接口只负责排序；`workingDirectory.set`不更新原始会话头、项目归属或现有进程。工作台通过官方存储域global单次提交独立会话归属、待办与批次回执，提供72小时撤销。回执落盘后调用官方`workspaceRegistry.delete`移除源登记；该接口只删工作区记录及显示顺序，保留目录、会话日志和已初始化标记，重启不按历史会话重建源登记。启动及同步补齐旧completed批次，只处理回执的原workspaceId与路径；后来同目录的新登记不自动删除。跨域步骤不宣称原子：移除失败保留完成回执，仅补齐登记操作，未知结果读回核验。撤销先核验实体、运行状态及设置，再通过`workspaceRegistry.create`复用或恢复源登记，更新工作台绑定与批次中的新ID；保存失败仅清理本次确定新建的登记，存储状态未知时不补偿删除。

源目录缺失与宿主身份失效分开处理：有效登记且明确ENOENT时仍可迁入已有项目；撤销恢复登记要求原目录已存在，目录缺失时不自动创建。权限拒绝、未知状态、身份不匹配及运行会话保持阻断。官方登记移除与恢复能力缺失时阻止新迁移；不按版本号或接口名称猜测契约，不直接改写宿主工作区域或会话头。

```sh
npm run host:check
```

在仓库根目录运行。入口是 `check-host.mjs`，使用 Node 内置库与项目已有的 TypeScript，不安装依赖、不启动宿主、不读 Cookie 或凭据、不调用删除、恢复或更新接口。默认检查 `/Applications/DeepSeek Harness.app` 与 `~/.dsh/profiles/desktop/node_modules/dsh-workbase`，结果输出到被 Git 忽略的 `docs/ui/verification/host/`。该维护脚本不进入 npm 包。

```sh
# 应用位置或 profile 不同
node check-host.mjs --app "/Applications/DeepSeek Harness.app" --profile "$HOME/.dsh/profiles/desktop"

# 核对官方发行说明；需要已安装并登录 gh，网络失败会记录为未完成
node check-host.mjs --online

# 已完成源码评估后，明确接受当前宿主为后续对照基线
node check-host.mjs --accept-baseline
```

检查报告包含版本与构建提交、运行时版本、插件安装文件一致性、所需服务方法及指纹、相较已接受基线的变化、新增官方能力候选和未验证范围。`report.md` 供人阅读，`report.json` 与 `baseline.json` 供后续比较。首次运行没有旧宿主基线，不能把“没有对照”说成“没有变化”；接受基线只保存证据，不改变运行时路由。正常检查不会覆盖已接受基线。

插件管理服务与官方插件页面都纳入扫描。各模块的 `.d.ts` 及随包 `src/*.ts` 接口／类型别名单独生成契约指纹，声明新增、修改、删除均列为待复核，即使 JavaScript 方法名没有变化。旧基线没有契约指纹时必须补做评估，不自动接受。插件更新另有不依赖基线的检查：核对实际 `BundleInfo` 与工作台 `Bundle` 使用的字段、类型、可选性，以及更新门禁是否读取官方更新字段；声明缺失或不匹配为阻断项。该检查只覆盖这些明确字段，不证明全部 RPC 参数、事件、错误与运行行为兼容。

退出码：`0` 表示扫描完成且没有新增待复核事项；`2` 表示扫描完成但有版本／接口变化或缺少基线等待复核事项；`1` 表示必需接口缺失、安装产物不一致或扫描失败。始终以报告注明的静态检查范围为准。

## 每次更新的步骤

1. 记录实际安装的版本、构建提交和运行时版本，用应用包元数据确认，不依赖页面或文件名。当前已调查版本为 `0.2.2-rc.5`，构建提交 `3f85d888b1297107937d9bd5b853f7e733e179a4`（2026-11-19）。此前曾接受 `0.2.2-rc.2`／`a6b1b85f44891ee1484bed6a9fc08acaae777d90`；当前工作区副本没有 `baseline.json`，不能使用此前基线作本机指纹对照。
2. 对照上一份已接受基线、项目 SDK 与实际宿主包中的源码。方法存在仅是第一层检查，还要看参数、返回值、事件、持久化时机、错误代码和销毁行为。
3. 阅读该版本官方 Release 与升级指南。GitHub 信息通过 `gh` 获取，固定到实际版本标签。发行说明有时汇总多个开发版本，不把每一项都视为上次安装之后新增；实际源码差异优先。
4. 检查客户端插槽、原生输入、模型／项目菜单和宿主主题。新版 CSS 锚点、portal、滚动或视口变化不能只靠 TypeScript 判断。
5. 检查服务端项目／会话 RPC、存储、附件、工作目录、插件更新，以及内部维护模块的私有适配。
6. 对每项自实现能力查找官方等价 API。读取其公开文档和完整实现，确认满足工作台的归属、活动保护、幂等与持久化要求，再接入宿主优先路由。
7. 对确有变更的适配执行必要验证，构建、安装工作台并重启桌面端；这些操作遵循已有授权。检查脚本本身不会安装或重启。没有修改时不额外执行测试、构建或界面验收。
8. 在 `.agents/notes/dev-log.md` 更新当前实现、决策和实际证据范围，并将 README「环境要求」中的「兼容性检查」更新为本次检查的宿主版本与日期；确认适配后同步「当前适配」版本。源码评估完成后再接受基线，不因脚本运行成功自动接受。

## 宿主优先与安全降级

语音输出当前使用官方Session事件源的`assistant/live-chunk`及`settle-assistant`，只朗读新正文；`replace/prepend`建立静音基线，重连不重发已读内容。宿主更新时须复核attempt身份、seq排序、text-delta／block-end／finish和空settlement语义。音频由Connection精确owner Fetch流路由返回，文字走owner助手RPC；检查响应流断连是否取消Request信号，不能将流路由改成无鉴权HTTP端点。当前宿主无公开TTS输出服务，服务端以Node22原生WebSocket调用DeepSeek官方TTS；其协议与凭据仍由工作台适配。浏览器PCM播放和实际音频须独立验收。

**官方公开能力优先，工作台自实现兜底。** 这里的“宿主”包括官方宿主 API 和官方插件提供的已加载服务。Forge（`@deepseek-ai/dsh-experimental-forge-bundle`）是宿主自带的官方可选套件，不属于第三方插件。用户已明确工作树例外：恢复自实现前方案，只通过官方 `forgePanel.requestWorktree`，Forge 启用时显示分支与工作树、禁用时隐藏，不提供自建工作树降级。其余能力仍按下述通用原则维护。`dsh-archive-manager` 等第三方插件不得成为必需依赖。新增能力在使用时探测，不按版本号猜测，不在启动时缓存永远不变的判断。

Forge 面板的 `requestWorktree` 登记请求，在首条消息进入队列后、回合开始前执行创建；工作台遵循该官方流程，不再发送前直接创建。面板的 `branches(session, signal)` 使用真实会话及其权限上下文，不能直接当作任意项目目录的分支查询接口，项目分支保留原有只读 Git 查询。工作台只探测准确的 forgePanel Remote 接点，不把其他名称含 forge 的服务误判为套件已启用。

路由顺序：

1. 保留工作台自己的所有者、项目归属、归档和活动检查。
2. 官方服务存在且契约已确认时优先调用。
3. 服务缺失或明确尚未实施操作的可降级故障，才转入自实现。
4. 已有目标或操作可能部分成功时，先核对真实状态；成功则复用／补齐持久化，部分失败则保留结果并报告，不重复创建或删除。

| 宿主结果 | 行为 |
| --- | --- |
| 服务未加载、已确认接口不存在 | 使用自实现 |
| 明确“不支持／服务不可用”，且确认未改变状态或创建产物 | 使用自实现 |
| 成功且状态可核实 | 返回成功，不再调用自实现 |
| 已完成创建／删除，但回执或刷盘失败 | 核对结果、保留记录；不启动第二次操作 |
| 权限／沙箱拒绝、归属错误、正在运行、输入不合法 | 原样失败，不绕过宿主保护 |
| 取消、超时、连接断开、未知异常、部分产物或结果无法确认 | 停止并保留原内容／产物，重试前复查 |

不能使用 `try { native() } catch { fallback() }` 的无条件降级。对删除和恢复尤其如此：它们可能已部分生效。读取操作允许对等价结果作降级，但不能把异常当作“目标不存在”，也不能因此复活已删除记录。降级不扩大授权范围；官方明确的权限拒绝不能转成本机直接写入。

## 当前能力对照

语音输出（2026-11-22）：rc.5宿主及内置插件暂无公开TTS输出服务，但DeepSeek已提供[官方HTTP TTS API](https://api-docs.deepseek.com/zh-cn/guides/tts)。工作台新配置默认由宿主服务端请求`/v1/tools/tts`，采用`text/voice_id/format/filter_markdown`及Bearer认证，输出WAV；不套用OpenAI的`input/model/voice/speed`协议。配置与密钥仍走官方credentials事务，会话触发仍走官方事件源。既存兼容服务不自动改写；官方请求失败不切第三方。

| 能力 | 官方接点／当前实现 | 更新时核对 |
| --- | --- | --- |
| 项目登记、会话创建／改名／归档 | `workspaceRegistry`、`sessionController` | 参数、事件、归属与权限 |
| 正文搜索 | 官方`dsh-experimental-session-search`的`optional-session-search`隔离组；通过Cordis公开Entry/Fiber合同读取索引服务的`searchSessions`，不调用主索引 | 套件行标识、子节点归属、ACTIVE状态及服务provision、启停／重载、会话ID过滤和分页 |
| 原生输入、引用、模型与附件 | `conversation`、`sessions`、官方 slots | 草稿所有权、上传失败锁定、菜单定位和 SessionProvider |
| 项目详情右栏 | 只复用已有会话，无可用会话时隐藏按钮与分隔符；不调用`connectWorkspace`或会话创建接口。读取官方`sessions.list.ids/byId/projectionsBySession`、workspace成员及`archivedSessionIds`，按最近活动筛选未归档、非子代理且header.cwd与有效目录匹配的会话。未知目录通过官方`refreshProjections`只读检查，不持有或迁移；迁移必需、失败或仍未知时不可用。点击后才`sessions.retain`，本次插件生命周期内优先上次成功目标，否则最近候选，`SessionProvider`提供工具作用域。新增、删除、归档与目录变化实时重算；失效目标撤下，其他候选等待点击。保留官方Root注册、子插槽授权与共享Store，只可逆适配公开component及mounted读接口，退出恢复原源；全部写动作交官方Controller，后台Tab资源沿官方生命周期保留 | 优先检查新增项目目标注册能力并替换兼容桥。核对官方候选列表、归档集合及只读投影状态字段，Root的views/mountView、可写component、唯一children及授权、corner/seat同一Store及语言空间、mounted可写读方法。能力或目录未知时不显示可操作入口，不创建替代会话，不调用内部openTabIn。列表成员、项目归属、header.cwd、workingDirectory必须同时成立；目标失效立即收起，迟到引用释放。覆盖有正文会话复用、上次／最近选择、无候选、投影检查合并、动态新增与失效、等待取消、后台Tab及卸载；本机回归不代表真实宿主界面已验收 |
| 语音输入 | 官方`conversation.input.activity`中`voice-input`语言命名空间的组件；镜像注入与子插槽，适配`InputActions.captureInsertion/insertText` | `locked/onActiveChange`、草稿revision、剪贴板与原子节点坐标、热挂载／卸载及取消；录音与转写阶段是组件内部状态，不按展开状态推断 |
| 工作目录切换 | `workingDirectory.get/set` | 原始目录回退、`working-directory/access` 与刷盘 |
| 工作树创建 | 官方 `forgePanel.requestWorktree(sessionId, from)`；启用时显示、禁用时隐藏，不自建降级 | 套件异步挂载与卸载、请求登记、首消息阻塞、失败重试和归档清理 |
| 会话永久删除、空会话／孤儿清理 | 当前没有已确认的公开等价 API；`session-maintenance.ts` 适配官方 JSONL、工作区队列和缓存 | 新增公开维护 API、活动及 revision 复查、级联与文件归属 |
| 空会话状态复核（缓存缺失时） | 官方 `sessionProjectionCache.coldSnapshot`（折叠完整日志并回写缓存行）+ `sessionPersistence.open` | checkpoint 与 snapshot 契约、回写时机、日志读取布局 |
| 列表缓存健康检查 | 官方 `sessionProjectionCache.cachedSnapshot`（只读，缺失不算异常） | lifecycle identity 匹配、viewRecord 版本过滤 |
| 终端显示与默认Shell | 公开侧栏显示插槽、官方`TerminalView.mount/connect`和`webTerminals.selectShell`；跟随／停用渲染原官方组件，已结束终端重新挂载时补取完整快照；Shell保存后只读核对官方浏览器偏好键`dsh.terminal.shell` | `attach`首帧完整screen与已结束终端保留、挂载／卸载、不可用反馈、官方偏好键及读写失败语义；官方`selectShell`返回void、`launchShells`可兜底首项，二者都不能单独证明持久化成功 |
| 备份与事务恢复 | 工作台自实现归档；替换业务状态仍经官方存储 | 新增官方快照／事务接口是否满足校验、加密回滚和并发保护 |
| 技能安装、编辑与恢复 | 官方FileSystem仍无目录提交API。受限同宿主映射通过已加载的官方`sandbox.confine(argv, policy)`约束目录变更；每次限定父目录，缺失目录逐级临时授权现有父目录，完整约束才执行，数据经stdin传递。既有事务保留摘要、独占日志、反向回滚及初始化恢复，状态通过官方`fs.writeText`提交；写后抛错读回完整新旧状态确认，未知结果保留文件和日志 | `processPathFromHostPath`必须映射同宿主路径；`confine`的argv及full enforcement、workspaceRoot必须存在、Node／Electron子进程、目录移动和二进制保留、状态写后检查抛错和读取失败。拒绝、只读、partial、不可映射和回滚失败无无约束降级；不把单文件moveFile当成目录事务 |
| 插件在线更新 | 官方 `remote.pluginManager`；同一窗口保存批次数据及首次启动选择，热重载后复用；在途请求沿用官方Promise结果，不增加远程恢复接口 | `listBundles/listVersions/updateBundle`、`BundleInfo`返回字段、类型契约指纹和进度事件；新版`update=registry`优先，旧版`updatable=true`兼容，Git不走registry批量更新；自身热重载时卸载／安装顺序、请求返回与结果未知边界。入口挂载依赖官方工具栏DOM结构假设：`[data-plugin-toolbar]`容器内带`aria-busy`属性、且不含`wb-plugin-update-trigger`类的按钮即「正在检查/更新」的刷新按钮（`PluginUpdate.tsx`的`isToolbarRefreshButton`）；宿主改版须复核该假设 |

未来扫描发现 `deleteSession`、`rebuildCache`、`backup` 等同名方法，只列为线索：它可能是内部方法、只删登记、不删物理数据，或缺少工作台要求的事务保护。人工确认后在能力表与适配源码中登记，不对猜测的接口自动接线。

## 当前版本需要注意

- `rc.5` 本机检查（2026-11-19）为 0 阻断、1 待复核，退出 2；21 个扫描模块无缺少方法，插件更新的 `BundleInfo.update` 契约匹配，4 项安装文件与工作区构建逐字节哈希一致。唯一待复核是本副本没有已接受基线；模型菜单风险另列在验证边界，不能用“零阻断”解释为完全兼容。
- 官方 `rc.3 → rc.5` 完整差异有 447 个文件，比较 API 的 JSON 文件列表只给前 300 项，因此另用完整 diff 核对。会话／工作区 API、存储与投影、客户端插槽／输入／模型菜单、Forge、正文搜索套件、语音与终端相关源码未见变更；主要行为调整为模型异常响应、LiveShare 和网页搜索提供方路由。工作台没有直接调用网页搜索服务，其正文搜索是独立的会话索引。
- 实际应用包构建提交与公开 `dsh-v0.2.2-rc.5` 标签提交不同，公开仓库比较该构建提交返回 404。因此官方标签差异只作发行版本层面的证据，不能宣称实际应用包与标签源码完全相同；实际包已单独扫描并读取模型菜单源码。没有重建或自动接受基线，也没有执行真实界面、删除或恢复验收。
- `rc.3` 新增实验性 DeepSeek 会话导入、`sidebar.session.action` 与 `workspace.picker` Factory，原工作台侧栏与目录流程接点保留。新增 Factory 可作为后续复用候选，不能直接替代工作台自己的项目归属与草稿交接逻辑。
- 2026-11-13 的 rc.3 检查没有发现新增阻断性接线问题，但检查仍退出 1：最新工作台构建的 `dist/index.js`／`lib/client.js` 尚未安装。旧基线缺少声明指纹，21 个声明待复核不等于新版破坏；插件管理器与此前实际副本哈希一致，终端、语音、侧栏等本次人工补核。详细证据见 `docs/ui/verification/host/assessment.md`（被忽略的本机证据），未覆盖真实运行验收。
- `rc.2` 删除了 Agent 的 `isOwnedBy` 与 `roots`，工作台没有调用它们。
- 会话支持批量追加，JSONL 格式仍为 V4；工作台不包装 `Session.append`。官方列表缓存是可丢失的派生数据，缺失走冷读；空会话复核直接使用 `coldSnapshot`，不再维护单独的重建入口。
- 官方工作树创建会发布 `plugin:worktree/created`，符合条件的目录可在归档后自动清理，分支与提交保留。旧工作台自建目录没有该记录，不自动交给官方清理；不能伪造该记录来接管旧目录。
- 官方工作树创建失败可能保留分支或目录，不能再无条件启动独立 Git 创建。成功后刷盘失败也不能当作“没有创建”。
- 模型菜单改用 CSS 锚点。现有 `NativeComposer.tsx` 的 JavaScript `top/max-height` 覆盖需要适配，不能仅凭方法名存在判为完全兼容。检查报告应持续注明这项边界，直到源码适配并完成对应验证。
- 本轮此前仅完成源码和应用包核对，未执行用户会话的真实删除、恢复或浏览器视觉验收。

## 当前交付

`check-host.mjs` 与 `host:check` 保留为维护入口，生成 Markdown／JSON 报告和显式接受的对照基线。按用户后续决定，工作树恢复 Forge 原流程，自建模块及其 RPC 已移除，显隐跟随套件启停；删除和诊断的独立实现不受本次回退影响。

rc.2 宿主源码曾评估并接受基线；rc.3 静态复核时安装产物不一致，没有自动接受。rc.5 本次静态检查安装一致，但当前副本缺少基线、实际构建提交无法通过公开仓库完整对照，仍未接受新基线。实际验证及安装状态以开发日志最新记录为准；模型菜单待适配仍记录在报告的验证边界中，接受基线不代表该问题已修复。

官方参考：[本次 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5)、[rc.3 → rc.5 源码变化](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.3...dsh-v0.2.2-rc.5)、[升级指南目录](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.5/docs/upgrade-guide)、[工作树服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/experimental/worktree/README.zh.md)。
