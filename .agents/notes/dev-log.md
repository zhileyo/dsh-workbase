# 开发日志

开发侧的唯一记录：**上半是当前状态**（实现、限制、证据、验证方式、版本与安装），**下半是按日期倒序的过程记录**。写什么、不写什么与四段式格式见 [AGENTS.md](../../AGENTS.md)。需求见 [PRD](../../docs/PRD.md)，视觉规则见 [UI 规范](../../docs/UI-DESIGN.md) 与 [HTML 原型](../../docs/ui/ui-directions.html)。

## 当前状态

### 版本、构建与安装

当前源码与本地包为 `1.0.4`。最新源码构建是2026-11-22的整改版，覆盖原报告全部22项严重问题，保留迁移与72小时撤销，并加入市场／RSS 地址策略、待办详情两列对齐、失效会话恢复、诊断清理绑定核验与冷会话删除放行，以及诊断判据修正（缓存缺失不再报异常、空会话按官方冷读折叠复核）、快捷会话失效身份自动换新与延迟创建（首次输入才建空会话），并补迁移记录源状态快照与实体清单视图、语音播报服务标签改名。**本机 `npm run typecheck`、`npm run build` 通过，`npm test` 755项中730通过、7跳过，18项失败全部为环境限制（符号链接权限、Git初始化、子进程ENOENT，另有backup／market两条在HEAD基线同样失败的断言）；两次构建两端摘要一致；7文件安装包扫描0命中，已装到 profile `desktop`，宿主重启后生效。**

| 项目 | 最近一次已记录状态 |
| --- | --- |
| 本机构建 | 本轮 `npm run typecheck` 通过、`npm test` 755 项中 730 通过／18 失败／7 跳过、`npm run build` 通过且双构建幂等；18 项失败全部是环境限制（`EPERM: symlink`、Git 初始化、`spawn sqlite3/node.exe ENOENT`，另有 backup／market 两条断言在 HEAD 基线 worktree 复跑同样失败），与本轮改动无关。依赖已就位，本轮未重跑 `npm ci`。 |
| 客户端 | 1767215字节，SHA-256 `5302746136d1548d1fb426b18904430dd93cb5921b00092854f45ec53769f2b6`；本轮快捷会话改延迟创建：首页输入卡在首次输入/粘贴/附件/添加上下文前不建空会话（`memory.composer.nativeArmed` 持久化激活状态，激活草稿经 `prepareNativeComposer` 的 `activationDraft` 以替换语义写入，附件暂存到绑定后上传，发送成功回未激活），上一轮的失效身份换新恢复保留；另补迁移记录源状态与实体清单视图、概览三页签共用页头、待办详情两列对齐与语音播报服务标签改名。 |
| 服务端 | 2715640字节，SHA-256 `5375ac0973140885dbc1c0142e0fdeb84330b3ef04bcdb1cd0df87bf1b8be548`；本轮把缓存检查改为纯接口健康检查（不再产「列表缓存异常」修复项），空会话检查在宿主冷列表因缓存缺失显示非空时按官方 `coldSnapshot` 折叠完整日志复核并回写缓存行；迁移记录增加源项目状态快照与实体清单，project-rules 目录不可用返回可读错误，代理 fake-ip 段 198.18.0.0/15 放行。 |
| 最新安装包 | 仓库根`dsh-workbase-1.0.4-2238b2cd.tgz`，1009431字节，SHA-256 `2238b2cd5a7aaeda4d2342fdb510081047cb0f1a075785f81b49c5683de896c0`；文件名后8位即包摘要前8位，用于绕开profile pnpm `hoisted`的同版本同路径缓存。7文件白名单（LICENSE、README.md、THIRD_PARTY_NOTICES.md、cordis.patch.yml、dist/index.js、lib/client.js、package.json），两端产物为该包构建时的摘要，此后的迁移记录、语音标签等改动未再打包（当前源码构建摘要见客户端／服务端行）。此前几轮的`0cfafbf8`（1009187字节）、`de585100`（1008930字节）、`6b1a3218`（1008992字节）、`93eece16`（1008834字节）、`3165f3f0`（1008306字节）、`6b7d4146`（1008321字节）与`7fff3360`（1008130字节）已从仓库根删除，只留本轮这一个。 |
| 原型与生成物 | 本轮未改样式或生成规则，完整测试包含原型不变量，双构建幂等。组件模拟验证交接、取消、乱序、归档及保存故障；未重跑浏览器视觉或真实宿主双窗口。 |
| 最近安装尝试 | 本轮以`file:D:\Projects\dsh-workbase\dsh-workbase-1.0.4-2238b2cd.tgz`重装到profile `desktop`（resolved 110／reused 4／downloaded 0／added 1，Done in 729ms，退出码1来自本机`osuply-loadtime.cmd`包装器、pnpm已成功），`dsh plugin list` 仍报 `dsh-workbase@1.0.4`，安装目录 `dist/index.js`（`6625f40a…fc0f`）与 `lib/client.js`（`8748f4c6…d292`）摘要与本机构建一致；宿主重启后才加载新代码。 |
| 当前宿主 | profile `desktop`的`dsh-workbase`依赖现为`file:D:\Projects\dsh-workbase\dsh-workbase-1.0.4-2238b2cd.tgz`；宿主进程未重启时仍运行安装前代码。registry的1.0.4是较早提交构建（devDeps `0.2.2-rc.1`、无`THIRD_PARTY_NOTICES.md`），与本地产物内容不同，不能按版本号判断是否已装新代码。 |
| 安装恢复证据 | 日志`/tmp/dsh-migration-native-install.log`，安装前备份`/tmp/dsh-icon-install.g7w0of/before-install.tgz`；权限600保存原插件与profile manifest。此前备份和失败日志保留。 |
| 宿主与发布 | DSH SDK与包兼容声明为`0.2.2-rc.5`，Cordis `~4.1.0`、Node22+。此前host:check为0阻断／1缺基线待复核、退出2，本轮未重跑或接受基线。仓库Git元数据完整（分支`main`，此前HEAD `50b6cb4`）；本轮37个文件的改动已按主题拆为7个提交（fake-ip放行、诊断判据、概览页头、快捷会话、待办对齐、迁移记录、语音标签与状态刷新），未推送或发布。 |

以上是功能修改和安装尝试的既有证据。后续维护不得把旧包、旧安装或历史测试数继续追加为“当前状态”；构建标识和安装标识分别更新，过程细节只保留在下半日志。

### 当前实现

**迁移执行验收**：归属、待办与回执在官方存储域global一次提交，随后通过官方WorkspaceRegistry移除原生源登记。此前隔离实际桌面模块验证了移除后重启不重建、撤销生成新ID并恢复工作台会话归属、日志不变；正式profile此前只补齐既有完成批次的源登记移除。本轮严重问题整改未重新迁移或撤销正式业务数据。历史会话头和执行目录保持原状，不能宣称跨目录会话执行迁移。

| 模块 | 已接入行为与维护入口 |
| --- | --- |
| 原生迁移登记生命周期 | `service.ts`完成后调用官方remove，`index.ts`启动及snapshot同步补齐旧批次。只移除回执原ID，登记失败保留已完成回执，重复确认只补移除；撤销register复用／恢复并同步新ID，保存失败清理确定新建登记。迁移备份允许已移出源登记缺失。维护契约与验收见HOST-COMPATIBILITY及migration-execution／migration-host测试。 |
| 项目迁移与撤销 | 首页／详情项目菜单按名称选择已有目标，同页自动预览、直接确认。四行对照、同排控件、共享抽屉与错误分层保持；真实路径及身份核对后，单次global写入sessionOwnership、待办归属、实体来源、源设置与完成回执。完成回执派生源项目移出状态，列表、搜索及诊断排除源项目，拒绝重新导入及普通业务写入；内部绑定保留供撤销，在目标项目菜单查看记录，撤销后恢复源项目，旧完成批次同样适用且到期不复现。全部工作台会话操作、搜索、诊断及Agent待办工具按新归属读取，不把源归属继续授权给迁出会话。明确ENOENT且源绑定有效可执行，权限、未知、冲突及运行状态阻断。批次ID等于令牌，重复确认及重启后重试读取原回执；失败恢复原状态，回滚失败隔离写入至重启。记录详情直接执行72小时内按批次撤销，保留编辑、目标原有／新增和删除状态；旧记录缺undo只读。恢复归档和显式恢复项目绑定同步映射迁移身份。维护入口`src/server/{service,migration,migration-ownership,tools}.ts`、`src/shared/{model,migration}.ts`、`src/client/MigrationPanel.tsx`。 |
| 私人订制与备份文案 | 四个档案菜单不显示目录及重复正常生效说明，范围合并至介绍，服务未就绪仍提示；备份保留密钥路径，精炼加密／独立保管与未覆盖提示，避免「观察副本」术语。 |
| 设置说明 | 通用、项目、扩展、私人订制、语音、备份恢复及终端约20处辅助说明精简，保留权限只读、已有文件保护、默认值范围与密钥保管；正式组件、英文词典及适用原型同步。短说明、字段上限、实际异常和恢复警告保留。 |
| 通用组件说明 | 四项说明采用简短句子，保留插件页更新用途、自动更新下次启动生效、终端停用保留设置及语音关闭停止播放／保留配置密钥；Settings、原型及英文词典同步。 |
| 插件更新文案 | 通用组件的入口开关标题与读屏名称统一为「插件更新」，英文Plugin updates；正式组件、原型、词典及已有禁用状态检查同步。 |
| 主题选择卡片 | 五个主题统一仅显示单选控件与名称，移除经典湛蓝及跟随平台的说明小字；Settings、主原型及内嵌设置演示同步，主题预览与保存行为沿用既有实现。 |
| 其他组件 | Settings复用SettingsSubtabs呈现「通用组件／语音播报」；通用组件保留插件更新及终端扩展开关，新增默认关闭的speechComponentEnabled。保存后由SpeechComponent控制会话喇叭入口、正文监听与状态轮询，停用停止音频并保留服务配置，条件页签与草稿显隐见UI规范第0.1节。 |
| 项目与个人整理 | 宿主工作区汇总、已有目录注册、新目录创建、重复检测、重命名、移除与身份恢复；宫格／列表、字段显隐、置顶／收藏及持久化偏好。归档是工作台绑定状态，归档后业务只读、个人标记可改、可恢复。 |
| 项目初始化 | `shared/project-initialization`及服务端初始化流程；基础文件、Agent规范、Git三组配置统一保存。导入补齐默认关闭，已有条目不覆盖；失败保存待重试记录，复用已登记工作区并支持原路径重试。 |
| 全局与项目规则 | `server/project-rules`、`rules-save`及`ProjectRulesSettings/ProjectRuleDetail/RulesEditor`；官方AGENTS发现、全局及多项目命名规则、开关、多选范围、Markdown编辑与预览。规则详情共用设置外层，650ms防抖串行自动保存；其他设置统一点击保存。 |
| 私人订制 | `server/personalization`、`personal-save`及设置四个子菜单；实际DSH主目录下的IDENTITY／USER／SOUL／MEMORY文件，官方fs优先、版本写入及限定目录授权，缺失时本机普通文件实现。官方systemPrompt独立section禁止插值，作用于后续提示词组装；部分成功逐文件推进，关闭不提交未保存档案。 |
| 语音播报 | `server/speech-stream/speech-fetch/speech`、`client/speech-stream-turns/speech-stream/speech-pcm/speech-playback/speech-session/SpeechControl/SpeechReply/SpeechSettings`；默认关闭，官方逐句WebSocket／PCM、兼容完整回合后MP3。顶部喇叭通过版本事务切换全局自动开关，关闭／启用使用不同图形；回复下方官方assistant-actions插槽按会话与messageId重播，当前会话播放时顶部与正在重播的回复声波动画，点击回复图标停止。关闭自动仍可显式manual播放，配置与owner校验不变。历史只更新正文索引，离会话释放索引、取消音频与该会话待播队列；手动期间遇到的实时attempt保持静音，防止抢占或从后缀续读。 |
| 会话与快捷输入 | 导航、新建、改名、归档／恢复、永久删除；独立SessionProvider复用官方输入、项目／模式、模型／推理强度、附件及语音入口。跨项目／模式保留正文和引用，上传失败可重试，提交失败保留草稿。 |
| 项目详情右栏 | `entry.tsx`、`ProjectSidebarController/ProjectSidebarHeader`；有可用会话才显示入口，只复用上次成功目标或最近候选，点击后才持有引用及展开。失效目标撤下，其他候选等待再次点击；服务契约不匹配不注册入口。 |
| 待办与Agent | CRUD、快速／完整创建、添加与搜索共用输入、优先级筛选排序、描述Markdown、文件／旧图片兼容、会话草稿交接及5秒删除撤销。Agent工具保留当前会话／项目身份、归档及全局管理权限限制；RSS工具只读且不扩大待办授权。 |
| 搜索与诊断 | 搜索项目名称／目录、会话标题、待办标题／描述；正文仅接官方实验套件。诊断目录、列表缓存、孤儿子代理和空会话，进入面板自动重查；确认后分批修复／删除，记录成功、跳过及失败。 |
| 首页与概览 | 默认运行中／待办／近期会话／技能／订阅五卡，诊断及连接器保留在完整七项排序中，最多显示六卡；拖拽及Alt＋方向键排序。概览顺序为运行中／近期会话／待办／诊断／技能／订阅／连接器。运行中、近期会话与待办共用「标题＋用途说明＋分隔线」页头，右侧列表不再重复标题；RSS标题下补充共用用途说明。 |
| 概览与弹窗生命周期 | `WorkbaseOverview`持有共享外层；技能／连接器／RSS及规则二级页以`ModalFlow`替换内容，保留列表、滚动、焦点与busy状态。面板操作统一根节点Toast，持久化成功但刷新失败明确区分。 |
| 扩展配置入口 | 七分类顺序为通用／外观／项目／私人／扩展／其他组件／备份；技能／连接器／订阅默认值统一保存。管理页设置图标直达对应子页，Settings持有扩展子页状态，跨一级分类保留草稿；概览外层保留管理内容并恢复滚动与焦点。历史停用目录仅在快照legacyStagedCount大于0时显示于技能来源。 |
| 技能 | `server/skills*`及`SkillsPanel`；来源发现、名称校验、创建／编辑、Markdown／JSON／目录／公开GitHub多文件导入、市场详情及分页安装、作用域策略、官方registry生效检查。受限同宿主安装由`skills-sandbox`通过官方confine执行目录事务，保留二进制、回滚与恢复；状态写后异常读回确认。关闭来源隐藏其技能，项目分组只显示实际`.agents/skills`记录。 |
| 技能市场 | 固定SkillHub／ClawHub，默认前者开、后者关，保留已有来源身份及开关。首批每源一页，按来源契约滚动续页；查询、来源或连接变化隔离迟到结果。安装状态依回执与已有记录匹配，不新增持久化市场身份。 |
| 连接器 | `server/mcp*`及`McpPanel`；配置、工具管理、官方HTTP／stdio连接、凭据库、OAuth PKCE／回调／刷新、导入及脱敏导出。项目分组按绑定范围显示，添加及市场表单共用单栏详情。界面称连接器，协议键及凭据引用保留MCP。 |
| 连接器市场 | 成功目录缓存至`workbase/mcp-market.json`，先读本地再后台更新；按来源ID／地址／查询隔离，最多20份及20 MB。空成功响应清旧条目，失败保留旧目录，停用来源不输出缓存；保存失败不丢在线结果。 |
| RSS | `server/rss*`、`RssNavigation/RssPanel`；RSS／Atom抓取、缓存、分组及来源排序／折叠、文章搜索阅读、静态原文提取、OPML、暂停及取消后30秒撤销。17条原生推荐来源保留双语元数据及MIT归因，浏览推荐不抓取。 |
| 设置、主题与语言 | 七分类设置、入口／启动／布局偏好；柔和紫晶、清新森林、暖纸阅读、经典湛蓝、跟随平台，新用户默认violet，旧选择保留。独立语言偏好默认follow，构建期静态翻译及官方locale订阅，不改变用户内容或宿主语言。 |
| 终端 | `TerminalSettings/ColoredTerminal`在官方终端页扩展字体、字号、Shell及独立配色；复用TerminalView身份和动作，四款Catppuccin下载只改草稿。字体列表取实际枚举，保存失败保留草稿。 |
| 插件更新 | 官方工具栏的独立overlay／portal入口，仅管理用户安装的非官方插件。三组动态卡片、互斥展开、后台批次与进度；关闭弹窗批次继续，自身最后更新，重启清批次。启动自动检查默认关闭。 |
| 备份恢复 | `server/backup*`及设置三个二级页；39类策略、加密回读、启动备份默认关闭、后台互斥任务、恢复预览及工作台替换回滚。全量文件发布至独立目录，扩展数据纳入来源。 |
| 审查整改 | 2026-11-22的`audit.json`中22项严重问题（P0×1／P1×21）已落实源码修复与回归，逐项位置和边界见根目录`audit-fixes.md`；原报告保留审查时点记录。6项警告与1项提示仍另行处理；第三方许可与现行检查门禁保留。 |
| 凭据与语音生命周期 | `speech.ts`及`speech-save.ts`绑定凭据供应商与HTTPS origin，旧格式无归属证据须重新填写，变更服务不复用旧密钥。非流式合成随配置代次及卸载取消；流式替换等待旧取消回执和清理，新正文持续更新至最后有效版本。 |
| 创建与原生提交保护 | 原生输入、待办交接和首消息创建先保存固定请求身份，`service.ts`在官方创建前持久化意图、成功后保存回执。已知结果复用，未知结果拒绝重复，重启及恢复旧备份保留当前回执；交接失败和取消不丢会话身份。原生发送领取与归档共队列的内存保护，活动及未知结果不超时释放，宿主终态才结束。 |
| 事务与删除恢复 | 设置使用编辑代次、同步锁、卸载检查和自身确认的revision；恢复双失败封锁后续写入。技能未知提交封锁所有来源写入；迁移规则区块随执行和撤销事务维护，待办撤销按项目及ID查重。会话删除先保存日志生命周期见证，物理成功后重试补齐清理；诊断级联预授权完整后代，归档后代存在时不删除。项目移除先保存方向，宿主读回决定撤销，未知不重复。 |
| 备份与扩展整改 | 四个私人档案按文件白名单备份；导出回读与恢复共用路径、冲突和容量准入。OAuth畸形回调400，MCP认证头改名迁移引用且导入显式transport优先；RSS排队取消传signal、共享读取按消费者取消。扩展摘要按模块代次丢弃迟到结果，技能客户端默认来源读取已保存配置，读取失败不自动选址。 |

### 仍在约束当前实现的结论

| 场景 | 当前结论及理由 |
| --- | --- |
| 迁移源项目移出 | 用户进一步明确宿主原生工作区也移除。保留内部源绑定与设置供撤销，completed回执落盘后调用官方delete，只删原workspaceId登记与显示顺序，目录和日志保留。启动及同步补齐旧批次，后来同路径新登记不自动删除；运行会话或源新增会话阻止清理。撤销先核验再官方create复用／恢复登记，更新新ID；存储未知时不删恢复登记。 |
| 两处小字精简 | 私人订制的路径对日常编辑无必要，正常生效说明不在每个菜单重复；必要范围保留在介绍，服务未就绪不隐藏。备份密钥路径及不随备份保存的后果直接关系恢复，保留；生成与自动选择细节归需求文档，界面只留关键结果，覆盖范围未扩大。 |
| 设置说明可理解性 | 按用户要求精炼其余设置说明，缩短重复标题及操作枚举；权限、已有文件保护、会话隔离缺失、密钥不在备份内及恢复范围仍明确。订阅频率适用于已启用来源，扩展介绍不再把它误写成仅新增默认值；业务行为与保存方式未变。 |
| 通用组件文案密度 | 用户要求长说明精炼，删除重复的按钮相对位置和二级菜单显隐描述；保留影响用户操作判断的生效时间与停用结果。只修改说明，不改变设置保存或功能行为。 |
| 更新入口命名 | 按用户截图移除开关标题的「显示」，入口位置继续由原说明表达；持久化字段pluginUpdateVisible与检查期间禁用逻辑沿用既有实现。 |
| 主题卡片精简 | 用户认为卡片小字冗余，名称足以表达用途；只移除卡片内说明，页面级明暗提示及即时预览说明按原规则呈现。原型同步清理指向已移除说明的aria-describedby，避免失效引用；无新增控件或尺寸变体。 |
| 扩展配置归属 | 默认值集中在全局设置，管理页只提供快捷入口；返回调用原项目规则关闭保护并清理主题预览，保留已提交结果。旧版目录按未删除登记技能的历史中转安装计数，不扫描整个磁盘或增加目录维护开关；没有登记历史安装时隐藏。正式设置切换使用普通设置滚动区域，避免继承概览overflow:hidden。普通概览列表复用resultHeader时不继承诊断专用固定高度；RSS用途说明在两个标签页一致。 |
| 语音设置精简与凭据边界 | 按用户截图保留精简配置项与既有布局。2026-11-22整改收紧凭据复用：仅供应商与origin相同且已有可信credentialScope时留空保留；旧格式及服务变化须重新填写，不发送旧密钥。此前若已跨服务发送，应撤销换新；源码不能撤回历史请求。本轮未安装或验收真实音频。 |
| 创建未知结果 | 官方创建未提供可复用的请求token契约，工作台持久化意图及结果，不尝试替宿主指定会话ID。只有意图且无结果时保守阻断；本进程已知结果可补齐持久化，重启后需核对宿主实际会话。不删除部分成功会话，不按超时清理回执，10000条上限拒绝新创建。 |
| 原生保护与验证层次 | 创建和发送按工作台最新归档状态检查，提交保护与归档串行；未知状态保留，终态监听独立持有引用。保护当前仅在服务内存中，跨宿主重启不保证持久保护。本轮验证源码、模拟组件及隔离故障，不等于真实宿主双窗口和语音服务验收。 |
| 官方能力与降级 | 官方宿主及官方可选插件优先，契约与降级判据按AGENTS和HOST-COMPATIBILITY维护；权限拒绝、取消、超时、未知状态及部分成功不能无条件降级。Forge只走官方requestWorktree流程，无自建降级；历史自建目录不物理清理。 |
| 迁移与撤销 | attachSession按不可变header.cwd拒绝跨目录；工作台持久归属为业务权威，归属／待办／回执在官方global原子写入。原生登记移除是随后独立步骤，不声称跨域原子：失败保留completed，读回已不存在可复用，仅重试登记操作。撤销登记恢复后保存失败清理本次确定新建的登记，未知存储结果不补偿删；原目录缺失要求先恢复。迁移备份允许completed源登记缺失，保留身份供撤销。需要在目标目录执行新任务时创建目标会话。 |
| 私人订制持久化与注入 | 文件是真源，提示词使用最近已校验的快照；外部编辑须重新读取或重新启用插件，已有请求不重组装。官方服务按每次操作探测，同一文件事务固定后端；权限拒绝不自实现降级。文件与设置不构成跨域原子事务，自实现不保证断电／外部竞争的全局一致性，不自动创建示例、解析头像路径或提炼记忆。 |
| 播报服务与队列 | 宿主无公开TTS输出服务；官方模式固定WebSocket接口及tts／bearer子协议，密钥不进URL、客户端、快照或导出。累计最多10000计费字符（汉字2）、64KiB、正文12000字符；全宿主仅一个合成，输出排队8MiB、总30分钟，浏览器提前量约4秒／首段80ms。连接15秒、输入空闲55秒，finish_text后改为音频空闲45秒；官方服务端ping由原生WebSocket自动pong，不发JSON心跳。工具、改写、失败或取消停止当前attempt，已读内容不能撤回；正文结束后取消仍停止音频，正常message＋step/end的空退休结算不停止。重连只建立静音基线，失败不续传、不重发、不切第三方。兼容HTTP保留45秒与8MiB、完整回复后三条队列及不跟随重定向；真实TTS与实际模型读取尚未验收。 |
| 播报图标与手动重播 | 已从实际宿主源码核对官方`conversation.chat.assistant-actions`的list／session／messageId契约；按声明生命周期注册，不覆盖宿主消息或复制／反馈动作，旧宿主缺插槽时不注册。顶部仅一个自动开关、通过speech-save版本事务同步，保存不传密钥；手动以owner请求的manual标记使用关闭自动的已存配置，缺配置／密钥仍拒绝。图标沿用官方尺寸与颜色令牌，错误和缺配置原因在Tooltip；当前验收仅官方原子组件与会话／TTS模拟，真实宿主消息行仍待安装后验收。 |
| 播报状态与动画 | 顶部关闭／启用分别读取视觉真源speaker-off／speaker；播放状态限定当前session，手动播放不改变全局自动开关。声波以错相透明度循环变化，停止恢复静态，prefers-reduced-motion禁用动画；宿主插槽在工作台作用域外，动画在styles.css适配。四组浏览器验证图形差异、真实动画透明度变化、空闲静态、其他回复静态、减少动态效果及停止恢复，证据在speech-actions-checks.json。 |
| 语音组件总开关 | preferences.speechComponentEnabled默认false，与凭据库config.enabled自动播报开关独立；旧状态缺字段时默认停用，偏好补丁移除默认值，防止其他配置更新重置此开关。SpeechComponent只在启用时读取及轮询播报状态；关闭停止音频，SpeechControl／SpeechReply共享其可读状态并释放会话索引。设置中的条件语音页签复用SettingsSubtabs，停用不提交隐藏语音草稿。 |
| 本地同版本安装 | 宿主pnpm11.28.5／hoisted会保留同路径同版本tarball的旧安装文件，锁文件的新integrity不能证明node_modules更新。隔离复现普通add和add --force均返回旧内容，更换tarball路径后才更新。未发布构建用内容摘要后缀区分路径，安装后逐文件核对；不为绕缓存手改semantic-release版本号。 |
| 正文搜索 | 仅官方实验套件启用且隔离组就绪时搜索正文；缺失、停用或未就绪只搜标题。套件确认可用且未默认隐藏才提示依赖，不接主索引、不修改其配置。最多20条，暂无消息精确定位及命中次数。 |
| 技能保存与生效 | 创建／编辑走文件事务，启停只保存工作台策略，外部正文只读。官方snapshot确认路径、调用权限及完整性；shadowed／unavailable／pending分别反馈，pending不计错误。已保存不等于已生效，已加载上下文不能保证撤回；遗留journal阻断后续写入。 |
| 技能受限宿主事务 | 官方fs无目录事务API，同宿主路径精确映射且官方sandbox提供full约束时执行固定Node程序，每次只授权变更父目录；创建缺失目录逐级临时授权最近现有父目录。缺沙箱、partial、read-only、映射失败或拒绝不转无约束写入。状态抛错后完整新旧内容三态确认，未知结果保留新文件与日志，初始化按提交标记清理或回滚。macOS官方Node与实际Electron隔离测试通过；Linux绑定根存在契约有断言，未做Linux沙箱实机或用户页面安装验收。 |
| 技能名称、发现与导入 | 保留安全Unicode显示名，中文等名称生成稳定调用名；调用限制及frontmatter不能在编辑／导入丢失。发现最多2000条目／20层，缓存复核授权、链接和文件身份，普通快照不进入变更队列。导入最多500文件／20 MiB，固定Git提交并确认摘要，拒绝链接、越界、重叠、子模块、私网及不完整索引；不支持私有仓库或任意压缩包。 |
| 扩展作用域与所有权 | 全局与项目范围双向互斥，项目可多选；管理仅owner可调用，不接管社区插件配置。技能来源开关与单技能策略独立；来源删除不删除已安装技能。Agent RSS增量游标按真实会话隔离，读取缓存不推进游标。 |
| 连接器凭据与运行状态 | 保存配置不代表握手成功，市场按HTTP端点或stdio命令／参数匹配，不按名称猜测。凭据仅进官方vault，绑定声明必须明确env/header；WB_MCP引用允许HEADER／ENV／ARG／AUTH／OAUTH后缀且仍校验条目归属。OAuth使用严格JSON grant及分段刷新计时；清理未确认的关闭句柄阻断该实例后续启动／替换／移除，须重启宿主。按会话启用仍禁用。 |
| RSS传输与正文 | 官方HTTP服务不满足逐跳地址校验及完整响应限制，故独立传输／存储；原文内网许可仅限订阅同源。最多500源／100组，缓存8 MiB／2000篇／每源200篇，单响应2 MiB、并发4、超时15秒、最多5跳。失败保留缓存，暂停／变更后的旧结果不提交；静态提取不执行脚本或加载资源，短于100字视为不可提取。 |
| RSS阅读与统计 | 原生及原文共用安全结构，优先官方MarkdownText，缺失安全降级，不注入HTML或加载外部图片；首帧骨架，失败才显示摘要／旧正文。结构补齐不改sequence。首页及列表均按`home.statDays`内有效发布时间计启用来源缓存文章，不用fetchedAt，不提供局部时间例外；未刷新／失败的覆盖限制保留在说明中。 |
| RSS导航与默认分组 | 默认分组不可改名／删除，以ungroupedPosition参与排序，全部订阅固定置顶；新建默认系统分组，OPML自身分组优先。分组整行立即筛选并切换折叠，独立控件不冒泡重复执行；分组与订阅无双击改名，F2／菜单编辑。折叠本地立即显示、后台按组串行保存，失败恢复最后成功值。删除分组保留成员，取消订阅撤销恢复同一身份及缓存。 |
| 首页偏好与摘要 | 仅升级旧标准组合，保留自定义排序／显隐；相同标准值无法区分手动选回，按标准组合升级。完整排序保留隐藏卡；最近会话样式只在统计开启时渲染为按钮，不改保存偏好。技能按已确认全局可用调用名去重，连接器计已连接服务，诊断计四类异常总数。 |
| 规则、初始化与恢复身份 | 规则默认关闭，最多50条／正文20000字符，启用须非空及有效项目；全局仅写DSH home、项目仅改标记区块，外改或旧草稿拒绝覆盖。未变化项目不阻断全局保存。补齐保留已有文件及Git，已有AGENTS不追加引用，自定义提交规则原样保留（10000字符）；仅精确匹配旧内置模板才归一化，Makefile保留Tab。恢复按唯一目录保留当前项目身份，无法映射阻断；文件事务不保证断电或外部进程竞争的跨域原子性。 |
| 诊断与永久删除 | 空会话以官方blank、lastPromptAt、冷会话及完整投影水位判断，缺投影／落后不凭标题删除。保存首次日志见证并逐项复核活动、revision、水位及后代；批次最多20条／30 KiB，关闭只停止后续请求。搜索不缩小批量删除范围；失败保留未完成目标，成功才清关联，级联可能部分完成。归档项目只读，磁盘枚举失败不能回退正常。 |
| 快捷输入、附件与右栏 | 文件导入共用官方bar.addFiles、限制和上传状态，上传中／失败阻止发送。跨项目／模式按官方addAttachments→rebindDraftFiles→正文交接→removeAttachment顺序转移，失败保留旧引用；全部附件读取完成并等待界面接管后释放，无固定延时。右栏只读核项目、归档、header.cwd及有效目录，点击才连接，不创建会话或改变Agent目录。语音仅镜像官方活动组件，未挂载隐藏，不自动启用。 |
| 待办权限与附件 | 待办删除5秒撤销保留原ID、引用及状态并增加版本；Agent不能使用用户撤销接口。附件合计10个／单个10 MiB，旧图片兼容、不删共享对象；Agent引用须来自当前会话。普通RPC32 KiB，owner规则／设置40 MiB、消息128 KiB；正文附件走owner二进制路由，原文件POST streaming、GET使用/content buffered。会话交接只准备草稿，由用户发送。 |
| 宿主入口与更新生命周期 | 保留官方Root注册项、children与授权，只可逆适配已核契约；自定义终端只替换显示，不新建终端／目录或伪造输出。启动打开工作台默认关闭，仅桌面启动选择一次，不因重连抢页面。更新热重载只保留窗口批次，不持有旧代理；在途响应丢失为unknown，卸载停止未开始步骤，重启清批次。 |
| UI维护与文案 | 共用规格只维护UI-DESIGN第0节，样式真源及生成链见AGENTS；不在日志复述所有字号／颜色／间距。设置分区介绍保留，只有用户指定两处说明强制单行并保留全文title；错误、禁用原因、范围及覆盖／截断边界保留。弹层边界取dialog／面板／视口交集，断点按面板，能力查询留media；五卡900px以上单行，899px及以下三列、719px两列、419px单列，六卡960px及以上单行、720–959px三列。 |
| 迁移交互与执行边界 | 按名称选择目标后直接执行；源明确缺失且绑定一致可迁入，撤销要求目录恢复。确认／撤销核验回执、实体归属、身份及运行状态，缺少官方登记生命周期能力阻止新迁移。原生源登记经官方delete移除，历史执行目录及日志不改；不暗示宿主具备跨目录会话事务。 |
| 语言与主题 | 构建只翻译静态源码及模板，动态标签延迟查词典；用户内容、标识键及Agent草稿不自动改写，官方复用组件保持宿主语言。跟随平台按语义继承令牌，缺失逐项回退；新增客户端文案补英文词典。终端ANSI预览仅为设置页局部配色例外。 |
| 备份与激活边界 | 恢复先预览确认再复核摘要／版本，替换工作台前留加密回滚；会话、附件、SQLite及Profile只发布到新目录，尚不原位激活。密钥`backup/identity.txt`须独立保存；客户端草稿、自定义附件根及跨源关联未完整覆盖，观察副本不是全局一致恢复点，外部授权需重新验证。 |
| 审查与公开边界 | C21／C22／C23未关闭：当前文件脱敏不能清除历史个人邮箱／用户路径及未确认内部示例；原索引已删除，镜像不能证明其状态。历史改写未经授权未执行，不据此完整放行公开；扫描结论只对当次文件及方法有效。 |

### 限制与未完成验收

| 范围 | 当前边界 |
| --- | --- |
| 最新桌面构建 | 原生源登记移除版已安装重启，7文件及宿主进程核对。实机旧完成批次源登记已移除，目标、迁移回执与11份日志保持；隔离官方模块验证重启与撤销。正式数据撤销、实际模型调用及本轮浏览器视觉未验收；Windows记录不覆盖最新修改。 |
| 真实宿主与外部服务 | 真实模型发送、附件上传／引用切换、目录选择、会话物理删除、项目规则的模型读取、技能上下文撤回、正文搜索套件启停及真实命中、外部OAuth、在线自更新未完成全链路验收。 |
| 完整视觉与设备 | 最新模拟宿主定向检查不等于真实profile或完整设计矩阵；英文360px一级设置导航仍有名称挤压。低高度、软键盘、缩放、字体权限、触屏及跨平台快速操作需实际复验。 |
| 数据与规模 | 迁入已有项目及72小时撤销已接工作台持久事务与原生源登记生命周期；未关联目录的绑定修改和跨目录会话执行切换未实现。归档为插件状态，宿主原生归档视图不感知。诊断跨进程竞争、大会话库性能及全量恢复原位激活未验证；日志大小不含附件和完整目录。 |
| 宿主基线及远端门禁 | rc.5静态安装核对一致，但基线尚未接受；当前副本无Git，原索引不能恢复证明。真实fork PR、远端分支保护、Secret Scanning／Push Protection及OIDC设置未由本次验收确认，模型菜单兼容边界见HOST-COMPATIBILITY。 |

原型模拟、本机测试、模拟宿主浏览器、安装一致性和真实宿主行为是不同证据层次。旧证据仅覆盖其当时构建，不据此宣称全部PRD完成。

### 保留的验收证据

| 材料 | 用途与保留边界 |
| --- | --- |
| 根目录审计记录 | 待更新：恢复缺失的`audit.html/audit.json`；原验收数字保留在历史日志。 |
| 文案审查归并记录 | 长期规则归入UI-DESIGN第0.1节，执行结果及验证见2026-11-21历史条目；43文件／186节点的当次AST附录与调整前对照已归档，恢复位置见2026-11-22过程文件精简记录。 |
| 早期逐模块视觉对照 | 旧记录引用`verification/index.html`、`checks.json/geometry.json/details.json/details-before.json`、`header-motion-checks.json/current-contrast-evidence.json/navigation-settings-026.webp`，本次核对这些文件在当前副本中均缺失，不能当作现存可读证据。历史几何容差2px，不是逐像素一致；其余旧截图仅覆盖对应版本。 |
| `docs/ui/verification/extensions/results.json/final-audit.json` | 正式三模块接入时17项流程、90组矩阵、690项检查及RSS／标题几何复核；MCP浏览器后端模拟，官方握手由对应宿主测试验证。 |
| 旧批次截图归档 | 按用户授权归档538张截图至`out/docs-images-20261122.tgz`，原路径及SHA-256在包内manifest；verification现存38张历史代表图。4个缓存／重复文件已移入`.trash/docs-20261122/`，恢复清单为该目录`manifest.json`。最终报告、官方源码摘录及全部过程脚本保留，分析及执行结果见根目录`docs-files.md/json`与`docs-files-result.json`；原截图路径须结合归档恢复读取。 |
| 隔离宿主记录及源码摘录 | 功能记录覆盖待办、恢复、模式和模型读取；正文接口空结果只证明接口可用。`verification/harness-source/manifest.json`及源码摘录保留官方右栏契约核对依据。 |
| 验收支持文件及本地包 | `docs/backup-data-inventory.json`被测试用于39类策略映射；`docs/verify-*.mjs`、三个`ui/*-check.cjs`、`visual-fixture.tsx`、`isolated-search.patch.yml`保留。最新包及安装备份路径见首表；根目录同版本包属于较早审查构建，不能凭版本号认作最新包。 |

`docs/ui/verification/`被Git忽略，混有报告、截图及过程脚本，不能整目录删除。当前报告引用和历史独有证据须先确认再清理；已归并的过程材料按日志中的恢复清单查找，不再作为活跃维护入口。

### 验证方式

```sh
npm run check                 # 秘密扫描、类型检查、测试及构建
npm run host:check            # 只读宿主契约与安装检查，接受基线另行显式执行
node docs/ui/pin-favorite-check.cjs
node docs/ui/design-fix-check.cjs
node docs/ui/design-color-check.cjs
```

视觉与真实隔离宿主工具按AGENTS准备环境：`DSH_UI_PLAYWRIGHT`、`DSH_UI_CHROME`、`DSH_UI_EVIDENCE_DIR`由`docs/visual-env.mjs`共用，真实宿主工具必须显式设置`DSH_UI_HOST_LOG`。Playwright可隔离安装在仓库外；WebP编码使用`evidence-image.mjs`，批量转换使用`compress-evidence.mjs`。部分历史过程脚本仍依赖临时目录，不视为通用CI入口。跨平台切换须重新安装含平台二进制的依赖。

`docs/isolated-search.patch.yml`仅用于隔离环境；`--patch`属于launcher参数，必须显式指定web profile。以下为测试配置，不表示服务正在运行，不使用正式profile：

```sh
DSH_HOME=/tmp/dsh-workbase-host-022rc1 DSH_TELEMETRY_MODE=DISABLED dsh --profile web --patch "$(pwd)/docs/isolated-search.patch.yml" --no-open --port 8791
```

日志精简验证（2026-11-22）：`npm run check`通过，秘密扫描0命中、类型检查通过、565项测试通过／3项跳过／0失败、构建通过；两端摘要与首表一致。历史正文逐字节不变，4项发布标记在隔离副本升级及重复执行均通过，当前状态相对链接有效。复核脚本及完整输出在`/tmp/dsh-log-trim-20261122/verify.mjs`、`verification.json`及`check.log`；本次未重跑浏览器或真实宿主验收，未安装、发布。

### 安装与发布

当前版本 `1.0.4`；registry包完整性校验入口为`dsh-workbase-1.0.4.tgz`（完整性校验用 `npm view dsh-workbase@1.0.4 dist.integrity`）。registry integrity仅校验registry包；本地包使用实际产出路径及SHA-256，最新构建与已安装构建分别见首表，同版本号不证明内容一致。

版本由semantic-release按提交type推断，GitHub Actions发布、CNB定时镜像及凭据配置统一见[AGENTS发版规则](../../AGENTS.md#发版)。本地pack前必须build，pack本身不触发构建；7项发布文件以package白名单及npm自动包含项核对，源码／设计／过程与验收证据不入包。发布前按当前文件重新检查，不沿用旧扫描。

维护本节时保留`当前源码与本地包为`、`当前版本`、版本化tgz名、完整性校验提示及唯一的`## 日志`分界，供`release-sync-docs.mjs`匹配；该脚本只更新分界之前，不改历史。过程日志保持原文，不把旧安装记录重新解释为当前状态。

## 日志

### 2026-11-22 · 半完成发版回滚：删除 v1.1.0 标签与发版提交，修复后干净重发

**背景**：lockfile 修复推送后，发布 job 的 semantic-release 走到 publish 阶段才失败——prepare 阶段的发版提交与 v1.1.0 标签已推回 GitHub，但 `npm publish` 触发 `prepublishOnly`（npm test）因缺 uv 失败，npm 仍是 1.0.4、GitHub Release 未建。若保留标签，下次推送会按 patch 发 1.1.1，与提交 subject 的 1.1.0 永久错位。

**决策**：经用户确认，删远程 v1.1.0 标签、force-with-lease 去掉 CI 生成的发版提交（机器提交，生成几分钟且无人依赖），把 setup-uv 修复 rebase 后干净重发 1.1.0。教训：semantic-release 的 git prepare（提交+标签）先于 npm publish 执行，publish 失败会留下半完成状态；恢复时优先清理标签重做，不让版本号错位固化。

**证据**：gh run 45026758185 日志（Found 11 commits since last release → prepare 完成 → publish 阶段 `prepublishOnly` 失败）；`npm view dsh-workbase version` = 1.0.4 佐证未发布；262e6bf 与 v1.1.0 已删除。

**遗留**：无。

### 2026-11-22 · 发布 job 缺 setup-uv 导致 npm test 失败，与门禁 job 对齐

**背景**：lockfile 修复推送后门禁 job 通过，发布 job（semantic-release 的 npm prepare 触发 `npm test && npm run typecheck && npm run build`）在 `test/build-compliance.test.ts` 的 WebP 编码器测试失败。该测试（4c5ea32 新增）探测 `cwebp→magick→python(uv+Pillow)`，发布 job 只装了 node，没有 `astral-sh/setup-uv`；1.0.4 时代该测试不存在，故此前未暴露。

**决策**：发布 job 补 `astral-sh/setup-uv@v6`，与门禁 job 环境对齐；不放宽测试断言——门禁 job 同一套测试已验证 uv 存在时可通过。

**证据**：gh run 45026758185 门禁 job 全绿、发布 job `not ok 29 - 截图模块生成真正的 WebP`；release.yml 门禁 job 第 36 行有 setup-uv、发布 job 原先没有。

**遗留**：无。

### 2026-11-22 · lockfile 镜像直链导致 CI npm ci 失败，改写回官方源

**背景**：拆分提交推送后 GitHub Actions 门禁失败：npm 11.6+ 默认禁止 fetch remote 类型包，`package-lock.json` 里 linkedom 及其传递依赖共 21 条 `resolved` 指向 `registry.npmmirror.com` 直链（4c5ea32 引入 linkedom 时在镜像源环境下生成），CI 报 `EALLOWREMOTE: Refusing to fetch "uhyphen@https://registry.npmmirror.com/…"`。

**决策**：把 21 条 npmmirror `resolved` 改写为 `registry.npmjs.org`（URL 路径一致、integrity 不变）。不用 `--allow-remote` 或在 CI 配镜像——门禁环境不可控，官方源是唯一稳定基线；今后在镜像源环境生成 lockfile 后需检查 resolved 是否被改写。

**证据**：本地 `npm ci` exit 0（integrity 全部通过，证明镜像与官方 tarball 字节一致）；失败日志见 gh run 45026343752。

**遗留**：无。`PluginUpdate.tsx` 的 npmmirror 引用是镜像源 UI 标签判断，与依赖安装无关，保留。

### 2026-11-22 · 迁移记录补源项目状态快照与实体清单视图

**背景**：迁移记录此前只有数量对照与确认／撤销动作，回看批次时看不出源项目当时有哪些会话与待办、各自什么状态；源项目确认迁移后登记可能被移除，记录是唯一留存却缺源侧上下文。确认与撤销失败只在面板内联提示。本轮按约定先补日志条目再提交。

**决策**：`src/shared/migration.ts` 的 `migrationRecordSchema` 为每条实体增加可选快照字段 title／archived／running／done，并新增 `migrationCountsSchema`（active/archived/pending/done）与可选 `sourceState`（available/archived/agentCanChangeStatus/counts）；旧记录缺省字段保持只读兼容。`src/client/MigrationPanel.tsx` 新增源状态视图与实体清单视图，在记录详情展示迁移时点的源项目可用状态、数量对照与逐条实体标题及标记；确认与撤销改走根节点 Toast（`Workbase.tsx` 传 notify）。`src/server/project-rules.ts` 对 realpath ENOENT 返回 `directory-unavailable`（「项目目录不可用，无法保存规则」），替代裸错误。原型 `.wb-migration-content` 由 max-width:860px 改 min-width:0 放宽详情列宽。

**证据**：`node node_modules/typescript/bin/tsc --noEmit` 通过；`npm test` 755 项中 730 通过／18 失败／7 跳过，18 项失败全部为环境限制（`EPERM: symlink`、Git 初始化、`spawn sqlite3/node.exe ENOENT`），其中 backup 与 market 两条断言在 HEAD 基线 worktree 复跑同样失败，与本轮无关；`test/migration-execution.test.ts`／`test/migration-render.test.ts`／`test/project-rules.test.ts` 通过并覆盖快照与目录不可用文案；`node build.mjs` 连续两次幂等：`lib/client.js` 1767215 字节 SHA-256 `5302746136d1548d1fb426b18904430dd93cb5921b00092854f45ec53769f2b6`、`dist/index.js` 2715640 字节 SHA-256 `5375ac0973140885dbc1c0142e0fdeb84330b3ef04bcdb1cd0df87bf1b8be548`；`node secret-scan.mjs` 0 命中。

**遗留**：构建产物未重装到 profile `desktop`，宿主重启前界面仍跑旧代码；快照记录的是迁移时点状态，不随源项目后续变化更新。

### 2026-11-22 · 空会话延迟到首次输入才创建，浏览首页不再产生空会话

**背景**：用户追问两点——进入首页是否就创建空会话；快捷输入框选定项目就立即创建空会话是否不合理，应发送时再建。确认现状：`ComposerMenu` 挂载 effect（`src/client/NativeComposer.tsx` 398 行起）立即调 `prepareNativeComposer` 按 `[workspaceId, preset]` 键建／复用空会话并绑定官方输入壳（斜杠菜单、@引用、附件上传、草稿交接、模型选择都挂在会话上）。完全「发送时才创建」需要放弃官方输入壳退回自制输入框，代价大；与用户确认后取折中：首次输入／粘贴／附件／添加上下文时才激活创建。

**决策**：在 `src/client/Composer.tsx` 引入「未激活」态：持久化 `memory.composer.nativeArmed`（`src/client/api.ts`），未激活时不渲染 `ComposerMenu`、不建会话；输入 onChange／paste／拖入文件／点「+」触发 `armNative` 置位激活，`pendingActivation` ref 携带本次本地文字经新透传参数 `activationDraft`（`ComposerMenuProps`，`src/client/api.ts`）传给 `prepareNativeComposer` 第 9 参，`!from` 分支改为 `requestDraftInitialization(binding, { prompt: activationDraft, whenDraftExists: 'replace' })`（附件保留，`whenDraftExists` 语义见 `dsh-client-ui-conversation` `contract/input.ts:244-252`）；拖入的文件在激活前暂存于 `stash` ref，`onReady` 后 flush。常规挂载（详情页右栏等）不传 `activationDraft`，保持原 `sameDraft`/`nativeDraft`/`keep` 语义。`src/client/launch.ts` `submitNativeMessage` 发送成功清 `nativeSessionId` 时同时 `nativeArmed: false`，回到未激活态。

**证据**：`npm run typecheck` 通过；`npm test` 752 项中 727 通过／18 失败／7 跳过（18 项仍全部为符号链接／Git 环境限制），`test/native-composer.test.ts` 新增「延迟创建首次激活时以输入框文字替换宿主草稿；常规挂载仍保留官方草稿」（断言 seeds 为 `{prompt:'本地输入', whenDraftExists:'replace'}`／`{prompt:'本地输入', whenDraftExists:'keep'}`），`test/composer-files.test.ts` 新增「未激活时输入与拖入只置位 armed 并暂存文件，不触碰会话桥」，三个相关测试文件 41/41 通过；双构建幂等 exit 0，`lib/client.js` 1764886 字节 SHA-256 `8748f4c672243a9562c18734a95746dbd944551beb0561ec1ce1fde70654d292`，`dist/index.js` 2713370 字节 SHA-256 `6625f40a…fc0f` 不变。需求句已写入 `docs/PRD.md` 147 行，「当前状态」已同步。

**遗留**：构建产物未重装到 profile `desktop`，宿主重启前仍跑旧代码；真实宿主交互未验证（预期行为：激活瞬间模型区短暂空白、发送按钮在模型就绪前禁用）；升级用户记忆若残留旧 `nativeSessionId`，首次激活会复用该会话并以输入框文字替换其旧稿。

### 2026-11-22 · 快捷会话失效身份自动换新，不再报「不属于当前项目」

**背景**：用户截图报首页快捷会话出现「原生会话不属于当前项目」与「重试」按钮。取证确认根因链：诊断「删除空会话」（`src/server/diagnostics.ts` 经 `session-maintenance` 走 `maintenance.deleteWithinQueue(sessionId,{coldOnly:true,evict:...})`）会删掉首页预创建并存入页面记忆（`memory.composer.nativeSessionId`／`nativeHandoffs`，key=`JSON.stringify([workspaceId,preset])`）的空原生会话；再进首页时 `prepareNativeComposer` 复用旧 id，服务端 `checkNativeSession`（`src/server/service.ts:1231-1248`）因 `workspace.sessionIds` 不含该 id 抛 `WorkbaseError('forbidden','原生会话不属于当前项目')`（service.ts:1242）；客户端 `staleSessionError` 正则只匹配 unknown session／会话不存在／会话已被删除／no such session，不含这条消息，换新会话兜底不触发，「重试」仍用同一失效 id，永远失败。

**决策**：只动客户端恢复路径，不动服务端鉴权（会话必须属于当前项目的鉴权语义本身正确）。两处：①`src/client/NativeComposer.tsx` 的 `staleSessionError` 正则扩为 `/unknown session|会话不存在|会话已被删除|no such session|不属于当前项目/i`；②`prepareNativeComposer` 创建块加 try/catch——`access.create`／`ctx.sessions.create` 抛错且 `previous` 非空且命中 `staleSessionError` 时，清掉 `pending[key]`、`saved.creationRequests[requestKey]` 与 `nativeSessionId`/`nativeWorkspaceId` 并 `memory.save()`，随后不带 previous 重建（access 路径用新的 `crypto.randomUUID()` requestId）；未知错误仍保留原身份，维持「未知网络错误不换身份重建」的既有语义。

**证据**：`npm run typecheck` 通过；`npm test` 750 项中 725 通过／18 失败／7 跳过，18 项失败全部为 `EPERM: symlink` 或 Git 初始化类环境限制（改动前同样失败，与本次无关），新增测试「记忆里的会话被清理（如诊断删除空会话）后换新会话恢复，不再报不属于当前项目」通过（断言 `access.create` 的 previous 调用序列 `['a','']`、memory 状态恢复、`creationRequests` 清空，在 `test/native-composer.test.ts`）；`npm run build` exit 0，`lib/client.js` 1764085 字节 SHA-256 `2f9c43f1e8a4f3babdabea7c4ad871c6272bd70d26911b5cc1d8989e9f663444`，`dist/index.js` 2713370 字节 SHA-256 `6625f40a7c5f3c0ef7b36d73fc47fce60e00dc7191bc30ccafb09f03664afc0f`（与上一轮一致，服务端无改动）。

**遗留**：构建产物未重新打包安装到 profile `desktop`，宿主重启前界面仍跑旧代码；需按既有流程 `npm pack`、改摘要名重装后重启验证快捷会话恢复路径。git 工作区 24 个文件未提交（本轮新增改动为 `src/client/NativeComposer.tsx` 与 `test/native-composer.test.ts`）。

### 2026-11-22 · 诊断判据修正：缓存缺失不再是异常，空会话按官方冷读折叠复核

**背景**：用户复测仍报「删除后还是会显示重建缓存，无法删除」，9 个会话在诊断里反复出现「列表缓存异常」，重建与删除都消不掉。取证（官方 `dsh-session-projection-cache` 0.2.2-rc.5 源码 + 本机 `~/.dsh` 磁盘核查）确认根因链：①工作台把「无缓存行」当异常，而官方缓存是可丢失、可重建的派生加速数据，缺失走正常冷读——这成了永久修不掉的假异常；②宿主冷列表（`api-session-controller` 的 `summarizeCold`）在缓存缺失时保守返回 `blank=false`，工作台空会话检查因此跳过这些会话，它们又不属于任何工作区、侧栏不可见，唯一入口只剩「重建缓存」，形成死循环。9 个会话日志全部无 `turn/start`、无 `user/message`（只有 permission/preset、sandbox/mode、approval/policy、command/run×123、command/done×123、session/end-seed），按官方投影语义全部是空会话。

**决策**：两处判据一起修。①缓存检查改为纯接口健康检查：只对每个 stored 头部调 `cachedSnapshot` 确认接口可用，不再产「列表缓存异常」修复项（`repairDiagnostics` 的 cache 重建分支保留但不再有真实候选，重建失败消息改为统一 skipped）；②空会话检查在索引说 `blank=false` 时先查缓存行 `sessionListMetadata`——缓存证明非空的直接跳过，否则用官方 `sessionProjectionCache.coldSnapshot` + `sessionPersistence.open` 读完整日志折叠复核（折叠结果由官方 fail-soft 回写缓存行，后续检测回到快速路径），blank 且 lastPromptAt=null 才发候选，身份用 `[identity(h), h.createdAt]`（空会话 updatedAt=createdAt，与索引快速路径身份一致，复查不误跳过）。诊断面板空状态与说明文案、i18n、PRD、HOST-COMPATIBILITY 同步新语义。

**证据**：`src/server/diagnostics.ts` 缓存检查不再要求 sessions/waterfall；`test/diagnostics.test.ts` 32/32 通过——夹具 `coldSnapshot` 改为语义 mock（按 events 算 blank/lastPromptAt 并回写 snapshots）、`persistence.open` 改为功能性；重写「诊断只读头部与缓存」（cache 期望改 []）、「修复只使用内部维护接口」（删缓存重建段）、「服务快照合并」（补 controller 断言 empty issue 归属）、「修复RPC仅所有者」（改 empty kind）；新增 3 例：折叠复核+回写+身份一致+二次不读日志、turn/start 后不判空+缓存证明非空不读日志、折叠候选可删除。`npm run typecheck` 通过；`npm test` 749 项中 724 通过／18 失败（全部 `EPERM: symlink`，与本轮无关）／7 跳过；`test/diagnostic-panel.test.ts` 说明文案断言同步更新后 42/42。两次构建摘要一致：`dist/index.js` 2713370 字节 SHA-256 `6625f40a…fc0f`，`lib/client.js` 1763793 字节 SHA-256 `30389be7…ed8b`；`node secret-scan.mjs` 0 命中；包 `dsh-workbase-1.0.4-0cfafbf8.tgz`（1009187 字节）已装 profile `desktop`（added 1，Done in 713ms）。

**遗留**：宿主未重启，界面仍跑旧代码；重启后 9 个会话应显示为「空会话」而非「列表缓存异常」，可直接单删或一键删除，预期首次检测会为无缓存行的会话做一次性日志折叠（含一个 13MB 解码日志，秒级）。若删除仍有失败项，需按 failure 明细继续排查（本机无法旁路 GUI 的 401 认证做在线验证）。24 个文件未提交。

### 2026-11-22 · 概览运行中与待办补用途说明并去掉列表重复标题

**背景**：用户截图指出统计卡的运行中、待办弹窗内容缺少近期会话那样的标题与说明，要求与近期会话一致。上一轮（同日「补齐概览列表标题与订阅说明」）按用户要求给两页右侧列表补了「运行中会话／待办列表」小标题，本次方向相反：页头补齐后该小标题与页标题重复。

**决策**：三页签共用同一页头——`stats-page-heading` 标题加 `stats-page-description` 一行说明（运行中「当前正在运行的会话。」、近期会话沿用「最近 N 天更新的未归档会话。」、待办「尚未完成的待办，含手动创建与 Agent 创建。」），说明下沿用原型既有的 `padding-bottom:16px` 与 `1px` 分隔线，不新增字号、间距或新样式规则；删除 `Home.tsx` 传给 `StatsProjectPanel` 的 `resultHeader`，右侧列表不再重复标题。`StatsProjectPanel` 的 `resultHeader` 属性保留——诊断分类模式（`DiagnosticsPanel.tsx:204`）仍在使用。视觉真源 `docs/ui/ui-directions.html` 的 statsPanel `labels` 同步补两句说明并删除 `resultHeading` 拼装，避免真源与实现漂移；`docs/UI-DESIGN.md:7` 与本文「首页与概览」行改为新规则；英文词典补两条译文。

**证据**：`node node_modules/typescript/bin/tsc --noEmit` 通过；`node --import tsx --test "test/*.test.ts"` 746项中721通过／18失败／7跳过，18项失败全部为环境限制（11项 `EPERM: operation not permitted, symlink`、Git 缺失的初始化用例、`spawn node.exe ENOENT`），改动前同样失败，与本次无关；新增用例「概览运行中、近期会话与待办共用标题加说明页头，右侧列表不重复标题」在 `test/ui-interaction.test.ts` 覆盖三页标题文本、说明文本、单一 `stats-page-heading` 以及「运行中会话／待办列表」不再出现。`node build.mjs` 连续两次输出客户端 1762884 字符，`lib/client.js` SHA-256 均为 `8F1AD50BC0E4DD6CB3A140741160233F8B47E3E457FC0383A9D053304E668432`；`node secret-scan.mjs` 无发现。构建产物中的英文译文已确认进入 `lib/client.js`（`Sessions that are currently running`、`Open tasks, whether created manually or by an agent`）。本沙箱下 `npm run check` 不可用：npm.ps1 与 Node 测试 runner 依赖管道 stdio，需要完整访问权限才能执行。

**遗留**：未在真实宿主或 Playwright 中截图复核三页页头的实际间距与分隔线，视觉验收仍需在实际抽屉宽度下确认；原型待办页页头带「添加待办」按钮，正式组件没有该按钮，属既有差异，本次未改。另记一条踩坑：`docs/ui/ui-directions.html` 的 `.gitattributes` 是 `* -text`、仓库内存 LF，用 Python `write_text` 改该文件会按平台默认把全文转成 CRLF，产生「整文件重写」假 diff（本次曾出现 14891 行、`lib/client.js` 涨到 1766374 字符）；改写必须显式保留 `\n`。

### 2026-11-22 · 重建缓存先驱逐再重建、缓存判据改看行本身、覆盖块必须带!important

**背景**：上一轮改动在重启后的宿主里仍被用户判为无效：诊断面板还剩九个「列表缓存异常」会话，点重建缓存不消失；待办详情两列依旧错开。需要查清楚是「没生效」还是「判据本身不可能满足」。

**决策**：1）九个会话都不在任何 workspace 的 `sessionIds` 里，侧栏永远看不到，唯一入口就是诊断面板的重建缓存，所以必须让重建对「在宿主内存里但没在跑」的会话也能成立：新增 `release` 先 flush 再 detach 进日志，驱逐后重新判冷态，活动会话仍然拒绝；2）重建的收尾校验不再要求投影里有 `title` 行：只有系统事件的会话本来就没有标题行，按标题判会永远修不掉，改为只要求快照与日志恢复结果一致；3）检测判据同步改成「缓存行缺失或不含 values」才算异常，与 2 保持同一口径；4）两列对齐失败的原因是特异性而不是规则内容：`src/client/styles.css:113` 那条共享的 `.wb .wb-dialog label:not(…)×7` 是 (0,9,0)，`.todo-title-field` 本身就是 `<label>` 会吃到 23px 上边距，而优先级列是 `<div>` 不吃，`align-items:flex-end` 于是把优先级列顶高约 21px；上一轮的覆盖块 (0,5,0) 压不过它，因此整块改写为 `!important` 版本，不再比特异性。

**证据**：核查脚本 `C:\Users\yolo\AppData\Local\Temp\wb-devdoc\probe-sessions.mjs` 对九个 id 全部输出 `NOT-IN-WORKSPACE`，日志仍在 `~/.dsh/sessions/<项目目录>/session-<id>/session.v4.jsonl.zstd`（320B–2179725B），`~/.dsh/storages/session_projcache` 里对应行缺失；截图 1364×164 按像素测：标题标签 y=54-66、输入框边框 y=79/128，优先级标签 y=33-46、下拉边框 y=58/107，两控件都是 50px 高、整列差 21px，说明上一轮的 `height:40px` 根本没命中；改动见 `src/server/session-maintenance.ts`（`release` 与 `rebuildWithinQueue` 的驱逐分支、收尾改用 `isDeepStrictEqual`）、`src/server/diagnostics.ts:137-141`、`src/client/styles.css:312-324`；`npm run typecheck` 通过，`npm test` 745 项／720 通过／18 失败／7 跳过（18 项仍全是 `EPERM: symlink`），新增用例见 `test/diagnostics.test.ts` 与 `test/session-maintenance.test.ts`；`node secret-scan.mjs` 为 `findings: []`；两次构建一致：`lib/client.js` 1762846 字节、`dist/index.js` 2712869 字节。

**遗留**：仍要重启宿主才能看到界面效果；驱逐只在会话未活动时成立，正在跑的会话仍需先停止；两列对齐这次只从规则上钉死，最终像素待重启后目视确认。

### 2026-11-22 · 冷会话才能删、缓存重建静默跳过与两列错位

**背景**：用户复测后仍有两条问题：待办详情的标题列与优先级列错开，以及诊断面板里六个「列表缓存异常」会话删不掉、点重建缓存也不消失。

**决策**：1）永久删除在用户确认后允许驱逐宿主内存里的会话（`evict`），因为预览或读取过的会话在宿主里不算冷态，此前一律走冷会话判定而静默返回失败；2）缓存重建仍要求冷态，失败时不再计入「已跳过」而是显式列出原因，避免按钮看起来无效；3）空会话清理的复核阶段，缓存行是本次删除自己移除的，宿主空会话列表少掉这一条属预期，不再因此中止删除；4）两列对齐不再依赖原型作用域在真实弹窗里是否生效，统一在 `src/client/styles.css` 里按列首对齐并把两侧控件钉到 40px 高。

**证据**：`src/server/host.ts:216-218` 传 `evict: true` 并把失败文案改成「会话仍有活动或状态已变化，请停止后刷新重试」；`src/server/diagnostics.ts:229-231` 的复核条件增加 `!stage?.cacheRemoved`；`src/server/diagnostics.ts:252-261` 把缓存重建失败写入 `failures`；`src/client/styles.css:312-323` 新增 `.wb .wb-dialog.todo-detail-dialog .todo-detail-form .todo-compact-fields` 覆盖（选择器压到 dialog＋form 两级，才压得过同分且后加载的原型 `:scope` 规则）；`npm test` 744 项／719 通过／18 失败／7 跳过（新增一条缓存重建失败用例），失败项仍全部是 `EPERM: symlink`；`node secret-scan.mjs` 为 `findings: []`，退出 0；`dist/index.js` 2712316 字节、`lib/client.js` 1762495 字节。

**遗留**：仍未在重启后的真实宿主里看到效果，两列只按规则保证同列首、同控件高，最终像素需重启后目视确认；目标会话仍在宿主内存时，重建缓存仍要求重启宿主，未实现重建时驱逐。

### 2026-11-22 · 诊断清理不再因失效绑定失败

**背景**：用户报告两点——诊断里删除会话时提示「项目绑定不可用，请刷新或处理绑定冲突」（示例 `session-6f5c95fa-b8e0-4558-a868-d40aa5c83723`）；另有「重建缓存后，删除全部空会话还是会回到缓存异常」。

**决策**：
1）诊断清理的绑定核验只认仍生效的绑定。残留会话往往正是绑定已退休（`retired`）、已移除（`removed`）或宿主工作区已消失的那批，原实现先按 owner／工作区成员／`target.path` 找到旧绑定，再调 `this.writable(...)` 要项目与工作区都还在，于是这批会话永远删不掉。现在两处查询都排除 `retired`／`removed`，找到绑定才做归档只读校验，找不到就照常清理。
2）第二点先按「持久层有没有残留」排查：本机 `storages/workspace.json` 的 20 个 sessionIds 与磁盘会话目录一一对应，`storages/session_projcache` 的 23 条记录都带 `title` 行（3 个空会话的 `title` 为 `null`、`sessionListMetadata.blank` 为真），没有「索引有、磁盘无」的孤儿，因此本机复现不出删除后的缓存异常；不在无证据的情况下改缓存判定。

**证据**：`src/server/service.ts:716` 改成 `find(b => b.projectId === issue.projectId && !b.retired && !b.removed)`；授权回调的 `filter` 前置 `!b.retired && !b.removed`，并去掉回调里的 `this.writable(…)`（`assertWritable` 的归档校验保留）。`test/diagnostics.test.ts` 新增「绑定已退休或宿主不再列出工作区时，空会话清理不再报项目绑定不可用」，两种情形都断言删除成功。`npm test` 743 项／718 通过／18 失败（全为 `EPERM: symlink`）／7 跳过；`dist/index.js` 2711839 字节 `af4345a4…`、`lib/client.js` 1759983 字节 `2e4f7e81…`，连续两次构建一致；`node secret-scan.mjs` 为 `{"findings": []}`；打包 `dsh-workbase-1.0.4-3165f3f0.tgz`（1008306 字节）装到 profile `desktop`，两端摘要与包一致。

**遗留**：宿主未重启，改动未生效；第二点未在本机复现，需要用户重启后复测，若仍复现需提供删除后的诊断明细（哪几条、什么类别）。改动未提交、未发版。

### 2026-11-22 · 放行本机代理 fake-ip 段，修待办详情对齐与失效会话

**背景**：用户报告三处问题——技能市场数据源提示「拒绝内网、回环或保留地址」；待办详情的标题与优先级没有对齐；快捷输入框报 `sessions.retain: unknown session`。

**决策**：
1）把 `198.18.0.0/15` 从「保留地址」里放行。该段是 TUN／fake-ip 模式代理给公网域名分配的占位地址（本机实测 skillhub.cn、api.skillhub.cn、clawhub.ai、skills.sh 全部解析到 198.18.x），封掉它等于封掉所有市场数据源；真实主机不使用该段，放行不会让请求落到内网。RSS 侧同一策略同步修改，`198.51.100.0/24`、`192.0.0.0/24` 等仍拒绝。
2）待办详情不再依赖「控件高度碰巧相等」：标签 `display:block` 加固定 16px 行高，优先级列 `.theme-select` 填满 160px 列宽，触发器显式 `height:40px;min-height:40px;padding:0 12px;align-items:center`，与标题输入框同高同基线。
3）会话失效改成可恢复：`ctx.sessions.retain` 抛 `unknown session` 时清掉页面记忆里的死会话身份并重建会话，不把宿主错误抛进输入框；提交路径仍失败时给出「当前会话已失效，请刷新页面后重试」。理由是宿主重启、切 profile 或删会话都会让记忆身份失效，而输入框是常驻组件，报错会一直挂着。

**证据**：`src/server/skills-network.ts` 判定改为 `!(a === 198 && b === 51 && c === 100)`；`src/server/rss-network.ts` 去掉 `b === 18 || b === 19`；`test/rss-network.test.ts` 把 `198.18.0.1`／`198.19.255.254` 移入放行断言，`test/skills-repository.test.ts` 新增 `publicSkillAddress('198.18.2.51') === true`。`src/client/NativeComposer.tsx` 新增 `staleSessionError` 与重建分支，`test/native-composer.test.ts` 新增恢复用例并通过。样式改真源 `docs/ui/ui-directions.html` 后重新生成 `src/client/prototype.css`（`sync-ui.mjs` 只导出 `syncPrototypeUi`，直接 `node sync-ui.mjs` 不会执行）。`npm test` 742 项／717 通过／18 失败／7 跳过，18 项全是 `EPERM: symlink`（本机未开符号链接权限）；`lib/client.js` 1759983 字节 `2e4f7e81…`、`dist/index.js` 2711875 字节 `dc39a15e…`，两次构建一致；`node secret-scan.mjs` 为 `{"findings": []}`；打包 `dsh-workbase-1.0.4-6b7d4146.tgz`（1008321 字节）并装到 profile `desktop`。

**遗留**：宿主未重启，界面仍是旧代码；对齐是否到位需要目视确认（未在不触达用户会话的前提下截图验证）。18 项符号链接失败要在开启权限或非 Windows 环境复跑后才能算全绿。改动未提交、未发版。

### 2026-11-22 · 本地包改用内容摘要名并安装到 desktop profile

**背景**：用户要求用本地构建安装一次，并问本地包能否换个名字，避免与线上安装的同版本包重复。profile `desktop` 原来的 `dsh-workbase` 依赖是 registry 的 `1.0.4`，而本地工作区多出 198 项改动，两者版本号相同、内容不同。

**决策**：不改版本号绕开（版本号归 semantic-release，历史已有同样结论），改为 `npm pack` 后把文件名加上包 SHA-256 前 8 位，用 `file:<绝对路径>` 安装：profile 用 pnpm `hoisted`，同版本同路径会复用上次安装的内容，换文件名即换解析路径。该约定写进 AGENTS 出包段，同时保留仓库根直出、不加 `--pack-destination` 的规则。

**证据**：连续两次 `npm pack` 产出的包字节相同（1008130 字节、SHA-256 `7fff3360a5d38c3b81eff8886b6eceaa428a6f9cef4ceee1a60a6fc80fd16ffc`），说明 npm 11 的打包是确定性的；改名 `dsh-workbase-1.0.4-7fff3360.tgz`。`dsh plugin --profile desktop add "file:D:/Projects/dsh-workbase/dsh-workbase-1.0.4-7fff3360.tgz"` 输出 `reused 3`／`downloaded 0`／`added 1`，pnpm v11.28.5（其退出码显示为1，来自 shell 包装器的 `osuply-loadtime.cmd` 报错，pnpm 自身打印 `Done in 9.2s`，按安装结果判定成功）。安装后 profile `package.json` 的依赖变为 `file:D:/Projects/dsh-workbase/dsh-workbase-1.0.4-7fff3360.tgz`；`node_modules/dsh-workbase` 7 个文件与包内文件逐字节一致，`dist/index.js` 2711945 字节／`05e9f034…`、`lib/client.js` 1759183 字节／`35184868…`、`README.md` 17172 字节。对比安装前的 registry 版：`files` 无`THIRD_PARTY_NOTICES.md`、devDeps 为 `0.2.2-rc.1`、README 15126 字节。

**遗留**：宿主未重启——`DeepSeekRuntime.exe`（pid 46264，托管当前会话的 `127.0.0.1:32946`）仍在运行安装前的代码，重启后才加载新构建；本轮未跑 `typecheck`／`test`／`build`（本机无 `node_modules`），构建产物沿用 16:55 那次；真实宿主行为与视觉仍未验收。

### 2026-11-22 · 公开信息整改：删内部系统名、修秘密扫描与打包路径

**背景**：整体审查发现三处「公司口径」信息已公开（README 点名一处内部系统、开发日志点名未公开的内部插件、LICENSE 声明 DeepSeek 图形版权但未说明非官方），另有 `secret-scan.mjs` 在 Windows 上豁免失效导致本地 `npm run check` 恒为失败，以及历史打包目录 `out/`、`/tmp` 与日志记录的包名对不上。用户要求先修前四项，并规定本地打包直接落到仓库根目录。

**决策**：1）README 待实现条目删去该内部系统名，改为「代码审查、变更、PR 和 Issue 的对接流程」；顶部新增一句「第三方插件、与 DeepSeek 无从属／赞助／背书」声明，许可证段补充同类说明。保留 LICENSE 里 DeepSeek 图形版权署名——素材归属是事实，删掉既失真也不能从历史消除。2）开发日志中 6 处该内部插件的产品名改为「内部插件（0.0.1）」，不写产品名。3）第 21 行「当前目录缺少Git元数据」订正为实际状态（`main`、HEAD `dfe8b08`、198 项未提交变更）；按日期条目里的同类旧说法不改，那是当时的记录。4）`secret-scan.mjs` 抽出 `portable(path)`（`split(sep).join('/')`），在 `detectSecrets` 入口与 `scanWorktree` 调用处都归一化，避免任一调用方再引入反斜杠。5）打包固定在仓库根执行 `npm pack`，产物 `./dsh-workbase-<版本>.tgz`；不再用 `--pack-destination`，AGENTS 与 README 同步写明理由。

**证据**：`node secret-scan.mjs` 退出0、`findings: []`（修前为 1 条假阳性 `test\rss-parser.test.ts:17`）；`node secret-scan.mjs --history .` 为 701 个对象／400 个 blob／0 命中、退出0。仓库根 `npm pack` 产出 `dsh-workbase-1.0.4.tgz`：7 文件、1008130 字节、SHA-256 `7fff3360a5d38c3b81eff8886b6eceaa428a6f9cef4ceee1a60a6fc80fd16ffc`；解包后 7 个文件与工作区逐字节一致，包内扫描0命中、无内部系统名，也无 `/Users/` 与 `C:/Users` 形式的绝对路径，邮箱仅 `pornin@bolet.org`、`me@feedic.com`、`chris@winberry.net` 三个第三方许可署名。`lib/client.js` 实际为 1759183 字节、SHA-256 `3518486880fed5027864cc7b5fc6ee62f74e01c678745bce171d006a5c8f734c`，首表已按磁盘更正（原记 1759184／`be0f5c3b…`）。

**遗留**：该内部系统名仍留在 npm 已发布的 1.0.4 README 里，只有发一个 patch 版本才会从 registry 页面消失。历史提交 `9a14c4a` 仍含真实账户名路径（改写历史未获授权，未执行）。本机无 `node_modules`，`typecheck`／`test`／`build` 未复跑，构建产物沿用 16:55 那次；`README.md` 已改动，已随本次 pack 进包，但 `npm run check` 需在 `npm ci` 之后补跑。

### 2026-11-22 · 六张统计卡单行阈值降到960px

**背景**：用户认为六卡两行留白过多，确认将单行显示阈值从1140px降到960px。

**决策**：统计区独立容器的三列查询由`max-width:1139px`改为`max-width:959px`，使960px及以上六卡单行；沿用719px双列、419px单列规则。修改视觉真源后通过构建同步生成样式，并同步UI规范、PRD和当前约束。

**证据**：`npm run build`、`npm run typecheck`、`npm test`成功，日志位于`/tmp/dsh-six-960-{build,typecheck,tests}.log`；741项测试中735通过、6跳过、0失败。Node断言核对`src/client/prototype.css`包含959px六卡查询、719px双列与419px单列查询，且无旧1139px统计查询。

**遗留**：未进行浏览器视觉回归或真实宿主验证，本次未安装到宿主或重启宿主。

### 2026-11-22 · 清理4个文件并归档旧批次截图

**背景**：用户审阅docs目录分析后要求删除4个可清理文件并归档旧批次截图；旧画面不应继续混作当前版本验收依据，但历史结果与官方契约证据仍需保留。

**决策**：仅执行清单中4个缓存／重复文件及538张“建议归档后移出”的图片；38张代表图、106个保护文件和10个旧过程脚本保留。先核对执行前648个文件摘要，再打包538张图片及原路径manifest并回读，归档发布且4文件恢复副本齐备后才移出原路径。4文件使用可恢复隔离，不永久清除；归档保留原相对路径，旧历史条目不改写。

**证据**：`node /tmp/dsh-docs-archive.mjs > /tmp/dsh-docs-archive-result.log 2>&1`退出0；归档538图10714578字节，tarball10296215字节、539个文件成员（含manifest），SHA-256 `2d73e67ba8c0de182226da29541fee872c492627cb591de91f238e932f183fb9`。归档解包逐图大小／摘要一致，106个保留文件摘要全部不变。docs从648文件／576图／20476007字节减至106文件／38图／5843491字节；4文件3917938字节在`.trash/docs-20261122/`保留恢复副本。结果`docs-files-result.json`，恢复清单`.trash/docs-20261122/manifest.json`。

**遗留**：未改产品源码、未安装或重启宿主，未重跑npm及浏览器验收；目录缩小不等于归档和隔离副本从磁盘消失。最终复核发现PRD、UI-DESIGN和主原型在归档完成后有更新，未覆盖这些内容；其余103个保护文件仍匹配基线，更新后docs为5843598字节，归档与4份恢复副本均完整。旧过程脚本仍需环境适配；恢复截图前需确认原路径没有新生成的同名文件，避免覆盖当前证据。

### 2026-11-22 · 修复审查报告全部严重问题并隔离未知结果

**背景**：用户要求根据最新报告修复全部22项严重问题，尤其是变更语音供应商或服务源后旧密钥被发送给新服务的P0；同时发现仅保存已收到的会话ID无法覆盖完全丢失网络回执的创建重试。

**决策**：凭据按供应商及origin绑定，旧格式无可信归属证据停止复用并须重新填写。创建先保存请求身份及持久意图，成功回执可跨重启复用；官方创建结果未知不降级、不重建、不删除部分成功会话，本进程已知结果可补齐，恢复旧备份保留当前回执。设置仅使用自身确认revision；恢复和技能未知提交隔离写入；删除及项目移除先保存方向并按实际身份补齐；迁移规则区块与撤销共事务。原生发送保护与归档共队列，取消后未知状态不按超时释放，终态监听独立持有引用；保护当前不承诺跨宿主重启持久化。其余整改逐项见`audit-fixes.md`。

**证据**：`npm run check > /tmp/dsh-fix-final-check.log 2>&1`退出0，741项中735通过／6跳过／0失败；秘密扫描0命中，类型和构建通过。创建网络丢回执回归修前失败记录`/tmp/dsh-fix-idempotency-red.log`，修后覆盖客户端重加载、服务重启、意图及结果保存失败与恢复旧备份。`shasum -a 256 dist/index.js lib/client.js`两次输出`/tmp/dsh-fix-final-hash-{1,2}.txt`，`cmp`退出0；两端2711945／1759184字节。`npm pack --json --pack-destination /tmp/dsh-fix-final-pack`后`node /tmp/dsh-fix-verify-pack.mjs /tmp/dsh-fix-final-pack`通过7文件白名单、逐字节一致与包内扫描；1007962字节，完整包摘要见当前状态首表，证据`/tmp/dsh-fix-final-pack/verification.json`。

**遗留**：5项实际外部宿主用例未启用，1项本机大小写文件创建跳过（独立归档冲突故障回归已执行）；未验收真实浏览器视觉、正式宿主双窗口及音频服务。本轮未安装、重启、提交或发布；原报告6警告和1提示仍保留。旧语音配置需重新填写；此前若已跨服务发送应撤销换新，代码不能撤回历史请求。

### 2026-11-22 · 删除固定本机安装脚本

**背景**：用户了解脚本用途后明确要求删除install.command。

**决策**：删除根目录固定本机安装脚本，同步当前安装包说明；已完成安装的历史命令与证据保留。

**证据**：`test ! -e install.command`核对脚本不存在；引用检索仅在开发日志命中，无产品文档或构建入口依赖。

**遗留**：源码与已安装插件未变，本次无需构建或重启。

### 2026-11-22 · 移除迁移后的宿主原生源工作区登记

**背景**：上一轮仅从工作台隐藏源项目，用户进一步要求“宿主原生工作区也需要移除”，原生列表仍保留登记。

**决策**：迁移回执先在工作台global落盘，再官方delete移除准确原登记；失败只补登记操作，不重复迁移，不声称跨域原子。启动与同步处理旧completed批次，后来同路径的新登记保留；运行中或新增未迁会话阻止清理。撤销先核验再官方create复用或恢复登记，重绑新ID；保存失败仅清理本次确定新建登记，存储未知时不补偿删除。源目录缺失不创建，恢复目录后可撤销。

**证据**：`test/migration-execution.test.ts`新增回归先红后绿，覆盖顺序、失败补齐、同路径新登记、未知移除结果、撤销清理与备份缺失源登记；`test/migration-host.test.ts`加载实际桌面官方WorkspaceRegistry与JSON存储，验证重启不重建、撤销新ID及日志不变。`DSH_MIGRATION_HOST_TEST=1 npm run check`644通过／4跳过／0失败，日志`/tmp/dsh-migration-native-check.log`，双构建两端摘要一致。989878字节tarball白名单7文件扫描0命中；官方安装重启后7文件一致，应用83976／宿主84016启动。`node /tmp/dsh-migration-native-live.mjs after`确认正式profile完成源登记1→0，显示顺序移除、目标保留、工作台状态摘要及11份日志字节不变，证据`/tmp/dsh-migration-native-live-{before,after}.json`。

**遗留**：本轮未在正式业务数据上撤销、未调用模型、未重跑浏览器视觉；多进程竞争不提供跨域原子保证。未提交或发布，安装备份`/tmp/dsh-icon-install.g7w0of/before-install.tgz`。

### 2026-11-22 · 迁移后移出源项目并从目标查看记录

**背景**：用户确认迁移成功后源项目不应继续显示，迁移记录应在目标项目中查看；此前持久归属迁移完成，但列表仍保留空源项目。

**决策**：从已完成merge回执派生源项目移出状态，统一应用到快照、诊断及写入校验；保留内部源绑定供撤销，不删除宿主目录。旧完成批次立即适用，撤销期限到期不自动复现源项目。目标菜单沿用已有记录抽屉和API，原型同步merged标记，撤销恢复源显示。

**证据**：`test/migration-execution.test.ts`覆盖迁移、重启后源移出及目标记录、诊断排除、拒绝源写入／导入和期限到期不复现；`DSH_MIGRATION_HOST_TEST=1 npm run check`643项中639通过、4跳过、0失败，双构建摘要一致。1280／600／375宽度真实RPC与官方存储验证源移出、重开保持、目标记录及撤销恢复，证据`/tmp/dsh-migration-source-browser/checks.json`。安装包988279字节，7文件白名单扫描0命中，官方安装重启后7文件匹配，应用76666／宿主76717已启动；核验`/tmp/dsh-migration-source-installed.json`，备份`/tmp/dsh-icon-install.fgP2KE/before-install.tgz`。

**遗留**：宿主原生历史目录索引保持原状，源代码文件与历史日志未移动；迁移测试仅使用隔离数据，不迁移正式用户数据。

### 2026-11-22 · 实现工作台跨项目持久迁移及按批次撤销

**背景**：用户明确要求修复后端并实现真正迁移，原确认和撤销始终unsupported，只有界面不能满足执行要求。

**决策**：官方workspace的不可变cwd契约不能承载跨目录迁移，选用工作台持久项目归属作为会话业务和Agent待办权限的权威；归属、待办与回执在官方存储域global一次提交，避免宿主与插件双写事务。保留原日志、执行目录、源身份及目标设置。确认时重查宿主实体见证，回执绑定令牌实现重启后幂等；回滚失败隔离后续写入。撤销按本批实体恢复最新内容、源设置，保留目标新增及删除状态。旧记录没有完整undo时只读，不补造来源。恢复归档、显式恢复绑定同时重映射持久归属。

**证据**：`DSH_MIGRATION_HOST_TEST=1 npm run check`642项中638通过／4跳过／0失败（`/tmp/dsh-migration-execution-final-check.log`）；`test/migration-execution.test.ts`覆盖迁移／重启、权限、同数量不同身份、回滚、重复、缺失源目录、共享ID、删除、编辑、到期、未知状态隔离和恢复重映射。`test/migration-host.test.ts`从实际桌面asar提取官方Storage／JsonStorageBackend／DomainFacility，以隔离存储关闭重开验证迁移与撤销。`/tmp/dsh-migration-execution-browser/checks.json`验证1280／600／375宽度实际RPC和官方存储的确认、重开与撤销，pageErrors0、无横向溢出；会话由隔离HostPort提供，不调用模型。静态原型5script／7JSON、63静态译文无缺失、CSS2162对括号／宽度media0／容器79／warm保留（`/tmp/dsh-migration-execution-verification.json`）；双构建两端SHA一致（`/tmp/dsh-migration-execution-hash-{1,2}.txt`）。包987849字节，SHA-256 `5a42bf9357fe7f7e50156a45e5f220990c59eb8db3012f0b1601965916741f52`，7文件白名单及扫描通过；安装退出0、7文件／bundle一致、应用72947／宿主72983启动（`/tmp/dsh-migration-execution-installed.json`），备份`/tmp/dsh-icon-install.HJTzZA/before-install.tgz`。

**遗留**：不修改宿主原生按cwd的目录索引；旧会话继续保留原执行目录，要在目标目录执行需新建会话。未关联目录的更新缺官方契约继续拒绝。未迁移正式用户数据、未调用真实模型，未提交或发布。正式profile的业务迁移与跨进程断电故障注入不在本次隔离验收范围。

### 2026-11-22 · 补齐概览列表标题与订阅说明

**背景**：用户截图中待办分组区上方已有“项目待办”，但右侧内容列表没有独立标题；运行中采用相同结构。RSS阅读页缺少其他扩展管理页已有的标题下用途说明。

**决策**：运行中与待办复用StatsProjectPanel的resultHeader和stats-page-heading补齐列表标题，保留既有分组标题。diagnostic-group-content仅在诊断分类模式使用，普通列表不继承诊断窄屏固定高度。RSS两个标签页共用integration-caption，说明为“按分组管理订阅，阅读最新文章，发现推荐来源。”；英文词典、视觉真源与UI共用规范同步。

**证据**：`npm run typecheck && npm test && npm run build`通过，633通过／4跳过／0失败；完整输出保存在工具命令日志。`npm run secrets:check`无发现。客户端构建1739188字符，视觉原型5段脚本语法通过。`node /tmp/dsh-overview-heading-browser.mjs`验证实际React组件在1440／420px下的三页共6组，页面错误0；桌面列表滚动后标题位置不变，RSS切换推荐页后说明保留，标题和说明不横向溢出。数据见`/tmp/dsh-overview-heading-browser.json`。首次位置比较受抽屉动画影响，等待动画结束后测量；RSS模拟api补齐subscribe事件接口后完成验证。

**遗留**：本轮未安装或重启正式宿主，正式界面的生效情况不以源码构建代替；未提交、发布或修改版本号。

### 2026-11-22 · 纠正迁移交付未满足可执行要求

**背景**：用户指出“不是让你实现吗？为什么现在不能用？”；此前连续交付界面、预览与禁用确认，没有满足用户要求的实际迁移。

**决策**：按self-improving-agent的纠正记录流程明确验收缺口，遵循仓库唯一开发日志约定，不新建.learnings。预览通过、提示分层或安装成功不等于功能完成；后续不得以这些证据替代确认后的真实内容迁移。重新核对官方接口，保留不改历史会话头的约束，不通过隐藏阻断或本地展示归并冒充真实迁移。

**证据**：`src/server/service.ts`的`confirmMigration`通过令牌与revision核对后仍直接抛出unsupported；`node_modules/@deepseek-ai/dsh-workspace/src/types.ts`的`attachSession`契约要求原header.cwd真实路径等于工作区路径，`entity.ts`在不相等时抛错。`insertSessionBefore`只移动已有会话排序，`detachSession`不改日志；当前查阅接口不提供跨目录会话归属事务。本轮只做源码核对与记录纠正，没有新增迁移执行代码或运行迁移。

**遗留**：项目迁移执行仍未实现，用户原始要求尚未完成。官方SDK或契约变化时须重新核对，当前结论不作永久能力假设；不能承诺已实现后再以缺接口解释禁用。

### 2026-11-22 · 紧凑迁移对照与源目录缺失误报修复

**背景**：用户指定prototype-craft优化截图布局并修复红字。只读核实截图源项目对应目录确已不存在，宿主登记与工作台绑定一致且保留1条待办；现有提示把目录缺失与身份失效混为同一错误。宿主事务缺失是另一项真实限制。

**决策**：原型和正式组件统一为同排项目选择、860px正文限宽、四行迁出／目标现有／迁移后数量对照，沿用共享令牌、字号和控件规格；结果按实体ID去重，旧合并预览缺结果时显示破折号。绑定以workspaceId及真实路径核对，明确ENOENT且身份有效只显示目录缺失说明，保留内容继续只读预览；权限拒绝、未知错误、绑定冲突仍阻断。不创建源目录或改写归属。能力缺失移至信息说明，确认／撤销服务端门禁不变。遵守指定原型技能，只静态审查布局，不开浏览器或截图；工程检查单独按仓库约定执行。

**证据**：`/tmp/dsh-migration-compact-red.log`修前复现缺失目录误报及布局缺对照，`node --import tsx --test test/migration.test.ts test/migration-render.test.ts`修后11通过；覆盖有效绑定＋丢失源目录仍统计待办、错误身份继续阻断、真实路径别名、宿主状态异常阻断、重复待办ID结果去重、信息／错误分层及旧结果不伪造。`npm run check`627通过／4跳过／0失败（`/tmp/dsh-migration-compact-final-check.log`），双构建两端摘要一致。静态核验5脚本／7JSON、59次翻译调用、CSS2162对括号／宽度media0／容器79处，汇总`/tmp/dsh-migration-compact-verification.json`。包984802字节、SHA-256 `03039d51100f626c2eca1bdb722fbe2c374e58634e35a0fbba1e5b32754c2629`，7文件白名单及扫描通过。安装退出0，7文件／bundle一致，应用61585／宿主61618启动（`/tmp/dsh-migration-compact-installed.json`）；备份`/tmp/dsh-icon-install.JE32wI/before-install.tgz`。

**遗留**：本轮未做新的浏览器视觉回归或真实迁移验收；旧三宽截图不能覆盖新对照表。不存在安全宿主迁移事务，实际执行仍无法完成；修正的是目录缺失与身份失效的误判及信息层级，不是新增迁移能力。未提交、发布或改版本。

### 2026-11-22 · 按用户要求再次安装并重启

**背景**：用户再次要求安装并重启当前项目选择迁移版。

**决策**：沿用已核验的内容标识安装包及官方安装脚本，退出应用、备份、安装、核对七文件后重新打开，不重新构建或改版本。

**证据**：`zsh install.command`退出0，官方pnpm报告Already up to date；`/tmp/dsh-migration-select-reinstalled.json`七文件匹配、bundle已登记，应用56181／宿主56214启动。安装日志`/tmp/dsh-migration-select-reinstall.log`；备份`/tmp/dsh-icon-install.lEmFz4/before-install.tgz`。

**遗留**：本轮仅安装与启动核验，真实迁移仍受官方事务缺失阻断；未重新运行代码或视觉测试，未提交或发布。

### 2026-11-22 · 项目迁移按名称选择并同页预览

**背景**：用户要求迁移弹窗直接展示当前项目与目标项目下拉框，按名称选择，不输入路径或进入二次预览，点击“确认迁移”直接迁移。

**决策**：目标Picker使用已有项目ID，服务端从唯一绑定解析真实目录，旧目录预览API仅兼容。选择即自动预览，切换释放令牌并丢弃迟到结果，失败保留选择可重试；版本变化、目标归档及十分钟过期阻止确认。确认派发后禁止重复，只有completed回执且两端ID吻合才刷新关闭，未知结果或刷新失败保留明确提示。原型、UI规范、PRD和英文同步。真实宿主缺事务，继续拒绝执行；不使用本地归属改写冒充迁移。

**证据**：`node --import tsx --test test/migration.test.ts test/ui-interaction.test.ts`78通过，覆盖目标ID解析、同名身份、迟到预览、重试、版本／归档门禁、成功／未知回执及刷新失败重复提交。`npm run check`624通过／4跳过／0失败，日志`/tmp/dsh-migration-select-final-check.log`；最终补译文后类型检查和双构建通过，两端摘要一致。`node /tmp/dsh-migration-browser.mjs`1280／600／375px、650px高度通过，统计列宽555／275／162.5px，同排差0，正文455／474px高，取消后焦点恢复；实际组件模拟RPC，不存在路径输入、二次预览或写请求。`/tmp/dsh-migration-select-verification.json`记录51次翻译调用、5脚本／7JSON及CSS不变量。包983900字节，SHA-256 `2b2bb25acccf2b4cfb9ea8ad616cf12dd4438e92a098e11146696bb19511de37`，白名单与扫描通过。安装退出0，7文件及bundle一致，应用55397／宿主55442启动（`/tmp/dsh-migration-select-installed.json`），备份`/tmp/dsh-icon-install.6uIfbk/before-install.tgz`。

**遗留**：用户要求的真实迁移内容尚受官方事务缺失阻断，确认仍禁用；测试桩的可执行回执仅验证交互，不代表宿主具备该能力。未做真实profile迁移或正式像素对照，未提交、发布或更改版本。完整构建保留工作区既有技能事务修复，不把其他并行更新归因于迁移UI。

### 2026-11-22 · 修复受限宿主技能安装并安装重启

**背景**：用户添加市场技能收到“宿主文件系统受限，不能使用本机目录事务”，要求解决。原逻辑仅凭官方fs具有sandboxMode便拒绝安装，未使用已加载的官方SandboxProvider；官方fs仍只有单文件原子写入，不具备目录提交回滚。

**决策**：既有多目录事务注入变更接点，通过官方confine执行固定Node程序，技能内容与二进制仅经JSON stdin传递。每次授权父目录，缺失目录逐级使用现有父目录作为根；拒绝、约束不完整或路径不可映射直接停止。独立复核发现状态可能写后再抛错，补完整新旧状态读回确认，未知结果保留日志，确认提交才更新内存和清理。保留既有迁移布局修正，沿官方CLI安装摘要路径包，不改版本。

**证据**：`/tmp/wb-skill-boundaries-red.log`复现缺失workspaceRoot，`/tmp/wb-skill-commit-red.log`复现写后异常。`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm run check`624通过／0跳过／0失败（`/tmp/wb-skill-install-final-check.log`），`test/skills-host.test.ts`覆盖市场ZIP、二进制／字面特殊文件名、编辑、项目切换、拒绝、partial、read-only、映射、回滚失败及提交未知的两类恢复。实际Electron以ELECTRON_RUN_AS_NODE运行同文件2项通过（`/tmp/wb-skill-electron-host-test.log`）；测试预加载process.noAsar仅供原始ASAR复制。两次build四产物摘要一致。包982786字节、SHA-256 `87b41114c274f2c7b8e21520c36260af159fe50e3d9df0e0d978fd3595fbcae8`，7文件白名单及当次敏感模式扫描通过。官方安装退出0，7文件／bundle一致，应用48550／宿主48604启动；证据`/tmp/wb-skill-installed.json`，备份`/tmp/dsh-icon-install.O9lPjA/before-install.tgz`。host:check为0阻断／1缺基线待复核、退出2。

**遗留**：验证使用随机隔离目录及模拟市场资源，不安装或执行用户第三方技能，不代表用户页面点击或Agent调用验收。Linux未实机验证；缺官方完整约束或不同执行世界仍拒绝。历史停用目录显示入口的独立创建逻辑仍按原权限限制。本轮未提交、发布或接受宿主基线。

### 2026-11-22 · 修复迁移统计列宽及抽屉正文

**背景**：用户安装后截图显示统计首列被挤窄、正文贴边及底部按钮缺少独立区。源码查明`.wb .wb-dialog dl`的80px标签列覆盖了迁移统计；原组件也未接抽屉正文及页脚布局。此前仅测外框宽度未覆盖列宽、正文高度和留白。

**决策**：普通元数据dl规则排除迁移统计；迁移各页使用同一纵向容器、设置页内边距和滚动正文，固定页脚复用dialog-footer，不新增控件密度或改迁移阻断逻辑。原型同步为相同抽屉结构。补浏览器等宽、正文高度与留白、独立滚动、页脚分离、草稿及焦点断言，并给夹具补齐宿主百分比高度链，避免零高度内容误通过。

**证据**：`node /tmp/dsh-migration-browser.mjs`修前断言读到卡片宽度80／1086px（`/tmp/dsh-migration-layout-red.log`）；修后1280／600／375px、650px高度及长路径，列宽分别555／275／162.5px、同排差0，正文455／474px高、左内边距28／18px，页脚可见、返回保留草稿与焦点（`/tmp/dsh-migration-layout-verification.json`）。`npm run check`620通过／4跳过／0失败，原型5脚本／7JSON、42次翻译调用及两次构建哈希一致。安装包982449字节、SHA-256 `a283ff1dbeaa593daf53411e88350506aeade7c73ddde81c3405a5bdc4d24871`，7文件一致，应用42268／宿主42358已启动（`/tmp/dsh-migration-layout-installed.json`）。

**遗留**：浏览器采用实际组件及模拟RPC，截图已人工检查，未做正式宿主像素对照或真实迁移验收；源目录不可用与宿主事务缺失仍按真实状态阻止执行。当前完整构建含工作区其他更新，服务端体积变化不归因于本次布局修复；未提交或发布。

### 2026-11-22 · 安装项目迁移基础版并重启宿主

**背景**：用户要求安装并重启，正式宿主仍运行上一文案精简版，需要让最新迁移预览与记录入口生效。

**决策**：再次执行完整检查和构建后出包，采用内容摘要路径规避相同版本／相同tarball路径的缓存。沿用官方desktop CLI安装，退出应用后先备份原插件与profile manifest，核对包内7文件，再打开应用并检查宿主进程。

**证据**：`npm run check`620通过／3跳过／0失败，`/tmp/dsh-migration-install-check.log`。安装包980476字节、SHA-256 `453bc2d394fb418388a860219d9850d9cebb89311b5a7a27eaafd2e31e6261b4`，白名单及本次内容扫描通过（`/tmp/dsh-migration-pack-check.json`）。`zsh install.command`退出0、官方pnpm新增1包；`node /tmp/dsh-migration-installed-check.mjs`核对7文件、依赖路径、bundle登记及32692／32728进程，摘要`/tmp/dsh-migration-installed.json`。安装备份`/tmp/dsh-icon-install.Hebhcf/before-install.tgz`。

**遗留**：仅确认安装内容与应用／宿主启动，未做真实宿主迁移或像素视觉验收；缺官方事务时执行与撤销仍禁用。本轮未发布或提交。

### 2026-11-22 · 项目迁移预览与只读记录基础

**背景**：用户批准先实现迁移预览、协调入口和记录基础，当前宿主缺原子目录绑定及跨项目归属接口；原菜单只有占位提示。

**决策**：真实目录选择与预览、迁移记录统一复用抽屉和ModalFlow。预览只读，确认令牌绑定版本、十分钟失效，取消释放；记录仅接受已完成事务的状态与期限，旧存储默认空列表。当前确认／撤销在服务端拒绝，未添加推测性的官方方法探测或测试桩执行端口。原子执行及持久事务恢复待公开契约，避免工作台落盘与宿主部分成功造成双写不一致。

**证据**：`test/migration.test.ts`六项覆盖真实目录／符号链接、源目标身份与统计、冲突、令牌、所有者／取消、记录截止及无写入；`test/migration-render.test.ts`覆盖双端统计和用户标题转义。`npm run check`为623项、620通过、3跳过、0失败（`/tmp/dsh-migration-final-check.log`）；两次构建哈希一致。`node /tmp/dsh-migration-browser.mjs`三种面板宽度无溢出，单弹窗、草稿与焦点恢复及禁用确认通过。`node --import tsx /tmp/dsh-migration-verify.mjs`核对5脚本／7JSON、42次翻译调用与CSS不变量，摘要`/tmp/dsh-migration-verification.json`。

**遗留**：没有真实迁移及撤销、源设置快照、持久任务与未知结果恢复或旧合并记录转换；记录页当前为空是实际状态。浏览器为隔离组件加模拟RPC，只验证交互与几何，未做真实宿主或像素对照验收。本轮未出包、安装、重启、提交或发布，正式宿主继续使用上一文案精简版。

### 2026-11-22 · 私人订制与备份说明精简版安装并重启

**背景**：用户要求安装并重启，以便实际桌面端加载最新两处说明调整。

**决策**：重新构建并打包，使用摘要后缀tarball避免同路径缓存；更新install.command，退出宿主后备份原插件和profile manifest，经官方离线安装及7文件校验后重开应用。

**证据**：`npm run build`与`npm pack --pack-destination out --json`成功；`node /tmp/dsh-settings-pack-check.mjs /tmp/dsh-personal-backup-install-pack.json`核对7文件白名单、包内文件与当前构建一致，指定扫描0命中，3处许可证作者邮箱保留。安装包974993字节，SHA-256 `29f5e6ae48975c0403c552e06541a313d164108a77b986078c9f53c3eb817617`。`zsh install.command`退出码0，7文件与两端摘要一致，旧15697／15731退出，新18644／18709启动，插件登记及依赖路径确认；证据`/tmp/dsh-personal-backup-install.log`、`/tmp/dsh-personal-backup-installed.json`。备份`/tmp/dsh-icon-install.Q25NBt/before-install.tgz`。

**遗留**：未进行浏览器或真实宿主视觉验收，未发布。官方pnpm输出既有配置／peer提示，安装与文件核对成功。

### 2026-11-22 · 移除私人订制重复小字并缩短备份说明

**背景**：用户截图询问四个私人订制菜单下的目录与生效小字是否必要，并要求备份页底部说明更简练。

**决策**：移除目录和重复的正常生效说明，范围及生效时间合并到介绍，保留服务未就绪提示、文件名与加载／错误状态。备份保留实际密钥路径，压缩为加密及单独保管、运行中文件一致性限制与未覆盖范围两句；密钥生成和自动选择细节仍留在PRD。正式组件、英文词典、适用原型与UI规范同步，不修改保存或备份行为。

**证据**：`npm run check > /tmp/dsh-personal-backup-copy-check.log 2>&1`通过：秘密扫描0命中、类型检查通过、613项测试通过／3项跳过／0失败、构建成功。`node /tmp/dsh-personal-backup-copy-verify.mjs`检查移除正常说明、保留服务未就绪提示、3段唯一英文词条及适用原型，5段执行脚本／7份JSON解析通过，CSS括号2124对／宽度media残留0／外层容器查询56处／温暖主题保留。摘要`/tmp/dsh-personal-backup-copy-verification.json`；客户端1712849字节，SHA-256 `a61eeac640eae06a8f1522e959d055bdb1e46cf4d020a905d1edf435b85aab5f`，较上一版减少415字节，服务端摘要不变。

**遗留**：本轮未打包、安装、重启或发布；未运行浏览器及真实宿主视觉验收，当前宿主仍使用上一设置说明精简版。

### 2026-11-22 · 设置说明精简版安装并重启

**背景**：用户要求安装并重启，需要让刚精简的各设置说明加载到实际桌面宿主。

**决策**：重新构建后打包，采用摘要后缀独立tarball路径防止pnpm复用旧包；更新install.command，退出应用后备份原插件及profile manifest，使用官方离线安装并重开。

**证据**：`npm run build`及`npm pack --pack-destination out --json`成功；`node /tmp/dsh-settings-pack-check.mjs`核对7文件白名单、包内文件与源码构建一致，指定秘密／内部域名／绝对路径扫描0命中，3个第三方许可署名邮箱保留。安装包975089字节，SHA-256 `17aa5776d4baae9000c7f8a4d37bd00265a31814fda5b56e66e978ac28afb196`。`zsh install.command`退出码0，日志`/tmp/dsh-settings-copy-install.log`；7文件一致，客户端SHA与当前状态相同，原9763／9829退出，新15697／15731启动，插件登记与包依赖确认；证据`/tmp/dsh-settings-copy-installed.json`。恢复备份`/tmp/dsh-icon-install.b2vqfR/before-install.tgz`。

**遗留**：未重跑浏览器视觉或完整宿主业务验收，未发布。官方安装输出既有pnpm全局配置与peer依赖提示，安装及文件核对成功。

### 2026-11-22 · 精简其余设置说明并保留操作边界

**背景**：用户要求检查其他设置的说明，简短精炼且能让用户明白意思；较长内容集中在待办权限、项目补齐、语音操作和备份说明。

**决策**：精简7个设置组件约20处辅助说明，同步英文词典及适用原型；已简短的字段、保存状态、文件名与恢复警告保留。扩展介绍分别说明新增默认值和订阅频率，避免误导已有订阅；密钥说明沿用“密钥不在备份文件内”的明确边界，不改变既有断言或业务逻辑。

**证据**：`npm run check > /tmp/dsh-settings-copy-check.log 2>&1`通过：秘密扫描0命中、类型检查通过、613项测试通过／3项跳过／0失败、构建成功。`node /tmp/dsh-verify-settings-copy.mjs`检查21段新文案的唯一英文词条及适用原型同步、5段执行脚本／7份JSON解析、生成CSS括号2124对／宽度media残留0／温暖主题保留；摘要`/tmp/dsh-settings-copy-verification.json`。客户端1713264字节，SHA-256 `a9f85425c88f97f70e2fe76de7a81fa409a2b0df42d2069989a4bcfd5890e414`，较上一构建减少2408字节；服务端摘要不变。

**遗留**：本轮未打包、安装、重启或发布；未执行浏览器及真实宿主视觉验收，当前宿主仍使用上一插件更新文案精简版。

### 2026-11-22 · 精简通用组件的长说明

**背景**：用户截图指出语音播报说明过长，要求较长说明简短精炼；同页插件更新、自动更新及终端扩展说明也存在冗余。

**决策**：四项说明统一简述用途和关键结果，删除重复入口位置与菜单显隐描述；保留后台更新、保存后下次启动生效、停用保留终端设置、语音关闭停止播放且保留配置与密钥。正式Settings、真源、英文词典及需求规范同步，不调整功能或控件样式。

**证据**：`npm run check > /tmp/dsh-component-copy-check.log 2>&1`完成秘密扫描、类型、616项测试（613通过、3跳过）及构建；客户端1715672字节，SHA-256 `0f5880c9e42b80f3da078f0f0d9ec8d74dbc21f7bec0f141dfbaeb41a017fd7b`。Node静态解析原型5段执行脚本及7份JSON成功；说明入口为`src/client/Settings.tsx`通用组件四个setting-row及真源workspaceSettings的对应row。

**遗留**：未打包、安装、重启或进行浏览器／真实宿主视觉验收；当前宿主仍为上一插件更新文案精简版。

### 2026-11-22 · 插件更新文案精简版安装并重启

**背景**：用户要求安装并重启最新文案修改，原install.command仍绑定上一主题卡片精简包。

**决策**：重新构建打包，核对白名单及敏感内容扫描后绑定b1227513内容摘要路径；退出宿主、备份原插件和profile manifest，通过官方CLI离线安装，再核对文件并重新打开应用。

**证据**：`npm run build > /tmp/dsh-plugin-label-install-build.log 2>&1`及`npm pack --pack-destination out --json > /tmp/dsh-plugin-label-pack.json`成功。`node /tmp/dsh-plugin-label-install-check.mjs package`确认7文件、指定扫描0命中，包975810字节，SHA-256 `b12275130768d2c35715190ee7473641db8682018b9c89d189aa328a03672585`；客户端摘要保持`cef4edf9a4bdd7c179310d5d9d408e9242f14247f5e9d82c87a49bb04c5d46cf`。`zsh -n install.command && zsh install.command > /tmp/dsh-plugin-label-install.log 2>&1`退出码0；`node /tmp/dsh-plugin-label-install-check.mjs installed`核对7文件一致、profile bundle与新摘要依赖，7221／7252已退出、9763／9829已启动。备份`/tmp/dsh-icon-install.kAnun7/before-install.tgz`。

**遗留**：官方pnpm报告全局配置兼容及peer依赖提示，安装成功且文件一致；本轮未复验浏览器或真实宿主视觉，未发布。

### 2026-11-22 · 插件更新开关移除显示前缀

**背景**：用户截图要求将通用组件中的更新开关文案改为「插件更新」，删除「显示」。

**决策**：同步标题及aria-label、原型row标签和英文词条Plugin updates，更新既有渲染测试对应名称；说明及开关保存／禁用行为沿用现有实现，需求与共用规范同步。

**证据**：`npm run check > /tmp/dsh-plugin-label-check.log 2>&1`完成秘密扫描、类型、616项测试（613通过、3跳过）及构建；客户端1716612字节，SHA-256 `cef4edf9a4bdd7c179310d5d9d408e9242f14247f5e9d82c87a49bb04c5d46cf`。`rg -n '显示插件更新' src test docs/UI-DESIGN.md docs/PRD.md docs/ui/ui-directions.html`0命中；Node解析原型5段执行脚本及7份JSON成功。

**遗留**：未打包、安装、重启或进行浏览器／真实宿主视觉验收；宿主仍为上一主题卡片精简版。

### 2026-11-22 · 主题卡片精简版安装并重启

**背景**：用户要求安装并重启最新主题卡片精简版，原install.command仍绑定扩展配置入口调整包。

**决策**：重新构建打包，核对白名单及敏感内容扫描后绑定749ab6b7内容摘要路径；退出宿主、备份原插件和profile manifest，再通过官方CLI离线安装，逐文件核对并重新打开应用。

**证据**：`npm run build > /tmp/dsh-theme-card-install-build.log 2>&1`及`npm pack --pack-destination out --json > /tmp/dsh-theme-card-pack.json`成功。`node /tmp/dsh-theme-card-install-check.mjs package`确认7文件、指定扫描0命中，包975814字节，SHA-256 `749ab6b775ae1dd38c904e76495043417f97cda683781359f353ee4fbee5889e`；客户端摘要保持`02f24408d8a856d9cbca86b6eb8aea19503467b611c84df16040e5380aed55ff`。`zsh -n install.command && zsh install.command > /tmp/dsh-theme-card-install.log 2>&1`退出码0；`node /tmp/dsh-theme-card-install-check.mjs installed`核对7文件一致、profile bundle及新摘要依赖，2767／2800已退出、7221／7252已启动。备份`/tmp/dsh-icon-install.GlSCyk/before-install.tgz`。

**遗留**：官方pnpm报告全局配置兼容及peer依赖提示，安装成功且文件一致；本轮未复验浏览器或真实宿主视觉，未发布。

### 2026-11-22 · 移除主题选择卡片的辅助小字

**背景**：用户截图指出经典湛蓝与跟随平台卡片的说明小字没有必要，要求精简主题选择。

**决策**：五个主题卡片统一只显示单选控件与名称；移除Settings中的静态说明表及对应英文词条，主原型和内嵌设置演示同步移除说明节点与aria-describedby。沿用现有卡片样式、主题预览及保存逻辑，不增加密度变体；需求及共用规范同步。

**证据**：`npm run check > /tmp/dsh-theme-card-check.log 2>&1`完成秘密扫描、类型、616项测试（613通过、3跳过）及构建；客户端1716653字节，SHA-256 `02f24408d8a856d9cbca86b6eb8aea19503467b611c84df16040e5380aed55ff`。Node静态解析原型5段执行脚本及7份JSON成功，theme-desc-与theme-description-引用均为0；改动入口为`src/client/Settings.tsx`的theme-choices和真源workspaceSettings、内嵌设置演示主题渲染。

**遗留**：本轮未打包、安装、重启或进行浏览器／真实宿主视觉验收；当前宿主仍为上一扩展配置入口调整版。

### 2026-11-22 · 扩展配置入口调整版安装并重启

**背景**：用户要求安装并重启最新扩展配置调整版，原install.command仍绑定语音设置精简包。

**决策**：重新构建并打包，核对白名单及敏感内容扫描后绑定dcacec80内容摘要路径；通过原官方CLI安装流程退出宿主、备份原插件及profile manifest、离线安装、逐文件核对并重新打开应用。

**证据**：`npm run build > /tmp/dsh-extension-install-build.log 2>&1`及`npm pack --pack-destination out --json > /tmp/dsh-extension-pack.json`成功。`node /tmp/dsh-extension-install-check.mjs package`核对7文件、指定扫描0命中，包975926字节，SHA-256 `dcacec8082d010a439d05cccf9868fa69094585febd0318136df3da9d20b2ec5`，客户端摘要保持`2050967770017ba0c5612df120bfdd48a84632e87eb06c25365454dc219b3b91`。`zsh -n install.command && zsh install.command > /tmp/dsh-extension-install.log 2>&1`退出码0；`node /tmp/dsh-extension-install-check.mjs installed`核对7文件一致、profile bundle注册与新摘要依赖，94015／94052已退出、2767／2800已启动。备份`/tmp/dsh-icon-install.IxDFEk/before-install.tgz`。

**遗留**：官方pnpm仍报告全局配置兼容及peer依赖提示，安装成功且文件核对通过；本轮未复验浏览器、真实宿主菜单视觉或全部业务功能，未发布。

### 2026-11-22 · 调整扩展配置归属与管理页快捷入口

**背景**：用户批准扩展配置位置建议，要求备份恢复置底、RSS配置页改称订阅、历史停用目录回到技能来源，并让管理页直接进入相关默认设置。

**决策**：Settings持有扩展子页选择以保留跨分类草稿；三个管理页标题区复用共享36px设置图标，WorkbaseOverview保留一个外层抽屉及隐藏管理内容，返回经规则关闭保护恢复滚动、焦点并清理主题预览。设置采用普通设置滚动样式，避免概览内容overflow:hidden。旧目录入口按服务端快照未删除登记技能的历史安装计数条件显示，不增加目录扫描或重复配置；视觉真源、英文词典及需求规范同步。

**证据**：`npm run check > /tmp/dsh-extension-check.log 2>&1`通过秘密扫描、类型、616项测试（613通过、3跳过）及构建。新增测试在`test/settings-render.test.ts`和`test/ui-interaction.test.ts`验证对应子页、共享外壳、返回关闭保护、跨分类草稿、历史目录显隐；`test/skills-registry.test.ts`验证首次恢复使legacyStagedCount从1降至0。首次完整检查发现wb-fulltext不属于技能原型类名，改回来源记录样式后通过。`npm run build > /tmp/dsh-extension-build-repeat.log 2>&1`再次构建，客户端SHA-256保持`2050967770017ba0c5612df120bfdd48a84632e87eb06c25365454dc219b3b91`；静态解析5段执行script及7份JSON，CSS括号2124对、宽度media残留0、workbase查询56处、温暖主题保留。

**遗留**：未进行浏览器视觉、真实宿主交互验收，未打包、安装、重启或发布；旧包及旧宿主仍是语音设置精简版。历史目录计数基于已登记安装，不据此盘点未登记文件或断言文件当前存在。

### 2026-11-22 · 语音设置精简版安装并重启

**背景**：用户要求安装并重启，磁盘上的install.command第37行实际混入两段profile路径，且仍绑定旧组件分组包。

**决策**：修正脚本误粘内容，完整检查后重新打包，绑定913c786b内容摘要路径以避免同版本同路径缓存；退出宿主后备份，通过官方CLI安装并逐文件核对，再重新打开应用。

**证据**：`/tmp/dsh-speech-trim-check.log`记录npm run check通过，609通过、3跳过、0失败。`node /tmp/dsh-speech-trim-audit.mjs`核对7文件一致、指定扫描0命中；包975354字节，SHA-256 `913c786b7f20aa6b563b5d4d9f7fefde50d087a0d7280a61b12ed0d259e5a1af`。安装日志`/tmp/dsh-speech-trim-install.log`退出码0；`node /tmp/dsh-speech-trim-installed.mjs`确认7文件一致、profile bundle注册、依赖新摘要路径，89555／89591已退出，94015／94052启动。安装前备份`/tmp/dsh-icon-install.DXIsa4/before-install.tgz`。

**遗留**：官方pnpm报告全局配置兼容和peer依赖提示，安装成功且文件核对通过；本轮未重跑真实宿主菜单视觉、浏览器交互或付费TTS验收。

### 2026-11-22 · 精简语音设置中的介绍与清除密钥入口

**背景**：用户标注语音设置的顶部介绍、官方限制说明及底部清除密钥／保存提示，要求移除。

**决策**：同步修改SpeechSettings与视觉真源，清理失用英文文案；保留密钥输入、留空保留行为及后端凭据事务契约。UI规范第0.1节记录分区介绍规则的用户指定例外。

**证据**：`npm run typecheck && npm test && npm run build`退出码0，612项中609通过、3跳过、0失败。客户端1714555字节，SHA-256 `901d392a9cc53ddf823e04db4d580fc9b5e64a438d3c83ea98647c58bdc24c51`；在SpeechSettings、i18n-en及ui-directions中检索已删除文案无命中。

**遗留**：本轮未重新打包、安装、重启或运行浏览器验收；宿主仍使用上一组件分组版，旧包及旧浏览器证据不代表此次精简已在宿主生效。

### 2026-11-22 · 组件分组版重新打包安装及重启成功

**背景**：用户再次要求重新打包安装，工具已有宿主目录写入权限；编辑器提示安装脚本含误粘路径，磁盘读取及zsh语法核对均正常。

**决策**：使用磁盘上正常的install.command，重新完整检查及打包后通过官方CLI按摘要文件路径安装，沿用七文件比较及退出重开流程，不手工替换宿主产物。

**证据**：`/tmp/dsh-permitted-repack-check.log`记录612项中609通过、3跳过；包检查七文件一致、指定扫描0命中。`/tmp/dsh-permitted-install.log`退出码0，pnpm11.28.5报告Packages +1／added 1；实际七文件与源码构建一致，客户端SHA-256为0984d06f…，依赖指向eddc1fb2摘要路径，profile.bundles包含dsh-workbase。原进程84223／84261退出，现88696／88767运行；安装前备份`/tmp/dsh-icon-install.rymEKe/before-install.tgz`。

**遗留**：组件开关仍按默认关闭规则，用户需在其他组件的通用组件页启用并保存。此次安装及进程重启已验证，未再次执行真实宿主菜单视觉与付费语音验收。

### 2026-11-22 · 重新打包检查通过但安装仍被沙箱拦截

**背景**：用户要求重新打包安装当前组件分组源码。

**决策**：重新执行完整check、npm pack及7文件包检查，不手工修改版本号；以当前SHA-256摘要路径运行官方安装脚本，安装拒绝后恢复原应用，不绕过profile写权限。

**证据**：`/tmp/dsh-repack-check.log`记录612项中609通过、3跳过，构建完成。`/tmp/dsh-repack-package-check.log`记录7文件与构建一致、指定扫描0命中；tarball仍为976001字节，SHA-256 `eddc1fb22c320dacd19d38b51274c280e474d28d2d65aa044eede384f4474694`。`/tmp/dsh-repack-install.log`记录锁文件EACCES及备份`/tmp/dsh-icon-install.AbvhpW/before-install.tgz`，实际两端摘要仍是旧版。

**遗留**：重新打包已完成，组件分组版安装未完成；需本机执行摘要路径脚本或放行工具写desktop profile。原应用已恢复打开。

### 2026-11-22 · 菜单未生效确认实际产物仍旧

**背景**：用户反馈语音菜单重组好像没有生效，需要区分源码问题、配置与实际安装。

**决策**：先核对依赖specifier、锁文件摘要及两端安装SHA，而非以同为1.0.4判断成功。发现依赖又指向固定文件名，锁文件为新integrity但node_modules仍旧，与已隔离复现的pnpm同路径缓存一致；现有安装脚本已使用正确摘要路径，按此路径重装，不修改版本号、不清理宿主缓存或手工替换文件。

**证据**：profile/package.json及pnpm-lock.yaml第35–37、372–374行使用固定dsh-workbase-1.0.4.tgz。其SHA-512与当前组件分组包一致，实际客户端却为d656a2d1…、服务端30cbaf04…，7文件仅两端产物不同。`/tmp/dsh-components-install-diagnosis.log`记录沙箱锁文件EACCES，备份`/tmp/dsh-icon-install.SZ4V8T/before-install.tgz`；恢复进程80604／80634。

**遗留**：摘要路径安装仍未完成；需本机终端执行install.command或放行工具对desktop profile的写入权限。此次静态产物差异已足以解释菜单未生效，尚未进入真实宿主菜单行为验收。

### 2026-11-22 · 组件分组版安装被profile写权限阻止

**背景**：用户要求执行最新双击安装并重启脚本。

**决策**：运行绑定eddc1fb2内容路径的install.command，沿用官方CLI安装；沙箱拒绝profile锁文件写入后恢复原应用，没有改变权限或绕过限制。

**证据**：`/tmp/dsh-components-install.log`记录EACCES及package.json.lock，备份`/tmp/dsh-icon-install.sTeWYf/before-install.tgz`。实际客户端SHA-256为`d656a2d16f84dcc155f806865e5cb6acb0340645d2f70bb258c945f4ffe5c89f`（上一声波动画版），与新组件分组版0984d06f…不同；恢复后`pgrep -x 'DeepSeek Harness'`返回76613／76654／76737。

**遗留**：组件分组版未安装；需本机执行install.command，或允许工具写desktop profile后重试。实际宿主组件菜单仍未验收。

### 2026-11-22 · 语音播报归入其他组件二级菜单

**背景**：用户要求将语音播报移动到「其他组件」的二级菜单，原其他组件内容移到「通用组件」，由通用组件开关控制语音组件启用及菜单显示。

**决策**：增加独立、默认关闭的speechComponentEnabled偏好，不复用自动播报enabled，避免未配置密钥时无法进入配置菜单。现有插件更新与终端扩展控件移入通用组件；开启草稿立即显示语音页签，保存后启用会话入口。停用停止播放器、卸载会话监听及轮询，服务配置与密钥保留；隐藏语音草稿不提交，避免无效草稿阻塞关闭。同步视觉真源与UI共用规范，将原忽略目录中的设置验证脚本移到docs/verify-personal-speech.mjs作为可复现入口。

**证据**：新增测试先失败于旧一级语音菜单及缺少组件生命周期模块；`npm run check`最终612项中609通过、3跳过。`docs/verify-personal-speech.mjs`8组与`docs/verify-speech-actions.mjs`4组通过、页面错误0；截图及JSON在docs/ui/verification。连续构建客户端SHA-256均为`0984d06fe54f890b1c7cef9b9acc22c41d9a937891eab85d7e633657d5a2eb70`，服务端均为`080b62750a8d674e5ab9b2fe49c73db18d49aabf22f0eb2e975b743994e288e6`；包7文件逐字节一致、指定扫描0命中。

**遗留**：新版尚未安装；此前多次官方CLI安装均被沙箱拒绝写desktop profile/package.json.lock，权限未改变，本轮只更新绑定新内容路径的install.command。真实宿主菜单及音频仍未验收。

### 2026-11-22 · 执行声波动画安装脚本仍被沙箱拦截

**背景**：用户明确要求执行双击安装并重启脚本。

**决策**：执行现有install.command，沿用官方CLI和内容摘要路径；沙箱拒绝profile锁文件写入后按脚本恢复原应用，没有改权限或绕过限制。

**证据**：`/tmp/dsh-wave-install-retry.log`记录EACCES、package.json.lock及备份`/tmp/dsh-icon-install.GSTGLe/before-install.tgz`。实际客户端SHA-256仍为`fc987f099acc88defae5522056fd947da9dc9cf5ce6dd8fc31c587f54c925a16`；恢复后`pgrep -x 'DeepSeek Harness'`返回66692／66725／66947。脚本语法、安装包摘要及7文件白名单再次核对通过。

用户再次要求执行后，`/tmp/dsh-wave-install-retry-2.log`仍记录相同锁文件EACCES；备份`/tmp/dsh-icon-install.tok6fS/before-install.tgz`，实际客户端摘要仍为上一喇叭版，恢复进程67881／67911。包与当前构建7文件核对通过，未绕过沙箱。

**遗留**：新版未安装；需本机终端运行脚本，或放行工具对desktop profile的写入权限后再执行。

### 2026-11-22 · 区分播报开关图形并增加播放声波动画

**背景**：用户指出顶部启用和关闭图标相同，并要求播放时使用会动的图标；原实现仅改变底色，始终引用同一speaker路径。

**决策**：关闭使用喇叭加叉，启用使用静态声波；当前session播放时显示错相声波动画，回复操作保留点击停止。手动播放不修改自动开关，系统减少动态效果时禁动。路径维护在视觉真源，宿主插槽动画放在styles.css适配，未增加运行时依赖。

**证据**：`npm run check`通过，609项中606通过、3跳过；补充会话隔离断言后`tsx --test test/speech-playback.test.ts`8项通过。`docs/verify-speech-actions.mjs`四组中英文×明暗验证通过、页面错误0，实测动画0ms与500ms透明度不同，减少动态效果时animationName为none。连续构建客户端SHA-256均为`d656a2d16f84dcc155f806865e5cb6acb0340645d2f70bb258c945f4ffe5c89f`；包检查7文件一致、指定扫描0命中。

**遗留**：`/tmp/dsh-wave-install.log`记录官方CLI写package.json.lock时EACCES，沙箱拒绝profile写入；新版未安装，实际客户端摘要仍为上一喇叭版fc987f09…。原应用已恢复打开，备份`/tmp/dsh-icon-install.ncUumI/before-install.tgz`保留。需本机双击install.command完成安装与重启；真实宿主动画及付费TTS音频未验收。

### 2026-11-22 · 喇叭版官方安装及重启完成

**背景**：用户再次明确要求安装并重启已完成的喇叭图标构建。

**决策**：执行当前install.command，仍通过官方CLI安装独立路径包；逐文件比较成功后重开应用，再独立核对实际安装的启用状态、客户端摘要和进程。保留原插件备份，不手改宿主或权限。

**证据**：`zsh install.command > /tmp/dsh-speaker-install-retry.log 2>&1`退出码0，pnpm11.28.5报告Packages +1／added 1。实际enabled=true、filesMatch=true，客户端SHA-256 `fc987f099acc88defae5522056fd947da9dc9cf5ce6dd8fc31c587f54c925a16`匹配当前喇叭版。重启后主进程62256／宿主62294；安装前备份`/tmp/dsh-icon-install.wl7lpm/before-install.tgz`。

**遗留**：安装与进程重启已核验；真实宿主图标视觉及付费音频尚未单独验收。

### 2026-11-22 · 播报入口替换为喇叭图标

**背景**：用户要求将语音播放图标改为喇叭按钮。

**决策**：宿主公开图标库没有喇叭，向视觉真源icons添加speaker路径，构建生成后复用共享Icon，同时更新顶部开关与逐条重播；保持官方按钮规格与播放中停止图标，设置提示和英文同步。沿用独立内容路径安装，但本轮官方CLI再次遇到profile锁文件写权限限制，脚本恢复打开原应用。

**证据**：`npm run check > /tmp/dsh-speaker-check.log 2>&1`为606通过／3跳过／0失败；`docs/verify-speech-actions.mjs`4组／0错误，两次build摘要一致。客户端1713547字节、SHA-256 `fc987f099acc88defae5522056fd947da9dc9cf5ce6dd8fc31c587f54c925a16`，服务端摘要仍为`30cbaf04154edaec597fd3cfe96f455e591611b8831193add41fdf373448cb80`。最新`out/dsh-workbase-1.0.4.tgz`及相同的`out/dsh-workbase-1.0.4-779062b2.tgz`为975158字节、SHA-256 `779062b275a41d56514a02ca8a60cf41b9cf67b0535ddfb97c63629e31edce5b`，7文件逐项一致、指定扫描0命中，install.command已绑定此新包。`/tmp/dsh-speaker-install.log`记录package.json.lock EACCES及备份`/tmp/dsh-icon-install.vNG2dd/before-install.tgz`；实际安装客户端仍为`e7ec41cefeedada8de0cc45272faa9c1d189ba727618c90f7739ac97767a7cbf`，原应用已重新打开，观察主进程61386。

**遗留**：喇叭版源码与包完成，尚未安装；需本机执行更新后的install.command或放行profile写入。真实宿主喇叭视觉未验证。

### 2026-11-22 · 独立路径图标包安装与重启成功

**背景**：用户明确要求执行安装并重启脚本，完成图标版实际安装。

**决策**：直接执行已准备的install.command，先退出应用，使用官方CLI安装带内容摘要后缀的包；7个发布文件均与tarball比较通过后重新打开应用，再独立比较当前源码构建及安装文件。保留安装前备份，不手改profile权限或宿主插件内容。

**证据**：`zsh install.command > /tmp/dsh-icon-install-run.log 2>&1`退出码0，pnpm11.28.5报告Packages +1／added 1。独立核对enabled=true、filesMatch=true、replySlot=true、autoIcon=true；客户端SHA-256 `e7ec41cefeedada8de0cc45272faa9c1d189ba727618c90f7739ac97767a7cbf`与最新构建一致。重启后主进程57859、宿主57903，原主进程55061已退出；备份在`/tmp/dsh-icon-install.GbRB9O/before-install.tgz`。

**遗留**：已完成安装与进程重启；本轮未做真实宿主图标视觉或付费TTS播放验收，不能以文件核对代替。

### 2026-11-22 · 图标缺失定位到同路径tarball缓存

**背景**：用户重开应用后仍未看到播报图标；上一次给出的同路径安装命令不足以保证包文件更新。

**决策**：按系统排查流程比较源码、安装内容与依赖锁。实际客户端仍为流式版且没有两项图标标识；锁文件已记录新包integrity，说明不能仅检查版本或lock。使用宿主实际pnpm版本和hoisted模式做隔离复现，确认同路径覆盖及--force均保留旧内容；改为内容摘要后缀的新路径。提供用户本机运行的install.command，先退出应用、官方安装、7文件比较，再重开；工具profile写限制仍存在，不绕过。

**证据**：`node /tmp/dsh-pnpm-replay.mjs`输出`normal:old, forced:old, differentPath:new`，隔离目录`/tmp/dsh-pnpm-replay-z4YoF8`。实际安装客户端摘要`9be516c8f874d3d28b5abf337eb204e03aa4f63efa61d47946b35b4f0883e66d`与最新`e7ec41cefeedada8de0cc45272faa9c1d189ba727618c90f7739ac97767a7cbf`不同，replySlot与autoIcon均false；实际进程55061／55171。新路径包与原包逐字节一致、SHA-256 `d274b2bd897a297b711222640a0d88901d35f482af0c14c43be1fc8f5ef9e348`；install.command通过zsh语法检查，尚未执行实际profile写入。

**遗留**：真实图标版仍未安装；需用户本机执行脚本或放行工具profile写入后才能验收宿主图标。隔离缓存复现与脚本语法通过不等于正式安装成功。

### 2026-11-22 · 图标播报版安装被profile写权限阻止

**背景**：用户要求安装并重启最新的回复重播与自动播报图标构建。

**决策**：重新核对实际宿主，已是上一流式版而非旧HTTP版；备份现有插件、profile及工作台数据，使用官方CLI离线安装。锁文件写入EACCES后核对原安装与状态，保留运行中的应用，不以重启旧版代替安装成功；不更改权限或绕过沙箱。

**证据**：`/tmp/dsh-speech-actions-install-20261122/install.log`记录`EACCES: permission denied, open .../profiles/desktop/package.json.lock`。`node /tmp/dsh-speech-actions-install.mjs unchanged`显示7文件匹配安装前备份、bundle启用、6项状态0变化及cordis.yml不变；客户端摘要为`9be516c8f874d3d28b5abf337eb204e03aa4f63efa61d47946b35b4f0883e66d`，主进程38037／宿主38074。备份1320960字节、权限600；待安装包摘要仍为`d274b2bd897a297b711222640a0d88901d35f482af0c14c43be1fc8f5ef9e348`。

**遗留**：图标版未安装、应用未重启；需放行工具的profile写入，或由用户本机终端完成官方CLI安装后退出重开应用。真实宿主图标与付费TTS尚未验收。

### 2026-11-22 · 回复下方重播与顶部自动播报图标

**背景**：用户指定将语音重播放到每条回复下方，顶部两个文字按钮改为一个播放图标，重复点击启用／关闭自动播报。

**决策**：使用已核对的官方assistant-actions插槽和messageId正文索引，每个会话订阅提供回复数据，历史载入不发音。顶部沿用官方Button／Tooltip及版本事务，关闭自动保留manual请求通道；仍要求owner及有效配置。手动重播期间到达的实时attempt持续静音，避免抢占与后缀续读；会话释放时按身份清理待播队列。设置与原型说明同步新入口，无新增运行时依赖。

**证据**：`npm run check > /tmp/dsh-speech-icons-check.log 2>&1`为606通过／3跳过／0失败；`test/speech*.test.ts`34项，`test/client-entry.test.ts`补充声明就绪与消息身份绑定。`NODE_PATH=/tmp/dsh-rss-browser/node_modules DSH_UI_PLAYWRIGHT=/tmp/dsh-rss-browser/node_modules/playwright/index.mjs DSH_UI_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node_modules/.bin/tsx docs/verify-speech-actions.mjs`为4组／0错误，隔离验证需Playwright与clsx，证据在`docs/ui/verification/speech-actions-checks.json`及同目录WebP；原流式2组／10次音源与设置8组回归均通过。两次build两端摘要一致，7文件包逐文件相同，`node /tmp/dsh-speech-icons-package-check.mjs`指定扫描0命中，大小与摘要见首表。

**遗留**：本轮未安装／重启／发布；此前profile锁文件写权限阻塞仍未解除。真实宿主消息操作行和付费TTS尚未验证，不能以隔离浏览器结果代替。

### 2026-11-22 · 流式播报安装仍被profile写权限阻止

**背景**：用户明确要求安装并重启已验证的流式播报构建。

**决策**：先检查实际安装，发现已经是上一官方HTTP TTS构建；保留原插件与业务数据备份，通过官方CLI更新流式包。CLI在写profile锁文件时仍失败，核对原安装完整后保持应用运行，不进行无效重启、不更改权限或绕过沙箱。

**证据**：`/tmp/dsh-stream-install-20261122/install.log`记录`EACCES: permission denied, open .../profiles/desktop/package.json.lock`；`node /tmp/dsh-stream-install-20261122/install.mjs unchanged`显示7文件与备份一致、bundle启用、6业务状态0变化及cordis.yml不变。备份1290240字节、权限600；客户端摘要仍为`c9c753db23ebffb19e796f8e6dffe9cb9e062628a8f8f08ec949c09e1c162414`，进程17298／17399。流式安装包及其摘要见当前状态。

**遗留**：流式版未安装、应用未重启。需要放行profile写权限，或由用户在自己的终端执行官方CLI安装成功后退出并重新打开应用；真实TTS尚未验收。

### 2026-11-22 · 官方TTS逐句输入与PCM流式播放

**背景**：用户确认回答自动播报改为流式，减少等待完整回复及完整音频的延迟。

**决策**：复用官方Session正文live-chunk，按句子通过owner RPC顺序送入官方WebSocket；音频由Connection owner精确流路由返回NDJSON，浏览器PCM短缓冲播放，密钥留在宿主且不新增运行时依赖。兼容服务继续整段模式；手动停止、切会话、改配置和重连中断旧流，最终完整正文仅供用户重播。独立审查后区分文字finish与取消、正常step退休与放弃结算，并把finish_text后的计时改为音频空闲；再次核对官网，删除错误JSON ping，使用原生控制帧pong。

**证据**：`npm run check > /tmp/dsh-stream-check-final.log 2>&1`为599通过／3跳过／0失败；`test/speech*.test.ts`28项覆盖首音频早于finish、PCM半采样／背压、序号／owner／限额、跨帧行内代码及审查复现。设置浏览器8组通过；`DSH_UI_PLAYWRIGHT=/tmp/dsh-rss-browser/node_modules/playwright/index.mjs DSH_UI_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node_modules/.bin/tsx /tmp/dsh-stream-20261122/browser-check.mjs`为中英文2组／10次音源／0页面错误，记录在`docs/ui/verification/speech-stream-checks.json`。`npm run build`重复摘要一致；`npm pack --pack-destination /tmp/dsh-stream-20261122 --json`生成7文件安装包，`node /tmp/dsh-stream-20261122/package-check.mjs`逐文件一致、指定扫描0命中，当前摘要与大小见首表。

**遗留**：验收使用模拟官方WebSocket与真实浏览器AudioContext，未调用用户付费密钥，不代表真实服务音质、延迟或真实宿主已验收。此前profile写权限被沙箱拒绝，本轮不重复杀宿主安装；最新安装包尚未装入正式宿主。同版本源码与安装内容分别按摘要判断，未提交或发布。

### 2026-11-22 · 再次安装仍未获得profile写权限

**背景**：用户再次要求安装并重启，需确认工具权限是否已放行。

**决策**：复用已验证的新包、独立备份后按官方CLI更新；同路径沙箱拒绝重现，恢复旧宿主。安装授权与文件权限分开判断；后续须先确认实际权限变化，不能把重复口头授权视为权限已放行。

**证据**：`node /tmp/dsh-tts-install-20261122-2/install.mjs prepare`检查7文件、扫描0命中、备份1272846字节；`install.log`仍为写`profiles/desktop/package.json.lock`时EACCES，工具同路径明确拒绝。`install.mjs unchanged`确认7安装文件、6业务状态及cordis.yml未变、bundle启用；恢复后主进程16045／宿主16100，监听63318。客户端摘要仍为上一构建，见当前状态。

**遗留**：新版未安装；现有宿主已恢复启动。须放行profile写权限，或由用户在自己的终端执行已准备好的官方安装命令；真实TTS未验收。

### 2026-11-22 · 官方TTS安装重试仍被沙箱阻止

**背景**：用户再次明确要求安装并重启；已有安装授权，需实际重试官方CLI并核对当前环境结果。

**决策**：复用已验证官方TTS包，在独立临时目录重新检查7文件及内容扫描，备份当前插件、profile配置和工作台数据后正常退出主进程9227。仍只使用官方CLI离线添加本地包；锁文件写入被沙箱拒绝后恢复启动旧宿主，不更改权限、不使用替代写入方式。

**证据**：`node /tmp/dsh-tts-install-20261122/install.mjs prepare`返回7文件、0扫描命中，备份1272847字节；`install.log`首个实际安装错误为`EACCES: permission denied, open .../profiles/desktop/package.json.lock`，工具报告同路径沙箱拒绝。`open -a '/Applications/DeepSeek Harness.app'`后，`node /tmp/dsh-tts-install-20261122/install.mjs unchanged`确认bundle启用、7文件与备份一致、6项业务状态及cordis.yml不变；主进程13904、宿主13951、监听61968，客户端仍是上一构建摘要。证据保存为同目录`before.json/after-failed.json/install.log`。

**遗留**：宿主已恢复启动，官方TTS新版仍未安装。须在工具权限配置中放行desktop profile写权限后继续；再次口头安装授权没有改变本次实际沙箱结果。未发布、未调用真实TTS。

### 2026-11-22 · 默认接入官方TTS与安装受阻后的恢复

**背景**：用户指定默认使用DeepSeek官方语音文档；上一轮把“宿主暂无TTS服务”误解成“官方暂无TTS API”，默认只提供兼容协议。

**决策**：新配置默认官方`/v1/tools/tts`，只发送`text/voice_id/format/filter_markdown`、Bearer认证、stella／tide及WAV；官方不支持调速，隐藏模型／语速。旧无provider记录默认解析为compatible，保留接口、密钥及协议。官方文本前后端校验10000计费字符，请求再校验64KiB；超限提示跳过，不截断／拆分，不对官方失败自动换第三方。继续沿用官方事件与凭据事务；45秒／8MiB为插件保护上限，单独说明。CLI更新被profile锁文件沙箱权限阻止后恢复启动旧宿主，不绕过限制。

**证据**：`/tmp/dsh-official-tts-red.log`新增官方协议用例先失败；`npm run check`582通过、3跳过、0失败，完整输出`/tmp/dsh-official-tts-check.log`。覆盖旧协议兼容、官方请求字段／认证／音色、缺密钥／清除密钥拒绝、5000汉字及10000英文边界、超限不请求、断流不返回部分音频。隔离浏览器命令`DSH_UI_PLAYWRIGHT=/tmp/dsh-rss-browser/node_modules/playwright/index.mjs DSH_UI_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/ui/verification/personal-speech-check.mjs`8组通过，页面错误0、内容无横向溢出。首次菜单失败的滚动证据在`/tmp/dsh-official-tts-browser-diagnostic.log`：设置内容scrollTop279事件触发共享关闭规则；验收脚本先滚动并等待绘制帧后打开菜单，不改共用交互。两次构建摘要见首表及`/tmp/dsh-official-tts-hash-{before,after}.txt`。`node /tmp/dsh-tts-20261122/install.mjs prepare`核对7文件、扫描0命中并备份；官方CLI在写profile锁文件时EACCES（`install.log`），`open -a '/Applications/DeepSeek Harness.app'`恢复启动；`install.mjs unchanged`确认7文件与备份相同、bundle启用、6项业务状态及cordis.yml不变。

**遗留**：官方默认版已构建并出包，但尚未安装；需放行desktop profile写权限后用官方CLI更新并重启。实际官方计费请求、音频播放和真实模型读取未验收，本轮不读取或调用用户实际服务密钥。未提交或发布。

### 2026-11-22 · 官方安装新构建并重启桌面宿主

**背景**：用户明确要求安装并重启私人订制与语音播报的新构建。

**决策**：重新构建后在仓库外出包，逐文件核对白名单与当前构建，备份原插件和业务状态；正常终止旧桌面主进程，使用应用自带官方CLI直接添加新本地包，成功核对后通过`open -a`启动应用。不先卸载，不改权限，不发布。

**证据**：`npm run build`及`npm pack --pack-destination /tmp/dsh-install-20261122 --json`完成，7文件及指定内容扫描通过；安装命令见当前状态，`install.log`显示离线添加1包、下载0。`node /tmp/dsh-install-20261122/install.mjs verify`确认7文件一致、bundle启用、6项状态及cordis.yml摘要不变；旧主进程52618／宿主52662退出，新主进程2808／宿主2878启动，监听51274，未认证请求HTTP401。安装包及客户端摘要、回滚备份见当前状态。

**遗留**：安装与重启已完成；真实私人订制模型读取及第三方TTS服务／音频仍未验收。CLI保留既有pnpm设置及peer依赖警告，未据其执行无关依赖升级；宿主基线及既有审查边界保持原范围。

### 2026-11-22 · 私人订制与语音播报接入

**背景**：用户要求除代码协作外逐项实现待办，优先使用官方宿主及内置插件能力。

**决策**：档案通过官方fs和systemPrompt接入，缺fs才操作本机普通文件；播报复用官方Session事件和credentials grant存储，没有官方TTS时实现OpenAI兼容HTTPS输出。默认关闭，仅播报当前会话完整回合的最后正文。档案、播报与普通设置分别持久化，部分失败保留未提交草稿；无效规则不阻塞其他设置。迁移缺少目录绑定与原子归属接口，自实现无法满足保留执行目录及完整撤销契约，保留限制。

**证据**：`npm run check`577通过、3跳过、0失败，完整输出`/tmp/dsh-features-check-final.log`。`DSH_UI_PLAYWRIGHT=/tmp/dsh-rss-browser/node_modules/playwright/index.mjs DSH_UI_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/ui/verification/personal-speech-check.mjs`通过8组，证据`personal-speech-checks.json`与16张WebP。覆盖文件版本冲突、官方拒绝不降级、部分保存、20000字中文传输、私密配置、不跟随重定向、音频流上限、完整回复去重、停止与自动播放受阻。连续两次`npm run build`摘要一致，体积及摘要见当前状态。官方契约见SDK rc.5的`dsh-api-session-controller/lib/types/client/contract/events.d.ts`、`dsh-credentials/lib/types/index.d.ts`及`dsh-system-prompt/lib/types/index.d.ts`；本机ASAR只读核对产物在`/tmp/dsh-feature-contracts/`。

**遗留**：未提交、出包、安装或发布；未使用实际TTS凭据、真实音频或真实模型请求验收。官方TTS、迁移／迁移记录仍待宿主公开接口；旧正式宿主安装受阻状态与既有审查边界不据本轮构建解除。

### 2026-11-22 · SDK声明与依赖统一至rc.5

**背景**：SDK声明仍为rc.1，用户要求同步至rc.5。

**决策**：15项直接SDK依赖与兼容声明统一锁定rc.5；重新解析同组间接依赖，Zod随官方存储域升级至4.6.6，消除schema类型冲突。其他既有依赖版本保持不变。

**证据**：`npm ci --registry=https://registry.npmjs.org`安装成功；`npm run check`通过，565项测试通过、3跳过、0失败。锁文件69项DSH包均为rc.5，完整输出见`/tmp/wb-sdk-{resolve,ci,zod,check}.log`。两端字节与摘要见当前状态，分别增加126897与215076字节。

**遗留**：未安装或发布本次构建；模型菜单定位仍待适配，未接受rc.5宿主基线，未重跑浏览器或真实宿主验收。

### 2026-11-22 · 核对全部文档并清理与现行实现矛盾的说明

**背景**：文档残留过期说明；首轮清理反而增加正文。

**决策**：直接删除废弃及已合并片段，缩短必要标记；原章节与既有历史正文保留。

**证据**：净删减及逐项前后记录见根目录`docs-cleanup.md/json`；首轮`npm run check`通过。

**遗留**：缺失证据、npm政策与顶栏实现差异仍待更新；未重跑真实宿主验收。

### 2026-11-22 · 归并已完成方案与文案审查并清理过程副本

**背景**：当前状态已精简，用户要求继续精简其他过程文件；RSS方案、侧栏入口讨论和文案清单已由PRD、UI规范、正式组件及主原型覆盖，审计报告仍有C21／C22／C23未关闭。

**决策**：RSS选择文章优先的来源导航＋列表，未采用订阅卡片内堆叠最新文章；首轮宽屏独立阅读区后来按用户要求统一为各宽度共用二级阅读弹窗，避免维护两套阅读布局。侧栏入口位置和可用会话门禁只维护UI第0.1节及主原型，不把讨论稿的模拟工具内容当作官方能力。文案长期判据归入同节，已执行项及26项模拟宿主检查沿用2026-11-21记录；AST节点数不等于同时显示的文案数，宿主动态文案只记录调用点。审计以JSON保存完整证据、HTML供阅读，删除并行Markdown入口，保留原始CSV及未关闭事项；旧文件位置和原审查依据不改写为新事实。

**证据**：已归档10个路径、14个文件、731419字节，恢复清单为`.trash/20261122/manifest.json`，全部文件大小及SHA-256复核一致。`node /tmp/dsh-process-trim-20261122/verify.mjs`确认旧历史原文不变、31项原审计依据保留、C21／C22／C23未改、报告链接有效、17个保护路径存在及发布同步幂等；结果见同目录`verification.json`。`npm run check`通过，秘密扫描0命中、类型检查通过、565项测试通过／3项跳过／0失败、构建通过，完整输出见同目录`check.log`；维护文档与构建／测试入口未发现移除路径的活跃引用。本条追加于日志顶部，不改旧条目。

**遗留**：备份39类范围JSON、三个原型检查脚本、全部`docs/verify-*.mjs`及验收证据未清理；未做截图去重。审计C21／C22／C23、最新构建安装受阻及真实宿主验收边界保持，未发布或重装。隔离目录仅用于本地恢复，不进入Git及npm包；旧条目引用归档文件时须结合本条定位。

### 2026-11-21 · 安装遇文件沙箱拒绝并恢复旧宿主

**背景**：用户明确要求安装并重启本轮已验证的辅助文案精简版。

**决策**：复用最终安装包，经官方desktop-host CLI安装；先备份原插件／profile／工作台状态再退出宿主。官方CLI写锁文件被拒绝后确认原插件仍完整，启动原安装恢复使用，不通过替代方式绕过沙箱。

**证据**：`node /tmp/dsh-copy-clean-install-20261121.mjs prepare`核验7文件并创建1167497字节权限600备份。install阶段remove日志报`EACCES: permission denied, open ~/.dsh/profiles/desktop/package.json.lock`，工具明确报告文件沙箱限制。只读检查bundle启用、客户端仍为旧摘要；`open -a '/Applications/DeepSeek Harness.app'`后主52618／宿主52662运行，`lsof -nP -a -p 52662 -iTCP -sTCP:LISTEN`确认50385，curl未认证响应401。install-blocked.json记录6状态无变化、cordis.yml摘要一致。

**遗留**：新包未安装；用户安装授权已具备，当前只需工具允许写入desktop profile目录。旧宿主已恢复运行，最新构建与备份均保留。

### 2026-11-21 · 保留设置分区介绍并执行其他小字精简建议

**背景**：用户确认「设置分区介绍这个保留，其他按建议执行」，覆盖此前报告的删除介绍建议。

**决策**：分区介绍全部保留，其他文案按清单减少重复及机制说明；保存方式、目录作用范围、禁用原因及数据边界留在对应字段或条件区域。技能名称错误节点仅非法时渲染并关联读屏，合法后解除；市场关联文件说明并入文件区域，RSS格式示例移入输入占位。主原型与相关内嵌演示同步，不改变设置保存及模块业务契约。

**证据**：`npm run typecheck`及`npm test`通过（568项：565通过、3跳过）；`npm run build`最终输出见`/tmp/dsh-copy-clean-20261121-final-build.log`。`node /tmp/dsh-copy-clean-check-20261121.mjs`26项通过、页面错误0，检查24组真实语言初始化的1200／600／360px×violet／warm×宿主明暗及2组名称错误出现／解除、RSS占位／导入限制、OAuth缺服务提示；结果与WebP在`/tmp/dsh-copy-clean-20261121`。`node /tmp/dsh-copy-clean-verify-20261121.mjs`核验7文件一致、白名单、脚本语法、CSS不变量及当次包内容，摘要见同目录verification.json。`node /tmp/dsh-copy-audit-20261121.mjs`刷新43文件186节点，执行对照在根目录ui-copy.md。

**遗留**：新构建未安装、真实profile视觉和行为未验收；只读复查发现宿主已另行启动并运行旧客户端，后续具体重装及启动仍受前轮自动审批拒绝约束，本轮未尝试该动作。360px英文一级设置导航名称存在既有挤压，定向检查验证文案及状态，不表示所有视觉布局已验收；本轮未改导航名称和布局。

### 2026-11-21 · 合并两处说明为单行并审查其他辅助文案

**背景**：用户要求入口说明不要换行、删除首页布局底部提示，并列出其他同类小字的用途与必要性。

**决策**：两处指定说明合并small，复用12px辅助字号，窄面板省略并保留title／DOM全文；不批量删除其他提示。按源码语义区分重复引导、作用范围、能力缺失与数据元信息，报告放根目录ui-copy.md，动态节点保留AST附录。

**证据**：`npm run typecheck`、`npm test`、`npm run build`通过；568项测试565通过、3跳过；`node /tmp/dsh-copy-check-20261121.mjs`覆盖1200／600／360px×violet／warm×宿主明暗12组，页面错误0，证据在`/tmp/dsh-copy-20261121/checks.json`及同目录WebP。`node /tmp/dsh-copy-audit-20261121.mjs`扫描43文件188节点。`/tmp/dsh-copy-20261121-generated.json`记录生成物不变量与摘要。官方安装prepare核对7文件并保存权限600备份，旧主37010及宿主37042退出；install被自动审批拒绝，未执行remove／add或重新启动。

**遗留**：自动审批要求用户明确确认本次具体重装及启动后再继续；当前宿主已退出，新包未安装，真实profile新构建视觉及行为未验收。其他小字保留待用户判断，未发布。

### 2026-11-21 · 删除统计独立小字并将设置限制说明归位

**背景**：用户指定删除统计卡设置下方的小字，将入口约束和会话隔离能力提示放到对应设置项下方，避免独立说明占一行。

**决策**：删除统计显隐／跳转说明及空卡替代提示；两条限制说明移入对应setting-row左侧small，复用已有辅助字号及颜色，不新增提示框。原型统计常规状态不再显示说明，保留仅超限时显示的校验错误；导航动态提示保留在设置行内。沿用本会话安装授权，通过官方desktop-host入口重装并重启。

**证据**：`npm run typecheck`、`npm test`（568项565通过、3官方模块跳过、0失败）、`npm run build`及原型5段脚本语法通过。`node /tmp/dsh-hints-check-20261121.mjs`检查1200／600／360px×紫色／温暖×浅／深12组：两条说明均位于对应设置行、辅助字体12px、连接器说明左对齐且无溢出、统计独立说明不存在、关闭任一入口仍保留另一入口、页面错误0。`node /tmp/dsh-hints-install-20261121.mjs check`核验7安装文件一致、6状态文件0变化、bundle启用；新主37010／宿主37042，监听127.0.0.1:62303、未认证HTTP401。

**遗留**：真实profile视觉未直接验收、未发布；根目录审查报告及安装包仍保留原整改验收快照，最新安装摘要以当前状态首条为准。

### 2026-11-21 · 优化连接器设置能力提示的图文对齐

**背景**：用户截图标出了默认注入方式下的能力提示；原段落直接并列SVG和文本，没有显式图文间距，多行也缺少统一正文对齐。

**决策**：复用settings-inline-note，对带直属SVG的说明采用flex、8px间距和不收缩图标，正文单独包裹；沿用全局12px／18px辅助字体和主题颜色，原型补同一演示提示，共用规则只写UI规范第0节。初次测量发现全局辅助字体层实际行高为18px，按既有规格将14px图标首行偏移设为2px，不新增行高变体。沿用本会话安装重启授权，用官方desktop-host入口刷新同版本构建。

**证据**：`npm run typecheck`通过；`npm test`568项565通过、3官方模块跳过、0失败；最终构建及`node --import tsx --test test/prototype-css.test.ts`10项通过。`node /tmp/dsh-style-check-20261121.mjs`以实际React＋模拟宿主检查3宽度×2主题×2明暗，共12组：gap8px、图标14px、首行偏移2px、行高18px、正文0溢出、页面错误0。`node /tmp/dsh-style-install-20261121.mjs check`确认7安装文件一致、6状态文件0变化、bundle启用；新主33175／宿主33206，监听127.0.0.1:56665，未认证HTTP401。

**遗留**：真实profile视觉未直接验收，未发布；此前审查报告仍是上一轮整改包的验收快照，本轮安装摘要以当前状态首条为准。

### 2026-11-21 · 安装审查整改包并重启桌面端

**背景**：用户在整改验收后明确要求安装并重启，将本地修复产物交付到实际desktop profile。

**决策**：核验7项包文件并备份旧插件、profile及用户状态后退出桌面端，使用应用内`dsh-desktop-host/lib/cli.js`执行plugin remove／offline add刷新同版本缓存，再启动桌面端。通用`dsh/lib/bin.js`拒绝应用专属desktop profile，改用公开桌面专用入口；拒绝发生于配置修改之前。

**证据**：`node docs/ui/verification/install-audit.mjs before|after-install|after-restart`核验7文件一致、6状态文件0变化；私有备份`/tmp/dsh-audit-fix-20261121/before-install.tgz`1245271字节、权限600。旧主77951／宿主78002退出，新主29730／宿主29762启动；`lsof -a -p 29762 -iTCP -sTCP:LISTEN`显示127.0.0.1:52392，未认证curl返回401。profile的`dsh.profile.bundles`含dsh-workbase且无工作台覆盖项。`npm run host:check`为0阻断、1项缺已接受基线待复核，退出2；报告在`docs/ui/verification/host/report.json`。

**遗留**：未发布；真实profile视觉、外部OAuth及全量设计矩阵尚未验收。C21／C22／C23的历史与原索引边界保持未关闭，本次安装授权不涵盖历史改写。

### 2026-11-21 · 按公开前审查报告整改并补齐历史复验

**背景**：用户要求根据根目录`audit.html`修复全部31项；既有报告覆盖代码缺陷、公开信息、许可、验收与发布维护，当前目录没有Git元数据。

**决策**：按模块分开修复，保留原审查编号与依据。删除复查保存首次见证，目录事务独占日志，技能保存保留元数据；宿主公开能力优先，规则／消息使用owner有界专用传输，导入失败保留登记并持久化重试。原仓库只在临时完整镜像中读取，不恢复空.git、不改写历史或远端。内嵌库许可从构建输入收集，验收脚本共用环境与WebP编码。独立设计材料保留明确讨论／历史职责。

**证据**：`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`在Node24通过568项；缓存Node22.23.5运行`node --import tsx --test test/*.test.ts`同样568通过、0取消／跳过，`tsc --noEmit`及`node build.mjs`通过。Node22首次因非持久监听不保活导致12项取消，`test/skills-registry.test.ts`只增加有界等待超时，仍等待真实通知，目标用例10次复验通过。`docs/verify-header-motion.mjs`通过8组布局、16次弹窗、6项导航及层叠／间距检查；`npm audit --json`0公告漏洞。最终包7项逐字节核对及摘要见`audit.json.verification.pack`。完整镜像17 refs／711 objects／400 blobs、fsck通过、无LFS／gitlinks，秘密形态扫描0命中；当前指定公开材料内部域名／用户路径／非示例邮箱0命中。

**遗留**：原仓库历史仍有89处个人邮箱、5处用户路径候选，以及29处两个摘要的.internal候选；历史改写需明确授权，删除的原工作区索引不能由镜像证明。PR、分支保护、Secret Scanning／Push Protection、OIDC及实际桌面行为未远端验收。没有提交、推送、发布、安装或重启；旧本地包保存在临时证据目录，当前同版本包仅供验收。

### 2026-11-21 · 安装订阅导航版并重启

**背景**：用户要求安装并重启，使订阅菜单名称及顺序调整加载到桌面宿主。

**决策**：重新执行三项门禁并核查实际安装包，正常终止旧桌面进程；备份插件、profile及工作台配置，通过应用自带官方CLI移除并离线添加同版本包，文件一致后启动宿主。

**证据**：`npm run typecheck`、`npm test`、`npm run build`通过，495项测试493通过、2跳过，日志在`/tmp/dsh-nav-install-{typecheck,test,build}.log`。`node /tmp/dsh-workbase-install-verify.mjs --installed`重启前后均确认六项文件一致、bundle启用，结果在`/tmp/dsh-nav-installed-after-restart.log`；包与备份字节、哈希见当前状态。`ps`确认旧74232／74268退出、新77951／78002启动，`lsof`确认127.0.0.1:58617，`curl`未认证HTTP401。`/tmp/dsh-nav-config-before.json`的五项配置及缓存哈希安装后与重启后一致；host:check日志为`/tmp/dsh-nav-install-host.log`，0阻断、1缺基线待复核，退出2。

**遗留**：已确认安装、启用及宿主响应；真实profile菜单画面未直接验收，未接受新宿主基线。

### 2026-11-21 · 订阅菜单移到连接器上方

**背景**：用户要求将截图中的「RSS 订阅」移到「连接器」上方，名称改为「订阅」。

**决策**：调整正式概览导航及原型的分类数组，导航显示名复用既有订阅英文词典；键盘导航自然跟随数组，不修改RSS配置标识或首页保存的卡片顺序。

**证据**：`npm run typecheck`、`npm test`、`npm run build`均通过，495项测试493通过、2官方模块跳过；完整日志在`/tmp/dsh-subscription-nav-{typecheck,test,build}.log`。源码及原型数组核对技能／rss／mcp顺序与订阅显示名通过；客户端字节及哈希见当前状态。

**遗留**：本轮未安装重启，真实宿主及浏览器视觉未直接验收。

### 2026-11-21 · 安装市场本地缓存版并重启

**背景**：用户要求安装并重启，以加载市场本地先读、后台更新和失败保留的最新构建。

**决策**：重新执行类型、测试和构建门禁，正常退出桌面并备份插件／profile／工作台配置，通过官方desktop CLI remove／offline add重装同版本1.0.4；文件与RSS配置核对通过后启动，不向真实缓存写入测试目录。

**证据**：`npm run typecheck`、`npm test`、`npm run build`通过，495项测试、493通过、2官方模块跳过，完整日志为`/tmp/dsh-local-install-{typecheck,test,build}.log`。`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六项安装文件一致且bundle启用；当次包880864字节、SHA-256 `41ed19f982f8b508b6172e920073e95e884e2ad655585811e607c0dc56c2ccfb`，白名单及指定敏感模式核查通过。备份`/tmp/dsh-local-before-install.tgz`1196733字节、权限600，RSS配置前后及重启后哈希一致。`ps`确认新主74232／宿主74268，`lsof`确认127.0.0.1:54784，`curl`未认证请求401。host:check为0阻断、1缺已接受基线待复核，退出2。

**遗留**：安装及宿主运行已核对；真实profile首次缓存写入和视觉未直接验收，首次市场加载成功后自动生成本地文件。宿主首次源码评估基线尚未接受。

### 2026-11-21 · 市场目录改为本地先读并后台更新

**背景**：用户要求市场数据保存到本地，每次打开读取新数据后更新本地，避免此前内存缓存在宿主重启后丢失。

**决策**：使用独立mcp-market.json保存已解析配置候选及完整说明，不与连接配置或官方凭据库混存。缓存键使用来源／地址／查询哈希，限制20份与20 MB，旧范围先淘汰；结构校验恢复，损坏可重建。新增market.cached独立只读入口，客户端先展示本地再后台更新，以取消信号及远端完成标记防旧回执覆盖。写入使用600临时文件和原子替换，保存失败保留在线结果并提示；成功空响应也落盘。

**证据**：新增2项服务端回归先失败，`/tmp/dsh-market-local-red.log`记录缓存文件未创建及本地读取入口缺失；完成后定向测试和组件本地先读／在线替换／迟到丢弃测试通过。`npm run typecheck`、`npm test`、`npm run build`通过，495项测试中493通过、2官方模块跳过，完整日志为`/tmp/dsh-market-local-{typecheck,test,build}.log`。`node --import tsx /tmp/dsh-market-local-roundtrip.mjs`在隔离临时目录验证真实社区目录的141个候选落盘后重建管理器逐字段一致恢复；缓存212792字节、权限600，结果为`/tmp/dsh-market-local-roundtrip.log`。产物字节与哈希见当前状态。

**遗留**：未安装或重启真实宿主，用户profile尚未生成这次新增的本地缓存文件，真实profile视觉未直接验收。没有成功缓存的范围仍需首次联网；单份目录超过20 MB时提示保存失败，远端多页未完整成功时不覆盖本地成功目录。

### 2026-11-21 · 修复连接器市场刷新失败后列表清空

**背景**：用户反馈市场有时有数据、有时无数据，截图显示通用目录失败提示。静态追踪确认后端把所有异常压成同一句话并返回空列表，前端将空列表替换旧结果，且重新进入会再次请求。

**决策**：保留同来源、同地址、同查询最近成功目录，只在失败时复用并明确标旧；成功空响应仍更新为空，取消不作为失败回退。缓存最多20份、仅当前宿主内存，不修改来源配置或自动连接。用安全的错误类别代替原始异常内容，可选reason／cached帮助界面准确翻译，保留旧message／sourceId响应字段。

**证据**：新增3项服务端回归先失败，`/tmp/dsh-market-stability-red.log`记录503刷新后候选被清空及超时原因被通用文字吞并；修复后定向测试通过。`npm run typecheck`、`npm test`、`npm run build`通过，492项测试中490通过、2官方模块跳过，完整日志为`/tmp/dsh-market-stability-{typecheck,test,build}.log`；组件失败回执测试见`/tmp/dsh-market-stability-ui.log`。当前唯一启用源`cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json`通过Node与curl现测均200，前者329124字节、130个描述，后者326285字节、129个描述；`parseMcpMarket`解析后者为141个候选，39个有兼容配置提示。原型5段脚本语法通过，产物字节与哈希见当前状态。

**遗留**：未捕获截图发生时的原始远端错误，不能认定那次一定是超时、网络还是格式异常。本轮未安装重启；真实profile视觉及远端持续稳定性未直接验收。首次失败无成功缓存、重启缓存清空，官方多页中途失败仍不发布半批结果。

### 2026-11-21 · 安装连接器统一文案构建并重启

**背景**：用户明确要求安装并重启，宿主仍加载上一轮统一时间范围构建。

**决策**：重新执行类型、测试及构建门禁，正常退出桌面后备份旧插件、profile和工作台配置，通过官方desktop CLI remove／offline add重装同版本1.0.4；安装与RSS配置核对通过后启动宿主。

**证据**：`npm run typecheck`、`npm test`、`npm run build`通过，测试488项、486通过、2官方模块跳过，完整日志为`/tmp/dsh-connector-install-{typecheck,test,build}.log`。`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六项安装文件与工作区一致且bundle启用；当次包白名单及指定敏感模式核查通过。包878508字节、SHA-256 `f2573ddfff5525e7aa6b84c57bd013e08614998a23100bf9d286df4fd072f88e`。备份`/tmp/dsh-connector-before-install.tgz`1196375字节、权限600；RSS配置安装前、后及重启后哈希一致。`ps`确认新主64753／宿主64817，`lsof`确认127.0.0.1:60114，`curl`未认证请求返回401。`npm run host:check`报告0阻断、1缺已接受基线待复核，退出2。

**遗留**：安装文件及宿主运行已核对；实际profile视觉未直接验收，宿主首次源码评估基线尚未接受。

### 2026-11-21 · 统一连接器显示文案

**背景**：用户要求统一命名，将MCP替换为连接器；首页短标签已更新，但概览导航、管理面板、市场和设置仍存在旧称。

**决策**：统一工作台自有显示文案及已知服务端提示，同步英文与原型／产品文档；中文去除旧英文缩写两侧不必要空格，英文词典合并重复键。保留模块、RPC、配置和凭据标识，以及用户服务名称与协议结构。

**证据**：`npm run typecheck`、`npm test`、`npm run build`通过，488项测试中486通过、2官方模块跳过；完整日志为`/tmp/dsh-connector-copy-{typecheck,test,build}.log`。原型内联5段脚本经`new Function`语法检查通过。源码与原型显示文案扫描无MCP残留，服务端仅剩3处WB_MCP凭据标识；UI规范保留一处用于说明命名映射。客户端1534096字节、SHA-256 `95223dc1a372d93391dcc96afa516949d4104f574ea7f7e563fe2e126823f5ad`，服务端2283529字节、SHA-256 `34476fb605848b1f34e80d7de128aef151a173da9fd3cb642cbc7167f9c92a28`。

**遗留**：本轮仅修改文案并构建，未安装或重启，真实profile视觉未直接验收。

### 2026-11-21 · 安装统一时间范围与首页短标签构建

**背景**：用户要求安装并重启，桌面此前仍加载包含文章列表局部时间框的构建。

**决策**：沿用1.0.4，通过官方desktop CLI remove／offline add重装以保证同版本替换生效；正常退出宿主后备份旧插件、profile和工作台配置，文件及RSS配置核对通过后启动。

**证据**：`npm run typecheck`、`npm test`、`npm run build`通过，测试488项、486通过、2官方模块跳过，完整日志为`/tmp/dsh-range-install-{typecheck,test,build}.log`。`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六项文件与工作区一致且bundle启用；当次六项包白名单与指定敏感模式核查通过。包878536字节、SHA-256 `1c3fffb121cee1129b2dbeca3bb867cff35bb5f6c59c9cbb08491f70d33fab3f`。备份`/tmp/dsh-range-before-install.tgz`1191882字节、权限600；安装前、后及重启后RSS配置哈希一致。`ps`确认新主57756／宿主57806，`lsof`确认127.0.0.1:53101，`curl`未认证请求返回401。`npm run host:check`报告0阻断、1缺已接受基线待复核，退出2。

**遗留**：安装一致性和宿主运行已核对；真实profile视觉、订阅抓取和外部MCP握手未直接验收，宿主首次源码评估基线尚未接受。

### 2026-11-21 · 移除RSS局部时间框并简化首页标签

**背景**：用户指出RSS列表新增的时间下拉框违背统一跟随外观布局统计时间范围的要求，并要求首页技能／连接器等名称简洁。

**决策**：移除局部recentOnly状态与时间Picker，列表及分组数量直接接收全局statDays；新增订阅保留定位和单源刷新，但不再切换全部文章。首页标签改技能／连接器／订阅，数字定义及悬停说明保留；设置对应统计名称同步。原型忽略旧页面range字段，不再产生局部范围选择，历史缓存保留。

**证据**：`test/ui-interaction.test.ts`无局部Picker／全局天数变化及新增后范围不变断言、`test/home-render.test.ts`短标签断言改前3组失败，改后定向及全量通过。`npm run typecheck`通过；`npm test`488项、486通过、2官方模块跳过、0失败；`npm run build`客户端1533163字符。Node `vm.Script`解析真源5段脚本，时间select残留0，CSS括号配平、无宽度型媒体查询且温暖作用域保留，日志`/tmp/dsh-range-label-{typecheck,test,build,static}.log`。

**遗留**：本轮仅修改源码、原型与文档并构建，没有安装或重启；实际profile视觉未验收，桌面仍为上次已安装产物。正文详情缓存与Agent历史读取不因列表时间筛选被清理。

### 2026-11-21 · 安装市场状态与订阅新增流程并重启

**背景**：用户明确要求安装并重启，将统计卡及五项市场／订阅交互调整更新到真实desktop。

**决策**：重新执行本机门禁并核对本地包，正常退出旧桌面及宿主后备份旧插件、profile和工作台配置；通过应用自带官方CLI remove／offline add重装同版本，核对安装文件与bundle启用后启动。保留订阅与既有模块配置。

**证据**：`/tmp/dsh-market-install-{typecheck,test,build}.log`记录三关通过，488项测试、486通过、2官方模块跳过。`npm pack --ignore-scripts --pack-destination /tmp --json`与`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六项白名单、指定敏感模式无命中、包／安装／工作区文件一致。官方`plugin --profile desktop remove dsh-workbase`及`add /tmp/dsh-workbase-1.0.4.tgz --offline`退出0，reused 1、downloaded 0、added 1。`ps`确认旧35018／35056退出、新51645／51677运行，`lsof`确认127.0.0.1:59346监听，未认证GET `/`返回401。RSS配置安装及重启前后哈希一致。`npm run host:check`0阻断、1缺已接受基线待复核、退出2；详情及哈希见当前状态和`/tmp/dsh-market-install-*.log`。

**遗留**：实际profile视觉与新订阅抓取、外部MCP握手没有直接验收；备份`/tmp/dsh-market-before-install.tgz`权限600。安装包与临时证据保存在/tmp，不进入源码及npm包。

### 2026-11-21 · 更新市场卡片状态并定位新增订阅

**背景**：用户要求订阅保存后自动进入新增来源并获取文章，推荐添加隐藏侧栏，技能及MCP市场使用安装／连接文案并反映保存状态，管理文字悬停不显示下划线。

**决策**：推荐添加用来源标记复用单栏RssEditor；新增保存先定位来源、清空旧搜索、切全部文章，再单源刷新，失败保留订阅。编辑及导入保持各自流程。市场保存回执关联候选与记录，MCP已有配置按端点匹配，卡片显示当前握手状态；状态按钮打开已有详情，管理启停仍保留开关。关联缓存不修改存储契约；管理链接去下划线，阅读正文链接保留排版。

**证据**：`npm run typecheck`、`npm test`488项（486通过、2官方模块跳过）及`npm run build`通过。`test/ui-interaction.test.ts`新增三组回归并补回执名称变化断言；初次三组测试失败，实施后全量通过。最终构建客户端1533322字符；Node `vm.Script`解析原型5段脚本，生成CSS括号配平、宽度型媒体查询0、温暖主题保留、56个`@container workbase `查询，四处管理悬停选择器生成text-decoration:none。完整执行日志保存在`/tmp/dsh-market-{typecheck,test,build,static}.log`。

**遗留**：未打开浏览器、安装desktop或重启，实际profile视觉、自动抓取和MCP握手未验收。候选身份回执关联仅保留在当前ClientPort生命周期；重建连接后按已有名称／端点补匹配，改名技能无法跨连接精确反推原市场身份。

### 2026-11-21 · 简化统计卡并让RSS更新时间跟随统计设置

**背景**：用户确认移除统计卡下方小字，明确技能／MCP数字维度，并让RSS展示最近文章更新，时间范围复用设置中的统计卡天数。

**决策**：保留现有技能全局生效去重和MCP连接数，只明确标题；RSS按文章发布时间计算启用源近期缓存文章数，排除未知与未来时间，不按刷新新增或fetchedAt统计。卡片范围和异常说明迁至title／aria-label，状态色保留；详情与首页共用筛选函数，默认清空旧分组和搜索，允许切回全部文章。移除真源104px最小高，复用现有内边距、字号、圆角和工具栏Picker。

**证据**：`npm run typecheck`通过；`npm test`485项、483通过、2项官方模块跳过、0失败。`test/rss.test.ts`验证7／14／30天及停用源、未知／未来时间，`test/rss-panel.test.ts`验证近期／全部列表及译文，`test/ui-interaction.test.ts`验证天数变更取消旧请求、迟到结果隔离与旧搜索覆盖，`test/home-render.test.ts`验证无小字与标题。`npm run build`同步生成样式并打包两端；Node `vm.Script`静态解析视觉真源5段脚本通过。

**遗留**：本轮仅验证源码、模拟React回调和构建，没有打开浏览器、安装desktop或重启真实宿主；实际profile视觉与运行行为未验收。RSS统计仅覆盖已缓存文章，已有容量和订阅刷新频率保持原策略。

### 2026-11-21 · 安装统一正文阅读版并重启

**背景**：加载首帧及正文结构修复已通过本机门禁，需要沿用此前授权更新真实desktop安装，保留首页及分组的既有调整。

**决策**：先备份旧插件、profile和RSS状态，确认旧桌面及宿主退出后通过官方CLI remove／offline add安装同版本本地包，再启动桌面；不修改订阅配置或批量重写真实正文缓存。

**证据**：`npm run typecheck && npm test && npm run build && node --import tsx docs/verify-rss-reading.mjs && npm pack --ignore-scripts --json`通过，481项测试、479通过、2项官方模块跳过，12组浏览器无摘要闪烁及页面横向溢出。两次构建SHA-256一致；包876307字节、六项白名单与文件一致性及指定敏感模式核查通过。官方remove／offline add与启动退出0，六项安装文件逐字节一致、bundle启用，新主35018／宿主35056监听53006、未认证HTTP401；RSS配置安装前后哈希相同。`npm run host:check`0阻断、1缺已接受基线待复核、退出2。真实HelloGitHub响应经当前提取器获得12个分类标题及40个项目标题链接，正文8455字符；没有修改真实缓存。最终构建及包哈希见当前状态。

**遗留**：真实profile视觉与正文RPC未直接验收；官方Markdown优先分支由组件测试确认，浏览器回归使用白名单降级渲染。备份保留在`/tmp/dsh-rss-format-before-install.tgz`，验证截图及JSON在`/tmp/dsh-rss-browser/`，均不进入npm包。

### 2026-11-21 · 修复阅读首帧并统一订阅正文结构

**背景**：用户反馈打开文章仍闪现黄色提示，抓取后的项目介绍失去标题／链接并被元信息拆成许多空段。根因是纯文本清理丢失语义，Readability也会删掉无语义短链接卡片。

**决策**：首帧和请求期间只显示中性骨架；RSS HTML、Atom XHTML和原文统一清理为安全阅读结构，保留纯文本兼容Agent，转安全Markdown优先复用已接线的宿主渲染，能力缺失才使用React白名单。抽取前按通用标题字形／编号与附近正文补标题语义、合并图标短元信息，不硬编码HelloGitHub模板。旧原文缓存缺结构时按需重提取，原生正文刷新后补结构，补齐不改已读游标。

**证据**：`test/ui-interaction.test.ts`修改前失败于加载时仍包含摘要；修改后首帧、失败重试及切换取消通过。`test/rss-content.test.ts`覆盖RSS HTML／Atom XHTML／纯文本、链接卡片、代码／表格／链接及危险属性清理；`test/rss.test.ts`实盘临时缓存删除bodyContent后重启并补齐结构，sequence不变。`npm run typecheck && npm test && npm run build`通过，481项测试、479通过、2项跳过。`node --import tsx docs/verify-rss-reading.mjs`验证1100／650／360px×中英文×明暗12组，正文white-space为normal、段距16px、页面无横向溢出、代码可横向滚动；JSON与WebP保留在`/tmp/dsh-rss-browser/`。连续构建客户端／服务端哈希相同，最终体积和安装证据在本轮安装记录。

**遗留**：浏览器RPC为模拟、官方Markdown优先分支由组件测试验证，未直接验收真实profile阅读画面；网站动态／登录内容及图片继续通过原文入口阅读。正文结构占用缓存预算，8MB总缓存上限保留。

### 2026-11-21 · 安装默认分组移动与文章原文阅读版

**背景**：用户明确要求安装并重启，需将本轮RSS分组位置与原文正文修改加载到桌面宿主；当前工作区同时保留已完成的首页五卡900px断点。

**决策**：重新验证并打包当前源码，先备份旧插件和profile配置，通过应用自带官方desktop CLI remove／offline add更新同版本安装，确认旧桌面退出后启动；不手改profile依赖或订阅数据。

**证据**：`npm run typecheck && npm test && npm run build && npm pack --ignore-scripts --json`通过，476项测试、474通过、2项跳过。包六项白名单与源码／构建产物一致，指定私钥头、本机用户路径、内部域名及令牌模式无命中；包872851字节，SHA-256 `b909974f44d44154e32137c674b42207d70d8e79eaaeeaee7ef7568a0976d05f`。官方remove／offline add与`open -a 'DeepSeek Harness'`退出0；六项安装文件逐字节一致，profile的`dsh.profile.bundles`含工作台。新主25881及宿主25923存在，监听59166，未认证HTTP401；RSS配置哈希安装前后一致。`npm run host:check`报告0阻断、1项没有已接受基线待复核，退出2。

**遗留**：安装与重启已完成；本轮不以进程启动或文件一致代替真实profile视觉和正文RPC验收。旧安装及配置备份保留在`/tmp/dsh-rss-reader-before-install.tgz`。

### 2026-11-21 · 安装五卡900px断点版并重启

**背景**：用户要求安装并重启，加载五卡在统计区域900px起保持一行的断点调整。

**决策**：重新执行三关并出包，核对当次六项白名单与指定敏感模式，备份desktop配置及旧插件后使用官方CLI remove／offline add刷新同版本安装；确认旧桌面主进程和宿主退出后启动应用，再复核安装一致与启用状态。

**证据**：`/tmp/dsh-breakpoint-install-{typecheck,tests,build}.log`记录三关通过，476项测试474通过、2跳过；`src/client/prototype.css`保留899px五卡独立查询。`node /tmp/dsh-workbase-install-verify.mjs --installed`安装后及重启后均确认六文件一致、bundle启用；包872823字节，SHA-256 `6d64226e49189936bf13cd736fdc9de886b93c6840fff42b8a6a34d07a0b1e4a`，备份`/tmp/dsh-breakpoint-before-install.tgz`。`/tmp/dsh-breakpoint-restart.log`记录旧主17617／宿主17699退出，新主22144／宿主22222及127.0.0.1:55842监听、HTTP401；`/tmp/dsh-breakpoint-install-host-check.log`记录0阻断、1项缺已接受基线待复核，退出2。

**遗留**：已验证安装文件、启用与宿主启动，尚未执行真实profile视觉验收；下方900px断点待安装状态已解除。

### 2026-11-21 · 默认分组参与排序并按需抓取文章正文

**背景**：默认分组被导航追加至末尾且拖拽、菜单与后端移动均排除空ID；截图的HelloGitHub第127期缓存`body`为空。实测`https://hellogithub.com/rss`只提供项目数量摘要，原文`https://hellogithub.com/periodical/volume/127`返回包含正文的静态HTML；原详情仅显示缓存，未调用任何原文抓取。

**决策**：保留空ID系统身份，以独立位置字段兼容旧配置并使默认分组参与拖拽和菜单排序；全部订阅始终置顶，系统组仍不可改名／删除。详情缺正文时显式调用`article.fetch`，复用已有安全传输及共享并发槽，采用Readability与linkedom提取而不自写HTML正则正文算法。两依赖仅打入服务端，客户端不新增依赖；官方HTTP服务无法提供现有DNS固定和逐跳地址策略，不作失败后无条件降级。缓存补齐不修改文章sequence，RSS内容未变时保留提取正文；失败保留摘要且可重试。

**证据**：`node --import tsx --test --test-name-pattern='默认分组初始置顶|文章详情按原文' test/rss.test.ts`修改前分别失败于缺位置字段及未知`article.fetch`；修改后持久排序、正文请求去重／清理／跨重启复用／刷新保留、HTTP503与私网拒绝回归通过。`test/ui-interaction.test.ts`覆盖默认组菜单／拖拽、正文失败重试／切换取消／迟到结果隔离。完整`npm test`476项、474通过、2项官方模块跳过；`npm run typecheck`通过。真实HelloGitHub原文响应247583字符，隔离RssManager以公开RSS及`article.fetch`读取第127期，161字符摘要补齐为7528字符纯文本正文，bodySource为original且sequence不变；没有修改真实订阅缓存。本机服务端构建产物可导入，连续两次构建服务端与客户端SHA-256分别一致；正文提取服务端相比上一轮1417239字节增加约858KB，客户端增加约2.3KB，最终体积以本轮构建输出为准。

**遗留**：本轮尚未安装或重启宿主，真实profile视觉和实际详情RPC未验收。正文仅支持静态可提取页面，不处理登录、验证码或纯客户端渲染；页面最多2 MiB／50000元素，正文最多50000字符，复用8 MiB缓存上限。工作区没有Git元数据，未提交或发布。

### 2026-11-21 · 五卡单行阈值调整为900px

**背景**：用户截图中五卡排列为3＋2，右下留空并挤压项目总览，确认在区域宽度900px起使用五列。

**决策**：五卡使用独立899px容器查询，不再参与1139px的三列规则；保留720px、420px的列数边界以及其他卡数现有规则，沿用字号、高度和12px间距。仅改样式真源，生成物由构建更新。

**证据**：`/tmp/dsh-five-breakpoint-{typecheck,tests,build-1,build-2}.log`记录类型检查、476项测试（474通过、2跳过）及两次构建成功；`diff -u /tmp/dsh-five-breakpoint-hash-1.txt /tmp/dsh-five-breakpoint-hash-2.txt`无差异。`src/client/prototype.css`的`workbase-stats`查询包含899px五卡、719px两列和419px单列，1139px选择器不再包含五卡；Node断言确认上述独立查询、括号配平、0宽度媒体查询及`:scope.c`保留。

**遗留**：未打包安装或重启；本轮验证为源码、生成CSS与本机构建，未执行浏览器或真实profile视觉验收。

### 2026-11-21 · 安装首页五卡默认版并重启

**背景**：用户要求安装并重启，加载已完成的默认五卡顺序与诊断隐藏改动。

**决策**：重新执行类型检查、全量测试和构建后出包，复核当次六项白名单及指定敏感模式，备份desktop配置与旧插件；沿用官方CLI remove／offline add更新同版本安装，再停止旧主进程、确认宿主退出并启动桌面端。

**证据**：`/tmp/dsh-five-install-{typecheck,tests,build}.log`记录三关通过，472项测试470通过、2跳过。`node /tmp/dsh-workbase-install-verify.mjs --installed`在安装及重启后确认六文件一致与bundle启用；包669918字节，SHA-256 `5bd031dd302662b2b3bd74d0684e6e34a01edc5ea4b438a52445d48ba6a8a2f2`，备份`/tmp/dsh-five-before-install.tgz`。`/tmp/dsh-five-restart.log`记录旧主9817／宿主9894退出、新主17617／宿主17699及127.0.0.1:51760监听、HTTP401。`/tmp/dsh-five-install-host-check.log`记录0阻断、1项缺已接受基线待复核，退出2。

**遗留**：已验证安装一致、启用和宿主启动，未读取或修改用户实际首页偏好，也未进行真实profile界面验收；下方五卡版待安装状态已解除。

### 2026-11-21 · 首页默认五卡并隐藏诊断

**背景**：用户确认首页显示运行中、待办、近期会话、技能与RSS，诊断和MCP默认隐藏，需使旧标准偏好同步生效。

**决策**：修改共享默认及原型恢复逻辑，在默认填充前识别旧标准顺序的四卡／六卡及目标五卡组合；自定义组合保留，新完整顺序作为升级后的边界，避免重新开启诊断后每次解析又被隐藏。完整七项顺序仍持久保存，保留现有拖拽、显隐设置和最多六项限制。

**证据**：`npm run typecheck`、`npm test`及连续两次`npm run build`通过，对应`/tmp/dsh-five-{typecheck,tests,build-1,build-2}.log`；472项测试470通过、2跳过，`diff -u /tmp/dsh-five-hash-1.txt /tmp/dsh-five-hash-2.txt`无差异。`node --import tsx /tmp/dsh-five-verify.mjs`核对原型5脚本／7JSON、8组正式与原型迁移一致、CSS括号配平、76个workbase容器查询、0个宽度媒体查询及温暖主题保留。正式渲染顺序及迁移断言见`test/home-render.test.ts`。

**遗留**：仅完成源码及本机构建，本轮未打包安装或重启；未进行浏览器或真实profile视觉验收。与旧默认完全相同的手动配置无法区分，按标准组合升级。

### 2026-11-21 · 安装推荐订阅与首页排序版并重启

**背景**：用户要求安装并重启，以加载此前完成的六项RSS及首页统计改动。

**决策**：重新执行三关后出包，核对当次白名单和指定敏感模式，备份desktop配置及旧插件；使用官方CLI remove／offline add刷新同版本缓存。停止旧桌面主进程并确认宿主退出，再启动应用，重启前后核对六文件一致与bundle启用。

**证据**：`/tmp/dsh-six-install-{typecheck,tests,build}.log`记录类型检查、470项测试（468通过、2跳过）及构建通过。`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六项安装文件一致、版本1.0.4、bundle启用；包669640字节，SHA-256 `bf3fa4f44d7d1d278d5d1d5cbe641b63f26c7ad60777040975d7d06b92603f78`，备份`/tmp/dsh-six-before-install.tgz`。`node /tmp/dsh-six-restart-check.mjs`及`/tmp/dsh-six-restart.json`确认旧主99557／宿主99624退出，新主9817／宿主9894及127.0.0.1:58476监听、HTTP401。`npm run host:check`输出0阻断、1项缺已接受基线待复核，退出2。

**遗留**：此次验证安装一致、启用与宿主启动，未执行真实profile视觉、拖拽或真实推荐端点抓取验收；下方上一轮待安装状态已解除。

### 2026-11-21 · 迁入推荐订阅并支持首页统计卡排序

**背景**：用户要求默认分组图标与新增／导入默认值、精简推荐名称及RSS卡小字，迁入参考项目的推荐数据，并支持首页卡片拖拽排序。

**决策**：复用原生拖拽、现有偏好事务和图标规格，不增加运行时依赖。新statOrder保存完整7项且校验无重复，旧偏好补默认值，隐藏卡不从顺序删除；整卡支持Alt＋方向键。默认分组固定文件夹并禁止折叠旋转，自定义分组保留箭头。参考目录保留17条原生地址及双语说明／元数据，空说明不编造；来源MIT版权并入LICENSE。新草稿默认系统分组，保留用户未完成选择与OPML内部分类，成功导入清空草稿。

**证据**：`npm run typecheck && npm test`为470项、468通过、2跳过。`test/home-render.test.ts`覆盖旧偏好、完整顺序、显隐及重复校验；`test/store.test.ts`覆盖持久化重载及失败；`test/ui-interaction.test.ts`覆盖拖拽、键盘、外部拖拽、拖后点击、忙态、推荐及新增／导入／编辑默认值；`test/rss.test.ts`覆盖17项目录和实际刷新前后摘要，`test/rss-panel.test.ts`覆盖图标及中英文摘要。连续两次`npm run build`后`shasum -a 256 lib/client.js dist/index.js src/client/prototype.css src/client/prototype-icons.ts`一致。以esbuild转译参考catalog逐字段比较推荐及英文说明，原型JSON目录相同；node:vm检查5脚本，JSON.parse检查7段数据，生成CSS括号配平、76个workbase容器查询、0宽度媒体查询且保留`:scope.c`。客户端1520703字节（1520486字符），服务端1416348字节，当前状态记录当次哈希。

**遗留**：未安装重启，桌面仍加载此前构建；未做浏览器拖拽、触屏或真实profile视觉验收。目录移植不等于17个公网端点逐一抓取可用性验收。

### 2026-11-21 · 安装分组整行点击版并重启

**背景**：用户要求安装并重启，桌面尚未加载扩大分组点击区域、移除订阅双击改名的最新构建。

**决策**：重新执行类型检查、全量测试及构建，打包后核对白名单和包与工作区一致；备份desktop配置及插件，通过官方CLI remove／offline add重装同版本1.0.4。确认旧主进程和宿主退出后再启动应用，重启前后核对安装文件及bundle启用。不改版本，不发布。

**证据**：`/tmp/dsh-rss-row-install-{typecheck,tests,build}.log`记录三关通过，463项测试中461通过、2跳过。`node /tmp/dsh-workbase-install-verify.mjs --installed`核对六项文件一致及启用状态，客户端SHA-256 `745a1b250d5cfeffe06cb1a93a1cd5f040a320bb7168abcc7db7b1a99df31b7d`；包665275字节，SHA-256 `13ae95bb1e3d6025f68dee42a4b6b9842689834a3a61227c79f9ea18ae0f4e71`，白名单及指定敏感模式检查通过。备份`/tmp/dsh-rss-row-before-install.tgz`。`/tmp/dsh-rss-row-restart.json`确认旧主95280／宿主95332退出，新主99557／宿主99624及127.0.0.1:62636监听，HTTP401。`/tmp/dsh-rss-row-install-host.log`为0阻断、1缺已接受基线待复核、退出2。

**遗留**：本次验证安装、启用、进程替换及宿主监听，未做真实profile界面、触屏或真实订阅操作验收；下方上一轮待安装状态已解除。

### 2026-11-21 · 扩大分组点击区域并移除订阅双击改名

**背景**：用户要求扩大分组展开／折叠点击区域，并移除订阅名称双击重命名。

**决策**：沿用现有导航列宽、行高及本地即时折叠／后台串行保存，分组行处理箭头、数量和空白点击；名称按钮保持键盘语义，行事件排除按钮、菜单及输入以避免冒泡重复切换和误触，编辑及拖拽期间不折叠。订阅仅移除双击入口和悬停提示，F2及菜单编辑保持。原型对应行委托与dblclick监听同步修改，UI第0节、PRD及rss-design同步当前规则。

**证据**：`test/ui-interaction.test.ts`整行点击及订阅双击移除两项改前失败，改后含`test/rss-panel.test.ts`共50项定向通过。`npm run typecheck`、`npm test`通过，463项中461通过、2项官方模块跳过，日志`/tmp/dsh-rss-row-{typecheck,tests}.log`。`node /tmp/dsh-rss-row-check.mjs`连续两次构建四产物SHA-256一致，原型5脚本／7JSON可解析、CSS括号配平、宽度型媒体查询0、workbase容器查询76且保留温暖主题；核对分组指针样式、独立控件排除及无订阅dblclick监听。客户端1510707字符，SHA-256 `745a1b250d5cfeffe06cb1a93a1cd5f040a320bb7168abcc7db7b1a99df31b7d`，服务端仍为`7ab1993d8e1c1bafabd816c9602faa9fb280a0c61ca15704ea1e8caa3b6bd049`；数据`/tmp/dsh-rss-row-check.json`，构建日志`/tmp/dsh-rss-row-build-{1,2}.log`。

**遗留**：本轮只完成源码、原型、文档及构建，未安装或重启，桌面仍为上一轮订阅双击改名版。静态与事件回调验证不替代浏览器、触屏和真实profile界面验收；无新增运行时依赖，未改版本或发布。

### 2026-11-21 · 安装订阅双击改名版并重启

**背景**：用户要求安装并重启，桌面尚未加载分组双击改名移除、订阅名称双击原位改名的最新构建。

**决策**：重新执行类型检查、全量测试及构建后打包，核对白名单与包内容；备份desktop插件及配置，通过官方CLI remove／offline add重装同版本1.0.4，退出旧主进程后重新启动桌面应用。不改版本，不发布。

**证据**：`/tmp/dsh-rss-rename-install-{typecheck,tests,build}.log`记录三关通过，462项测试中460通过、2跳过；`node /tmp/dsh-workbase-install-verify.mjs --installed`在重启前后核对六项文件与工作区一致且bundle启用，客户端SHA-256 `f435c85dd068992ca72ab519401a7863fddce286611d68ba5026529fe19dab42`。包665293字节，SHA-256 `d13a310ddacf79c550db2cfeca26f9fb4ccbec6bf208af7b2ec2cc78a7cae142`，白名单及指定敏感模式检查通过；备份`/tmp/dsh-rss-rename-before-install.tgz`。`/tmp/dsh-rss-rename-restart.json`确认旧主87342／宿主87406退出，新主95280／宿主95332及127.0.0.1:57949监听，HTTP401。`/tmp/dsh-rss-rename-install-host.log`为0阻断、1待复核、退出2，缺少已接受宿主基线。

**遗留**：本次验证安装文件、启用状态、进程替换及宿主监听，未做真实profile界面、触屏或真实订阅操作验收；下方上一轮待安装状态已解除。

### 2026-11-21 · RSS双击改名改为订阅名称

**背景**：用户要求移除分组双击改名，把双击用于订阅名称，并让分组点击始终按当前状态展开或折叠，同时筛选文章。

**决策**：移除分组dblclick及第二次click过滤，每次名称点击立即筛选并取反collapsed，沿用后台串行保存。自定义分组通过F2／菜单改名。订阅独立原位草稿捕获编辑时revision，保存只写名称，校验1–80字符、保护输入法、去重Enter与失焦，失败保留草稿；复用分组紧凑输入，编辑期间禁止拖拽。原型来源筛选改为保留导航节点，否则第一次单击重绘会吞掉原生dblclick；演示改名仍只保存localStorage。

**证据**：`test/ui-interaction.test.ts`新增三个订阅改名测试并改写分组事件测试，改前4项失败，改后定向49项通过；最终`npm run typecheck`、`npm test`通过，462项中460通过、2项官方模块跳过。连续两次`npm run build`四产物SHA-256一致；客户端1510756字符，比上一轮增加2742，SHA-256 `f435c85dd068992ca72ab519401a7863fddce286611d68ba5026529fe19dab42`，服务端仍为`7ab1993d8e1c1bafabd816c9602faa9fb280a0c61ca15704ea1e8caa3b6bd049`。`node /tmp/dsh-rss-rename-build-check.mjs`核对原型5脚本／7JSON语法、生成CSS括号配平、宽度型媒体查询0、workbase容器查询76及温暖主题保留，并确认订阅编辑位于第2列、40px行与窄面板草稿规则未被后续样式覆盖；数据`/tmp/dsh-rss-rename-final-check.json`，日志`/tmp/dsh-rss-rename-final-{typecheck,tests,build-1,build-2}.log`。静态样式断言不代替实际几何验收。

**遗留**：本轮未安装或重启，桌面仍加载上一轮即时折叠版；按既有原型验收方式只做静态与事件回调验证，未做浏览器、真实profile或触屏界面验收。未改版本，未发布，无新增运行时依赖。

### 2026-11-21 · 安装即时筛选折叠版并重启

**背景**：用户要求安装并重启，桌面尚未加载取消350ms前台等待、本地立即筛选及折叠的最新构建。

**决策**：重新执行类型检查、全量测试与构建，再打包并核对白名单、包与工作区逐文件一致及指定敏感模式；备份当前插件与desktop配置后通过官方CLI remove／offline add重装同版本1.0.4，再重启桌面宿主。不改版本或发布。

**证据**：`/tmp/dsh-rss-immediate-install-checks.log`记录类型检查、459项测试（457通过、2官方模块跳过）及构建通过。`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六项文件一致、bundle启用，客户端SHA-256为`eb18e2d69a6de641d227060d11953f705b36cfc508407c67eec7cf941674be38`。官方CLI日志为`/tmp/dsh-rss-immediate-install-{remove,add,installed}.log`；`/tmp/dsh-rss-immediate-restart.json`确认旧80187／80241退出，新87342／87406运行、127.0.0.1:63178返回401。`npm run host:check`无阻断、1项缺已接受基线待复核，结果见`/tmp/dsh-rss-immediate-install-host.log`及`docs/ui/verification/host/report.md`。旧安装备份为`/tmp/dsh-rss-immediate-before-install.tgz`。

**遗留**：确认安装与进程／HTTP服务就绪，真实profile界面及触屏未验收；即时交互与并发保存依据组件事件回归测试，原型只做静态检查。缺已接受基线的待复核项与此前相同。

### 2026-11-21 · RSS取消前台等待并后台保存折叠

**背景**：用户指出分组单击延迟影响使用体验，确认采用第一次点击立即筛选／折叠、双击第二次点击不重复切换再改名的方案。旧实现先等350ms，折叠还要等待后台保存及快照读取。

**决策**：移除名称单击定时器；正式折叠增加本地覆盖状态，后台按组串行发送最新意图，不使用通用写入锁或重复成功Toast。较旧成功／失败不覆盖新意图，最终失败恢复最后成功值并提示。完成时只补折叠字段、丢弃保存前的迟到读取，再后台补读其他并发字段，避免丢弃读取后漏掉改名。原型立即修改局部DOM与演示状态，下一任务保存localStorage；整份演示数据被其他操作成功保存时同时确认待保存折叠值，失败仅回滚受影响组。保持其他区域不折叠、固定默认组、键盘入口及失焦保存时目标改名请求。

**证据**：`test/ui-interaction.test.ts`验证单击无定时器、双击一次折叠、后台未响应时先更新本地、同组串行最新值、失败恢复最后成功值、旧失败不打断新意图、多组乱序响应、迟到读取及后台补读并发改名。旧实现即时反馈用例失败；补读用例在未补读时再次失败，修后46项定向测试通过。`npm run typecheck`、`npm test`（459项，457通过、2官方模块跳过）及`npm run build`通过，日志为`/tmp/dsh-rss-immediate-{typecheck,target,tests,build}.log`，客户端1508014字符。原型5脚本／7JSON语法可解析，已无名称等待定时器及取消回调残留。连续两次构建四产物哈希一致（`/tmp/dsh-rss-immediate-hashes.json`），客户端SHA-256为`eb18e2d69a6de641d227060d11953f705b36cfc508407c67eec7cf941674be38`；CSS括号2082对、宽度媒体查询0、外层workbase查询56、温暖主题保留。

**遗留**：本轮未安装重启，桌面仍为前一350ms等待版；按用户指定prototype-craft技能只做静态原型检查，未打开浏览器，不引用此前浏览器夹具作为即时版本验收。真实profile、触屏及视觉未验收。后台保存继续至队列最新值，卸载后不更新界面或提示。

### 2026-11-21 · 安装名称单击折叠版并重启

**背景**：用户要求安装并重启，桌面此前仍为默认分组命名版，尚未加载名称单击筛选与折叠、双击只改名的最新交互。

**决策**：重新执行类型检查、全量测试和构建，再`npm pack --pack-destination /tmp --json`；核对白名单、包与工作区逐文件一致及指定敏感模式。使用官方desktop CLI remove／offline add消除同版本安装缓存，备份旧插件与profile配置后重启桌面，不改版本或发布。

**证据**：456项测试（454通过、2官方模块跳过）、类型检查及构建通过。`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六项文件一致、bundle启用，客户端SHA-256为`cb9249a53beea6f14a6be7272b421c6522a53fabd00e5045e4ac6cb25acde38a`。官方CLI日志为`/tmp/dsh-rss-name-install-{remove,add,installed}.log`；`/tmp/dsh-rss-name-restart.json`确认旧70084／70116退出、新80187／80241运行，127.0.0.1:53525返回401。`npm run host:check`无阻断、1项缺已接受基线待复核，完整结果为`/tmp/dsh-rss-name-install-host.log`及`docs/ui/verification/host/report.md`。旧安装备份为`/tmp/dsh-rss-name-before-install.tgz`。

**遗留**：宿主静态检查不替代真实profile界面验收；本轮确认安装与进程／HTTP服务就绪，交互依据安装前正式React浏览器夹具。缺已接受基线的待复核项与此前相同。

### 2026-11-21 · RSS名称单击筛选折叠与双击改名隔离

**背景**：用户确认名称单击筛选并折叠、双击改名，其他区域不触发折叠；原组件名称和数量共用筛选按钮，箭头单独折叠，原生双击前会先执行两次单击。

**决策**：正式及原型拆分名称按钮与数量，保留整行视觉反馈和列对齐，箭头改为不可交互状态指示。鼠标单击等待350ms，双击先取消单击再编辑；键盘Enter／Space立即激活，左右键仅设置折叠且同状态不重复保存。待执行单击使用最新快照，失焦、拖拽、编辑、删除及卸载取消；既有失焦异步保存的目标编辑请求继续保留。默认分组可折叠不可改名，全部订阅与移动Picker保留筛选。

**证据**：新增`test/ui-interaction.test.ts`名称事件回归，旧实现因立即筛选失败，修后定向53项通过；`npm run typecheck`、`npm test`及`npm run build`退出0，全量456项（454通过、2官方模块跳过）。`node /tmp/dsh-rss-name-browser.mjs`真实React夹具验证延后筛选／折叠、再次展开、箭头／数量／空白、双击只改名、改名保存及菜单、左右键与默认分组，通过且页面错误0；日志为`/tmp/dsh-rss-name-{browser,tests,typecheck,build}.log`。最终连续两次构建四产物哈希一致（`/tmp/dsh-rss-name-hashes.json`），客户端1507202字符；原型5脚本与7JSON可解析，CSS括号2082对、宽度媒体查询0、外层workbase查询56、温暖主题保留。

**遗留**：未安装或重启本轮构建，桌面仍为前一默认分组命名版；真实profile与触屏交互未验收。350ms为本地双击判定窗口，窗口内的第二次点击可取消待执行动作。

### 2026-11-21 · 安装默认分组命名版并重启桌面

**背景**：用户明确要求安装并重启，正式客户端新增「默认分组」固定名称，当前桌面仍运行前轮构建。

**决策**：按当前源码重新检查、构建和打包；备份现有插件及profile配置，通过应用自带官方CLI remove／offline add刷新同版本缓存。安装一致后SIGTERM退出旧桌面主进程，再通过`open -a`启动桌面，不通过普通系统dsh修改受管desktop profile。

**证据**：`/tmp/dsh-rss-install-{typecheck,tests,build,package-check,remove,add,installed-check,host-check}.log`记录完整输出；454项测试452通过、2跳过，6项白名单及安装文件核对通过，bundle启用。旧62419／62525已退出，新70084／70116启动；`lsof -nP -a -p 70116 -iTCP -sTCP:LISTEN`显示55295，`curl --max-time 10 http://127.0.0.1:55295/`返回401。host:check报告0阻断及缺少已接受基线1项待复核，退出2。

**遗留**：未验收真实profile界面与浏览器视觉；折叠优化仅在HTML原型，未接入正式客户端。安装前备份为`/tmp/dsh-rss-default-before-install.tgz`，此次没有发布npm或调整版本号。

### 2026-11-21 · 默认分组固定命名与局部折叠原型

**背景**：固定系统分组原称「未分组」，容易被理解为可操作的自定义分组；用户要求改为「默认分组」且不允许改名，并使用rapid-prototype-craft优化展开折叠。

**决策**：保留正式空ID和原型旧分类键，只更新显示与保留名称校验，兼容新旧OPML系统名称。原型沿用现有导航列和主题，折叠保存成功后仅更新目标子列表hidden及箭头aria，不重绘阅读区；左右方向键设置明确状态，同状态不保存，空组保留列占位但不输出箭头。空组原位改名对应箭头更新增加空值保护。

**证据**：`npm run typecheck`、`npm test`及两次`npm run build`通过；454项测试452通过、2跳过。`test/rss.test.ts`核对固定组改名拒绝、保留名称及新旧OPML导入同一空ID，`test/rss-panel.test.ts`核对默认名称与无改名菜单。`/tmp/dsh-rss-default-hash-{1,2}.log`四产物SHA-256相同；`node /tmp/dsh-seven-syntax.mjs`核对5脚本／7JSON、76处容器查询、CSS括号配平、0宽度media及温暖主题保留。

**遗留**：本轮折叠优化仅原型，未接入正式客户端；未打开浏览器、未启动预览服务，未做交互／视觉验收，也未安装或重启宿主。正式改名产物已构建，无新增运行时依赖。

### 2026-11-21 · 保留RSS双击编辑请求并统一导航行背景

**背景**：用户指出双击分组无法改名，箭头及更多按钮与名称区域割裂。正式组件中普通双击可编辑，但旧分组失焦保存时双击另一分组被`editGroup`的旧草稿守卫丢弃；导航选中与悬停背景仅绘制在名称按钮上。

**决策**：在原保存流程记录待编辑分组，成功后进入目标输入；校验或保存失败清除待切换请求并保留原草稿，不重复提交。背景转移到导航整行，名称及独立图标按钮透明，保留36px点击区域、列宽、折叠和菜单功能；同步视觉真源与原型选中状态更新，不手改生成CSS。

**证据**：`node /tmp/dsh-rss-nav-verify.mjs`修前在600ms模拟RPC期间切换编辑超时，修后通过；四组紫色／温暖明暗主题整行背景非透明，名称、箭头、更多背景及更多边框为透明，箭头颜色等于行选中色，菜单重命名与折叠通过。`test/ui-interaction.test.ts`覆盖异步保存成功／失败及单次提交，`test/rss-panel.test.ts`覆盖行选中状态。`npm run typecheck`、`npm test`453项（451通过、2跳过）及两次构建通过，四产物哈希对比相同。日志`/tmp/dsh-rss-nav-{red,focused,browser,typecheck,tests,build,build-repeat}.log`。

**遗留**：浏览器使用正式React组件和模拟API；未直接验证真实profile窗口。本轮未执行安装或重启，工作区同时有其他任务操作桌面安装，避免重复替换其安装流程。最终只读核对桌面已安装`lib/client.js`与工作区SHA-256均为`56b4e2d7073cd231364f26fe6cdc758787c52bd75906c81ce3fa0d4a29d4645a`，安装文件已包含本轮修复；不能据此确认当前窗口已重载。未提交、发布或改版本号。

### 2026-11-21 · 修复MCP凭据重载并统一操作失败Toast

**背景**：用户截图同时显示「MCP配置读取失败，原文件未改写」、加载占位及市场读取错误；要求近期功能继续使用Toast。只读检查真实JSON、配置和来源均有效，元数据credentialRefs唯一失败，已保存HEADER后缀含H／R而读取正则只接受A–F；OAuth提取存在同一错误。

**决策**：沿用生成器原格式，统一引用校验而不迁移记录或凭据，保留WB_MCP前缀和归属检查。操作失败Toast保留草稿和原值，成功后刷新失败明确完成范围，不自动重试写入。读取失败作为持久状态单独保存，同一轮询错误仅首次Toast，停止加载占位及市场请求，恢复读取后清除异常；字段和条目异常仍保留。

**证据**：`node --import tsx --test --test-name-pattern='保存请求头' test/mcp.test.ts`修前复现同一读取失败；修后`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`451项全部通过。`npm run typecheck`、两次`npm run build`及四产物SHA-256对比通过，`node /tmp/dsh-seven-syntax.mjs`5脚本／7JSON／76容器查询、宽度media为0、括号配平、温暖主题保留。真实配置仅复制到隔离目录读取，1连接／1来源，原文件与副本字节均不变。`node docs/ui/verification/mcp-toast/verify.mjs`1100／443px覆盖重复轮询不重复Toast、读取恢复及市场加载、来源与技能保存失败Toast和草稿保留，0页面错误。

**遗留**：本条浏览器使用正式React组件和模拟API，未验证真实profile窗口、外部服务连通与完整OAuth授权。首次官方add复用旧缓存，经remove／add后安装初版修复；期间检测工作区并行RSS变更，保留并重新执行453项全量测试、类型检查、两次一致构建、浏览器回归及打包安装，最终六项文件一致且重启成功，安装结果见当前状态。核对失败时避免断言展开整份大Buffer，包与安装改用逐文件SHA-256比较；回滚包`/tmp/dsh-mcp-toast-before-install.tgz`仅保存原插件六项文件。

### 2026-11-21 · MCP来源提交固定底部并分区市场表单

**背景**：用户截图指出来源表单下小字与顶部说明重复，提交按钮混在正文中；市场完整介绍采用居中阅读宽度且紧贴主页链接及表单，配置字段层次不清晰。

**决策**：保留来源顶部摘要，移除重复说明，通过原生form关联将提交放到弹窗footer；来源列表与表单间隔24px。市场介绍复用现有左对齐样式与身份区，主页同排；基本设置、连接配置分别使用现有两列表单，高级设置复用details／summary默认折叠，JSON错误展开，不改变字段数据与提交契约。手动创建／编辑保留原表单顺序，真源、词典、UI规范及PRD同步。

**证据**：调整既有来源提交与说明断言，`/tmp/dsh-mcp-layout-red.log`确认原实现失败；修改后`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`448通过、0跳过，类型检查通过。两次构建客户端SHA-256均为`e7d31cb7bf7a1f07b21990c728e708b08ee1fe02ea64fe812099d7df1f7b6238`。`node /tmp/dsh-mcp-layout-verify.mjs`在正式暗色主题1100×950／443×774／1100×500验证固定footer、正文同左缘、24px间距、窄屏单列、无横向溢出、Enter提交与成功清空、折叠请求头保存及JSON错误展开；双请求头凭据映射通过且0页面错误，结果在`docs/ui/verification/mcp-layout/results.json`。包六文件与工作区一致，指定敏感模式零命中。

**遗留**：本轮授权允许安装重启，但沙箱拦截官方CLI写入desktop profile的package.json.lock；只读核对依赖、bundle及旧客户端均保留，停止受限安装并恢复桌面运行，主48603／宿主48634、127.0.0.1:57079。需要开放该profile写权限后完成更新。本次视觉验收使用真实组件与隔离响应，不代表真实用户profile和外部服务已验收；未操作用户连接或凭据。

### 2026-11-21 · 中文技能名称与扩展详情统一

**背景**：用户要求内置社区连接器、技能说明及市场正文布局、首次红字、中文名称、来源辅助文字与MCP详情一致；旧创建规则只接收小写调用名，市场详情又把文档显示名替换成ASCII调用名。

**决策**：名称只保留安全目录及资源约束，显示／文件原名和宿主调用名分开；ASCII调用保持历史规则，Unicode生成稳定短哈希标识，经官方注册表接入。社区同地址来源复用ID与开关，固定内置名称与地址，仅允许启停。说明使用独立左对齐样式，避免改变RSS文章阅读；来源小字与MCP状态复用待办／技能摘要，市场正文填满弹窗剩余高度、矮屏滚动。

**证据**：`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`448通过、0跳过；`npm run typecheck`通过，连续`npm run build`四产物哈希一致。`node /tmp/dsh-seven-verify.mjs`输出`docs/ui/verification/seven/results.json`：1100×950正文468px，443×774单列160px，1100×500可滚动；两个来源均12px／20px、摘要16px／24px，列表上边框0px，技能／MCP说明与标题同左缘，0页面错误。`node /tmp/dsh-seven-syntax.mjs`5段脚本、7份JSON及CSS不变量通过；`node /tmp/dsh-workbase-install-verify.mjs`当次六文件白名单及敏感模式0命中。`npm run host:check`2项阻断仅为安装与工作区两份产物不同，另1项缺基线；只读PID核对旧24044／24086仍在。

**遗留**：自动审批拒绝SIGTERM终止桌面主24044，理由为本轮未明确授权中断当前会话重启；未执行移除／安装／重启，没有绕过。待用户明确允许更新插件并重启后走应用自带官方CLI。本次浏览器使用真实React组件和响应替身；中文官方调用与启停由独立SkillRegistry验证，未操作用户技能或连接。外部MCP服务握手、真实账号授权及用户profile视觉未验收。

### 2026-11-21 · 市场连接器添加页对齐目录字段

**背景**：用户提供社区目录并要求添加UI对齐其字段，同时市场卡片添加只显示内容区域。现有解析仅保留摘要和通用认证，丢失credentialFields／credentialBindings，stdio密钥及HTTP双凭据无法从添加页填写。

**决策**：增加候选可选metadata，不改变持久配置schema；按目录显示完整介绍及具名凭据，显式env／header绑定在提交前映射，复用官方凭据保存合同。市场添加单栏，手动添加／导入保留导航；绑定字段不重复显示在JSON，双请求头不额外显示通用密钥。目录介绍原文保留，不用历史probe声明证明当前建连；模板、OAuth共享流程及URL限制不扩展。

**证据**：新增test/market两项先因metadata缺失失败，test/ui-interaction单栏项先因侧栏存在失败，记录在`/tmp/dsh-mcp-metadata-red.log`与`/tmp/dsh-mcp-add-red.log`；完成后`npm run typecheck`、`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`443项通过、0跳过，日志`/tmp/dsh-mcp-align-{typecheck,tests}.log`。连续两次`npm run build`四项哈希一致，`/tmp/dsh-mcp-align-hashes-{1,2}.txt`。浏览器夹具`/tmp/dsh-mcp-toolbar-browser.tsx`使用真实目录解析结果`/tmp/dsh-mcp-connector-candidates.json`；443px面板正文441／441无横向溢出，1100px面板两列各465px，高德空Key聚焦integration-mcp-credential-apiKey且0提交，填写后映射AMAP_MAPS_API_KEY；亿欧两个输入分别映射X-Client-Id／X-Client-Secret，未提交credentialValues。包审计和安装六文件相符见`/tmp/dsh-mcp-align-installed.log`；宿主检查`/tmp/dsh-mcp-align-host-check.log`为0阻断、1缺基线。

**遗留**：真实MCP账号、外部握手及OAuth未验收，stdio参数模板仍需手工补充。桌面安装使用应用自带官方CLI；普通系统dsh报受管profile限制后，读取实际官方desktop-host/lib/cli.js确认正式入口再安装，没有改写宿主限制或自行替换安装文件。

### 2026-11-21 · MCP来源添加字段留在当前弹窗

**背景**：用户反馈添加MCP数据来源应直接在市场来源弹窗显示字段，不再跳转独立添加页。

**决策**：来源详情顶部常显名称／目录地址及提交按钮，下方保留来源列表；复用FormField、integration-form-grid和表单内dialog-footer动作样式，不增加尺寸或运行依赖。删除source详情分支，sourceSave成功只清空字段，不切换详情；失败保留输入。移除确认改用独立sourceId查找条目，避免原sourceDraft复用把添加表单变成已有来源编辑。原型共用表单提交路径，成功原位重绘，开关及移除返回保留来源表单草稿。

**证据**：修改交互用例后首次因来源详情没有表单失败，`/tmp/dsh-mcp-inline-red.log`；完成后`npm run typecheck`、`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`439项全过、0跳过，`/tmp/dsh-mcp-inline-tests.log`。两次`npm run build`四产物SHA相同，`/tmp/dsh-mcp-inline-hashes-{1,2}.txt`；5段直接脚本和7份JSON语法通过，`/tmp/dsh-mcp-inline-syntax.log`。443px浏览器真实组件夹具确认弹窗标题始终为市场来源，失败保留内联新增输入及2项来源，成功清空两字段且新增为3项，空表单按钮禁用、无横向溢出；原型同页添加成功并清空。当次安装包和六项安装一致核验见`/tmp/dsh-mcp-inline-{package-check,installed-final}.log`；官方CLI重装并启动14121／14199，55370端口监听。

**遗留**：真实组件使用网络替身，未直接验收真实宿主视觉或远端可用性；host:check为0阻断、1缺已接受基线待复核、退出2。未修改用户实际来源、提交或发布。

### 2026-11-21 · MCP市场集中来源详情并补齐刷新

**背景**：用户要求移除MCP市场来源菜单，在市场增加与技能市场一致的数据源与刷新按钮，并明确数据源详情保留添加能力。

**决策**：市场工具栏共用outlined settings／refresh图标及紧凑搜索；来源管理迁入单栏详情且展示全部配置，保留原sourceSave／sourceToggle／sourceRemove与原位改名，不改变服务端来源契约。添加及移除返回来源详情，再返回保留市场列表；失败保留输入和原启停值。旧marketSources记忆映射catalog，方向键改为两项导航；刷新通过请求版本触发并在effect清理中取消旧请求。原型按钮实测43px宽，补齐共用icon-btn规则，使技能和MCP均36px。

**证据**：新增交互用例实现前因第三个市场来源页签失败，`/tmp/dsh-mcp-toolbar-red.log`；完成后`npm run typecheck`及`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`439项全过、0跳过，`/tmp/dsh-mcp-toolbar-tests-final.log`。连续两次`npm run build`四产物SHA相同，`/tmp/dsh-mcp-toolbar-hashes-{3,4}.txt`；5段直接脚本及7份JSON语法通过，`/tmp/dsh-mcp-toolbar-syntax.log`。443px真实组件夹具`/tmp/dsh-mcp-toolbar-browser.tsx`验证按钮36×36、详情无footer、保存失败保留新目录输入、重试后来源列表3项、即时开关持久化与一次刷新请求；正式原型新增来源可返回详情再返回市场。官方CLI移除／离线添加、当次六项包与安装一致性及指定敏感模式通过，`/tmp/dsh-mcp-toolbar-{package-check,installed-final}.log`；重启5376／5440、61557端口GET401。

**遗留**：浏览器使用真实组件与网络替身，原型仅保存浏览器示例；不代表真实宿主视觉或第三方目录可用性验收。host:check为0阻断、1缺已接受基线待复核；未新增依赖，未改变用户实际来源开关、添加真实数据源、提交或发布。

### 2026-11-21 · 技能市场固定两家来源并精简入口

**背景**：用户要求移除自定义数据源功能，默认配置SkillHub和ClawHub、默认开启SkillHub，并优化工具栏入口。

**决策**：入口使用共用36px outlined settings图标，单栏详情只提供两家开关，取消名称／URL字段、删除和footer。首次前者开／后者关，已有官方来源保留id及enabled；初始化仅在内存补齐，不自动写盘。历史自定义配置保持原存储数据，通过统一白名单退出市场显示、请求与安装，旧save／remove明确拒绝；不清理已安装技能，开关继续经过既有授权与官方配置写入。

**证据**：`npx tsx --test test/market-defaults.test.ts`在实现前因缺省列表及旧来源展示失败；完成后`npm run typecheck`、`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`437项全过、0跳过，`/tmp/dsh-fixed-market-all-tests.log`；两次`npm run build`四产物哈希相同，`/tmp/dsh-fixed-market-hash{1,2}.txt`，生成CSS／图标不变。5段直接原型脚本和7份JSON语法通过。443px浏览器真实组件夹具测得两按钮36×36、无横向溢出；详情两个switch、0文本输入、0footer，开关保存后返回列表保留24张卡片。`npm pack --json --pack-destination /tmp`与`node /tmp/dsh-workbase-install-verify.mjs --installed`核对当次六项白名单、逐文件一致及指定敏感模式通过；官方CLI重装，98515／98557启动，56173端口GET401；真实state.json重启前后哈希相同、revision22及两家开关保留。

**遗留**：浏览器使用真实组件与网络替身，不代表真实宿主页面或远端接口可用性已验收；host:check仍为0阻断、1缺已接受基线、退出2。复核时既有目录缓存用例一次出现26次指令读取，失败全量日志保存在`/tmp/dsh-fixed-market-scan-flake.log`；隔离运行及全量重跑均通过，根因未定位，本次不修改目录缓存。额外词典整理的重装被沙箱EACCES拒绝创建package.json.lock，已收回该无关整理；最终构建及包的六项文件重新核对与运行中功能版完全一致，证据`/tmp/dsh-fixed-market-installed-final.log`，无需再安装或重启。未提交或发布。

### 2026-11-21 · 技能市场按滚动续页

**背景**：用户询问是否能滚动加载及默认页数。此前ClawHub榜单一次最多预读5页10项，SkillHub只读首页24项，前端没有续页入口。

**决策**：改为每源首批一页，ClawHub游标与SkillHub页码分别保留内存进度，以查询和来源签名绑定页令牌；每批读完且未取消才发布，失败不丢旧条目或进度。前端距底部240px续页、同步锁防重复、首屏不足一屏补齐；失败复用原按钮样式提供重试，无额外常驻说明。不假定skills.sh或ClawHub关键词接口有分页，不执行市场技能、不扩大安装权限。

**证据**：`npx tsx --test test/market.test.ts`首次新分页测试缺marketPage，ClawHub首批请求数为2而非1；修改后`npm run typecheck`及`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`435通过。`npx tsx /tmp/dsh-scroll-live.mts`验证SkillHub榜单及react两页各24／48唯一项，ClawHub两页各10／20唯一项。浏览器`/tmp/dsh-scroll-browser-server.mjs`渲染真实SkillsPanel，观察初始24、失败仍24且出现重试；真实点击重试后48、scrollTop1780保留，再滚动72项且72唯一，搜索react回到24项。首次全量回归指出btn不存在于原型，改用已有integration-record-actions按钮后全绿。最终构建哈希、大小、安装六文件及运行端口见当前状态。

**遗留**：浏览器验证使用隔离接口替身，真实市场另做独立接口验证，未将两者表述为真实宿主滚动验收。host:check仍缺已接受基线，0阻断／1待复核；未做像素回归或真实技能安装／Agent调用。没有提交、发布或改版本。

### 2026-11-21 · 接入SkillHub并恢复市场即时搜索

**背景**：用户要求添加SkillHub评分页面，并反馈技能市场搜索不能用。实际SkillHub前端调用api.skillhub.cn/api/skills，使用keyword、sortBy、order及namespace／version文件下载。SkillsPanel以row.catalog || matches(row)跳过全部远端目录筛选，输入时旧列表不变化；实际ClawHub react返回100项，其中18项来自skills.sh，原解析把它们误当ClawHub下载。

**决策**：接入固定官方SkillHub目录和下载服务，保留评分排序、中文说明及命名空间身份；正文预览固定版本，缺版本时先查真实详情，安装完整ZIP并复核原正文。市场所有卡片共用名称／说明即时筛选，同时保留远端搜索，空列表等待复用已有空状态，不新增密度或常驻说明。ClawHub混合结果只接入已确认的clawhub与skills-sh格式，未知来源不伪装可安装。通过真实桌面表单添加用户指定源，不离线改写真实state.json或绕过官方fs。

**证据**：test/market的评分页面回归先未规范化URL，业务错误先被误当上传JSON，混合目录先得到clawhub而非skillsh；test/ui-interaction即时搜索先留下两项而非React单项。修复后npm run typecheck及DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test全部432通过。npx tsx /tmp/dsh-skillhub-live.mts复核真实目录、搜索和完整73文件ZIP／正文一致；浏览器加载/tmp/dsh-skillhub-browser-server.mjs的真实组件，验证全角React及切换Python立即筛选、等待文案、清空恢复与取消旧请求。官方重装六文件一致，桌面保存Toast及revision21配置复核通过；真实市场搜索react出现匹配技能。桌面type_text首次URL值异常且重输无变化，按实际AX观察改用set_value后确认完整URL与保存成功，不依据动作返回值认定输入完成。两次build哈希一致，确切大小、哈希与日志见当前状态。

**遗留**：正文及ZIP只下载验证，未安装或执行第三方技能。现有宿主技能安装目录事务限制保留，市场接入不放宽授权。桌面语义交互已验证，未做截图像素回归或Agent端到端调用；暂无远端市场分页／加载更多入口，SkillHub目录首24项，关键词请求全目录搜索。没有提交、发布或修改版本。

### 2026-11-21 · 常显市场数据源并精简提示

**背景**：用户截图中的添加弹窗只显示已配置标题而无条目，市场主页叠加启停策略、搜索说明和红色榜单截断提示。源码列表使用默认关闭且没有展开图标的details，正常读取上限写入source.issue。

**决策**：已配源复用来源卡片常显名称、地址、开关和36px删除图标，直接删除；删除先store持久化，成功后清理对应目录和详情缓存，保留安装文件，授权及官方fs拒绝原样传播。市场主页只显示来源失败摘要，逐项原因在添加弹窗及摘要title；搜索说明移入弹窗，普通加载留在刷新按钮，榜单上限不再当作错误。原型沿用独立演示配置，不修改用户现有市场源。

**证据**：新增test/market删除回归先出现未知market.source.remove，榜单回归先收到错误issue；UI回归先发现常驻策略行，修复后428项全量官方模块测试通过。拒绝写入仍可读取原预览；成功删除后state.json无源、市场列表为空、旧预览不能安装，原SKILL.md仍在。两次build哈希一致、原型5段直接脚本语法及安装包六项白名单核查通过；官方remove／offline add后六文件与工作区一致。首次open与旧进程退出重叠，确认退出后再次启动，最终79905／79942和55260端口就绪，GET401；host:check无阻断、仅缺基线待复核。复现命令为npm run typecheck、DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test及连续两次npm run build；确切哈希和日志路径见当前状态。

**遗留**：未直接操作真实用户来源删除，未验收真实浏览器视觉、焦点及触屏布局；隔离真实组件回调测试不能替代浏览器验收。技能安装目录事务限制未变。没有提交、发布或修改版本号。

### 2026-11-21 · 接入技能及MCP市场格式适配

**背景**：用户要求修复工作台市场格式不兼容。原技能加载将搜索响应当正文上传格式解析，原MCP市场仅支持servers每项直接携带name／config，不能接入参考插件的目录API与社区ConnectorDescriptor或官方Registry。

**决策**：在独立市场适配模块识别固定服务与描述结构，保留旧数据源格式和来源存储；技能先读目录再按需下载，市场安装经有效预览缓存保存完整资源，ClawHub ZIP保存前与预览核对。编辑保留调用限制和其他元数据，安全ASCII名称仅在用户待确认草稿映射。MCP多个服务分别成为候选，支持官方npm／PyPI stdio包及HTTP地址，未知协议／包保留说明，不伪装可连接；敏感或未知请求头、环境变量及凭据模板为空，工作目录不从市场导入。不自动连接、执行命令或放宽技能目录事务权限。列表沿用警告图标及共享表单，不新增样式密度。

**证据**：test/market的MCP回归先出现目录错误与0候选，技能回归先返回0候选；前端先缺market.detail请求并发生原草稿覆盖新候选。修复后类型检查与`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`425通过、0失败、0跳过；新增大写市场名及离开搜索页刷新回归也先失败再通过。真实传输复核skills.sh 98候选／选中包76文件、ClawHub 99候选／选中ZIP5文件；官方Registry 13候选和社区141候选，未建立服务连接。两次build四产物哈希一致；12段原型脚本语法通过，包六项白名单及指定敏感模式通过。官方同版本add返回Already up to date但两端安装哈希仍旧，因此备份后remove／offline add，最终六文件与bundle一致；安装核验改用哈希比较，避免大Buffer不等时生成巨量断言输出（首次核验退出137、日志空）。最终主75220／宿主75255重启，host:check 0阻断、1缺基线待复核。确切哈希、体积及日志路径在当前状态。

**遗留**：未修改真实用户技能、市场配置或凭据，未执行第三方MCP连接。真实页面视觉和真实Agent端到端行为尚未验收。受限宿主的技能创建／编辑／市场安装仍保留目录事务拒绝；市场格式修复不解决该独立权限问题。未提交、发布或改版本号。

### 2026-11-21 · 核实技能创建拦截及参考插件市场源

**背景**：用户使用合法技能名cece创建仍收到目录事务错误，并指定本机dsh-skills-manager-master及dsh-mcp-connector-main作为数据源配置参考。此错误与前一轮名称校验无关。

**决策**：保留现有目录事务拒绝，不凭sandboxMode默认值推断本次写入授权。官方FileSystem只公开单文件原子写入／删除／移动，未提供多目录提交回滚；参考技能插件创建直接使用node fs的暂存目录与rename，其Agent路径的权限探测不等于工作台RPC已获授权，不直接照抄。市场调查补充实际API与描述结构，不配置用户来源或安装第三方。

**证据**：src/server/skills.ts:155–160在写入且fs.sandboxMode存在时主动抛错，save:294–333为安装目录及私有bundle生成计划后进入此检查。node_modules/@deepseek-ai/dsh-fs/lib/types/index.d.ts:89–100明确sandboxMode只表示部署默认模式，会话或每次调用可更窄或更宽；实际app.asar中dsh-fs-sandbox/lib/index.js:104–112返回sandboxPolicy.defaultMode。`DSH_SKILLS_HOST_TEST=1 node --import tsx --test test/skills-host.test.ts`本轮1通过、0失败、0跳过，覆盖创建拒绝且原文件／状态不变，日志`/tmp/dsh-skill-create-host-check.log`。参考skills-sh-catalog.ts:1为skills.sh/api/search，catalog-skill.ts:35–55按标识下载；clawhub-catalog.ts:46／126为ClawHub搜索／榜单。参考MCP lib/constants.js:20–26默认jsDelivr上的duhu2000/dsh-mcp-connector-registry/main/catalog.json及raw GitHub备用，lib/index.js:124–129可配catalogUrl、catalogTtlMs（默认一小时）、connectors；:347–352按内置／远程／配置／动态合并，overrides最终优先。

**遗留**：本轮完成根因与数据源源码核对，未修改创建实现；当前沙箱宿主下创建／编辑仍不可用。隔离回归验证的是拒绝保护，不是创建成功。skills.sh／ClawHub专用目录适配及社区MCP连接器描述转换尚未实现；API运行时可用性本轮未联网重测。未安装、重启、提交或发布。

### 2026-11-21 · 修正技能名称校验并核实公开市场来源

**背景**：用户截图显示创建技能名为“测测”，提交提示“参数不合法”，并询问可用技能与MCP市场源。skillContentSchema要求小写英文／数字段及单个连字符，前端原本只检查非空，服务端Zod错误经RPC变为笼统提示。

**决策**：保留技能名协议，在创建、编辑及市场添加共用字段处提前展示明确错误，使用同一schema校验，禁用非法保存且save入口防止Enter绕过。复用既有字段错误样式和焦点，不自动改名、不清除正文与项目范围。市场调查区分网站、原始目录和服务地址：推荐skills.sh及Anthropic仓库用于发现；官方MCP Registry可访问但当前parser不兼容，需适配后才可作批量目录源。

**证据**：test/ui-interaction新增真实SkillsPanel回调回归，修复前按钮disabled断言false!==true，修复后七类非法名称不发送RPC，合法test-skill按原项目范围及project来源提交。类型检查通过，411项全量测试409通过、2跳过、0失败。真实fetchSkillCatalog读取`https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md`得到9390字节，parseSkillUpload成功解析frontend-design（正文9074字符），结果在`/tmp/dsh-skill-market-probe.log`。`https://registry.modelcontextprotocol.io/v0.1/servers?limit=2`实测返回servers[].server及remotes，src/server/mcp.ts的market要求顶层条目name／config。构建和安装结果见上方当前状态。

**遗留**：官方CLI remove被profile锁文件写权限拦截，add及重启未执行；未执行真实用户技能创建、第三方技能安装或MCP连接，未配置用户市场源。真实页面视觉未直接验收。单个原始SKILL.md可作为技能源不代表整个仓库均兼容上传的简化frontmatter及容量限制；官方Registry适配不包含在本次名称修复中。

### 2026-11-21 · 安装项目规则共享外层并重启宿主

**背景**：前轮安装被desktop profile锁文件写入权限拦截，用户再次明确要求“安装重启”。

**决策**：重新核对现有本地包，沿用官方desktop CLI remove与离线add；确认安装六项文件与工作区一致、bundle启用后，TERM退出旧桌面并确认旧宿主退出，再open启动应用。

**证据**：`node /tmp/dsh-workbase-install-verify.mjs`与`--installed`通过；`/tmp/dsh-rules-install-remove.log`及`install-add.log`均成功，包与客户端哈希见上方当前状态。旧56782／56818退出，新60884／60931启动，`lsof -nP -iTCP -sTCP:LISTEN`确认127.0.0.1:51362，未认证curl返回401。`npm run host:check`退出2，报告0阻断、1待复核。

**遗留**：本轮确认安装一致性与进程／服务启动，未直接验收真实页面动画与焦点；兼容检查待复核项仍保留。

### 2026-11-21 · 项目规则添加和详情接入设置共享外层

**背景**：复查遗漏后用户要求项目规则添加及详情也接入共享外层。原ProjectRulesSettings自己持有选择状态并挂载独立Modal，进入详情仍会重新播放抽屉入场动画；上一轮只确认详情内部编辑不重建，未覆盖列表到详情的生命周期。

**决策**：选择状态提升至Settings，列表请求选择，详情组件仅提供内容；通过ModalFlow回传标题、className、返回与关闭到Workbase已有设置Modal。设置表单隐藏保留，详情仍使用同一RulesSave及组合输入保护，返回不提交其他设置草稿。返回恢复列表滚动与入口，改名导致原记录被筛掉时回到规则搜索。主原型复用设置shell，UI规范与PRD同步。

**证据**：`test/ui-interaction.test.ts`新增列表选择、添加、详情草稿返回、原入口脱离DOM时的焦点回退及Workbase外层身份／标题／样式／关闭回传断言，规则共享用例先失败后通过。`npm run typecheck`、`npm test`通过，410项中408通过、2跳过、0失败；原型12段script经node:vm.Script语法检查通过。构建与安装实测结果见上方当前状态。

**遗留**：安装在官方CLI remove取得profile锁之前被沙箱拦截（`/tmp/dsh-rules-install-remove.log`中的package.json.lock EACCES），原安装客户端哈希与bundle启用状态只读复核未变；add及重启未执行，需desktop profile写权限。真实宿主动画与焦点未直接视觉验收；旧`docs/ui/verification/rules-check.mjs`的嵌套独立Modal和父overlay inert断言不适用于本轮，不沿用旧八组截图结论。未修改用户真实规则或执行发布。

### 2026-11-21 · 扩展二级页面保留同一抽屉

**背景**：用户继续反馈添加技能和技能详情跳动，并要求检查其他二级弹窗。源码扫描确认技能／MCP／RSS进入二级页时都挂起概览并另建Modal，触发新的抽屉动画；同一详情内部切换编辑原本没有重建。

**决策**：新增共用ModalFlow，将管理列表和二级页作为内容描述，在独立打开或嵌入概览时都只保留一个实际Modal。隐藏列表DOM而非卸载，回传当前标题、返回／关闭及保存状态；返回恢复原入口和列表滚动。原型integrationMountDetail已保留stats-drawer，正式实现向该生命周期对齐。诊断确认、待办及会话预览保留既有独立弹窗；规则详情无阶段性重建，编辑预览复用原Modal；官方插件更新各阶段也保持同一个官方Modal。

**证据**：`rg -n '<Modal|<dialog|createPortal\\(' src/client --glob '*.tsx'`枚举所有入口；`test/ui-interaction.test.ts`新增真实添加／详情／编辑／授权／阅读回调，以及标题同步、同标题最新关闭／返回、无回传循环和滚动／焦点恢复。两项共享外层用例先失败后通过；全量测试首次仅旧技能源码断言要求suspended失败，已移除过时断言，行为回归验证由交互用例承担。最终验证及安装结果见上方当前状态。

**遗留**：回调与DOM夹具不等同真实浏览器动画验收；未改变官方组件，也没有执行真实技能写入、MCP连接或RSS订阅变更。

### 2026-11-21 · 诊断跨菜单切换保留外层弹窗

**背景**：用户反馈统计概览点击诊断仍刷新跳动；原共享外层只覆盖技能／MCP／RSS，返回诊断时先关闭扩展，再通过Home effect新建核心弹窗。

**决策**：七类菜单统一由Workbase持有overview状态和一个Modal；将核心统计内容及待办详情恢复逻辑拆为StatsOverview并嵌入。保留诊断自动检查和快照身份绑定，避免用禁用动画掩盖弹窗生命周期问题。

**证据**：`test/ui-interaction.test.ts`覆盖七类菜单、真实Workbase导航入口和待办详情挂起／返回、诊断项目跳转；共享弹窗回归先失败后通过。类型、全量测试及构建结果见上方当前状态。

**遗留**：交互夹具执行真实组件回调，不等同真实浏览器动画或焦点验收；真实宿主视觉仍需直接验收。

### 2026-11-21 · 安装诊断自动刷新并重启桌面宿主

**背景**：用户明确要求安装重启，使上一轮诊断进入时自动检查的修改应用到desktop。

**决策**：重新构建并检查当前本地包，仅通过应用自带官方CLI移除旧包、离线添加新包，版本保持1.0.4；核对六项安装文件及bundle后退出旧桌面并重新启动。卸载命令不支持offline参数，改为普通remove，add仍使用offline。未修改宿主权限或用户会话数据。

**证据**：`npm run build`、`npm pack --ignore-scripts --pack-destination /tmp --json`及`node /tmp/dsh-workbase-install-verify.mjs --installed`成功，六项文件一致、敏感模式命中0项；CLI日志为`/tmp/dsh-diagnostic-install-remove.log`与`/tmp/dsh-diagnostic-install-add.log`。旧47917／47948已退出，新50044／50077启动；`lsof -nP -iTCP -sTCP:LISTEN`显示127.0.0.1:53660，未认证curl返回401。`npm run host:check`报告0阻断、1缺基线待复核、退出2。

**遗留**：本次只确认安装、启用及启动状态；真实诊断点击、检查结果与页面视觉仍未直接验收。未提交或发布。

### 2026-11-21 · 进入诊断时自动重新检查

**背景**：用户要求诊断与管理面板一样，点击进入时刷新；当前诊断只显示普通快照及手动重新检查的结果。

**决策**：在DiagnosticsPanel每次挂载时复用现有reload，繁忙时等待空闲，保留已有报告；微任务延后发起请求，避免严格模式试挂载多发请求。沿用原请求取消、并发锁、错误展示和首页结果回传，不改变诊断候选或修复流程。

**证据**：新增真实组件回调夹具在修复前以“0 !== 1”失败，修复后通过；覆盖自动检查、严格模式、忙闲恢复、关闭取消及重复渲染。验证命令为`npm run typecheck`、`npm test`和`npm run build`，本轮最终结果见当前状态。

**遗留**：尚未安装到desktop或重启宿主，真实页面点击及视觉未直接验收；旧安装记录不代表本轮改动已应用。

### 2026-11-21 · 保留管理菜单的共享弹窗并安装Toast修正版

**背景**：用户截图仍显示RSS刷新结果行，并反馈点击技能、MCP、RSS菜单时弹窗刷新跳动。实际安装客户端哈希为旧版`d9c0ee...`，而工作区已是Toast版`8f6826...`；Workbase原来三个条件分支分别挂载独立Panel，切换会连同Modal卸载重建，复播入场动画并重新进入无快照加载态。

**决策**：外层改为单一ExtensionOverview，菜单只替换管理内容；Modal嵌入模式不创建第二个遮罩，busy及详情suspended同步给外层，二级详情仍走原Modal。快照使用WeakMap按ClientPort及模块缓存，重新进入先展示上次读取内容再后台刷新，连接更换及不同模块不共享，不写入偏好、不保持隐藏面板轮询。旧导航卸载导致焦点落到body时恢复当前菜单。保留Toast及原型已稳定的dialog语义；只用官方CLI安装。

**证据**：新增共享弹窗回归在实现前因缺少统一入口失败，实现后与缓存隔离回归通过；`npm run typecheck`及`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`398项全通过。`node /tmp/dsh-toast-check.mjs`验证Toast成功／失败、MCP已提交后刷新失败、RSS重复与部分刷新、失败条目和30秒撤销，结果在`docs/ui/verification/toast-check.json`，该临时夹具已移出仓库。两次`npm run build`四产物哈希一致，客户端1479373字节，SHA-256 `c465f53c1c288423b72d17efa903af48ead89029af0ecf3e20ce8261ac8c2fe5`。官方desktop CLI remove/add离线重装1.0.4后，六文件逐字节一致、bundle启用。旧46374／46407退出，新47917／47948监听51126，未认证GET401；`npm run host:check`确认0阻断、1缺基线待复核、退出2。

**遗留**：组件回调及缓存回归不等于实际浏览器动画、焦点及Toast计时验收；本轮未直接操作真实用户页面验证视觉。此前锁文件EACCES未在本次安装重复，未修改沙箱或权限配置。未提交或发布。

### 2026-11-21 · 三类管理面板操作结果共用顶部Toast

**背景**：用户确认技能、MCP与RSS面板的临时操作回执改为Toast；原列表状态行会占空间，技能回执还会覆盖持续说明。

**决策**：复用Workbase既有notify、主题、层级及计时，不另建通知容器。保存、生效及授权确认分别表达；批量结果汇总数量，部分失败留详情。MCP先反馈已提交结果再刷新快照，避免刷新失败误报未保存。RSS加载继续在刷新按钮，取消订阅仍有30秒撤销。同步UI第0节、PRD、英文词典与原型Toast。安装只走官方desktop CLI，不绕过沙箱写入限制。

**证据**：`npm run typecheck`退出0；`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`396项全通过；`node docs/ui/verification/toast-check.mjs`验证技能扫描成功／失败、持续来源异常、MCP已提交后刷新失败及能力说明、RSS部分刷新与重复通知／失败条目／撤销，并核对全部原型脚本语法，结果在`docs/ui/verification/toast-check.json`。两次`npm run build`及四产物SHA-256对照一致，客户端1478304字节，哈希`8f682662871c889c5fa8821bbd96f881e019fb2dc4e797cc92d72fe4a2d9c751`。官方remove因`<home>/.dsh/profiles/desktop/package.json.lock`写入EACCES失败；恢复启动后安装哈希仍为`d9c0ee7667d5a960aab1f16a268b0e502939400f039a130559fd54b45b4a8187`，`curl --silent --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:64759/`返回401。`npm run host:check`退出1，报告只列客户端安装差异阻断及缺基线待复核。

**遗留**：待沙箱放行desktop目录写入后安装当前包并重启。回调夹具不等于真实浏览器的视觉、键盘焦点或Toast计时验收；未宣称新页面已在宿主生效。未提交或发布。

### 2026-11-21 · 安装技能视觉修正版并重启

**背景**：前轮安装因desktop profile锁文件写入权限受阻，用户要求继续安装并重启。

**决策**：复核既有包，不重新修改源码或版本；正常退出旧宿主后沿用官方CLI离线remove/add，核对安装后再启动。

**证据**：`node /tmp/dsh-workbase-install-verify.mjs`当次六文件白名单及敏感模式核验通过；官方CLI remove/add成功，`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六文件一致及bundle启用，客户端SHA-256 `d9c0ee7667d5a960aab1f16a268b0e502939400f039a130559fd54b45b4a8187`。旧41904／41941退出，新42866／42897启动；lsof显示127.0.0.1:60056监听，未认证curl401。`npm run host:check`0阻断、1缺基线待复核、退出2。

**遗留**：真实页面视觉及点击反馈未直接验收；未提交或发布。

### 2026-11-21 · 技能刷新边框、标题与图标修正

**背景**：用户实际截图指出刷新图标缺少边框、技能管理标题后的数字冗余、首页星形图标不贴合技能。

**决策**：IconButton增加outlined选项，仅来源／市场刷新使用；工具栏图标按钮复用36px尺寸、普通边框与底色。移除技能标题计数但保留分组和统计口径；共享skills图标换为指令文档与闪光，来源目录保留文件夹。原型计数更新容忍无计数节点，避免搜索空引用。

**证据**：`npm run typecheck`、`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`396通过、0失败、0跳过；vm.Script检查全部原型脚本，并在无计数节点夹具调用integrationUpdateResults成功更新列表。连续两次build及最终复核四产物SHA-256一致，客户端+35字节、服务端不变。`node /tmp/dsh-workbase-install-verify.mjs`六文件白名单及敏感模式通过；包646607字节，SHA-256 `d8c30f82211a71dd071a8dab0193568d3b04a478d274d683ea62352447e70ace`。官方CLI remove失败，首错为`EACCES: permission denied, open '<home>/.dsh/profiles/desktop/package.json.lock'`，未执行后续add；`open -a 'DeepSeek Harness'`已恢复现有宿主，主进程41904。

**遗留**：需要desktop profile写入权限后才能重装，新视觉尚未进入当前安装。真实页面未验收；当前目录没有.git，未做Git差异检查，未提交或发布。

### 2026-11-21 · 技能来源与市场刷新仅显示图标

**背景**：用户要求技能来源和技能市场的刷新按钮不显示文案，市场截图仍是三点菜单加「加载市场」单项。

**决策**：两处工具栏复用共用IconButton，市场直接调用market.load，来源仍调用scan；共用原串行锁、错误与快照处理，title／aria-label包含处理中提示，busy及aria-busy保留。全局／项目扫描继续显示文字，主原型同步，仅演示刷新，不读本机技能。

**证据**：`npm run typecheck`及`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`396通过、0失败、0跳过。初轮唯一失败为skills-render旧断言强制包含Menu，替换为共享IconButton并删除无用导入后通过。两次build四产物SHA-256一致，客户端+124字节、服务端不变。`node /tmp/dsh-workbase-install-verify.mjs --installed`确认六文件白名单、当次敏感模式及安装文件一致、bundle启用；包646586字节，SHA-256 `bbd9ebb058d79ee97b85fe74841ac8667af6ae713788a4684c0f01e805962ed7`。官方CLI重装后新40605／40636启动，`lsof -nP -iTCP -sTCP:LISTEN`为127.0.0.1:53906，未认证curl401；host:check为0阻断／1缺基线待复核／退出2。

**遗留**：未直接验收真实页面视觉及点击反馈；未提交、发布或改变版本号。当前目录没有.git，未执行Git差异检查。

### 2026-11-21 · MCP只列绑定项目并将技能扫描改为直接按钮

**背景**：用户截图显示MCP没有连接仍列出全部项目，另指出技能重新扫描藏在只有一项的菜单中。需要减少空分组与额外点击，并明确扫描处理中状态。

**决策**：MCP按已保存的项目范围连接绑定决定项目分组，停用和连接失败仍可管理；全局连接不使项目显示，多项目绑定分别显示，移除最后绑定后回到全部连接。搜索条件及新增范围选择保留。技能全局／项目标题行和来源工具栏直接提供刷新图标＋文字次按钮；扫描中显示文案与aria-busy，busy及原run锁阻止重复触发，成功显示扫描完成、失败沿用错误反馈与原快照。市场加载保留菜单，不改扫描服务端语义或新建样式。

**证据**：`node /tmp/dsh-mcp-project-groups-check.mjs`执行从正式面板读取的筛选表达式，empty／globalOnly隐藏、disabled／failed／multipleProjects显示、removedBinding隐藏，六项通过；此项为绑定数据夹具，不是实际MCP握手。`npm run typecheck`、显式官方模块396项全量测试与两次build通过，四产物哈希一致，客户端+490字节、服务端不变。包646529字节、SHA-256 `92c7f330738df6db095aa7198251f52c1c0b1bd7787acb675ee3a08506a4a48f`，当次六项白名单与敏感模式通过；官方CLI离线重装后六文件／bundle一致。旧34944／34980退出，新38906／38939监听51285，未认证curl返回401；host:check为0阻断／1缺基线待复核／退出2。

**遗留**：真实浏览器和用户宿主页面上的布局、扫描重复点击及焦点行为尚未直接验收，测试和启动证据不能代替视觉验收。原型刷新仅更新浏览器演示列表，不执行本机扫描。未操作用户绑定、技能开关或外部连接，未改版本、提交或发布。

### 2026-11-21 · 项目技能分组仅显示具有实际.agents技能的项目

**背景**：用户指定项目目录存在.agents/skills且其中有真实技能才显示项目。此前项目技能分组直接列全部项目，空目录或根本未配置技能也显示，选中后为空。

**决策**：利用正式扫描已有的project-agents来源标识和非空有效正文判断，排除缺失／空目录、无效解析占位和仅.dsh来源；不新增目录探测或改宿主注册。单技能停用仍满足文件存在条件，宿主调用待确认或冲突不影响存在判断。左侧与窄屏共用过滤项目，失效选择回到全部项目；范围编辑仍提供所有可用项目。原型使用模拟project来源记录，保留演示边界。

**证据**：`node --import tsx /tmp/dsh-project-skill-groups.mts`在mkdtemp真实目录中调用SkillsManager扫描，并执行从正式面板读取的skillProjects筛选：missing／empty／invalid／dshOnly隐藏，actual显示，disabledActual仍显示，removedActual隐藏；七项通过，结果在`/tmp/dsh-project-skill-groups.log`。初次脚本误用只读snapshot未触发发现，改为实际scan后验证通过。`npm run typecheck`和显式官方模块396项测试通过，连续两次build四产物SHA-256一致，客户端+155字节、服务端不变。包646366字节、SHA-256 `9102ce72b2b906eef65a5ba2958dc5cbc94e32a6ecf8ffe7cf2da780122b20f2`，六项白名单及敏感模式通过；官方CLI离线重装后六文件／bundle一致。旧33688／33721退出，新34944／34980监听62505，未认证curl返回401，host:check为0阻断／1缺基线待复核／退出2。

**遗留**：真实目录扫描与正式筛选表达式证据不是浏览器页面验收；未直接点击真实用户项目分组。全部项目视图仍可管理已有其他项目来源技能，本次只限制项目分组显示条件。未改用户项目技能文件、版本、提交或发布。

### 2026-11-21 · 隐藏关闭来源的筛选入口并统一空状态

**背景**：用户截图中关闭来源仍留在全局技能左侧列表，选中后为空；空状态又列出DSH／公共Agent／项目等实现细节。用户要求提示更通用，并同步隐藏关闭来源的筛选项。

**决策**：全局来源groups仅取启用来源，左侧及窄屏选择器共用；activeGroup遇到关闭／消失来源即时使用全部来源，随后更新选择记忆，避免等待effect时短暂显示空列表，保留搜索。来源管理页不隐藏，以便重新开启。空状态统一通用记录文案，补英文词典、原型和PRD，不改样式或调用策略。摘要兜底测试明确关闭watchSources，使“监听回调前”的前提可控；保留另一真实监听测试，不改服务端运行行为。

**证据**：`npm run typecheck`及`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`396通过、0失败、0跳过；监听刷新与无监听元数据扫描两项定向验证通过。初轮摘要测试在426行count为null，实际watchSources回调会在生效确认期间推进discoveryEpoch；测试隔离后保持原数量／正文／资源／删除断言。两次build四产物SHA-256一致，客户端+94字节、服务端不变。当前包646298字节、SHA-256 `161ddbeda37ccb4f162f78cd7833e1fa930e830418a5452f6b5503533d7d2ebd`，当次六项白名单与敏感模式通过；官方CLI离线重装后六文件／bundle一致。旧31887／31920退出，新33688／33721监听59425，未认证curl返回401；host:check为0阻断、1缺基线待复核、退出2。

**遗留**：未直接执行浏览器或真实宿主页面关闭／筛选恢复验收；安装启动与测试证据不代替真实页面交互。服务端监听变化时保守返回待确认的运行逻辑未改，不将测试隔离称作修复生产时序。未操作用户来源或技能开关，未改版本、提交或发布。

### 2026-11-21 · 关闭来源时从技能列表隐藏其条目

**背景**：用户明确要求来源关闭后不显示该技能。正式面板只按范围、搜索和分组过滤，来源停用的技能仍在列表，容易把保留的单技能开关理解为仍生效；原型也仍直接读取全部未删除条目。

**决策**：在既有列表过滤中增加来源enabled条件，范围、搜索、分组和数量自然共用结果。原型复用已有integrationVisibleSkills，不新增状态或控件；来源页继续显示关闭来源以便恢复，单技能停用仍可管理。服务端快照和独立策略保持，避免为展示删数据或改变调用语义。

**证据**：`src/client/SkillsPanel.tsx`的skills筛选与`docs/ui/ui-directions.html`的integrationRecords已同步，`docs/PRD.md`记录用户指定行为。`npm run typecheck`通过；首次全量395通过、1失败为`test/skills-registry.test.ts:417`摘要count偶发null，未改该服务端用例，单独24项及`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`全量复核396通过、0失败、0跳过。两次build四产物哈希一致，客户端+55字节、服务端不变，无新依赖。官方CLI离线重装，六文件／bundle与本次包一致；包646253字节、SHA-256 `843610be15ea3d50eb4e78c95ef382852bbf981fb4682bb5be0aefff8abdea82`，当次白名单及敏感模式通过。旧28685／28721退出，新31887／31920监听56991，未认证curl返回401；host:check为0阻断、1缺基线待复核、退出2。

**遗留**：浏览器工具不可用，历史`/tmp/wb-init-browser/node_modules/playwright/index.mjs`不存在，未直接执行页面关闭／恢复与视觉验收。首轮摘要用例的偶发时序失败不以复核通过宣称已修复。未操作用户技能或启停配置，未改版本、提交或发布。

### 2026-11-21 · 技能开关配置不再误走目录事务检查

**背景**：用户关闭技能来源开关时报“宿主文件系统受限，不能使用本机目录事务”。`SkillsManager.store`保存单个state.json却调用了为多目录安装事务设计的permission，官方fs存在sandboxMode便提前拒绝。此前隔离registry测试没有挂载官方沙箱fs，未覆盖该路径。

**决策**：配置保存优先官方writeText原子发布，按调用限定工作台自有技能配置目录；附加授权与防链接保留，read-only仍拒绝，不使用danger-full-access。映射缺失或写入拒绝不回落本机，不提前更新内存。无官方fs才沿用atomicJson；创建／编辑和旧版恢复继续使用原目录事务限制，不迁移存储格式。

**证据**：`DSH_SKILLS_HOST_TEST=1 node --import tsx --test test/skills-host.test.ts`挂载从实际桌面包复制的官方SandboxedFileSystem后先复现相同目录事务错误；修复后来源及单技能开关、重建管理器策略保留、官方写入拒绝／映射缺失／read-only及目录事务拒绝全部通过，拒绝前后state.json与有效状态一致、原正文不变。`npm run typecheck`和`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`396通过、0失败、0跳过；两次build四产物SHA-256一致。服务端+696字节，无新运行时依赖。包646243字节、SHA-256 `251fc8631c5f4653bb9dfa5836b14d6152262797790bc64d60a42d6f5ec0827d`，当次六项白名单与敏感模式通过，官方CLI remove/add离线重装、六文件／bundle一致。旧26831／26873退出，新28685／28721监听54107，curl未认证GET401；host:check为0阻断、1缺基线待复核、退出2。安装复核使用`node /tmp/dsh-workbase-install-verify.mjs --installed`。

**遗留**：隔离官方服务与安装启动证据不代表真实用户页面点击或既有Agent内容撤回已验收；未操作用户技能或启停配置，未改版本、提交或发布。受限宿主的多目录安装／编辑仍需官方目录事务能力，不因本次开关修复放开。

### 2026-11-21 · 非法候选名称不再导致整批生效检查失败

**背景**：用户指出全部技能详情标记生效异常。本轮重新汇总实际来源的错误正文，`/tmp/dsh-skills-real-issues.json`显示9条name正则失败、107条官方候选验证失败；共同错误为`invalid skill name "TRAE-browseruse"`。此前只记录116异常总数，没有展开两类具体原因，完整名称基准与不完整目录测试也未覆盖validateCandidate直接抛错。

**决策**：按参考插件`core.ts`的`toKebab`／`canonicalSkillName`将安全ASCII声明名称映射为宿主调用名，显示名和路径保留。只读解析采用独立名称校验，新建／上传规则不改；候选、同名分组、正文匹配及生效检查统一用调用名，真实文件策略继续按路径绑定。候选提交前排除不可映射的名字，未知调用限制仍严格拒绝。pending用既有待确认文案、clock图标和辅助说明，不作为异常数或错误警告；同名覆盖和真正读取失败仍报告。

**证据**：`test/skills-registry.test.ts`新增大写名称不污染正常技能、规范调用／原文件不变／启停及不可映射名称的两项回归，修复前均失败，修复后通过。只读当前来源的`npx tsx /tmp/dsh-skills-real-loading.mts`输出`/tmp/dsh-skills-real-issues-fixed.json`：115条effective、1条shadowed、全局有效115、异常1；扫描188.49 ms、116次指令读取及1次官方snapshot。`npm run typecheck`、`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`396通过／0失败／0跳过；连续两次构建四产物SHA-256一致，服务端+970字节、客户端+328字节，无新运行时依赖。最终包646109字节、SHA-256 `03c5e82361c37db2313686c7d73aac4e30a15fe21498fa07a0364a80070387da`，当次六项白名单和敏感模式通过；官方CLI remove/add离线重装后六项文件与bundle核对通过。正常退出24504／24536，启动26831／26873；lsof为127.0.0.1:51279，未认证curl返回401，host:check为0阻断／1缺基线待复核／退出2。

**遗留**：真实用户Agent与浏览器页面未直接验收；隔离registry的115生效不能冒充实际会话全部调用成功。非ASCII或不安全名称仍独立报错，复杂YAML及未知调用策略仍受既有边界限制。未改用户技能、策略及版本，未提交或发布。

### 2026-11-21 · 初始快照避开生效队列并合并不完整目录检查

**背景**：上一轮安装后用户截图仍显示技能来源正在读取；前轮完整目录的隔离基准没有覆盖官方不完整目录和并发摘要阻塞初始快照。真实115条旧技能记录及2处全局来源存在，宿主进程采样`/tmp/dsh-skills-stuck-sample.txt`显示持续文件读取回调；官方`SkillRegistry.snapshot`的未完成结果不缓存，工作台却逐技能重复调用，并把页面快照也排在同一队列。

**决策**：只读快照等待初始化后直接克隆已提交状态，保留取消与卸载检查，写事务和扫描仍串行。生效检查每批按cwd与Agent复用官方快照，未完成或失败结果仅在本批复用，整批共享10秒超时；下次请求继续重试，不把pending改成生效。最终摘要复用全局观察，文件监听期间变化不写已确认时间。保留前轮发现缓存、权限复核及完整导入校验。

**证据**：`npx tsx --test --test-name-pattern='目录未完成时|只读快照不等待' test/skills-registry.test.ts`修复前两项失败，9技能单作用域收集10次、快照等待超过100 ms（`/tmp/dsh-skills-loading-red.log`）；修复后22项registry回归通过。`npx tsx /tmp/dsh-skills-real-loading.mts`禁止写操作、只读当前全局来源，隔离registry返回快照14.93 ms、扫描260.53 ms、1次官方snapshot，数据见`/tmp/dsh-skills-real-loading.json`，未完成计数保持null。`npm run typecheck`与`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`通过，394通过／0失败／0跳过；连续两次构建四产物SHA-256一致。服务端1374801字节、`45e619c621a219a4f6573e9f755e961b7db5c05e6f25efff2820dea9f3f3a1dd`；包645688字节、`bd6834cd96fd1c6dd6ab1373b4451df033aa77e4e3cc08de88e0dce722939552`，当次白名单与敏感模式核查通过。官方CLI remove/add离线重装并核对六项文件及bundle；旧22874／22917退出，新24504／24536启动，lsof为127.0.0.1:64082，未认证curl返回401；host:check为0阻断、1缺基线待复核、退出2。

**遗留**：当前115条来源测量没有真实项目／Agent、第三方提供器或浏览器渲染，不能作为端到端延迟。目录未完成原因仍如实报告，未改用户技能及策略；实际页面修复后的加载态未直接观察。版本保持1.0.4，未提交或发布。

### 2026-11-21 · 技能发现缓存与按需读取减少重复加载

**背景**：用户反馈技能读取慢。`discoverSource`每次解析指令后读完整bundle；全局及各Agent收集、get前校验、每次摘要又重做发现并无条件清宿主缓存。80技能和40 MiB资源、2个Agent的隔离基准首次扫描1295.43 ms／480次指令读取，单技能212.89 ms／81次，重复摘要1178.62 ms／480次。首次扫描重复读取及21 MiB关联资源阻断普通发现的两项回归先失败。

**决策**：来源发现按来源身份及路径共享并发任务，成功结果保存目录与指令元数据；命中仍复核授权与链接目标，官方fs通过零字节读取检查当前权限，缺接口重新读取。普通发现只解析指令，详情枚举名称，导入预览独立完整bundle摘要并在确认时重验；受管安装按全部文件及目录元数据缓存完整性结果。策略不存入候选缓存，get只重读所选正文并保留调用限制交集；扫描期间变化不发布缓存，监听／事务／显式扫描失效，无变化摘要不无条件刷新宿主。保留真实路径策略、同名回退及所有权边界。

**证据**：`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`392通过、0失败、0跳过，`npm run typecheck`通过；`test/skills-registry.test.ts`覆盖并发首读、权限拒绝后恢复、监听前修改／增删、详情资源、大型资源普通读取、导入预览后资源冲突及受管资源篡改。`npx tsx /tmp/dsh-skills-perf.mts`最终数据见`/tmp/dsh-skills-perf-after.json`：490.53／14.90／15.12／15.32／23.50 ms，指令读取80／1／1／1／0次；最终按readInstruction调用计数，旧基准按该方法的SKILL.md授权调用计数。连续两次`npm run build`及四文件SHA-256对比一致（`/tmp/dsh-skills-hashes-first.txt`与`second.txt`），服务端增加7766字节，客户端未变化，无运行时依赖增加。`npm pack --ignore-scripts --pack-destination /tmp --json`、官方CLI remove/add及六项安装核对通过，包645481字节、SHA-256 `208635969947bc4e6fabde621d2cbb60d98dc08bebefd0eed90dd9ebd0b6bf2e`。正常退出12389／12422后启动22874／22917，`lsof -nP -a -p 22917 -iTCP -sTCP:LISTEN`为127.0.0.1:60568，未认证curl返回401；`npm run host:check`0阻断、1待复核、退出2。

**遗留**：本机隔离基准不等于真实用户会话端到端延迟；尚未验收浏览器视觉及真实会话技能调用。监听上限及失败提示保留，显式扫描作为复核入口；没有已接受宿主基线仍待复核。版本保持1.0.4，未提交或发布。

### 2026-11-21 · 技能启停修复通过官方CLI安装并重启

**背景**：用户要求将已验证的技能启停修复安装到桌面并重启宿主。

**决策**：重新构建并打包到临时目录，按当次包核对六项白名单、内容与敏感模式；正常退出旧桌面和宿主后，使用应用自带CLI remove/add离线重装。启用状态按官方profile的`package.json.dsh.profile.bundles`核对，`cordis.yml`是空入口列表，不能据其没有工作台键判断未启用。安装一致后再启动，不手改profile或其他插件。

**证据**：`npm run build`和`npm pack --ignore-scripts --pack-destination /tmp --json`退出0；`/tmp/dsh-workbase-install-package-check-current.json`记录包643915字节、SHA-256 `19a80f7c7640fe2311ff5f90746d18af9f774ed98740da7706df2b4f58d76078`、六项逐字节一致及敏感模式0命中。官方`plugin --profile desktop remove dsh-workbase`与`add /tmp/dsh-workbase-1.0.4.tgz --offline`退出0，reused 1、downloaded 0、added 1；`/tmp/dsh-workbase-installed-check-current.json`确认1.0.4、bundle启用、六项安装文件一致，客户端`d59dfe3ad906d40b46e02bd482c4204e3a3a5db392b299c2ec4fc5cf54995b5e`、服务端`e5abae23e10a82f0a6569733e7676465ceb1642287a344ab23cee083c33097cc`。正常quit后旧99591／99624退出，`open -a "DeepSeek Harness"`启动11072／11104，`lsof -nP -a -p 11104 -iTCP -sTCP:LISTEN`为127.0.0.1:51088，`curl --max-time 5 -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:51088/`返回401。`npm run host:check`0阻断、1基线待复核、退出2。

**遗留**：未重复无源码变化的全量测试，沿用修复阶段387项通过证据；真实技能调用／会话上下文与本轮视觉仍未验收。未提交或发布。

### 2026-11-20 · 技能启停改为独立策略与官方作用域覆盖

**背景**：原实现把外部文件只读扩大为启停只读，含既有原生技能的来源被直接拒绝；只注册全局提供器也无法覆盖Agent预设更近的技能层。用户确认按参考插件的官方提供器方案修改工作台。

**决策**：来源与单技能启停独立存储，不接管其他插件配置，不移动技能文件；模型与手动通道通过同名官方候选关闭，已有／新建Agent另行注册。按真实指令路径继承分发链接的单技能策略，同名启用副本可接替，纯来源停用的自定义副本让出bundled。get重新发现并核当前策略，读取失败保持目录不完整，优先级冲突不宣称停用成功。只读发现接受常见说明块及原始调用限制，写入／导入继续拒绝链接；旧版中转重新启用仍走现有事务。界面开关和配置说明同步，正文编辑边界保留。

**证据**：`npm run typecheck`通过；`DSH_MCP_HOST_TEST=1 DSH_SKILLS_HOST_TEST=1 npm test`387通过、0失败、0跳过，包括`test/skills-host.test.ts`只读复制实际桌面rc.5模块至临时home，以其独立Cordis和SkillRegistry验证全局／Agent、重启、调用权限及卸载；`test/skills-registry.test.ts`覆盖既有／后续Agent、来源独立策略、链接、同名副本、项目隔离、授权拒绝、文件监听和斜杠菜单事件、未知调用策略及旧中转恢复。连续两次`npm run build`后`shasum -a 256 lib/client.js dist/index.js src/client/prototype.css src/client/prototype-icons.ts`完全一致，客户端1471999字节、`d59dfe3ad906d40b46e02bd482c4204e3a3a5db392b299c2ec4fc5cf54995b5e`，服务端1365987字节、`e5abae23e10a82f0a6569733e7676465ceb1642287a344ab23cee083c33097cc`；未新增运行时依赖。提供器目录收集不调用registry.get，避免递归死锁。

**遗留**：未安装或重启用户宿主，未做本轮浏览器视觉或真实用户会话验收；官方模块隔离验证不代表已进入会话上下文的技能内容可撤回。复杂YAML超出当前只读解析支持时显示异常；第三方更高优先级策略需根据实际snapshot反馈处理，不修改其状态文件。

### 2026-11-20 · 三模块通过桌面官方CLI安装并重启

**背景**：用户要求桌面端安装并重启；此前profile文件锁因沙箱写权限受阻，本次官方CLI重试已成功。

**决策**：使用已通过六项白名单与逐字节检查的1.0.4安装包，先正常退出旧桌面与宿主，再由应用自带CLI remove/add重装；remove不带不受支持的`--offline`参数，add使用本地tgz与`--offline`，不修改其他插件或手工写profile。安装核对通过后再启动桌面，避免退出与启动重叠。

**证据**：官方`plugin --profile desktop remove dsh-workbase`和`add <workspace>/dsh-workbase-1.0.4.tgz --offline`退出0，add显示reused 1、downloaded 0、added 1。`/tmp/dsh-workbase-installed-check.json`记录版本1.0.4、bundle启用、六项文件逐字节一致，客户端`b4b8a0a691275ffcced5292068a0b56bd138ddce8b9ce8390e5637ea5beaf836`、服务端`6933bbaeabfd4c1e8632bedb822ebd9d24068a4d788a74058d184548ee204802`。正常quit后确认旧52730／52789退出；新桌面99591、宿主99624，`lsof -nP -a -p 99624 -iTCP -sTCP:LISTEN`显示127.0.0.1:59551，未认证GET `/`返回401。`/tmp/dsh-workbase-installed-host-check.log`和`docs/ui/verification/host/report.md`显示0阻断、1待复核（缺少已接受基线）、退出2。

**遗留**：本轮无源码变化，不重复已通过的375项测试；安装与服务启动确认不代替真实用户数据下的技能／MCP／RSS全流程及外部OAuth验收。未提交或发布。

### 2026-11-20 · 安装授权重试未在当前沙箱生效

**背景**：用户表示已授权安装目录，要求继续安装并重启。

**决策**：先重试官方桌面CLI以确认实际写权限；仍被拒绝后，只读核对沙箱配置，不自行更改授权文件或绕过限制，保留旧宿主运行。

**证据**：官方CLI `plugin --profile desktop list --depth 0`再次在`~/.dsh/profiles/desktop/package.json.lock`报`EACCES`；执行工具明确报告sandbox restricted。只读检查`<home>/.trae-cn/permission/global.json`的`resourceAuthorization.filesystem.readWrite`，未包含desktop profile、pnpm store或pnpm缓存三个目录；安装包与两端构建哈希仍与上条核查一致。完整CLI错误保存在`/tmp/dsh-workbase-install-before.log`。

**遗留**：用户的操作授权已有，但当前工具沙箱授权未生效。需要将三个目录的绝对路径追加到实际生效的filesystem.readWrite配置，再继续安装和重启；尚未卸载或安装插件，未退出宿主。

### 2026-11-20 · 三模块安装包完成，桌面写权限受阻

**背景**：用户明确要求将三模块最终实现安装并重启桌面宿主。

**决策**：使用应用自带`runtime/cli/bin/dsh`管理desktop profile；先构建、出包并逐文件核查。官方CLI需要profile文件锁，当前沙箱拒绝该写入，因此保留正在运行的旧桌面，不绕过锁、不修改沙箱授权文件，也不先退出后留下无法安装的状态。

**证据**：`npm run build`与`npm pack --ignore-scripts --pack-destination /tmp --json`成功；客户端`b4b8a0a691275ffcced5292068a0b56bd138ddce8b9ce8390e5637ea5beaf836`、服务端`6933bbaeabfd4c1e8632bedb822ebd9d24068a4d788a74058d184548ee204802`与最终验收一致。包为641783字节、SHA-256 `4b46f4202abdd9ca4b9cce4c3a053b4b70059100dae085215ff2cf7ca6eff44e`，六项白名单逐字节一致，私钥／令牌／邮箱／内部域名／本机路径五类指定模式0命中；完整核查在`/tmp/dsh-workbase-install-package-check.json`。官方CLI `plugin --profile desktop list --depth 0`报`EACCES`，被拒文件为`<home>/.dsh/profiles/desktop/package.json.lock`，完整输出在`/tmp/dsh-workbase-install-before.log`；已观察到pnpm store为`~/Library/pnpm/store/v11`，缓存位于`~/Library/Caches/pnpm`。`ps -p 52730,52789 -o pid=,ppid=,comm=`确认旧桌面与宿主仍运行。

**遗留**：待desktop profile、pnpm store与缓存写权限放行后继续官方remove/add安装、正常退出及重启、六项安装文件与监听服务核对；本轮未安装、未重启、未发布或提交。

### 2026-11-20 · 技能独立模块与真实registry验证

**背景**：用户要求完整实现技能模块，先核实实际宿主及已装技能插件接口，由主代理统一集成公共入口。需要真实文件、关联资源和生效证据，不能将文件保存或示例数据当作宿主成功。

**决策**：`SkillsManager({ctx,home,agentsHome,projects,config,authorize?,reveal?})`依赖当前公开skills/fs服务；`projects()`只返回已登记项目，`config()`读取技能默认位置及启用策略。入口为`handle(method,input,signal?)`及`snapshot()/summary()/dispose()`；snapshot返回sources的path/writable/readonly/scope、stagingPath，摘要首次未知为null。方法包括snapshot/summary/scan/save/toggle/detail/export、source.add/rename/toggle、market.source.save/toggle、market.load、import.preview/confirm、reveal-staging。文件预览传text，目录预览传sourceId、确认传fromSourceId，仓库预览传repositoryUrl、确认传返回的token；确认均传names及scope/projectIds，可选sourceId指定目标。`SkillsPanel({api,projects,onClose,memory?,navigation?})`自含工作台概览Modal，复用统一extensionCall、现有Modal/Picker/Menu及全部原型类名；不修改公共入口和样式文件。第三方原有技能保持外部归属，只读展示，目录复制不接管源策略；含外部成员的来源不能伪造全局停用。目录事务已开始后不因HTTP请求取消而中断，排队请求取消则不执行。

**证据**：实际应用`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`中的`dsh/node_modules/@deepseek-ai/dsh-skill/src/index.ts:390,470,481,500`公开registerProvider/list/snapshot/get，control.invalidate清空目录缓存并发布变化；`dsh-skill-filesystem/src/index.ts:135,185,216,251-270`注册提供器及全局／项目DSH、Agent目录，未公开CRUD或全局禁用事务。desktop已装`@michengai/dsh-skills-manager@1.5.0`的`lib/index.js`注册作用域及全局提供器并维护自身HTTP路由，没有公开接管协议，因此不调用私有策略写接口。`npx tsx --test test/skills*.test.ts`17/17，`npm run typecheck`通过。`npx tsx docs/ui/verification/skills-rc5-registry.mjs`只读导入实际应用lib实现，依赖身份复用工作区，在临时home核实list/get/启停/范围/dispose，全部通过；不是运行中的正式profile验收。`node docs/ui/verification/skills-browser.mjs`4/4：1100／360px×明暗，超长标签宽分别325／278px且等于可用宽，无横向溢出、页面错误0，覆盖只读详情、失败草稿、创建／上传切换和来源原位改名。真实`fetchSkillCatalog("https://api.github.com/repos/anthropics/skills",AbortSignal.timeout(20000))`返回仓库元数据6447字节，固定DNS回调的单地址及options.all数组契约均有单测。证据脚本均位于忽略的verification目录，不进入包。

**遗留**：未安装、重启或改用户既有技能／宿主配置；真实模型已加载的技能内容不能保证撤回。rc.5实现隔离测试不等于实际宿主会话验收。GitHub以外Git服务、私有仓库、任意压缩包和第三方策略接管没有可靠公开契约，本轮不支持；仓库及上传复杂YAML需规范化为单行标量或技能JSON，已登记外部技能仅在官方get返回路径一致时复用其复杂frontmatter解析。主代理负责最终公共RPC owner校验、请求signal转发、词典覆盖和全仓验收；未创建提交。最后一轮已复核请求结束后的原开关焦点恢复，仅原节点仍连接且activeElement回落body时下一帧preventScroll恢复，不抢用户新焦点；4组浏览器开关状态／焦点回归、17项技能测试、typecheck及build通过。

### 2026-11-20 · MCP官方传输、凭据与OAuth首轮落地

**背景**：PRD第10章要求可运行MCP管理，而不是以原型状态冒充连接；用户要求独立职责文件，主代理集成共同入口，禁止修改宿主配置及使用真实外部服务测试。

**决策**：只读实际桌面ASAR的`dsh-mcp-client/src/index.ts`、`status.ts`、`tools.ts`及`dsh-credentials/src/index.ts`／`types.ts`。前者公开`Config`、`apply`、`connectionStatusOf`、HTTP／stdio及凭据模板，未暴露OAuth provider；后者公开`set/unset/resolve`和`readRecord/modifyRecord/deleteRecord`。按用户最新要求自行补协议级OAuth PKCE、元数据、loopback回调、动态注册、刷新和取消，但建连仍官方客户端，凭据仍官方vault。第三方MCP插件私有OAuth不调用，项目范围同时约束工具声明与执行，会话隔离缺稳定激活语义继续禁用。坏配置的`ready`立即挂catch但保留失败供snapshot报告；清理未确认通过`McpCleanupError`携带关闭句柄并阻断后续操作，替换先停止旧连接再写配置／凭据。

**证据**：`DSH_MCP_HOST_TEST=1 npx tsx --test test/mcp*.test.ts`16通过、0失败、0跳过。`test/mcp-host.test.ts`从实际`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`只读提取rc.5官方模块到临时目录，使用独立Cordis Context和127.0.0.1假MCP服务／本地stdio子进程；两种传输均通过initialize、tools/list、tools/call，调用返回`local-result`，停用后注册数0。HTTP附加验证跨项目声明不可见、执行拒绝、工具关闭及重连后仍关闭、重新启用后可调用。`test/mcp-oauth.test.ts`验证本地元数据、动态注册、S256 verifier、错误state拒绝、正确回调、refresh、不安全外部HTTP拒绝及取消释放监听。`test/mcp.test.ts`覆盖保密导入、部分成功幂等、损坏JSON子进程存活、清理不确定禁止第二次启动、排队取消与后台信号隔离；`test/mcp-render.test.ts`核对实际CSS类和两级aria-controls。`npm run typecheck`、`npm run build`退出0，构建器报告客户端1466384字符。

**遗留**：OAuth测试为本地假供应商，不是外部授权或用户profile证据；官方传输测试默认opt-in，必须显式设置`DSH_MCP_HOST_TEST=1`，默认skip不能算握手验证。配置恢复仍需重新握手。浏览器最终几何／主题／焦点和真实宿主安装未验收；无新增运行时依赖，未安装插件、修改宿主profile、提交或发布。

### 2026-11-20 · 按官方能力接入技能、MCP与RSS

**背景**：既有三模块仅HTML演示，用户要求完整功能及真实链路验收，先核对当前桌面宿主公开服务。

**决策**：技能复用官方提供器，MCP复用官方客户端与隔离子fiber；未发现等价RSS服务，独立实现DNS固定与逐跳校验传输。配置和后台任务归模块管理器，React只负责交互；统一owner管理权限，不把待办权限扩展到其他模块。技能和MCP复用`ScopePicker`处理全局／项目互斥及实际宽度标签折叠。原型原生容器查询及声明映射为`workbase-dialog`，媒体宽度转换继续使用`workbase`；根提供两个名称、抽屉只提供前一个，分开弹窗内容与外层面板宽度，避免同名容器让外层断点提前生效。通用表单标签排除卡片开关，恢复真源36px点击区域和无额外边距；三个模块共用`FormField`，排除通用弹窗label外边距。RSS添加按原型显示名称、分组及全宽地址，仅内网地址、已信任记录或相应访问错误显示可信内网开关，后台逐跳校验始终生效；创建仅保留添加按钮，添加方式导航支持方向键和Home／End。MCP和RSS详情与技能共用`settings-layout`内的`integration-detail`包装，避免绝对定位遮挡标题；原型详情头同步共用Modal的72／60px及20px／28px规范，不能用偏移修正。UI共用规范和AGENTS构建规则同步维护。

**证据**：源码入口为`src/server/extensions.ts`及三个模块的管理器。`npm run typecheck`、`DSH_MCP_HOST_TEST=1 npm test`、`npm run build`退出0，375项测试通过、无失败或跳过，包含实际官方rc.5 MCP HTTP／stdio握手及工具调用、真实SkillRegistry读取与停用撤回、本地HTTP RSS抓取和缓存，以及原型容器与媒体宽度转换分离的不变量。连续两次构建四项产物SHA-256一致，客户端为`b4b8a0a691275ffcced5292068a0b56bd138ddce8b9ce8390e5637ea5beaf836`、1470380字符，服务端为`6933bbaeabfd4c1e8632bedb822ebd9d24068a4d788a74058d184548ee204802`；完整测试日志在`/tmp/dsh-extensions-final-tests.log`，摘要在`/tmp/dsh-extensions-final-hash-{before,after}.txt`。生成CSS保留`:scope.c`、76个workbase系列容器查询（外层56、弹窗15、其他5）、宽度型`@media`残留0、括号2048对。含共用`ScopePicker`的AST词典审计753项、缺失／重复键／模板参数错配均为0。`node docs/ui/verification/extensions/run-final.mjs`与`node docs/ui/verification/extensions/recheck.mjs`退出0，17项流程、90组矩阵、690项界面检查、1430项RSS几何、1080项标题／按钮几何及450项标题字体／颜色对照通过，源码变化与页面错误0；`final-audit.json`逐项解释演示提示32px占位和测试名称宽度，未解释差异0。标题专项探针确认20px／28px与29px图标按钮；原型标题选择器加入统计抽屉边界，避免通用复合`:is()`的分区h3规则以更高优先级覆盖。最终轮只重拍RSS阅读、MCP工具焦点及紫晶浅色750px RSS添加表单两侧关键截图，其他早期截图不作为当前证据；全部主题以本轮DOM和计算样式核对。测试只使用隔离目录，不改变用户现有技能、连接或订阅。

**遗留**：本轮不提交、不发布、不安装或重启用户桌面；真实桌面profile与外部供应商授权不能由隔离测试代替。`npm run host:check`退出1，`docs/ui/verification/host/report.md`记录的两项阻断仅为已安装`dist/index.js`、`lib/client.js`与新构建不一致，21个静态服务模块均无缺少方法，尚无已接受基线；不通过改写用户安装消除此差异。按会话注入没有当前官方公开契约，保持禁用。具体完成范围以本文件当前状态及最终验收结果为准。

### 2026-11-20 · 分组选中留白与订阅子项图标对齐

**背景**：用户指出选中分组文字紧贴底色左边缘，订阅子项图标未对齐分组文字。

**决策**：分组按钮恢复8px左内边距，与订阅子项按钮一致；在36px折叠点击区域内把16px图标靠右，保持箭头到文字的8px间距。全部订阅按钮改为20px左内边距及8px图文间隔，使全部名称保持同一左缘。依据布局规则，分组文字与子项图标均位于36+8=44px；选中底色距文字8px。

**证据**：`node /tmp/dsh-rss-reading-check.mjs`核对生成CSS的名称左内边距8px、箭头右对齐、全部订阅20px内边距及8px图文间隔，检查通过。`npm run typecheck`、`npm test`（320通过、0失败）及`npm run build`通过；生成CSS括号2046对、宽度媒体查询0、workbase容器70、RSS容器1及温暖主题保留，客户端1305877字符／1306055字节。结果见`/tmp/dsh-rss-reading-{check,typecheck,test,build}.log`。

**遗留**：按prototype-craft仅静态检查，几何数值来自布局规则推导，未在浏览器测量或做视觉验收。

### 2026-11-20 · 分组单击筛选与双击重命名

**背景**：用户要求分组名称可单击筛选文章，双击再修改名称。

**决策**：移除名称strong上的单击重命名事件，分组按钮单击筛选，双击委托仅允许自定义RSS分组进入原位编辑。单击更新文章、选中状态、来源Picker及搜索范围，清除单源选择，保留导航节点，防止首次单击重绘名称导致原生dblclick丢失。折叠、菜单、F2、直接新增编辑及保存／取消不变。

**证据**：`node /tmp/dsh-rss-reading-check.mjs`VM验证分组单击过滤正文、清除单源选择、更新选中态且不替换导航、不创建名称草稿；双击自定义分组创建草稿，全部订阅及未分组不创建，检查通过。`npm run typecheck`、`npm test`（320通过、0失败）及`npm run build`通过；生成CSS括号2046对、宽度媒体查询0、workbase容器70、RSS容器1及温暖主题保留，客户端1305849字符／1306027字节。日志见`/tmp/dsh-rss-reading-{check,typecheck,test,build}.log`。

**遗留**：按prototype-craft未打开浏览器；真实鼠标双击与触屏运行未验收，触屏可使用更多菜单重命名。

### 2026-11-20 · 缩小分组名称输入并调整下拉锚点

**背景**：用户指出分组编辑框过大，提供左边缘对齐三点按钮的下拉参考，并反馈分组名称悬停出现下划线。

**决策**：名称输入改为36px紧凑导航规格，宽度min(100%,12ch)，外层保持40px导航行，不改变原位保存及焦点逻辑。去掉名称hover下划线，保留行背景反馈。RSS更多菜单从右边缘对齐改为左边缘对齐触发按钮，下方5px展开，右侧越界约束在窗口内，底部不足且上方够时向上展开；其他菜单保持原定位。

**证据**：`node /tmp/dsh-rss-reading-check.mjs`在真实menu函数VM检查正常左下展开、右侧越界及底部翻转，并检查生成CSS的短输入36px和无名称下划线，检查通过。`npm run typecheck`、`npm test`（320通过、0失败）及`npm run build`通过；生成CSS括号2046对、宽度媒体查询0、workbase容器70、RSS容器1及温暖主题保留，客户端1305861字符／1306039字节。日志见`/tmp/dsh-rss-reading-{check,typecheck,test,build}.log`。

**遗留**：按prototype-craft静态验收，未打开浏览器；真实菜单几何、输入框视觉及长名称编辑体验未做浏览器验收。

### 2026-11-20 · 恢复全部订阅图标并压缩箭头间距

**背景**：用户纠正上一轮移除全部订阅图标的处理，明确指出问题是折叠箭头与文字距离过大，并要求优化更多下拉框。

**决策**：只恢复全部订阅宫格图标，图标及名称共用筛选按钮，不增加第二个点击入口；分组文件夹保持省略。36px箭头点击区域保留，去掉4px列间隙及8px名称左内边距，可见间距从约22px缩至约10px。全部订阅图标与箭头占同一列、名称仍对齐。RSS更多菜单局部使用已有180px宽度，复用36px菜单项及主题，重命名／移动／删除增加现有pencil／arrow／trash图标，删除保留分隔及危险颜色，不调整其他管理菜单。

**证据**：`node /tmp/dsh-rss-reading-check.mjs`新增真实导航的全部订阅图标、RSS菜单类型及pencil／arrow／trash检查，并核对生成CSS的列间隙0、名称左内边距0与菜单180px，检查通过。`npm run typecheck`、`npm test`（320通过、0失败）、`npm run build`通过；生成CSS括号2047对、宽度媒体查询0、workbase容器70、RSS容器1及温暖主题保留，客户端1305765字符／1305943字节。完整结果见`/tmp/dsh-rss-reading-{check,typecheck,test,build}.log`。

**遗留**：按prototype-craft只做静态与构建检查，未运行浏览器视觉或点击验收；正式RSS宿主能力未接入。

### 2026-11-20 · RSS分组对齐计数、菜单层级及扩展工具栏

**背景**：用户指出分组未对齐、更多按钮点击无效，要求分组文章数量，评估刷新设置位置与刷新文字，并让RSS、技能和MCP同排搜索居左限宽、按钮居右。

**决策**：分组移除重复文件夹图标，全部订阅／自定义分组／未分组共用固定折叠及更多列，中间名称附缓存总数；暂停来源缓存计入，孤立文章排除，搜索不改变分组总数，编辑退出及Picker同步数量。共用menu此前挂app、层级10低于overlay20；弹窗触发改挂当前overlay，遮罩40／菜单41，菜单Escape／Tab已处理事件不再触发全局关窗。自动刷新是低频全局配置，移至扩展配置RSS页签并统一保存，新字段缺失使用旧频率；阅读页刷新只图标，保留悬停／读屏说明和忙碌状态。三类同排工具栏搜索最大340px可收缩，首个右侧按钮自动左外边距，窄面板不强制搜索占整行。

**证据**：`node /tmp/dsh-rss-reading-check.mjs`解析5段脚本／7份JSON，VM验证有效文章分组计数、搜索不改计数、图标移除、真实group菜单挂overlay并提供重命名／删除、刷新图标及设置字段；同时回归二级阅读、分组移动与取消撤销。`npm run typecheck`、`npm test`（320通过、0失败）、`npm run build`通过。生成CSS宽度型媒体查询0、workbase容器70、RSS容器1及温暖主题保留；最终括号与产物大小见当次检查日志`/tmp/dsh-rss-reading-check.log`。

**遗留**：仅原型、规范及生成样式；按prototype-craft要求未打开浏览器，真实菜单点击／键盘、对齐及设置交互未做浏览器验收；未接入正式RSS、宿主定时任务或发布。

### 2026-11-20 · RSS文章直达二级阅读弹窗

**背景**：用户要求点击文章直接进入二级弹窗，不显示footer。

**决策**：文章点击复用integrationDetailOpen及单栏integration-detail，移除列表内并排／切换阅读区；阅读分支不生成底部操作栏，原文链接放入标题下的来源／时间摘要。正文移除与标题栏重复的标题并安全转义，仅摘要保留提示。返回沿用原抽屉恢复，按原文章ID定位rss-read按钮，避免列表重绘后焦点落到第一篇。订阅详情中的最近文章也共用无footer阅读层。

**证据**：`npm run typecheck`、`npm test`（320通过、0失败）、`npm run build`通过。`node /tmp/dsh-rss-reading-check.mjs`静态解析5段脚本与7份JSON，VM检查文章点击直达article/read、单栏返回／关闭、无dialog-footer、原文位于正文上方、安全链接及摘要／正文转义，并回归分组与取消撤销。生成CSS括号2035对、宽度型媒体查询0、workbase容器70、RSS容器1、温暖主题保留；客户端1304761字符／1304939字节。

**遗留**：按prototype-craft静态验收要求未打开浏览器，真实弹窗视觉、焦点及滚动运行仍未验收；正式RSS组件与抓取后端未接入。

### 2026-11-20 · RSS分组原位编辑、拖拽折叠与卡片工具栏

**背景**：用户提供当前RSS布局及侧栏参考，明确要求分组直接新增并编辑、名称点击重命名、悬停竖向更多菜单删除、分组及子项拖拽、分组折叠、文章卡片，以及搜索／按钮同排去掉范围标题与数量。

**决策**：在现有RSS阅读分支迭代，不增加配置弹窗。分组创建唯一默认名后定位输入，名称Enter／失焦保存、Esc取消，失败保留草稿；失焦保存只替换当前名称节点，保留相邻菜单与来源节点。独立箭头折叠，三点菜单悬停／聚焦显示且触屏常显，删除分组把来源转入未分组。feedGroups及feeds数组持久保存手动顺序，rssCollapsedGroups保存折叠；原生拖拽处理分组上下插入、来源组内和跨组移动，不按启用状态或安装时间再次排序。菜单提供上下移／移动到分组替代。文章采用共享10px卡片圆角及12px间隔；搜索、刷新、设置和当前来源菜单同排，窄面板用有名称的图标按钮。

**证据**：`docs/ui/ui-directions.html`的integrationRssNavigation、integrationRssGroupFinish、integrationRssAddGroup、integrationRssDeleteGroup、integrationRssFoldGroup、integrationRssMove及bindIntegrations拖拽事件。`node /tmp/dsh-rss-reading-check.mjs`解析5段脚本、7份JSON，保留上一轮文章／阅读／撤销回归，新增分组创建／重名／保留草稿／取消／失败、删除保留来源及文章、折叠、分组及来源排序／跨组／失败回滚／菜单移动、单行工具栏与事件接线检查。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过；客户端1305984字符／1306162字节，生成CSS括号2049对、宽度型媒体查询残留0，workbase容器70处、RSS容器3处，温暖主题保留。完整输出见`/tmp/dsh-rss-reading-{check,typecheck,test,build}.log`。

**遗留**：原生拖拽及名称节点更新只经源代码审阅与VM状态检查，按指定原型插件约束未开启浏览器／截图，不声明真实拖拽、触屏及视觉验收通过。仍未接入正式RSS抓取或宿主；未安装、重启、提交或发布。

### 2026-11-20 · RSS我的订阅改为文章浏览与工作台阅读

**背景**：用户指出订阅源卡片无法直接浏览标题、摘要及阅读文章，并确认采用分组／来源导航、文章列表、按需阅读区和可撤销取消订阅的方案。

**决策**：在现有主HTML的RSS subscriptions分支原位迭代，复用集中示例数据、Menu、Picker、Toast及主题，不另建工作台或接入真实后端。阅读层使用workbase-rss容器查询，1100px及以上列表／正文并排，以下切换正文，650px以下使用分组及来源Picker；配置详情及推荐卡仍复用原流程。源暂停保留缓存，取消后保存快照供30秒撤销，重复URL拒绝恢复、原分组被删除时转入未分组。刷新异步桩保留失败缓存并检查来源身份、地址及启用状态；原文使用安全文章链接，示例地址不伪装真实访问。未新增已读／收藏或运行时依赖。

**证据**：`docs/ui/ui-directions.html`的integrationRssPanel、integrationRssResults、integrationRssReader、integrationRssCancel、integrationRssUndoCancel及integrationRefreshFeeds；`node /tmp/dsh-rss-reading-check.mjs`解析5段脚本、7份JSON，检查聚合搜索／排序、暂停缓存、正文转义／摘要、安全链接、取消／撤销／存储失败／冲突／过期，以及刷新范围／失败／迟到隔离和动作接线。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1303655字符／1303833字节。生成CSS括号2021对，宽度型媒体查询残留0，workbase容器查询70处、workbase-rss阅读容器查询3处，温暖主题保留。输出见`/tmp/dsh-rss-reading-{check,typecheck,test,build}.log`。

**遗留**：仍为本地交互原型，未接入RSS抓取、正式组件或定时任务。定向检查使用VM状态桩，不代表真实浏览器布局／键盘／菜单定位已验收；按指定原型插件要求未开启浏览器或截图。未安装、重启宿主、提交或发布。

### 2026-11-20 · RSS布局与交互对齐MCP

**背景**：用户要求RSS的布局与交互也和MCP保持一致。

**决策**：添加订阅使用添加／导入两项左侧菜单，已有订阅、编辑、分组、导出及文章共用单栏详情；状态、分组、检查时间和刷新／单源导出放在标题下，底部编辑／移除。推荐卡直接配置，保存留详情；保留身份、安装时间及地址未变时的检查结果。我的订阅保留自定义分组操作，标题区提供批量OPML导出；导入支持文件及粘贴自动预览、独立草稿、确认去重和过期读取隔离。

**证据**：`docs/ui/ui-directions.html`的integrationDetailOpen、integrationFinishDetail、integrationDetailSave、integrationRssAddTab、integrationReadRssFile、integrationImportConfirm及integrationOpml。`node /tmp/dsh-rss-check.cjs`解析5段脚本和7份JSON，核对两项左栏、单栏、保存留详情／身份／安装时间、失败草稿、确认去重、OPML转义／单源、排序、文件格式／2 MB／BOM／迟到隔离和候选分组；技能／MCP既有回归通过。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1298190字符；CSS括号1963对、宽度媒体查询残留0、workbase容器查询74处、温暖主题保留。命令输出见`/tmp/dsh-rss-{check,typecheck,test,build}.log`。

**遗留**：仅主HTML原型与文档，正式RSS组件及抓取未接入；定向检查的XML节点为桩，不代表浏览器DOMParser已验收。未进行浏览器视觉、真实文件选择界面及宿主验收，未安装、重启或发布。

### 2026-11-20 · 添加技能使用左栏并显示安装路径

**背景**：用户要求添加技能的创建／上传菜单改为左侧边栏，将保存来源优化为安装位置，选项使用已添加技能来源的路径。

**决策**：添加技能和MCP添加共用integration-detail-nav及既有200px／160px／650px以下横排响应式，两项方式菜单不混入正文分区；已有技能详情／编辑和市场添加继续单栏。创建／编辑／市场添加通过integrationSkillInstallSelect显示全部已登记来源路径，只读来源标注并禁用，范围切换继续限制全局／项目可用位置。source保存稳定来源ID，来源改名不改变路径或目标；默认设置同步改为默认安装位置并显示可写全局路径，上传继续使用已保存默认值。

**证据**：`docs/ui/ui-directions.html`的integrationFinishDetail、integrationSkillInstallSelect、integrationSkillScopeSync、integrationDetailSave及workspaceSettings。`node /tmp/dsh-skill-sidebar-check.cjs`解析5段脚本及7份JSON，核对创建／上传两态左栏tablist、data-single=false、两项按钮位于内容列之前且无顶部页签，已有技能及市场仍单栏；路径取代来源名称、完整title、只读选项禁用及保存拒绝、自定义可写位置保存来源ID、范围切换可用位置和默认设置路径通过。原独立草稿、上传读取边界、双向范围多选、标签、MCP及市场回归通过。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，构建报告客户端1298190字符；生成CSS括号1963对、宽度媒体查询残留0、workbase容器查询74处、温暖主题保留。日志为`/tmp/dsh-skill-sidebar-{check,typecheck,test,build,css}.log`。

**遗留**：仅主HTML原型及文档，安装位置仍为浏览器演示，不执行真实目录写入或技能安装；未进行浏览器视觉及真实宿主验收，未安装、重启或发布。

### 2026-11-20 · 技能与MCP共用双向互斥范围多选

**背景**：用户要求MCP全局已选时仍能直接选择项目并清除全局，同时将技能应用范围改为相同逻辑，移除独立应用项目字段。

**决策**：抽出integrationRangeScopeSelect／Sync供技能和MCP共用，单个下拉包含全局和项目，全局及有效项目始终可选；用本次选择前的scope判断新选全局或新选项目，分别清空项目或全局，项目仍可多选。技能创建／上传／市场安装／编辑均移除应用项目行，范围与来源保持同排；来源随范围同步，标签及+N复用已有尺寸。隐藏scope与projectIds继续保存草稿，不另建记录或改变宿主契约；选全局立即清空项目选择草稿，已有保存记录在提交前保持不变。

**证据**：`docs/ui/ui-directions.html`的integrationRangeScopeSelect／Sync、integrationSkillScopeSelect／Sync与refreshProjectSelection。`node /tmp/dsh-range-check.cjs`解析5段脚本与7份JSON，核对技能及MCP实际共用菜单在全局后直接点击／方向键选项目、选全局清空项目、多项目选择、空选门禁、技能保存来源同步及草稿恢复；创建／编辑／上传／导入多项目持久化、身份／安装时间保持、保存失败回滚、来源与市场数据源、MCP左栏及框内标签回归通过，技能范围输出无独立应用项目字段。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过；构建报告客户端1298190字符，生成CSS括号1963对、宽度媒体查询残留0、workbase容器查询74处、温暖主题保留。日志为`/tmp/dsh-range-{check,typecheck,test,build,css}.log`。

**遗留**：仅主HTML原型与文档，未连接真实宿主或执行技能安装及MCP连接；未进行浏览器视觉验收，未安装、重启或发布。

### 2026-11-20 · MCP作用域支持全局互斥的项目多选

**背景**：用户要求MCP作用域支持多个项目，选全局时不能选择项目，已有项目后选择全局须清空项目。

**决策**：创建、编辑、市场配置和导入共用一个作用域多选下拉；全局立即清空项目并禁用项目选项，取消全局后可多选。复用技能的框内项目标签及+N、共用菜单点击和键盘规则；菜单打开期间重新读取可选项，避免取消全局后键盘仍沿用旧禁用列表。浏览器连接数据统一scope与projectIds，旧单项目兼容迁移，项目列表按包含关系展示且全部连接不重复计数；身份及安装时间保持。空选及不可用项目阻止提交，添加连接／导入配置仍保留左栏与独立草稿。

**证据**：`docs/ui/ui-directions.html`的integrationMcpScopeSelect／Sync／FormTargets、integrationDetailSave、integrationImportPreview／Confirm、integrationRecords和openComposerPicker。`node /tmp/dsh-mcp-multiscope-check.cjs`提取实际函数，验证全局禁用与清空、取消全局启用、双项目创建／编辑／导入、空选／非法／归档门禁、草稿恢复、旧scope兼容、项目包含关系及计数、全局编辑及导入清空绑定、保存失败回滚；实际菜单点击同步aria-disabled，方向键可达新启用项目，End跳过禁用项。原技能、市场数据源、MCP左栏及上传回归通过。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，构建报告客户端1298190字符；生成CSS括号1963对、宽度媒体查询残留0、workbase容器查询74处，温暖主题保留。日志为`/tmp/dsh-mcp-multiscope-{check,typecheck,test,build,css}.log`。

**遗留**：仅主HTML原型及文档，未改宿主接口或执行实际MCP连接；未进行浏览器视觉或真实宿主验收，未安装、重启或发布。

### 2026-11-20 · 添加连接方式改用左侧菜单

**背景**：用户将添加连接／导入配置的方式导航位置改为左侧栏。

**决策**：仅addMcp使用既有integration-detail-nav，按钮及选中态共用详情导航，布局沿用200px／160px及650px以下横排响应式。两项导航放在内容列之前，技能添加仍使用顶部页签，已有MCP详情仍为单栏。添加页面跳过自动正文分区导航生成，切换继续调用原mcp-add-tab并保留独立草稿与过期读取保护。

**证据**：`docs/ui/ui-directions.html`的integrationFinishDetail生成两项左栏按钮、将addMcp排除单栏条件，并以`nav&&!adding`阻止混入正文分区。`node /tmp/dsh-sidebar-check.cjs`提取真实函数核对添加及导入两态的data-single=false、左栏tablist、按钮位于内容列之前、无顶部integration-add-tabs；原技能顶部页签、已有MCP单栏、草稿／上传及数据源回归同步通过。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，构建报告客户端1298094字符，未改样式生成逻辑或引入依赖；日志为`/tmp/dsh-sidebar-{check,typecheck,test,build}.log`。

**遗留**：仅主HTML原型与文档；沿用窄面板导航响应式，未进行浏览器／截图或真实宿主验收，未安装、重启或发布。

### 2026-11-20 · 技能市场添加数据源并收窄搜索框

**背景**：用户要求技能市场提供添加数据源按钮，技能来源与技能市场的搜索框不要撑满内容区，连接添加弹窗顶部改为添加连接／导入配置。

**决策**：技能市场搜索旁增加36px添加数据源按钮，打开共享单栏弹窗填写名称及目录URL，并可展开查看已有源。skillMarketSources与本地目录sources和MCP marketSources分离；名称及规范化地址去重，保存失败保留输入，原型不请求远端目录或伪造加载候选。两页工具栏通过data-compact-search使用340px上限，窄面板自然收缩或换行；不改其余管理页搜索宽度。连接顶部显示添加连接／导入配置，内部create键、两份草稿与认证流程保持。

**证据**：`docs/ui/ui-directions.html`的integrationSeed、integrationPanel、integrationDetailRender／Save／FinishDetail及bindIntegrations。`node /tmp/dsh-market-check.cjs`解析5段脚本与7份JSON，核对按钮接线、单栏表单、空名称／重复名称与地址／无效URL门禁、独立保存及回读、保存失败保留输入、编辑身份保持、已配置源列表、两页340px上限与其他页不变；原有技能、MCP、上传及项目标签回归同步通过。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，构建报告客户端1298094字符，比上一轮增加131字符；生成CSS括号配平、宽度媒体查询残留0、workbase容器查询74处，温暖主题及340px搜索规则保留。日志为`/tmp/dsh-market-{check,typecheck,test,build}.log`，无新增运行时依赖。

**遗留**：本轮仅主HTML原型及文档，数据源配置只保存浏览器，不接真实目录或宿主服务；按prototype-craft约定未浏览器／截图验收，未安装、重启或发布。

### 2026-11-20 · MCP菜单与弹窗对齐技能交互

**背景**：用户要求将MCP各菜单与弹窗内容对齐已经调整过的技能交互，既有MCP仍有启停分组、市场分类栏、分区侧栏及独立导入导出菜单。

**决策**：菜单改为我的连接／市场来源／MCP市场，连接按全局与项目分组、启用在前并按安装时间倒序；保留MCP单项目scope，不扩大为技能多项目契约。所有MCP详情复用单栏，市场卡片直接进入配置表单；连接摘要放标题下，导出与异常重连／授权沿用技能辅助文字动作，底部保留编辑及原移除入口。添加连接用创建／导入顶部页签及独立草稿，JSON文件与粘贴自动预览，重复保留原记录；文件2 MB上限、更晚选择／切换／关闭丢弃过期结果。市场来源复用技能来源的非详情卡片及原位改名，URL不随改名改变。

**证据**：`docs/ui/ui-directions.html`的integrationMenus／Groups／Records／DetailRender／FinishDetail、integrationMcpAddTab、integrationReadMcpFile、integrationConnectionExport及integrationSourceFinish。`node .agents/worktrees/mcp-check.cjs`解析5段脚本、7份JSON，提取真实函数核对MCP三个菜单、范围分组与排序、五类详情单栏、双页签、市场预填配置、摘要操作、创建／编辑／OAuth身份与安装时间保持、草稿独立、导入去重与超时默认值、无效JSON／地址、文件大小及迟到读取、来源取消／保存失败回滚；技能与项目标签旧回归同步通过。`npm run typecheck`、`npm test`（320/320）及最终`npm run build`通过，构建报告客户端1297963字符；生成CSS括号配平、宽度媒体查询残留0、workbase容器查询74处、温暖主题保留。完整日志为`/tmp/dsh-mcp-{check,typecheck,test,build}.log`，验证脚本位于被忽略的临时目录。

**遗留**：仅主HTML原型与文档；没有接入正式React技能／MCP管理及真实MCP服务。按本轮prototype-craft约定未进行浏览器／截图验收，静态DOM桩不代表真实像素或宿主行为验收；未安装、重启或发布。

### 2026-11-20 · 添加技能同步单栏并将项目标签收进选择框

**背景**：用户要求将市场添加弹窗的布局优化同步到添加技能入口，并把已选项目显示在选择框内，超出区域的项目以+N表示。

**决策**：创建／上传方式从左栏改为顶部settings-subtabs，内容沿用data-single及既有留白；创建与编辑共用市场的名称／说明、范围／来源两排列，项目选择和正文占整行。项目名称复用rules-project-tag放进40px主题下拉，不在框下重复展示。用真实内容宽度、标签宽度及数字标签宽度计算可见项，剩余显示+N，完整名称保留title与aria-label；选择变化、字体就绪及ResizeObserver分别触发测量，按选择签名避免重复绑定重建，控件移除后断开观察。选中数据、草稿和多选菜单逻辑保持原契约。

**证据**：`docs/ui/ui-directions.html`的integrationDetailRender／FinishDetail、integrationSkillScopeSelect／Sync、projectSelectionVisibleCount、measureProjectSelection、refreshProjectSelection与cleanupProjectSelectionObservers。`node /tmp/dsh-skill-check.cjs`解析五个脚本与七份JSON，核对创建字段排序、顶部页签与单栏；提取真实函数并使用宽度桩验证10项选择在246px区域显示4项及+6、130px显示1项及+9、536px显示全部，以及选择变化、空值、完整读屏、重复绑定不重建和卸载清理。`npm run build`、`npm run typecheck`及`npm test`（320/320）通过，客户端1297963字符；生成CSS括号配平、宽度媒体查询残留0、workbase容器查询74处、温暖主题与标签hidden规则保留。日志在`/tmp/dsh-project-chips-{check,typecheck,test,build}.log`。

**遗留**：仅原型与文档，未接正式React技能页或真实目录能力；按prototype-craft约定未浏览器／截图验收，宽度桩结果不代表真实像素验收。不安装、重启或发布。

### 2026-11-20 · 技能市场添加弹窗改为全宽表单

**背景**：用户提供市场添加截图，要求移除左侧基本设置／技能正文导航并优化内容排布；已有单栏条件仅覆盖受管技能，遗漏skill-market。

**决策**：将市场添加纳入既有data-single布局，复用内容留白及650px单列断点。名称／说明和范围／来源各自同排，项目多选／标签与正文占整行；通过范围字段的可选配对插槽调整市场表单顺序，创建／上传和既有编辑顺序保留。市场候选不呈现已安装状态摘要或导出，底部统一取消／添加技能，预填、范围门禁、默认配置和保存仍走原流程。

**证据**：`docs/ui/ui-directions.html`的integrationSkillScopeSelect、integrationDetailRender与integrationFinishDetail。`node /tmp/dsh-skill-check.cjs`静态解析五个脚本及七份JSON，提取真实函数核对市场预填、字段顺序、取消／添加操作、read／edit两态无导航／状态摘要／导出且保留顶部返回／关闭，并回归原技能和扩展配置流程。`npm run typecheck`、`npm test`（320/320）及`npm run build`通过，客户端1297575字符；日志在`/tmp/dsh-market-{check,typecheck,test,build}.log`。

**遗留**：仅调整原型与需求、UI规范、开发日志；按用户指定prototype-craft技能未进行浏览器或截图验收，不安装、重启或接入真实技能服务。

### 2026-11-20 · 新增扩展配置并移除技能分类字段

**背景**：用户要求添加技能与MCP扩展配置，并删除没有使用场景的技能分类字段。

**决策**：在设置的项目配置后加入扩展配置，复用技能／MCP二级页签和统一保存。技能默认全局来源仅列可写目录，新增启用策略作用于创建、市场安装及上传，JSON显式状态优先；停用中转位置展示示例和原型反馈，实际宿主位置待接入确定。MCP默认注入方式、整数秒超时及重连接入新增与导入，同时允许单连接覆盖；已有记录按自身值保留，旧连接缺失字段补历史默认值，导出带回这些非敏感字段。技能分类从表单、新增保存、卡片摘要和生效判断移除，旧数据不清理；RSS分组及MCP市场分类保留。

**证据**：`docs/ui/ui-directions.html`的defaultExtensionConfig／extensionConfig、integrationDefaultSkillSource／ConnectionDefaults、workspaceSettings／saveWorkspaceSettings、integrationDetailRender／Save、integrationImportPreview及selectExtensionSettingsTab。`node /tmp/dsh-skill-check.cjs`通过五个脚本与七份JSON解析，核对只读／缺失来源回退、技能创建与既有启用状态保留、分类不阻止生效、导入显式值优先、MCP新旧默认值、超时门禁、保存失败配置回滚与草稿保留，以及设置模板的唯一ID和ARIA关联。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1297575字符。curl下载现有63644端口预览后cmp与真源一致；完整日志在`/tmp/dsh-extension-{check,typecheck,test,build}.log`。

**遗留**：只修改原型及需求、UI规范、开发日志；正式React扩展配置、技能目录移动和MCP生命周期仍未接入。未进行浏览器视觉验收、安装、重启或发布，示例目录不代表实际存在。

### 2026-11-20 · 技能应用范围互斥并支持项目多选

**背景**：用户确认技能仅选择全局或指定项目，指定项目可同时应用于多个项目，要求按此方案修改交互。

**决策**：创建、上传、市场安装及编辑共用应用范围字段与项目多选；多选复用普通主题下拉及共用选项菜单，选择后保持展开，标签复用项目规则。一条技能使用scope与projectIds记录统一正文及启停，旧单项目标识兼容迁移，保留ID、安装时间和原启用状态。项目列表按包含关系筛选，全部项目不重复计数；详情摘要显示范围与项目名称。全局隐藏项目选择但保留未提交草稿，保存全局时清空生效绑定；指定项目校验至少一个可用非归档项目。范围切换只更新同一演示记录，同名新增拒绝、上传跳过，已有同名数据不自动合并。MCP继续使用单项目作用域。

**证据**：`docs/ui/ui-directions.html`的integrationSkillProjectIds／ScopeName／Targets／FormTargets／ScopeSelect／ScopeSync、integrationRecords、integrationDetailSave、integrationImportPreview／Confirm及openComposerPicker。`node /tmp/dsh-skill-check.cjs`通过五个脚本及七份JSON解析，核对旧范围读取、全局／多项目保存与切换、全局隐藏并保留项目草稿、来源随范围切换、多选减少绑定、项目分组去重、空／归档／失效项目门禁、同名拒绝、保存失败回滚、JSON上传多项目与既有技能交互。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1297575字符；curl后cmp确认现有预览与真源一致。完整日志在`/tmp/dsh-skill-{check,typecheck,test,build}.log`。

**遗留**：仅原型与文档；真实多项目安装、正文同步、范围迁移事务和停用中转目录仍未接入，不宣称Agent生效或文件已移动。未进行浏览器视觉验收、安装或重启。

### 2026-11-20 · 技能来源直接选择目录并在卡片原位改名

**背景**：用户要求添加路径直接选择目录、选择后显示卡片并定位名称编辑，来源卡片不进入详情，悬停显示编辑图标，名称下展示路径。

**决策**：复用现有示例目录选择菜单，选择后立即保存来源并清空搜索以定位新卡片，默认目录名、同名附简短编号，同路径只定位已有记录。来源卡片移除整卡链接覆盖层及悬停阴影，保留启停开关；名称使用原位40px输入，Enter／失焦保存、Esc取消，中文输入法确认不提交，空名称、超过80字符或同名就地提示。草稿单独保留，失败及启停重绘不丢输入；重命名只改显示名称，保留路径、身份、可写策略与启停。路径沿用12px辅助文字及完整值悬停提示。

**证据**：`docs/ui/ui-directions.html`的integrationSourceTitle／Rename／NameError／Finish／Add、integrationRow、openDemoDirectoryPicker及目录选择事件。`node /tmp/dsh-skill-check.cjs`核对来源卡片无详情入口、路径展示、目录新增／去重、同名编号、名称校验／保存／取消、存储失败回滚及草稿保留，并继续通过五个脚本、七份JSON和原有技能交互逻辑检查。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1297575字符；curl后cmp确认现有预览与真源一致。完整验证日志位于`/tmp/dsh-skill-{check,typecheck,test,build}.log`。

**遗留**：仅HTML原型和文档更新，目录选择为示例，不读取或写入本机技能目录；真实宿主目录选择、realpath去重和正式组件尚未接入，未做浏览器视觉验收、安装或重启。

### 2026-11-20 · 技能导航仅保留四项并移除回收站菜单

**背景**：用户确认当前回收站缺少使用场景，要求技能页仅保留全局技能、项目技能、技能来源和技能市场。

**决策**：从integrationMenus.skills移除回收站入口，同步PRD、UI规范及当前实现描述；保留历史回收记录兼容，不扩大为数据清理。创建／上传与详情单技能导出沿用已确认交互。

**证据**：`docs/ui/ui-directions.html:1843`定义精确四项导航；`node /tmp/dsh-skill-check.cjs`核对菜单名称与顺序，并通过五个脚本、七份JSON解析及既有技能交互逻辑检查。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1296192字符；curl读取`http://127.0.0.1:63644/ui-directions.html`后用cmp确认预览与真源一致。验证完整输出在`/tmp/dsh-skill-{check,typecheck,test,build}.log`。

**遗留**：本轮仅更新HTML原型与文档，未接入真实技能管理或修改宿主数据；未进行浏览器视觉验收、安装或重启。

### 2026-11-20 · 技能摘要复用待办小字并将单项导出收至详情

**背景**：用户要求技能详情header下方状态和作用域与待办详情小字保持一致，并授权判断回收站、导入导出菜单和批量导出的必要性。

**决策**：直接复用todo-detail-summary与todo-detail-meta，把状态／作用域固定在header下方，上16px、左右24px（窄面板18px）、12px／20px、13px图标，移除重复技能名与摘要横线；正文同步对齐。保留回收站作为恢复入口，上传已承担导入，移除技能导入导出菜单，单技能分享用摘要右侧12px「导出技能」，底栏仍仅编辑；批量迁移没有本轮明确场景，不增加独立批量导出UI。导出.md含name／description头部和正文，不打包关联文件，JSON引号及换行由受限文本解析往返，不执行YAML表达式。

**证据**：`docs/ui/ui-directions.html`的integrationMenus、integrationFinishDetail、integrationSkillMarkdown、integrationSkillField与integrationExportSkill；`node /tmp/dsh-skill-check.cjs`完成五个脚本与七份JSON解析，核对摘要位置、菜单保留／移除、单技能下载且详情身份不变，以及含引号／换行说明的导出上传往返。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1296192字符；curl下载预览页后用cmp确认与当前真源一致。临时验证脚本和输出保存在/tmp，不入仓库。

**遗留**：仍为HTML原型，无真实技能文件写入及宿主接线；未进行浏览器视觉验收、安装或重启。回收站恢复流程沿用原演示，批量导出未新增。

### 2026-11-20 · 精简技能列表详情并拆分创建与上传

**背景**：用户在当前预览中要求移除技能状态筛选，开启技能优先并按安装时间排序，详情去掉左侧分区与多余底栏按钮，添加技能改成创建／上传两个一级菜单。

**决策**：继续只改视觉真源。全局／项目列表按开关状态、安装时间降序排列，编辑和启停不重置安装时间；旧演示记录补确定性时间。技能详情及编辑单栏，查看底栏仅编辑技能，第三方只读与已回收记录禁用编辑并说明原因，回收站卡片仍可恢复。创建与上传分别保存草稿，上传.md／.json后自动解析与同名去重，作用域变化重新预览；文件读取使用递增标识与详情身份判定，阻止过期读取覆盖后续选择，读取中禁用上传、失败保留原内容。文件名用textContent，正文转义后预览；不接入本机技能写入或宿主提供器。

**证据**：`docs/ui/ui-directions.html`的`integrationRecords`、`integrationFinishDetail`、`integrationSkillAddTab`、`integrationReadSkillFile`及创建／导入确认时间字段。`node /tmp/dsh-skill-check.cjs`解析五个执行脚本与七份JSON，并核对排序、单栏、双菜单、Markdown／JSON解析、同名跳过、安装时间、过期读取与失败保留；临时脚本不入仓库。`npm run typecheck`、`npm test`（320/320）、`npm run build`通过，客户端1295712字符。共用规格与需求同步到UI-DESIGN第0节、PRD第10节。

**遗留**：仅HTML原型及生成样式，正式插件仍为原四卡，真实技能目录、技能提供器与生效策略未接入；未进行浏览器视觉验收、安装或重启宿主。

### 2026-11-20 · 安装并重启主题映射新版

**背景**：主题名称／顺序／默认值及跟随平台映射完成后，用户明确要求安装、重启。

**决策**：重新构建并打包当前1.0.4，核对当次包白名单及内容后，通过官方desktop CLI remove/add离线安装；重启前核对无桌面及宿主进程，使用系统open启动。无新增源码变化，不重复已通过的全量测试。

**证据**：构建与打包日志见`/tmp/wb-theme-install-{build.log,pack.json,pack.log}`；六项包内容与工作区一致，五类指定敏感模式无命中，见`/tmp/wb-theme-install-package-check.json`。包555662字节，SHA-256 `3a0c752b6c8f070917590f5588e715e9528bf56319c13b343c126cdf4ebb67b2`。官方remove/add退出0，日志见`/tmp/wb-theme-install-{remove,add}.log`；六项安装文件逐字节一致，客户端SHA-256 `d05410f4e38d4825918ab5d00eb54db8f4ffce33981f8a219f1983436a0b0f2c`。`/tmp/wb-theme-install-startup.json`记录桌面52730、宿主52789及其父进程52730，`lsof`确认127.0.0.1:51281监听，未认证GET `/`返回401。

**遗留**：安装日志保留既有pnpm配置及peer依赖提示，未修改或豁免。验证覆盖包内容、安装一致性和服务启动，不等于真实宿主主题视觉验收；未提交或发布。

### 2026-11-20 · 完善跟随平台主按钮及选中颜色继承

**背景**：跟随模式仅继承六类基础颜色，主按钮及选中仍使用内置值；缺少宿主令牌时深色背景回退为白色。用户批准分别映射宿主语义颜色及修正回退。

**决策**：主按钮使用button-primary-fill／label-primary-foreground／button-primary-hover，强调色独立引用state-business-primary；强调选中底色用state-business-tertiary、文字用label-primary，避免与底色相近的强调文字。焦点、控件线、开关及成功／危险分别接入官方令牌，缺失时复用当前明暗内置配色；未确认警告令牌不猜测。配色直接引用CSS变量，无新增监听或依赖。共享悬停、开关及通知规则修改视觉真源，原型映射与正式实现同步。

**证据**：官方令牌核对实际app.asar内`dsh-client-ui-theme/src/styles/design-platform.css`，按钮／开关用途对照SDK的`Button.module.css`与`Switch.module.css`。`test/theme.test.ts`新增两项回归先失败，证据为`/tmp/wb-follow-red.log`（按钮仍为#3566cf、深色背景#fff）；修复后4项主题测试通过，`npm run typecheck`、320项全量测试通过。`/tmp/wb-follow-prototype.log`记录5段脚本语法、明暗两种模式21项映射一致及切换独立主题清理覆盖；该检查也定位并统一原型深色muted回退。连续两次`npm run build`四项产物哈希一致，见`/tmp/wb-follow-hashes-{first,second}.txt`。客户端1295203字节，SHA-256 `d05410f4e38d4825918ab5d00eb54db8f4ffce33981f8a219f1983436a0b0f2c`。

**遗留**：本轮未安装、重启或执行浏览器视觉／真实宿主主题切换验收。不同平台皮肤对公开语义令牌的覆盖范围仍以各皮肤实际提供值为准。

### 2026-11-20 · 统一主题四字名称并默认柔和紫晶

**背景**：用户确定五个主题的新名称，要求独立配色按柔和紫晶、清新森林、暖纸阅读、经典湛蓝排序，默认柔和紫晶。

**决策**：保留跟随平台并置于末尾，仅更新展示名称、顺序和初始默认值，不重命名存储标识或迁移用户已保存的选择。正式客户端兜底与主／独立原型初始化、重置同步为violet，英文词典同步；主题令牌与明暗机制保持原行为。

**证据**：`npm run typecheck`、`npm test`（318项）及`npm run build`通过，日志为`/tmp/wb-theme-{typecheck,tests,build}.log`。React静态渲染核对五项顺序、violet选中，`stateSchema.parse`逐一验证五种已存主题标识；`node:vm.Script`编译主原型5段脚本，提取主themeChoices与独立DB.themes核对一致。实现见`src/client/Settings.tsx`、`src/client/Workbase.tsx`及`src/shared/model.ts`，视觉真源为`docs/ui/ui-directions.html`；客户端`wc -c lib/client.js`为1294261字节。

**遗留**：本轮未安装或重启宿主，静态检查不等于真实宿主视觉验收。跟随平台的既有宿主颜色继承范围没有扩展。

### 2026-11-20 · 按用户要求再次安装并重启已有会话版

**背景**：用户在已有会话门禁实现完成后再次明确要求安装并重启。

**决策**：重新构建当前源码、按当次包内容核查后正常退出，使用官方desktop CLI离线remove/add重装，再启动桌面。无源码变化，不重复全量测试。

**证据**：`npm run build`与`npm pack --ignore-scripts --pack-destination /tmp --json`成功；包554836字节，SHA-256 `491f8874d3bc921be9050bbbbfb265bf50d13303dabb8124086bf1ee57426961`，客户端SHA-256 `bee0d5d32fc830799a2b1de5429218531e65f748f60778f18b39662e36873a32`。六项白名单、内容与安装文件一致，指定敏感模式无命中。官方CLI remove/add成功，`ps`确认旧进程退出，新桌面42799／宿主42832存在；`lsof`确认127.0.0.1:59727监听，未认证GET `/`返回401。

**遗留**：本次验证范围是构建、打包、安装与服务启动，不代表真实右栏界面或工具交互已验收。未提交或发布。

### 2026-11-20 · 会话右上角调整为工作台与侧边栏顺序

**背景**：用户要求新会话和历史会话右上角的按钮位置互换，顺序为「工作台｜侧边栏」。

**决策**：仅调整styles.css宿主适配，保留公开常驻导航插槽和官方corner。标题行使用subgrid共享标题、工具、工作台、corner四列，明确排除contents插槽包装；分隔线改为工作台后的伪元素。标题局部容器承担原有宽度查询，标题行继续保留macOS控件预留。

**证据**：npm run typecheck、npm test（318项）、npm run build通过。使用已安装宿主conversation客户端CSS及正式styles.css进行Chrome隔离几何检查，360／768／1440px三种宽度的无绑定、空会话、历史会话共9组通过；有侧栏入口时两按钮边缘相距17px（8+1+8），同排等高28px，标题与页签无重叠。现有client-entry布局断言同步。

**遗留**：未安装或重启桌面，未验证真实宿主；隔离检查只覆盖官方标题结构及本次几何顺序。

### 2026-11-20 · 右栏仅复用已有可用会话并隐藏无会话入口

**背景**：用户认为打开工具时产生空会话不自然，最终确认无可用会话隐藏侧栏按钮，有可用会话优先复用上次目标，否则最近会话。

**决策**：移除右栏connectWorkspace接线，禁止创建空会话；用官方列表成员、项目归属、全局归档集合、header.cwd与workingDirectory筛选已有会话，不限制blank。未打开会话只通过官方refreshProjections检查，不启动迁移、不持有引用；点击后才retain并再验证。上次目标只保存在当前插件生命周期内并重新核验。会话新增、归档、删除与目录变化重算入口，失效目标收起，其他候选不自动打开。沿用官方右栏与后台Tab资源，未自建项目工具栏。

**证据**：`test/project-sidebar.test.ts`新增无候选、上次／最近选择、官方成员与有效目录筛选、等待期间失效、后台Tab资源及投影检查合并回归；旧实现先出现无candidates、缺少uiWorkspace无法安装的失败（`/tmp/sidebar-existing-red.log`）。`test/project-sidebar-entry.test.ts`覆盖无会话隐藏按钮与分隔符、首次新增后显示及删除后再隐藏；正式main接线断言点击后connectWorkspace调用仍为0。`npm run typecheck && npm test && npm run build`通过318项；再构建一次四项哈希一致。主原型脚本经Node vm语法检查，并执行入口的无会话／新增／归档／目录不符／空场景／主页判据验证。包大小、摘要与门禁见当前状态；官方CLI离线remove/add安装成功，旧宿主退出后正常重启。

**遗留**：未知、迁移必需或失败的有效目录不显示入口；只读检查完成且目录匹配后才出现。上次目标不跨客户端重载保存。安装六项文件与工作区一致，重启桌面41259、宿主41304，实际监听127.0.0.1:57796，未认证GET `/`返回401；这仅证明服务响应，真实宿主界面、Git、文件及终端交互未验收。

### 2026-11-20 · 修复详情header右栏入口被隐藏

**背景**：安装延后连接版后，用户反馈进入项目详情没有显示侧边栏按钮。

**决策**：不放宽能力门禁。官方children只能有一个存活声明所有者，重复注册既会失败，直接删children又失去Tab渲染授权；因此保留官方Root注册及注入，仅可逆适配公开component内的前台／视图读取。添加不胜出席位触发官方renderer重新读取，卸载恢复组件；mounted兼容读桥及点击后连接沿用。接线测试使用官方SlotCore代替未实现声明校验的宽松替身。

**证据**：`docs/ui/verification/harness-source/index.ts:236-243`记录官方Root拥有`rightbar.session`；实际宿主`dsh/docs/subsystems/slots.zh.md`的“声明与生命周期”规定唯一存活owner。`node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js:191-194`拒绝重复children。`npx tsx --test test/project-sidebar-entry.test.ts`在修复前断言available为true时实得false（`/tmp/sidebar-red.log`），修复后通过。`npm run typecheck && npm test && npm run build`通过313项，第二次构建四项产物SHA-256一致；客户端大小与摘要见当前状态。`npm pack --ignore-scripts --pack-destination /tmp --json`包六项白名单一致且指定敏感模式无命中；官方desktop CLI remove/add离线安装成功，安装六项一致；正常退出后`open -a "DeepSeek Harness"`启动桌面30770与宿主30807。

**遗留**：可写公开component仍是rc.5兼容适配，不等于官方提供项目目标注册能力；升级优先替换为等价接口。宿主30807本次实际监听127.0.0.1:50066（重启后端口变化），未认证GET `/`返回401，仅确认服务响应；测试与文件一致性不证明真实界面、Git、文件及终端交互已验收。

### 2026-11-20 · 安装延后连接版并重启桌面

**背景**：用户要求安装并重启已完成的“点击右栏入口后再连接会话”代码。

**决策**：重新构建本地1.0.4包并核对当前包内容，经应用自带CLI对desktop profile正常卸载／离线重装；先正常退出应用并等待全部宿主进程停止，再安装及重新启动。保留既有内部插件的版本限制，不添加豁免、不修改其他插件。原安装包另存`/tmp/dsh-workbase-before-sidebar.tgz`。

**证据**：`npm run build`及`npm pack --ignore-scripts --pack-destination /tmp --json`退出0，新包554208字节，SHA-256 `56afe8d9d7c7b86c668e651f9c5f0de207d1cd540b40d29fe10908a8905cbe7b`；tar白名单为LICENSE、README.md、cordis.patch.yml、dist/index.js、lib/client.js、package.json，六项与工作区Buffer核对一致，指定敏感模式无命中。`osascript -e 'tell application "DeepSeek Harness" to quit'`成功后等待ps确认旧桌面61223及宿主61299退出。应用自带`dsh plugin --profile desktop remove dsh-workbase`及`add /tmp/dsh-workbase-1.0.4.tgz --offline`退出0，profile登记及安装六项文件一致。重启后ps确认桌面26988与宿主27069，lsof确认127.0.0.1:63450监听，未认证GET `/`返回401。

**遗留**：启动与文件一致性验证不证明真实右栏视觉、Git、文件及终端交互已验收。既有内部插件（0.0.1）与rc.5不兼容提示仍在，未修改其配置。未追加全量测试、操控界面、提交或发布；此前313项测试及构建验证见下条。

### 2026-11-20 · 右栏仅在点击入口后连接会话

**背景**：用户关注只进入项目详情就产生空白会话的问题，明确要求改为点击右栏入口后才连接。

**决策**：`select`与`setAvailable`只登记项目及能力，不调用连接；`open`作为用户点击入口，负责连接、重复点击保护和失败重试。未连接时渲染同尺寸可点击Button，成功后官方入口消费待展开意图，直接展开，无需二次点击。每次入口挂载用引用去重，避免重复效果将刚展开的右栏再次收起；离开详情及切换项目使迟到连接失效。保留官方空白会话复用策略，不自动删除已经创建的会话。

**证据**：`src/client/project-sidebar.ts:224`为点击连接入口，`:231`在目录目标有效时调用展开回调；`src/client/ProjectSidebar.tsx:174-177`将等待禁用状态及点击事件接入控制器。`test/project-sidebar.test.ts`覆盖非点击路径不连接和取消；`test/project-sidebar-entry.test.ts`覆盖入口状态、失败重试与重复挂载效果。先运行更新的测试确认旧实现会自动连接、重复效果会收起，再修改实现。`npm run typecheck && npm test && npm run build`通过313项；再构建一次，客户端SHA-256均为`7b416eae733ac28e745bf15b6450bac07fc83c5b75a447aeab74b458e9d699c5`，完整产物1291190字节。

**遗留**：官方连接不可取消，点击后在连接期间退出可能仍由宿主创建空白会话，但迟到结果不挂载或展开。此次验证为本机源码／替身测试，未安装、重启或操作桌面，真实宿主交互尚未验收。

### 2026-11-20 · 项目详情复用官方目录会话和完整右栏

**背景**：用户要求正式实现，只在项目详情显示右栏入口，Git、工作区文件、终端等绑定当前项目目录，并要求直接核对桌面源码，不操控电脑。

**决策**：沿官方`uiWorkspace.connectWorkspace`选择／复用或由官方创建项目空白会话；详情无输入卡，使用独立引用且不借用主页草稿。复用官方Root、ExpandButton、共享Store及Tab树。rc.5没有项目目标注册接口，兼容层仅合成公开mounted读方法并在Root投影前台面板；不改私有状态、全局Session选择或Agent工作目录。升级时优先改用官方等价注册能力。header.cwd与有效目录均须匹配项目，已有终端保留原进程及Tab引用；不因失败自行创建替代会话。

**证据**：只读解析桌面安装包中的`dsh-client-ui-workspace/src/client/navigation.ts`，`connectWorkspace`经`connectBlank/createInWorkspace`筛选成员中同目录、未归档的空白会话并合并同项目并发连接；`openSession/replaceMain`保留新mainView引用后替换选择及释放旧引用。正式接线见`src/client/entry.tsx:64-73`、`src/client/project-sidebar.ts:36-81`和`src/client/ProjectSidebar.tsx:74`。`npm run typecheck && npm test && npm run build`通过310项；再构建一次，客户端SHA-256均为`b732186abdf31eb22ca4f2414764e5a12b32662b3565c9fcd926398bf65a5459`。入口与生命周期测试见`test/project-sidebar*.test.ts`、`test/client-entry.test.ts`，尺寸和容器不变量见`test/prototype-css.test.ts`。

**遗留**：本机验证使用官方契约替身，未安装、重启、操控桌面或进行浏览器视觉／真实宿主验收。前台读方法合成是兼容适配，不是宿主公开的项目注册API；宿主契约不匹配或观察源不可写时隐藏入口。真实快捷键、文件读写、Git及终端交互仍需实际宿主验收。

### 2026-11-20 · 补齐二级菜单名称并取消规则代码块标题吸顶

**背景**：用户指出二级菜单未更新，规则预览里的`text`与复制栏滚动后仍贴在输入框顶端。截图显示的是代码块标题，不是Markdown章节标题。

**决策**：菜单统一为「全局设置／初始化设置／项目规则」，同步原型、说明、路径与英文词典。实际宿主CSS的`_bannerWrap_kjs70_24`为`position:sticky;top:0;z-index:6`；沿用宿主compact预览的公开banner标记选择方式，在规则预览内改为static／auto，避免依赖哈希类名。点击复制按钮及链接时保留默认行为，键盘事件只在预览根触发原文编辑；共享编辑器覆盖全局、提交与项目规则。

**证据**：新增／更新的3项断言先失败，再随修复通过。`npm run typecheck`、`npm test`298项与`npm run build`通过；连续构建四项产物哈希一致，客户端1277130字节，SHA-256 `3e2cf7e0560d918ba2712f87833764b05bf6248d326d54714d51fad8c441a38f`，服务端哈希未变。`node /tmp/wb-init-browser/menu-header-check.mjs`从当前app.asar加载实际宿主CSS，1组移除覆盖的基线可复现吸顶、8组宽窄／中英文／明暗修复验证通过；全局与提交框滚动100px时标题上移100px，复制鼠标／Enter／Space与链接不进入编辑，框外仍sticky，页面错误0。结果与quality82 WebP在同目录；`commit-md-check.mjs`8组保存回归通过。原型12段script经vm语法检查，CSS74处容器查询、宽度media为0、括号配平及温暖主题保留。

**遗留**：本轮尚未安装或重启。浏览器使用真实宿主CSS和代表性的Markdown DOM，未直接运行用户profile中的官方Markdown渲染，不宣称真实模型或宿主整体验收。未提交或发布。

### 2026-11-20 · 安装提交规则Markdown版并重启

**背景**：用户要求安装并重启，使用已验证的共用Markdown编辑器与简化提交规则界面。

**决策**：先构建打包并核对当次内容，正常退出桌面、确认宿主退出后通过官方CLI同版本remove/add离线重装；不修改其他插件兼容豁免。

**证据**：`npm run build`、`npm pack --ignore-scripts --pack-destination /tmp --json`成功，包550733字节，SHA-256 `e8a7b9561540777ddccc6cad40cae0ec2665841b1b6c42723a491968521a93d9`；tar六项白名单与工作区逐字节一致，私钥／令牌／邮箱／内部域名／本机路径模式无命中。osascript正常退出后pgrep无桌面或宿主进程。应用自带`dsh plugin --profile desktop remove dsh-workbase`及`add /tmp/dsh-workbase-1.0.4.tgz --offline`退出0，实际安装六项Buffer核对一致。`open -a "DeepSeek Harness"`后桌面61223、宿主61299，lsof确认127.0.0.1:53617监听。

**遗留**：本轮未操作真实规则正文或验收模型读取；既有内部插件（0.0.1）与rc.5不兼容提示保留，无豁免或修改；未提交或发布。

### 2026-11-20 · 提交规则复用全局Markdown编辑器

**背景**：用户要求提交规则输入与全局规则一致并支持Markdown。

**决策**：复用`RulesEditor`而非复制预览逻辑，扩展最大字数、隐藏标题、校验错误及保存提示参数；全局／项目默认行为保留，提交规则使用10000字符、176px、无可见标题及明确的整页保存提示。宿主Markdown能力缺失时沿用安全纯文本，不新增解析依赖。原型编辑器同步参数、隐藏标题与计数判空，提交规则组合输入结束不提交运行规则。

**证据**：设置渲染及交互断言先失败再通过，`npm run typecheck`、`npm test`296项通过；连续两次构建四项SHA-256一致，完整客户端1276675字节，SHA-256 `9ba0ecfb47c54b379ddb322d217204f1a233f8aa9df61609cc410b08562340e0`，服务端未变。五段原型脚本通过vm解析，CSS74处容器查询、宽度media为0、括号配平、温暖主题保留。`node /tmp/wb-init-browser/commit-md-check.mjs`通过1100／360px×中英文×明暗8组，核对宿主回调预览、点击／Enter编辑、失焦／Escape预览、显隐与草稿、空白校验及保存失败／重试；与全局同为176px、14px字号、9px／12px内边距和7px圆角，页面错误0。数据及quality82 WebP在同目录。

**遗留**：浏览器使用模拟API和Markdown回调，真实宿主预览与模型读取未再次验收；未安装、重启、提交或发布。

### 2026-11-20 · 直接核对桌面源码并区分会话引用与右栏目标

**背景**：用户明确要求不操控电脑，直接看Harness桌面源码；截图中的未发送新会话也有官方右栏入口，需要纠正此前把未发送视为没有Session、把缺源码仓库视为阻碍的表述。

**决策**：只读解析已安装rc.5归档，复核官方按钮、Root、Controller及工作台输入卡；确认输入卡已有官方预备引用，可作为以后项目右栏的共享目标，不额外创建会话。当前不添加不可工作的正式按钮：右栏选中目标和Root显隐均排除全局面板；内部指定会话的Tab操作也不替代前台目标注册。

**证据**：官方源码提取到被忽略的`docs/ui/verification/harness-source/`，8个文件与归档内容逐字节核对，`manifest.json`保存大小与SHA-256；根包版本`0.2.2-rc.5`、构建提交`3f85d888b1297107937d9bd5b853f7e733e179a4`。其中`index.ts:118–124`从`uiSession.adapter.current`选View，`:168–181`仅在`activePanelId === null`调用`show(selected?.sessionId)`；`shell/RightbarRoot.tsx:34–38`使用相同显隐条件。`service.ts:403–419`的`openResourceIn`／`openTabIn`标注不属于`ISidebarRight`，`:854–863`写动作要求已挂载前台目标。工作台`src/client/NativeComposer.tsx:336–346`已有`prepareNativeComposer`引用，`src/client/entry.tsx:402–413`仍作为独立主面板注册。

**遗留**：正式项目内右栏尚未接入，缺公开目标注册能力；源码核对只针对该安装版本，不推断后续版本。此轮只修改说明及生成源码证据，未修改运行时代码、操作应用、安装或重启；没有真实宿主验收。

### 2026-11-20 · 提交规则开启后直接编辑正文

**背景**：用户确认提交规则留在初始化，并要求去掉折叠、重复正文标题及恢复默认操作，简化文案和交互。

**决策**：使用普通div替换details，只保留「生成提交规则」开关、现有说明和正文输入；移除恢复按钮的默认常量导入、原型监听及两条专用死样式。内容继续由既有初始化草稿状态持有，关闭隐藏而不清空，初始默认模板与服务端生成契约不变；保留aria-label、错误关联、10000字符限制与整页保存。

**证据**：`test/settings-render.test.ts`及`test/ui-interaction.test.ts`的旧折叠／恢复断言改为直接编辑与显隐，先确认失败再实现，通过15项针对性及296项全量测试；`npm run typecheck`通过。两次`npm run build`四个产物SHA-256一致，完整客户端1276176字节、SHA-256 `02bf42aae7e71698006ddebdfcc18034d996b4bc74a4ac80157ca2f22eb99d31`；服务端未变。`node /tmp/wb-init-browser/commit-ui-check.mjs`通过1100／360px×中英文×明暗8组，验证直接可编辑、无折叠／重复标题／恢复操作、子项及父项显隐保留草稿、跨页保留、空白拦截、保存失败后重试、保存后重新打开恢复内容；14px、7px圆角，无横向溢出，页面错误0，数据和quality82 WebP在同目录。

**遗留**：浏览器使用模拟宿主API，本次未再次操作真实项目文件或验证模型读取；未重装宿主、提交或发布。

### 2026-11-19 · 核对官方右栏按钮并确认项目挂载缺口

**背景**：用户认可项目详情入口置于顶栏最右，并要求按钮样式与Harness官方一致。
**决策**：独立原型沿用官方紧凑按钮及图标，移除紫色描边与选中态；桌面展开后入口隐藏、移动设备保留占位。正式接入等待公开项目挂载能力，避免镜像按钮但右栏不可用。
**证据**：只读解析`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`，读取包`dsh-client-ui-sidebar-right`的`src/client/index.ts`、`shell/ExpandButton.tsx`、`shell/ExpandButton.module.css`及`shell/RightbarRoot.tsx`。前者`sync()`在`activePanelId === null`时才给`show`传Session；Root同样按该条件确定`visible`。按钮使用`Button size="sm"`、28px宽、15px镜像`IconPanelLeftOutlineRegular`及官方Tooltip。SDK的`lib/Button.module.css`核对H28、默认小圆角及ghost状态。`npm run typecheck`退出0，`npm test`296项通过，`npm run build`退出0（客户端1276606字符）；这些检查针对既有项目，不覆盖离线原型或真实右栏。
**遗留**：当时未继续核对工作台预备会话与控制器内部Tab路径，后续源码复核见2026-11-20条目；缺口是公开项目右栏目标注册契约，安装包中已有完整源码。原型仅静态检查，未进行浏览器或真实宿主验收，未安装／重启。

### 2026-11-19 · 安装输入修正版并重启宿主

**背景**：用户要求安装并重启，使用最新输入一致性、全局显隐与176px高度修正。

**决策**：构建后打包并核对当次内容，正常退出桌面后使用官方CLI同版本remove/add离线重装；安装逐文件核对后启动桌面，不修改其他插件兼容豁免。

**证据**：`npm run build`、`npm pack --ignore-scripts --pack-destination /tmp --json`成功，包550740字节，SHA-256 `8ebd14b993789c7a46554a85836c83d5fda0c56e3ab02f5b67720908f007f1b9`。tar六项白名单与工作区逐字节一致，私钥／令牌／邮箱／内部域名／本机路径模式无命中。osascript正常退出后pgrep无桌面或宿主；应用自带`dsh plugin --profile desktop remove dsh-workbase`及`add /tmp/dsh-workbase-1.0.4.tgz --offline`均退出0，安装目录六项Buffer核对一致。`open -a "DeepSeek Harness"`后桌面44267、宿主44300，lsof确认127.0.0.1:60861监听。

**遗留**：本次未操作真实规则正文或验证模型读取。官方CLI仍提示既有内部插件（0.0.1）与rc.5不兼容，保留启动拒绝，无豁免或修改；未提交或发布。

### 2026-11-19 · 修正规则输入一致性与全局正文显隐

**背景**：用户反馈规则输入未对齐插件、全局关闭仍显示正文且默认高度过高。

**决策**：共用正文编辑器使用普通表单UI字体与9px／12px内边距，外框使用共用焦点边框和淡色光圈，压制内层重复光圈；规则搜索同样修正。全局按开关卸载编辑器，草稿仍保留在设置状态，不因收起清空；默认176px与其他多行字段一致，项目详情保持较大的默认阅读高度。同步真源、UI规范和产品说明。

**证据**：新增停用隐藏／启用恢复草稿断言先失败后通过。`npm run typecheck`、`npm test`296项及两次构建通过，完整客户端1276784字节，两次SHA-256均为`c27b877b7c1a1e195ac68b0f46d47ddd922d568086771230c4a32b44ef1bf883`；服务端未变。CSS74处容器查询、宽度media为0、括号配平、温暖主题保留。`node /tmp/wb-init-browser/rules-fix-check.mjs`通过1100／360px×中英文×明暗8组检查：全局176px、开关后恢复草稿、UI字体与目录输入相同、14px及9px／12px内边距、正文与搜索内层无光圈，原自动保存／失败重试／关闭保护回归通过，页面错误0；数据及WebP在同一临时目录。

**遗留**：浏览器使用模拟宿主API，不证明真实模型读取；本次修正版尚未重新安装，上一条安装记录对应修正前产物。未提交或发布。

### 2026-11-19 · 安装规则正式版并重启桌面宿主

**背景**：用户要求安装并重启，将已确认的规则界面及独立保存代码用于当前桌面宿主。

**决策**：先构建后打包，正常退出桌面并确认宿主结束，再使用应用自带CLI同版本remove/add离线重装，避免同版本add跳过更新。逐文件核对实际安装内容后启动桌面，不修改其他插件的兼容豁免。

**证据**：`npm run build`与`npm pack --ignore-scripts --pack-destination /tmp --json`成功，包550707字节，SHA-256 `d58cf20307390bbfe39f8f4fec8cfca95fd0388fe62456f88c0fac30dd476d66`；tar六项白名单与工作区逐字节一致，私钥／令牌／邮箱／内部域名／本机路径模式无命中。`osascript -e 'tell application "DeepSeek Harness" to quit'`退出0，随后pgrep无桌面或宿主进程。`"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop remove dsh-workbase`与`add /tmp/dsh-workbase-1.0.4.tgz --offline`均退出0，安装目录六项Buffer核对全部一致。`open -a "DeepSeek Harness"`后桌面38628、宿主38660，`lsof -nP -iTCP -sTCP:LISTEN`确认127.0.0.1:55892；真实窗口可见规则名称／应用项目搜索、表格及单栏详情。`npm run host:check`退出2，报告0阻断、21模块无缺少方法，唯一待复核为缺少基线。

**遗留**：真实窗口确认新构建已加载，不等同于真实规则文件写入或模型读取验收。既有内部插件（0.0.1）与rc.5不兼容，保留官方启动拒绝，无风险豁免；未提交或发布。

### 2026-11-19 · 正式接入规则列表详情与独立自动保存

**背景**：用户确认列表、搜索和单栏详情后要求落实正式代码，并将全局规则置于全局配置首项、共用详情正文输入。旧实现仍为卡片、工具栏和整页保存，不能满足已确认交互。

**决策**：新增`rules-save`只提交规则，抽共享服务事务以保留旧设置兼容；未复用整页Settings自动保存，避免顺带保存主题、目录和初始化草稿。合法规则逐条合并到确认版本，单队列推进，响应不替换输入，失败必须显式重试。关闭先收尾，未保存则保留编辑并提供明确放弃。正文优先宿主Markdown，无能力时纯文本预览，避免新增解析依赖。嵌套Modal暂时禁用背景设置并隔离键盘焦点；宿主通用label适配排除规则名称及启用行，防止覆盖已确认横排布局。

**证据**：`npm run typecheck`、`npm test`295项通过，测试覆盖独立命令不改其他偏好、CAS拒绝、持久化回滚、IME暂停、请求中继续输入／删除、无效草稿隔离及搜索9组条件。连续两次`npm run build`后客户端SHA-256为`85afd9548d968edd1ac8b7e01d3802f548c5514c09b5fe2c771a5bec91568191`，服务端为`cd3699ce7fe28c9d1cac018275e0f50c4da9c423394b27c5cdd978c089230095`；生成CSS括号配平、74处容器查询、宽度型media为0。`node docs/ui/verification/rules-check.mjs`运行1100／360px×中英文×明暗8组正式组件，开关32px／横排、无溢出，搜索／返回／预览／失败重试／关闭放弃均通过，页面错误0；数据及WebP位于同目录。样式真源、主原型、README、PRD与UI第0节同步。

**遗留**：模拟宿主接口和Markdown回调只验证组件，真实文件事务另由临时文件测试覆盖；尚未安装此构建、重启真实宿主或验证模型读取。临时浏览器依赖仍使用既有`/tmp/wb-init-browser`，证据脚本不随仓库提交；源码目录无Git元数据，不提交或发布。

### 2026-11-19 · 规则详情状态移至标题栏分隔线下方

**背景**：用户通过截图要求header状态小字显示在横线下方。

**决策**：状态与重试放入正文顶部独立行，与编辑字段使用同一1040px内容列；动态编辑区仍为独立节点，不重建状态节点。标题栏仅保留返回、规则名称与关闭，采用共享72px／60px高度；状态随内容滚动。

**证据**：`demo-source-project-rules`中的`.detail-status-row`、`rules-detail-status`和`rules-detail-retry`为入口。Node核对标题栏、线下状态顺序、独立编辑节点、32个唯一ID引用及脚本语法通过；`npm run typecheck`、`npm test`（288通过）与一次`npm run build`通过，四项生成文件SHA-256构建前后相同。测试摘要在`/tmp/workbase-rules-list-tests.log`。

**遗留**：仅隔离原型，未修改正式组件；未执行浏览器视觉验收。

### 2026-11-19 · 项目配置大标题与规则数量表头精简

**背景**：用户通过截图要求大标题仍为项目配置，并优化表格文案。

**决策**：内容区标题恢复一级分类「项目配置」，说明概括三个二级分类；二级「项目规则」保留。「应用项目数量」精简为「项目数」，保留数量单元格单位与既有搜索、开关、自动保存交互。

**证据**：`docs/ui/ui-directions.html`的`demo-source-project-rules`内`.content>h2`、`.intro`与`.rule-table-head`为入口。Node核对标题、二级菜单、说明、五列表头、搜索保留与脚本语法通过；`npm run typecheck`、`npm test`（288通过）及一次`npm run build`通过，四项生成文件SHA-256构建前后相同。测试摘要在`/tmp/workbase-rules-list-tests.log`。

**遗留**：仅隔离原型文案，未替换正式组件；浏览器视觉未运行验收。

### 2026-11-19 · 确认项目规则列表并增加名称与项目搜索

**背景**：用户确认列表并要求添加搜索，继续评估规则页面优化空间。

**决策**：取消卡片对照；搜索与添加同排，数量与保存状态单独一行。匹配名称及完整项目名，多关键词全部命中，忽略大小写与全半角；不搜索正文。详情返回保留搜索，新增清空搜索，编辑后不再命中时焦点回搜索。过滤只影响展示，自动保存仍面向全部草稿。

**证据**：隔离原型`demo-source-project-rules`中的`rules-search`、`visibleRules`、`searchSummary`与`clearSearch`为入口。Node静态核对脚本语法、32个唯一ID引用、卡片移除通过；独立执行过滤函数的9组检查覆盖空词、空白、名称、项目、大小写、全半角、多词、无匹配及正文不参与匹配，并确认草稿不变。`npm run typecheck`、`npm test`（288通过）与一次`npm run build`通过，四项生成文件SHA-256构建前后相同；现有预览HTTP返回200。测试摘要在`/tmp/workbase-rules-list-tests.log`。

**遗留**：仅隔离原型，未修改正式组件或真实文件契约；未执行浏览器视觉验收。

### 2026-11-19 · 项目规则二级菜单更名并提供列表卡片对照

**背景**：用户要求二级「项目配置」改为「项目规则」，并评估规则应采用列表还是卡片。

**决策**：默认推荐列表，名称／项目／数量／开关可对齐比较；卡片仅作布局对照，不增加正文摘要或产品视图偏好。两种布局复用同一DOM、数据与事件，保留两行标签、悬停删除、详情和自动保存；一级「项目配置」保留。

**证据**：`docs/ui/ui-directions.html`的`demo-source-project-rules`、`rules-current`、`rules-layout`及`.rule-table.cards`为可复现入口。Node检查脚本语法、31个唯一ID及引用、菜单更名、默认列表和布局接线通过；`npm run typecheck`、`npm test`（288通过）、一次`npm run build`通过，样式／图标／两端产物四项SHA-256构建前后相同。现有预览HTTP返回200；测试摘要为`/tmp/workbase-rules-list-tests.log`。

**遗留**：仅隔离原型，正式组件未替换；不新增真实文件保存契约。浏览器视觉未运行验收。

### 2026-11-19 · 精简规则详情并采用正文原文与预览双态

**背景**：用户要求优化规则详情布局，移除正文上方按钮；点击输入区显示Markdown原文，点击外部显示预览。

**决策**：名称与开关同排，应用项目控件和标签下一行，正文采用单一可调整高度容器。默认预览，点击／Enter进入原文，外部点击／失焦／Escape恢复预览；保存光标和滚动位置，不修改原文。常用Markdown预览先转义HTML，代码块独立处理；输入法组合期间不排队保存半成品。既有自动保存队列继续只更新基线、不重建正文DOM。

**证据**：`docs/ui/ui-directions.html`的`demo-source-project-rules`、`.md-field`、`enterEdit`／`exitEdit`及`markdown`为入口。Node静态检查脚本语法、31个ID引用、双态入口及工具栏移除通过；`npm run typecheck`、`npm test`（288通过）及一次`npm run build`通过。生成样式、图标与两端产物构建前后哈希均相同；预览HTTP返回200。测试摘要位于`/tmp/workbase-rules-list-tests.log`。

**遗留**：仅隔离原型，未修改正式组件、安装或重启宿主。预览为常用Markdown子集，未承诺完整语法兼容；浏览器视觉、焦点、输入法与保存并发未运行验收。

### 2026-11-19 · 项目规则采用两行标签与单栏自动保存

**背景**：用户要求应用项目标签最多两行、缩小字体，列表悬停显示删除；详情移除页签、左右分栏及footer，顶部展示应用项目／启用／保存状态，编辑后自动保存。

**决策**：仅迭代隔离候选，标签沿用12px辅助字号和现有圆角；删除保留占位，焦点及触屏可达。详情全部字段单栏，顶部状态与重试替代手动保存。自动保存按规则650ms防抖、串行队列处理，无效项不阻塞其他规则，请求中新修改保留在队列，结果只更新已保存基线。已保存示例使用专用localStorage键，真实文件写入、并发版本及事务仍待正式接入。

**证据**：`docs/ui/ui-directions.html`的`demo-source-project-rules`、`.project-tags`、`queueSave`及`flush`为实现入口。Node静态检查脚本语法、30个ID及引用、标签52px两行上限、删除／自动保存入口与旧结构移除通过；`npm run typecheck`、`npm test`（288通过）及一次构建通过。四项生成文件构建前后哈希相同；本地预览返回200，测试摘要为`/tmp/workbase-rules-list-tests.log`。

**遗留**：未修改正式组件、安装或重启宿主。失败与未保存草稿只在当前页面保留；localStorage仅持久化已保存示例。自动保存并发、视觉尺寸和焦点仅做静态源码核对，未执行浏览器运行验收或真实Agent读取验收。

### 2026-11-19 · 项目规则采用四列列表与独立双栏详情

**背景**：用户明确要求规则列表展示名称、应用项目名称／数量及开关，删除按项目查看功能，并提供自动化流程弹窗作为详情布局参考。

**决策**：仅迭代`#demo=project-rules`候选，列表行点击进入原生dialog详情，开关独立切换。沿用截图的顶部导航、居中页签、灰色双栏工作区与固定底栏；左侧配置、右侧正文。详情返回和关闭保留草稿，列表与详情共用设置保存逻辑，成功回列表，失败停留；取消设置恢复已保存基线。移除项目来源预览和关联状态数据。

**证据**：`docs/ui/ui-directions.html`中`demo-source-project-rules`template及`openDetail`／`closeDetail`／`saveSettings`为入口。Node静态核对脚本语法、35个ID引用、离线依赖与旧功能无残留；`npm run typecheck`、`npm test`（288通过）和一次`npm run build`通过。四项生成文件构建前后SHA-256相同；预览`http://127.0.0.1:8765/docs/ui/ui-directions.html`返回200。测试摘要位于`/tmp/workbase-rules-list-tests.log`。

**遗留**：正式组件仍为既有布局，未安装或重启宿主。原型保存与文件冲突均为模拟；布局、焦点与键盘行为只做静态源码核对，未执行浏览器视觉或真实Agent读取验收。

### 2026-11-19 · 用共享规则与项目来源预览澄清配置模型

**背景**：用户认为项目规则现有逻辑不直观。`src/client/ProjectRulesSettings.tsx:12-24`的格式工具仅插入标记，项目规则卡在停用时收起绑定与正文，当前设置模型实际允许多项目共用同一条规则。

**决策**：在视觉真源新增隔离候选，保留共享规则模型及统一保存，采用列表／详情和按项目查看两种视图。停用仍允许维护正文与绑定；展示草稿与已保存来源，不引入模板复制、项目覆盖或隐含优先级。Markdown候选按行处理块级格式，加粗可切换，代码块内禁用格式操作。

**证据**：`docs/ui/ui-directions.html:4488`为候选template，入口为`#demo=project-rules`。Node静态解析通过脚本语法、32个ID引用与离线检查；`npm run typecheck`、`npm test`（288通过）及`npm run build`通过。构建前后`src/client/prototype.css`、`prototype-icons.ts`、`lib/client.js`与`dist/index.js`哈希分别相同，隔离候选未进入正式产物。

**遗留**：候选尚待用户评审；模拟保存只改内存，手写正文和全局内容均为示例。未修改正式组件、安装或重启宿主；未执行浏览器视觉与真实Agent读取验收。

### 2026-11-19 · 保存全局与多项目运行规则

**背景**：用户确认规则编辑开关与项目绑定方案，要求项目规则进入AGENTS、全局沿用官方加载路径，统一保存并保留原有文件。

**决策**：全局只写官方DSH home，不修改共享agents home；项目规则汇总到每个根AGENTS的工作台标记区块。Markdown轻量工具栏与官方预览不加运行时依赖，多选扩展现有Picker。规则偏好带原版本，所有目标先预检，文件写完才保存偏好；普通失败逆序回滚，外部后写不覆盖。备份工作台状态不等于规则文件恢复，因此保留当前规则配置。未变化项目不因归档阻断全局保存。

**证据**：`npm run typecheck`、`npm test`288项和两次`npm run build`全部通过；真实临时目录验证多项目保存、禁用清理、手写正文／BOM／CRLF保留、外部区块冲突、符号链接拒绝、RPC非所有者／未知项目拒绝、持久化失败撤销所有文件、后续目录权限失败回滚前一个文件及外部后写保护。11个原型脚本语法通过，生成CSS括号配平、宽度media残留0、容器查询72且warm作用域保留。客户端两次哈希相同，最终包六项白名单与工作区／安装目录一致；官方desktop CLI remove/add后正常启动82622／82655并监听127.0.0.1:59296，包大小及完整摘要见当前状态。

**遗留**：不承诺跨文件与偏好在断电或进程中断时原子提交；已有文件最终复核至rename之间仍存在外部进程竞争窗口。规则目标已移除／归档时，需先重新添加／恢复再清理区块。真实宿主模型加载、已有会话刷新时机与逐主题视觉未验收，未提交或发布。

### 2026-11-19 · 完善初始化协作模板与Makefile缩进例外

**背景**：用户阅读生成文件后确认优化AGENTS、提交规范、开发日志及Makefile例外。旧日志把已有项目也描述为尚未配置依赖，提交规则仅链接且包含非通用元数据。

**决策**：AGENTS明确读取时机和首次核实后补充项目说明，提交规范保留中文格式并移除frontmatter；旧内置全文精确匹配才迁移，自定义包括附加空白均保留。日志改为中性待核实状态并附记录约定与日期四段模板。EditorConfig给Makefile指定Tab，其他文件与现有项目保留规则不变。

**证据**：先运行`node --import tsx --test --test-name-pattern='旧默认提交规则升级' test/rpc.test.ts`，旧默认frontmatter归一化断言失败；实现后类型检查及初始化／RPC／设置针对性40项通过，包含原默认迁移、自定义与分组保留、已有文件及Git不覆盖的验证。全量构建与安装证据见当前状态。

**遗留**：已有生成文件不自动替换；真实宿主内新建及补齐尚未再次操作。未提交或发布。

### 2026-11-19 · 精简初始化小字并统一已有项目添加文案

**背景**：用户反馈开关下的执行时机与AGENTS说明多余，并要求将导入文案改为添加已有项目。

**决策**：删除额外说明段落，保留开关行内的缺失文件与已有Git说明；初始化页、添加弹窗、重试提示与英文文案统一添加语义。补齐配置字段和服务逻辑保持原合同。

**证据**：`npm run typecheck`、`npm test`280项及`npm run build`通过；六项官方desktop安装文件逐字节匹配当前构建，重启桌面与宿主进程分别66264／66303。包摘要与当次扫描边界见当前状态。

**遗留**：未追加真实宿主视觉验收；已有内部插件与rc.5不兼容提示仍由官方处理，未改其配置。未提交或发布。

### 2026-11-19 · 正式接入项目初始化二级菜单与导入补齐

**背景**：用户确认原型并要求实现导入补齐；原正式页面仍把初始化混在全局设置，导入仅登记项目。

**决策**：沿用共享页签和开关，补齐作为已存初始化配置的一部分，默认关闭。已有目录先由官方登记与绑定核对，再创建缺失内容；已有文件和Git整体保留，AGENTS不追加引用，不追溯重复和归档项目。补齐与新建共用文件生成及保守回滚，父目录身份核验和wx独占写入避免经链接越界；保存失败保留已生成内容以便原路径重试。

**证据**：`node --import tsx --test test/project-initialization.test.ts test/settings-render.test.ts test/rpc.test.ts test/ui-interaction.test.ts`通过39项，覆盖工作树指针、已有Git无需git命令、叶子链接保留、父目录链接拒绝、Git不可用不落盘、开关迁移、重复／归档跳过、保存失败后真实文件幂等重试和配置草稿保存。全量验证与安装证据在当前状态单独记录。

**遗留**：真实宿主内设置保存与导入补齐未实际操作，不声明宿主行为或最终视觉已验收；源码副本无Git元数据，未提交或发布。

### 2026-11-19 · 桌面rc.5兼容检查与模型菜单边界复核

**背景**：用户更新桌面端后要求检查当前插件的兼容性；此前文档仅记录rc.3，且遗留安装不一致及模型菜单定位风险。

**决策**：先扫描实际应用包与安装产物，再读官方rc.4／rc.5发行说明及rc.3至rc.5完整diff。GitHub比较JSON文件列表在300项截断，改用diff覆盖447项。模型菜单冲突保留为明确待适配项；当前工作区没有基线，实际构建提交也无法公开对照，不自动接受基线。

**证据**：`npm run host:check -- --online`退出2，`docs/ui/verification/host/report.json`为0阻断、1待复核、21模块、4项安装哈希一致。实际包`dsh-client-ui-model-selection/src/client/ModelSelect.module.css`的`.menu`仍有`position-anchor`／`bottom: calc(anchor(top) + 8px)`／`align-self: safe end`，与`src/client/NativeComposer.tsx`的`useComposerDropdown`只写top／max-height并存。官方完整diff未变更上述菜单和会话／存储／插槽／Forge／终端／语音接点；构建提交比较API返回404。复核说明见`docs/ui/verification/host/assessment.md`。

**遗留**：未进行真实界面、用户会话删除或恢复验收；定位冲突可能导致菜单错位或高度异常，未测量实际显示。没有修改运行时代码，按兼容维护流程不追加类型检查、测试、构建、安装或重启；未提交或发布。

### 2026-11-19 · 原型拆出项目初始化页及导入补齐开关

**背景**：用户指定prototype-craft，提出把初始化配置抽成二级菜单并添加导入已有项目补齐缺失内容开关。

**决策**：原型沿用单文件与现有样式，在全局和项目专属页之间加入初始化页；三个分组及提交规则整体迁入，导入开关默认关闭。已有文件始终保留，不为补规则改写AGENTS；导入补齐不追溯当前项目。模拟文件状态集中定义，导入结果与项目记录一起保存、失败回滚。

**证据**：`docs/ui/ui-directions.html`的`workspaceSettings`、`saveWorkspaceSettings`、`projectInitializationFiles`、`submitProject`及query入口对应迁移；二级菜单补齐左右方向键。源码复查菜单与面板、字段与保存、错误定位和补齐分支一致，11个内嵌脚本通过静态语法检查。

**遗留**：按prototype-craft仅交付静态模拟原型，未浏览器预览、截图或接入真实文件系统；未构建、安装或重启正式插件。需求提案不视为正式补齐功能已完成。

### 2026-11-19 · 初始化拆为三个分组并统一全局配置入口

**背景**：用户确认按基础文件、Agent协作规范、Git初始化分组，并要求提交规则自定义与移除添加项目弹窗中的重复配置。

**决策**：三个开关独立，只有提交规则作为Agent子项可关闭；其余文件按组生成，防止开关组合制造悬空引用。保留旧模板输入兼容，输出统一新结构；创建服务在串行队列内取最新偏好，避免旧表单快照覆盖默认。自定义内容按用户输入保存和写盘，不参与界面翻译，默认内容共用shared常量。编辑区复用普通文本域与details折叠，恢复默认直接修改草稿，仍由唯一保存操作落盘。

**证据**：`test/project-initialization.test.ts`覆盖全部16种开关组合、文件与引用、自定义字节内容、最新默认、已有目录与空白／长度验证；新增测试先红后绿。`test/ui-interaction.test.ts`及`test/project-form.test.ts`覆盖跨分类、保存失败、空白阻断、关闭保留、恢复默认、无配置提交与去重。`npm run typecheck && npm test && npm run build`成功，273/273；连续构建哈希见当前状态。`node docs/ui/verification/project-groups-check.mjs`实际组件8组交互／几何检查通过，原型全部脚本可解析；生成CSS不变量7项通过，宽度型media残留0、温暖主题保留。

**遗留**：后续按长期安装约定通过官方CLI重装并启动desktop，六项产物与构建一致，安装包与进程证据见当前状态；未执行真实宿主创建／保存，隔离组件回调不能代替真实宿主验收。技术栈模板和任意初始化命令仍是后续扩展。未提交、推送或发布。

### 2026-11-16 · 安装初始化配置功能并启动桌面宿主

**背景**：用户明确要求安装并重启；desktop此前依赖 `/tmp/dsh-workbase-1.0.0.tgz`，安装前未发现桌面或宿主进程。

**决策**：重新构建后通过官方CLI直接add新的1.0.4本地包，以新版本替换旧依赖，保留profile配置；宿主已退出，无需额外终止。安装完成后核对全部包文件再启动应用，不改版本号或发版。

**证据**：`npm run build`成功，客户端1238383字符；`npm pack --ignore-scripts --pack-destination /tmp --json`生成536106字节六项白名单包，本次私钥、令牌、本机路径及内部域名模式未命中。`"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add /tmp/dsh-workbase-1.0.4.tgz --offline`退出0、输出1.0.0→1.0.4。tar逐文件与安装目录Buffer比对全部一致，客户端SHA-256与构建一致。`open -a "DeepSeek Harness"`退出0，`ps -p 62562,62635 -o pid,ppid,command`确认桌面与实际desktop-host，`lsof -nP -a -p 62635 -iTCP -sTCP:LISTEN`确认127.0.0.1:55503监听。宿主检查21模块无缺失、零阻断，唯一待复核为缺少已接受基线，报告见 `docs/ui/verification/host/report.md`。

**遗留**：未在真实宿主执行设置保存或创建项目；启动与安装一致性不等于完整交互验收。CLI提示全局pnpm的globalShims项不被11.28.5识别及已有peer依赖提示，安装成功；不修改全局配置。未提交、推送或发布npm。

### 2026-11-16 · 初始化默认值加入项目全局配置

**背景**：用户要求把初始化配置加入配置项的项目配置页，原实现只有创建表单中的单次选择，默认值无法保存。

**决策**：复用项目全局配置中的 Picker 与开关，统一保存 `preferences.projectInitialization`，默认 `{ template: 'none', git: false }`。复用创建命令的严格选项 schema，设置选不初始化时归一化 Git 关闭；基础模板首次选择默认开启，关闭可保存。创建表单只在挂载时读默认值，避免后续快照刷新覆盖用户草稿；单次不初始化仍沿用旧创建参数，服务端不隐式套用默认值，确保用户覆盖有效。增量 schema 去掉字段默认，旧设置 options 可省略该字段。

**证据**：`test/rpc.test.ts` 验证旧偏好、严格参数、无关补丁及重新载入；`test/store.test.ts` 验证保存失败原子回滚和旧请求保留；`test/project-form.test.ts` 验证模板与 Git 默认值仅随新建提交；`test/settings-render.test.ts`、`test/ui-interaction.test.ts` 验证入口、禁用、跨分类草稿和失败重试。首轮5项新增测试因功能缺失失败，实现后类型检查、270/270测试、构建通过；两次构建客户端 SHA-256 `41a251edbbc81abcd658d3b9932e1aed4f6a5d3d0d2bee34a281a449aaeeec86`，比基础版增加2441字符。`node docs/ui/verification/project-settings-check.mjs` 使用实际组件与正式翻译构建，8组中英文／明暗／宽窄验收全部通过，无pageerror或横向溢出，Picker40px、开关32px；截图用 Chrome Canvas 编码 WebP quality82。证据目录被忽略；该临时脚本仍依赖 `/tmp/wb-init-browser` 的 Playwright 与 macOS Chrome。真源4个执行脚本可解析，生成样式72个容器查询、宽度型media0、warm主题保留。

**遗留**：设置保存与创建表单在隔离浏览器中验证，真实宿主中的配置保存、新建、安装与重启未验收。源码目录仍无Git元数据，未提交或发布。此副本缺少规范提到的 `docs/evidence-image.mjs`，现有 cwebp／magick 不可用，uv临时安装 Pillow 下载未完成后已停止，截图改用浏览器编码，不引入项目依赖。

### 2026-11-16 · 新建项目接入基础协作模板与可选 Git 初始化

**背景**：用户明确开始开发项目初始化，并要求生成 `.agents/rules/git-commit-message.md`。既有目录创建在宿主注册之前执行，注册失败保留目录供已有路径重试。

**决策**：首版默认不初始化，仅提供基础协作模板和可选 Git。模板源码随单文件服务端打包，不依赖不出包的 docs 或规则文件。提交规则保留中文类型与原因／改法，去掉本仓库宿主接线、发布级别等专属内容。核对锁定 SDK 的 Workspace `create` 只注册已有目录，`initializeDefault` 限于空宿主默认工作区，均不能替代用户项目模板流程，沿用本地 mkdir 与官方注册。Git 在独立临时目录初始化，不继承 GIT 环境定位／配置和用户模板，不创建首次提交。回滚采取文件身份与完整内容校验及非递归空目录删除；部分写入保留，不承诺同用户外部进程竞争下的文件系统原子事务。

**证据**：`test/project-initialization.test.ts` 覆盖实际模板文件、main 无提交仓库、外部 Git 目录变量隔离、已有目录保留、Git 缺失回滚、owner RPC 和初始化失败不注册；`test/project-form.test.ts` 验证模式参数、失败保留及提交去重。测试先行，首轮新增5项均因功能缺失失败；实现后 `npm run typecheck`、`npm test` 264/264、`npm run build` 通过。生成 CSS 72 个 `@container workbase`、宽度型 `@media` 残留0、温暖主题与新增文件清单样式保留。`node /tmp/wb-project-init-browser.mjs` 使用实际 AddProject 函数、正式翻译转换及共用组件与CSS，8组中英文／明暗／宽窄表单均无横向溢出或pageerror，名称与Picker为40px、Git开关32px；初次360px英文溢出定位到模式按钮，真源与组件统一允许长标签换行后复测通过，结果暂存 `/tmp/wb-init-browser-results.json`。视觉真源4个内嵌执行脚本可解析。

**遗留**：基础版满足本次确认范围；结构／技术栈模板及自定义初始化命令继续保留为扩展需求。真实宿主创建、安装与重启尚未验证。当前本机工作台存储没有此仓库的项目绑定，无法核实或更新历史待办 `e934c8ef`；不改其他项目待办。源码目录无 Git 元数据，未提交或发布。

### 2026-11-14 · package.json 补 repository／homepage／bugs／keywords，为插件市场收录做准备

**背景**：准备把插件投到 `awesome-dsh-plugin/awesome-dsh-plugin` 目录。该目录的 npm 映射不自带字段，只从 registry 读取已发布包的 `repository` 与条目 `url` 做比对；发布出去的 1.0.3 没有这个字段，市场就关联不到仓库，条目也就没有下载量数字。

**决策**：只补元数据，不动运行代码与白名单。`repository` 指向 `git+https://github.com/zhileyo/dsh-workbase.git`，`homepage` 用 `#readme` 锚点，`bugs` 指向 issues，`keywords` 取 `dsh`／`dsh-plugin`／`deepseek-harness`／`workbase`／`todo`／`session`。没有加 `author`：许可证写的是 AlwaysFyo，但仓库没有可核对的作者邮箱，不猜。

**证据**：`package.json:6-21`（keywords、homepage、bugs、repository），其余字段未改；`node -e` 读回 `git+https://github.com/zhileyo/dsh-workbase.git`、`#readme`、6 个关键词；`npm run typecheck` 通过。本轮 `npm test` 在当前会话的沙箱里全红，原因是 `spawn EPERM`——`tsx` 的 esbuild 服务进程与 `node --test` 的子进程都无法启动（本地实测 `--test-isolation=none` 同样失败），与本次改动无关，测试交由 CI 门禁执行。

**遗留**：字段要等 `main` 发布出新版本才进 registry，在此之前市场仍拿不到映射；收录条目本身不提 PR 到本仓库，属于外部目录的投稿。

### 2026-11-14 · 新增两条待实现需求：项目规则与全局规则、创建项目时初始化目录

**背景**：用户要求把两项能力记入「待实现功能」：项目规则／全局规则配置，以及创建项目时可选初始化项目目录。README 的清单与工作台待办是对外的承诺与执行侧，缺一不可。

**决策**：三条记录同时落地——`README.md:33-34` 两条清单项、`docs/PRD.md:72-73`（§4 项目管理）两条需求、工作台待办 `61a486e4`（项目规则与全局规则配置，medium）与 `e934c8ef`（创建项目时可初始化项目目录，low）。两项的实现细节都留在待定：规则写在宿主认可的文件还是工作台存储域、项目规则是替换还是追加全局规则、初始化是建结构／生成模板文件／执行命令、失败是否回滚。写进文档时保留这些不确定，不用推测填空。

**证据**：`README.md` 新增两条 `- [ ]` 条目，位置在「迁移记录」之后、「统计卡片」之前，沿用「- [ ] **名称**：说明。」格式与 `README.md:29` 的对齐规则；`docs/PRD.md` 在 §4 末尾追加两条，措辞与待办备注一致；待办版本均为 version 1、`done:false`、`creator:agent`。

**遗留**：两项都未开工，实现前需先按 `docs/HOST-COMPATIBILITY.md` 复核宿主是否已有规则文件加载约定与建目录接口；本轮只改文档与待办，未跑 typecheck／test／build。

### 2026-11-14 · 空会话诊断改用宿主会话控制器，删除允许驱逐已加载会话

**背景**：用户报告「默认工作区有空会话，为什么没有诊断出来」。本机实测两个 `blank:true` 的会话（`session-66e86c8b…` 在默认工作区、`session-8c2db91e…` 在本仓库工作区）都停在 `emptyIssue` 的第一个守卫上被跳过。

**决策**：
1）「是否在用」的判据从旧 `sessions` 服务换成宿主 `ctx.sessionController.list()` 的 `running`。旧服务是「已加载会话的内存缓存」——探针记录它的 `list()` 只有两个打开工作区的 4 个会话，拿 `get() !== undefined` 当「正在使用」必然误跳；`blank` 也直接取宿主投影，不再自己按 `cachedSnapshot` + `lastPromptAt` 推算。旧宿主没有 `sessionController` 时仍走原来的三段判定（`sessions.get` + 活动 + 投影 + `asOfSeq === eventCount - 1`），行为不变。
2）候选身份带上宿主 `updatedAt`（`identity` = `[日志身份, updatedAt]`），删除前用它复查：会话在检测之后又被写入就不再匹配，避免把新内容当空会话删掉。
3）删除阶段新增 `evict` 选项。`deleteCore` 本来就有 `flush → detachEntered → p.flush → 复查 s.get` 的驱逐路径，只是被 `inactive(coldOnly)` 的冷守卫挡住；`coldOnly + evict` 时跳过该守卫，但 `activity.length === 0` 仍是硬条件，运行中的会话即使传 `evict` 也拒绝。只有 `kind === 'empty'` 传 `evict`，孤儿会话仍是纯冷删除。
4）驱逐后宿主可能不再把该会话列进 `sessionController`，复查降级为「日志 header 身份未变」——首次严格比对已经确认过一次，这一步只防竞态。

**证据**：`src/server/diagnostics.ts:44-92`（`blankIndex` 与 `emptyIssue`）、`src/server/session-maintenance.ts:126-140`（`inactive`）与 `:170-200`（`deleteCore` 两处传 `!!options.evict`）；临时落盘探针写 `%TEMP%\wb-empty-trace.jsonl`，实测两个空会话 `verdict:"skip-header"`、`liveBefore:true`，`sessionController.list()` 8 项里两个 `blank:true, running:false`，当前会话 `running:true`；`liveEntryFor()` 对全部已加载会话（含从未打开的）都返回 entry（keys `id,session,carrier,emitCtx,announcement,appending,detachRequested,detach`），无法据此区分是否被打开过，所以只看 `running` + 活动。测试：`test/diagnostics.test.ts` 新增 2 条、`test/session-maintenance.test.ts` 新增 1 条；`npx tsc --noEmit` 通过，`npm test` 258 项 253 过 5 红（全部是既有 `EPERM: operation not permitted, symlink` 基线）。`node build.mjs` 连跑两次一致：`dist/index.js` `83763291BB3E92CD92DF15C46B4BB85E0AC8669BC59526681C204C0761552D9E`、`lib/client.js` `5D41F8721A3B17161526B1081F6750D33285A9AF35CC4845FBE9241650186B8E`（1231366 字符）。探针在确认后删除并重新构建，重载插件（`include:dsh-workbase` 关再开）后用户在面板上删掉了那 2 条空会话。

**遗留**：本版宿主的 `persistence.list()` 不给 `eventCount`，水位校验（`asOfSeq === eventCount - 1`）实际只在回退路径上起作用；`dsh_workbase` 存储里没有诊断报告缓存，面板每次打开都重新检测；浏览器侧没有自动化视觉回归。

### 2026-11-14 · 会话菜单加「复制 SessionID」，目录不可用改用横幅提示

**背景**：用户要求会话列表的「更多」菜单加复制 SessionID；随后指出项目目录不可用时的提示「只有文字没有样式」，希望参考项目归档那条提示。

**决策**：
1）复制 ID 复用「复制路径」已有的通道——`run(() => navigator.clipboard.writeText(...), '会话 ID 已复制')`，活跃与归档两种菜单都挂；文案按用户原话写「复制 SessionID」，译文补进 `src/client/i18n-en.ts`。
2）目录不可用不再用 `wb-warning`。它只是表单错误的红字样式（`src/client/styles.css:89` 只有颜色与字号），所以看起来「只有文字」；改成与归档提示同一套横幅外壳 `wb-feedback banner` + `<Icon name="alert"/>` + `banner-body`，文案不变。配色按用户选择用告警黄（`.banner` 非 readonly，`background:var(--warn)`、`color:var(--warntext)`，也就是原型里「项目目录异常」那条），没有新造红色变体：设计稿里 `--danger-text` 只用于文字和危险菜单项。两条横幅的配色来源不同——`banner.readonly` 的底色 `--soft` 来自当前主题的 `selected-bg`（`src/client/theme.ts:32`），文字先是 `--accent`（`src/client/theme.ts:30`）再被 `src/client/prototype.css:893` 的 `.banner.readonly{color:var(--selected-text)}` 覆盖成主题的选中态文字色，所以归档提示整体跟随主题；非 readonly 的 `--warn` 是每套主题固定的暖米色（`src/client/theme.ts:34`），`--warntext` 则是各主题的 `warning` 色。用户确认目录不可用保持告警黄。

**证据**：`src/client/Detail.tsx:130`（横幅）、`:145-153`（两个菜单分支）；`test/detail-render.test.ts` 新增「会话更多操作提供复制 SessionID，归档会话同样提供」——菜单项只在展开后渲染，静态标记看不到，故核对源码两处分支；`npx tsc --noEmit` 通过，`detail-render` 8/8，`node build.mjs` 两次一致 `lib/client.js` `4AA3D6C98135FE3E1FA7E00EC7C94744D9EBDAEC299595886A94F0E589777118`（1231357 字符）。

**遗留 1（目录不可用那条仍未统一）**：`src/client/Composer.tsx:202` 的「所选项目目录不可用」仍是行内红字（属于输入区提示，不占横幅位）；浏览器视觉未逐像素核对。

**遗留 2（提示样式没有统一）**：扫过全部 `src/client/*.tsx`，没有完全无样式的裸文本（元素都有 `className` 或在已样式化容器内），但下列「状态／结果」类仍是 `wb-warning` 红字，与现在的横幅口径不一致——`src/client/Workbase.tsx:179`（所有对话框共用错误行）、`RestoreSettings.tsx:146/147/157`、`BackupSettings.tsx:79/93`、`Search.tsx:120`、`TodoDetail.tsx:113`、`Composer.tsx:202/204`、`Workbase.tsx:215`。按用户目前口径（选「跳过吧」）本轮一处未改。字段校验类（`DirectoryInput.tsx:39`、`Settings.tsx:128`、`TodoDetail.tsx:112`、`TerminalSettings.tsx:211/234/285`）应继续保持红字，不要并入横幅；宿主插槽内的 `NativeComposer.tsx:473` 与 `ColoredTerminal.tsx:155` 需按插槽视觉单独判断。

### 2026-11-14 · README 待实现清单与工作台待办对齐

**背景**：用户要求 README「待实现功能」补上「项目迁移」与「迁移记录」，并要求这份清单与工作台待办双向对齐，已完成的条目不再列出。此前 README 只列了 3 项（统计卡片、主题选项整合、代码协作），工作台待办里只有当轮发现的 5 条缺陷，两处互不相通。

**决策**：
1）README 清单只承载「未实现」这一种状态，并在标题下写明对齐规则：已完成条目从这里移除，新需求先记入待办再补到这里。不把「已完成」「进行中」写进 README，避免两处各记一份状态、必然漂移。
2）「项目迁移」「迁移记录」不重新设计语义，直接沿用 `docs/PRD.md` §8 已定义的口径（`docs/PRD.md:249-259`）：迁移分「更新目录」与「迁入已有项目」两条路径，预览后确认、原子提交、失败完整回滚；迁移记录按批次保存来源／目标／原新目录／实体关联／设置快照与 72 小时撤销期限，到期只读，没有真实迁移成功前不生成已完成记录。前置条件写进待办：宿主当前没有安全的绑定目录更新接口，实现前须按 `docs/HOST-COMPATIBILITY.md` 复核，缺失就保持未实现，界面不得模拟成功。
3）同步结果：README 5 项 ↔ 工作台 5 条未完成待办（`a28b9106` 项目迁移、`c991a927` 迁移记录、`2ac1a903` 统计卡片、`9582eccf` 主题选项整合、`78e40316` 代码协作）。抽屉宽度那条（`9b81a9e1`）已实现并关闭——用户在「是否改成连续收缩」一问上选了保持现状，故不出现在 README 清单里。

**证据**：`README.md:27-35`（清单 + 对齐规则）；工作台待办 5 条均 `done:false`、`creator:agent`，备注写入了验收口径与依赖；`docs/PRD.md:249-259` 为迁移与撤销的既有需求文本。本轮只改文档与待办，没有代码改动，故未重跑 typecheck／test／build。

**遗留**：README 清单与待办之间仍靠人工保持一致，没有自动化校验；约定冲突时以工作台待办为执行侧真源、README 为对外承诺，改 README 前先核对待办状态。迁移两项依赖宿主接口，能否落地取决于后续 `host:check` 的探测结果。

### 2026-11-13 · 设置默认通用配置、搜索框按顶栏居中与入口前短分隔线

**背景**：三条用户待办——设置页默认进入的页签不对、header 搜索框看着没居中、新会话页「工作台」入口左侧的竖线从顶到底拉满且两侧间距不对称。

**决策**：
1）设置默认固定 `general`。旧逻辑用持久化的 `preferences.selectedProject` 猜上下文，但设置只有 `src/client/Workbase.tsx:144` 一个入口，没有项目参数，结果在项目页开设置会跳到项目配置。
2）搜索框居中坚持不改 DOM。原先它靠 `flex:1 1 140px` 吃剩余空间再 `margin:0 auto`，剩余空间左右不等（品牌侧约 200，右侧状态区加按钮约 227），于是中心左偏。放弃「grid 三列 + 把已同步并进 header-actions」，因为那要同时改原型 `header()` 与 `Workbase.tsx` 结构，且两侧 `1fr` 在窄宽度下不会自动收窄搜索框。改为绝对定位居中，带宽按两侧实测占位预留；「最近活动」出现时它再多占约 143px，所以用 `:has(.header-activity)` 单独收窄带宽，保证任何宽度都不压到右侧文字。
3）分隔线不再用整条 header 高度的 `border-inline-start`，换成 16px 伪元素竖线（与顶栏 `header-separator` 规格一致），竖线两侧各 8px：`padding-inline-start:8px` 给左、`gap:8px` 给右，因此「工作台图标到竖线」与「左侧内容到竖线」等距。

**证据**：`docs/ui/ui-directions.html:1007-1010`（三条带宽规则）→ 生成物 `src/client/prototype.css:1005-1007`，宽度型 `@media` 残留 0、`@container workbase` 71 处、`:scope.c` 39 处；连续两次 `node build.mjs` 后 `lib/client.js` SHA-256 都是 `FA86D6CF…F703C172`（1230511 字节）。`npm run typecheck` 通过；`node --import tsx --test test/client-entry.test.ts test/settings-render.test.ts test/prototype-css.test.ts` 21 项全过；`npm test` 254 项：249 过、5 红，红项全部是本机 `EPERM: operation not permitted, symlink`（备份/恢复/维护用例的符号链接权限限制，与既有记录一致）。`test/client-entry.test.ts:309-311` 改为断言新规则形状（`grid-area:1/2` + `border-inline-start:0`、`gap:8px` 与 `padding-inline-start:8px`、`::before` 的 `width:1px;height:16px`）。

**实测边界（安装与生效）**：`npm pack` 出的 `dsh-workbase-1.0.1.tgz` 用 `plugin_manager install_bundle`（target 直接给 tarball 绝对路径）装进 desktop profile，`profiles/desktop/package.json` 的依赖变成 `"dsh-workbase": "file:D:/Projects/dsh-workbase/dsh-workbase-1.0.1.tgz"`，安装结果 `application: applied`，装进去的 `lib/client.js` 与本地构建 SHA-256 相同。分层结论：服务端层（存储域、RPC、工具注册）安装完成即重载生效；客户端层（注入浏览器的 `lib/client.js`）需要刷新页面才换，**不需要重启宿主**——用户刷新后确认三处改动全部生效。因此「插件页更新后没热更新」的观感来自两件事：插件页按 registry 版本比对，而 `dsh-workbase` 一直是 `1.0.1`（无版本可更新），且本地 tarball 来源在批量更新里通常被跳过。

**遗留**：浏览器视觉回归没有自动化证据——本机 `node_modules` 没有 playwright，`verify-ui.mjs` 仍硬编码 `/tmp` 与 macOS Chrome 路径，本次只有用户刷新后的口头确认（设置默认页、搜索框居中、竖线两侧等距）。带宽常数由中文文案实测占位推算（`780` 给「最近活动」留 44px 余量），英文界面下品牌与按钮更宽，后续若换语言出现挤压，调这三个常数而不是改定位方式。另外：本地 tarball 来源无法在插件页自助更新，改代码后必须重新 `build` + `pack` + 安装。

### 2026-11-13 · 未知偏好键不再阻断插件启用

**背景**：用户启用 1.0.0 报 `domain 'dsh workbase': stored global does not match its schema ... unrecognized_keys ["extras"]`。`~/.dsh/storages/dsh_workbase.json` 的 `preferences` 里有 `{"extras":{"bulkUpdate":true}}`；仓库历史、已安装产物与 DSH 宿主存储代码里都搜不到 `extras`／`bulkUpdate`，属旧版本或外部写入遗留的键。

**决策**：先就地修数据（备份后删掉该键）解阻塞；再把 `preferencesSchema` 的 `.strict()` 去掉，让宿主读整份 global 时按 zod 默认 strip 丢弃未知偏好键。RPC 侧不跟着放宽：`preferencesPatchSchema` 结尾显式 `.strict()`，客户端多带键仍被拒绝。没有改成 passthrough——未知键不属于本插件，留着只会继续漂移。

**证据**：修数据前 `stateSchema.safeParse` 明确报 `unrecognized_keys ["extras"]`；删键后同一探针对修复后的文件返回 `PARSE_OK`（18 个已知偏好键齐全）。改 schema 后对**带 extras 的原始备份**跑同一探针同样 `PARSE_OK`，即旧数据无需再手工清理也能激活。`npm test` 254 项：249 过、5 红（仍是本机符号链接权限与缺 `sqlite3` 两项环境限制）。`npm run typecheck`、`npm run build` 通过。

**遗留**：其他机器若也有同类遗留键，需修数据或升级到带本修复的版本；本机 desktop profile 已装 1.0.0，要更新到 1.0.1 才带此修复（数据已修，当前即可激活）。

### 2026-11-13 · 发版文档同步改为同版本幂等

**背景**：1.0.0 推送后 GitHub Actions 的 release 运行失败，npm 仍停在 0.3.1。本地用 `prepare({ nextRelease: { version: '1.0.0' } })` 直接复现：`[sync-docs] ... 未命中「当前源码与本地包版本」`。原因是开发日志的「当前状态」在开发期已先写成 `1.0.0`，发版要写的也是 `1.0.0`，替换后文本不变，插件把「没变化」当成「没命中」抛错，整次发版在 `npm publish` 之前中止。

**决策**：判据从「替换后文本是否变化」改成「正则是否匹配到标记」——匹配到就视为已同步（幂等），完全匹配不到才中止。保留原有的严格性：文档标记被删改时仍然失败。正则先去掉 `g` 标志再 `test()`，避免 `lastIndex` 让重复判定结果漂移。没有给这个脚本加测试：它固定改写仓库里被跟踪的日志文件，测试会污染工作区，因此改用临时探针核对两种形态，结论记在这里。

**证据**：探针 `node <tmp>/wb-sync-probe2.mjs 1.0.0` 输出 `SYNC_OK 1.0.0` 且 `git diff` 为空（同版本幂等）；换 `1.0.1` 输出 `SYNC_OK 1.0.1`，`git diff --stat` 显示 `dev-log.md | 10 ++++----`（5 处版本标记、安装包名与哈希说明被改写），随后已还原。修复前同一条探针抛 `SYNC_FAIL`。

**遗留**：本机没有发版凭据，改完只能靠下一次 push 触发的 Actions 验证；该次运行是否还有别的失败步骤（门禁、trusted publishing 身份）仍未确认，见 Actions 页面。

### 2026-11-13 · 修复 Windows 备份失败与锁文件内部源

**背景**：推送前按门禁跑 `npm test`，253 项里 16 项失败。逐项定位后是两类问题：一是 Windows 上每次备份都会失败（`src/server/backup.ts:180` 用只读句柄刷盘），二是 `package-lock.json` 有 17 个包的 `resolved` 写成了内部源，CI 冷缓存 `npm ci` 会直接 `ENOTFOUND`。

**决策**：备份归档的刷盘改成读写句柄 `r+`——`FlushFileBuffers` 要求句柄带写权限，只读句柄在 Windows 返回 `EPERM`，改后 Linux 行为不变，语义仍是「发布前刷盘」。锁文件只把 `resolved` 的主机换回 `registry.npmjs.org`，integrity 不动，因此不重新解析版本，也不改依赖。剩下 5 项失败属本机环境限制（创建符号链接需要 `SeCreateSymbolicLinkPrivilege`、PATH 里没有 `sqlite3`），不为它们改产品代码或测试。

**证据**：修复前 16 红，其中 10 项是 `restore.test.ts` 的 `ZodError: archive undefined`——根因不是恢复本身，而是备份没产出归档：直接跑 `BackupManager` 得到 `phase: failed`、`message: EPERM: operation not permitted, fsync`。`node -e` 对只读 fd 调 `fsyncSync` 可复现同一 EPERM，改 `r+` 后同一探针返回 `phase: completed` 并落盘 `dsh-20261113-220546-b9dd8031.tar.age`。修复后 `npm test` 253 项中 248 过、5 红，残留原因只有 `EPERM ... symlink`（4 项）与 `spawn sqlite3 ENOENT`（1 项）。空 `--cache`、公共源、原锁文件跑 `npm ci` 复现 `ENOTFOUND internal-host.example`（命中 70 处引用）；换主机后的锁文件在同样条件下加装 434 包、退出 0。`npm run typecheck` 通过；`npm run build` 两次均为 1228584 字符、`lib/client.js` SHA-256 均 `8BCA72095EFFA729C6068139EA54338777A225A7B43BC3850BC4867D70ED8723`。

**遗留**：`npm test` 在本机无法全绿，备份／恢复相关 5 项只能在 Linux（CI）验证；Windows 真实 profile 里的备份仍未实际走一遍。1.0.0 的门禁与发版结果要在推送后核对。

### 2026-11-13 · 核验桌面rc.3实际接口与安装差异

**背景**：用户要求检查刚更新的桌面端兼容性；此前插件更新字段曾因维护脚本与模拟接口漏项未被发现，因此本次不能仅以方法存在或脚本退出码判断兼容。

**决策**：对照本机app.asar、已接受rc.2基线、此前实际插件管理器副本和官方Release／标签差异。将安装不一致、旧基线缺声明和真正接口变化分别解释；人工补核脚本尚未覆盖的终端、语音、侧栏与工作区Factory。既有数据保护及官方套件路由保留，本次只核验与记录，不接受基线或执行安装重启。

**证据**：`npm run host:check`报告21模块、2阻断／26待复核、退出1；其中17模块指纹与旧基线相同。实际应用为0.2.2-rc.3、构建`6b729fedde0c8fd03af7afdf5a711aa64fe87c3b`，Node24.21.0与pnpm11.28.5未变。`shasum -a 256 /tmp/dsh-update-review/lib-index.js /tmp/dsh-compat-rc3/@deepseek-ai/dsh-plugin-manager/lib/index.js`两者均为`33cbad2bdce9679a9f4fbebe072db87ecbb162e0ceb93237f6a627de07d3ab74`，remote-client也一致。`gh release view dsh-v0.2.2-rc.3 --repo deepseek-ai/deepseek-harness --json tagName,url,body,publishedAt`与正式标签compare已获取；实际构建提交compare返回404，不能宣称逐提交远程对照完成。源码路径、参数、安装哈希及原始报告见`docs/ui/verification/host/assessment.md`。本次没有新增代码或执行额外测试／构建。

**遗留**：最新五项审查修复的dist／lib仍未安装，安装客户端哈希对应上一轮自动更新修复。`NativeComposer.tsx:142`的top覆盖与官方`ModelSelect.module.css:97-102`的bottom锚点仍并存；未验证视觉或真实用户流程。终端／语音／侧栏等补核范围尚未全部进入自动指纹清单，旧基线缺类型记录且安装不同，不自动覆盖。未提交或发布。

### 2026-11-13 · 修复终端显示恢复与国际化审查问题

**背景**：用户要求修复审查确认的五项问题：配色切换丢失已结束终端画面、诊断误翻译用户会话名称、默认Shell存储失败仍提示成功、恢复阻断原因未翻译，以及文档对内置模式规则的矛盾。

**决策**：两种终端显示共享只调用公开方法的挂载适配，closed／failed时补用connect获取官方完整快照；跟随和停用保留薄接线但渲染原官方组件，不拷贝或改写宿主私有xterm。默认Shell仍由官方保存，只读核对已确认偏好键，不用发现结果的首项兜底证明成功。诊断新增可选sessionTitle并保留旧title兼容；客户端只翻译固定标签。恢复逐条翻译已知阻断原因，动态路径作为参数原样保留。PRD和当前实现表统一内置／自定义模式规则。

**证据**：官方`dsh-api-terminal-controller/src/client/model.ts`的mount跳过closed／failed，而connect通过remote.attach取得新流；服务端`src/terminal.ts`的attach首帧包含serializer.serialize完整screen。官方`src/client/shell-preference.ts`吞掉写入异常，`src/client/index.ts`的launchShells会兜底首项。工作台改动可从`ColoredTerminal.tsx`、`entry.tsx`、`TerminalSettings.tsx`、`DiagnosticsPanel.tsx`、`RestoreSettings.tsx`、`i18n-en.ts`及`shared/diagnostics.ts`复现核对。`npm run build`退出0，客户端1228584字符；`npm pack --ignore-scripts --pack-destination /tmp --json`生成1.0.0包528476字节，entryCount为6。退出主进程30325的`kill -TERM`被自动审批拒绝，操作没有执行，尚未安装和重启。

**遗留**：自动审批要求本轮明确授权退出宿主进程后才能继续安装重启；按已有约定不追加测试、类型检查或界面验收。已结束终端完整快照依赖宿主仍保留该终端，宿主已清理时沿用官方不可用状态。官方偏好键若变化需按HOST-COMPATIBILITY记录复核。未提交、推送或发布npm。

### 2026-11-13 · 自动更新批次跨热重载与入口测试修复

**背景**：一键更新审查发现自身热更新会卸载控制器，丢失最终结果并让新实例重复自动检查；入口测试的宿主模拟落后于终端及官方组件接线，断言前即失败。

**决策**：在window中保存带版本的批次数据、订阅和首次启动选择，新控制器复用状态，旧控制器只允许在途官方请求收尾。官方更新Promise仍可提供最终结果，不新增远程恢复接口，也不把不存在的在途记录当作成功；响应丢失停止后续安装。测试补齐宿主原子字段、可选注入、插槽与hook模拟，xterm保持外部依赖；按rc.2公开契约补充plugins.item类型及终端快照类型，不改变终端行为。

**证据**：`test/plugin-update.test.ts`新增4项回归覆盖热重载完成、未知结果、禁用选择与检查中卸载；`test/client-entry.test.ts`新增共享window两次真实入口挂载，核对只调用一次检查安装、保留弹窗、忙状态及最终结果。`npm run typecheck`退出0；`npm test`253/253通过，完整输出在`/tmp/dsh-update-review/full-tests.log`。`npm run build`及`npm pack --ignore-scripts --pack-destination /tmp`退出0，客户端1225879字符，六项1.0.0包527.7kB；客户端SHA-256 `2a18bbeebc1f4af1e246ac3d36f955c46e2274886d646eb94e33b2089955b754`，包SHA-256 `56e61f3a115367925cd2e38585506cb91bf9bcad56d78f49579a9553bccd3229`。原主24475正常退出，经进程门禁后官方desktop remove/add与启动退出0；`pgrep -fl '^/Applications/DeepSeek Harness.app/Contents/MacOS/'`记录新主27975／宿主28045。

**遗留**：未触发其他真实插件在线更新；本机工作台为file包来源，不支持registry在线自更新。真实自身在线更新、权限／网络故障和界面未验收；需要重启生效的安装不自动重启Harness。

### 2026-11-13 · 下载文字悬停与恢复默认一致

**背景**：用户要求重新下载的鼠标悬停样式与恢复默认一致。

**决策**：按官方字段reset规则，下载文字默认使用label-secondary，hover:hover能力下未禁用时使用label-primary；移除下载下划线，保持文字动作。

**证据**：官方`dsh-client-ui-primitives/lib/settings-form/fields.module.css`的reset默认／悬停颜色为依据，`styles.css`下载动作同步并保留禁用和焦点；原型reset和palette-download-text同步无下划线悬停变色，UI规范同步。`npm run build`退出0，客户端1224049字符；六项1.0.0包527.4kB，shasum `7bbfbd54028855633a09bf17d5a40f651cf8815e`。主23691正常退出并通过门禁；首次安装registry地址误写导致ENOTFOUND，已停止该命令，正确registry重试add与启动退出0；新主24475／宿主24525。

**遗留**：未追加测试、类型检查或实际视觉验收。

### 2026-11-13 · 终端字段去掉已自定义标签

**背景**：用户认为字号旁的「已自定义」标签冗余，要求移除并只保留恢复默认。

**决策**：复用原官方SettingsValueField，仅在终端扩展字段内隐藏Tag；不将overridden强制设为false，因为官方同时用它控制恢复默认按钮。

**证据**：官方SettingsValueField的overridden分支同时渲染Tag与重置button；`styles.css`通过限定`data-workbase-terminal-settings`、`wb-terminal-value-field`及字段头的`data-tone`隐藏标签，字号与两项命令限制共用。UI规范同步，原型原本无该标签。`npm run build`退出0，客户端1223989字符；`npm pack --ignore-scripts --pack-destination /tmp`生成六项1.0.0包527.4kB，shasum `fd865882cabe79a514b7d0e49b461e450633e021`。桌面主22692正常退出，进程退出门禁通过，官方desktop remove/add与启动退出0；新主23691／宿主23726。

**遗留**：未追加测试、类型检查或实际视觉验收；选择器基于当前官方字段结构，宿主更新改变该结构时需复核。

### 2026-11-13 · 字体首次展开时保持表单高度

**背景**：用户反馈字体下拉框第一次打开出现跳动。

**决策**：将字体异步状态放入固定高度的portal菜单，并给字体滚动层预留滚动条空间；不延迟展开、不提前请求字体权限，不修改官方定位代码。

**证据**：`TerminalSettings.tsx`的FontPicker原在Menu后条件渲染加载／失败／空结果段落，首次请求完成时增删表单高度；官方`useAnchoredPosition`通过ResizeObserver、scroll事件与逐帧锚点矩形追踪重新定位。现用Menu的children将提示留在菜单滚动层，`styles.css`增加字体菜单scrollbar-gutter:stable，UI规范同步。`npm run build`退出0，客户端1223698字符；`npm pack --ignore-scripts --pack-destination /tmp`生成六项1.0.0包527.3kB，shasum `c70f0b905c0c7c610894f14231eb5038c3489eb4`。主21679／宿主21710正常退出并通过退出门禁，官方desktop remove/add及启动退出0；新主22692／宿主22726存在。

**遗留**：依据静态代码修正布局变化链路，未追加测试、类型检查或真实首次展开视觉验收；最终效果待用户实际使用确认。

### 2026-11-13 · 配色与Shell短列表自适应高度

**背景**：用户截图显示六项配色下方存在大面积空白，要求配色与Shell下拉均减少空白。

**决策**：配色新增独立菜单类，与Shell设置height:auto，上限320px与内部滚动保留；字体继续按之前要求固定高度，避免扩大本次调整范围。

**证据**：`TerminalSettings.tsx`配色`listClassName`改为`wb-terminal-palette-menu`；`styles.css`拆分字体固定高度和Shell／配色自适应高度，保持minWidthFromAnchor等宽。原型`#terminal-shell-menu,#terminal-palette-menu`只覆盖height:auto，字体规则未改。`npm run build`退出0、客户端1223526字符；`npm pack --ignore-scripts --pack-destination /tmp`生成六项1.0.0包527.3kB，shasum `0098f0d73a914c434b1e37206cba8cec1a3d9053`。主21110／宿主21141正常退出，退出门禁通过后官方desktop remove/add及`open -a "DeepSeek Harness"`均退出0；重启后主21679／宿主21710。

**遗留**：未追加测试、类型检查或浏览器视觉验收。

### 2026-11-13 · 下载文字入口右对齐并合并配色说明

**背景**：用户指出配色说明固定占两行，并标注选择框左侧为下载入口位置，要求使用与小字同字号的可点击文字。

**决策**：说明与已下载状态使用单段短文案；左侧标题行首放标签、末端放12px下载文字。视觉去掉按钮外观，保留原生按钮语义、键盘焦点与禁用，失败提示独立保留，窄面板自然换行。

**证据**：`TerminalSettings.tsx`将完成状态并入唯一说明段，下载使用`wb-terminal-text-action`；`styles.css`标题行`justify-content:space-between`，操作继承12px辅助字与18px行高，移除边框／背景；`i18n-en.ts`补合并说明译文。原型删除`terminal-palette-note`及对应JS引用，保持下载事件与语言切换。`npm run build`退出0、客户端1223351字符；`npm pack --ignore-scripts --pack-destination /tmp`生成六项1.0.0包527.2kB，shasum `7cc315aa31e638f3d837e2745f12ce422143aa1d`。主20521／宿主20552正常退出，退出门禁通过后官方desktop remove/add与`open -a "DeepSeek Harness"`均退出0；重启后主21110／宿主21141。

**遗留**：按约定不追加测试、类型检查或浏览器视觉验收；构建成功不代表实际显示已验收。

### 2026-11-13 · 配色下载动作前置与终端扩展英文

**背景**：用户截图显示下载按钮与离线说明堆在右侧选择器下，要求优化位置、工作台入口改为「终端扩展」并适配新增功能英文。

**决策**：下载动作置于左列配色标题旁，右列保持统一控制宽度，离线／失败信息归左侧说明。仅更名工作台开关，官方插件目录名称保留。已有配色词典沿用，补短动作与预览标签；固定示例代码拆分后不参与翻译，避免整段混排文案查词失败。依指定技能沿既有HTML隔离演示迭代，不另建原型项目；设计约定暂存`/tmp/terminal-layout-contract.md`。

**证据**：`src/client/TerminalSettings.tsx`的`wb-terminal-palette-heading`包裹标题与下载按钮，`Settings.tsx`开关及说明改名；`i18n-en.ts`补终端扩展、终端预览及短下载动作；`styles.css`沿用34px高度、弹性换行及650px面板断点。`docs/ui/ui-directions.html#demo=terminal-settings`同布局且增加配色语言切换，源码核对新ID、标签关联与下载／保存分离状态。`npm run build`退出0，客户端1222479字符，比前轮增加799；`npm pack --ignore-scripts --pack-destination /tmp`生成六项1.0.0包527.1kB，shasum `9a453f1f70b002b6802eca3d5f7763ea6f5567dd`。主19383／宿主19424正常退出，退出门禁通过后官方desktop remove/add及`open -a "DeepSeek Harness"`均退出0；重启后主20521／宿主20552。

**遗留**：不追加测试、类型检查、浏览器或真实界面验收。正式配色保存链路及官方终端接线保持既有实现。

### 2026-11-13 · 独立终端色板与Catppuccin显示适配

**背景**：用户要求实现独立配色与Catppuccin；官方公开字体与Shell设置，但完整ANSI色板与xterm实例没有公开跨插件入口。

**决策**：新增完整色板持久化和固定官方palette下载；自实现必要的本地显示层，复用官方插槽注入的TerminalView，保留创建／输入／控制权／关闭／重连归属。使用与官方一致的MIT xterm与FitAddon打入单文件，避免不完整的两色方案。只有独立色板启用时替换显示，恢复跟随或停用时撤销；不修改官方注册项或源码，不通过OSC伪造配置。

**证据**：官方`dsh-client-ui-sidebar-terminal/src/client/index.ts`的`sidebar.right.pane.tab`注册提供view、keyedHooks.terminal、hooks.theme；`terminal.tsx`使用mount／write／resize／acknowledge协议。实现入口`src/client/ColoredTerminal.tsx`，共享校验`src/shared/terminal-palette.ts`，固定源下载`src/server/terminal-palette.ts`，统一保存`src/client/TerminalSettings.tsx`。源码核对发现普通snapshot钩子必须传selector，已按官方bindSnapshotSelector接线。最终`npm run build`退出0、客户端1221680字符；`npm pack --ignore-scripts --pack-destination /tmp`生成六项1.0.0包，527.0kB，shasum `5285ee5e768219ce2d8d3110e8afd78a55854b7e`。主2760／宿主2834经SIGTERM正常退出，退出门禁通过后官方desktop remove/add与`open -a "DeepSeek Harness"`退出0；`pgrep -fl '^/Applications/DeepSeek Harness.app/Contents/MacOS/'`显示重启主19383／宿主19424。

**遗留**：遵循用户授权，仅构建、安装与重启；不追加测试、类型检查或界面验收。真实色板显示、程序OSC覆盖、输入控制权与重连行为尚未验收，不将源码契约核验当成运行时证据。

### 2026-11-13 · 字体下拉箭头对齐

**背景**：用户截图指出字体输入右侧下拉箭头样式异常，文本字符`⌄`随字体基线偏移。

**决策**：复用官方12px下拉SVG图标，在16px容器内flex居中并消除文本行高；保留右侧12px与仅装饰、不独立点击的输入式下拉行为。原型已使用SVG，无需改动。

**证据**：`TerminalSettings.tsx`使用`IconChevronDownOutlineRegular`，`styles.css`的`wb-terminal-font-chevron`改为固定尺寸居中；UI第0节同步。`npm run build`退出0，客户端850097字符；`npm pack --ignore-scripts --pack-destination /tmp`生成1.0.0六文件包。主PID96405／宿主96440，经SIGTERM正常退出后，带退出门禁的官方desktop remove/add及`open -a "DeepSeek Harness"`均退出0。

**遗留**：未追加测试、类型检查或真实界面验收，最终视觉仍需用户确认；未提交、推送或发布npm。

### 2026-11-13 · 修正终端保存与控件对齐

**背景**：用户反馈正式终端页点击保存无响应，字体与其他输入宽度不齐、展开按钮独立；指定prototype-craft调整输入式下拉、菜单等宽及固定高度，并要求字体预览放在字体设置下方。

**决策**：根因是混用SlotCore与插件侧SlotRegistry接口：前者有`isLive()`，后者只在内部hostFace提供，工作台直接调用会在保存try之前抛错。改以`entriesOfSlot`实际赢家身份确认接点，检查纳入失败处理，保存后显示成功提示。布局根因是官方Menu的className仅用于锚点根，listClassName才用于portal菜单；现锚点满控件列、菜单通过listClassName固定320px高及内部滚动，官方minWidthFromAnchor控制实时等宽，低高度受可用空间约束。字体输入直接展开，独立按钮改为不可点击箭头；预览紧随字体／字号、位于Shell前。原型仍用HTML/CSS/JS模拟数据，正式客户端复用原模型，无新后端或依赖。

**证据**：插件侧接口见`node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts`及`lib/client.js`的entriesOfSlot与hostFace；核心isLive见`dsh-client-ui-slots/lib/index.js:251`。Menu根与弹层映射见`dsh-client-ui-primitives/lib/index.js:2700–2748`，对应修复在`TerminalSettings.tsx`、`entry.tsx`、`styles.css`；视觉真源`demo-source-terminal-settings`去掉terminal-font-toggle及相关事件，预览移动并同步命令输入320px列。指定技能只静态阅读核对，未启动预览或浏览器。`npm run build`退出0、客户端849959字符；`npm pack --ignore-scripts --pack-destination /tmp`六项白名单、1.0.0、429.2kB。主PID93470／宿主93501，主进程SIGTERM退出；带退出门禁的官方desktop remove/add及`open -a "DeepSeek Harness"`均退出0。

**遗留**：按用户约定未追加测试、类型检查或真实界面验收；保存实际持久化、字体菜单低高度定位及全部控件最终几何仍需真实使用确认。后续宿主能力核验须区分核心内核与实际提供的服务实例，不能仅见同名公开类型就视为可调用。未提交、推送或发布npm。

### 2026-11-13 · 修正终端目录重复入口

**背景**：用户截图显示内置插件配置中有两个终端。上一轮以同名priority注册接管页面，只核对了详情渲染选举，漏查官方目录的原始ledger投影。

**决策**：移除工作台对`plugins.item#shell`的注册，保留原官方唯一目录项；通过公开`plugins.detail.section`挂载已有整页表单。按`entriesOfSlot`实际赢家核对官方条目及注入，监听开关和条目变化，卸载先取消订阅再撤扩展。仅扩展实际挂载时，以`[data-plugin-item-detail="shell"]>div:has([data-workbase-terminal-settings])>[data-plugin-config]`收起原官方表单；关闭／移除／渲染失败时恢复原表单，缺少`:has`时不接管展示。不改目录数据、注册对象或官方源码，不代点DOM保存。前置配置、字体访问、唯一按钮及原官方保存状态保护保留。

**证据**：官方`dsh-client-ui-plugin-manager/src/client/config-ledger.ts:61`直接对`entries('plugins.item')`做map，未按id去重；`PluginManagerPage.tsx:650–667`提供`data-plugin-item-detail`／`data-plugin-config`及随后渲染的详情扩展。接线位于`src/client/entry.tsx`的可选configForms／locale注入，样式位于`styles.css`终端适配段。`npm run build`退出0，客户端849002字符；`npm pack --ignore-scripts --pack-destination /tmp`生成1.0.0六文件包、428.9kB。本轮主PID92306／宿主92339，主进程SIGTERM正常退出，带桌面进程退出门禁的官方desktop CLI remove/add及`open -a "DeepSeek Harness"`均退出0。

**遗留**：按用户约定未追加测试、类型检查或真实界面验收；目录修正与单按钮显隐的实际页面效果尚需用户确认。宿主未来调整详情data属性或DOM层级时需同步核对适配，不能仅核对插槽注册类型。未提交、推送或发布npm。

### 2026-11-13 · 终端原型同步正式页

**背景**：用户确认将已调整原型同步正式代码，要求真实本机字体下拉、配置前置，并与官方命令限制共用唯一保存按钮。

**决策**：`entry.tsx`在官方`plugins.item#shell`就绪且仍为原赢家时按较低priority注册包装，继承原标签／摘要／locale及注入，订阅条目变化和显隐开关，卸载先停订阅再撤注册。`TerminalSettings.tsx`复用官方命令状态／动作与字体模型，唯一按钮按命令→字体→Shell协调；官方void保存以saving开始及结束、failed／dirty状态确认，30秒未知停止。任一失败保留未保存草稿，不回滚或重复写已成功域，离开中止后续步骤。字体列表在点击手势下调用浏览器`queryLocalFonts`，只展示真实family并去重／搜索，不支持或拒绝时保留手动输入。官方字段组件通过外层布局适配右侧320px控件列和650px容器断点，不新增运行时依赖。

**证据**：实现位于`src/client/TerminalSettings.tsx`、`src/client/entry.tsx`及`styles.css`终端段；README、PRD、UI第0节和本日志当前状态已同步。`npm run build`退出0，客户端848925字符，相对上一轮840295增加8630字符。`npm pack --ignore-scripts --pack-destination /tmp`生成1.0.0包，六项白名单、428.9kB。本轮主PID87757／宿主87789，主进程SIGTERM正常退出；安装命令先确认桌面进程退出，官方desktop CLI remove/add均退出0，安装`dsh-workbase@1.0.0`后`open -a "DeepSeek Harness"`退出0。

**遗留**：按用户约定未追加测试、类型检查或浏览器／真实宿主验收；本机字体权限、官方页面条目热切换、跨域部分失败及默认Shell新建终端行为仍需真实使用确认。构建安装结果不代表这些行为已验收。未提交、推送或发布npm；独立终端配色和Catppuccin继续待公开接口。

### 2026-11-13 · 终端配置前置与整页单按钮方案

**背景**：用户继续要求字体等新增项插到官方命令配置上方，并与官方共用同一个保存按钮。

**决策**：纠正此前只考虑detail.section追加能力的判断。公开SlotCore允许同名list条目按不同priority共存并选取最低值作为展示者，可基于此适配终端页表现层，复用官方命令表单的注入状态、校验与保存动作；不需修改官方源码或模拟点击DOM。统一按钮仍是多个域的保存编排，不承诺跨域原子写入。原型移除官方独立保存，将字体／字号／Shell和字体预览放到命令限制前，底部仅一个保存。

**证据**：`node_modules/@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts:773–781`明确list同id的priority选举与精确优先级冲突；`dsh-client-ui-settings-shell/src/client/index.ts:51–53`注册官方`shell`，注入ShellCardController状态及动作；`shell-card-controller.ts:60–61`返回hook与form.actions。`PluginManagerPage.tsx:664–667`仍只在官方表单后渲染detail.section。原型`demo-source-terminal-settings`的officialDraft／officialDirty及统一save分步调用三个mock保存，已成功部分更新saved，失败草稿保留且重试不重复写入。

**遗留**：本轮仅改原型与记录，正式适配尚未实施，仍需处理官方条目热重载、原始注入生命周期及void保存动作的状态确认；未构建、安装、重启或浏览器验收，未提交或推送。真实字体列表能力仍待确认。

### 2026-11-13 · 终端字体下拉与保存布局原型

**背景**：用户反馈终端页字体需要已安装字体下拉，配置过长且保存按钮重复，指定prototype-craft优化布局。

**决策**：在既有原型内追加隔离演示，不改正式运行代码；字体可搜索下拉兼容手动输入，短控件右对齐且窄面板上下排列，新增三项合并为底部一次保存。官方命令表单保存保留；不画成当前公开接点已经支持整页统一提交。模拟两个持久化域的部分成功，保留失败部分草稿并跳过已成功写入。

**证据**：原型`docs/ui/ui-directions.html`的`demo-source-terminal-settings`及两个演示选择器，加载器兼容惰性template，与既有JSON演示共用缓存与iframe。`sync-ui.mjs:168`只读取无属性的style，演示style标记data-demo-library，不进入正式CSS生成。官方`dsh-client-ui-theme/src/client/FontFamilyRow.tsx`仅提供文本输入；`dsh-client-ui-settings-shell/src/client/ShellCard.tsx`直接调用官方SettingsForm，`shell-card-controller.ts`拥有自己的SettingsFormModel。对实际app.asar桌面／主题源文件执行queryLocalFonts/listFonts/fontList/local-fonts/font-access/font-manager定向搜索，读取12文件无命中；这不证明所有宿主模块均不存在能力。按指定技能只静态核对源码，既有8765预览服务可供用户打开。

**遗留**：真实字体枚举需要后续核验本地字体访问能力；当前原型只使用示例字体。正式组件仍是分区保存，未构建、安装、重启或浏览器验收，未提交或推送。

### 2026-11-13 · 官方终端配置落地

**背景**：用户确认落地字体、字号及默认Shell，要求开关在工作台「其他组件 → 终端」，字段在官方「插件 → 终端」页。

**决策**：新增默认关闭的`terminalSettingsVisible`，增量命令去除默认值，兼容旧持久化状态；通过可选`configForms`与公开`plugins.detail.section`挂载，字体复用官方revision-fenced暂存模型。Shell以官方`mainView`持有计数选取唯一真实会话，通过可选`webTerminals`发现与保存；与字体分别保存，旧请求中止，保存时重核身份。配色无已确认公开接点，继续保留待实现项。

**证据**：实现见`src/client/TerminalSettings.tsx`、`entry.tsx`、`Settings.tsx`，数据链见`src/shared/model.ts`、`commands.ts`、`src/server/service.ts`；官方主视图判定可复现于`node_modules/@deepseek-ai/dsh-client-ui-session/lib/client.js:989–990`，终端发现／保存契约见上条核验记录。`npm run build`退出0，客户端840295字符；`npm pack --ignore-scripts --pack-destination /tmp`生成`/tmp/dsh-workbase-1.0.0.tgz`，六文件、426.7kB。主PID82621经SIGTERM退出，带进程退出门禁的官方desktop CLI remove/add均退出0，重新安装`dsh-workbase@1.0.0`，`open -a "DeepSeek Harness"`退出0。

**遗留**：按用户约定不追加测试、类型检查或界面验收，真实服务启停、字体热更新与默认Shell新建终端尚未验收；独立配色及Catppuccin仍待公开接口。未提交、推送或发布npm。

### 2026-11-13 · 官方终端页面扩展与配置契约核验

**背景**：用户指定终端美化开关放工作台「其他组件 → 终端」，字体、字号、配色与默认启动器放官方「插件 → 终端」，要求先核验官方接口。

**决策**：官方终端详情扩展采用公开`plugins.detail.section`，不替换已占用的`plugins.item#shell`。字体／字号复用`ui-theme`与`ctx.configForms.get('ui-theme').mutate(ops, expectedRevision)`，支持暂存保存、拒绝和并发冲突处理；官方`theme.setFontFamily('terminal', value)`／`setFontSize('terminal', px)`也已有即时写入入口。默认启动器优先限定为浏览器记忆的交互Shell，通过官方发现／选择接口；不把部署级Shell配置误判为在线可编辑。独立ANSI配色无已确认公开面，OSC是程序输出路径，不作为配置页直接应用方案。

**证据**：从`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`读取根package.json确认版本／提交，按`check-host.mjs`的archive读取方式提取官方src至`/tmp/dsh-terminal-5gB1fc`；以下路径相对于归档`dsh/node_modules/@deepseek-ai/`：`dsh-client-ui-plugin-manager/src/client/slot-contract.ts:185`声明扩展插槽，`PluginManagerPage.tsx:646–667`将item主体传入并在原表单后渲染；`dsh-client-ui-settings-shell/src/client/index.ts:51`注册`shell`，`shell-card-controller.ts:10–12`确认两平台条目。`dsh-client-ui-theme/src/index.ts:38–46`声明volatile字段，`theme-settings.ts:60`确定字号范围，`dsh-client-ui-sidebar-terminal/src/client/terminal.tsx:95–155`确认xterm读取和热更新；`face.ts`未暴露xterm或调色板。`dsh-api-terminal-controller/src/client/index.ts:180–191`为发现／选择接口，`shell-preference.ts:2`记录localStorage键`dsh.terminal.shell`，`src/index.ts:112–126`部署配置未声明volatile；`dsh-settings/src/index.ts:384–389`拒绝非volatile写入。`dsh-client-ui-sidebar-terminal/src/client/terminal-theme.ts`只由内部实例管理OSC与主题颜色，未导出跨插件配置服务。

**遗留**：源码核验不证明当前连接的服务全部就绪或实际界面行为。Shell发现需要真实会话及其执行环境；浏览器偏好不改变已有终端、系统默认Shell或Agent命令执行器。尚未实现任何终端功能；完整Catppuccin下载与独立配色应用需另行确定接点，不能仅凭下载成功视为生效。

### 2026-11-13 · 内置模式文案按来源翻译

**背景**：用户要求标准、PTC、极简、创造模式的名称与说明跟随工作台语言，用户自定义模式保留原文。

**决策**：服务端沿用既有“官方已知ID且未提供自定义名称”的识别方式，仅为工作台补充的文案返回 builtIn 标记；客户端 presetText 在渲染时翻译，快捷输入的选择器和待办菜单共用。模式ID与发送参数不变，不按用户名称是否命中词典决定翻译。

**证据**：`src/server/host.ts` 的 catalog 原本补充四组固定中文名称／说明；`src/client/Composer.tsx` 和 `TodoDetail.tsx` 之前直接显示 p.name。词典新增三种模式名称及四条说明，待办初始兜底名称延迟读取当前译文。

**遗留**：构建、官方CLI安装和重新启动命令均成功，结果见当前状态；按用户约定未追加测试、类型检查或实际界面验收。后续新增内置模式需同时补服务端识别与词典。

### 2026-11-13 · 英文布局挤压与待办详情黑屏修复

**背景**：用户反馈英文顶栏搜索与同步状态重叠、一级设置导航换行，以及待办详情／完整新建打开黑屏。

**决策**：补回 TodoDetail 的 useEffect 导入；顶栏搜索参与弹性布局，按其他控件实际宽度避让，保留36px等高与既有面板断点。英文一级导航使用简洁的 Appearance 并保持单行，说明与二级页签仍可断行。快捷输入的模式名称和说明来自官方配置，继续保留原值。

**证据**：`src/client/TodoDetail.tsx` 的三个组件调用 useEffect，原首行未导入；`docs/ui/ui-directions.html` 的顶栏原以固定左右宽度绝对定位，英文按钮增长不会改变预留宽度。样式修改位于真源，构建同步生成物。

**遗留**：构建、官方CLI安装和重新启动命令均已成功，结果见当前状态；遵循用户约定未追加测试、类型检查或真实界面验收。官方配置的中文模式名称和说明仍按原值显示。

### 2026-11-13 · 工作台中英文与官方语言服务接入

**背景**：用户批准开始多语言支持；默认跟随 Harness，统计卡与三类扩展继续后排。

**决策**：按实际0.2.2-rc.2的`LocaleRuntime.getSnapshot/subscribe/register`契约可选接线；工作台语言单独持久化，不改宿主全局语言，官方复用控件保持各自语言命名空间。静态中文与模板通过构建AST接入词典，模块级表采用延迟视图；用户数据不遍历、不替换。逻辑比较、共享优先级标签和后端已知错误显式适配，待办Agent草稿保持原内容。

**证据**：实际归档`dsh-client-locale/src/client/index.ts`公开了active语言快照、订阅与字典注册；源码入口为`src/client/i18n.ts`、`i18n-en.ts`、`localize-ui.mjs`，偏好与保存契约在`src/shared/model.ts`、`commands.ts`及`src/server/service.ts`。最终`npm run build`通过（828651字符），六文件1.0.0安装包为423.0kB；SIGTERM正常退出主进程后，带退出门禁的官方desktop CLI remove/add与`open -a "DeepSeek Harness"`均返回0。

**遗留**：按用户约定不追加测试、类型检查或真实宿主语言／视觉验收；未知宿主错误保持原文，HTML原型只展示设置与布局，不代表实际切换证据。

### 2026-11-13 · 安装包跟随推断版本并安装重启

**背景**：用户要求安装包版本随更新同步，并明确授权安装和重启；先前语音改动包仍沿用0.3.1。

**决策**：直接使用仓库commit-analyzer与releaseRules推断下一版本，不按提交数量逐次加版本；0.3.1后的major提交共同落到1.0.0。同步源码包和锁文件元数据，通过既有文档同步插件更新当前状态。首次安装命令因未包含退出检查被自动审批拒绝；只读确认进程已退出后，在命令中加入“检测到桌面进程则停止安装”的门禁，再替换插件。

**证据**：commit-analyzer分析`v0.3.1..HEAD`12个提交得到`major → 1.0.0`；`npm run build`输出客户端746826字符；`npm pack --ignore-scripts --pack-destination /tmp`输出六项白名单的`dsh-workbase-1.0.0.tgz`。官方CLI remove/add退出码0，安装目录package.json读回`dsh-workbase@1.0.0`；`open -a "DeepSeek Harness"`退出码0，`pgrep -fl '^/Applications/DeepSeek Harness.app/Contents/MacOS/'`读到桌面主进程72715与宿主72760。

**遗留**：未发布npm、生成发布标签、提交或推送。未追加测试、类型检查或界面验收；实际麦克风授权、识别、冲突回填及插件启停行为仍未验收。

### 2026-11-13 · 语音入口动态跟随官方套件启停

**背景**：用户进一步明确语音入口需要随插件启用状态显隐，不能以是否安装作为判断。

**决策**：沿用官方活跃插槽探测，补上按键订阅`slots.subscribe('conversation.input.activity', updateMenu)`；注销时同时释放订阅和镜像。停用撤下组件，让官方取消录音／转写并释放展开状态；已启用但识别器未准备时保留官方准备入口。

**证据**：`src/client/entry.tsx`的`updateMenu`读取`entriesOfSlot`活跃占位者，新增专门订阅；SDK `dsh-client-ui-slots/lib/types/index.d.ts:826–838、868–875`分别定义活跃占位者查询和注册变化订阅。`npm run build`通过，客户端746826字符；`npm pack --ignore-scripts --pack-destination /tmp`更新六项白名单的0.3.1包。

**遗留**：本轮未追加测试、类型检查或真实宿主启停验收。安装及重启仍受前次自动审批拒绝阻塞，未再次执行。

### 2026-11-13 · 快捷输入复用官方语音控件与选区保护

**背景**：用户要求按源码核验方案补上语音活动插槽挂载与光标适配；工作台只镜像命令及模型插槽，textarea选区采用展开文字坐标，不能直接当作宿主原子节点坐标使用。

**决策**：镜像官方`voice-input`组件及完整注入与子插槽，保留录音、准备、停止、取消与冲突流程；只适配选区动作并委托官方写入。引用内部位置依照官方投影规则移到引用之后；同时校验revision、草稿文本、输入锁定和20000字符上限。活动展开保留组件挂载、隐藏辅助控件并禁用发送；项目／模式切换立即撤下旧活动，防止旧结果回填。按用户长期约定不追加测试或浏览器验收，不安装或启用语音套件。

**证据**：本机宿主`0.2.2-rc.2`归档内`dsh-experimental-client-ui-voice-input/src/client/mount.ts:54–56`注册活动；`VoiceInput.tsx:118–122`通过`InputActions`写入，`projection.ts:2–7`定义剪贴板与原子节点两种坐标。工作台接线见`src/client/entry.tsx`、`NativeComposer.tsx`的`composerActivityActions`及`Composer.tsx`；需求、UI规范、视觉真源和README同步。`npm run typecheck`及`npm run build`通过，客户端746763字符；`npm pack --ignore-scripts --pack-destination /tmp`生成六项白名单的0.3.1包。退出主进程、官方CLI remove/add和open重启的整条命令被自动审批拒绝，未执行。

**遗留**：待本轮明确授权后安装和重启；自动审批要求对进程终止及插件卸载／安装另行确认，未接受既有长期授权。实际麦克风授权、SenseVoice模型准备、转写准确度及真实宿主界面未验收；语音阶段不是公开状态流，仅由官方组件自己展示。

### 2026-11-13 · 外观布局二级菜单顺序落地

**背景**：用户确认将顺序演示落实到正式代码，要求首页模块、统计卡片、主题配色依次排列。

**决策**：仅重排正式共享页签的选项数组与主原型按钮，默认页、统计显隐和已有交互沿用；同步需求及UI规范。

**证据**：`src/client/Settings.tsx`的appearance页签与`docs/ui/ui-directions.html`主设置按钮按layout/stats/theme排序；`npm run build`通过，客户端743253字符，官方desktop CLI remove/add均退出0。

**遗留**：按用户约定未追加测试、类型检查或真实界面验收；未提交或推送。

### 2026-11-13 · 插件更新接口适配与兼容审查补漏

**背景**：官方插件页发现dsh-context新版本，工作台误判不可更新；先前维护文档要求核对插件更新，脚本却漏扫插件管理模块，测试与手写契约仍使用旧字段。

**决策**：优先探测新版update，保留旧updatable兼容；Git更新需提交与spec，继续交由官方页面。扫描清单补服务和页面，读取随包源码／声明并记录类型契约指纹；BundleInfo明确字段与门禁不依赖基线核对。旧基线不足持续提示待复核，不以首次采集作为通过。

**证据**：修复前`npx tsx --test test/plugin-update.test.ts test/host-check.test.ts`出现2项预期失败；修复后3个相关文件24项通过、类型检查通过，`npm test`248项通过，构建客户端743253字符。`npm run host:check`识别宿主update且0阻断、23待复核；新增用例覆盖新版无updatable、Git优先、旧门禁拒绝、字段缺失／类型变化、声明变更／删除及缺少基线。

**遗留**：声明指纹只提示复核，明确字段静态核对不是完整RPC契约证明；真实在线更新与界面未验收。旧基线的23项待复核保留，未提交或推送。

### 2026-11-13 · 外观布局二级菜单位置对照

**背景**：用户指定rapid-prototype-craft，要求优化外观布局二级菜单位置。当前正式页按分类标题、说明、页签纵向排列，页签随正文滚动。

**决策**：推荐右侧内容区顶部固定页签，一级分类已在左侧选中，删除重复标题和说明可减少顶部占位。提供标题同排与现有排列作对照，窄面板同排方案换行。只迭代现有隔离演示，三方案移动同一导航节点，避免草稿丢失和重复事件绑定；不改正式页面位置或共享视觉规则。

**证据**：`docs/ui/ui-directions.html`的`demo-source-appearance-layout`新增`tab-position`选择器、`content-shell`／`tabs-dock`／`content-heading`与`positionTabs`。静态JSON解析与`vm.Script`语法编译通过，29个静态ID及关联有效，无外部依赖；`curl`访问本地8765端口的原型返回200。工具条可切换三方案、面板宽度及模拟宿主明暗，默认首页模块。

**遗留**：用户随后澄清是显示顺序优化，要求还原UI；上述位置对照已移除，隔离原型恢复原布局，仅调整为首页模块／统计卡片／主题配色。正式客户端仍保留现有位置和顺序。未启动浏览器、未截图；未构建、安装或重启桌面端。

### 2026-11-13 · 外观布局接入正式设置

**背景**：用户认可合并方案及通用配置首位排序，随后明确要求实现正式代码。

**决策**：一级菜单保留五项，外观布局复用`SettingsSubtabs`为主题／首页／统计提供同级页签；主页默认外观布局的首页模块，项目详情继续默认项目配置。只改变页面组织，复用既有`theme`、`home`偏好与保存事务，统计关闭时保留卡片和时间范围，最近会话样式仍按原联动恢复。主原型同步，并将旧预览URL的`home/theme`映射到外观布局，避免旧入口失效。README移除待实现项，现行需求和设计记录同步。

**证据**：实现位于`src/client/Settings.tsx`的`categories`、`appearanceTab`和三个`wb-settings-appearance-panel-*`；原型由`workspaceSettings`、`selectAppearanceSettingsTab`接线。现有`test/settings-render.test.ts`仅同步文案与ID断言，未新增或运行测试。`npm run build && npm pack --ignore-scripts --pack-destination /tmp`退出0，客户端743080字符，0.3.1包6项白名单、399.4kB。通过`osascript`退出应用，应用自带CLI执行`plugin --profile desktop remove dsh-workbase`与`add /tmp/dsh-workbase-0.3.1.tgz`成功，随后`open -a "DeepSeek Harness"`退出0。

**遗留**：遵循用户既有约定未追加类型检查、测试、安装一致性检查或界面验收；安装及启动命令成功不等于真实界面与交互已验收。本轮安装包在`/tmp`，仓库根旧同版本tgz不代表本轮构建。未提交或推送。

### 2026-11-13 · 外观布局合并备选原型

**背景**：用户要求评估将「外观配置」与「首页展示」合并，指定使用rapid-prototype-craft；实际代码为「首页显示」下的模块布局、统计设置，以及独立外观配置。

**决策**：推荐单一入口、三个二级页签，默认首页模块，避免增加嵌套页签或将所有控件堆成长页。关闭统计时隐藏统计页签并保留选项，主题与首页继续使用现有字段。遵循唯一HTML入口，将备选原型嵌入现有JSON隔离演示，不改正式设置。主题跟随与默认主题仍为两个选项，其是否合并属于另一规划项。

**证据**：源代码参考`src/client/Settings.tsx`的`homeRows`、`statCardRows`、`SettingsSubtabs`及`src/shared/model.ts`的默认值；`docs/ui/ui-directions.html`新增`demo-source-appearance-layout`。静态解析该JSON并以`vm.Script`仅编译内联脚本，核对27个静态ID及关联有效、无外部依赖；未执行原型脚本。入口在UI规范的演示目录可复现。

**遗留**：用户认可合并方案，并要求「通用配置」位于第一项，原型导航已调整为「通用配置／外观布局／项目配置／备份恢复／其他组件」。未修改正式客户端或存储契约，未构建、安装或重启桌面端；未启动浏览器或截图，静态检查不代表视觉验收通过。

### 2026-11-13 · 搜索文案统一为待办描述

**背景**：用户指出搜索空态和页脚仍使用「备注」，当前待办内容统一称为「描述」。

**决策**：搜索空态改为「待办标题与描述」，命中标签改为「待办描述」，页脚按实际范围显示「标题与描述匹配」或「正文与描述匹配」；同步原型和现行规范，保留内部note字段。

**证据**：`src/client/Search.tsx`及`docs/ui/ui-directions.html`包含对应文案；`npm run build`退出0，客户端743093字符。0.3.1本地包6项白名单文件，官方desktop CLI remove/add及桌面重启整条命令退出0。

**遗留**：按用户长期约定未追加测试、检查或界面验收；未提交或推送。

### 2026-11-13 · 修复插件启用错误及搜索提示条件

**背景**：用户截图显示Cordis未导出FiberState；上一轮误将const enum类型声明用于运行时导入，导致工作台无法启用。用户进一步明确启用无提示、停用仅标题，以及默认隐藏的套件不提示依赖。

**决策**：移除运行时枚举导入，用公开ACTIVE值2判断生命周期；快照按实际服务提供状态同步搜索能力，前端随状态取消正文请求并调整输入提示。缺失及停用返回空正文结果，不抛依赖错误；只有官方包元数据无错误、平台支持且未默认隐藏时提示可添加套件，状态未知保守不提示。

**证据**：`src/server/session-search.ts`中的status读取`pluginPackages.packageOf/metaOf`，search仅解析隔离组提供者；`npm run typecheck`、`npm run build`退出0，客户端743093字符。`npm pack --ignore-scripts --pack-destination /tmp --json`产出0.3.1包及6项白名单文件；应用自带CLI对desktop执行remove/add并通过`open -a 'DeepSeek Harness'`重启，整条命令退出0。

**遗留**：按用户长期约定未追加测试或界面验收；真实启停、正文命中及工作台启用界面尚未验收。未安装或修改实验套件、主索引，未提交或推送。

### 2026-11-13 · 正文搜索改用官方历史会话搜索实验套件

**背景**：用户要求正文搜索由可启停的官方实验套件控制，移除工作台对不可独立配置的主索引接线，并在会话搜索列表下方提示依赖。

**决策**：新增`src/server/session-search.ts`，按官方`optional-session-search`隔离组及两个子节点精确探测服务；使用Cordis公开Entry.disabled、FiberState.ACTIVE、Context.get和Fiber.provisions确认归属及就绪，不访问Service受保护的ctx。Cordis服务读取会返回追踪代理，故用稳定provision身份复核在途请求，不比较代理对象。只借用实验组搜索服务，不创建或回落主索引，不删除宿主或套件的内部模块；仍允许按需使用官方精确标题读取。限定可访问主会话ID后再排名，避免主接口先截取全局结果的漏项。

**证据**：实际`0.2.2-rc.2`应用包中实验套件README与cordis.patch.yml声明`optional-session-search`隔离`sessionQuery`，索引子节点为`optional-session-query-sqlite`，工具子节点为`optional-tool-session-query`。本地`npm run typecheck && npm run build`退出0，客户端742807字符；`npm pack --ignore-scripts --pack-destination /tmp --json`输出6项白名单文件；官方desktop CLI remove/add及`open -a "DeepSeek Harness"`退出0。

**遗留**：未自动安装或启用实验套件，未执行测试、真实正文命中或插件启停界面验收；官方实验组行标识及公开服务合同发生变化时需按兼容流程更新，未知结构明确提示不可用，不使用主索引兜底。

### 2026-11-13 · 搜索分类隔离正文请求

**背景**：首页全局搜索切换到项目或待办仍请求会话正文，并显示无关的检索状态与失败提示。

**决策**：在`Search.tsx`以是否为全部／会话分类控制正文效果，分类退出复用原有清理逻辑取消计时和请求；渲染层同步隔离正文状态，避免效果执行前短暂显示旧提示。切回重新查询，保留本地筛选规则。

**证据**：`npm run build`退出0，客户端742440字符；`npm pack --ignore-scripts --pack-destination /tmp --json`输出6项包文件；官方CLI对desktop执行remove/add均退出0，`open -a "DeepSeek Harness"`退出0。

**遗留**：按用户长期约定未追加测试、安装一致性检查或界面验收；宿主先截取正文结果再按工作台项目过滤的漏项限制仍保留。

### 2026-11-12 · RSS分组操作收至分组栏

**背景**：用户指出我的订阅顶部刷新、设置及添加分组占据内容空间，要求简化并优化添加分组位置。

**决策**：移除列表刷新和设置入口，保留订阅详情刷新；添加与编辑分组使用共用36px图标按钮，置于左侧自定义分组标题右侧。标题与操作独立于分组滚动区，窄面板继续显示，避免依赖隐藏的分组列表。

**证据**：`docs/ui/ui-directions.html`的`integrationPanel`分离`groupHeading`和`integration-group-list`，RSS工具栏不再生成刷新／设置／分组按钮；`.integration-group-heading`复用主题与36px尺寸。三个执行脚本以`node:vm`的`Script`静态解析。

**遗留**：仅修改原型及文档，未执行浏览器视觉验收、构建、安装或提交；自动刷新配置未新增替代入口。

### 2026-11-12 · 三类扩展统一导入导出菜单

**背景**：用户要求技能、MCP、RSS增加导入导出二级菜单，并移除按钮类入口。

**决策**：三类均使用「导入与导出」页签，页内通过共用统计分组导航样式的菜单行进入原有详情流程；去掉列表工具栏按钮和RSS操作卡片，保留预览、选择候选及下载等流程内必要操作。补齐技能JSON导出与导入，导出原作用域供参考，导入明确使用所选目标作用域，同名候选跳过；不打包关联文件。

**证据**：真源`docs/ui/ui-directions.html`的`integrationMenus`、`integrationRecords`与`integrationPanel`统一入口；`integrationFinishDetail`、`integrationImportPreview`及下载处理区分三种格式。内联执行脚本使用`node:vm`的`Script`作静态语法解析，未执行浏览器视觉验收。

**遗留**：仍为浏览器本地演示，未接入正式技能／MCP／RSS能力；本轮未构建、安装、重启或提交。

### 2026-11-12 · 统计待办增加创建入口

**背景**：用户要求待办页增加添加待办按钮，点击进入创建弹窗。

**决策**：统计待办页标题操作共用36px主按钮，复用`openTodoEditor`而不复制表单；默认分组项目，可选择活跃项目。`statsReturn.creating`区分新建与已有待办，复用原统计弹窗隐藏／恢复机制，创建成功局部刷新待办统计，保留筛选和滚动。

**证据**：视觉真源`statsPanel`生成`stats-create-todo`，`openStatsTodoCreate`记录返回状态，`refreshStatsTodoList`重新绑定待办分组并恢复搜索／选中／滚动；保存分支允许明确的新建返回状态，编辑仍保留原待办不可访问检查。项目选择同步保存按钮归属，首页数字由`integrationRefreshCards`刷新。

**遗留**：仅原型及文档修改，未接入真实待办服务；未做浏览器验收、完整工程测试、构建、安装或重启。

### 2026-11-12 · 诊断重新检查复用扩展主按钮

**背景**：用户要求诊断页重新检查按钮与技能页添加技能按钮保持一致。

**决策**：诊断刷新按钮加上共用primary类，与扩展标题操作共用36px尺寸规则，移除原32px底色、14px图标、6px间距及诊断专属悬停／禁用覆盖。

**证据**：视觉真源`statsPanel`生成`diagnostic-refresh primary`，尺寸与`.integration-heading button`共用同一规则，颜色采用`.app button.primary`的主题令牌。静态核对检查中disabled与原refresh事件保留。

**遗留**：仅更新原型与UI文档，未做浏览器验收、工程测试、构建、安装或重启。

### 2026-11-12 · 诊断内容区移除重复分类标题

**背景**：用户标注诊断内容区「空会话 · 0」及下方分隔线，要求内容区不显示标题。

**决策**：移除原型右侧分类标题行，左侧继续显示分类与数量；空状态正文和顶部项目诊断标题保留。筛选后的分类与数量写入结果区域aria-label，避免重复视觉信息。

**证据**：`docs/ui/ui-directions.html`的`statsDiagnosticBrowser`不再生成`diagnostic-list-header`，`bindStatsGroups`更新结果区域标签，避免访问已经移除的标题节点；同步PRD与UI规范。

**遗留**：仅原型及文档调整，未做浏览器验收、工程测试、构建、安装或重启。

### 2026-11-12 · 扩展分组搜索位置与统计页统一

**背景**：用户指出MCP市场分组与卡片间有竖线，要求有分组页面将搜索框移至分组上方，与运行中、会话保持一致。

**决策**：共享`integrationPanel`只生成一个搜索节点，有分组挂在左栏，无分组挂在工具栏；左栏复用统计210px／180px宽度和36px搜索样式，分组与内容不设边界线。窄面板保留左栏搜索，将分组列表替换为现有选择器，避免隐藏搜索或生成双搜索。

**证据**：视觉真源`integrationPanel`的`search`、`aside`、`tools`负责条件挂载，`.integration-groups`取消border-right，`.integration-group-list`独立滚动；原`data-i-query`事件仍按所在`data-integration`更新页面搜索与结果。

**遗留**：仅更新原型与文档，未做浏览器验收、工程测试、构建、安装或重启。

### 2026-11-12 · 扩展卡片启停改为共用开关

**背景**：用户要求把卡片上的启用／关闭文字按钮改为开关。

**决策**：复用设置checkbox开关的32×18px轨道、14px滑块、主题色与禁用样式，卡片提供36px点击区域；使用原生checkbox及switch语义，沿用原启停事件和焦点恢复。添加、恢复、导入与导出仍为文字按钮。

**证据**：`docs/ui/ui-directions.html`的`integrationRow`生成`.integration-card-switch`，共享样式由`.workspace-settings :is(.setting-row input[type=checkbox],.integration-card-switch)`定义；click仅调用原`integrationToggle`，change未追加启停调用，避免重复切换。同步UI规范。

**遗留**：仅原型及文档修改，未做浏览器验收、工程测试、构建或安装重启。

### 2026-11-12 · 统计概览移除横向底栏

**背景**：用户提供市场底部截图，要求统计卡弹窗不设footer，内容延伸到底部，底部操作归左侧栏。

**决策**：`openStats`不再传入关闭footer，分类菜单与「关闭概览」采用独立侧栏容器，侧栏底部以主题横线分隔操作；窄屏隐藏重复关闭入口，保留右上角关闭。详情编辑中的保存／取消仍保留，避免丢失必要表单操作。

**证据**：视觉真源的`openStats`与`.stats-sidebar`定义负责无footer结构、侧栏滚动和底部操作，关闭继续复用`close-modal`事件；UI规范第0节与第5节同步例外。按源码核对菜单绑定仍通过`data-settings-tab`寻找原分类按钮。

**遗留**：仅更新HTML原型及文档，未做浏览器验收、工程测试、构建或安装重启。

### 2026-11-12 · 扩展卡片精简并直接启停

**背景**：用户反馈卡片信息偏多，要求简化并在卡片上显示按钮，已启用可直接关闭。

**决策**：共享卡片渲染仅保留图标、名称、一行用途说明和一个36px文字按钮；启用状态通过「关闭／启用」按钮表达，异常用紧凑提示图标。隐藏地址、作用域、工具数和检查时间，完整内容仍在详情；MCP与RSS卡片改为直接启停，刷新留在详情，市场条目复用已经添加的记录，避免重复添加。

**证据**：`docs/ui/ui-directions.html`的`integrationRow`统一生成文字按钮，`integrationToggle`在列表刷新后恢复操作按钮或二级菜单焦点。UI规范第0节与PRD第10节同步卡片精简规则。

**遗留**：仅更新原型及文档，启停仍为浏览器演示数据；未做浏览器验收、完整工程测试、构建或安装重启。

### 2026-11-12 · 扩展条目统一卡片并打开详情弹窗

**背景**：用户提供市场卡片与带侧栏的配置弹窗截图，明确要求技能、MCP、RSS内容卡片化，点击后进入新的弹窗，替代此前管理内容区配置页。

**决策**：在视觉真源复用卡片主题、共享详情渲染与表单，详情作为管理弹窗内覆盖整个面板的独立dialog层，提供返回、关闭、分区导航及固定底部操作。底层保留但设为inert，避免重复弹窗创建破坏原筛选、滚动与草稿；关闭恢复管理页，MCP配置／授权与RSS文章仍在详情层内连续切换。

**证据**：`docs/ui/ui-directions.html`中的`integrationMountDetail`、`integrationFinishDetail`、`integrationBack`与`bindIntegrations`分别负责详情层、菜单、返回状态及事件；`.integration-records`采用两列／无分组宽屏三列／窄屏单列，卡片标题伪元素覆盖点击区域，快捷操作单独置于上层。同步PRD第10节与UI规范第0节，按源代码核对分区目标、关闭事件与焦点范围。

**遗留**：仅更新HTML原型及文档，未接入真实服务，未运行浏览器视觉验收或完整工程测试、构建、安装和重启。

### 2026-11-12 · 顶栏搜索和按钮统一36px

**背景**：用户要求顶栏搜索及按钮采用项目里的36px高度，并考虑Windows和macOS。

**决策**：在视觉真源统一搜索、直属操作和同步按钮为36px，顶栏仍用已对齐宿主的52px，窄面板按钮同时调为36px方形。快捷键提示使用相对居中；删除宿主适配层macOS单独32px覆盖，保留窗口控制区避让与no-drag交互。

**证据**：真源`.app-header .global-search input`、`.header-actions>button`与`.sync`定义及`styles.css`对应覆盖移除可复现变更；构建和安装结果在当前状态补记。

**遗留**：未执行Windows真实标题栏或macOS视觉验收；未提交或推送。

### 2026-11-12 · 窄待办缩短附件计数

**背景**：用户进一步允许空间不足时附件只显示图标和数字，并要求保留创建信息省略。

**决策**：按待办正文实际容器宽度切换，300px及以下隐藏单位文字，宽度恢复后显示完整计数；保留完整悬停及读屏名称，不缩小字体，不改变创建信息弹性省略。

**证据**：`src/client/Detail.tsx`和真源todoRow将单位拆为todo-attachment-unit；真源`@container workbase-todo (max-width:300px)`仅隐藏单位。构建、验证与安装在当前状态补记。

**遗留**：未进行真实面板拖动或浏览器视觉验收；未提交或推送。

### 2026-11-12 · 待办附件数量在窄宽度保持同行

**背景**：用户截图显示附件数量整块掉到下一行；真源`.todo-meta-line`设为flex-wrap:wrap，优先级和创建信息占满剩余宽度。

**决策**：元信息行改为nowrap，附件计数固定宽度；创建信息允许收缩并单行省略，通过title保留全文，优先级文字也保持单行。不缩小字号，不修改生成物。

**证据**：`docs/ui/ui-directions.html`中`.todo-meta-line`及`.todo-attachment-count`定义、`src/client/Detail.tsx`中创建信息title可复现变更；构建自动同步prototype.css，验证与安装结果在当前状态补记。

**遗留**：未执行浏览器几何检查或真实窄宽度视觉验收；未提交或推送。

### 2026-11-12 · 修复启动时默认蓝色主题闪现

**背景**：根组件首帧快照为null，原主题表达式直接回退follow；异步设置返回后才应用用户主题，导致启动闪色。

**决策**：在既有界面记忆键中缓存已确认主题，并由入口快照接收和根组件已接受快照同步；首帧先读缓存。未缓存时隐藏顶栏但保留占位，继续使用中性骨架，避免新建一套加载样式。缓存不包含设置预览和明暗状态，服务端设置保持权威。

**证据**：`npx tsx --test test/loading.test.ts`修改前新增3项失败，修改后`npx tsx --test test/loading.test.ts test/theme.test.ts test/client-launch.test.ts test/client-entry.test.ts`19项通过；`npm run typecheck`通过。`Workbase.tsx`首帧主题回退、`UiMemory.theme`持久化和`entry.tsx`快照接收可复现路径。

**遗留**：未执行桌面启动逐帧录制或浏览器视觉验收；本机缓存与其他设备更新的主题可能不同，首次服务端快照返回后正常同步。安装结果在当前状态补记，未提交或推送。

### 2026-11-12 · 按官方 Forge 套件启停恢复工作树流程

**背景**：用户最终指定回滚到自实现前方案，官方dsh-experimental-forge-bundle启用时显示工作树、禁用时隐藏。

**决策**：恢复准确forgePanel Remote探测和requestWorktree调用，首消息入队后由官方创建；显隐持续重探双向启停。删除工作树自建模块、其测试及新增RPC，保留原项目分支只读查询、请求失败后同一会话复用，以及删除与诊断独立实现；不触碰历史工作树目录和代码。

**证据**：`git show HEAD:src/client/BranchBar.tsx`与`git diff -- src/client/entry.tsx src/client/launch.ts`可复现原流程；当前`BranchBar`新增forge门控，`entry.tsx`调用官方requestWorktree；`src/server/worktree.ts`与request-worktree协议已移除。最终构建和安装结果见当前状态补记。

**遗留**：未执行真实工作树创建、套件启停的浏览器验收或用户数据清理；模型菜单定位问题仍待单独适配。

### 2026-11-12 · 澄清 Forge 官方来源与服务复用

**背景**：用户指出官方宿主插件的依赖合理，原兼容维护文档把Forge与第三方插件并列，造成分类误解。

**决策**：明确Forge是宿主自带的官方可选套件，官方插件能力纳入宿主优先规则。保留上一轮已接入的worktrees.create优先路由；面板requestWorktree等待首条消息，而工作台发送前创建，因此使用官方底层服务。面板branches需要真实Session及权限上下文，不直接替代按项目目录读取分支。

**证据**：实际0.2.2-rc.2应用包内`@deepseek-ai/dsh-experimental-forge-bundle/package.json`登记官方bundle；`dsh-experimental-client-ui-forge/README.zh.md`说明套件组合官方worktree服务。其`lib/index.js`的requestWorktree只追加请求记录并recheck，branches接收session与signal；工作台`src/server/worktree.ts`通过ctx.get('worktrees')优先创建。

**遗留**：本次只修正维护文档与工程规则，运行时路由已在上轮接入，未追加构建、安装或测试。

### 2026-11-12 · 宿主更新检查与官方工作树优先

**背景**：桌面端频繁更新，手动核对不可复用；用户要求沉淀检查步骤，并在宿主提供等价能力后优先使用官方实现。

**决策**：增加只读应用包检查脚本与显式基线，记录版本、方法指纹、安装一致性和待评估接口。仅接入已确认契约的官方worktrees.create，保存创建前标记与成功回执，刷盘失败复用；能力缺失或明确未开始且Git登记、分支和工作目录未变才降级，未知或部分成功停下。新增同名接口不自动调用，私有维护适配继续集中管理。

**证据**：`node check-host.mjs`从app.asar读取0.2.2-rc.2／a6b1b85f44891ee1484bed6a9fc08acaae777d90；运行时版本由runtime/versions.json读取，不执行宿主代码。`npx tsx --test test/worktree.test.ts`的8项临时Git用例通过，覆盖缺失、官方成功、安全降级、权限拒绝、部分成功、状态变化及刷盘失败重试；`npm run typecheck`通过。最终构建、安装与检查报告以当前状态补记为准。

**遗留**：模型菜单CSS锚点覆盖待适配；未执行用户会话上的删除／恢复、真实官方工作树创建或视觉验收。脚本检查的是静态存在性和变化，不能认定完整兼容；回执未确认时需人工核对宿主残留产物后再处理。

### 2026-11-12 · 延后四卡布局的双列断点

**背景**：用户反馈四张统计卡在足够宽的区域仍显示两列，卡片过宽且增加纵向占位，并确认采用720px才切换双列的方案。

**决策**：真源移除1139px断点中的四卡覆盖，保留已有719px双列与419px单列规则；按统计区域CSS宽度判断，四卡720px及以上一行均分。5–6卡的三列断点保持现有行为，同步UI规范、PRD与当前状态。

**证据**：`docs/ui/ui-directions.html`的`@container workbase-stats (max-width:1139px)`仅匹配3、5、6卡；四卡基础规则为四列，719px以下两列，419px以下单列。构建生成`src/client/prototype.css`，验证及安装记录见当前状态。

**遗留**：未做额外浏览器视觉验收；不提交或推送Git。

### 2026-11-12 · 独立会话维护与工作树并修复统计卡留白

**背景**：用户要求根据外部插件依赖审查修复，明确允许参考代码但不依赖其他管理插件；截图中正式首页四卡仍按六列占位，右侧留空。

**决策**：新增内部维护模块直接适配官方存储、缓存和工作区队列，保留活动保护、候选复查、SUBAGENT后序级联及独立fork。日志revision以独立快照比较，缓存重建等待持久化；删除失败不宣称成功，不自动删除工作树代码。工作树改为发送前创建并调用官方目录切换，避免复制Forge回合阻塞流程。统计传可见数量，真源同步中等宽度四卡两列；保留SDK、皮肤兼容、可选备份路径与历史参考。

**证据**：`src/server/session-maintenance.ts`、`worktree.ts`及`test/session-maintenance.test.ts`、`worktree.test.ts`提供专属目录拒绝、活动后代、revision变化、刷盘失败、缓存失败与真实临时Git工作树验证；`test/diagnostics.test.ts`更新为内部接口候选复查，`test/client-launch.test.ts`验证创建失败仍复用会话。首页`data-count`与真源`@container workbase-stats`保持一致。最终验证与安装结果见当前状态。

**遗留**：官方私有维护接口会随宿主版本变化，能力检测失败时拒绝。真实用户会话删除／重建、跨进程竞争、大规模会话库性能及浏览器视觉回归未验收；工作树及旁置归属记录不会自动清理。不提交或推送Git。

### 2026-11-12 · 修复预览加载并将共用功能融入原工作台

**背景**：用户反馈预览加载失败，并要求功能尽量融入原始UI，仅不能融入的保留单独页面。此前演示归并误将HTML插入主脚本中的未结束OPML字符串，浏览器提前结束script，主UI无法初始化；我在上一轮仅阅读源码，遗漏了加载错误。

**决策**：先修复脚本与HTML边界，再让待办／统计／技能／MCP／RSS预览直接调用主UI入口，插件更新及备选布局／配色继续隔离展示。统计待办详情使用原编辑器及所属项目数据，临时保留原统计DOM与监听，关闭或保存恢复原筛选、滚动及焦点；成功保存更新原记录文字，不整页重渲染。独立入口的hash装载等待DOMContentLoaded，避免主UI尚未初始化。

**证据**：修复前以`node:vm.Script`解析主执行脚本在`inline-1:458`报`Invalid or unexpected token`；修复后三个执行脚本及六份JSON全部可解析。`lsof -nP -iTCP:63644 -sTCP:LISTEN`确认原Node服务PID74484，HTTP根页响应成功。用`docs/ui/pin-favorite-check.cjs`的`setup`函数在内存中拼接两段主脚本，仅调用初始化与模板生成，输出`{"initialized":true,"projects":6,"home":true,"stats":true,"tools":true}`；未运行其测试用例。实现入口为`integrationFinishDetail`、预览装载器`show`、`openStatsTarget`、`openTodoEditor`及`closeModal`中的`statsReturn`恢复逻辑，PRD及UI规范同步。

**遗留**：未做浏览器视觉或真实宿主验收，未跑完整测试／构建／安装／重启；独立演示仍为隔离示例页面，正式插件不因本次原型修改而增加能力。

### 2026-11-12 · MCP沿用连接器中心的详情与配置衔接

**背景**：用户将参考要求明确为「连接器中心的ui交互」，已有原型将配置和全部工具平铺，MCP保存直接退回列表，授权和编辑衔接不够连续。

**决策**：参考实际源码的信息层级、默认折叠工具、名称／说明搜索和随状态调整的主按钮，在工作台原管理面板内容区实现。市场先预览再配置；编辑取消回详情，MCP保存留在详情或继续授权，授权成功展开工具；导航与分组保持既有规则。沿用工作台主题和控件，不复制连接器独立弹窗，也不新增Prompt发送或治理能力。

**证据**：参考`../dsh-mcp-connector-main/ui/index.html`的`showDetail`、`renderTools`、`submitReconfigure`及`tools-disclosure`结构；实现位于`docs/ui/ui-directions.html`的`integrationToolRows`、`integrationDetailRender`、`integrationDetailSave`、`integrationReconnect`和`bindIntegrations`。`toolsOpen`／`toolQuery`保留工具筛选与折叠状态，`returnMode`记录编辑返回目标；工具开关检查连接可用状态，保存保持原启停设置及同认证类型的凭据标记。PRD第10节与UI规范第0.5节同步。

**遗留**：本轮仅更新本地演示，未运行测试、构建、安装、重启或浏览器验收；工具参数和授权完成仍为示例，真实OAuth外部页面要求尚需服务接入时处理。

### 2026-11-12 · 配置入口改为原管理面板内独立页面

**背景**：用户补充点击按钮进入配置页，并指定多维表格模板预览或创建自动化作为参考，修正此前列表行内展开方案。

**决策**：复用配置表单和业务操作，把配置节点挂在`integration-main`，暂隐藏内容区搜索及列表，保留导航和分组。配置页增加返回标题行，正文独立滚动，底栏固定；返回或保存后恢复原列表状态。保留原浏览器窗口与管理抽屉，不叠加弹窗。

**证据**：`docs/ui/ui-directions.html`的`integrationMountDetail`用`data-config-hidden`标记并暂隐藏原内容，`integrationDetailRender`生成`integration-config-title`和返回按钮，`integrationBack`恢复标记节点及原滚动和焦点；配置容器及正文采用flex和独立滚动。参考链接可读取Base主页面，但目标交互未读取，随后外部Chrome桥接报`Connection refused (os error 61)`；实现依据用户明确的配置页要求，未用表格数据推断视觉。PRD和UI规范同步。

**遗留**：本轮未追加测试、构建、安装、重启或浏览器验收；未验证与飞书目标交互的视觉一致性，正式组件与服务仍未接入。

### 2026-11-12 · 需求和演示集中归并

**背景**：用户要求整理docs，全部需求功能点集中到PRD、全部HTML演示集中到ui-directions；原目录存在备份早期停机方案、在线方案、集成方案和六个独立演示，多个文档重复记录或互相冲突。

**决策**：保留PRD、UI-DESIGN、机器可读盘点和验收支持文件，移除已归并的七份Markdown及六个辅助HTML和伴随资源。PRD第10节补齐三类扩展的计数、权限、真实生效、共存、异常与恢复，第11节补齐备份范围和一致性；采用后续在线、启动触发、保留期限及自动密钥规则，明确废弃CLI和停机方案。辅助演示内嵌到HTML逐行JSON，按需挂载独立srcdoc并保留已打开页面状态，支持同文件hash入口与返回主原型；样式隔离不改变sync-ui提取规则。集成技术方向仍为工作台独立服务复用宿主公开能力，不调用参考插件私有服务或整包复制；技能参考为Apache-2.0、MCP与RSS参考为MIT，引用代码时须保留来源与许可。

**证据**：需求入口为`docs/PRD.md`第6、10、11节，演示导航与目录维护入口为`docs/UI-DESIGN.md`第0.1.1节。`docs/ui/ui-directions.html`新增`demo-source-*`六份载荷及`demo-library-modal`，原演示CSS／脚本按原顺序内嵌。整理前完整副本为`/tmp/dsh-docs-before-20261112.tar.gz`，历史日志保留原日期证据名称，当前引用改为同文件入口。官方CLI `plugin --profile desktop add /tmp/dsh-workbase-0.3.1.tgz --registry=https://registry.npmjs.org`报告新增工作台0.3.1且退出0，随后`open -a "DeepSeek Harness"`退出0。

**遗留**：保留的JSON是2026-11-10只读盘点，不更新为当前实现或快照。辅助演示为模拟数据，未作为正式技能／MCP／RSS能力接入；未追加测试或浏览器验收。`npm run build`完成（客户端734370字符），`npm pack --ignore-scripts --pack-destination /tmp`生成0.3.1包；安装与重启结果以当前状态为准。

### 2026-11-11 · 管理配置改为列表内展开

**背景**：用户反馈技能、MCP、RSS的多项配置需要切换到新窗口式页面，要求留在当前页面操作；截图展示的是项目技能列表。

**决策**：复用既有详情表单与保存流程，将详情节点放入当前记录区，不隐藏整个`settings-layout`或替换抽屉标题。行记录下展开详情，工具栏操作在记录区顶部展开，同一时刻展开一项；操作行采用36px按钮及紧凑留白。切换二级菜单、分组和一级管理入口时收起但保留草稿，保存后恢复原滚动和入口。其他记录仍可启停，列表更新暂取出再挂回展开节点，避免清空正在编辑的表单。

**证据**：`docs/ui/ui-directions.html`的`integrationDetailOpen`调用`integrationMountDetail`将节点挂到行下／记录区顶部；`integrationDetailRender`只更新展开区标题，不改`dialog-head`。`integrationBack`移除展开区，`integrationUpdateResults`和`integrationRerender`保留其节点。`selectSettingsTab`与`bindIntegrations`的菜单／分组事件处理收起流程；`integrationToggle`、`integrationReconnect`和`integrationRefreshFeeds`更新列表时不覆盖其他记录的编辑草稿。UI规范、PRD与集成方案同步页内展开规则。

**遗留**：仅浏览器本地原型；未追加测试、构建、安装、重启或浏览器验收。真实MCP OAuth服务是否需要外部授权页由服务协议决定，本轮页内演示不构成对真实授权方式的承诺。

### 2026-11-11 · RSS自定义分组与导入导出独立成页

**背景**：用户指定RSS三项菜单与「添加订阅」标题按钮，要求我的订阅按自定义分组组织。

**决策**：继续迭代视觉真源；分组独立于订阅保存，支持空分组、重命名及移除，移除只将成员转入未分组。推荐来源使用完整宽度列表，导入导出集中到无分组、无搜索的操作页。订阅分组沿用共用选择器；原文章阅读入口归订阅详情，同一抽屉返回订阅，保留原列表状态。

**证据**：`docs/ui/ui-directions.html`的`integrationMenus.rss`定义`subscriptions/catalog/transfer`，`integrationDB.feedGroups`保存自定义分组，`integrationDetailSave`与`integrationRemove`同步分组及成员；`integrationRecords`生成OPML操作页，`integrationImportPreview`展示候选分组，`integrationOpml`输出分组。`read-article`与`integrationBack`通过`parentFeed`保留订阅详情返回位置。PRD、UI规范和集成方案同步。

**遗留**：只实现浏览器本地演示；未追加测试、构建、安装、重启或浏览器验收。OPML导入登记所选订阅的分组，空分组导出后再导入的还原未实现；真实抓取与缓存读取仍待正式接入。

### 2026-11-11 · 按指定菜单分离技能作用域和MCP启用状态

**背景**：用户指定技能五项菜单、MCP三项菜单及标题按钮，要求技能来源只展示可启停的本地目录，市场和回收站不分组。

**决策**：在既有真源继续迭代，不增加正式接口。全局技能按来源、项目技能按项目分组；无分组页移除左右布局中的分组栏与窄屏选择器。连接的启用状态与建连结果分开，异常连接仍属于已启用组；工具开关归连接详情。技能使用回收时间标记保留原启用设置，恢复遇同名冲突先阻止写入，永久删除独立确认。市场来源开关控制对应演示候选，添加自定义来源仅保存地址，不模拟远端抓取结果。

**证据**：`docs/ui/ui-directions.html`的`integrationMenus`定义五／三／三项，`integrationGroups`与`integrationRecords`按指定维度生成记录，`integrationPanel`以`data-grouped`控制布局，标题按钮固定文字。`integrationRemove`设置`deletedAt`，`integrationRestoreSkill`检查冲突后恢复；`integrationVisibleSkills`与统计异常数排除回收记录。PRD、UI规范及集成方案同步最新结构。

**遗留**：只更新HTML原型和文档；未追加测试、构建、安装、重启或浏览器验收，真实技能策略、目录扫描、MCP市场及网络连接尚未接入。

### 2026-11-11 · 技能MCP与RSS扩展先落地视觉真源

**背景**：用户确认在工作台内管理三类能力，补充最多启用六张卡及二级菜单要求，并明确先在现有HTML真源实现UI。

**决策**：沿用现有HTML/CSS/JS与统计抽屉，用集中式演示数据实现九个二级页面；卡片区域使用独立容器，扩展到1440px以容纳六列，抽屉保留1120px。详情替换内容而保留原抽屉及菜单状态，不创建第二层遮罩；演示操作与真实宿主能力明确分开。本阶段不构建安装，避免将未完成的正式组件与新的原型能力混为已交付功能。

**证据**：初次视觉真源内`integrationMenus`定义三组三项二级菜单，后续已按用户要求改为五／三／三项，见同日最新条目。`integrationPanel`／`bindIntegrations`统一管理页与事件，`integrationDetailRender`／`integrationBack`处理详情返回，`syncChoices`与`saveWorkspaceSettings`拦截第七项。`workbase-stats`容器断点为1139／719／419px，工具栏`preview-six-cards`可直达六卡展示。UI规范、PRD及集成方案已同步。

**遗留**：未执行测试、构建或浏览器验收；正式技能提供器、MCP生命周期、RSS抓取与备份恢复尚未接入，演示数据不构成真实能力验证。

### 2026-11-11 · 消除待办返回统计时的入场动画重播

**背景**：用户反馈关闭待办详情后统计弹窗显现较慢，两个弹窗切换不连贯。

**决策**：暂停统计弹窗时只隐藏可见性，不移除布局；恢复时沿用已完成的动画状态。滚动和焦点直接在Home布局效果中恢复，避免多等一帧。保留首次入场动画，不改全部弹窗的动画时长。

**证据**：`docs/ui/ui-directions.html`的`.workspace-settings.dialog`为200ms上滑且从opacity:0开始，`src/client/styles.css`的`.wb-overlay-drawer`为200ms遮罩渐入；`ui.tsx`上轮的display:none暂停使两者恢复时重播。本轮改为visibility:hidden／pointerEvents:none，`Home.tsx`移除返回路径的requestAnimationFrame。构建完成（客户端724249字符），打包0.3.1；官方desktop CLI remove/add安装成功，桌面端退出后重新启动。

**遗留**：按用户长期授权不追加测试、检查或真实桌面验收；实际视觉衔接仍未实测。

### 2026-11-11 · 落地统计待办直达详情与完整会话标识

**背景**：用户确认完整session ID及统计待办直达原型，明确详情期间隐藏统计弹窗，关闭或保存后返回原列表。

**决策**：Home保留统计分类与分组组件，Modal增加暂停显示与焦点管理能力；直接复用TodoDetail，仅统计入口开启closeOnSave，失败继续留在详情。保存及附件仍走原并发版本、权限和宿主接口；返回时恢复各实际滚动区和原点击项焦点，原待办不再存在时聚焦结果区。诊断ID不截取，单独完整显示，沿用12px辅助字号和等宽字体，窄屏允许换行。

**证据**：实现位于`Home.tsx`的`statTodo/statReturn`、`ui.tsx`的`suspended`、`TodoDetail.tsx`的`closeOnSave`、`StatsProjectPanel.tsx`的`sessionId`和`DiagnosticsPanel.tsx`的完整标识传递；视觉真源新增`.diagnostic-session-id`，UI规范与PRD同步。现有Home测试夹具只补refresh属性以保持类型契约，未新增测试。`npm run build`完成（客户端724307字符），`npm pack --ignore-scripts`产出0.3.1；官方desktop CLI remove/add成功，正常退出后经`open -a "DeepSeek Harness"`重新启动。

**遗留**：按用户长期授权未追加类型检查、测试或浏览器／真实宿主验收；真实保存返回、焦点和窄屏效果未验收。

### 2026-11-11 · 详情打开时隐藏统计原型弹窗

**背景**：用户明确统计与待办详情不同时显示，关闭或保存后显示统计弹窗并返回原列表。

**决策**：原型保留统计DOM与筛选状态，详情打开后以visibility隐藏概览，关闭后恢复；保持原页面占位，避免隐藏期间页面高度变化影响返回位置。按待办ID恢复点击项焦点，兼容点击时浏览器未聚焦按钮的情形。

**证据**：`docs/ui/todo-preview/stats-flow.html`的`openTodo`添加`suspended`及`aria-hidden`，统一dialog关闭事件移除两者，恢复`state.origin.scroll/todoId`；保存成功调用同一关闭路径，失败或无效标题仍留在详情中。

**遗留**：仅原型迭代，未修改正式代码或安装重启；按既有约定未追加浏览器与测试检查。

### 2026-11-11 · 完整会话标识与统计待办直达原型

**背景**：诊断短ID截取的是共同的`session-`前缀，无法区分记录；用户要求显示完整标识，并用指定原型插件探索统计待办直达详情的方式。

**决策**：原型将完整ID独立一行，允许长标识在窄屏换行。待办复用详情弹窗的展示方式，统计视图留在下层，关闭或保存保留原分组、搜索、滚动与点击项焦点；避免跨项目定位后才能编辑。仅模拟交互，不改变正式数据服务。

**证据**：`src/client/Home.tsx`现行`openTodo`设置`selectedProject/targetTodo`，仍为项目定位；`Workbase.tsx`集中渲染`TodoDetail`，可供后续直达入口复用。原型`docs/ui/todo-preview/stats-flow.html`以`dialog.showModal`展示详情，`state.origin`记录滚动与触发项，关闭事件恢复列表；诊断ID无截取、使用`overflow-wrap:anywhere`。源代码静态复核覆盖事件、数据、引用与空结果分支。

**遗留**：本次为原型方案，正式插件的短ID与项目定位行为尚未修改；未运行浏览器、测试或安装重启。

### 2026-11-11 · 修正会话标题缓存并收紧统计诊断条目

**背景**：用户反馈会话重命名不生效、统计明细文字贴边与目录信息重复、诊断长路径及完整会话标识挤出多行。

**决策**：继续使用官方改名与标题折叠接口，以投影水位和标题值补充缓存依据；手工标题优先于空会话默认名称。共用行内12px左右留白，统计记录只保留标题／时间；诊断短描述与短ID用于列表，完整诊断信息放入悬停提示并保持可搜索，不改变候选复查与删除保护。

**证据**：`node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js`的`updatedAt`取创建时间与最后用户消息时间的最大值，`hintsOf`提供`kind/asOfSeq/values`；实现位于`src/server/host.ts`、`Home.tsx`、`StatsProjectPanel.tsx`及`DiagnosticsPanel.tsx`，行距规则在视觉真源`docs/ui/ui-directions.html`。`npm run build`完成（客户端723019字符），`npm pack --ignore-scripts`产出0.3.1；`osascript`正常退出，官方desktop CLI remove/add成功，`open -a "DeepSeek Harness"`完成重启命令。

**遗留**：按用户长期授权不追加类型检查、测试或界面验收；真实桌面改名与各宽度视觉效果未验收。

### 2026-11-11 · 首页统计卡复用整卡上浮动效

**背景**：用户认可统计卡与项目宫格统一上浮与轻阴影、取消变色的推荐原型方案。

**决策**：统计卡直接加入现有宫格动效选择器，共用4px、300ms、主题阴影和减少动态效果规则；取消悬停及按下背景变化，保留进入箭头、焦点外圈和明细行为。

**证据**：真源`.stat-card:is(:hover,:active,:focus-visible)`保持surface及line；宫格动效的基础、焦点、细指针及减少动态效果选择器同时包含`.stat-card`，复用`--project-hover-shadow`。UI规范第0.5节明确统计明细入口的动效例外，构建安装结果见当前状态。

**遗留**：按用户长期要求不追加测试、检查或真实宿主界面验收。

### 2026-11-11 · 项目宫格内部底块保持原色

**背景**：用户认可仅上浮与阴影的原型推荐方案，要求移除悬停时内部小卡片的变色。

**决策**：删除统计小卡片与文件夹图标底块的悬停／内部聚焦背景覆盖，沿用原有轻灰底色，由整卡动效统一表达交互目标；项目列表与详情保持原样。

**证据**：删除真源中`.project-summary:is(:hover,:focus-within) :is(.project-summary-metric,.project-icon)`背景规则，默认底色分别来自`.project-summary-metric`及`.project-summary .project-icon`。UI规范第0.5节与原型约定同步，构建安装结果见当前状态。

**遗留**：按用户长期要求不追加测试、检查或真实宿主界面验收。

### 2026-11-11 · 项目宫格参考Base主页改为整卡上浮

**背景**：用户提出新悬停方案，要求项目宫格外层不叠色，参考飞书Base主页文档宫格的整体跳动效果。

**决策**：采用上浮4px与300ms平滑阴影过渡，不循环弹跳；外层基础背景不变，内部小卡片与详情沿用既有配色。仅细指针悬停及内部键盘焦点触发，减少动态效果时不位移，深色阴影采用黑色。

**证据**：浏览器打开`https://internal-host.example/base`，从列表切为宫格后对`.new-base-home-grid-item`执行真实hover，稳定computed transform为`matrix(1,0,0,1,0,-4)`，transition为transform／box-shadow 0.3s；阴影为`rgba(31,35,41,.03) 0 4px 16px 4px`、`.02 0 4px 8px 0`、`.02 0 2px 4px -4px`。离开前恢复原列表模式。实现见真源官方悬停规则之后的宫格动效及能力查询。

**遗留**：仅查看参考站点效果，按长期要求不追加本项目测试、浏览器或真实宿主验收；安装结果见当前状态。

### 2026-11-11 · 修正项目卡片外层悬停背景被覆盖

**背景**：用户反馈项目卡片悬停没有外层底色变化。

**决策**：普通与悬停背景分别声明，恢复外层官方悬停层；内部在既有轻灰底色上叠加同一官方令牌，保留层次，详情页保持现有规则。

**证据**：真源中上轮`.project-summary,.project-summary:is(:hover,:focus-within)`共用固定背景，直接覆盖了此前悬停规则；现分开声明，见`docs/ui/ui-directions.html`「官方侧栏同款半透明悬停层」。规范第0.5节补充两态不可共用固定底色，构建安装结果见当前状态。

**遗留**：按用户长期要求不追加测试或界面验收，视觉效果由用户反馈。

### 2026-11-11 · 项目卡片外层保持官方背景而内部响应悬停

**背景**：用户确认详情页已符合预期，反馈项目卡片希望交换内外配色，将悬停色放到内部小卡片。

**决策**：项目宫格外层始终引用官方背景令牌，悬停／内部聚焦只给统计块及文件夹图标底块叠加官方悬停色，保持边框和布局；详情与项目列表沿用上轮规则。

**证据**：`docs/ui/ui-directions.html`中`.project-grid .project.project-summary`及其内部底块选择器；规范见第0.5节，对照原型为`docs/ui/todo-preview/card-tone.html`。构建与安装结果见当前状态。

**遗留**：按用户长期要求不追加测试、浏览器或真实宿主界面检查。

### 2026-11-11 · 项目与详情列表复用官方悬停配色

**背景**：用户提供宿主侧栏截图，要求项目卡片、会话列表和待办列表悬停参考官方配色。

**决策**：直接复用官方半透明悬停令牌，在原底色上叠加；项目卡片保留surface底层，行保留连续透明布局，移除自行混色与悬停加深边框。覆盖项目宫格／列表和详情两种布局、主题明暗，键盘内部聚焦共用配色。

**证据**：`node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js`的`panelRow:hover`、`panelActive`均引用`--dsw-alias-interactive-bg-hover`；`node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/Menu.module.css`的`.item:hover`同样引用该令牌。实现见真源的「官方侧栏同款半透明悬停层」，规范见第0.5节；构建与安装结果完成后补记在当前状态。

**遗留**：按用户要求不追加测试、浏览器或真实宿主界面检查；直接引用令牌保证使用同一悬停层，不保证不同基础底色的最终合成颜色相同。

### 2026-11-11 · 恢复灰色卡片内的连续列表

**背景**：用户反馈上轮主题色悬停与灰色统计块不搭，会话／待办的白底内框使整体卡片内条目割裂。

**决策**：保留整体面板边界，移除独立行底色与内描边，以中性灰明度变化强调悬停行；项目卡片悬停与内部统计块用不同灰阶，避免主题色大面积铺底。使用rapid-prototype-craft制作同目录对照原型，同步正式真源与共用规则。

**证据**：`docs/ui/ui-directions.html`的浅色卡片规则，`docs/UI-DESIGN.md`第0.5节；`docs/ui/todo-preview/card-tone.html`支持前后方案、悬停、搜索、待办状态与窄面板切换。本轮按用户要求仅执行构建及安装重启，操作结果见当前状态。

**遗留**：未追加测试、浏览器检查或真实宿主界面验收，构建成功不等同于视觉验收。

### 2026-11-11 · 增强浅色项目卡片与详情卡片行的层次

**背景**：用户截图中项目卡片悬停底色与内部统计块接近，详情卡片视图的会话／待办行与面板接近，交互目标难区分。

**决策**：真源定义浅色卡片专用悬停底色和边框，基于现有主题令牌混色；项目卡片改边框与底色，详情卡片行平时用surface及轻内描边、悬停同组主题底色与边界。不调整文字字号、间距或深色／普通列表，不扩大普通控件hover的作用范围。

**证据**：规则在`docs/ui/ui-directions.html`浅色卡片分层注释下，规范在`docs/UI-DESIGN.md`第0.5节。`npm run typecheck`、232项`npm test`、`npm run build`、`git diff --check`通过，客户端721600字符。`node --import tsx /tmp/dsh-card-hover.mjs`隔离服务以实际Home／Detail静态渲染和正式CSS测量；紫晶浅色项目悬停背景为`color(srgb 0.969804 0.956863 0.997843)`，统计块仍中性；会话／待办行悬停同背景及1px内描边，外层panel为rgb(245,246,247)，标题与辅助文字对比度为14.54及5.09。静态渲染只验证CSS悬停，不替代React操作链路验收。

**遗留**：未安装、重启或读取真实桌面；全部主题、真实外部皮肤覆盖与键盘聚焦尚未逐项验收。

### 2026-11-11 · 统一待办会话草稿格式与描述字段文案

**背景**：用户提供任务、ID、描述及末尾处理要求的固定格式，并要求详情中的备注改称描述。

**决策**：直接按指定顺序生成文本，标题与ID同各自标签一行、描述另起行保留原Markdown，空一行后追加原处理要求；去掉额外优先级行。详情标签、可访问名称和空提示同步，保留底层`note`字段与全部附件交接逻辑。

**证据**：`src/client/todo-session.ts`构造固定草稿，`src/client/TodoDetail.tsx`更新三处文案。`test/todo-detail.test.ts`与`test/client-entry.test.ts`以完整文本断言覆盖通用交接及官方输入草稿入口；旧优先级断言按新需求更新。类型检查、232项测试、`npm run build`和`git diff --check`通过，客户端720646字符。

**遗留**：本轮未安装、重启或操作真实会话，安装记录仍对应上一轮四项修复。

### 2026-11-11 · 修复待办控件与发起会话附件读取400

**背景**：用户反馈完整新建样式偏离、优先级文案裁切、附件数量顺序不对，以及发起会话提示附件读取失败400。

**决策**：保留完整新建文案与Enter快速添加，修正次要按钮规格并缩短下拉选项，附件数量置于时间之后；官方SDK按路由正文模式处理，原GET／POST共用streaming触发GET正文错误，拆分为上传POST与独立`/content`下载GET。既不改宿主SDK，也不把大文件上传改为默认300MiB预缓冲；保持owner鉴权、版本和归属校验、10MiB流式限制及旧图片支持。

**证据**：修复前附件排序与筛选短文案回归失败，修后通过。`test/todo-detail.test.ts`从已安装`@deepseek-ai/dsh-client-connection`加载实际bridge函数，通过node:http验证文件和旧图片POST上传／GET下载及字节一致。原SDK`bridge` streaming分支无条件传入Readable正文，违反GET的Request构造限制；用户两项附件经官方存储只读均成功（778754／89348字节），不需要数据修复。`npm run typecheck`、`npm test`（232项）、连续两次`npm run build`通过，产物哈希见当前状态。运行`node --import tsx docs/verify-todos.mjs`，`?toolbar=1&width=360`隔离实际TodoToolbar；五主题×明暗10组computed style确认40px高、7px圆角、14px字号，「未设置」scrollWidth不大于clientWidth，面板无横向溢出；实际点击完整新建入口、筛选全部及未设置通过。

**遗留**：尚未安装本轮修复、重启或重新执行真实宿主会话草稿交接；官方桥接回归不等于在线模型准入及最终消息发送验收。上次即上传版安装证据补入当前状态，不能误认为其已包含本轮修复。

### 2026-11-11 · 待办附件选择即上传并核对官方会话接线

**背景**：附件选择后还须保存确认，用户要求直接上传，并确认待办发起会话是否接入Harness官方链路。

**决策**：拆开字段保存与附件上传，已有待办上传不提前提交正文；沿用绑定待办身份和expectedVersion的上传接口，避免引入独立暂存协议。新建缺标题时保留文件并提示，标题编辑结束后自动继续，不生成占位任务。失败保留未成功文件，单独重试；沿用官方草稿交接与用户发送边界，不自动发送消息。

**证据**：`test/todo-form.test.ts` 的自动上传用例先失败后通过，覆盖新建、无标题、现有正文草稿、多文件版本串行、部分失败续传、重复事件与冲突恢复。`npm run typecheck`、`npm test`（229项）及连续两次`npm run build`通过；客户端哈希 `1a084d56399e64a4d7fed4a9ebaf981c74497d0598e9c4844df7b28e1bd3bab1`。运行`node --import tsx docs/verify-todos.mjs`，浏览器不点击保存上传README.md和AGENTS.md，内存快照version为3、标题保留原值、两附件下载与源文件逐字节相同，360px温暖深色正文无横向溢出。官方接线见`src/server/host.ts`的`begin`、`src/server/service.ts`的`beginSession`及`src/client/entry.tsx`的`openTodoSession`；`test/client-entry.test.ts`覆盖草稿交接和引用释放，`test/todo-detail.test.ts`覆盖文件读取失败不创建及交接失败不导航。

**遗留**：浏览器`document.hasFocus()`为false，标题先空再填写后的实际blur未获得可断言证据，该分支仅通过组件事件回归。隔离存储和模拟会话不能替代真实Harness附件上传、模型限制及发送验收；本轮未安装或重启桌面。

### 2026-11-11 · 按规范修复表单与菜单行为一致性

**背景**：统一视觉后，完整组件核对仍发现菜单关闭／禁用行为不一致，隐藏侧栏名称会阻止全部设置保存，搜索没有IME保护，分栏缺少已定义的End键；部分字段错误仅播报而未关联输入。文档还保留三类诊断、11px辅助字与旧工具／版本数量口径。
**决策**：保持现有控件、存储契约与主题，集中复用`usePopup`及输入法提交保护；项目和会话重命名复用同一表单。条件字段保留草稿但隐藏后不拦保存；原有效名称用于满足持久化契约。错误节点通过`aria-describedby`关联，只有明确字段无效才设`aria-invalid`。规则只补UI-DESIGN第0节，宿主分支与版本代码的官方字号明确列为例外，修正其他章节引用；不把整个后端安全审计纳入本次UI一致性结论。
**证据**：`npm run typecheck`、`npm test`（225项）、`npm run build`、`git diff --check`通过；定向行为回归在`test/ui-interaction.test.ts`、`test/restore-settings.test.ts`、`test/todo-form.test.ts`与`test/ui-format.test.ts`。两次构建客户端SHA-256 `a72134188cb98ab390194fcdbeee9cce7bfd1d11188b3f1d632cc34ebf6c01a0`、服务端SHA-256 `3c610a249f725402792cac28d4f0c559f2caea00394dc4198427377838d16fce`一致；客户端719602字节，无新增运行时依赖。原型脚本语法通过，生成CSS括号配平、58处容器查询、宽度型media为0、温暖主题保留。隔离入口`node /tmp/dsh-workbase-consistency-review/verify.mjs`在8799端口运行实际组件，五主题×明暗×360／650／1120px共30组，普通输入／下拉／目录／备份框均40px高、14px字、7px圆角且面板不横向溢出；下拉选项切换、禁用项、备份边界和Esc／Tab关闭通过浏览器交互核对。
**遗留**：浏览器`document.hasFocus()`为false，不能据此宣称焦点外观已验收；Esc回入口可读取，Tab关闭后回焦点仍须激活窗口复测。未安装／重启桌面，未操作真实备份、恢复、附件或会话。尺寸变化重定位和异步空列表补焦点由共享实现处理，尚未在真实宿主逐项验收。

### 2026-11-11 · 统一表单圆角焦点与待办辅助字号

**背景**：温暖主题的通用按钮圆角会覆盖普通下拉，输入与下拉焦点形式不同，新待办辅助元素尚未纳入统一文字角色。

**决策**：真源追加作用于普通表单控件的共享圆角与焦点规则，排除复合输入、导航、分支、开关和文件输入；将待办优先级与附件数量归入辅助文字角色，文件大小引用同一字号变量。沿用已确认的7px及12px规格，不调整各用途的控件高度。

**证据**：`docs/ui/ui-directions.html` 的普通控件规则使用`--control-radius`及`--focus-tone`，`.todo-priority`、`.todo-attachment-count`和`.todo-attachment-card>small`引用`--type-meta`。类型检查、218项测试与构建通过；隔离页加载真实Picker、DirectoryInput及正式CSS，五种主题×深浅色共10组computed style核对：普通输入／下拉圆角7px、优先级／附件数量／大小12px；复合输入40px／10px、分组搜索36px／8px及分支28px保持。焦点采集未获有效`:focus`状态，浏览器工具和独立Chrome均如此（Chrome同时报CVDisplayLink错误），未计为通过。

**遗留**：本轮未安装或重启桌面端，真实宿主视觉及焦点效果尚未验收；焦点仅核对规则一致，不声称浏览器状态通过。下拉键盘共用逻辑、字段错误关联及其余尺寸变量属于后续范围。

### 2026-11-11 · 集中维护共用控件一致性规则

**背景**：输入与弹窗规则散落于场景描述，目录点击行为、菜单字号和待办布局仍混有旧口径，后续开发容易复制出新变体。

**决策**：扩充现有UI规范第0节，以用途定义普通表单、紧凑搜索、复合输入和宿主控件，集中列出复用入口、交互、密度及例外；AGENTS.md只链接入口，不复制数值。文档整理与运行时改造分开记录，保留现有圆角差异及最终样式核对边界。

**证据**：规格对应 `docs/ui/ui-directions.html` 的基础输入、`.theme-select-trigger`、`.stats-group-search`、`.todo-input`、`.todo-detail-form` 和底栏规则；目录行为对应 `src/client/DirectoryInput.tsx`，输入法与草稿切换对应 `TodoToolbar.tsx`，菜单定位及键盘对应 `ui.tsx`。本轮检查文档引用、差异格式及重复旧口径，不改变源码或构建产物。

**遗留**：7px基础输入圆角、10px复合输入圆角及8px紧凑搜索按用途保留；历史主题按钮规则对个别选择器的覆盖尚未逐个视觉测量，不能声称全部输入已统一。

### 2026-11-11 · 统一弹窗底栏操作按钮尺寸

**背景**：不同弹窗沿用各自内边距，底栏文字按钮高度约34至38px，待办模式按钮已是36px。

**决策**：在视觉真源集中定义底栏文字操作尺寸，排除菜单项并保留待办会话组合接缝；宿主原生更新弹窗使用专用局部适配，维持各主题操作颜色。

**证据**：`docs/ui/ui-directions.html` 的底栏共享规则与 `src/client/styles.css` 的 `.wb-plugin-update-actions>button` 同为36px高、14px字号、20px行高、7px/12px内边距和8px圆角。`npm run typecheck`、`npm test`（218/218）及 `npm run build` 通过；`git diff --check`、真源脚本语法和生成CSS检查通过，括号配平、58处容器查询、宽度型media为0且`:scope.c`保留。宿主 `Button.module.css` 的按钮为单类尺寸规则，更新底栏局部选择器优先级足以覆盖字号、行高和圆角。

**遗留**：未安装、重启或在真实桌面测量；顶部关闭、附件移除和正文编辑按钮保持其独立尺寸。

### 2026-11-11 · 统一会话预览与待办详情弹窗尺寸

**背景**：用户要求核对两种弹窗大小，不一致则统一；现有会话预览800px且高度随内容收缩，待办为90%／1120px及固定可用高度减50px。

**决策**：使用共同CSS选择器管理外框尺寸，宿主适配及窄屏遮罩同步覆盖两者；会话正文改为flex:1，保留头尾固定和内部滚动。更新PRD及UI规范中的旧尺寸。

**证据**：`npm run typecheck && npm run build && npm test`通过，218项测试；真源脚本语法及`git diff --check`通过。生成CSS的公共选择器包含90%／1120px和`calc(100% - 50px)`，窄屏全宽与正文填充规则存在；58处容器查询、宽度型media为0、括号配平、温暖主题保留。

**遗留**：本轮尚未安装、重启或在真实桌面测量各面板尺寸。

### 2026-11-11 · 移除待办列表备注预览

**背景**：用户截图显示长备注在待办卡片中占据多行，认为影响列表样式，要求列表不显示备注。

**决策**：从实际组件和视觉真源的待办行中移除备注正文，并清除只用于该预览的CSS规则；保留详情备注、列表备注筛选及全局搜索，优先级和附件数量继续展示。

**证据**：`src/client/Detail.tsx`的`todoRows`不再渲染`todo-note`，`matchesTodo`继续匹配标题与备注；`docs/ui/ui-directions.html`的`todoRow`同步。`npm run typecheck && npm run build && npm test`通过，218项测试；真源脚本语法、`git diff --check`及生成CSS括号配平／宽度media为0／温暖主题保留核对通过，列表备注专用样式已移除。

**遗留**：本轮未安装、重启或在真实桌面验收列表。

### 2026-11-11 · 会话预览状态增加图标

**背景**：用户要求会话预览「未归档」前增加图标，与待办「待处理」保持一致。

**决策**：复用现有clock图标，未归档及运行中使用时钟，已归档使用archive；沿用摘要区13px图标、5px间距和主题色，不新增图标资源或样式覆盖。

**证据**：`src/client/Workbase.tsx`的`SessionPreviewDialog`状态标签加入`Icon`，`docs/ui/ui-directions.html`的`openReadDetails`同步；`npm run typecheck && npm run build && npm test`通过，218项测试，`git diff --check`通过。

**遗留**：本轮未安装、重启或在真实桌面验收图标。

### 2026-11-11 · 待办添加与搜索共用输入框

**背景**：用户确认D方案，要求输入框和按钮大小不变化、搜索图标保持原样，并以上下翻转切换添加和搜索，随后授权接入正式代码。

**决策**：新增`TodoToolbar.tsx`管理局部模式与动画，保留`Detail.tsx`的查询和业务命令。添加草稿独立于搜索词；右侧使用隐藏但保留布局的完整新建按钮撑出自然宽度，优先级Picker绝对定位覆盖同一区域。动画拆成130ms出场、170ms入场，引用锁拦重复切换，效果清理取消卸载计时；输入禁用解除后的布局效果负责恢复焦点，避免在React提交前聚焦失败。不变更存储、工具或宿主接线。

**证据**：`node --import tsx --test test/detail-render.test.ts`新增工具区断言先失败，接入后通过；`test/todo-toolbar.test.ts`覆盖双向翻转、重复点击、搜索Enter、IME、草稿恢复、筛选清除、创建去重／失败、归档可查询及卸载清理。`npm run typecheck`、`npm test`（218项）、真源脚本语法检查、`git diff --check`通过。`npm run build`连续两次产物哈希一致，数值及生成CSS核对见当前状态；`test/prototype-css.test.ts`守护占位、固定搜索按钮和动画规则。

**遗留**：本轮仅源码、回调行为与构建验证；实际动画观感、各主题几何一致性和真实桌面交互尚未验收，也未安装或重启桌面。

### 2026-11-11 · 安装待办摘要位置对齐并重启

**背景**：用户明确要求安装并重启待办摘要位置对齐后的最新构建。

**决策**：重新构建、打包并核对白名单和内容，保留安装前回滚副本；通过桌面自带CLI同版本remove/add，再正常启动并核对真实加载。

**证据**：`npm run build`、`npm pack --pack-destination /tmp`与官方CLI安装通过；六项安装文件逐字节一致，profile bundles包含工作台，安装包和客户端哈希见当前状态。`ps`确认旧13235／13274退出，新15940／15980存在。真实窗口8313可访问树按顺序显示待办header、状态／项目／创建时间、标题／优先级；之后观察到正常会话预览。

**遗留**：未测量真实DOM几何位置、窄屏或全部主题，未执行真实附件上传、保存和会话交接。

### 2026-11-11 · 待办元信息与会话摘要对齐

**背景**：用户标出待办标题输入框下方的状态、项目与创建时间，要求其位置和会话预览小字一致。

**决策**：待办元信息从基本字段区移到header下方、滚动正文之前，标题和优先级随后；与会话摘要共用CSS选择器及650px容器断点，消除两套独立间距。同步既有待办原型与PRD，状态继续只读。

**证据**：`npm run typecheck && npm run build && npm test`通过，211项测试；原型ID、引用、JS语法及`git diff --check`通过。`src/client/TodoDetail.tsx`的`todo-detail-summary`位于`todo-detail-body`之前，生成CSS共享16px顶部／24px左右及窄屏18px左右边距；58处容器查询、宽度型media为0、括号配平并保留温暖主题。

**遗留**：本轮完成源码及原型静态核对，尚未安装、重启或验证真实宿主的几何位置。

### 2026-11-11 · 安装统一头部高度并重启

**背景**：用户明确要求安装会话预览header高度统一后的构建并重启桌面。

**决策**：沿用桌面自带CLI，同版本先remove再add；安装前保留旧包和profile声明回滚副本。正常退出后启动，逐字节核对包内容，并通过只读会话预览检查实际加载。

**证据**：`npm run build`和`npm pack --pack-destination /tmp`通过；六项白名单、当前文件一致与五类指定敏感模式检查通过，安装包及客户端哈希见当前状态。`ps`确认旧11626／11657退出，新13235／13274存在。真实窗口8149的可访问树显示已同步；会话菜单打开「新会话」预览，截图显示独立header分隔线与下方元信息。

**遗留**：仅核对当前主题和窗口的实际展示，未测量真实DOM几何高度、窄屏或全部主题；未执行附件上传、保存或会话交接。

### 2026-11-11 · 会话预览头部高度对齐

**背景**：用户发现会话预览header与其他弹窗高度不一致，要求统一。

**决策**：参考待办、设置及统计抽屉的72px／60px固定高度，修改视觉真源的会话专用变体；移除480px规则对header内边距的覆盖，统一650px容器断点。分隔线移到header底部，元信息独立展示，保留标题单行省略。

**证据**：`npm run typecheck && npm run build && npm test`通过，211项测试；真源脚本语法与`git diff --check`通过。`docs/ui/ui-directions.html`的`.session-preview-dialog>.dialog-head`及650px规则可复现高度；生成CSS验证72px／60px、58处容器查询、宽度型media为0及温暖主题保留。

**遗留**：本轮仅修改真源并生成构建产物，尚未安装、重启或在真实桌面核对几何高度。

### 2026-11-11 · 安装会话标题布局并重启桌面

**背景**：用户明确要求把最新会话标题改动安装并重启桌面端。

**决策**：重新构建、打包并核对白名单和当前文件，保留安装前插件与profile声明的回滚副本；使用桌面自带CLI进行同版本remove/add，通过正常退出后重新启动加载新产物。

**证据**：`npm run build`与`npm pack --pack-destination /tmp`通过，安装六项逐字节一致且profile bundles包含工作台；安装包与客户端哈希见当前状态。`ps`确认旧7296／7332退出，新11626／11657存在；真实窗口8078的可访问树显示heading「新会话」、元信息及底部操作，截图确认header已移除「会话预览」标签。

**遗留**：真实桌面仅核对短标题和当前主题；长标题省略、全部主题、附件上传与最终会话交接未在本次安装中验收。

### 2026-11-11 · 会话名称直接作为弹窗标题

**背景**：用户选定会话名称放在 header，并要求移除「会话预览」文案、标题禁止换行。

**决策**：会话预览组件自己持有 Modal，以列表名称作为加载期间的标题，读取成功后使用预览返回名称；去掉正文重复标题，把状态并入元信息。仅会话预览变体限制标题单行、省略及关闭按钮尺寸，悬停保留完整名称，复用现有主题令牌。

**证据**：`npm run typecheck`、`npm test`（211项）、`npm run build`、`git diff --check`通过；`src/client/Workbase.tsx`的`SessionPreviewDialog`和`docs/ui/ui-directions.html`的`.session-preview-dialog>.dialog-head h2`可复现结构与样式；生成CSS包含`min-width:0`／`white-space:nowrap`／`text-overflow:ellipsis`，宽度型media为0，容器查询57处。

**遗留**：本轮仅本机构建与静态验证，未安装、重启或执行真实宿主及浏览器视觉验收；同版本已安装包仍是上一轮构建。

### 2026-11-11 · 待办正式布局安装并重启桌面

**背景**：正式布局及通用附件完成后，用户明确要求「安装并重启」。
**决策**：复用已通过211项测试与40组浏览器检查的源码，先build再pack；包内容核对后正常停止旧桌面，再用应用自带CLI remove/add安装本地包，保留工作台bundle启用状态，最后open启动。
**证据**：`npm run build && npm pack --json`产出六项白名单，包与工作区、实际安装目录均逐字节一致；`shasum -a 256 -c dsh-workbase-0.3.1.tgz.sha256`通过，摘要 `4d7012950a501320980b870fe4dd8586ea94dcc351241d865ccb3428ec74a167`，五类指定敏感模式未命中。官方CLI list显示0.3.1，profile的dsh.profile.bundles包含dsh-workbase；`ps -axo pid,ppid,command`确认新主7296／宿主7332。真实窗口7880可访问树与截图确认工作台已同步、完整新建位于快捷输入右侧。
**遗留**：仅安装与加载验收，未保存真实待办、上传附件或发送会话；本轮没有提交或npm发布。

### 2026-11-11 · 待办正式布局与通用附件兼容

**背景**：用户确认多轮待办原型后要求开发正式代码、适配所有主题，并明确附件不限图片、不限制格式。
**决策**：布局写入`docs/ui/ui-directions.html`真源，复用现有Modal、Picker、Menu及主题令牌；宿主标签规则通过详情局部覆盖消除，保留其他弹窗。附件选择不设accept，新文件用宿主saveFile／readFileStream保存原始字节；保留旧images字段、路由与八工具，新增attachments和三工具，避免旧引用及调用失效。限制仅为10个／10MiB容量和合法显示名，MIME仅用于展示。会话交接使用真实File名称，只有宿主识别的四种图片计入图片额度。沿用版本校验、串行写入、归属保护和失败续传。
**证据**：`npm run typecheck`、`npm test`211项、`npm run build`及`git diff --check`通过；两次构建客户端SHA-256 `8206a1725406171bbe13eac54f02ba3d66c889e7584f70e5b620bc2e6a760531`一致。`test/todo-detail.test.ts`覆盖旧图片共用额度、空文件、文件名与字节交接、读取失败不建会话、路由下载隔离及Agent消息归属，`test/todo-form.test.ts`覆盖失败续传、状态只读及无accept。`node --import tsx docs/verify-todos.mjs`启动隔离组件，五主题×明暗×四面板宽共40组通过，360px／420px温暖深色验证保存空SVG及自定义扩展名、下载保留文件名、滚动与模式菜单边界。截图和几何数据在忽略的`docs/ui/verification/`；依赖仅为验收侧临时Playwright，不进入插件。
**遗留**：隔离宿主存储与会话接口为内存模拟；真实桌面文件存储、图片准入、会话导航交接未实测。本轮未安装、重启、提交或发布，桌面仍为上轮安装文件。

### 2026-11-11 · 待办增强安装与桌面启动

**背景**：用户在待办 P1／P2／P3 完成后明确要求安装并重启桌面。
**决策**：复用已通过205项测试与两次一致构建的产物，重新打包核查，用应用自带 CLI 的 `plugin --profile desktop remove/add` 更新。安装前进程检查及应用列表均表明桌面未运行，安装后通过 `open -a "DeepSeek Harness"` 启动。
**证据**：`npm pack --json` 产出六项白名单，逐文件对照当前构建一致，版本0.3.1；私钥、本机路径、内部域名、邮箱与指定凭据模式均未命中。`shasum -a 256 -c dsh-workbase-0.3.1.tgz.sha256`通过，包SHA-256 `34053b2d31358b6407939934c9bcf960f25a330d9d6bff8ec7f654be74cfa9b6`。官方CLI安装成功，六项安装文件逐字节一致、profile bundles包含dsh-workbase，`list --depth 0`显示0.3.1；`ps -axo pid,ppid,command`确认主86956／宿主87000。真实窗口7022可访问树显示工作台已同步、完整新建与优先级筛选；详情显示优先级、备注编辑／预览、图片0/10、会话模式和发起会话控件。
**遗留**：本次确认真实加载及控件出现，没有执行真实图片上传、保存、会话草稿交接或逐主题视觉回归；不提交代码、不发布npm。

### 2026-11-11 · 待办详情、优先级与图片交接

**背景**：用户授权实现保留的P1／P2／P3任务，明确排除评论、变更记录、截止日期，仅保留可选优先级。
**决策**：在旧存储格式1上补默认值，不替换旧数据；统一新建与详情弹窗，Markdown复用宿主原子组件；图片保存宿主引用，二进制HTTP与32KiB JSON RPC分离。Agent列表无参数保持完整返回，摘要及筛选可选，完整详情与图片工具独立。SDK attachment不校验会话引用，附图额外扫描本会话真实消息。新会话先读图再交接，不自动发消息；retainInfo出现第二个持有者后释放临时引用，避免未挂载输入壳销毁草稿。
**证据**：`test/todo-detail.test.ts`覆盖旧数据、优先级、摘要、图片HTTP、归属、并发与引用交接；`test/todo-form.test.ts`覆盖上传失败续传不重复创建、并发草稿及图文粘贴；`test/client-entry.test.ts`覆盖原生setDraft→打开会话→界面接管释放，不调用submit-message。`node --import tsx docs/verify-todos.mjs`启动内存适配验收，真实组件浏览器中保存高优先级并切换预览；360px温暖深色面板实测弹窗360px、表单无横向溢出，底部动作可滚动访问。
**遗留**：本轮未安装、重启或修改用户profile；隔离浏览器的图片存储与会话创建为内存适配，不能证明真实宿主上传、Markdown渲染、模型发送或全部主题视觉。附件保存成功但工作台持久化失败时不发布引用，未关联图片由宿主生命周期管理。完整原生对接须安装构建产物后验收。

### 2026-11-11 · 补充 Agent 创建待办的调用场景

**背景**：参考 dsh-kanban 的工具描述，用户要求让工作台 Agent 在多步骤任务中主动记录待办。
**决策**：仅补充 `workbase_create_todo` 描述，明确先查询并复用已有任务、按可独立交付的步骤创建、验证后完成，以及权限与版本要求；保留现有工具名称和参数。
**证据**：`src/server/tools.ts:51` 中创建工具的 description 提供上述引导，执行仍调用原有 `service.createTodo`；`npm run typecheck`、`npm test`（192 项通过）和 `npm run build` 均通过。
**遗留**：描述是模型行为引导，不能保证每次对话都会调用；真实宿主中的主动调用效果尚未验证。

### 2026-11-11 · 备份恢复紧邻其他组件上方

**背景**：用户要求备份恢复菜单放到其他组件上方，并询问开发过程中是否会自动添加项目待办。

**决策**：交换项目配置与备份恢复的导航顺序，保留页签身份与现有表单挂载。待办问题按源码回答：当前只有手动及Agent工具创建，无会话自动提取或强制工具调用；没有借此增加自动待办功能。

**证据**：`npm run typecheck`、192项测试与两次构建通过；静态渲染导航顺序为`home,theme,general,project,backup,tools`。客户端摘要`4aaf2063ebf6325f68b426505204b6af86aed4492b611b0ff6d1fb6a1eac74ae`；包摘要`f89495ede0f4fc376b87e1f649e9f4d19d8b263a7272ce3ce5a376d8dd78950e`，官方CLI安装6项文件一致、bundle启用，主56829／宿主56865重启。`src/server/tools.ts`注册查询／创建／更新／删除待办工具，`Settings.tsx`的全局开关仅授权管理。

**遗留**：桌面可访问树仅菜单栏，实际面板视觉未验收。用户若要求开发时必然创建并维护待办，需要另行明确触发规则，本轮未增加此行为。

### 2026-11-10 · 恢复默认密钥与备份位置说明

**背景**：用户认为恢复密钥路径配置冗余，要求数据备份菜单仅添加密钥位置说明。

**决策**：同机恢复自动使用默认密钥，移除页面路径输入；说明放在数据备份中，优先实际路径并保留默认位置解释。底层指定密钥能力保留，不更改RPC契约；不同密钥归档仍需外部接口。

**证据**：`npm run typecheck`、192项测试及两次构建通过；恢复回调断言默认密钥、设置断言备份说明及无恢复输入。客户端688517字节、SHA-256 `69749128a04b02fee8f30405709d1d91cc2631393da779b6dc7f54f85dcea814`。tgz摘要`28e75a737110b18b0d1307b6684aee64893e00f7276ad40c7995092a83f0bbdc`，白名单6项和安装6项一致。备份完成后官方CLI重装并正常重启，主45537／宿主45569；真实桌面可访问树显示密钥路径，恢复页不再有该输入项。

**遗留**：未执行真实数据恢复；不同密钥的外部归档无法从简化页面指定密钥。语义挂载已验证，逐主题视觉未回归。

### 2026-11-10 · 本机认证 Cookie 累积导致启动失败

**背景**：恢复范围菜单安装后多次重启提示`desktop welcome: Web authentication failed`，用户担心恢复数据造成故障。

**决策**：核实宿主认证链路，测量Cookie长度并用虚拟值复现请求头超限；关闭应用、保留数据库回滚副本，仅清理本机`dsh-%`Cookie，不替换用户状态或修改宿主包。用户纠正后发现最后状态会被后续预览覆盖，撤回“未执行恢复”的断言，增加真实回滚副本与最新完成记录核对。

**证据**：初读`last-restore.json`为`ready`且`result=null`，但`RestoreManager.prepare`会重写最后记录。真实恢复回滚副本为`dsh-rollback-20261110-200805-6dbeb173.tar.age`及`dsh-rollback-20261110-202751-890bfeba.tar.age`；最新20:27:51记录为`completed`、`mode=workbase`、`revision=234`。`sqlite3 -readonly`聚合71项本机Cookie、16117字节；默认Node HTTP服务配合桌面长度请求头，70项200／71项431，`http.maxHeaderSize=16384`。Cookie回滚数据库位于Electron用户目录`Cookies-before-auth-cleanup-20261110-2025.sqlite`。清理71项后，主42964／宿主42994启动；桌面可访问工作台设置及运行中的自动备份。

**遗留**：这是本机缓存清理，不是宿主源码修复。按端口生成的认证Cookie仍会跨端口累积，大量重启可能复发；最后结果不是历史审计记录，早先恢复是否完成不能只用后续预览状态判断。最新真实工作台恢复已有完成证据，逐项业务数据比对与菜单视觉仍待验收。

### 2026-11-10 · 恢复范围说明菜单与直接执行

**背景**：用户反馈恢复范围下拉长文案被截断，并要求优化选项、移除下方重复确认。

**决策**：复用现有Picker，选项采用短名称及两行效果说明；移除确认开关，动作按钮改为「开始恢复」。继续要求成功预览、有效范围及必要目录，工作台阻断项不可选择且执行按钮仍复核；点击选项本身不触发恢复。

**证据**：`test/restore-settings.test.ts`修改前复现旧按钮与select不满足新交互，修改后验证说明选项、无重复确认、工作台直接开始、目录缺失禁用、目录恢复可用及工作台阻断保护。192项、类型检查、重复构建及安装六项一致检查通过；摘要与重启记录见本文最新状态。

**遗留**：未执行用户真实恢复，仅验证隔离样本与事件回调。安装后主进程已重启，但宿主welcome Web认证失败，需用户完成登录；旧预览令牌随重启失效，登录后需重新预览。

### 2026-11-10 · 备份下拉限高与内部滚动

**背景**：用户要求下拉框达到一定高度后内部滚动，避免列表随可用空间无限变高。

**决策**：将备份列表最大高度设为320px，作为定位函数的显式上限；取上限与面板／弹窗剩余空间的较小值后测量和定位。现有overflow滚动样式继续生效，其他调用沿用默认定位。

**证据**：`test/ui-format.test.ts`验证大面板320px上限及向下定位，小弹窗仍缩小为164px。`npm run typecheck`、192项测试、两次一致构建和安装六项一致检查通过；摘要和主／宿主进程见本文最新状态。

**遗留**：自动测试覆盖几何约束；真实长列表滚动与不同主题视觉仍待用户验收。

### 2026-11-10 · 恢复预览拒绝操作标识

**背景**：用户选择真实备份后点击预览，出现“参数不合法，请检查输入”。

**决策**：追踪到`rpc.ts`把含`op`的命令原样传入`RestoreManager.preview`，被`restoreInputSchema.strict()`拒绝。RPC边界显式组装`archive`／`keyPath`，保留两层严格校验及所有者授权；不放宽schema。

**证据**：`npx tsx --test --test-name-pattern='恢复预览通过真实RPC' test/restore.test.ts`在修复前复现invalid错误，修复后全量191项、类型检查和两次一致构建通过。截图真实归档通过隔离的dispatch→service→manager预览，校验2782个文件／59768331字节达到ready，当前工作台状态未写入；随后discard清理。安装包摘要和官方CLI安装重启证据见本文最新状态。

**遗留**：真实归档的解密及摘要校验已验证；此轮没有执行用户数据替换或完整恢复激活，桌面端点击结果待用户复验。

### 2026-11-10 · 点击备份文件框直接选择

**背景**：用户要求点击输入框时直接下拉，无需输入路径。

**决策**：保留单框外观并设为只读，整框点击即刷新展开，显示文件名并保留完整路径作为恢复参数与悬停提示。移除文字筛选与手动路径编辑，复用已有列表定位、关闭和预览锁定逻辑。

**证据**：`test/restore-settings.test.ts`验证点击框体即展开、readOnly且无编辑回调、完整路径选择、Enter展开与Escape关闭；`npm run typecheck`和190项测试通过，两次构建客户端SHA-256均为`ccee3a532d4f7d31ab9d81bc686d2b4d50b9af87cb699554d3e9b7b8b6f03a79`，服务端未变。

**遗留**：自动测试验证React事件回调，真实不同窗口和主题的视觉仍待验收。

### 2026-11-10 · 真实短名、单框选择与保留期限

**背景**：用户要求旧归档的真实名称缩短，恢复文件直接在输入框下拉选择，并配置7／14／30天或永久的保留期限。

**决策**：两份旧文件用硬链接建立短名，摘要一致后移除旧名，不覆盖已有档。恢复采用可编辑路径combobox，复用现有顶层浮层定位，保留手动路径入口。期限默认永久，旧配置及增量请求分别补默认与合并，避免旧客户端覆盖期限。过期清理在新档成功后执行，解密校验归档并依据清单时间判断，回滚和异常文件保留。

**证据**：`npm run typecheck && npm test && npm run build`通过190项；重复构建两端SHA-256一致，具体摘要、六项白名单和官方CLI安装重启证据见本文本轮最终证据。`test/backup.test.ts`覆盖永久、有限期、坏档、链接、回滚及新备份失败不删除；`test/restore-settings.test.ts`覆盖同框展开、筛选、选中完整路径、Escape关闭与恢复预览流程。真实改名两个文件分别62703752／62743192字节，SHA-256保持`56de34680bc4aca5ead4a1549d60421966d3101758d97c752cef4b360520e59d`／`04366794987a9a9f04d52cc68285e953fc461cd04286ae9ad71b457692974658`；结果记录指向原本已为短名的最新备份，无需修改引用。

**遗留**：本轮真实用户归档未执行过期删除，有限期限清理只在隔离样本验证；实际浮层在不同窗口、主题下的视觉尚未实机验收。

### 2026-11-10 · 子级设置控件与父级右对齐

**背景**：用户截图标出其他组件中的父子级开关错位；自动更新开关比显示插件更新开关向左偏16px。

**决策**：修改视觉真源 `.setting-dependent` 的padding为`0 0 0 16px`，保留左侧层级缩进，只移除右侧额外空间。最近会话与侧栏从属设置复用相同规则，避免单独给开关补位或破坏设置行布局。

**证据**：`docs/ui/ui-directions.html` 的`.setting-dependent`规则经`npm run build`同步到生成CSS；本地断言确认右侧padding为0、括号配平、宽度型媒体查询0及温暖主题保留。类型检查、188项测试、两次客户端哈希一致；包六项白名单、当前文件一致及六类指定敏感模式未命中。官方desktop CLI remove/add成功，六项安装文件一致、bundle启用；旧主23863／宿主23939退出后新主25732／宿主25798启动。

**遗留**：未执行浏览器几何测量或真实桌面视觉验收，未提交或发布npm。回收的测试目录与npm日志如需找回，先打开Finder废纸篓检查sboxbackup，找到后手动拖回原位置。

### 2026-11-10 · 缩短备份名称及恢复列表标签

**背景**：用户截图显示恢复原生下拉框被包含毫秒时间戳和完整UUID的文件名撑满，难以选择。

**决策**：新文件保留本地日期、秒级时间与8位随机标识；回滚副本保留类型标记。恢复列表统一显示类型、修改时间和短标识，完整名称只在悬停信息及路径中保留，历史归档不改名。正式归档用同卷硬链接发布，重名拒绝覆盖；任务完成后清理临时链接。

**证据**：`test/backup.test.ts`验证本地时间短名称、同名目标不覆盖及新目标内容一致；`test/restore-settings.test.ts`验证新旧UUID名称均显示8位标识且完整路径不变。`npm run typecheck && npm test && npm run build`通过188项测试，两次构建哈希一致。安装包六项白名单及当前文件一致、六类指定敏感模式未命中；官方desktop CLI remove/add成功，六项安装文件一致且bundle启用；旧主18692／宿主18741退出后重新启动，新主23863／宿主23939存在。

**遗留**：真实旧备份未改名，目录中的旧长名称仍在；原生下拉视觉由用户验收。归档发布需要目的卷支持硬链接，无此能力时明确失败而非覆盖降级。未提交或发布npm；回收的测试目录及日志如需恢复，先打开Finder废纸篓检查sboxbackup，找到后手动拖回原位置。

### 2026-11-10 · 安装备份恢复版本并重启桌面

**背景**：用户明确授权安装当前本地插件并重启桌面，使备份恢复功能进入真实desktop环境。

**决策**：保持版本0.3.1，重新构建与打包，通过桌面应用自带官方CLI remove/add刷新同版本本地包；确认安装一致及启用后向旧桌面主进程发送SIGTERM，等待主进程和宿主退出再用`open -a "DeepSeek Harness"`启动。

**证据**：`npm run typecheck && npm test && npm run build && npm pack --json`通过，186项测试、包内6项白名单与当前文件一致，六类敏感模式0命中；`shasum -a 256 -c dsh-workbase-0.3.1.tgz.sha256`通过。官方CLI `plugin --profile desktop remove dsh-workbase`及`add`成功，安装目录6项文件逐字节一致，profile bundles包含dsh-workbase；旧主12485／宿主12521退出，`ps -axo pid,ppid,command`确认新主18692／宿主18741，官方CLI list显示0.3.1。

**遗留**：未在真实数据上执行备份或恢复，未做桌面视觉验收；版本沿用当前源码，未提交或发布npm。测试工具回收的临时项目与npm日志如需找回，先打开Finder废纸篓检查sboxbackup，找到后手动拖回原位置。

### 2026-11-10 · 恢复预览、工作台替换与隔离目录发布

**背景**：用户要求在已实现前端备份的基础上继续实现恢复；现有宿主没有统一冻结、重载会话／附件／Profile 的维护事务接口，直接覆盖运行目录无法保证安全激活。

**决策**：沿用前端操作与后台任务，提供工作台正式存储替换和完整归档目录恢复。tar先扫描再白名单提取，拒绝穿越、链接、特殊类型、大小写冲突与摘要伪造；预览令牌15分钟仅内存，确认重查文件及清单。业务服务串行核实项目目录与工作树关联，记录revision防止覆盖新数据；替换前校验加密回滚副本并保存结果，再调用storage。保留当前备份偏好、关闭插件自动更新，不重放历史任务；缺少宿主维护接口的原位激活留待后续。

**证据**：`test/restore.test.ts`验证真实加密备份预览、回滚归档再次恢复、版本冲突、目录发布、密钥错误、令牌过期、清单篡改、任务互斥、部分写入与自动回滚失败、恶意tar条目；`test/restore-settings.test.ts`通过真实组件事件回调验证确认前不执行、范围阻断、完成刷新及迟到轮询不覆盖预览。全量类型检查、测试及重复构建结果见上半当前状态，可用`npm run typecheck && npm test && npm run build`复现。

**遗留**：仅隔离数据与模拟宿主服务验证，不证明真实desktop存储热替换、会话原位激活或逐主题视觉。未更新或重启桌面插件，未提交或发布。回滚副本只包含替换前Workbase状态，完整归档中的观察副本不具备跨源一致性保证。测试过程回收的临时项目目录及npm日志如需恢复，先在Finder废纸篓检查sboxbackup，再找到条目手动拖回原位置。

### 2026-11-10 · 备份恢复增加三个二级菜单

**背景**：用户指定在备份恢复中添加数据备份、数据恢复、执行状态，以分离操作与结果。

**决策**：复用 SettingsSubtabs，默认选择数据备份；三个面板以 hidden 切换，备份与恢复组件持续挂载。恢复状态通过回调供执行状态页展示，保留原有轮询和恢复完成通知，避免切换时丢失草稿、预览或误清恢复忙状态。执行状态集中展示备份覆盖明细及两类任务产物路径。

**证据**：`test/settings-render.test.ts` 分别渲染三个页签，核对表单分区、隐藏状态与 aria 关联；`npm run typecheck`、`npm test`（186项）、`npm run build`通过。原型导航同步三个子分类，支持左右键、Home、End及预览参数。

**遗留**：未安装、更新或重启真实宿主，未执行浏览器视觉验收；并行恢复开发的接口与状态逻辑保持。

### 2026-11-10 · 备份恢复独立为设置一级菜单

**背景**：用户确认采用四字菜单名「备份恢复」，需让数据操作拥有独立入口。

**决策**：将备份组件从通用配置移到其后的独立分类，菜单与页标题统一为「备份恢复」，复用归档盒图标；保留原有配置草稿、后台任务与状态回读。原型同步导航入口，备份操作仍以实际组件为准；并行恢复开发的回调接线保留。

**证据**：`src/client/Settings.tsx` 的分类数组与 `wb-settings-panel-backup` 定义入口及面板关联；`test/settings-render.test.ts` 核对六个分类。`npm test` 175项通过，`npm run build` 通过。

**遗留**：本轮未安装或重启真实桌面宿主，未执行浏览器视觉验收；恢复能力的开发不属于本轮菜单调整。

### 2026-11-10 · 实现设置立即备份与启动自动备份

**背景**：用户确认现行在线方案并要求实现两个备份入口，任务需要随宿主后台执行而不依赖设置页挂载。

**决策**：任务由 BackupManager 常驻管理，客户端只在主插槽及配置就绪后通知启动，宿主以进程标识去重；正常保存开关下次启动生效，立即备份独立保存备份配置。采用 age 标准加密与流式 tar，首次生成本机0600密钥并从归档排除。会话读取正式 flush 后的固定连续前缀及继承长度；SQLite 在线副本继承 WAL 标记，只转换临时副本为 DELETE 模式后验证，清理副本遗留 shm。普通文件验证读取前后元数据与摘要，仍只声明观察副本。

**证据**：`test/backup.test.ts` 的真实保持连接 SQLite WAL 样本验证已提交记录、独立只读与旁路排除；会话1025事件分512／512／1读取，保留fork继承长度。测试还覆盖39项策略、owner、重复触发、启动延后与中断、目录重叠、密钥权限、加密篡改和模拟ENOSPC。`test/client-entry.test.ts` 验证主插槽前不触发、重连不重复、卸载后不触发。完整工程验证结果见本节当前状态。

**遗留**：没有备份用户真实数据，没有安装或重启桌面宿主；真实profile挂载与端到端上传未验收。系统需提供sqlite3，安装负载的node_modules不归档；跨窗口插件操作缺少统一后端活动接口，读取变化会显示范围失败。客户端状态、自定义附件根、跨源引用与恢复事务后续适配。

### 2026-11-10 · 详情项目切换菜单统一卡片目录样式

**背景**：详情页点击目录切换项目时，菜单中的完整路径占用空间，且与项目卡片的目录辅助行不一致。

**决策**：复用 `directory-name`、`directory-label` 与实心四圆点图标，菜单正文仅显示文件夹名称；完整路径保留在选项悬停提示中。Picker 增加可选描述渲染回调，其他选择器保持原有描述展示；同步原型菜单模板。

**证据**：`src/client/Detail.tsx` 的 `renderDescription` 与 `docs/ui/ui-directions.html` 的 `openComposerPicker` 均使用相同目录结构。`npm run typecheck`、`npm test`（160 项通过）、`npm run build` 通过。

**遗留**：用户随后授权安装并重启；已通过应用自带 CLI 在 desktop 重新安装，六项包文件与当前构建逐字节一致、bundle 已启用，并通过 `open -a "DeepSeek Harness"` 启动新主进程 12485 与宿主 12521。安装包 SHA-256 为 `9e151b4debd2cecf8727fc7b6a265c135df0f69107688745327515c7ccc09167`。实际浏览器弹出菜单与真实宿主视觉效果尚未验收。

### 2026-11-10 · 备份入口改为设置按钮与启动后台任务

**背景**：用户明确取消独立 CLI，要求前端按钮备份，并可在每次打开时自动后台执行。

**决策**：由现有宿主后端常驻管理任务，设置页只触发与回读；自动备份按宿主启动周期去重，默认关闭。在线逐类适配不等于全局一致快照，未支持项明确显示；旧停机设计标为历史参考。

**证据**：`docs/online-backup-plan.md` 定义现行入口、在线能力门槛、任务生命周期与实施次序；`src/server/index.ts` 已有 owner Fetch 路由，`node_modules/@deepseek-ai/dsh-storage-domain/README.md` 的限制说明明确没有跨表事务。

**遗留**：本轮仅调整方案，未添加备份代码。会话稳定读取、数据库在线 backup、后台加密配置与恢复维护能力需在实现中验证，不声称当前已有完整在线备份保证。

### 2026-11-10 · 基于盘点明确备份恢复实施门槛

**背景**：用户要求把 P0 盘点转成具体实施方案；共享外部根、混合敏感数据及多文件系统恢复无法用复制 DSH 主目录解决。

**决策**：先交付独立 CLI，再做恢复事务与宿主维护验收，最后接 UI。默认整包采用成熟 age 加密；未分类数据保存但隔离激活；精确插件载荷和多根 journal 分别验收，避免把归档校验当作运行恢复保证。

**证据**：`docs/backup-restore-implementation-plan.md` 定义 39 个盘点 ID 的适配器映射、8 类缺口门槛、拟新增模块与命令、冷态 SQLite 验证、多根切换／回滚和阶段测试；构建入口依据 `build.mjs`，CLI 白名单变更依据 `package.json`，业务域依据 `src/server/index.ts`。

**遗留**：方案尚未实施；age／SQLite 配套、宿主维护能力和精确版本解析器需在实现中验证。本次只修改文档，无停机、真实数据备份、恢复、源码测试或发布。

### 2026-11-10 · 备份恢复完成本机数据盘点基线

**背景**：用户授权按备份恢复方案执行 P0，需在归档实现前明确 DSH、插件及 Profile 的真实数据边界，避免仅备份 storages 或 DSH 主目录造成遗漏。

**决策**：采用只读目录元数据、受控配置字段、已安装 bundle／源码和宿主打开文件交叉核对；不读取正文、凭据、私钥或浏览器存储值，不执行 YAML 表达式。desktop CLI 官方拒绝导出时读取应用归档内定义，不绕过其管理限制。外部共享技能、XDG 数据和历史状态单独分类，未知内容不默认当缓存排除。

**证据**：`docs/backup-data-inventory.md` 与 `.json` 记录3个Profile、12个直接安装记录／11种第三方包；`readdir`／`lstat`观察13份 `session.v4.jsonl.zstd` 共164215字节、3个Workspace和1个待办。公共技能8个链接中4个目标缺失，web安装树20个链接中7个失效；billion-context 的配置、SQLite及CA元数据确认位于XDG目录。路径、源码与可复现方法见报告第7节；JSON通过结构和关联自检。本轮只增改文档，未运行源码构建或修改真实数据。

**遗留**：未确认全部运行时环境覆盖、tui配置组合与回收站桥兼容；task-board／skin-center所有者、缓存重建、客户端导出、共享SQLite及离线插件载荷尚未验证。P0基线完成不代表完整备份／恢复保证。仅执行盘点，P1归档程序未实施，不提交Git或发布npm。

### 2026-11-10 · 设置与统计恢复统一1120px上限

**背景**：用户确认两类弹窗应保持统一宽度，要求设置也改为1120px。

**决策**：原型共用尺寸变量改为1120px，移除统计专属的重复覆写；两处宿主适配回退值同步。保留面板90%、650px以下全宽、480px以下控件上下排列及原滚动行为。

**证据**：`npm run typecheck && npm test && npm run build`通过156项；再次构建客户端665298字符，两次SHA-256均为`46651410dab5d2962a6bf0e3a5216c69a8519cc53f9da1949cbb9815649c3b93`。原型真源、生成CSS与宿主覆盖共享1120px上限。

**遗留**：仅更新源码和构建，未重新打包、安装或重启宿主；真实宿主视觉未重新验收。

### 2026-11-10 · 按多维表格实际代码区分设置与统计限宽

**背景**：用户要求参考高级权限和自动化实现代码，明确不以截图推测宽度。

**决策**：设置改为860px上限，统计保留1120px；保持面板90%及650px以下全宽，不照搬官方最小860px导致的小窗口溢出。尺寸变量放在原型真源，统计通过`.stats-drawer`覆写，宿主适配读取同一变量。

**证据**：实际加载版本为`ee/docs/bitable/1.0.10.5811`。源码地址为`https://cdn.example.com/obj/feishu-static/eesz/bear/smartable/module/ee/docs/bitable/1.0.10.5811/index.css`及同目录`index_merged_es6.js`，可用`curl -fsSL`复查。CSS公共变量为最小860px、最大1580px、AI侧栏350px；高级权限`.bitable-perm-v2-drawer .ud__drawer__content__wrapper`覆写为最小宽度变量，AI侧栏可见时相加；自动化主抽屉为`width:calc(100vw - 100px)`、`max-width:1580px`、`height:calc(100vh - 50px)`。JS公共抽屉也声明上述宽度公式及最大宽度变量。授权页面打开高级权限后，658px视口的DOM计算宽度仍为860px。`npm run typecheck && npm test && npm run build`通过156项，两次客户端665372字符、SHA-256均为`4a320e1bb41afa246b3beb0b064554556efd90cc5415b56cb14083fb41bf48ad`。

**遗留**：自动化尺寸为加载源码的静态证据，未打开自动化弹窗复测DOM；没有读取截图。工作台仅更新源码与构建，未重新打包、安装或重启，真实宿主视觉未验收。

### 2026-11-10 · 设置与统计抽屉增加大屏限宽

**背景**：用户反馈设置及统计卡弹窗在大屏随面板90%宽度扩张，内容过宽。

**决策**：两类抽屉统一最大1120px，与首页统计区域宽度一致；保留中等面板90%及650px以下全宽。真源`.workspace-settings.dialog`加固定上限，styles.css宿主适配的`.wb-drawer`与更高优先级`dialog.wb-drawer.workspace-settings`均限制为`min(90%,1120px)`，防止实际客户端覆盖设计真源上限。

**证据**：`npm run typecheck && npm test && npm run build`通过156项；再次`node build.mjs`客户端665195字符、两次SHA-256均为`b5156b94f615b9c40cf5651da94e7f05eb0f91eada5411d0925f1fd07bee38ed`。源码与生成CSS核对1120px上限和650px全宽覆盖，CSS括号配平、宽度media为0、温暖主题保留；`git diff --check`通过。

**遗留**：本轮仅源码与构建，未重新打包／安装／重启。真实宿主大屏与窄屏视觉未验收；上一轮真实desktop安装的自动审批拒绝仍未得到用户显式安装授权。

### 2026-11-10 · 空会话批量删除移到列表标题行

**背景**：用户认可位置预览，要求将独占诊断说明下方一行的批量删除按钮移到右侧异常列表标题行，减少纵向空间占用。

**决策**：StatsProjectPanel提供随当前分类及可见数量更新的标题入口，标题是滚动列表的兄弟节点；空会话删除只在全部／空会话分类显示，缓存与孤儿原操作保留。全部异常文案明确空会话范围；搜索仅筛选显示，删除候选仍由未筛选报告生成。650px容器断点为诊断记录保留独立滚动，不影响普通统计页原窄屏滚动方式。

**证据**：`test/diagnostic-panel.test.ts`回归标题在滚动区域外、其他分类隐藏、无候选隐藏、缺失能力禁用，以及搜索仅剩一条时仍显示21个可清理候选；确认前0请求、确认后20+1分批且归档项排除的断言仍通过。`npm run typecheck && npm test && npm run build`通过156项；二次构建客户端SHA-256一致。生成CSS括号配平、宽度media为0、workbase容器查询54处、温暖主题保留；原型脚本语法及`git diff --check`通过。`npm pack --json`六项白名单、0.3.1版本与工作区逐字节一致，七类指定敏感模式无命中；包及客户端哈希见本页最新当前状态。

**遗留**：自动审批因用户未明确授权真实宿主移除／重装而拒绝安装操作；只读CLI核对原desktop为0.3.1、旧主62527／宿主62561，本轮未改宿主安装、未重启、未执行真实删除。浏览器／真实桌面视觉尚未验收。

### 2026-11-10 · 诊断卡摘要隐藏零值类型

**背景**：用户截图显示6个空会话，但卡片摘要先列目录0、缓存0、孤儿0，实际异常被末尾省略。

**决策**：摘要按类型仅列非零数量，无异常时保留检查正常或未完成，部分检查失败仍保留提示。原型摘要同步隐藏零值，不改变详情分类与异常总数。

**证据**：`test/diagnostic-panel.test.ts`新增仅6个空会话及混合异常回归，先确认输出仍含零值而失败，再修正为「空会话 6」和「缓存 1／空会话 1」；首页真实渲染测试核对仅目录异常时摘要为「目录 2」。155项测试、类型检查通过；两次构建663558字符，SHA-256均`d5f0c2ce343453afe052b481860d9c10d9212fb64a19cc128ce049c63b759321`。包白名单6项、源文件字节、版本及7类指定敏感模式检查通过；包SHA-256为`cab28601e590d59e32e1c9f3a4f2f2ad3c7ef6b6967d5ebc39ad2038afd2e601`，旁置校验通过。官方CLI remove/add后desktop六项文件一致、bundle启用；旧主61125／宿主61215退出后open启动，新主62527／宿主62561存在，`git diff --check`通过。

**遗留**：截图用来确认零值挤占问题，更新后的真实桌面显示由用户验收。不提交Git或发布npm。

### 2026-11-10 · 诊断新增空会话检测与一键全部删除

**背景**：用户要求诊断能够发现空会话并一键删除；既有诊断只检查目录、列表缓存与孤儿子代理。官方blank表示未开始回合，仍可能存在已排队用户消息，不能仅按blank或“新会话”标题清理。

**决策**：同时要求官方blank=true与lastPromptAt=null，排除分支、子代理、有后代及已加载／活动输入会话；缺失或损坏投影不判为空，后端提供eventCount时要求缓存水位完整覆盖日志。空会话加入统计、分类与空状态，单条和全部删除均先确认；复用20条／30KiB分批执行器及失败反馈，前后两层重新检查候选，变化项跳过，失败不中断后续。永久删除委托已启用归档插件deleteSession，成功后清理工作台标记与工作树关联；不修改归档插件，不访问私有队列、不自行删除文件。空能力字段可选以兼容旧报告，缺少空检查仍显示检查未完成。

**证据**：`test/diagnostics.test.ts`新增6项，先失败再通过，覆盖普通空会话、输入／活动／分支／子代理／后代保护、未知与陈旧缓存、删除失败继续、生命周期变化、owner及归档保护、同批变化项跳过和成功标记清理；`test/diagnostic-panel.test.ts`新增真实React回调测试，确认前0次请求、21个可写候选分20+1、归档候选不发送、完成刷新。统计卡测试补充旧三项结果不能冒充完整检查。`npm run typecheck && npm test`通过154项；两次构建客户端663514字符，SHA-256均`6801ed27b52d603e788498a1e1344f1ea4df76a5fcdea89d56b84070a61fc70a`。原型脚本语法及`git diff --check`通过。`npm pack --json`仅6项，版本及源文件字节一致，7类指定敏感模式0命中；包SHA-256为`cd379dad834c25cb5b4edb940d617904e95abca66cf968717fd762b8e4d08d45`且旁置校验通过。官方CLI remove/add后desktop六项文件一致且bundle启用；旧主54884／宿主54924退出后open启动，新主61125／宿主61215存在。

**遗留**：自动测试使用模拟宿主，没有删除用户真实会话或执行真实缓存重建；物理删除和界面由用户验收。现有归档插件deleteSession未提供条件式blank删除参数，本插件在调用前逐项复查，跨进程或复查与实际删除间竞争未实测，不承诺事务式清理。缓存未知项需先重建后复查，大规模列表性能未实测。不提交Git或发布npm。测试过程回收的临时目录与npm日志需人工从Finder废纸篓的sboxbackup查找并拖回原位置。

### 2026-11-10 · 切换项目保留并交接草稿附件

**背景**：快捷输入项目切换按workspace／preset重新挂载菜单，旧effect取消及释放引用先于目标加载；官方输入壳卸载会回收所持附件，只有正文缓存被目标恢复，图片附件没有交接。

**决策**：去掉项目／模式React key，当前输入引用存入组件持久ref，与可取消的目标加载分开持有。交接顺序沿用官方工作区选择器：接收附件、重新绑定上传、移交非空结构化正文、移除原附件，成功后同步提交引用所有权并释放旧引用，避免返回promise前取消产生空档。拒绝或加载失败保留原引用供重试，连续切换只让最后目标接续；真正卸载才释放当前引用。无实时来源时不把其他项目缓存覆盖目标服务草稿，加载或失败期间禁止正文编辑和发送，项目选择仍可用。不新增运行时依赖或附件持久化字段。

**证据**：`test/native-composer.test.ts`新增4项交接测试，`test/composer-files.test.ts`以组件实际effect／cleanup验证快速A→B→C，先确认5项失败，再通过；原布局测试补充未绑定期间textarea禁用，先失败后修复。`npm run typecheck && npm test`通过147项；两次`npm run build`均662197字符，客户端SHA-256均`b49011579cf7d9c8320e0422c7d6fee7f1cb1577396f13df4b90dd6fddf3aa01`。覆盖上传中附件、引用／正文、目标已有草稿、拒绝／加载失败、取消、快速切换、旧引用释放时不再持有附件及卸载释放。`npm pack --json`白名单6项，版本与源文件逐字节一致、7类指定敏感模式0命中；包SHA-256为`6c79cb58f91464fe8593491321ec81348ce06f186fe68f81bb73f28b0cd6d45b`，旁置校验通过。官方CLI remove/add成功，desktop六项文件一致且bundle启用，旧主32922／宿主32954退出后open启动，新主54884／宿主54924存在；`git diff --check`通过。

**遗留**：回归使用模拟宿主服务，不证明在线图片上传的目标重绑定或真实桌面控件挂载；实际拖入／粘贴图片后切换项目由用户验收。本轮仅修复草稿附件交接，其他平台服务接入缺口不在本次范围。不提交Git或发布npm。测试过程回收的临时目录与npm日志需人工从Finder废纸篓的sboxbackup查找并拖回原位置。

### 2026-11-10 · 快捷输入文件拖入与图片粘贴接入宿主

**背景**：快捷输入保留textarea布局，已有菜单文件选择与提交服务，但未绑定文件拖入和剪贴板图片；原文件选择直接分配附件，绕过官方桌面路径引用处理与图片预检。

**决策**：三种导入统一委托官方composer bar注入的addFiles，不复制真实路径识别、相对路径格式及失败释放。当前会话projections读取imageLimits，导入时核对上传权限、提交阶段和引用生命周期；批次校验在分配附件之前完成。textarea仅在存在文件时接管粘贴，混合文字按选区插入且保留正文；卡片阻止文件默认导航并使用真源强调色内描边。订阅上传状态，提供单附件失败重试／移除，沿用上传中与失败的发送拒绝。不引入运行时依赖。

**证据**：`test/composer-files.test.ts`先确认新增校验、传输解析及React事件回调不存在而失败，接入后通过；覆盖目录身份与顺序、files回退、数量／单张／总大小限制、混合文字粘贴、普通文字放行、提交锁定、权限拒绝、官方入口委托、上传失败重试及卸载释放。`npm run typecheck && npm test`通过142项；两次`npm run build`均661071字符，客户端SHA-256均`a25e6825d5513a841aba4423b4ea32c9b7878a5cd2ca9942f33b6d802b6c96e2`。原型内联脚本语法通过，宽度媒体查询0、容器查询53，温暖作用域和拖入样式保留。`npm pack --json`仅6项，逐字节核对源文件与版本；私钥／npm token／AWS key／邮箱／指定内部域名／POSIX用户路径／Windows用户路径7类模式0命中。tgz SHA-256为`700e43930280718866c3ba29303308766af1f53a4ff0740580244071fce843f9`，旁置校验通过。应用自带CLI remove/add成功，desktop安装6项一致、bundle启用，旧主28879／宿主29026退出后open启动，新主32922／宿主32954存在。

**遗留**：回归通过组件真实事件回调和模拟宿主服务，未执行真实桌面拖入、剪贴板图片上传及模型调用；桌面交互由用户验收，不截图。依赖官方composer bar注入与当前会话投影契约，宿主升级时需复核。不提交Git或发布npm。测试过程回收的临时目录与npm日志需人工从Finder废纸篓的sboxbackup查找恢复。

### 2026-11-10 · 快捷项目与模型下拉向下限高滚动

**背景**：用户指出首页向上空间有限，要求项目与模型弹窗向下展开，并在选项很多时限高滚动。官方模型组件硬编码top方向，未提供可覆盖的方向prop。

**决策**：统一按钮下方8px展开，最多360px，按工作台和可见视口交集中的下方余高收缩、底边8px。项目设置官方Menu的bottom方向，并用唯一菜单类名关联；模型依赖官方触发器aria-controls关联portal，仅覆盖top和max-height。官方滚动层、搜索、模型与推理强度状态不复制；MutationObserver处理portal挂载、官方定位写入及页面切换，ResizeObserver和滚动／视口事件更新尺寸，卸载移除监听。原型同步方向与限高，样式只补模型包装层适配。

**证据**：`test/native-composer.test.ts` 新增几何回归先失败再通过，覆盖360px上限、余高缩减、无余高及面板顶部交集；`npm run typecheck && npm test && npm run build`通过138项测试。隔离 `/tmp/dsh-composer-selectors-verify.mjs` 的many=1使用33项目、32模型；项目按钮底134px、菜单顶142px、高360px，官方列表scrollHeight1122/clientHeight352，滚到末项scrollTop770后选中成功、页面scrollY0。模型同位置高360px，列表1110/323，滚到末项scrollTop787，搜索框top153px不动，选中extra-29后关闭。width=360&height=270&theme=warm&dark=1时两菜单top142px、高136px、底278px，面板底286px，模型列表1110/99；面板clientWidth/scrollWidth均360px。高推理强度选择成功。连续两次构建657329字符、客户端SHA-256一致；原型内联脚本语法、CSS括号配平、宽度媒体查询0、容器查询53与温暖作用域通过。`npm pack`六项白名单、版本、当前文件一致及指定敏感模式0命中通过，旁置SHA校验通过。官方CLI remove/add成功，desktop六项文件一致且bundle启用；准确停止旧主24172与宿主24204，确认退出后open启动，新主28879与宿主29026存在。隔离验证服务已停止；哈希见安装与发布。

**遗留**：隔离组件使用模拟会话状态，不验证真实模型调用；实际桌面界面由用户验收，无需截图。定位依赖官方项目菜单类名与模型aria-controls关联，未来宿主DOM契约变化需复核。不提交Git或发布npm。

### 2026-11-10 · 快捷输入项目与模型选择对齐官方

**背景**：用户要求项目下拉不显示路径，模型下拉沿用官方并允许控制推理强度。旧模型 Picker 仅保存提供商和模型，发送前再次配置模型会覆盖官方会话中的推理强度。

**决策**：项目复用官方 Menu 与文件夹图标，保留项目身份和归档／目录限制，仅展示名称。模型镜像官方插槽的组件、顶层 locale、children 及注入数据，portal 到原模型位置，与输入菜单共用 SessionProvider；通过目录的 current、routable、pending 控制发送。原生提交取消重新选择模型，保留工作树登记与失败草稿；备用非原生链路不变。模型紧凑样式写入原型真源，不增加运行时依赖。

**证据**：`test/native-composer.test.ts`、`test/client-entry.test.ts` 与 `test/home-render.test.ts` 的新增回归先失败再通过；`npm run typecheck && npm test && npm run build`通过137项测试。隔离服务 `/tmp/dsh-composer-selectors-verify.mjs` 加载应用内官方项目 Menu 和模型组件，确认项目列表无路径、归档禁用、项目可切换；推理强度中→高后模拟提交记录为 official-select high、native-submit high、open，无 configure-session-model，草稿清空。360px温暖深色面板无横向溢出，官方模型按钮50px。第二次构建655240字符且客户端SHA-256一致；原型内联脚本语法、CSS括号配平、宽度媒体查询0、容器查询53及温暖作用域通过。`npm pack`六项白名单与当前文件一致，版本0.3.1、指定敏感模式0命中、旁置SHA校验通过。应用自带CLI `plugin --profile desktop remove/add`成功，六项安装文件一致、bundle启用；旧主15799及宿主15831退出后重新启动，`ps -axo pid,ppid,command`确认主24172和宿主24204。首次open与旧进程退出重叠，进程核对发现未启动；确认旧进程已退出后再次open成功。验证服务已停止，哈希见安装与发布。

**遗留**：隔离测试使用模拟会话后端，不证明真实模型调用；官方菜单跟随宿主主题，支持的推理强度取决于模型。桌面界面由用户验收，无需截图。未提交Git、推送或发布npm。

### 2026-11-10 · 启动自动更新与显隐开关联动

**背景**：用户要求后台更新期间禁用设置中的显隐按钮，并在其下增加每次打开应用时检查和后台安装的自动更新开关。
**决策**：复用shell.overlay常驻控制器，向设置提供实时忙状态，任务不依赖弹窗是否打开；保存期间省略被禁用的显隐字段。自动更新默认关闭且下次启动生效，首个成功配置快照与控制器注册双向等待，仅启动一次，不覆盖手动批次；隐藏子设置保留偏好，入口显隐与更新策略独立。
**证据**：新增测试先复现缺失功能，再通过`npm run typecheck && npm test`（134项）。`npm run build`两次客户端SHA-256均为`7073a5d2ada8abc3cd177b782aac49a25b215dada14e74c02c721decc0c439f1`，原型脚本语法、CSS配平、52个容器断点与0个宽度媒体查询通过；`npm pack`六项白名单、版本和私钥／本机路径／邮箱／指定内部域名模式检查通过。包SHA-256为`f768efc6b1b88e23bfb81e8c09a6984671fbcaeba411a737c68fe694ad7933e7`，官方CLI安装后六项逐字节一致、profile bundles启用；`open -a "DeepSeek Harness"`重启为主15121／宿主15157。
**遗留**：自动更新请求通过隔离mock验证，未升级用户真实插件或开启其自动更新偏好；没有执行浏览器视觉回归。真实应用启动、网络失败提示及在线升级由用户验收；插件HMR重载会建立新客户端实例，该实例仍依据当时保存的启动偏好检查一次。

### 2026-11-10 · 更新卡片长来源省略与分组互斥

**背景**：截图显示长包名来源换行使卡片高度不同；用户要求打开一个分组时关闭其余分组。

**决策**：来源dd设置flex收缩、单行省略，title保留完整安装来源；grid同一行stretch对齐。正式组件用单个分组ID替代数组，点击当前组可收起全部；原型同步互斥切换，后台更新结束保留用户当前选择，不强制再展开更新组。没有更改更新任务或业务合同。

**证据**：`npm run typecheck && npm test && npm run build`通过128项，两次客户端SHA-256均为`7163e5b4e5642a2e118b2e160e42e03e2392cbb60f145da27847c63806c4a687`。临时`/tmp/dsh-plugin-update-verify.mjs`使用实际PluginUpdate及官方宿主组件，547px宽的长来源样本卡高100px、来源高18px、scrollWidth大于clientWidth且nowrap／ellipsis／完整title生效；点击最新和跳过后只有目标组aria-expanded为true。包六项白名单、文件一致、版本及指定敏感模式检查通过；CLI安装文件逐字节一致、bundle启用，主11543与宿主11575已启动。

**遗留**：隔离浏览器后续高度被压至313px时组标题点击被裁剪，此高度下的完整交互未验证；桌面三列和逐主题效果由用户验收，未升级真实其他插件。安装CLI修复desktop既有锁文件缺项，将billion-context从0.1.212对齐package.json已声明0.1.213；未手改该依赖声明。

### 2026-11-09 · 插件更新分组独立滚动与后台进度

**背景**：用户要求卡片列数随宽度变化、各分组独立滚动并降低弹窗高度；更新中可关闭和重进查看进度，诊断截图中的摘要行移除。

**决策**：原型与正式更新组件同步860×620px紧凑布局，grid按230px最小卡宽自动分列。展开分组均分剩余高度，只滚动组内列表；默认展开更新组。任务阶段与弹窗显隐分开，关闭不dispose控制器，重开不发新检查，整个批次仍串行。统一说明在固定底栏，错误、恢复输出及重启结果留在卡片。诊断只删检查摘要和时间，不改检测／修复或空状态。

**证据**：`test/plugin-update.test.ts`新增关闭重开保留步骤、关闭后完成第二项及结果、不重复检查和安装断言；`test/diagnostic-panel.test.ts`验证摘要移除但分类数、错误与空状态仍在。`npm run typecheck && npm test && npm run build`通过128项，两次构建客户端SHA-256均为`0badf22549ae8815e810fe73c76773afbaaa5316ee422882175ab3ad77f4c726`。原型脚本语法与CSS括号配平通过；本轮包六项白名单及文件一致性、版本、指定凭据／路径／域名模式扫描通过。官方CLI卸载重装，desktop六项文件与包一致、bundles包含dsh-workbase；主10167与宿主10198已重启。

**遗留**：后台批次只在当前插件实例存活期间保持，重启宿主、卸载或更新工作台自身会结束实例；客户端不跨实例恢复。未实际升级其他插件，未浏览器运行或截图，真实分组滚动与逐主题视觉由用户验收。

### 2026-11-09 · 诊断弹窗移除重复状态卡

**背景**：诊断分类导航已显示三类及异常数量，顶部三张正常状态卡重复占据内容空间，用户确认移除并改为检查摘要。

**决策**：保留说明下方横线，后接一行状态／异常数／最近检查时间；异常详情继续按类型展示。只为诊断分类增加居中主状态和辅助说明，普通统计空状态保持原样。失败、能力缺失及检查项缺失必须显示原因，不把零异常当作全部正常；修复和检测合同保持原有实现。

**证据**：`npm run typecheck && npm test && npm run build`通过127项测试；`test/diagnostic-panel.test.ts`覆盖正常、缺失检查、读取失败与能力缺失。原型内联脚本经`vm.Script`语法检查；生成CSS括号1488对、宽度型media为0、workbase容器查询52处且温暖主题保留。两次构建客户端SHA-256相同，官方CLI卸载重装后包内六项文件与安装目录逐字节一致、profile bundle启用。

**遗留**：没有运行浏览器或截图，桌面实际布局、逐主题及重新检查操作由用户验收；本轮没有操作真实缓存重建或孤儿清理。

### 2026-11-09 · 插件更新分组卡片的独立原型

**背景**：用户指定原型技能，希望增大更新弹窗并固定高度，按可更新／已是最新分组，默认折叠已是最新，卡片参考官方版本对照且说明只显示一次。

**决策**：独立离线预览位于docs/ui/plugin-update-preview，不替换正式视觉真源或桌面实现；860×740px弹窗按可用视口收缩。用户两次反馈卡片偏大后改为三列，面板760px以下双列、520px以下单列；内边距8px、版本区28px、卡片间距8px。字号对齐正式插件：名称14px、版本13px、来源及状态12px。头部与底栏固定，正文独立滚动；本地来源单独折叠为「跳过更新」，不冒充最新。说明统一放底栏，更新结果仍留在对应卡片。

**证据**：入口index.html相对引用styles.css、mock.js、api.js及view.js；数据与模拟异步服务集中管理，无网络调用，包含可更新／全部最新／部分失败三个场景。源码已静态核对资源、图标引用、事件绑定、关闭与重开、折叠状态及响应式规则；git diff --check通过。

**遗留**：遵循本轮指定prototype-craft技能仅做静态审阅，未浏览器运行、未安装到桌面；所有版本和更新结果为模拟数据。正式组件继续使用此前已安装实现。

### 2026-11-09 · 收敛用户插件更新范围与诊断类型分组

**背景**：用户发现更新列表含内部插件，要求参考官方确认信息；同时指出目录、缓存及孤儿诊断不应继续按项目分组。

**决策**：使用官方库存的安装归属字段过滤，不凭包名前缀或可更新标记猜测；本地来源保留跳过状态。确认页复用原生组件和有效主题令牌，逐项显示版本、来源、短暂停止和失败恢复说明，修正默认源null被误拒绝。诊断保留类型导航与现有记录操作，不改变检测或修复合同，搜索具体记录并保留项目／路径／会话信息，零异常类型仍显示真实检查状态。

**证据**：新增来源隔离、默认源null及诊断类别断言先失败，修复后`npm run typecheck && npm test && npm run build`通过126项0失败。两次构建646456字符且SHA-256一致，哈希见当前状态；原型脚本通过node:vm语法检查。隔离浏览器用实际官方组件检查三项用户插件、零内部／官方目录项，默认源与国内镜像、新旧版本及恢复说明；模拟更新保留重启与旧版恢复结果。诊断缓存分类包含两个不同项目；搜索session-two只余对应一条，零孤儿分类显示能力不可用，480px面板上下布局且无横向溢出。最终深色版本模块背景rgb(53,54,56)、版本16px、弹窗无横向溢出。六项tarball文件与工作区／desktop安装文件均逐字节一致，指定敏感模式零命中，profile bundle启用。

**遗留**：没有执行真实第三方插件批量升级或物理会话清理。隔离环境没有加载宿主图标sprite，版本箭头的图形以真实宿主验收为准；生产仍使用官方IconChevronRightOutlineRegular。诊断上层标题保留用户此前指定的「项目诊断」，分组维度已改为异常类型。

### 2026-11-09 · 修复批量更新的远程子服务注入

**背景**：真实桌面点击一键更新时出现 `cannot get property "remote.pluginManager" without inject`；此前隔离浏览器没有模拟Cordis子服务注入权限，未发现接线缺失。

**决策**：按官方插件页的依赖声明，在客户端入口保留remote并显式增加remote.pluginManager，不改变更新规则。入口回归测试模拟子服务权限边界，通过实际shell.overlay控制器检查，并验证卸载取消进度订阅。

**证据**：`npx tsx --test --test-name-pattern='更新入口声明远程子服务注入' test/client-entry.test.ts`在修复前复现同一报错；修复后`npm run typecheck && npm test && npm run build`通过124项0失败。连续两次构建客户端SHA-256均为`abebf4be05a3eeb79f682b358a7f3e99506da4299847d8bcabf17621e449f13d`；新包SHA-256为`25e1b49b6707c37da9f04068de3870597a78d05756d9fcd84811ce7600faa6a3`。六项白名单文件与源码产物、desktop安装文件均逐字节一致，指定私钥、本机路径及内部域名模式零命中；官方CLI完成同版本0.3.1卸载重装，profile的dsh.profile.bundles仍启用工作台。

**遗留**：没有执行真实第三方插件升级；真实检查与更新结果由用户验收。本地tarball不支持在线更新的提示仍符合官方规则。

### 2026-11-09 · 插件页批量更新与组件开关

**背景**：用户要求在官方插件页刷新按钮左侧增加一键更新，复用官方更新弹窗，呈现全部插件的检查、更新和完成状态，并在其他组件中控制显示。

**决策**：复用官方pluginManager.listBundles／listVersions／updateBundle及plugin-manager/update-state事件，保留来源、启用状态及宿主回滚逻辑。无工具栏插槽，采用独立shell.overlay及portal挂载，不替换官方面板。新增pluginUpdateVisible默认true，增量命令不补默认，旧设置请求保留选择。正式版本筛选与官方一致；串行更新，自身最后，单项业务失败继续，传输丢失停止以避免结果未知时继续修改。原生Modal增加批量正文滚动约束。

**证据**：`npm run typecheck && npm test && npm run build`通过123项0失败；最终连续两次构建642602字符且SHA-256一致，哈希见上文。包六项白名单与工作区逐字节一致，指定私钥、本机路径及内部域名模式0命中。隔离浏览器使用桌面实际前端共享组件和原生主题，验证刷新左侧位置、checking→confirm→updating→done、部分失败恢复与输出展开；设置保存false时按钮和锚点均0。深色413×241窗口弹窗360×193、正文31px可滚动且scrollHeight369px，底栏位于视口内、无横向溢出，背景rgb(44,44,46)、文字rgb(249,250,251)。官方CLI remove/add成功，六项desktop文件与包一致，package.json的dsh.profile.bundles含工作台，已正常退出旧主进程并重启。

**遗留**：浏览器更新使用模拟结果，没有执行真实第三方插件批量升级；真实桌面挂载、逐插件更新及逐主题效果由用户验证。HMR更新工作台自身可能卸载其结果组件，当前本地tarball来源通常不可在线更新且会跳过。构建期间另一次构建曾改变客户端产物，已重新完成检查、两次一致构建、打包及内容核对。

### 2026-11-09 · 诊断检查按钮移至标题右侧

**背景**：用户要求将状态卡下的重新检测按钮移到项目诊断标题右侧，并优化按钮文案。

**决策**：诊断组件管理自己的标题与说明，让按钮沿用原有检查锁与卸载取消逻辑；同一标题行用flex靠右排布，按钮14px文字和刷新图标，文案统一为重新检查／检查中。修复期间沿用处理中，空修复操作栏不占位。实际组件、视觉真源、PRD及UI规范同步。

**证据**：`npm run typecheck`、`npm test`（123项）及`npm run build`通过；诊断渲染回归核对按钮在标题行中。原型脚本语法通过、生成CSS配平，宽度媒体查询0、容器查询53、温暖主题保留。`npm pack`六项与当前文件逐字节一致，旁置SHA校验通过，指定本机路径／私钥／令牌／内部域名模式无命中。官方CLI remove/add成功，desktop六项安装文件与最新包一致，profile bundle启用。正常退出后`open -a`重启，`ps`确认主进程536与宿主578。

**遗留**：未执行真实会话修复或清理，未截图或逐主题视觉验收；由用户查看桌面界面效果。

### 2026-11-09 · 安装最新诊断与统计标题桌面包

**背景**：此前桌面管理被自动审批拦截，用户本次明确授权「安装更新」。

**决策**：使用应用自带CLI更新desktop。同版本直接add返回Already up to date但文件不一致，因此remove后重新add，并逐项核对最新包；通过osascript正常退出再open重新启动。

**证据**：`shasum -a 256 -c dsh-workbase-0.3.1.tgz.sha256`通过；官方CLI `plugin --profile desktop remove dsh-workbase`及`add`成功，`list --depth 0`显示0.3.1。使用`tar -xOzf`与desktop安装目录逐字节比较，LICENSE、lib/client.js、dist/index.js、package.json、README.md、cordis.patch.yml六项一致；profile的dsh.profile.bundles包含dsh-workbase。`ps -axo pid,ppid,command`确认新主98460及其宿主98504。

**遗留**：未执行真实缓存重建或孤儿清理；未截图、未检查实际组件挂载或逐主题视觉，界面效果由用户验收。未提交、推送或发布npm。

### 2026-11-09 · 统一统计弹窗内容标题

**背景**：统计内容区标题与用户要求的四个分类名称不一致。

**决策**：仅统一内容标题为运行中／近期会话／项目待办／项目诊断，侧栏名称和统计口径不改；原型预览选择项同步。检查期间补齐新插件更新模块的请求ID返回类型，并将缺失的上箭头导出替换为SDK提供的上向chevron以恢复构建门禁。

**证据**：`src/client/Home.tsx`的stats-page-heading及`docs/ui/ui-directions.html`的statsPanel同步。`npm run typecheck`、`npm test`（122项）、`npm run build`通过，`npm pack`生成六项白名单包，`shasum -a 256 -c dsh-workbase-0.3.1.tgz.sha256`通过。本次tgz为 `9022c0defcfb7c339607d825c06ef5436a94f080a1618d3240adf80032a653cc`。

**遗留**：当时desktop插件管理被自动审批拦截；用户随后明确授权后已安装并重启，见上方安装记录。未新增浏览器或真实桌面视觉验收。

### 2026-11-09 · 参考归档管理补充缓存与孤儿子代理诊断

**背景**：旧诊断仅依据工作区status显示目录不可用，无法识别会话列表缓存异常或外部删除母会话后的残留子代理。

**决策**：检测独立接入宿主头部／缓存，修复委托归档管理的安全接口，避免复制日志重建与物理删除实现；保留原项目分组，并为未登记路径建立分组。物理探测失败不单靠stat判缺失，缺失能力不显示全部正常；项目归档保持只读。大小使用头部快照的日志字节数，避免将单日志大小宣称为完整磁盘占用。

**证据**：`npm run typecheck && npm test && npm run build`通过118项；两次构建 `shasum -a 256 lib/client.js dist/index.js`一致，客户端 `5bd66cd2c30a93c9c1a267dd69be77238bf377315dbaa1ff144f5448d42c0388`。`test/diagnostics.test.ts`覆盖权限、冷会话筛选、坏头部目录和物理探测失败；`test/diagnostic-panel.test.ts`覆盖分批反馈、关闭中断及长中文见证按字节拆批。当前测试不是真实宿主清理证据。

**遗留**：代码验证与打包后，desktop列表只读查询仍被自动审批拒绝（认定本次未明确授权宿主插件管理），因此尚未执行安装或重启；等待用户本次明确授权。安装包六项白名单与版本核对通过，本次扫描规则未命中本机路径、令牌、私钥、邮箱或内部域名；tgz SHA-256为 `fee20f77af11a97479c51e613cc6897f2e33c4d49b5fd7ba8eab907757af5c3e`。真实缓存重建／不可撤销清理及逐主题界面需用户验收。未增加完整日志损坏、网络、模型或Git诊断，未发布或提交Git变更。

### 2026-11-09 · 统计搜索聚焦样式对齐其他搜索框

**背景**：用户要求选中统计搜索框时的样式与其他搜索框一致，原先采用主色边框及有间隔的描边，内部输入又会受到通用聚焦外圈规则影响。

**决策**：真源外容器focus-within使用普通搜索框同一focus-tone中性细边框和12%透明度2px阴影外圈，取消outline；统计内层search输入聚焦取消阴影和outline，避免双层反馈。保持36px高度、单行布局和原筛选逻辑。

**证据**：`npm run typecheck && npm test && npm run build`通过104项0失败；连续两次构建615106字符、客户端SHA-256一致，见安装与发布。隔离真实Home通过真实输入聚焦确认：浅色600px边框rgb(119,132,147)等于focus-tone #778493，温暖深色360px边框rgb(152,166,180)等于#98a6b4；外层boxShadow均为同色0.12透明度2px，outline为0px，内层阴影none。温暖深色Tab离开至全部项目后阴影none、边框恢复rgb(68,67,59)；路径two搜索3条记录，高度保持36px。生成CSS配平、宽度媒体查询0、容器查询52、温暖作用域及原型语法通过；包六项白名单与当前文件一致、指定敏感模式0命中和旁置SHA校验通过。官方CLI remove/add完成，desktop六项一致、bundle启用；旧主91878重启为93392，宿主93430存在。

**遗留**：聚焦验证使用隔离真实组件与模拟数据，真实宿主效果由用户验收；未截图、未提交Git、推送或发布npm。

### 2026-11-09 · 统计搜索恢复单行并将横线移至说明下方

**背景**：用户纠正分类标题并非要改为二级菜单，横线应在说明文字下方；搜索框的图标和文字还受弹窗通用label纵向规则影响。

**决策**：去掉标题span及主色强调线，普通16px标题后保留说明，说明下留16px内边距并显示1px主题边界横线。通用表单label规则排除stats-group-search，由真源统一36px高度、8px圆角、10px左右内边距、15px图标与14px输入文字，明确横向排列；不增加!important或改变搜索逻辑。

**证据**：`npm run typecheck && npm test && npm run build`通过104项0失败，两次构建614988字符、客户端SHA-256一致，见安装与发布。隔离真实Home在900px面板确认标题横线0px且无子节点、说明横线1px，搜索高36px，图标15px与输入20px在同一水平中心；路径two搜索返回p1及3条记录。360px温暖深色搜索高36px、flexDirection为row、图文中心差0，搜索clientWidth与scrollWidth均305px，说明横线1px。原型脚本语法、生成CSS配平、宽度媒体查询0、容器查询52及温暖作用域通过；包六项白名单与当前文件一致、指定敏感模式0命中、旁置SHA校验通过。官方CLI remove/add完成，desktop六项文件一致、bundle启用；旧主91035退出后重启为91878，宿主91914存在。

**遗留**：隔离浏览器验证只覆盖组件、模拟数据及计算样式；真实桌面效果与逐主题外观由用户验收。未截图、未提交Git、推送或发布npm。

### 2026-11-09 · 精简统计分组布局与标题层次

**背景**：用户要求去掉分组和内容间竖线、分组路径及内容区重复标题，并让会话等分类标题下横线与设置二级菜单一致。

**决策**：真源移除分组右边框，分组按钮仅显示名称及数量、路径仍用于搜索和悬停提示。删除真实组件与原型的分组结果标题，以及仅为该标题服务的单位属性和样式；保留记录标题、辅助信息及点击回调。四分类标题共用1px主题边界横线和文字宽度2px主色强调线，保持窄屏上下布局。

**证据**：`npm run typecheck`及最终`npm test`通过104项0失败；最终连续两次`npm run build`均614936字符、客户端SHA-256相同，见安装与发布。生成CSS配平、宽度媒体查询0、容器查询52、温暖作用域保留，原型脚本语法通过。隔离真实Home在900px面板测得分组borderRightWidth为0px、分类标题横线1px、强调线2px，分组路径及右侧header节点均0，右侧首元素为真实记录；第二同名项目切换及two路径搜索均得到3条记录。360px温暖深色分组和内容clientWidth与scrollWidth均307px，上下排列且无横向溢出。包六项白名单、当前文件一致、指定敏感模式0命中及旁置校验通过；官方CLI remove/add成功，desktop六项一致且bundle启用；当前主90901退出后重启为91035，宿主91065存在。

**遗留**：浏览器验证为隔离模拟数据的组件和计算样式，真实桌面外观及逐主题效果由用户验收；未截图、未提交Git、推送或发布npm。

### 2026-11-09 · 扩大会话预览阅读宽度

**背景**：用户认为620px居中预览在会话内容较多时过于拥挤，确认采用800px宽度、面板内收缩、固定头尾和正文独立滚动方案。

**决策**：只修改视觉真源`docs/ui/ui-directions.html`的会话预览变体，将宽度改为800px，弹窗与正文补充`min-width:0`。沿用现有24px遮罩留白、85%最大高度、正文14px字号及固定头尾结构，短内容不设固定高度；生成样式通过构建同步。

**证据**：`npm run typecheck && npm test && npm run build`通过，104项测试0失败；第二次构建客户端SHA-256仍为`06aa88e36ea0a6bb0396f4289abafe248b465032c7c8db03f161d463ac04d517`。生成CSS括号1465对、宽度媒体查询0、容器查询52、温暖主题作用域保留。`npm pack`包含6项白名单文件，包SHA-256为`15d1cd9f9dd758f1bb489e093b1fae98a365b7f780799bc423b018b3743b3f53`且旁置校验通过；官方CLI remove/add成功，desktop六项安装文件逐字节一致，bundle启用，已执行桌面重启。

**遗留**：本轮未执行浏览器视觉回归；真实长短会话、窄面板和逐主题外观由用户在更新后的桌面端验收。

### 2026-11-09 · 统计各分类增加页内项目分组

**背景**：用户希望统计卡各一级菜单按截图中的搜索和分组导航组织内容，方便按项目查看记录。

**决策**：保留运行中／会话／待办／诊断四分类，增加共用StatsProjectPanel，按projectId分组并用路径区分同名项目；搜索项目名和完整路径，默认全部项目，导航展示记录数量。诊断只包含异常目录项目，不改变统计口径及原记录回调。宽面板左右滚动，650px以下上下排列，以主题令牌统一明暗颜色。

**证据**：`test/stats-project-panel.test.ts`验证同名身份、保序、初始导航及数量、空诊断，先失败后通过；`npm run typecheck && npm test && npm run build`通过104项0失败。两次客户端构建615719字符且SHA-256相同；生成CSS括号配平、容器查询52、宽度媒体查询0、温暖作用域保留，原型脚本语法通过。隔离真实Home在三项目数据中核对运行3、会话9、待办6、诊断2；选择第二个同名项目仅3条会话，路径two搜索仅p1，无匹配0条、清空恢复9条，点击会话回调s1-0，诊断回调p1并关闭；待办点击触发模拟保存后关闭。900px面板分组180px／记录356px，360px温暖深色分组及内容均307px且scrollWidth等于clientWidth，上下排列。`npm pack`六项白名单与当前文件一致、指定敏感模式0命中、旁置校验通过。官方CLI remove/add成功，desktop六项一致、bundle启用；旧主83180重启为84553，宿主84587存在，包哈希见安装与发布。

**遗留**：浏览器使用隔离模拟数据及服务，仅证明组件交互和几何布局；真实待办定位、宿主加载及逐主题外观由用户验收。未截图、未提交Git、推送或发布npm。

### 2026-11-09 · 侧栏位置统一顺序和倒序前三项

**背景**：用户要求排序下拉文案统一，使用顺序1／2／3及倒序1／2／3，替换此前前五项与末尾两项。

**决策**：正式设置与原型均使用「顺序第 N 个／倒序第 N 个」，保存正负1–3；倒序索引以入口数量加负序位计算，支持第三项并保持动态更新。旧正数4–9兼容为3；入口数量不足时顺序放在末尾、倒序放在最前，保留宿主同order的稳定排序边界。

**证据**：`test/full-state.test.ts`与`test/client-entry.test.ts`更新用例先失败后通过，验证-3解析、旧4–9迁移、倒数第三随新增／卸载变化，以及不足三项时的处理。`npm run typecheck && npm test && npm run build`通过，102项0失败；两次客户端构建609755字符、SHA-256一致，见安装与发布。原型脚本语法通过；包六项白名单、当前文件一致、指定敏感模式0命中与旁置SHA-256通过。官方CLI remove/add成功，六项desktop文件一致、bundle启用；旧主82000退出后重启，新主83180和宿主83210存在。

**遗留**：未执行浏览器或真实桌面视觉回归，实际排序与菜单外观由用户验收；未提交Git、推送或发布npm。

### 2026-11-09 · 诊断卡统一数字与状态信息层级

**背景**：用户截图中的诊断卡主值为绿色「目录正常」，其余三卡是正文色大号数字；原型还分别用20／18px规则缩小诊断主值，导致同排卡片层级不一致。

**决策**：主值改为实际不可用目录数量，正常时为0，使用共用26px数字、字重和正文颜色；将状态移到辅助行，正常／异常图标保留主题语义色。删除真源中所有诊断专属数值字号和颜色覆盖，原型与真实Home同步，不改弹窗及点击行为。

**证据**：`test/home-render.test.ts`新增正常0／异常2及状态说明用例，先失败后通过。`npm run typecheck && npm test && npm run build`通过，102项0失败；两次构建609840字符，客户端SHA-256相同，见安装与发布。原型脚本语法与生成CSS配平通过，容器查询50、宽度媒体查询0、诊断专属数值覆盖0、温暖主题保留。`npm pack`六项白名单、当前文件逐字节一致、指定敏感模式0命中和旁置SHA-256通过。官方CLI remove/add成功，六项desktop文件一致、bundle启用；旧主81040退出后重启，新主82000与宿主82035存在。

**遗留**：未执行浏览器或真实桌面视觉回归，最终外观由用户验收；测试仅证明数字、说明和状态输出，不能代替视觉验收。未提交、推送或发布npm。

### 2026-11-09 · 统一选择器宽度并简化侧栏位置

**背景**：用户反馈设置下拉仍过宽，并要求侧栏位置只保留前五项和末尾两项。旧Picker无论控件宽度均使用360px，项目切换另用400px；侧栏直接以序位作order，不能真正表示倒数位置。

**决策**：选择器共用`pickerWidth`，无说明选项跟随控件并限制140–360px，带说明统一360px；保留此前弹窗交集定位。侧栏七项以-1／-2表达末尾位置，旧6–9兼容为5；使用官方`entriesOfSlot`和`subscribe`动态计算相邻order，自身注册通知加重入保护。没有能力的旧宿主保留数值排序降级，不改其他插件入口；同order仍遵循宿主稳定排序。

**证据**：`test/ui-format.test.ts`、`test/full-state.test.ts`和`test/client-entry.test.ts`新增用例先失败后通过，覆盖宽度、旧值解析、动态入口增减、空列表、不足五项、卸载订阅和自身通知。`npm run typecheck && npm test && npm run build`通过，101项0失败；两次构建610128字符，客户端SHA-256见安装与发布。原型脚本语法通过，生成CSS括号配平、容器查询50、宽度型媒体查询0、温暖主题保留。隔离真实Settings：600px面板菜单／控件140px，菜单388–528px、弹窗右界578px，七项齐全，选倒数第二个后保存navigation.sidebarPosition=-2；360px温暖深色面板的统计菜单／控件271px，菜单45–316px、弹窗26–350px。`npm pack`6项白名单、当前文件逐字节一致、指定敏感模式0命中及旁置SHA-256通过；官方CLI remove/add成功，六项desktop文件一致、bundle启用，旧主78382退出后重启，新主81040及宿主81072存在。

**遗留**：隔离环境保存使用模拟服务，真实宿主菜单外观与侧栏排序由用户验收；未逐主题执行完整视觉回归。未提交Git、推送或发布npm。

### 2026-11-09 · 修复设置下拉菜单越过弹窗边界

**背景**：用户截图显示最近会话样式下拉菜单越过设置弹窗右侧。之前定位只取工作台矩形，设置弹窗宽度为工作台90%，顶层Popover又不受弹窗overflow裁剪。

**决策**：在共用`positionPopup`中取dialog、工作台与视口的可见交集，保留8px留白，限制菜单宽度及最大滚动高度；Menu和Picker同时观察dialog尺寸变化。不改变已确认的弹窗外框或菜单配色。

**证据**：`test/ui-format.test.ts`新增右侧／底部及小弹窗限制用例先失败后通过。`npm run typecheck && npm test && npm run build`通过，98项0失败。隔离实际Settings在600px面板、540px弹窗下，弹窗左右38／578px、菜单左右210／570px，360px宽菜单完整位于弹窗内且右侧留8px；点击「按钮」后值更新且菜单关闭。300px面板的额外检查因点击滚动后菜单关闭未完成测量，不作为窄面板浏览器通过证据，窄弹窗限制由回归用例验证。两次客户端构建609278字符、SHA-256 `ed45a885ef707d89831e8ce12258ccc188142464b2646d8dca83af5ed0389514`一致；安装包SHA-256 `7b79f910c75da03591f484bb7f0d888ea38db3a641471973f9a7f61b27b701d5`，六项白名单与当前文件一致、指定敏感模式0命中。官方CLI remove/add成功，六项安装文件一致、bundle启用，停止旧主77398后重启，新主78382存在。

**遗留**：真实桌面菜单布局由用户验证；隔离环境未进行全部设置下拉或逐主题视觉验收。未提交Git、推送或发布npm。

### 2026-11-09 · 最新设置原型同步正式组件与全局待办管理

**背景**：用户确认上一轮仅修改UI原型，要求对照当前原型在正式项目开发；此前已授权检查后自动更新本地桌面插件。

**决策**：以`docs/ui/ui-directions.html`现有五分类、子分类、提示位置及字号为准，正式Settings保持分类草稿并统一提交。原型关闭Agent管理文案为「仅可查询」，因此全局关闭限制全部写入而保留读取；新增删除工具，不把删除塞入更新参数。保留旧逐项目状态限制至首次保存全局配置，再统一为全局选择；归档只读与当前项目归属继续校验。统计开启临时显示按钮，持久化保留选择以支持关闭恢复。适配窄面板五项导航为自适应分列，避免沿用固定四列挤压六字菜单。

**证据**：`test/settings-render.test.ts`、`test/full-state.test.ts`与`test/tools.test.ts`新增行为先失败后通过；最终`npm run typecheck && npm test && npm run build`通过，96项0失败，含全局保存失败回滚、新项目禁写、用户操作不受限及Agent删除保留用户撤销缓存。两次构建608869字符、客户端SHA-256一致（见安装与发布）。CSS括号1434对、容器查询50、宽度型媒体查询0、温暖主题及调色盘／组件图标保留。隔离真实Settings组件：360px名称和位置控件同为273px且上下排列，菜单14px、设置标题14px、说明12px、弹窗20px；统计开关使最近样式按钮禁用后恢复卡片，跨分类保存含首页、入口名称、启动开关、根目录和全局权限。最终温暖深色360px菜单三列且无横向溢出，紫晶深色1000px两控件180px并排、分区标题16px、提示位于主题卡上方。`npm pack`6项白名单、当前文件逐字节一致、指定私钥／本机路径／邮箱／内部域名模式0命中，旁置校验通过。官方CLI remove/add成功，desktop六项文件一致、bundle仍启用，旧主64594退出后通过`open -a`重启；新主77398及宿主77441存在，CLI list为0.3.1。

**遗留**：隔离环境模拟目录选择与保存，未进行真实宿主逐主题视觉、真实Agent工具调用或模型发送验收；桌面效果交由用户验证。旧逻辑已覆盖的卡片选择无法恢复推断；项目专属配置与其他组件按原型保留空状态。未提交Git、推送或发布npm。

### 2026-11-09 · 项目路径提示简化

**背景**：用户认为添加项目提示使用「文件夹」且下方解释过长，要求改为项目表述并缩短。

**决策**：字段统一「项目路径」，提示为「输入或粘贴项目路径」，下方仅「也可点击右侧图标选择项目。」；共用目录输入接受独立占位文案，默认根目录保留目录含义。同步原型和按钮提示，路径输入及选择行为不变。

**证据**：`npm run typecheck && npm test && npm run build` 通过，91项0失败；客户端594441字符。原型内联脚本语法通过，`npm pack` 白名单6项与当前文件一致，指定敏感模式0命中；旁置校验通过。官方CLI remove/add成功，6项安装文件一致、bundle启用；旧主63051退出后重启，新主64594及宿主64624存在，本轮哈希见当前状态。

**遗留**：本轮仅调整文案，未重复浏览器交互或逐主题视觉验收，桌面效果由用户验证。

### 2026-11-09 · 设置样式名称与项目路径输入

**背景**：最近会话已按宽度动态显示，但设置仍标固定数量；目录输入框的点击事件打开宿主选择器，打断手动路径输入，与提示文案不符。

**决策**：样式选项只显示「卡片」与「按钮」；将项目模式标签统一为「打开已有项目」，同步注册失败后的重试提示。共用目录输入移除点击选目录，保留文件夹按钮和 Alt + ↓，使用文字光标与明确的输入／粘贴提示；原型同步相同行为，不修改项目提交合同。

**证据**：Chrome 隔离实际 AddProject 组件，修改前点击路径输入触发一次选择器并改为模拟目录；修改后点击不触发选择器，手输 `/manual/project` 提交正确，文件夹选择回填、取消保留 `/keep/path`、Alt + ↓ 与新项目提交均通过。Settings 在无滚动干扰的隔离组件环境中选项仅「卡片」「按钮」，切换成功；原先带固定高度弹窗的测试夹具因滚动关闭菜单未完成切换，不能作为宿主故障证据。`npm run typecheck && npm test && npm run build` 通过，91项0失败，连续两次构建客户端594616字符，SHA-256一致。原型脚本语法、生成CSS配平、宽度型媒体查询0、容器查询47与温暖主题保留通过；`npm pack` 6项白名单、当前文件一致及指定敏感模式0命中，旁置校验通过。官方CLI remove/add成功，6项安装文件一致、bundle启用；旧主61747退出后重启，新主63051与宿主63087存在，list为0.3.1；哈希见安装与发布。

**遗留**：目录选择及保存使用模拟服务，未操作真实文件夹；未执行真实宿主逐主题视觉回归，桌面效果由用户验收。

### 2026-11-09 · 添加菜单空间与最近会话宽度适配

**背景**：顶部输入卡的官方添加菜单只计算上方空间，造成菜单压成窄条；最近会话按钮固定三条，不随面板宽度变化。

**决策**：保留原输入卡、左右操作行和分支条，将官方菜单放入输入卡内的独立顶层浮层，按面板空间定位；最近会话测量候选按钮宽度，只显示能完整容纳的最新连续前缀，区域两侧保留 `clamp(24px,5%,48px)` 空白。隐藏候选保留测量尺寸并退出键盘导航。

**证据**：`test/home-render.test.ts` 覆盖动态计数，`test/ui-format.test.ts` 覆盖上下展开定位。Chrome 隔离加载实际 Home 与 ComposerMenu、模拟宿主菜单服务，1200／800／500／340px 面板分别显示 7／4／4／2 个测试按钮，再拉宽恢复7个；均单行、无半截且两侧留白。模拟官方20px最大高度的菜单实际展开至320px，顶部176px、底部496px，Esc关闭，无页面错误。`npm run typecheck && npm test && npm run build` 通过，91项0失败；连续构建客户端594613字符、哈希一致。原型内联脚本语法通过，生成CSS括号1376对、宽度型媒体查询0、容器查询47、温暖主题保留。`npm pack` 白名单6项、当前文件逐字节一致、指定私钥／本机路径／邮箱／内部域名扫描0命中；旁置校验通过。官方CLI remove/add成功，6项安装文件一致且bundle启用，旧主57474停止后 `open -a` 重启，新主61747及宿主61855存在，list为0.3.1；本轮哈希见安装与发布。

**遗留**：浏览器检查使用模拟宿主服务，未进行真实附件上传、引用或模型调用；未截图，真实菜单内容与各主题效果由用户验收。

### 2026-11-09 · 快捷输入恢复原布局，仅对齐官方弹窗功能

**背景**：用户明确要求添加和模式弹窗功能对齐官方，上一轮整块嵌入官方会话工厂扩大了修改范围，改变了输入区和按钮布局。

**决策**：恢复原 Composer 的圆角卡、textarea、左侧添加／项目／模式、右侧模型／发送和下方 BranchBar。单独委托官方 slash-menu 的组件与注入参数，不复制命令清单，也不伪造主视图引用；由官方输入服务完成命令认领、引用序列化和附件上传。结构化草稿按文本差异移动未修改引用，编辑穿过引用时才解除身份。发送前经 owner RPC 校验项目归属、目录可用性并选择模型；模式弹窗沿用官方内置中文名及说明，保留自定义文案并过滤不可用项。

**证据**：`test/native-composer.test.ts` 核对原 textarea 和左右按钮顺序、引用差异编辑、模式元数据、预设会话复用、草稿恢复及取消释放；`test/session-delete.test.ts` 补模型选择的 owner、跨项目和失效目录保护。`npm run typecheck && npm test` 通过，89项0失败；连续两次 `npm run build` 客户端591894字符，SHA-256均为 `107437ec422b9c4d3849ddda89751df2ccb245b1e56e0108a5b2e5be46620026`。生成CSS括号配平、容器查询47、宽度型媒体查询0、温暖主题保留。`npm pack`白名单6项、当前文件一致与指定敏感模式0命中；包SHA-256 `0b63eee0e5066c01bac1f1eda44f250ef930ef02c3cd0f2a90439e1c09341b64`，旁置校验通过。官方CLI remove/add成功，6项安装文件逐字节一致、profile bundles保持启用；旧主进程55405退出后重启，新主进程57474与运行时57511存在，list确认为0.3.1。

**遗留**：本轮未截图或执行真实模型、附件上传、引用、命令与模式切换的桌面交互验收，实际效果由用户验证。附件浏览器对象不跨进程持久化；安装文件一致与进程启动不代表所有宿主控件交互已通过。不提交Git、不推送或发布npm。

### 2026-11-09 · 详情气泡与输入框下方会话按钮

**背景**：用户要求详情页会话图标与首页一致，并参照截图让会话按钮贴近输入框。

**决策**：详情会话列表与空状态改用现有圆形气泡，保留原尺寸与主题颜色。按钮形态的间距统一为真源令牌12px，旧输入卡与官方输入容器先归零下边距，再由相邻按钮区域持有间隔；只匹配按钮形态且输入可见的结构，卡片排布不变。规则兼容本工作区正在调整的输入栏入口。

**证据**：并行输入栏接口稳定后，`npm run typecheck`、`npm test`（86项）和`npm run build`通过，两次构建客户端SHA-256一致。原型内联脚本语法、CSS括号配平、12px令牌生成、宽度型媒体查询0与温暖主题保留均通过。`npm pack`包内6项白名单与当前文件逐字节一致，指定私钥／路径／内部域名模式未命中；官方CLI `plugin --profile desktop remove/add`成功，安装6项一致且bundle启用。旧主进程53674停止后重新`open -a "DeepSeek Harness"`，确认新主进程55405及其宿主55460启动；哈希见「安装与发布」。

**遗留**：实际详情图标、输入框下方间距及主题外观由用户桌面验收，不截图。安装、启用与进程证据不等同于实际组件挂载和视觉验收；并行输入栏修改保留在本次包内。

### 2026-11-09 · 首页圆形气泡与卡片层级

**背景**：用户比较首页统计、会话卡片与按钮后选定圆形气泡，要求把预览的轻量样式同步到正式首页。

**决策**：仅新增专用气泡和勾圈图标，首页会话入口与会话统计共用气泡，其他页面图标保持各自语义。统计缩至104px起，取消大图标色块，让标签、数值与说明左对齐；诊断沿用已有目录可用性数据展示成功／异常，原型同步这一口径。会话卡片60px起、图标16px、轻色底块28px，按钮32px高、14px图标与10px圆角。保留现有模块配置、数量限制及长标题提示；悬停、按下、焦点、触屏与减少动态效果由真源统一定义，不手改生成物。

**证据**：`npm run typecheck`、`npm test`（85项、0失败）与`npm run build`通过；连续构建客户端586314字符、SHA-256 `4b0089300838406e68ab998827ab660123d7473159e18b7fea99f16a821255e4`相同。生成CSS括号配平、宽度型媒体查询0、容器查询47、温暖主题保留；两个HTML内联脚本经`vm.Script`语法检查通过。`npm pack`白名单6项、当前文件一致性及指定敏感模式检查通过，包SHA-256 `06f425b9ed0bb2021e071b14af3a7bbeab40ecc697ff20ebdc0085c3f44811bf`，旁置校验通过。官方CLI `plugin --profile desktop remove/add`成功，6项安装文件逐字节一致且profile bundles仍含工作台；旧主进程52106退出后通过`open -a`重启，新主进程53674与宿主53724存在。

**遗留**：实际桌面外观、全部主题及触屏行为由用户验收；组件和文件检查不作为浏览器视觉回归证据。更新包包含本工作区已有的官方输入与会话删除相关变更，已跑完整现有回归，不调用真实模型或删除用户会话。未提交Git或发布npm。

### 2026-11-09 · 项目提交修复与官方会话能力复用

**背景**：项目创建与打开按钮无响应，永久删除仅显示未支持提示；快捷输入添加菜单只插入 `@` 字符，模式选择由插件自行映射。

**决策**：非当前项目表单字段同时禁用并退出必填校验，保留稳定高度。删除通过归档管理插件的 registry 扩展完成，工作台负责确认、owner、项目归属及运行／归档限制，避免复制转录布局和子会话清理代码。快捷输入直接复用官方会话工厂，未发送会话按 workspace 与 sessionId 复用，显式持有／释放客户端引用，默认 Views 保留官方结构化草稿存储；旧首消息失败重试暂留原链路。官方控件跟随宿主主题，工作台只做嵌入布局适配。

**证据**：`test/project-form.test.ts` 核对两个模式各有且仅有一个启用的必填字段，并分别调用保存和关闭。`test/session-delete.test.ts` 覆盖 owner、跨项目、运行中、归档、失败保留和宿主能力缺失；`test/native-composer.test.ts` 覆盖会话复用、草稿不覆盖、工厂委托、加载失败和取消后释放。`npm run typecheck && npm test && npm run build` 通过，85 项测试全绿；两次构建客户端 584003 字符，SHA-256 同为 `fac2a25e87d4fe021776bd0ec1fe094b552a559309401999908f6be9de53caab`。生成 CSS 容器查询 47、宽度型 @media 0、温暖主题保留。包白名单 6 项、两端构建一致与指定敏感模式检查通过，包 SHA-256 `f102f2b4a3de4158b88511182e08a8ad21314e09f13294bf65b1ffa9bd8c0fdc`，旁置校验通过。官方 CLI remove/add 成功，6 个安装文件与包逐字节一致，profile bundles 含工作台；停止旧主进程 48310 后确认新主进程 52106、运行时 52160，list 确认为 0.3.1，归档管理插件为 1.1.22。发版文档四个同步标记仍可匹配。

**遗留**：真实模型消息、附件上传、引用交互、模式切换及实际删除尚需用户桌面验收；本轮不删除用户已有会话，不进行截图。官方菜单在 portal 中使用宿主主题，不与工作台独立主题做逐像素一致性承诺。

### 2026-11-09 · 会话右侧入口与待办直接操作

**背景**：用户确认预览后要求同步桌面插件；历史会话的 Workbase 图文入口占据标题前的位置，待办编辑、详情、更多及删除确认导致操作步骤过多，并要求新建会话同样使用右侧入口。

**决策**：保留常驻 root 导航插槽，通过网格将其放在右侧图标列；不占用 strict Session 的 corner，因为未选 Session 时该插槽不存在，且已有侧栏控件使用它。处理 renderer 的 `display:contents` 包装，让实际标题行落在左列，保留系统控件预留。待办统一为标题编辑与悬停行尾删除，归档使用同一编辑弹窗只读。删除真实持久化后，服务端保存最近一次原记录并签发 5 秒令牌，新增 owner RPC 撤销；在串行保存成功后更新缓存，恢复保留原始 ID、来源、创建／完成时间并增加版本。原型真源和独立预览同步，配色沿用主题令牌。

**证据**：新增待办直接入口、删除显示和撤销业务测试先失败再通过；`npm run typecheck`、`npm test`（79 项）与构建通过。覆盖无 Session 导航、图标说明、strict 标题包装、归档只读、恢复来源与完成状态、跨项目、重复、Agent、超时及写入失败重试；RPC 拒绝非 owner 和伪造记录。读取桌面内置 SDK 核对常驻 Header 与 grid 结构。连续构建客户端 579381 字符、SHA-256 `5e7b6847563b14e8bac40d671ef8e2a158edb8c813b6a6ed6909f40ce5410f97`；生成 CSS 配平、宽度型媒体查询 0、容器查询 47、温暖主题保留，两个 HTML 脚本语法通过。安装包白名单 6 项、版本、当前文件一致性及指定敏感模式检查通过，包 SHA-256 `57609e2f5607fb50760249abc8780bcf355c30e0d5964080e00d432d92394795`，旁置校验通过。官方 CLI remove/add 成功，6 个安装文件逐字节一致，list 为 0.3.1 且 profile bundles 含工作台；旧主进程 44997 收到 TERM 后通过 `open -a` 重启。

**遗留**：实际新建／历史会话右侧布局、待办悬停、编辑／直接删除／撤销及逐主题外观未执行真实桌面交互验收，由用户确认；本轮安装启用结论限配置与文件层。撤销窗口只保留最近一次且宿主重启失效。未提交 Git、未发布 npm。

### 2026-11-09 · 顶部主题提示与桌面启动偏好

**背景**：用户要求全部工作台 Toast 移到上方、优化结果文案和主题背景，增加控制桌面启动时打开工作台的设置，并进一步收紧四圆点路径间距。

**决策**：Toast 保留在工作台根节点，顶部 68px、最高 520px 宽、背景为主题面板色混合 4% 主色，加入状态图标和关闭按钮；保存／复制／归档等文案明确结果，长信息延长阅读时间，重复提示刷新计时。模态弹层不将 Toast 设为 inert。路径图文间距从 4px 改为 2px，其余图形、尺寸和提示保留。新增 `preferences.openOnStartup`，默认关闭以兼容已有使用习惯；设置保存后下次启动生效，普通 Web 不应用。客户端通过桌面 preload 的平台标记和公开 `layout.selectPanel` 选择主插槽，注册未完成时等待，读取前创建宿主导航取消信号，后续用户导航可取消启动跳转；旧状态补默认值，旧请求与其他补丁不覆盖已有开关。

**证据**：新偏好和真实入口测试先失败再通过；`npm run typecheck`、`npm test`（73 项）与构建通过。测试覆盖默认关闭、旧状态、保存和重启恢复、旧请求保留、RPC 视图切换不重置、桌面／Web 区分、延迟主插槽、用户导航取消、重连及卸载。连续构建客户端 SHA-256 为 `c917727e8b98880149346169e5ae33dc0b37904129e7aa11c272f1eb375ceb80`，579992 字符；生成 CSS 配平、宽度型 `@media` 为 0、容器查询 47、温暖主题保留，原型脚本语法通过。安装包 6 项白名单、当前文件一致性与指定敏感模式检查通过，包 SHA-256 为 `26736a8f0cfdf3c6d33141d2cbde6590c42bdeed9c4a08c537c5864b6a776e97`，旁置校验通过。官方桌面 CLI remove/add 成功，安装的两端文件、patch 与 LICENSE 一致，profile bundles 包含工作台；停止旧主进程后已通过 `open -a` 重启。

**遗留**：未截图、未逐主题执行浏览器视觉验收，真实桌面开关开启／关闭后重启行为由用户验证；安装一致性与配置启用不等于已完成真实组件挂载验收。未提交 Git 或发布 npm。

### 2026-11-09 · 紧凑菜单统一与工具栏尺寸隔离

**背景**：用户截图中的字段勾选列参差、详情菜单悬停只覆盖文字附近，确认新预览后要求同步正式代码并适配全部主题。静态检查发现标题和视图工具栏的后代按钮规则同时命中嵌套菜单项，将其宽高限制为图标尺寸。

**决策**：固定图标尺寸及对应颜色规则限定为直属按钮，不增加 `!important`。菜单统一 216px／224px 宽度、36px 行高，字段用两列网格固定 16px 复选框；菜单标签独立省略。常用操作与管理操作通过 `separatorBefore` 分组，移除保留独立危险分组。继续使用 `--text`、`--hover`、`--focus-tone`、`--danger-text`、`--surface` 和复选框主题令牌，原型真源同步后自动生成样式；现有动作与迁移能力提示保留。

**证据**：新增 `test/prototype-css.test.ts` 的图标宽度传播不变量，修复前失败、构建后通过；`npm run typecheck`、`npm test`（71 项）、`npm run build` 通过。连续两次构建客户端 SHA-256 均为 `3325601a611557e74d292262e3c20858d6ad0205a038d6677bd30a63c8cc48ab`，客户端 576319 字符；CSS 括号配平、宽度型 `@media` 残留 0、容器查询 47 处，`:scope.c` 保留。`npm pack` 6 项白名单、版本、内容一致性和指定敏感模式扫描通过，包 SHA-256 `7391a0b3c0e053da295aeb3672bc26026cdbd71a5f4282cc17c9adddc15b9607`，旁置校验通过。桌面自带 CLI 的 remove/add 返回成功，安装两端文件、patch、LICENSE 与当前文件逐字节一致，profile bundles 包含工作台，CLI list 为 0.3.1；`open -a "/Applications/DeepSeek Harness.app"` 后 `pgrep` 确认主进程存在。

**遗留**：本轮启用验证为 profile 配置与安装文件层，未检查实际组件挂载或执行逐主题视觉回归，悬停与外观由用户验证；未提交 Git、未发布 npm。CLI 的 pnpm 全局配置与 peer 提示未阻断本次安装。

### 2026-11-09 · 桌面包更新优先使用应用自带 CLI

**背景**：用户认为桌面自动化卸载重装太慢，要求确认能否改用命令行。

**决策**：后续自动更新优先使用 `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh` 的 `plugin --profile desktop remove/add`，更新后重载或重启宿主并核对安装文件和启用状态；不改系统 CLI 配置。此前 PATH 中旧版 CLI 对 desktop 的拒绝，不代表桌面自带 CLI 不支持插件管理。

**证据**：系统 `dsh --version` 为 `0.2.0-rc.2`，该入口显式拒绝 desktop。桌面自带 CLI 的 `plugin --profile desktop list --depth 0` 返回成功，列出 `dsh-workbase@0.3.1` 等 6 项依赖。读取应用内 `@deepseek-ai/dsh-desktop-host/lib/cli.js` 可见 `runDesktopCli` 向 `runCli` 传入 `manageDesktopProfile: true`，并调用自带 pnpm。

**遗留**：本轮只读验证命令行访问及检查官方实现，未再次卸载或安装；首次使用命令行更新时仍须核对实际写入、宿主重新加载与启用结果。

### 2026-11-09 · 四处弹窗主题适配并自动更新桌面包

**背景**：用户确认弹窗预览，要求同步正式代码并适配全部主题；此前已授权后续检查通过后自动安装更新桌面包。

**决策**：更多／字段菜单统一整行悬停与键盘焦点，危险项分组，字段状态由复选框表达；颜色使用现有主题令牌，危险底色由 `--danger-text` 混合 `--surface`，不固定为紫晶色。详情 Picker 分离触发文案与选项文案，项目名在上、完整路径在下，单行省略。会话预览使用专用 Modal 类固定头尾、正文独立滚动，保留加载／空／失败，加入失败重试和打开会话。原型真源同步，生成物由构建产生。

**证据**：`npm run typecheck && npm test && npm run build` 通过，70 项测试含四主题明暗对比度检查；客户端 575734 字符、SHA-256 `27746b6ebf05bfca4ec1076d70bb85296c569088355f37ad2b5363714a8fb05b`。原型脚本语法通过；CSS 括号配平、宽度型 `@media` 残留 0、容器查询 47 处、`:scope.c` 保留。`npm pack` 的 6 项白名单、版本、两端构建一致与指定敏感模式扫描通过，包 SHA-256 `21a011dcbcb73013b1a213e60eed2c6c5f6568ea48a039adb6b09324a84a2dd0`。桌面插件管理完成卸载、安装与立即启用；`~/.dsh/profiles/desktop/node_modules/dsh-workbase` 的两端文件与 LICENSE 逐字节一致，profile bundles 含工作台，可访问树显示启用值 1、组件运行中，项目概览入口打开成功。

**遗留**：初次桌面观察只读到空窗口，显式 AXRaise 后并固定主窗口恢复可访问树；输入粘贴未写入完整路径，改用该字段支持的 AX 设置值并核对完整内容后安装。未截图、未逐主题视觉回归，实际布局及悬停由用户验证；未提交 Git 或发布 npm。

### 2026-11-09 · 将确认的实心四圆点预览落地源码

**背景**：用户确认 `docs/ui/path-prefix-preview/index.html` 的样式，要求生成最终代码；路径文字需与 14px 图标框同大，四圆点保留 2×2 排列，不显示 `/` 前缀。

**决策**：真源图标表新增专用 `path-dots`，按 14×14 坐标的 (4,4)、(10,4)、(4,10)、(10,10) 绘制直径 2.4px 的实心圆点，再等比映射到组件的 24×24 viewBox；通用 `dots` 保留，避免影响其他图标。Home、Detail 与原型三处路径显示同步，文字 14px、图文间距 4px、行高 18px；保留完整路径提示、复制与项目切换。

**证据**：先构建同步新图标类型，再执行 `npm run typecheck && npm test`，70 项测试通过，客户端构建 568438 字符。原型脚本经 `node:vm` 的 `new Script` 检查通过；生成 CSS 括号配平、宽度型 `@media` 残留 0、`@container workbase` 46 处、`:scope.c` 保留。原型 3 处使用专用图标，Home、Detail 均使用 14px 图标；`git diff --check` 通过。

**遗留**：本轮仅完成源码、生成物与本机检查，未更新 tgz、桌面安装或执行浏览器视觉验收；现有包与安装不包含本轮修改。未提交 Git 或发布 npm。

### 2026-11-09 · 保留四圆点并统一路径图文比例

**背景**：用户明确要求保留路径前的四圆点，前一轮删除图标不符合用户意图；视觉效果仍由用户在桌面端验证。

**决策**：卡片、列表和详情路径统一用四圆点，图标框 14px、图文间距 4px、行高 18px，名称独立收缩省略。详情仅在选择按钮内保留四圆点，取消外置文件夹；项目名称前的官方文件夹保持。只改原型真源和实际组件，生成样式由构建同步。

**证据**：`npm run typecheck && npm test && npm run build` 通过，70 项测试无失败；原型脚本语法通过，生成 CSS 括号配平、宽度型 @media 残留 0、`:scope.c` 保留。包的 6 个白名单文件与 SHA-256 校验通过；desktop 安装的服务端、客户端与 LICENSE 与当前构建逐字节一致，客户端 SHA-256 为 `52270b30a439f758d95b0b842e9773063ea498a716ca765e5af5f2e0f4973dd7`。

**遗留**：安装后桌面操作工具无法读取主窗口，尚未启用；profile 的 `dsh.profile.bundles` 不含 dsh-workbase，需用户在插件页启用并验证视觉效果。本次未截图、发布 npm 或提交 Git。

### 2026-11-09 · 桌面更新路径排版调整包

**背景**：用户要求更新桌面安装，使刚完成的目录辅助行与详情图文排版调整进入本地 DSH；随后明确安装完成后自行验证，无需代理截图。

**决策**：通过桌面插件管理卸载旧包，再安装当前 `dsh-workbase-0.3.1.tgz` 并立即启用，保留版本号。仅核对安装完整性和启用状态，路径视觉验收交由用户。

**证据**：`shasum -a 256 -c dsh-workbase-0.3.1.tgz.sha256` 返回 OK；逐字节比较 desktop 下 `node_modules/dsh-workbase` 与工作区的 `dist/index.js`、`lib/client.js`、`LICENSE` 全部一致。客户端 SHA-256 为 `114ec1c1b9e8ae3e853af350b01998837ab44406d2087bbfe2050a88c712f462`。桌面可访问状态显示版本 0.3.1、启用值 1、组件运行中，侧栏项目概览入口恢复。

**遗留**：路径视觉效果及完整交互回归由用户验证；本次未发布 npm 或提交 Git。

### 2026-11-09 · 目录辅助行删除四圆点并统一详情图文对齐

**背景**：用户截图中详情路径前同时出现文件夹和四圆点；文件夹容器宽高 14px，但内部通用 SVG 为 17px，导致比例和间距不协调。卡片与列表的四圆点前缀也缺少明确目录语义。

**决策**：卡片与列表只显示目录名称；详情将唯一的官方开口文件夹与名称放进同一 Picker 标签，取消按钮外的文件夹和按钮内四圆点。图标与箭头统一 12px、行高 18px、间距 6px，目录名称单独收缩省略；复制路径、切换项目、完整路径提示与可访问名称沿用。原型 select 只保存目录名称，增强后的触发按钮添加文件夹，刷新仅更新文字节点，避免切换后丢图标。

**证据**：`npm run build && npm run typecheck && npm test` 通过，70 项测试无失败；原型脚本经 `node:vm` 的 `new Script` 校验语法，源码不再含旧路径四圆点调用及 `detail-folder-icon` 外置图标。生成 CSS 括号配平、宽度型 `@media` 残留 0、`:scope.c` 保留。客户端构建为 568006 字符，SHA-256 `114ec1c1b9e8ae3e853af350b01998837ab44406d2087bbfe2050a88c712f462`；当前包 SHA-256 `243b2c2cc9c9e3659678d0686ce80c96b72a9f2429cc91369fcb15a4b80fc775`。

**遗留**：按用户指定的 prototype-craft 流程，本轮止于静态检查和构建，未进行浏览器或桌面截图验收，也未更新桌面安装。前一条的桌面图标证据不覆盖本轮路径排版。未发布 npm 或提交 Git。

### 2026-11-09 · 项目文件夹统一为官方工作区展开态图形

**背景**：项目总览列表、宫格及详情名称前使用闭口文件夹，与用户截图中的官方工作区展开态图标不一致。官方工作区组件在展开时使用 `IconFolderOpenRegular`，收起时使用 `IconFolderCloseRegular`。

**决策**：将 SDK 0.2.2-rc.1 的开口文件夹三段路径放入原型共用 `folder` 定义，不引入整个基础 UI 包，也不依赖宿主 SVG sprite，保证独立原型可展示。官方图形为填充轮廓与 16% 淡填充，使用 `scale(1.5)` 对齐现有 24×24 坐标系，并在组上设 `stroke="none"` 避免继承 1.7px 通用描边。保留原尺寸、背景、主题颜色及运行／异常状态，目录选择等共用图标入口同步更新；LICENSE 补充 DeepSeek 图形版权。

**证据**：原型路径与官方包 `lib/index.js` 的 `folder-open` 三段 `d` 属性逐段比较完全一致；`npm run build && npm run typecheck && npm test` 通过，70 项测试无失败。客户端构建为 567535 字符，较此前增加 1531 字符；文件 SHA-256 为 `0044758df1f9b54e00ed2c51c315cd29b2cce11621bf2677c59f6f33dc3916fa`，本地包为 `24cd818be52dbedb33b109c7a9f71c14fa2c1ba63b4191d92eb9dc461c871380`。桌面端拒绝直接覆盖已安装包，经插件管理卸载后安装并启用，日志 `~/.dsh/profiles/desktop/.plugin-manager/logs/operation-7iBZDG/pnpm.log` 记录新增 0.3.1，服务端、客户端和 LICENSE 均与本地构建逐字节一致。实际桌面窗口检查宫格、列表和详情的开口图标，最后恢复首页宫格视图。

**遗留**：验证覆盖当前 macOS 桌面深色紫晶主题的三处图标展示；没有扩展到所有主题的视觉回归或真实模型验收。版本仍为本地 0.3.1，未发布 npm 或提交 Git；静态图形不随宿主第三方 sprite 替换自动变化。

### 2026-11-09 · macOS 桌面安装本地 0.3.1 包

**背景**：需要将当前仓库打包安装到本机 DSH 桌面端。实际 desktop 依赖已为 0.3.1，旧日志中的 macOS 0.2.5 记录不再代表当前环境；插件列表安装前没有工作台入口。

**决策**：保留源码版本，重新构建并使用桌面端插件管理安装 `.tgz`、立即启用。CLI `dsh plugin --profile desktop` 返回该 profile 由 Electron 独占管理，故不直接改 profile 文件。默认 npm 内部镜像返回 SDK 包 404，改用 `npm ci --registry=https://registry.npmjs.org --cache=/tmp/dsh-workbase-npm-cache` 安装锁定依赖，不改锁文件。

**证据**：`npm run typecheck && npm test && npm run build` 通过，70 项测试无失败；`npm pack` 后 `tar -tzf dsh-workbase-0.3.1.tgz` 列出 6 个白名单文件，包 SHA-256 为 `c0488e6e712da2d6156c3fa00006cfd9feb4d0bd35268c14b6af517d379de1d5`。桌面端安装日志位于 `~/.dsh/profiles/desktop/.plugin-manager/logs/operation-Z84sxS/pnpm.log`，记录新增 0.3.1；对构建目录和 desktop 下 `node_modules/dsh-workbase` 执行 `shasum -a 256`，服务端均为 `94bf9bd3ed382b38d0e96715fc7eacbc489242477cf023f65ffad29975e33e08`，客户端均为 `e3c992a4c72fde7e35f2db0f34e6acc28195b36f8293a9a9d8c47591aef2a494`。桌面界面显示已安装 0.3.1，启用开关为 1，点击项目概览后显示工作台首页、1 个活跃项目及统计区域。

**遗留**：本次只验证安装、启用与首页读取，未重新执行完整视觉回归、真实模型发送或重启后的持久化验收。依赖安装提示发布工具要求更高的 Node 小版本，本次未执行发布工具，也未发布 npm 或提交 Git。

### 2026-11-08 · 0.3.0 首发：token 自举与 packument 占位

**背景**：GitHub Actions 发版链路搭好后，首次发布仍缺一个前置条件：包在 npm 上不存在时，包设置页与 `npm trust` 都无从绑定，只能先用 token 发一次。

**决策**：按「token 发 0.3.0 → 登记可信发布 → 删 token」的顺序走。用户建 granular token（勾 Bypass 2FA、`Read and write (publish and stage)`），存为仓库 secret `NPM_TOKEN`，同时把仓库变量 `NPM_TRUSTED_PUBLISHING` 设为 `true`。变量先设不妨碍 token 发布：`@semantic-release/npm` 13.2.0 先试 OIDC、失败才回落到 token（`lib/verify-auth.js:86`）。

**证据**：`gh workflow run release` 触发的 run `42443390374` 全绿，日志依次出现 `Created tag v0.3.0`、`Published dsh-workbase@0.3.0 to dist-tag @latest`、`Published GitHub release`；发布提交 `d6da2f4`，tag `v0.3.0` 指向它，Release 创建于 03:36:38Z。registry 侧 `dsh-workbase/0.3.0` 返回 200，`/-/package/dsh-workbase/dist-tags` 为 `{"latest":"0.3.0"}`；tarball 215849 字节，6 个文件（LICENSE、lib/client.js、dist/index.js、package.json、README.md、cordis.patch.yml）。首次查 packument 只看到 `0.0.0-stage`（描述为「Temporary package placeholder for staged publishing」），是 CDN 缓存滞后，per-version 端点当时已可访问，几分钟后 packument 才列出 `0.3.0`——先看 per-version 或 dist-tags 端点，别被占位版本号误导。

**遗留**：可信发布尚未在 npmjs 登记，`NPM_TRUSTED_PUBLISHING=true` 目前只让 semantic-release 多试一次 OIDC。登记 `npm trust github --allow-publish`（workflow 文件名需逐字符一致）并确认下一次发版走 OIDC 后，再删除 `NPM_TOKEN`。README「npm 安装」节已改为直接从 npm 安装。

### 2026-11-08 · CNB 镜像改为定时拉取

**背景**：GitHub 主库方案落地时，镜像方向是 GitHub Actions 的 `mirror` job 往 CNB 推。用户要求反过来：由 CNB 侧拉取，不要从 GitHub 推送。除了方向本身，这也去掉了「在 GitHub 存一个能写 CNB 的 token」这一项凭据。

**决策**：删掉 `.github/workflows/release.yml` 的 `mirror` job，workflow 只负责发版；新增仓库根的 `.cnb.yml`，用 CNB 定时事件（`main` 分支下 `crontab: */10 * * * *`）与 `$` 兜底分支的 `web_trigger` 触发，单个 `sync` 阶段从 GitHub `fetch --force --prune` 出全部分支与标签，再以 `--force` 推回 `origin`（CNB），最后删掉 GitHub 上已不存在的分支与标签。凭据用 CNB 内置的 `CNB_TOKEN`／`CNB_TOKEN_USER_NAME`，GitHub 侧不再需要 secret。周期取 10 分钟：CNB 的 crontab 是标准五位表达式，更短没有实际收益，镜像最多滞后一个周期。没有保留「两边都推」的双保险——两个方向同时写同一组 ref 只会让冲突更难判断。

**证据**：validator 三项（YAML／语义／Schema）全过；`web_trigger` 起初放在 `main` 下时有一致性警告「建议移至 `$` 兜底分支」，移到 `$` 后无警告。`node -e` 解析 workflow 得 `jobs: release`。CNB 上尚无 `.cnb.yml`，定时任务不会自己出现，首次手动推了一次 `main` 作 bootstrap。第一次 cron（11:00，构建 `cnb-oeb-1k6shie7r`）在 sync 阶段失败：CNB 用 `sh`（dash）执行 script，`set -euo pipefail` 报 `sh: 1: set: Illegal option -o pipefail`，退出码 2；改成 `set -eu` 后（提交 `70f97a1`）11:10 的 cron（`cnb-qd1-1k6si4nto`）成功，日志依次出现「删除多余分支 tmp-sync-probe」与「已同步到 `70f97a1b2667c1822f950e0ce49c423a5521fac2`」——删除逻辑与拉取都实际跑过。

**遗留**：CNB 侧不要直接推，下一次同步会把它覆盖回 GitHub 的状态（除 bot 自己的同步提交外）。镜像与发版解耦后，发布完成的滞后从「同一次 run」变成「最多 10 分钟」，页面上的 tag 可能比 GitHub 晚出现。GitHub 的 `CNB_TOKEN` secret 已删除，工作流里不再有镜像 job。

### 2026-11-08 · 真源迁到 GitHub，CNB 退回只读镜像

**背景**：本日早些时候把发版放在 CNB 流水线，凭据仓库里的 granular token 直接 `npm publish`。用户指出 CNB 不在 npm 可信发布名单——属实：可信发布只支持 GitHub Actions、GitLab CI.com 与 CircleCI，自托管 runner 也不被支持，CNB 既拿不到 OIDC 也产不出 provenance。npm 同时宣布 2027-01 移除 granular token 的直接发布能力，把发版留在 CNB 等于把半年后要重做的事先欠下。

**决策**：翻转为 GitHub 主库、GitHub Actions 发版、CNB 只读镜像。放弃「CNB 主库 + 另建 GitHub Actions 发版仓」，因为跨仓发版要同步两套历史与两套凭据，比整体迁移更脆；也没有只加可信发布而不迁真源——可信发布的 workflow 必须与主库同仓，否则 tag 与发布位置错位。新增 `.github/workflows/release.yml`：`release` job 先跑三关，再由 semantic-release 发版（`id-token: write`，凭据二选一：`vars.NPM_TRUSTED_PUBLISHING` 或 `secrets.NPM_TOKEN`）；`mirror` job 在 `needs: release` + `if: always()` 下用 `CNB_TOKEN` force push `main` 与标签到 CNB。`release.config.mjs` 接回 `@semantic-release/github`，`.cnb.yml` 整体删除，CNB 侧不再有 CI。

**证据**：npm 文档 `trusted-publishers.mdx` 列出三家 CI 并写明自托管 runner 不支持；`npm trust` 的文档写明 Package must exist，所以 0.3.0 仍需一次 `NPM_TOKEN` 自举。workflow 固定 node 22 并 `npm install -g npm@latest`，满足可信发布的 CLI ≥ 11.5.1；`@semantic-release/npm` 13.2.0 的 `lib/verify-auth.js:86` 会先试 OIDC、失败才回落到 token，因此可信发布不需要额外环境变量。首次运行（run `42439304189`）全绿：`release` job 的 semantic-release 步骤打印「未配置发布凭据（NPM_TOKEN 或仓库变量 NPM_TRUSTED_PUBLISHING），跳过发版」，`mirror` job 把 CNB 的 `main` 推到与 GitHub 相同的 `57ab128e5aa389a1d7c10d8ec91f8ade62c04db0`；两侧标签都只有 `v0.2.38`，GitHub Release 数仍为 0——镜像链路成立，真正的发布分支尚未走过。

**遗留**：首次发版必须自举——用户提供一次性 granular token（勾 Bypass 2FA、`Read and write (publish and stage)`、范围限 `dsh-workbase`）→ 0.3.0 发布 → `npm trust github --allow-publish` → 设变量 `NPM_TRUSTED_PUBLISHING=true` → 删 secret。`mirror` job 依赖 `CNB_TOKEN`，未设时该 job 直接失败（有意：宁可红也不静默不同步）。CNB 上的 `main` 从此只由该 job 写入，不要在镜像侧直接推。上一条「发版移入 CNB 流水线」的记录保留为历史，其中描述的六阶段 `.cnb.yml` 已不存在。

### 2026-11-08 · 发版移入 CNB 流水线，镜像后自动建 GitHub Release

**背景**：仓库已托管在 CNB、镜像到 GitHub，但 semantic-release 只在本机手工跑；GitHub 的 `releases` 数量为 0——`git-sync` 只搬分支与标签，Release 是独立对象。目标是「push 即发版」，同时不把发布逻辑复制到两套 CI。

**决策**：选 A（CNB 发版 + 镜像后建 Release），放弃 B（GitHub Actions 发版回推 CNB，要维护两套 CI 与两套凭据）与 C（真源迁 GitHub，可得 `npm publish --provenance`，但属于仓库迁移，不混在这次改动里）。`.cnb.yml` 从四阶段扩到六阶段：`check-credentials` → `test` → `release` → `align` → `mirror` → `publish-release`。`release` 用 `CNB_COMMIT_MESSAGE_TITLE` 匹配发版提交标题防自触发；`publish-release` 先查 npm 上该版本是否存在，404 就跳过，避免给历史 tag 补建 Release。

**证据**：`node validate.js .cnb.yml`（validator 复制到工作区跑）YAML 语法／语义／Schema 三项全过。发布动作本身未验证：本机无 `NPM_TOKEN`，首次推送预期 `release` 阶段打印「未配置 NPM_TOKEN…跳过发版」、`publish-release` 打印「当前提交没有 tag，跳过」。

**遗留**：需把 npm Automation token 以 `NPM_TOKEN` 写入 `zhileyo/secrets` 的 `secrets.yml`；之后 push `main` 才会真正发 0.3.0 并生成 Release。`publish-release` 的 POST 分支尚未跑过，首次真实发版要看日志确认。

### 2026-11-08 · README 安装命令改用 `<版本>` 占位，发版只改开发日志

**背景**：`release-sync-docs.mjs` 曾有一条 README 规则，只为改写本地安装示例里的 `dsh-workbase-0.2.38.tgz`。这个文件名对读者没有信息量（版本在 `package.json` 与 tag 里），却让每次发版都要动 README，多一处可能与 registry 不一致的版本字面量。

**决策**：README 的本地安装命令改为 `./dsh-workbase-<版本>.tgz`，前面补一行 `npm pack`，正文说明替换方式；同时删掉插件里的 README 规则，`prepare()` 只改写开发日志的当前状态。没有删掉整节本地安装说明：离线安装仍是验收与内网路径，`npm pack` 要先构建这个坑也要留。代价是命令不能原样复制，需要读者替换一次占位符——比每次发版都改一次文档划算。

**证据**：删除前规则正则 `/dsh-workbase-\d+\.\d+\.\d+\.tgz/g` 在 README 全文件只命中第 44 行；删除后剩余四条规则仍逐条抛错校验（`release-sync-docs.mjs` 的 `if (nextHead === head) throw`），`node --check release-sync-docs.mjs` 通过，`npm run typecheck` 与 `npm test` 见提交前的运行记录。

**遗留**：README「npm 安装」节仍写「当前没有 npm 发布成功记录」，0.3.0 发布后这句话会失效，而插件不再碰 README，必须手动改。等真正发布时连同安装建议一起更新。

### 2026-11-08 · 提交身份统一为 zhileyo，历史 SHA 全部重写

**背景**：仓库没有本地提交身份，一直沿用全局的 `AlwaysFyo <author@example.com>`；GitHub 账号是 `zhileyo`，提交页的作者链接与账号对不上，作者名也不一致。

**决策**：本仓库设 `user.name=zhileyo`、`user.email=author@example.com`（邮箱不变，提交仍归属同一账号）；已存在的 8 个提交连同注记标签 `v0.2.38` 一起重写作者与提交者，保留原树、提交信息与作者/提交者时间及时区。没有用 `git filter-branch`：沙箱下 `sh.exe` 建不了信号管道（`couldn't create signal pipe, Win32 error 5`），filter-branch 直接以退出码 1 中止；改用 `git commit-tree -F <消息文件>`，逐个提交重建，不需要 shell，也不需要 stdin。标签原先指向根提交，重写后重新指向重写后的根提交，tagger 同样改为 `zhileyo`。

**证据**：重写前后 `git diff 8f03033 6300996` 为空——树完全一致；逐提交比较 commit 对象中 `\n\n` 之后的消息体，8/8 一致；`git log --format='%an <%ae>'` 全部为 `zhileyo <author@example.com>`；`v0.2.38` 现指向 `eb931e3`，与 `git rev-list --max-parents=0 main` 相同，标签消息与旧标签逐字节一致。新 tip `6300996`（原 `8f03033`）。

**遗留**：所有既有 SHA 变了，CNB 只能 force push，GitHub 镜像由流水线覆写；任何本地克隆或分支需要重新 fetch 后 reset。GitHub 上旧提交页面的对象会保留一段时间，直到服务端 GC，属镜像侧不可控。

### 2026-11-08 · 补 MIT 许可证，README 不再复述发版流程

**背景**：仓库已经公开，但既没有 `LICENSE` 也没有 `license` 字段，README 结尾只写「当前尚未指定开源许可证」——别人无法合法复用。同时发版规则在 README、`AGENTS.md`、本文件三处各写一份，改一次提交类型表要同步三处，漂移只是时间问题。

**决策**：许可证取 MIT，与同组织 `dsh-overview` 保持一致，版权行 `Copyright (c) 2026 AlwaysFyo`；`LICENSE` 放仓库根，`package.json` 补 `"license": "MIT"`（npm 会自动把 `LICENSE` 打进包，不必改 `files` 白名单）。README 删掉整个「发布」章节：面向使用者的文档不再复述维护者流程，只在「开发」末尾留一句指向 `AGENTS.md`；许可证节改成一行指向 `LICENSE`。README 仍保留 `npm pack` 的「先构建」提示，那是使用者出本地包时会踩的坑，不属于内部发版规则。

**证据**：此前 `git ls-files` 无 `LICENSE`，`package.json` 无 `license` 字段（只有 `private: false`）；`dsh-overview` 的 `LICENSE` 为 MIT + `Copyright (c) 2026 AlwaysFyo`，直接对齐。删除的是 README 原 112-132 行（type 表、semantic-release 命令、`NPM_TOKEN` 说明、白名单说明），目录结构里 `release.config.mjs`／`release-sync-docs.mjs` 的说明保留。

**遗留**：真正的发版仍未发生——没有 npm 发布记录，GitHub 上只有 tag 没有 Release。若要让 GitHub 出 Release，需要在发版链上接 `@semantic-release/github`（或流水线里另建 release），镜像本身只搬 ref，不产出 Release。

### 2026-11-08 · 托管到 CNB，GitHub 由流水线镜像

**背景**：仓库此前只有本地历史，既没有远程也没有同步；需要放到 CNB 作为主库，并在 GitHub 留一份可读镜像。两个平台手工各推一次必然漂移，镜像只能由流水线在提交后自动完成。

**决策**：主库为 `zhileyo/dsh-workbase`（CNB，public），同名的 GitHub 仓库承接镜像。流水线照抄同组织 `dsh-overview` 的 `.cnb.yml` 结构：凭据来自密钥仓库 `${CNB_ROOT_SLUG}/secrets` 的 `GITHUB_USERNAME`／`GITHUB_TOKEN`，`align` 阶段先把本地 ref 与 CNB 对齐、删掉 GitHub 侧多余的 ref，再由 `tencentcom/git-sync` 推送——该插件没有 prune，只推不删会让镜像越积越脏。没有沿用 `dsh-fairy` 早期的模板：那版用 `filter-branch` 把 `.cnb.yml` 从 GitHub 历史摘掉，两边同一提交的 SHA 不同，就失去了「SHA 一致即镜像同步」这个判据。测试门禁取 `typecheck`／`test`／`build` 三关，与本地发版前自检一致；另加 `check-credentials` 阶段，把「fine-grained PAT 没把本仓库加入 Repository access」这类错误提前暴露成可读信息，而不是让 align 阶段报一个含糊的认证失败。

**证据**：`git -c http.sslBackend=openssl push https://cnb.cool/zhileyo/dsh-workbase.git refs/heads/main:refs/heads/main --tags` 推出 `main` 与 `v0.2.38`；随后 `gh api repos/zhileyo/dsh-workbase/branches` 得 `main`、`.../tags` 得 `v0.2.38`、`.../commits` 首条为 `5afc229`，与 CNB 的 HEAD 同一 SHA，证明 preflight → test → align → mirror 四个阶段都实际跑过。本机侧受沙箱限制：`npm test`（tsx）与 `npm run build`（esbuild）的子进程 spawn 均报 `EPERM`，只能断言 `npm run typecheck` 通过、`node -e "import('./sync-ui.mjs').then(m=>m.syncPrototypeUi())"` 生成物与提交版本无差异；完整三关由 CNB 流水线在 `node:24` 上执行，镜像成功即为通过证据。公开前的脱敏：`docs/ui/ui-directions.html` 的 9 处 `/Users/<user>` 改为 `<home>`（同一提交）。

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

**决策**：删掉 `.git` 重开仓库，不做备份（用户选择）。同时删除外部工作树 `C:<home>/WorkBuddy/Worktrees/dsh-workbase/main-cde2b588`（HEAD `cab8785`，里面有 2 个未跟踪目录 `.workbuddy/`、`_build/`，均为工具产物）。提交信息规范改以 `.agents/rules/git-commit-message.md` 为准（type + 原因分析／修改方法），`AGENTS.md` 的「提交信息」节同批改写并加了「版本号写进 subject」的本仓库约定。

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
