/** 中文文案作为稳定查找键；动态内容通过命名参数插入，不参与翻译。 */
export const english: Record<string, string> = Object.fromEntries(`
默认 Shell 未能保存在当前浏览器，请检查存储权限或空间后重试。|Could not save the default Shell in this browser. Check storage permissions or available space, then retry.
列表缓存异常|List cache issue
备份项目标识重复|The backup contains duplicate project IDs
备份存在重复的活跃项目目录|The backup contains duplicate active project directories
当前宿主没有唯一匹配项目：{p0}|No unique matching project on this host: {p0}
待办归属或标识不完整|Todo ownership or IDs are incomplete
工作树会话缺少项目归属|A worktree session has no owning project
工作树会话无法与当前宿主的项目关联核实|A worktree session's project association cannot be verified on this host
备份中的工作台状态缺失或格式不支持|The backup has no workbase state or uses an unsupported format
备份没有已校验的工作台状态范围|The backup has no verified workbase state coverage
独立配色，保存后生效；Catppuccin 已下载，可离线使用。|Independent colors; save to apply. Catppuccin is available offline.
独立于平台主题，保存后应用到交互终端。|Independent of the platform theme; save to apply to interactive terminals.
终端扩展|Terminal extensions
终端预览|Terminal preview
下载 Catppuccin|Download Catppuccin
重新下载|Download again
在「插件 → 终端」显示字体、字号、配色与默认 Shell 配置；关闭后保留已保存的设置。|Show font, font size, color scheme and default Shell settings under Plugins → Terminal. Saved settings are kept when disabled.
配色方案|Color scheme
自定义配色|Custom colors
独立于平台主题；保存后应用到交互终端。|Independent of the platform theme. Applies to interactive terminals after saving.
下载并选择 Catppuccin|Download and select Catppuccin
重新下载 Catppuccin|Download Catppuccin again
正在下载…|Downloading…
下载失败，原配色与草稿已保留，请重试。|Download failed. Your previous colors and draft are kept; please retry.
当前宿主未提供可扩展的终端显示入口。|This host does not provide an extensible terminal display.
四种风格已下载，保存后可离线使用。|All four flavors downloaded. Save to use them offline.
请输入完整的六位十六进制颜色，或先下载 Catppuccin 色板。|Enter complete six-digit hex colors, or download the Catppuccin palette first.
ANSI 色板|ANSI palette
ANSI 色板（16 色）|ANSI palette (16 colors)
重置色板|Reset palette
背景|Background
文字|Text
光标|Cursor
选区|Selection
黑色|Black
红色|Red
绿色|Green
黄色|Yellow
蓝色|Blue
品红|Magenta
青色|Cyan
白色|White
亮黑|Bright black
亮红|Bright red
亮绿|Bright green
亮黄|Bright yellow
亮蓝|Bright blue
亮品红|Bright magenta
亮青|Bright cyan
亮白|Bright white
Catppuccin 下载失败，请重试。|Catppuccin download failed. Please retry.
Catppuccin 色板不完整。|The Catppuccin palette is incomplete.
Catppuccin 色板过大。|The Catppuccin palette is too large.
终端配色已在其他窗口修改，请重新打开设置。|Terminal colors changed in another window. Reopen settings.
请先下载 Catppuccin 色板。|Download the Catppuccin palette first.
终端|Terminal
终端字体|Terminal font
字体预览|Font preview
设置已保存。|Settings saved.
交互终端|Interactive terminal
命令执行限制|Command execution limits
选择本机字体，或输入名称；留空恢复默认。|Choose a local font or enter its name. Leave blank to restore the default.
仅影响后续新建终端，保存在当前浏览器。|Saved in this browser and used only for new terminals.
搜索或输入字体|Search or enter a font
选择字体|Choose font
正在读取本机字体…|Loading local fonts…
无法读取本机字体，可手动输入字体名称。|Local fonts could not be read. You can enter a font name manually.
没有匹配字体，可手动输入。|No matching font. You can enter a name manually.
部分设置可能已保存，未保存草稿已保留，请重试。|Some settings may have been saved. Unsaved drafts are kept; please retry.
在「插件 → 终端」显示字体、字号与默认 Shell 配置；关闭后保留已保存的设置。|Show font, font size and default Shell settings under Plugins → Terminal. Saved settings are kept when disabled.
当前宿主未提供终端字体配置。|Terminal font settings are unavailable in this host.
当前配置为只读。|Settings are read-only.
保存失败，草稿已保留，请重试。|Save failed. Your draft is kept; please retry.
保存字体设置|Save font settings
正在保存…|Saving…
字体|Font
字体大小|Font size
填写本机已安装字体，可用逗号分隔备选字体；留空恢复官方默认。|Enter locally installed fonts, separated by commas. Leave blank to restore the official default.
字体名称最多 200 个字符。|Font names must be at most 200 characters.
支持 10–20 px，官方默认 13 px；留空恢复默认。|Supports 10–20 px; the official default is 13 px. Leave blank to restore the default.
请输入 10–20 之间的整数。|Enter a whole number between 10 and 20.
已自定义|Customized
恢复默认|Reset to default
默认 Shell|Default Shell
当前宿主未提供终端服务。|Terminal service is unavailable in this host.
请先打开一个会话，再返回此页选择默认 Shell。|Open a session first, then return here to choose the default Shell.
正在读取可用 Shell…|Loading available Shells…
读取 Shell 失败，请重试。|Could not load Shells. Please retry.
当前会话环境没有可用 Shell。|No Shells are available in this session environment.
保存默认 Shell|Save default Shell
使用当前会话环境中的启动器，保存在当前浏览器；仅影响后续新建终端。|Use a launcher from the current session environment. Saved in this browser and used only for new terminals.
选择 Shell|Choose Shell
界面语言|Language
后台检查|Check in background
后台更新|Update in background
备份时间：{p0} · {p1} 个文件 · {p2} MB|Backup time: {p0} · {p1} files · {p2} MB
{p0} 个项目 · {p1} 个待办。预览有效至 {p2}。|{p0} projects · {p1} tasks. Preview expires at {p2}.
跟随平台|Follow platform
简体中文|简体中文
默认跟随 Harness；仅调整工作台界面，不翻译项目、会话或待办内容。|Follow Harness by default. Only the Workbase interface is translated; your content stays unchanged.
 · 数据可能不是最新 · 上次同步 {p0}| · Data may be outdated · Last synced {p0}
7 天|7 days
14 天|14 days
30 天|30 days
Agent 仅可查询当前项目待办，不能创建、编辑、删除或修改完成状态。|Agents can only read this project's tasks, without changing them.
Agent 可在当前项目创建、查询、编辑和删除待办{p0}。|Agents can create, read, edit and delete tasks in this project{p0}.
Agent 权限|Agent permissions
Agent 模式|Agent mode
Agent 预设|Agent preset
Billion 会话库|Billion sessions
Billion 数据|Billion data
Billion 状态|Billion state
Billion 缓存|Billion cache
Billion 证书|Billion certificates
Billion 配置|Billion configuration
DSH 数据目录下的 backup/identity.txt（默认 ~/.dsh/backup/identity.txt）|backup/identity.txt in the DSH data directory (default: ~/.dsh/backup/identity.txt)
DSH 默认主题|DSH default theme
Enter 换行，⌘ / Ctrl + Enter 发送；支持拖入文件和粘贴图片|Enter for a new line; ⌘ / Ctrl + Enter to send. Drop files or paste images.
Git 来源请在官方插件页选择提交更新|For Git sources, select a commit on the official plugin page.
Harness 文件导入服务暂不可用|Harness file import is currently unavailable
Harness 添加菜单服务不可用|Harness attachment menu is unavailable
Workbase · 工作台|Workbase
Workbase 工作台|Workbase
npm 官方源|Official npm registry
{p0} · 已归档|{p0} · Archived
{p0} · 已归档，跳转已禁用|{p0} · Archived; navigation disabled
{p0} · 点击重命名|{p0} · Click to rename
{p0} 个附件|{p0} attachments
{p0} 个附件待上传|{p0} attachments awaiting upload
{p0} 个项目|{p0} projects
{p0} 分钟前|{p0} min ago
{p0} 创建 · {p1}|Created by {p0} · {p1}
{p0} 天前|{p0} days ago
{p0} 小时前|{p0} hr ago
{p0}字段显示|{p0} fields
{p0}插件|{p0} plugins
{p0}显示字段|Fields in {p0} view
{p0}的更多操作|More actions for {p0}
{p0}第 {p1} 个|{p0} position {p1}
{p0}（项目已归档，仅可查看）|{p0} (archived project; read only)
· 上传中|· Uploading
· 上传失败|· Upload failed
· 受限|· Restricted
· 失败|· Failed
· 已归档|· Archived
· 检查未完成|· Check incomplete
· 跳过|· Skipped
↑ ↓ 选择 · Enter 打开 · Esc 关闭|↑ ↓ Select · Enter Open · Esc Close
、待办标题与描述|, task titles and descriptions
。历史会话和待办仍可访问；请恢复原目录后使用顶部刷新重新检查。当前宿主尚不支持修改绑定目录。|. History and tasks remain available. Restore the directory, then refresh. The host does not support changing the bound directory.
。重试将复用原会话和消息，不重复发送。|. Retry reuses the original session and message without sending twice.
」及其子 Agent 会话、转录与附件缓存。此操作无法撤销，独立的 fork 会话会保留。|” and its child agent sessions, transcripts and attachment caches. This cannot be undone. Independent forks are retained.
」的 Harness 注册。保留本地目录、待办与历史关联；重新添加同一目录可恢复。运行中会话必须先停止。|” from Harness. Its directory, tasks and history links are retained. Add the same directory to restore. Stop running sessions first.
」目录重新注册，需确认项目身份：|” is being registered again. Confirm the project identity:
」？会话保留，可以随时恢复。运行中的会话不会自动停止。|”? Sessions are retained and can be restored. Running sessions are not stopped automatically.
一键更新|Update all
一键更新用户安装的插件|Update all user-installed plugins
上下文概览|Context overview
上传中|Uploading
下载|Download
不修改当前数据。|Current data is unchanged.
两栏使用列表布局|Use lists for both columns
两栏使用整体卡片布局|Use cards for both columns
个待办。预览有效至| tasks. Preview expires at
个文件 ·| files ·
个附件| attachments
个项目 ·| projects ·
主页|Home
主题配色|Theme
也可点击右侧图标选择项目。|You can also select a project using the icon on the right.
仅允许查询待办|Read tasks only
仅影响当前展示方式|Only affects the current view
仅显示前 20 条正文结果，请缩小搜索范围。|Only the first 20 full-text results are shown. Narrow your search.
仅显示最近 40 条消息，更早内容请打开会话查看。|Showing the latest 40 messages. Open the session for earlier content.
仅更新用户安装的插件，沿用各自的安装源及启用状态。|Only user-installed plugins are updated, keeping their source and enabled state.
仅检查用户安装的插件；本地安装包等不支持在线更新的来源会跳过。|Only user-installed plugins are checked. Sources without online updates, such as local packages, are skipped.
任务看板|Task board
优先级|Priority
会话|Sessions
会话 {p0}|Session {p0}
会话事件|Session events
会话全文|Session full text
会话全文搜索失败|Session full-text search failed
会话内容|Session content
会话历史文件|Session history files
会话名称|Session name
会话名称已更新|Session renamed
会话已删除或不可访问|Session was deleted or is inaccessible
会话已归档，可随时恢复|Session archived; you can restore it anytime
会话已恢复|Session restored
会话已永久删除|Session permanently deleted
会话更多操作：{p0}|More session actions: {p0}
会话标题|Session title
会话标题与正文|Session titles and full text
会话模型|Session model
会话模式|Session mode
会话正文搜索依赖官方「历史会话搜索」实验套件（@deepseek-ai/dsh-experimental-session-search），需在宿主插件页添加并启用；标题搜索不受影响。|Full-text search requires the official experimental session-search bundle (@deepseek-ai/dsh-experimental-session-search). Add and enable it on the host's plugin page. Title search remains available.
会话统计|Session statistics
会话缓存|Session cache
会话缓存尚未检查，请重新检查|Session cache has not been checked; check again
会话范围|Session scope
会话草稿未准备完成|Session draft is not ready
会话还没有可显示的内容。|This session has no content to display yet.
会话项目|Session project
会话预览|Session preview
作为初始文件夹名称|Used as the initial folder name
作为新项目|Add as a new project
你|You
使用上方「新建会话」开始推进项目。|Choose “New session” above to start working on this project.
使用最新版本继续保存|Continue saving with the latest version
侧栏入口名称|Sidebar label
侧栏菜单位置|Sidebar position
侧边栏入口与顶部返回按钮至少保留一个。|Keep at least one of the sidebar entry or header return button.
保存|Save
保存中…|Saving…
保存位置：|Saved to:
保存全部分类修改 · 主题即时预览|Save changes in all sections · Theme previews instantly
保存后下次启动生效；每次宿主启动就绪并空闲后执行一次。|Applies on the next launch. Runs once after the host is ready and idle.
保存设置|Save settings
修复失败，请重新检查|Repair failed; check again
倒序|From bottom,
停止并移除旧版本|Stop and remove old version
允许 Agent 管理待办|Allow agents to manage tasks
允许管理待办|Allow task management
先解密校验，再预览确认。关闭设置后后台任务继续；恢复期间请勿退出宿主。|Decrypt and validate before previewing and confirming. Tasks continue in the background. Keep the host open during recovery.
全局搜索结果|Global search results
全局配置|Global settings
全部|All
全部关闭时，首页统计区域不显示。|The statistics area is hidden when all cards are off.
全部异常|All issues
全部项目|All projects
公共技能|Shared skills
关闭|Close
关闭弹窗后继续运行，再次打开可查看进度。|Continues after this dialog closes. Reopen to view progress.
关闭提示|Dismiss notification
关闭统计区域后，恢复你选择的展示样式。|Your selected style is restored when statistics are hidden.
关闭错误提示|Dismiss error
其他组件|Other components
再次点击返回添加（Esc）|Click again to return to adding (Esc)
冷白与森林绿，清晰紧凑的工具风格。|Cool white and forest green with a compact, clear layout.
凭据|Credentials
切换明暗模式，请前往 DSH 设置 → 外观。|Change light/dark mode in DSH Settings → Appearance.
切换项目，当前 {p0}，目录 {p1}|Switch project. Current: {p0}; directory: {p1}
列表|List
列表缓存|List cache
列表缓存不可用|List cache unavailable
列表缓存正常|List cache healthy
列表视图|List view
刚刚|Just now
创建 ·|Created ·
创建位置：{p0}|Create in: {p0}
创建新项目|Create a new project
创建项目|Create project
删除全部|Delete all
删除全部空会话|Delete all empty sessions
删除待办：{p0}|Delete task: {p0}
删除所有项目中的可清理空会话，不受搜索条件影响|Delete eligible empty sessions across all projects, regardless of search filters
删除空会话|Delete empty sessions
助手|Assistant
单个不超过10MiB|Up to 10 MiB each
单张图片不能超过 {p0} 字节|Each image must be no larger than {p0} bytes
卡片|Cards
原会话正在提交，草稿尚未交接，请稍后重试|The previous session is submitting. Draft handoff is pending; try again later.
原项目已恢复|Original project restored
发现可更新版本|Updates available
发起会话|Start session
发送 · ⌘ Enter|Send · ⌘ Enter
发送首条消息|Send first message
取消|Cancel
取消收藏|Unfavorite
取消新建工作树|Cancel new worktree
取消置顶会话|Unpin session
取消置顶项目|Unpin project
取消预览|Cancel preview
可以更新|Update available
可更新|Available
同时影响会话统计卡与项目「近期活跃」数量。|Applies to session statistics and each project's recent activity count.
同步 DSH 当前配置的主题及后续变更。|Follow the current DSH theme and future changes.
同步中断|Sync interrupted
名称与 Harness 同步；不改变本地文件夹名称和路径。Enter 保存，Esc 取消。|The name syncs with Harness. Folder names and paths stay unchanged. Enter saves; Esc cancels.
后台|Background
后台执行，关闭设置后继续。将保存当前备份配置。|Runs in the background after settings close. Saves the current backup settings.
后续项目专属设置将在这里显示。|Additional project-specific settings will appear here.
启动打开首页|Open home on launch
启动时自动备份|Back up on launch
回滚|Rollback
回滚副本|Rollback copy
固定使用 DSH 官方默认配色。|Always use the official DSH default colors.
国内镜像源|China mirror registry
图片上传失败（{p0}）|Image upload failed ({p0})
图片对象|Image objects
图片总大小不能超过 {p0} 字节|Total image size must not exceed {p0} bytes
图片读取失败（{p0}）|Image read failed ({p0})
在 DSH 侧边栏显示工作台入口。|Show the Workbase entry in the DSH sidebar.
在所选目录内新建独立目录。会话、附件、SQLite 和 Profile 文件不会自动激活到当前宿主。|Create a separate folder in the selected directory. Sessions, attachments, SQLite and profile files are not activated in the current host.
在插件页刷新按钮左侧显示一键更新入口，检查并更新用户安装的插件。|Show an update-all button beside refresh on the plugin page.
在新对话和历史会话顶部显示返回工作台按钮。|Show a return-to-Workbase button at the top of new and existing sessions.
在新工作树中开始|Start in a new worktree
在项目菜单中选择「归档项目」后显示在这里，业务只读。|Projects archived from their menu appear here in read-only mode.
基于 {p0}|Based on {p0}
填入会话草稿，由你发送。|Insert into the session draft for you to send.
处理中…|Processing…
备份|Backup
备份会加密保存。运行中文件为观察副本；客户端草稿、自定义附件根等范围尚未覆盖。|Backups are encrypted. Live files are observational copies; client drafts and custom attachment roots are not covered.
备份保留期限|Backup retention
备份恢复|Backup & recovery
备份恢复分类|Backup and recovery sections
备份文件|Backup file
备份文件绝对路径|Absolute backup file path
备份时间：|Backup time:
备份状态|Backup status
备份目录|Backup directory
备份覆盖明细（|Backup coverage (
备份进行中…|Backup in progress…
复制|Copy
复制{p0}的完整路径|Copy full path of {p0}
复制失败，请在项目详情中手动复制完整路径|Copy failed. Copy the full path manually from project details.
复制路径|Copy path
外观布局|Appearance
外观布局分类|Appearance sections
大小未知|Unknown size
失败|Failed
失败详情|Failure details
孤儿|Orphaned
孤儿子代理|Orphaned subagents
孤儿子代理尚未检查，请重新检查|Orphaned subagents have not been checked; check again
安装新版本|Install new version
安装来源|Installation source
完成|Done
完成后将更新检查结果|Check results will refresh when complete
完成：{p0}|Complete: {p0}
完整新建|Create full archive
完整路径已复制|Full path copied
官方 Forge 未接受工作树请求，请检查插件是否启用后重试|Forge did not accept the worktree request. Check that the plugin is enabled and retry.
宠物客户端状态|Pet client state
宠物设置与资源|Pet settings and resources
宫格|Grid
宫格视图|Grid view
宿主未接受提交|The host did not accept the submission
宿主未提供附件上传能力|The host does not provide attachment uploads
宿主未提供附件读取能力|The host does not provide attachment reading
宿主未能完成操作|The host could not complete the operation
宿主没有返回有效会话，请重试|The host returned no valid session; retry
宿主缺少诊断修复所需的底层能力，请更新宿主|The host lacks diagnostic repair capabilities. Update the host.
宿主返回的版本信息不完整|The host returned incomplete version information
密钥位置：|Key location:
导出失败|Export failed
导出完整归档到新目录，保留当前数据。|Export the full archive to a new directory, keeping current data.
将替换工作台的项目关联、待办、标记和偏好。替换前保存加密回滚副本，保留当前备份配置并关闭插件自动更新。|Replace project links, tasks, marks and preferences. Save an encrypted rollback copy first; keep current backup settings and turn off automatic plugin updates.
将永久删除 {p0} 个空会话的日志、索引和缓存，无法撤销。批量删除覆盖所有项目的可清理空会话，不受搜索条件影响。执行前逐项复查；已开始对话、正在使用或状态变化的会话会跳过。|Permanently delete logs, indexes and caches of {p0} empty sessions. This cannot be undone. All projects are included regardless of filters. Each session is rechecked; started, active or changed sessions are skipped.
将永久清理 {p0} 个子代理的日志、索引和缓存，无法撤销。执行前会再次检查母会话是否仍然缺失、子代理是否活跃。|Permanently remove logs, indexes and caches of {p0} subagents. This cannot be undone. Parent availability and subagent activity are rechecked before removal.
尚未开始对话|No conversation started
尚未检查|Not checked
尚未结束的会话。|Sessions that have not ended yet.
展示统计卡，并开启「统计卡片」页签。|Show statistics and enable the “Stat cards” tab.
工作台主题|Workbase theme
工作台替换不可用：|Workbase replacement unavailable:
工作台概览|Workbase overview
工作台状态|Workbase state
工作台状态已恢复，原数据已保留回滚副本|Workbase state restored. A rollback copy of the original data is retained.
工作台统计|Workbase statistics
工作台设置|Workbase settings
工作树请求失败，请重试|Worktree request failed; retry
已保存|Saved
已取消收藏|Unfavorited
已取消置顶|Unpinned
已同步|Synced
已处理|Processed
已复制|Copied
已完成|Completed
已完成 ·|Completed ·
已归档|Archived
已归档 · 只读|Archived · Read only
已打开原会话，暂不支持自动定位匹配消息|Session opened. Jumping to the matching message is not supported yet.
已收藏|Favorited
已是最新|Up to date
已是最新兼容正式版本|Latest compatible stable version
已更新至 {p0}|Updated to {p0}
已更新至 {p0}，重启 Harness 后生效|Updated to {p0}. Restart Harness to apply.
已校验|Validated
已置顶|Pinned
已跳过|Skipped
开启后，Agent 可创建、查询、编辑、删除待办及修改完成状态；关闭后仅可查询。对所有已有项目和后续新增项目统一生效。|When enabled, agents can create, read, edit, delete and complete tasks. Otherwise, access is read only. Applies to all existing and future projects.
开启后，启动 DSH 桌面端进入工作台首页；保存后下次启动生效。|Open Workbase home when the DSH desktop app starts. Applies on the next launch.
开启自动更新|Enable automatic updates
开始恢复|Start recovery
开始新会话|Start a new session
归档|Archived
归档「|Archive “
归档会话|Archive session
归档收藏|Archived favorites
归档设置|Archive settings
归档项目|Archive project
当前会话没有上传文件的权限|This session has no permission to upload files
当前保留上次检查结果，请重新检查|Previous check results are retained; check again
当前分支|Current branch
当前分支：{p0}|Current branch: {p0}
当前可搜索范围没有匹配结果|No matches in the available search scope
当前外观：|Current appearance:
当前安装来源不支持在线更新|This installation source does not support online updates
当前宿主未提供插件更新服务|The host does not provide a plugin update service
当前版本|Current version
当前环境无法读取备份状态。|Backup status is unavailable in this environment.
当前环境无法读取恢复状态。|Recovery status is unavailable in this environment.
当前项目目录不是 Git 仓库，没有分支信息|This directory is not a Git repository; no branches available
待上传|Pending upload
待办|Tasks
待办优先级|Task priority
待办会话模式：{p0}|Task session mode: {p0}
待办图片|Task image
待办图片超过宿主单条消息限制，请减少图片后重试|Task images exceed the host's per-message limit. Remove some images and retry.
待办已删除|Task deleted
待办已删除，请更新搜索结果|Task deleted; refresh search results
待办已完成|Task completed
待办已恢复|Task restored
待办已更新|Task updated
待办已添加|Task added
待办已被其他操作修改或删除，编辑内容仍保留。|The task was changed or deleted elsewhere. Your edits are retained.
待办已重新打开|Task reopened
待办或项目已经变化，请刷新后重试；编辑内容仍保留。|The task or project changed. Refresh and retry; your edits are retained.
待办或项目已经变化，请刷新后重试；附件仍保留。|The task or project changed. Refresh and retry; attachments are retained.
待办描述|Task description
待办标题|Task title
待办统计|Task statistics
待办详情|Task details
待处理|Pending
待处理 ·|Pending ·
快捷会话|Quick session
恢复任务进行中，暂停保存设置|Settings cannot be saved during recovery
恢复会话|Restore session
恢复保存目录|Recovery destination
恢复到独立目录|Recover to a separate directory
恢复原项目|Restore original project
恢复工作台状态|Restore Workbase state
恢复操作失败|Recovery failed
恢复旧版本|Restore old version
恢复状态|Recovery status
恢复目录|Recovery directory
恢复范围|Recovery scope
恢复项目|Restore project
所有项目目录均可访问|All project directories are accessible
所选时间范围内更新的未归档会话。|Unarchived sessions updated within the selected period.
所选项目目录不可用，请选择可用项目。|The selected directory is unavailable. Select an accessible project.
手动 {p0}／Agent {p1}|Manual {p0} / Agent {p1}
打开会话|Open session
打开失败|Open failed
打开已有目录，或通过顶部添加新项目。|Open an existing directory or add a project from the top bar.
打开已有项目|Open existing project
打开目录|Open directory
打开项目|Open project
执行状态|Execution status
技能管理|Skill management
按钮|Buttons
按顺序更新并保留启用状态；期间插件可能短暂停止，安装失败时会保留或恢复原版本。|Updates run sequentially, keeping enabled states. Plugins may stop briefly. Failed installations retain or restore the original version.
描述|Description
提交失败|Submission failed
提交未完成，请检查附件或重试|Submission incomplete. Check attachments or retry.
插件市场状态|Plugin marketplace state
插件构建记录|Plugin build records
插件正在检查或更新，完成后可调整入口显示。|Plugins are being checked or updated. Change entry visibility when complete.
插入 @ 上下文引用|Insert an @ context reference
搜索异常|Search issues
搜索待办|Search tasks
搜索标题或备注|Search titles or notes
搜索标题或备注…|Search titles or notes…
搜索结果|Search results
搜索统计项目|Search statistics projects
搜索诊断异常|Search diagnostic issues
搜索项目|Search projects
搜索项目、会话全文、待办…|Search projects, session full text, tasks…
搜索项目、会话和待办|Search projects, sessions and tasks
搜索项目、会话标题、待办…|Search projects, session titles, tasks…
搜索项目名称、目录、|Search project names, directories,
撤销|Undo
操作|Actions
操作失败|Operation failed
操作已完成|Operation completed
操作已完成，但刷新失败：|Operation completed, but refresh failed:
操作结果已保留，重新检查失败：{p0}|Results retained; recheck failed: {p0}
支持 Markdown：背景、实施步骤、验收标准…|Markdown supported: context, steps, acceptance criteria…
收藏|Favorites
收藏会话|Favorite session
收藏项目|Favorite project
数据备份|Data backup
数据恢复|Data recovery
数据统计|Statistics
文件对象|File objects
文件添加失败，草稿仍保留|Failed to add files. Your draft is retained.
新会话首条消息|First message in a new session
新备份成功后清理过期备份；回滚副本始终保留。|Expired backups are removed after a new backup succeeds. Rollback copies are always kept.
新建会话|New session
新建工作树|New worktree
新建工作树需要先选择基准分支。|Select a base branch before creating a worktree.
新建待办|New task
新项目已添加|New project added
无孤儿子代理|No orphaned subagents
无法开始备份|Could not start backup
无法检查版本|Could not check versions
无法读取备份状态|Could not read backup status
无法读取恢复状态|Could not read recovery status
无法读取最近备份|Could not read recent backups
无法读取模式与模型|Could not read modes and models
无空会话|No empty sessions
旧会话缓存|Legacy session cache
旧回收记录|Legacy recycle records
旧宠物数据|Legacy pet data
旧工作台数据|Legacy Workbase data
旧配置|Legacy configuration
时间范围|Time range
显示|Show
显示{p0}|Show {p0}
显示侧栏入口|Show sidebar entry
显示插件更新|Show plugin updates
显示输入框下方的最近会话入口。|Show recent sessions below the composer.
显示返回按钮|Show return button
显示项目列表 / 宫格与筛选、视图切换按钮。|Show project lists / grids, filters and view controls.
暂不支持项目迁移，原目录与历史会话已保留|Project migration is not supported yet. The original directory and sessions are retained.
暂无会话|No sessions yet
暂无可用项|No options available
暂无可用项目|No projects available
暂无可预览的正文|No content to preview
暂无备份文件，请先创建备份或检查备份目录。|No backup files. Create a backup or check the backup directory.
暂无已完成待办。|No completed tasks.
暂无归档项目|No archived projects
暂无待办，记录下一步或在对话中让 Agent 创建。|No tasks yet. Add your next step or ask an agent to create one.
暂无描述|No description
暂无收藏会话|No favorite sessions
暂无收藏项目|No favorite projects
暂无活动|No activity
暂无用户安装的插件|No user-installed plugins
暂无相关项目|No related projects
暂无符合条件的记录|No matching records
暂无迁移记录，宿主尚未提供迁移能力|No migration records. The host does not provide migration yet.
暂无运行中|Nothing running
暂无项目专属配置|No project-specific settings yet
暂时无法打开目录，请在项目详情复制路径后手动打开|Could not open the directory. Copy its path from project details and open it manually.
暂时无法打开目录，请复制路径后手动打开|Could not open the directory. Copy its path and open it manually.
暂时无法读取会话内容|Session content is temporarily unavailable
暂时无法读取项目，请重试。|Projects are temporarily unavailable. Retry.
更新|Update
更新于|Updated
更新全部（|Update all (
更新失败，已恢复 {p0}：{p1}|Update failed; restored {p0}: {p1}
更新失败，恢复旧版本也失败：{p0}|Update failed, and restoring the old version also failed: {p0}
更新失败：{p0}|Update failed: {p0}
更新完成|Update complete
更新完成，{p0} 个成功{p1}|Updates complete: {p0} succeeded{p1}
更新已安装插件|Update installed plugins
更新版本|Update version
更新结果|Update results
更新结果未确认：{p0}|Update result unconfirmed: {p0}
替换项目关联、待办与偏好，先保存回滚副本。|Replace project links, tasks and preferences after saving a rollback copy.
最近 14 天|Last 14 days
最近 30 天|Last 30 days
最近 7 天|Last 7 days
最近 {p0} 天|Last {p0} days
最近 {p0} 天更新的未归档会话。|Unarchived sessions updated in the last {p0} days.
最近会话|Recent sessions
最近会话样式|Recent session style
最近同步 {p0} · 点击刷新|Last synced {p0} · Click to refresh
最近备份与回滚副本|Recent backups and rollback copies
最近执行：|Last run:
最近操作失败|Last operation failed
最近活动|Last activity
最近活动 ·|Last activity ·
最近活动 · {p0}|Last activity · {p0}
有什么我能帮你的吗？|How can I help?
有未保存修改|Unsaved changes
未发现|Not found
未发现可清理的空会话|No empty sessions to clean up
未发现异常|No issues found
未发现普通冷会话列表缓存异常|No issues in inactive session list caches
未发现母会话已缺失的子代理残留|No orphaned subagent leftovers
未归档|Unarchived
未能读取插件，请重新检查|Could not read plugins. Check again.
未覆盖|Not covered
未设置|Not set
本地安装包|Local package
权限在「工作台设置 → 项目配置 → 全局配置」中统一调整。|Manage permissions in Workbase settings → Project settings → Global settings.
条| results
松开以添加文件或图片|Drop to add files or images
查看安装输出|View installation output
查看当前项目 Agent 权限|View this project's agent permissions
查看插件更新进度|View plugin update progress
查看覆盖明细（|View coverage (
查看进度|View progress
查看项目|View project
标准模式|Standard mode
PTC 模式|PTC mode
极简模式|Minimal mode
创造模式|Creative mode
处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。|Handle code, files and information for most tasks. The agent uses search, editing and terminal tools as needed.
包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。|Includes all standard mode capabilities, with support for batch tool calls and filtering, organizing, deduplicating, analyzing or summarizing results.
Agent 使用终端和图片读取工具，并支持上下文压缩，适合测试和对比其基础表现。|The agent uses terminal and image-reading tools with context compression, suitable for testing and comparing its baseline performance.
用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。|Customize DSH through conversation: ask the agent to write plugins, add features or interfaces, or combine tools and prompts to create your own modes.
标题|Title
标题、项目与待办结果仍可用。|Title, project and task results remain available.
标题与描述匹配|Title and description match
校验备份|Validate backup
桌面客户端草稿|Desktop client drafts
检查|Check
检查中|Checking
检查中…|Checking…
检查失败|Check failed
检查完成，{p0} 个插件可更新|Check complete: {p0} plugin updates available
检查完成，暂无可更新插件|Check complete: no updates available
检查或更新未全部完成|Some checks or updates are incomplete
检查未完成|Check incomplete
检查正常|Checks passed
检查目录、普通冷会话列表缓存、孤儿子代理及空会话；检查不读取正文。|Check directories, inactive session list caches, orphaned subagents and empty sessions without reading message bodies.
检查目标版本|Check target version
正在上传 {p0} 个附件…|Uploading {p0} attachments…
正在启动…|Starting…
正在处理…|Processing…
正在提交，请稍后添加文件|Submitting; add files later
正在更新|Updating
正在更新…|Updating…
正在更新插件（{p0}/{p1}）|Updating plugins ({p0}/{p1})
正在检查|Checking
正在检查…|Checking…
正在检查插件（{p0}/{p1}）|Checking plugins ({p0}/{p1})
正在检查新版本|Checking for updates
正在检索会话正文…|Searching session full text…
正在读取 Harness 项目…|Loading Harness projects…
正在读取会话内容…|Loading session content…
正在读取备份状态…|Loading backup status…
正在读取已安装插件…|Loading installed plugins…
正在读取恢复状态…|Loading recovery status…
正在读取项目|Loading projects
正在读取项目分支|Loading project branches
正文与描述匹配|Full text and description match
残留日志已知大小约|Known leftover log size: about
残留清理|Clean up leftovers
母会话 {p0}|Parent session {p0}
母会话缺失 · {p0}|Missing parent · {p0}
每个待办最多10个附件|Up to 10 attachments per task
每个附件不能超过10MiB|Each attachment must not exceed 10 MiB
每条消息最多添加 {p0} 张图片|Up to {p0} images per message
每次打开应用时检查新版本，有更新就在后台安装；保存后下次启动生效。|Check for updates on launch and install them in the background. Applies on the next launch.
永久|Forever
永久删除|Delete permanently
永久删除「|Permanently delete “
永久删除会话|Permanently delete session
永久删除会话？|Permanently delete this session?
永久清理|Clean up permanently
汇总项目中的待处理事项，点击直接查看详情。|Pending tasks across projects. Click to view details.
没有匹配的异常|No matching issues
没有匹配的项目|No matching projects
没有匹配结果|No matches
没有匹配项目的记录|No records in matching projects
没有符合条件的待办。|No matching tasks.
活跃|Active
浅色|Light
深色|Dark
添加上下文|Add context
添加待办|Add task
添加待办附件|Add task attachments
添加菜单加载失败|Attachment menu failed to load
添加附件即上传，或拖入 / 粘贴文件|Attachments upload immediately. You can also drop or paste files.
添加项目|Add project
清爽主题|Fresh
清理孤儿子代理|Clean up orphaned subagents
清理残留|Clean up leftovers
清理残留（|Clean up leftovers (
清空搜索|Clear search
清空输入|Clear input
温暖阅读|Warm reading
点击选择备份文件|Click to select a backup file
状态|Status
用于新建项目，不改变已有项目目录。可输入绝对路径或点击文件夹按钮选择目录。|Used for new projects without changing existing directories. Enter an absolute path or use the folder button.
用户|User
用户技能|User skills
白底、冷灰与紫色强调，深色采用柔和紫晶色。|White, cool gray and purple accents; soft amethyst tones in dark mode.
皮肤状态|Skin state
皮肤资源|Skin resources
目录|Directory
目录、列表缓存、孤儿子代理及空会话检查均已完成|Directory, list cache, orphaned subagent and empty session checks are complete
目录不可用|Directory unavailable
目录不可用：|Directory unavailable:
目录可用|Directory available
目录名称|Directory name
目录异常|Directory issue
目录无法访问|Directory inaccessible
目录检查|Directory check
目录正常|Directories healthy
目录路径|Directory path
目录选择失败，请重试或输入绝对路径|Directory selection failed. Retry or enter an absolute path.
目标会话未接受附件，原草稿和附件仍保留，请重试|The target session rejected attachments. Your original draft and attachments are retained. Retry.
目标会话未接受附件，请重试|The target session rejected attachments. Retry.
目标会话正在提交，草稿交接失败，请重试|The target session is submitting. Draft handoff failed; retry.
确认归档|Confirm archive
确认移除|Confirm removal
移除「|Remove “
移除附件|Remove attachment
移除附件 {p0}|Remove attachment {p0}
移除附件：{p0}|Remove attachment: {p0}
移除项目|Remove project
移除项目？|Remove this project?
空会话|Empty sessions
空会话删除|Empty session deletion
空会话尚未检查，请重新检查|Empty sessions have not been checked; check again
立即备份|Back up now
等待检查|Waiting for check
等待重试|Waiting for retry
筛选|Filter
筛选优先级|Filter priority
简单实用的组件。|Simple, useful components.
管理数据备份、恢复与执行状态。|Manage backups, recovery and execution status.
紫晶工作台|Amethyst
纸色与棕色，柔和的阅读式字体。|Paper tones, brown accents and gentle reading typography.
终端状态|Terminal state
结果未确认|Result unconfirmed
统一配置启动页面和工作台入口。|Configure the startup page and Workbase entry points.
统计分类|Statistics categories
统计分组内容|Statistics group content
统计区域开启时使用按钮样式，与统计卡共同展示。|Uses buttons alongside stat cards while statistics are enabled.
统计卡可单独隐藏，点击后查看概览对应分类。|Hide each card individually. Click a card to open its overview category.
统计卡片|Stat cards
统计时间范围|Statistics time range
统计项目分组|Statistics project groups
缓存|Cache
缓存重建|Cache rebuild
编辑|Edit
置顶会话|Pin session
置顶项目|Pin project
能力不可用|Capability unavailable
脚注|Footnotes
自定义安装源|Custom registry
自定义工作台入口名称，最多 30 字。|Custom Workbase entry label, up to 30 characters.
观察副本|Observational copy
记下一步，按 Enter 添加…|Write your next step; Enter to add…
设置分类|Settings categories
设置已保存|Settings saved
诊断|Diagnostics
诊断分组内容|Diagnostic group content
诊断类型分组|Diagnostic types
语音模型|Voice model
请先停止运行中的会话，再永久删除|Stop running sessions before permanent deletion
请先在工作台设置 → 项目配置 → 全局配置中设置默认项目根目录。|Set a default project root in Workbase settings → Project settings → Global settings first.
请先填写待办标题，结束标题编辑后附件会自动上传。|Enter a task title first. Attachments upload after title editing ends.
请先选择可用项目|Select an available project first
请在全部更新结束后重启 Harness，使更新生效。|Restart Harness after all updates finish to apply them.
请填写侧栏入口名称。|Enter a sidebar label.
请填写待办标题|Enter a task title
请填写通用配置中的侧栏入口名称|Enter a sidebar label in general settings
请尝试其他关键词或清空搜索|Try different keywords or clear the search
读取中…|Loading…
读取分支…|Loading branches…
读取失败|Read failed
读取模型…|Loading models…
读取模式…|Loading modes…
调整会话和待办比例|Adjust session and task proportions
跟随 DSH 主题|Follow DSH theme
跨项目搜索 ·|Search across projects ·
跨项目的未完成待办。|Pending tasks across projects.
跳过更新|Skip update
输入任务并选择项目，直接开始新会话。|Enter a task and select a project to start a session.
输入会话已切换，草稿仍保留|Input session changed. Your draft is retained.
输入会话已切换，请重新添加文件|Input session changed. Add the files again.
输入或粘贴路径；点击右侧图标或按 Alt + ↓ 选择|Enter or paste a path; click the icon or press Alt + ↓ to select
输入或粘贴项目路径|Enter or paste a project path
输入文件夹的绝对路径|Enter an absolute folder path
输入服务正在加载，暂时无法添加文件|Input service is loading. Files cannot be added yet.
输入服务正在加载，请稍后重试|Input service is loading. Retry later.
迁移记录|Migration history
运行中|Running
运行统计|Running statistics
运行配置与插件|Runtime configuration and plugins
近期会话|Recent sessions
近期活跃|Recently active
返回工作台|Return to Workbase
返回添加待办，清除筛选（Esc）|Return to adding tasks and clear filters (Esc)
这里还没有活跃项目|No active projects yet
远端设备|Remote devices
连接中断，已停止后续更新。请刷新插件页核对实际版本：{p0}|Connection interrupted; remaining updates stopped. Refresh the plugin page to verify installed versions: {p0}
选择{p0}|Select {p0}
选择后即时预览；保存保留，取消恢复。|Preview instantly. Save to keep; cancel to revert.
选择基准分支|Select base branch
选择工作台主题，调整首页模块与统计卡片。|Choose a theme and configure home modules and stat cards.
选择最近备份与回滚副本|Select a recent backup or rollback copy
选择统计项目|Select statistics project
选择诊断类型|Select diagnostic type
通用配置|General
重命名|Rename
重命名会话|Rename session
重命名项目|Rename project
重建列表缓存|Rebuild list cache
重建缓存（|Rebuild cache (
重新打开：{p0}|Reopen: {p0}
重新检查|Check again
重新检查失败|Recheck failed
重新读取|Reload
重试|Retry
重试上传|Retry upload
重试全文检索|Retry full-text search
重试失败项（|Retry failed (
重试首条消息|Retry first message
附件|Attachments
附件上传失败（{p0}）|Attachment upload failed ({p0})
附件仍在上传，请稍后发送|Attachments are still uploading. Send later.
附件引用校验|Attachment reference validation
附件请求缓存|Attachment request cache
附件读取失败|Attachment read failed
附件读取失败（{p0}）|Attachment read failed ({p0})
附件路径|Attachment paths
隐藏模块后仍可使用顶部搜索与设置。|Search and settings remain available when modules are hidden.
集中管理项目默认值与 Agent 待办权限。|Manage project defaults and agent task permissions.
需重启|Restart required
非 Git 项目|Non-Git project
项目|Projects
项目与会话关联|Project and session links
项目内容|Project content
项目列表|Project list
项目名称|Project name
项目名称始终显示。列表中的目录随项目名称展示。|Project names are always shown. In list view, directories appear with the name.
项目名称已更新|Project renamed
项目导航|Project navigation
项目已存在，原有数据已保留|Project already exists. Existing data is retained.
项目已归档 · 只读|Project archived · Read only
项目已归档，恢复后可修复|Project archived; restore to repair
项目已归档，恢复后可继续编辑|Project archived; restore to edit
项目已归档，恢复后可记录待办|Project archived; restore to add tasks
项目已归档：业务只读，恢复后可继续编辑。会话保持归档时的状态，不能单独归档、重命名或新建。|Archived project: read only. Restore to edit. Sessions keep their archive-time state and cannot be archived, renamed or created individually.
项目已恢复|Project restored
项目已添加|Project added
项目已移除，本地目录与历史数据已保留|Project removed. Its directory and history are retained.
项目已移除，请更新搜索结果|Project removed; refresh search results
项目待办|Project tasks
项目总览|Project overview
项目技能|Project skills
项目技能 {p0}|Project skills {p0}
项目更多操作|More project actions
项目权限已更新|Project permissions updated
项目概览|Project overview
项目目录可用性检查。|Check project directory availability.
项目范围|Project scope
项目诊断|Project diagnostics
项目路径|Project path
项目迁移|Project migration
项目配置|Project settings
项目配置分类|Project settings sections
项）| items)
顺序|From top,
顺序从顶部数，倒序从底部数。|Count from the top or from the bottom.
预览|Preview
预览恢复|Preview recovery
预览读取失败|Preview failed to load
首次备份时生成，恢复自动使用当前宿主密钥。密钥不在备份文件内，请单独妥善保管。|Generated on the first backup. Recovery uses the current host key automatically. The key is not included in backups; store it separately.
首页模块|Home modules
首页模块已隐藏，可通过右上角「工作台设置」恢复显示，或使用 Header 搜索打开项目和会话。|Home modules are hidden. Restore them in Workbase settings, or use header search to open projects and sessions.
默认安装源|Default registry
默认项目根目录|Default project root
，{p0} 个失败|, {p0} failed
，另有 {p0} 项大小未知|, plus {p0} items of unknown size
，并修改完成状态| and change completion status
；不包含附件及其他目录占用。|; excluding attachments and other directories.
；旧项目状态修改权限仍关闭，保存全局配置后统一生效|; legacy project status changes remain disabled until global settings are saved
宿主未提供会话缓存检测能力|The host does not provide session cache checks
宿主未提供孤儿子代理检测能力|The host does not provide orphaned subagent checks
宿主未提供空会话检测能力|The host does not provide empty session checks
高|High
中|Medium
低|Low
高优先级|High priority
中优先级|Medium priority
低优先级|Low priority
缺少项目标识|Missing project identifier
项目已归档，业务只读；恢复后可继续编辑|Project archived and read only. Restore to edit.
当前宿主未启用备份服务|Backup service is not enabled
当前宿主未启用恢复服务|Recovery service is not enabled
预览后工作台数据已变化，请重新预览|Workbase data changed after the preview. Preview again.
恢复写入及自动回滚均失败，请使用保留的加密回滚副本|Recovery and automatic rollback both failed. Use the encrypted rollback copy.
项目目录不可用|Project directory unavailable
会话不属于当前项目|Session does not belong to this project
宿主不支持选择模型|The host does not support model selection
项目目录已改变，请先处理绑定|Project directory changed. Resolve its binding first.
项目绑定不可用，请刷新或处理绑定冲突|Project binding unavailable. Refresh or resolve the conflict.
Agent 只能操作当前项目|Agents can only access the current project
宿主未提供诊断修复能力|The host does not provide diagnostic repair
诊断结果已变化，请重新检测后操作|Diagnostic results changed. Check again before continuing.
待办不存在|Task does not exist
待办已经变化，请刷新后重试|Task changed. Refresh and retry.
当前项目未允许 Agent 修改状态|Agents cannot change status in this project
已关闭 Agent 管理待办，仅允许查询|Agent task management is off; read access only
Agent 不允许撤销删除|Agents cannot undo deletion
撤销已失效，请重新记录待办|Undo expired. Create the task again.
待办已恢复，请刷新|Task restored. Refresh.
当前项目绑定不可用|Current project binding unavailable
宿主未提供图片附件服务|The host does not provide image attachments
图片应小于等于10MiB|Images must be no larger than 10 MiB
图片不存在|Image does not exist
宿主未提供文件附件服务|The host does not provide file attachments
附件不存在|Attachment does not exist
项目名称应为1至200个字符|Project names must contain 1–200 characters
绑定关系已经变化，请刷新|Binding changed. Refresh.
原项目仍注册在宿主中，不能覆盖绑定|The original project is still registered. Its binding cannot be overwritten.
当前宿主不支持移除项目|The host does not support project removal
项目仍有运行中会话，请先停止运行|Stop running sessions in this project first
当前宿主不支持添加项目|The host does not support adding projects
当前宿主不支持创建目录|The host does not support directory creation
该目录重新注册，请选择恢复原项目或作为新项目|This directory is being registered again. Restore the original project or add it as new.
当前宿主不支持会话全文检索|The host does not support full-text session search
当前宿主不提供模式和模型目录|The host does not provide mode and model catalogs
当前宿主不支持创建会话|The host does not support session creation
项目目录不可用，请先修复目录|Project directory unavailable. Repair the directory first.
当前宿主不支持读取 Git 分支|The host does not support reading Git branches
当前宿主不支持消息提交|The host does not support message submission
当前宿主不支持会话重命名|The host does not support session renaming
当前宿主未启用会话删除能力|Session deletion is not enabled in the host
会话已不存在，请刷新|Session no longer exists. Refresh.
当前宿主不支持打开目录|The host does not support opening directories
当前宿主不支持会话预览|The host does not support session previews
项目不存在|Project does not exist
请选择备份文件并预览|Select a backup file and preview it
上次恢复流程随宿主退出中断，请重新预览；已保留的回滚副本仍可使用|The previous recovery was interrupted by host shutdown. Preview again; retained rollback copies remain usable.
正在解密并校验恢复文件|Decrypting and validating recovery files
文件和摘要已校验，请确认恢复范围|Files and checksums validated. Confirm recovery scope.
恢复预览已过期，请重新选择备份|Recovery preview expired. Select a backup again.
恢复预览失败|Recovery preview failed
正在恢复，请勿退出宿主|Recovery in progress. Keep the host open.
恢复前的工作台存储副本|Copy of Workbase storage before recovery
工作台状态已恢复，替换前的数据已保留为加密回滚副本|Workbase restored. Previous data is retained as an encrypted rollback copy.
备份文件已恢复到独立目录；会话、附件、数据库和插件配置尚未激活到当前宿主|Backup recovered to a separate directory. Sessions, attachments, databases and plugin settings are not activated in the current host.
恢复失败|Recovery failed
尚未执行备份|No backup run yet
上次任务随宿主退出中断，未发布的临时产物不能用于恢复|The previous task was interrupted by host shutdown. Unpublished temporary files cannot be used for recovery.
等待宿主空闲后自动备份|Waiting for the host to be idle before automatic backup
正在准备备份|Preparing backup
会话、附件或插件操作进行中，自动备份已延后|A session, attachment or plugin operation is active. Automatic backup is deferred.
正在导出数据|Exporting data
正在导出 {p0}|Exporting {p0}
正式存储 API 的结构化副本；不同数据源不共享全局快照|Structured copy from the official storage API. Data sources do not share a global snapshot.
该范围未在当前根目录发现|This scope was not found in the current root directory
文件观察副本；{p0} 个 SQLite 在线快照；{p1} 项运行锁、依赖目录或旁路文件未归档；链接仅记录、不跟随|Observational file copy; {p0} live SQLite snapshots; {p1} locks, dependency directories or sidecar files excluded; links recorded without following
未提供在线导出能力|Online export is unavailable
正在加密归档|Encrypting archive
正在解密回读并校验摘要|Decrypting for readback and checksum validation
备份完成（部分覆盖），请查看范围明细；不是全局一致恢复点|Backup complete with partial coverage. See scope details; this is not a globally consistent recovery point.
备份完成，各范围已校验；不是全局一致恢复点|Backup complete with all scopes validated; this is not a globally consistent recovery point.
宿主退出，备份已中断|Host shut down; backup interrupted
备份失败|Backup failed
目录已创建：{p0}。注册失败：{p1}。请切换「打开已有项目」重试此路径，不必再次创建文件夹。|Directory created: {p0}. Registration failed: {p1}. Choose “Open existing project” and retry this path without creating another folder.
恢复任务进行中或宿主已停止|Recovery is in progress or the host has stopped
宿主已停止|The host has stopped
恢复预览已失效|Recovery preview is no longer valid
恢复预览已失效，请重新预览|Recovery preview is no longer valid. Preview again.
当前无法恢复工作台，请查看预览中的原因|Workbase cannot be restored now. See the reasons in the preview.
请选择恢复文件的保存目录|Choose a destination for recovered files
恢复暂存内容在预览后发生变化，请重新预览|Staged recovery files changed after the preview. Preview again.
恢复清单在预览后发生变化，请重新预览|Recovery manifest changed after the preview. Preview again.
目录恢复后的文件摘要不一致|Recovered file checksums do not match
备份控制目录不允许符号链接|The backup control directory must not be a symbolic link
备份管理器已停止|The backup manager has stopped
恢复任务进行中，请稍后备份|Recovery is in progress. Back up later.
工作台已重新加载，未开始的检查已停止。请重新检查。|Workbase reloaded. Pending checks were stopped. Check again.
检查结果未确认，请重新检查。|The check result is unconfirmed. Check again.
工作台已重新加载，未开始的更新已停止。请重新检查后继续。|Workbase reloaded. Pending updates were stopped. Check again to continue.
备份或恢复任务进行中|A backup or recovery is in progress
备份密钥权限必须为 0600|Backup key permissions must be 0600
请先配置备份目录的绝对路径|Configure an absolute backup directory path first
无效的备份范围标识|Invalid backup scope identifier
；已清理 {p0} 份过期备份|; removed {p0} expired backups
；{p0} 份旧备份无法校验或清理，已保留|; retained {p0} old backups that could not be validated or removed
；过期备份清理未完成，旧文件已保留|; expired backup cleanup incomplete; old files retained
；最近结果持久化失败，请保留本次保存位置|; failed to persist the result; keep this saved location
；最近结果保存失败，请保留显示的路径|; failed to save the latest result; keep the displayed path
`.trim().split('\n').map(line => {
  const divider = line.indexOf('|');
  return [line.slice(0, divider), line.slice(divider + 1)];
}));
