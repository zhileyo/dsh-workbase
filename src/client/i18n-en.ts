/** 中文文案作为稳定查找键；动态内容通过命名参数插入，不参与翻译。 */
export const english: Record<string, string> = Object.fromEntries(`
项目迁移 · 预览|Project migration · Preview
待处理待办|Pending to-dos
已完成待办|Completed to-dos
已撤销|Reverted
已到期|Expired
当前目录|Current directory
目标目录|Target directory
预览迁移|Preview migration
返回修改|Back to edit
确认迁移|Confirm migration
当前项目：{title}|Current project: {title}
迁移到项目|Move to project
选择目标项目|Select target project
项目已归档|Project archived
迁出内容|Contents to migrate
目标现有内容|Existing target contents
选择目标项目后显示迁移预览。|Select a target project to see the migration preview.
暂无可迁入的项目。|No available target projects.
正在检查迁移内容…|Checking migration contents…
迁移预览的项目关联不一致，请重新选择|The preview project bindings do not match. Select again.
迁移结果尚未确认，请查看迁移记录后再操作|The migration result is unconfirmed. Check migration history before continuing.
迁移已完成，刷新失败，请重新打开工作台|Migration completed, but refresh failed. Reopen Workbase.
迁移失败，请重试|Migration failed. Try again.
请选择其他项目作为迁移目标|Select another project as the migration target.
目标项目不存在或关联已失效，请重新选择|The target project does not exist or its binding is invalid. Select again.
目标项目目录关联存在冲突，请重新选择|The target directory has conflicting project bindings. Select again.
项目迁移已完成|Project migration completed
项目迁移已撤销|Project migration reverted
项目已迁入其他项目，请在目标项目查看迁移记录|This project was migrated. View migration history in the target project.
宿主未提供工作区移除与恢复登记能力|The host cannot remove and restore workspace registrations.
迁移已完成，但源工作区关联已变化，无法移除登记|Migration completed, but the source workspace binding changed. Its registration cannot be removed.
迁移已完成，但宿主未提供工作区移除能力|Migration completed, but the host cannot remove workspace registrations.
迁移已完成，运行中的会话结束后才能移除源工作区登记|Migration completed. Wait for running sessions to finish before removing the source workspace registration.
迁移已完成，但源工作区出现新增会话，请先核对归属再移除登记|Migration completed, but the source workspace has new sessions. Check their ownership before removing its registration.
迁移已完成，但源工作区登记移除失败：{reason}|Migration completed, but removal of the source workspace registration failed: {reason}
源目录有多个工作区登记，无法撤销|The source directory has multiple workspace registrations. Undo is unavailable.
源目录已关联其他项目，无法撤销|The source directory belongs to another project. Undo is unavailable.
宿主未提供工作区恢复登记能力|The host cannot restore workspace registrations.
恢复的源工作区登记无法核验|The restored source workspace registration could not be verified.
撤销未完成，本次恢复的登记清理失败：{reason}|Undo did not complete, and removal of the restored registration failed: {reason}
源项目已迁入其他项目|The source project was migrated into another project
目标项目已迁入其他项目|The target project was migrated into another project
撤销结果尚未确认，请查看迁移记录后再操作|The undo result is unconfirmed. Check migration history before continuing.
迁移已撤销，刷新失败，请重新打开工作台|Migration reverted, but refresh failed. Reopen Workbase.
撤销失败，请重试|Undo failed. Try again.
本批迁入内容及后续编辑回到源项目；目标原有和新增内容保留，已删除内容不恢复。|This batch and its later edits return to the source. Existing and new target contents stay; deleted contents are not restored.
预览后宿主项目或会话已变化，请重新预览|Host projects or sessions changed after preview. Preview again.
迁移会话归属重复|Duplicate migrated session ownership
迁移会话目标关联已失效|The migrated session target binding is invalid
迁移存储回滚失败，请重启后核对迁移记录，勿重复操作|Migration storage rollback failed. Restart and inspect migration history before retrying.
迁移存储状态未知，请重启后核对迁移记录|Migration storage state is unknown. Restart and inspect migration history.
迁移项目关联已变化，无法撤销|Migration project bindings changed. Undo is unavailable.
迁移会话归属已变化，无法撤销|Migrated session ownership changed. Undo is unavailable.
目标项目不存在|Target project does not exist
请选择不同的目标项目|Select a different target project
迁移预览|Migration preview
当前项目|Current project
迁移内容对照|Migration contents comparison
内容|Contents
迁出|To migrate
目标现有|Existing target
迁移后|After migration
源项目目录已不存在；保留的会话与待办仍参与预览。|The source directory no longer exists. Retained sessions and to-dos remain in the preview.
源项目目录已不存在，请恢复原目录后再撤销迁移|The source directory no longer exists. Restore it before undoing the migration.
撤销迁移|Undo migration
迁移记录 · 详情|Migration history · Details
迁移前源项目状态|Source project before migration
迁移的会话|Migrated sessions
迁移的待办|Migrated to-dos
活跃会话|Active sessions
迁入已有项目|Merge into an existing project
更新原项目目录|Update project directory
源项目：{title}|Source project: {title}
目标项目：{title}|Target project: {title}
保留目标项目名称、目录及设置；源项目设置与实体来源须随迁移保存。|Keep the target project's name, directory and settings; retain source settings and entity provenance with the migration.
保留项目身份、名称、全部会话、待办及设置。|Keep the project identity, name, all sessions, to-dos and settings.
不移动代码文件，不改写历史会话的原执行目录与日志。成功后 72 小时内可撤销。|Code files and historical session working directories and logs stay unchanged. Undo is available for 72 hours after success.
当前宿主未提供安全迁移事务，暂不能执行迁移|The host does not provide safe migration transactions. Migration is unavailable.
源项目或目标项目仍在迁移撤销期内。请先撤销相关迁移，或等待到期后重试：|The source or target project is still within a migration undo window. Undo the related migration or wait for it to expire before retrying:
{source} → {target}（撤销截止：{time}）|{source} → {target} (undo deadline: {time})
正在读取迁移记录…|Loading migration history…
暂无迁移记录。预览不会生成记录。|No migration history. Previews do not create records.
迁移记录读取失败|Failed to load migration history
迁移预览失败|Migration preview failed
为「{title}」选择目标目录，预览项目身份、会话、待办及设置保留规则。|Choose a target directory for “{title}” to preview project identities, sessions, to-dos and retained settings.
返回记录|Back to history
已到期，仅可查看|Expired, read only
完成时间：{time}|Completed: {time}
撤销截止：{time}|Undo deadline: {time}
请输入目标目录的绝对路径|Enter an absolute target directory path
目标目录不可用或不可写|The target directory is unavailable or not writable
源项目已归档|The source project is archived
目标项目已归档|The target project is archived
源项目已移除或关联失效|The source project was removed or its binding is invalid
目标项目已移除或关联失效|The target project was removed or its binding is invalid
源项目目录不可用或关联失效|The source directory is unavailable or its binding is invalid
目标项目目录不可用或关联失效|The target directory is unavailable or its binding is invalid
目标目录与原目录相同|The target and source directories are the same
目标目录存在未解决的项目关联或占用|The target directory has unresolved project bindings or is occupied
源项目身份存在冲突|The source project identity conflicts
目标项目身份存在冲突|The target project identity conflicts
项目存在运行中的会话|The project has running sessions
会话身份或状态无法核实|Session identities or states could not be verified
会话归属存在冲突|Session ownership conflicts
待办身份存在冲突|To-do identities conflict
项目存在未结束的可撤销迁移|The project has a migration still within its undo window
迁移预览已失效，请重新预览|The migration preview expired. Preview again.
预览后工作台数据已变化，请重新预览|Workbase data changed after the preview. Preview again.
迁移记录不存在|Migration record not found
迁移已撤销或超过撤销期限|The migration was reverted or its undo deadline has passed
私人订制|Personalization
私人订制分类|Personalization categories
伙伴档案|Companion profile
用户档案|User profile
行为准则|Behavior guidelines
记忆进化|Long-term memory
设置伙伴身份、用户信息、行为准则和长期记忆，保存后用于所有会话的后续请求。|Set companion identity, user information, behavior guidelines and long-term memory. Saved content applies to future requests in all sessions.
正在处理档案…|Processing profiles…
重新读取档案（保留修改草稿）|Reload profiles (keep edited drafts)
提示词服务未就绪；可保存文件，暂不用于模型。|The prompt service is unavailable. Files can be saved but do not yet apply to the model.
私人订制尚未就绪|Personalization is not ready.
档案读取失败|Failed to read profiles.
档案保存失败|Failed to save profiles.
档案文件过大|The profile file is too large.
档案已在外部修改，请重新读取|The profile was changed externally. Reload it.
档案已在外部修改，请重新读取后保存|The profile was changed externally. Reload it before saving.
档案已在外部修改，保存已停止|The profile was changed externally. Saving has stopped.
档案必须为普通文件，不能使用链接|Profiles must be regular files, not links.
档案必须为普通文本文件|Profiles must be regular text files.
档案目录必须为普通目录，不能使用链接|The profile directory must be a regular directory, not a link.
档案目录必须为绝对路径|The profile directory must be an absolute path.
官方文件服务无法访问档案目录|The official file service cannot access the profile directory.
语音播报|Speech output
通用组件|General components
其他组件分类|Other component categories
保存后启用会话播报；关闭时停止播放，保留配置与密钥。|Save to enable conversation speech. Disabling stops playback and keeps settings and credentials.
停止播报|Stop speech
重播回复|Replay reply
启用自动播报|Enable automatic speech
关闭自动播报|Disable automatic speech
自动播报回复|Read replies aloud
播报服务|Speech service
OpenAI TTS|OpenAI TTS
服务地址（完整 HTTPS 接口）|Service URL (complete HTTPS endpoint)
语音模型|Speech model
音色|Voice
语速（0.25–4）|Speed (0.25–4)
服务密钥|API key
技能提交结果无法确认，禁止继续操作；请重新初始化以核对状态与事务日志|The skill commit could not be confirmed. Reinitialize to verify the state and transaction journal before making changes.
认证请求头与目标请求头冲突，请先处理其他同名请求头|The authentication header conflicts with the destination header. Resolve duplicate headers before saving.
工作台存储状态未知，请重启后核对存储和事务记录|The workbase storage state is unknown. Restart and verify storage and transaction records.
恢复持久化校验失败|The restored state could not be verified as persisted.
恢复回滚校验失败|The restore rollback could not be verified.
工作台已在其他窗口修改或恢复，请重新打开设置|Workbase was changed or restored in another window. Reopen settings.
设置任务正在处理，请稍后重试|A settings task is in progress. Try again later.
宿主未提供会话删除生命周期见证|The host does not provide session lifecycle evidence for deletion.
会话列表已消失，但日志仍存在；删除未确认，请重新检测|The session is missing from the list, but its log still exists. Recheck before confirming deletion.
会话已删除，但删除回执恢复失败，存储状态未知；请重启核对|The session was deleted, but its deletion receipt could not be restored. Restart and verify storage.
设置已变化，请重新保存|Settings have changed. Review them and save again.
原生输入的项目关联不可用|The project binding for native input is unavailable.
提交保护需要会话标识|A session ID is required to protect a submission.
原生输入仍在提交或结果未确认，请等待完成后再归档|Native input is still submitting or its result is unconfirmed. Wait for completion before archiving.
原生会话不属于当前项目|The native session does not belong to this project.
重试会话不属于当前项目|The session being retried does not belong to this project.
重试会话已不存在，请核对原创建结果|The session being retried no longer exists. Verify the original creation result.
项目已归档或不可用，请刷新后重试|The project is archived or unavailable. Refresh before retrying.
级联会话项目归属存在冲突|The project ownership of a descendant session is ambiguous.
删除回执的会话归属不属于当前项目|The deletion receipt belongs to a session in another project.
删除回执的会话生命周期已变化，请核对后重试|The session lifecycle has changed since the deletion receipt was saved. Verify it before retrying.
删除回执保存无法确认|The deletion receipt could not be confirmed as saved.
迁移规则项目关联无法核实|The project binding for migration rules could not be verified.
当前宿主不支持迁移规则文件|The host does not support migration rule files.
项目规则关联不可用|The project binding for rules is unavailable.
迁移源规则目录已关联其他工作区|The source rules directory is now bound to another workspace.
待确认移除项目的归属已变化|The ownership of the project awaiting removal confirmation has changed.
原项目登记仍在，已确认未移除；请重新操作|The original project is still registered and was not removed. Retry the operation.
移除项目的宿主归属已变化|The host ownership of the project being removed has changed.
宿主未确认项目移除|The host did not confirm project removal.
已保存密钥；留空保留|Key saved; leave blank to keep it
未配置密钥；无认证服务可留空|No key configured; leave blank for unauthenticated services
DeepSeek TTS|DeepSeek TTS
过滤 Markdown|Filter Markdown
过滤标记、链接和代码块，保留可朗读正文。|Filter markup, links and code blocks, keeping readable text.
填写 DeepSeek API Key|Enter your DeepSeek API Key
请配置 DeepSeek API Key 后启用官方播报|Set a DeepSeek API Key before enabling DeepSeek speech.
官方语音服务地址必须为 DeepSeek TTS 接口|DeepSeek speech requires the official DeepSeek TTS endpoint.
官方音色仅支持 stella 或 tide|DeepSeek voices are limited to stella and tide.
回复没有可朗读内容|The reply has no readable text.
回复超过官方 10000 计费字符限制，未自动播报|The reply exceeds the 10000 billable character limit and was skipped.
官方播报请求超过 64KiB 限制|The DeepSeek speech request exceeds the 64KiB limit.
默认关闭；会话顶部喇叭切换自动播报，回复下方喇叭可手动重播。|Off by default. The header speaker toggles automatic speech; the speaker below a reply replays it manually.
正在读取播报配置…|Loading speech settings…
放弃草稿并重新读取播报配置|Discard draft and reload speech settings
官方凭据存储不可用，暂不能保存播报配置|The official credential store is unavailable. Speech settings cannot be saved.
语音播报尚未就绪|Speech output is not ready.
官方流式播报未启用|Official streaming speech is disabled.
DeepSeek API Key 格式不合法|The DeepSeek API key format is invalid.
流式播报连接失败|Failed to connect to streaming speech.
流式播报连接超时|The streaming speech connection timed out.
流式播报超过时长限制|Streaming speech exceeded the duration limit.
流式播报等待超时|Streaming speech timed out while waiting.
流式播报缓冲超过上限|The streaming speech buffer exceeded its limit.
流式播报音频超过上限|Streaming speech audio exceeded its limit.
流式语音合成失败|Streaming speech synthesis failed.
流式播报返回无效数据|Streaming speech returned invalid data.
流式播报连接提前中断|The streaming speech connection closed early.
流式播报连接中断|The streaming speech connection was interrupted.
流式播报连接不可用|The streaming speech connection is unavailable.
流式播报文字序号不连续|Streaming speech text arrived out of order.
回复超过官方 10000 计费字符或 64KiB 限制|The reply exceeded the official 10000 billable character or 64KiB limit.
回复超过官方 10000 计费字符限制，已停止播报|The reply exceeded the official 10000 billable character limit. Speech has stopped.
回复过长，已停止播报|The reply is too long. Speech has stopped.
流式播报请求失败|The streaming speech request failed.
流式播报请求失败，请检查播报配置|The streaming speech request failed. Check your speech settings.
语音播报未启用|Speech output is disabled.
播报配置读取失败|Failed to load speech settings.
播报配置保存失败|Failed to save speech settings.
播报配置已在外部修改，请重新读取后保存|Speech settings changed externally. Reload before saving.
请检查播报地址、模型、音色与语速|Check the speech endpoint, model, voice and speed.
播报地址必须为不含凭据和查询参数的 HTTPS 地址|Use an HTTPS endpoint without credentials or query parameters.
请填写播报服务地址|Enter the speech service endpoint.
正在合成语音，请稍后重试|Speech synthesis is in progress. Try again shortly.
播报服务请求失败（HTTP {p0}）|Speech service request failed (HTTP {p0}).
播报服务返回的音频格式或大小不受支持|The returned audio format or size is unsupported.
播报服务返回空音频|The speech service returned empty audio.
播报音频超过大小上限|The audio exceeds the size limit.
播报已停止|Speech stopped.
语音合成失败或超时，请检查播报服务配置|Speech synthesis failed or timed out. Check your service settings.
回复过长，未自动播报|Reply too long for automatic speech.
播报队列已满，已跳过新回复|Speech queue is full. The new reply was skipped.
音频播放失败，请重播或检查设备|Audio playback failed. Replay or check your device.
自动播放受阻，请点击重播|Automatic playback was blocked. Click Replay reply.
语音播报失败|Speech output failed.
即时预览，保存后生效。|Preview immediately; save to apply.
统计开启时固定为按钮，关闭后恢复所选样式。|Statistics use buttons; turning statistics off restores your chosen style.
仅用于新建项目，不改变已有项目目录。|Used only for new projects; existing project directories stay unchanged.
以下配置保存后用于新建项目。|These settings apply to new projects after saving.
名称与 Harness 同步，不改变本地文件夹名称和路径。|The name syncs with Harness; the local folder name and path stay unchanged.
关联文件（随技能保存）|Related files (saved with the skill)
外部技能正文只读，启停保留原文件。|External skill content is read-only; toggling preserves the original files.
正文与启停应用于全部所选范围。|Content and enablement apply to all selected scopes.
修改后点击保存设置。|Click Save settings to apply changes.
修改自动保存。|Changes save automatically.
目录随项目名称展示。|The directory appears with the project name.
最大 2 MB，不覆盖已有订阅。|Maximum 2 MB; existing subscriptions are preserved.
保存后进行授权，令牌由官方凭据库保管。|Authorize after saving; tokens are kept in the official credential store.
官方授权服务不可用，暂不可授权。|The official authorization service is unavailable; authorization is currently disabled.
密钥留空保留已有值，清除请在详情中操作。|Leave the key blank to keep its current value; clear it in details.
同名连接保留；请求头和环境变量存入官方凭据库，预览与导出不含敏感原文。|Connections with matching names are preserved. Headers and environment variables go to the official credential store; previews and exports omit sensitive values.
连接不可用，工具开关暂不可用。|The connection is unavailable; tool toggles are disabled.
请求内容超过传输上限，请缩短内容后重试|Request exceeds the transfer limit. Shorten the content and retry.
当前项目关联无法安全保留：{p0}|Current project association cannot be safely preserved: {p0}
当前规则项目关联无法核实：{p0}|Current rule project association cannot be verified: {p0}
恢复项目关联映射后标识冲突|Project IDs conflict after restore association mapping.
待补齐项目的宿主登记已变化，请先处理绑定冲突|The pending project's host registration has changed. Resolve the binding conflict first.
添加已有项目补齐失败，待重试记录保存失败；宿主登记和已有内容保留，请通过原路径重试|Project initialization and saving the retry record failed. Host registration and existing content are preserved. Retry using the original path.
全局可用技能|Globally available skills
已连接连接器|Connected connectors
RSS 更新|RSS updates
已确认生效且无异常的全局技能，按调用名去重。|Verified global skills without issues, deduplicated by invocation name.
启用订阅源在所选时间范围内发布的已缓存文章。|Cached articles published by enabled feeds within the selected time range.
同时影响会话统计、RSS 更新与项目「近期活跃」数量。|Applies to session statistics, RSS updates, and recent project activity.
所选时间范围内暂无更新|No updates within the selected time range
可刷新订阅，或在外观布局中调整统计时间范围。|Refresh feeds or adjust the statistics time range in Appearance.
连接器|Connectors
市场来源 {p0}：{p1}|Marketplace source {p0}: {p1}
市场刷新失败：{p0}；当前显示上次成功加载的目录。|Marketplace refresh failed: {p0}. Showing the last successfully loaded catalog.
市场加载失败：{p0}；请重试或手工添加连接。|Marketplace loading failed: {p0}. Retry or add a connection manually.
请求超时|Request timed out
JSON 格式无效|Invalid JSON format
市场目录 HTTP {p0}|Marketplace catalog HTTP {p0}
市场目录最大 2 MB|Marketplace catalogs are limited to 2 MB
市场目录没有响应内容|The marketplace catalog response is empty
市场分页游标无效|Invalid marketplace pagination cursor
网络连接失败|Network connection failed
目录读取失败|Catalog could not be read
市场目录已更新，但本地缓存保存失败；下次打开可能需要重新加载。|The marketplace catalog was updated, but the local cache could not be saved. It may need to be reloaded next time.
市场目录格式不支持|Unsupported marketplace catalog format
未知来源|Unknown source
订阅|Subscriptions
连接器统计|Connector statistics
订阅统计|Subscription statistics
最近 {p0} 天发布的已缓存文章|Cached articles published in the last {p0} days
最近 {p0} 天发布的已缓存文章 · 异常 {p1}|Cached articles published in the last {p0} days · {p1} issues
最近 {p0} 天发布的已缓存文章 · {p1} 个来源尚未刷新|Cached articles published in the last {p0} days · {p1} feeds not refreshed yet
最近 {p0} 天发布的已缓存文章 · {p1} 个来源尚未刷新 · 异常 {p2}|Cached articles published in the last {p0} days · {p1} feeds not refreshed yet · {p2} issues
 · {p0} 个来源尚未刷新| · {p0} feeds not refreshed yet
服务主页|Service homepage
连接说明|Connection description
连接配置|Connection configuration
基本设置|Basic settings
高级设置|Advanced settings
服务介绍|Service overview
暂无连接说明。|No connection description.
无需认证|No authentication
本地命令|Local command
密钥认证|Key authentication
支持中文、英文、数字和空格，例如 代码审查。|Chinese, English, numbers and spaces are supported, for example Code Review.
名称不可包含路径分隔符、控制字符或系统保留名称。|Names must not contain path separators, control characters or system-reserved names.
技能名称不可包含路径分隔符、控制字符或系统保留名称，最多 100 个字符／240 字节|Skill names must not contain path separators, control characters or system-reserved names; maximum 100 characters / 240 bytes.
内置市场来源仅支持启停|Built-in market sources can only be enabled or disabled
凭据申请说明|Credential setup guide
请填写{p0}|Enter {p0}
密钥|Secret
市场来源|Market sources
搜索连接器市场|Search the connector marketplace
开关设置即时保存；目录仅用于浏览，不自动连接。|Changes are saved immediately. Directories are for browsing only; services are not connected automatically.
内置 SkillHub 和 ClawHub，开关设置即时保存。|SkillHub and ClawHub are built in. Changes are saved immediately.
评分排序 · 每页 24 条|Top rated · 24 per page
下载榜单 · 每页 10 条|Most downloaded · 10 per page
技能市场仅支持内置来源|The skill market only supports built-in sources
条目已移除，{p0} 项凭据清理未确认，请检查官方凭据库|Entry removed; cleanup of {p0} credentials is unconfirmed. Check the official credential store.
{p0} · 公共 Agent|{p0} · Shared agents
宿主技能摘要读取失败：{p0}|Host skill summary could not be read: {p0}
 · 关闭面板后后台继续| · Continues in the background after closing this panel
RSS 操作正在保存，请稍后重试|An RSS operation is being saved. Retry later.
RSS 面板已关闭|RSS panel closed
正在读取…|Loading…
技能统计|Skill statistics
全局有效技能、项目技能及解析异常。|Active global skills, project skills and parsing issues.
实际已连接的受管服务与异常。|Managed services that are actually connected, and their issues.
RSS统计|RSS statistics
订阅数量、缓存文章及异常。|Subscription counts, cached articles and issues.
最多显示 6 张统计卡，请先关闭一项|Show up to 6 stat cards. Turn one off first.
无效订阅|Invalid subscription
未分组不能重命名|Ungrouped cannot be renamed
默认分组不能重命名|Default group cannot be renamed
默认分组 · {p0} 篇|Default group · {p0} articles
技能事务目标重复或嵌套|Skill transaction destinations are duplicate or nested
文件已保存，来源监听失败：{p0}|Files saved, but source monitoring failed: {p0}
技能来源不可与已登记来源或工作台中转存储重叠|Skill sources must not overlap registered sources or Workbase staging storage
请选择一个已登记来源或上传文件|Select a registered source or upload a file
目录候选已变化或解析失败，请重新预览|Directory candidates changed or parsing failed. Preview again.
全局技能|Global skills
技能来源|Skill sources
技能市场|Skill marketplace
全部来源|All sources
名称须为 1–80 字符|Name must contain 1-80 characters
请选择最大 2 MB 的 .md／.json 文件|Choose a .md or .json file no larger than 2 MB
已跳过 {p0} 个同名技能|Skipped {p0} skills with duplicate names
已保存 {p0} 项；{p1}|Saved {p0} items; {p1}
搜索技能名称或说明|Search skill names or descriptions
搜索名称或说明|Search names or descriptions
外部归属或项目只读，不能修改|Externally owned or read-only project; changes are not allowed
已启用，点击关闭|Enabled; click to disable
已关闭，点击启用|Disabled; click to enable
启用 {p0}|Enable {p0}
添加|Add
技能名称|Skill name
使用小写英文、数字和连字符，例如 code-review。|Use lowercase letters, numbers and hyphens, such as code-review.
技能名称仅支持小写英文、数字和连字符。|Skill names must use lowercase letters, numbers and hyphens.
简短说明|Short description
应用范围|Scope
安装位置|Installation location
已登记项目的 .dsh/skills|.dsh/skills in registered projects
（只读）| (read only)
技能正文|Skill content
读取中|Loading
添加技能|Add skill
管理全局与项目技能、目录来源和技能市场。|Manage global and project skills, directory sources and the skill marketplace.
技能管理二级菜单|Skill management tabs
技能分组|Skill groups
按技能来源|By skill source
按项目|By project
选择技能分组|Select skill group
添加路径|Add path
添加数据源|Add data source
数据源加载失败：{p0}|Data sources failed to load: {p0}
删除 {p0}|Delete {p0}
支持 skills.sh、ClawHub、SKILL.md 和技能 JSON；输入关键词搜索，ClawHub 默认显示下载榜单。|Supports skills.sh, ClawHub, SKILL.md and skill JSON. Search by keyword; ClawHub shows the download ranking by default.
暂无数据源|No data sources
正在搜索技能|Searching skills
正在加载更多技能|Loading more skills
重试加载更多|Retry loading more
支持 skills.sh、ClawHub、SkillHub、SKILL.md 和技能 JSON；SkillHub 默认按评分排序。|Supports skills.sh, ClawHub, SkillHub, SKILL.md and skill JSON. SkillHub sorts by score by default.
技能市场操作|Skill marketplace actions
技能目录操作|Skill directory actions
加载市场|Load marketplace
重新扫描|Rescan
正在扫描…|Scanning…
扫描完成|Scan complete
路径已存在，原有来源已保留|Path already exists; existing source preserved
技能来源已添加|Skill source added
技能设置|Skill settings
连接器设置|Connector settings
订阅设置|Subscription settings
返回管理|Back to manager
来源名称已更新|Source name updated
已保存 {p0} 项技能 · 跳过 {p1} 项 · 待确认生效 {p2} 项|Saved {p0} skills · skipped {p1} · activation unconfirmed for {p2}
技能导出已发起|Skill export started
市场目录已刷新|Marketplace catalog refreshed
技能来源设置已保存|Skill source settings saved
市场来源设置已保存|Marketplace source settings saved
市场来源已保存|Marketplace source saved
市场来源已移除|Marketplace source removed
连接器配置已保存|Connector configuration saved
连接器配置导出已发起|Connector configuration export started
连接器启停设置已保存|Connector activation settings saved
工具启停设置已保存|Tool activation settings saved
重新连接已请求，请查看连接状态|Reconnection requested; check connection status
授权已发起，请在授权页完成|Authorization started; complete it on the authorization page
令牌刷新已完成，请查看连接状态|Token refresh completed; check connection status
授权已取消，配置已保留|Authorization cancelled; configuration preserved
凭据清理已执行，请核对连接状态|Credential cleanup performed; check connection status
连接器已移除|Connector removed
订阅已添加|Subscription added
订阅设置已保存|Subscription settings saved
订阅分组已添加|Subscription group added
订阅分组设置已保存|Subscription group settings saved
订阅分组已移除|Subscription group removed
订阅顺序与分组已保存|Subscription order and groups saved
分组名称已更新|Group name updated
订阅导出已发起|Subscription export started
启停由工作台策略控制；文件保存与宿主生效分别确认。|Workbase controls activation policies. File saving and host activation are confirmed separately.
技能记录|Skill records
来源名称|Source name
修改 {p0} 的名称|Rename {p0}
修改名称|Rename
正在读取技能|Loading skills
暂无匹配技能|No matching skills
暂无匹配记录|No matching records
试试调整筛选条件，或添加新的记录。|Try adjusting the filters or adding a new record.
添加数据源后，通过市场操作加载目录；加载失败仍可手工创建。|Add a data source, then load its catalog from marketplace actions. You can still create skills manually if loading fails.
仅扫描 DSH、公共 Agent、已登记项目与明确添加的来源。|Scan only DSH, shared agent directories, registered projects and explicitly added sources.
编辑技能|Edit skill
技能详情|Skill details
添加市场技能|Add marketplace skill
返回详情|Back to details
返回列表|Back to list
添加技能方式|Ways to add skills
创建技能|Create skill
上传技能|Upload skills
生效异常|Activation issue
已生效|Active
已保存，待确认生效|Saved; activation unconfirmed
已停用|Disabled
项目不可用|Project unavailable
全局|Global
指定项目 · {p0} 个项目|Selected projects · {p0} projects
导出技能|Export skill
数据源名称|Data source name
目录地址|Catalog URL
只加载 HTTP／HTTPS 技能 JSON 目录，不自动安装；内网、回环和保留地址默认拒绝。|Load only HTTP/HTTPS skill JSON catalogs without automatic installation. Private, loopback and reserved addresses are blocked by default.
已配置数据源|Configured data sources
选择 SKILL.md 或技能 JSON，检查内容后安装到全局或多个项目。|Choose SKILL.md or skill JSON, review the content, then install globally or in multiple projects.
选择技能文件|Choose skill file
支持 .md／.json，单个文件最大 2 MB。|Supports .md and .json, up to 2 MB per file.
选择文件|Choose file
上传技能文件|Upload skill file
文件内容预览|File content preview
 · 同名跳过| · Duplicate name; skipped
技能说明|Skill description
关联文件|Related files
外部技能正文只读；工作台独立管理启停策略，保留原文件与其他管理器配置。|External skill content is read only. Workbase manages its own activation policies and preserves original files and other managers' settings.
工作台归属 · 正文与启停统一作用于全部所选范围。|Owned by Workbase · Content and enabled state apply to all selected scopes.
保存修改|Save changes
此技能外部归属或项目只读，无法编辑|This skill is externally owned or in a read-only project and cannot be edited
选择应用范围：{p0}|Select scope: {p0}
未选择|Not selected
选择应用范围|Select scope
无法解析配置|Could not parse configuration
正在加载市场目录|Loading marketplace catalog
市场加载失败|Marketplace loading failed
操作失败，请重试|Operation failed; retry
请选择最大 2 MB 的 .json 文件|Choose a .json file no larger than 2 MB
文件读取失败，原内容已保留|File reading failed. Original content is retained.
全部连接|All connections
全局连接|Global connections
不可用项目|Unavailable project
参数、环境变量和请求头需要有效 JSON|Arguments, environment variables and headers must be valid JSON
请输入来源名称|Enter a source name
连接器管理|Connector management
添加连接|Add connection
管理自有连接、工具和市场来源；外部连接不自动接管。|Manage your connections, tools and marketplace sources. External connections are not automatically managed here.
连接器分类|Connector categories
我的连接|My connections
市场来源|Marketplace sources
连接器市场|Connector marketplace
连接器应用范围分组|Connector scope groups
搜索连接|Search connections
按应用范围|By scope
搜索市场或来源|Search marketplace or sources
添加来源|Add source
正在读取连接器配置|Loading connector configuration
官方连接器客户端不可用；可管理配置，不能建立连接。|The official connector client is unavailable. Configuration can be managed, but connections cannot be established.
连接器管理记录|Connector management records
 · 只读，未接管| · Read only; not managed here
启停 {p0}|Toggle {p0}
来源操作|Source actions
移除来源|Remove source
没有符合条件的连接|No matching connections
编辑连接|Edit connection
连接详情|Connection details
返回|Back
添加方式|Ways to add
导入配置|Import configuration
连接名称|Connection name
传输方式|Transport
注入方式|Injection mode
始终注入|Always inject
按会话启用（宿主不支持）|Enable per session (unsupported by host)
服务地址|Service URL
命令|Command
工作目录|Working directory
参数（JSON 数组）|Arguments (JSON array)
环境变量（JSON 对象）|Environment variables (JSON object)
认证方式|Authentication
无认证|No authentication
密钥（留空保留）|Secret (leave blank to keep)
API Key 请求头|API Key header
OAuth 公开客户端 ID（留空尝试动态注册）|OAuth public client ID (leave blank to try dynamic registration)
OAuth scopes（空格分隔）|OAuth scopes (space separated)
保存后通过 PKCE 授权。令牌使用官方凭据库，建连使用官方连接器客户端；缺少官方服务时不可授权。|Authorize with PKCE after saving. Tokens use the official credential store; connections use the official connector client. Authorization requires these official services.
连接超时（秒）|Connection timeout (seconds)
断线自动重连|Reconnect automatically
请求头（JSON 对象）|Headers (JSON object)
敏感值交由官方凭据存储；空密钥保留已有值，清除需在详情明确操作。|Sensitive values use the official credential store. Blank secrets keep existing values; clearing them requires an explicit action in details.
保存配置|Save configuration
保存并授权|Save and authorize
选择连接器配置文件|Choose connector configuration file
.json 文件最大 2 MB|.json files up to 2 MB
JSON 配置|JSON configuration
 · 同名保留原记录| · Duplicate name; original record retained
请求头和环境变量保留并写入官方凭据库；预览与导出不包含原文。同名连接保留。|Headers and environment variables are retained in the official credential store. Previews and exports omit their raw values. Connections with duplicate names are kept.
已导入 {p0} 个，跳过 {p1} 个，失败 {p2} 个|Imported {p0}, skipped {p1}, failed {p2}
导入所选|Import selected
只读取目录描述，不自动连接任何市场服务。|Read catalog descriptions only; do not automatically connect to marketplace services.
保存来源|Save source
移除|Remove
？仅影响工作台拥有的条目。|? Only Workbase-owned entries are affected.
明确清除此连接的全部凭据？配置保留，之后需要重新配置密钥。|Clear all credentials for this connection? Configuration is retained; secrets must be configured again.
确认清除凭据|Confirm credential clearing
导出配置|Export configuration
重新连接|Reconnect
授权管理|Authorization
配置已保存。授权完成后会校验令牌并由官方客户端握手，未握手成功不会显示已连接。|Configuration saved. After authorization, the token is validated and the official client performs a handshake. Connected status requires a successful handshake.
开始授权|Start authorization
打开授权页|Open authorization page
 · 进度保留在当前面板| · Progress stays in this panel
刷新令牌|Refresh token
取消授权并保留配置|Cancel authorization and keep configuration
超时 |Timeout: 
 秒 · | seconds · 
自动重连|Automatic reconnection
不自动重连|No automatic reconnection
工具详情|Tool details
 个已启用| enabled
搜索工具名称或说明|Search tool names or descriptions
启停工具 {p0}|Toggle tool {p0}
当前连接不可用，工具开关禁用；连接后显示真实发现结果。|The connection is unavailable, so tool toggles are disabled. Discovered tools appear after connecting.
编辑配置|Edit configuration
连接操作|Connection actions
清除凭据|Clear credentials
移除连接|Remove connection
连接已经移除，请返回列表。|Connection removed. Return to the list.
连接分组|Connection groups
发布时间未知|Publication time unknown
RSS 操作失败，请重试|RSS operation failed; retry
打开原文：{p0}|Open original: {p0}
打开原文|Open original
暂无有效原文链接|No valid original link
来源不可用|Source unavailable
此来源仅提供摘要，可通过原文链接阅读全文。|This source provides summaries only. Follow the original link to read the full article.
正在拉取原文正文…|Fetching the original article…
订阅源未提供正文，当前显示摘要。|The feed contains no article body. Showing the summary.
 可通过原文链接阅读全文。| Follow the original link to read the full article.
正文拉取失败：{p0}|Failed to fetch the article: {p0}
原文响应超过上限|The original page exceeds the size limit
原文元素数量超过上限|The original page exceeds the element limit
原文未提供可提取的正文，可能需要登录或动态加载|No article body could be extracted. The page may require sign-in or dynamic loading
文章或订阅已变化，请重新读取|The article or subscription has changed. Please reload
正文缓存容量不足，请打开原文阅读|The article cache is full. Please open the original page
此文章暂无正文或摘要。|This article has no content or summary.
没有匹配的文章|No matching articles
暂无缓存文章|No cached articles
暂无订阅|No subscriptions
试试其他关键词，或清空搜索。|Try other keywords or clear the search.
添加订阅后可刷新文章，暂停更新的来源保留缓存。|Add subscriptions to refresh articles. Paused sources retain their cache.
阅读 {p0}|Read {p0}
此来源未提供摘要|This source provides no summary
仅查看 {p0}|Show only {p0}
已暂停更新|Updates paused
编辑订阅|Edit subscription
暂停更新|Pause updates
恢复更新|Resume updates
刷新此来源|Refresh this source
导出此来源|Export this source
上移|Move up
下移|Move down
移动到分组…|Move to group…
取消订阅|Unsubscribe
删除分组|Delete group
{p0} · {p1} 篇文章|{p0} · {p1} articles
{p0} 篇文章|{p0} articles
订阅分组与来源|Subscription groups and sources
自定义分组|Custom groups
添加分组|Add group
全部订阅|All subscriptions
未分组|Ungrouped
展开|Expand
折叠|Collapse
分组名称|Group name
{p0}的分组操作|Group actions for {p0}
 · 已暂停更新| · Updates paused
 · 可信内网源| · Trusted private source
{p0}的订阅操作|Subscription actions for {p0}
选择订阅分组|Select subscription group
全部订阅 · {p0} 篇|All subscriptions · {p0} articles
{p0} · {p1} 篇|{p0} · {p1} articles
未分组 · {p0} 篇|Ungrouped · {p0} articles
分组操作|Group actions
选择订阅源|Select feed
（已暂停）| (paused)
订阅及缓存已恢复|Subscription and cache restored
正在刷新文章|Refreshing articles
刷新完成 {p0} · 失败 {p1} · 取消 {p2}|Refresh complete: {p0} succeeded · {p1} failed · {p2} cancelled
请输入不重复的分组名称（1–80 字符）。|Enter a unique group name (1-80 characters).
新分组|New group
新分组 {p0}|New group {p0}
全部文章|All articles
RSS 订阅|RSS subscriptions
运行中会话|Running sessions
待办列表|Task list
按分组管理订阅，阅读最新文章，发现推荐来源。|Organize subscriptions by group, read the latest articles, and discover recommended sources.
导出订阅|Export subscriptions
添加订阅|Add subscription
RSS 订阅二级菜单|RSS subscription tabs
我的订阅|My subscriptions
推荐订阅|Recommended subscriptions
发布者原生 RSS / Atom|Publisher-hosted RSS / Atom
缓存 {p0} 篇|{p0} cached articles
缓存 {p0} 篇 · 异常 {p1}|{p0} cached articles · {p1} issues
拖拽排序，或按 Alt + 方向键移动|Drag to reorder, or press Alt + an arrow key
统计卡排序保存失败|Could not save the statistics card order
数码产品、科技行业与软件资讯。|Consumer devices, technology and software news.
数字生活、效率工具与使用经验。|Digital life, productivity tools and practical guides.
科技产品、设计与数字生活观察。|Technology products, design and digital life.
技术社区的热门文章与讨论链接。|Popular articles and discussions from the technology community.
人工智能论文更新；非发布日可能没有条目。|AI paper announcements; non-publication days can have no entries.
开放模型、数据集与机器学习实践。|Open models, datasets and machine-learning practice.
研究团队发布的 AI 研究和产品进展。|AI research and product updates from the research team.
实用软件、工具推荐和更新介绍。|Useful applications, tools and software updates.
DSH 官方 GitHub 版本发布记录。|Official DSH releases published on GitHub.
Python 官方版本发布与项目消息。|Official Python releases and project news.
Rust 官方版本与语言生态进展。|Official Rust releases and ecosystem updates.
Node.js 官方版本、安全更新与项目消息。|Official Node.js releases, security updates and project news.
互联网、技术应用与个人博客文章。|Personal writing about the internet and technology.
开发实践、数据工具与 AI 使用笔记。|Development practice, data tools and AI notes.
航天任务、科学发现与宇宙探索。|Space missions, science and exploration.
关于科学、技术和日常生活的漫画更新。|Comics about science, technology and everyday life.
已取消订阅「|Unsubscribed from “
」，30 秒内可撤销。|”. Undo within 30 seconds.
正在读取订阅…|Loading subscriptions…
搜索{p0}的标题、摘要和来源|Search titles, summaries and sources in {p0}
搜索标题、摘要、来源|Search titles, summaries, sources
搜索推荐来源|Search recommended sources
刷新当前范围文章|Refresh articles in the current scope
订阅文章列表|Subscription article list
文章|Article
移动订阅|Move subscription
移动到分组|Move to group
已导入 {p0} 项订阅|Imported {p0} subscriptions
已订阅|Subscribed
请选择最大 2 MB 的 .opml 或 .xml 文件|Choose an .opml or .xml file no larger than 2 MB
文件读取失败，原草稿已保留|File reading failed. Original draft is retained.
添加订阅方式|Ways to add subscriptions
导入订阅|Import subscriptions
已启用|Enabled
检查 {p0}|Checked {p0}
可信内网源|Trusted private source
刷新|Refresh
选择 OPML 文件或粘贴订阅内容|Choose an OPML file or paste subscriptions
最大 2 MB；先预览并选择候选，不覆盖已有订阅。|Up to 2 MB. Preview and select candidates first; existing subscriptions are not overwritten.
OPML 内容|OPML content
默认分组|Default group
导入默认分组|Default import group
正在读取／预览…|Loading / previewing…
可导入 |Importable: 
 项 · 重复 | items · Duplicates: 
 项 · 无效 | items · Invalid: 
 项| items
 · 分组：| · Group: 
 · 已存在，跳过| · Already exists; skipped
导入 {p0}|Import {p0}
名称|Name
RSS / Atom 地址|RSS / Atom URL
分组|Group
订阅分组|Subscription group
启用更新|Enable updates
暂停时保留已有缓存文章。|Existing cached articles are retained while paused.
显式允许此地址的内网／本机访问；跨源重定向仍检查私网。仅对可信来源开启。|Explicitly allow private network or local access for this address. Cross-origin redirects still check private addresses. Enable only for trusted sources.
最近文章|Recent articles
已重新读取版本，草稿保留，请核对后保存|Latest version loaded. Draft retained; review before saving.
读取最新版本|Load latest version
保存订阅|Save subscription
无法读取安装位置|Could not read installation locations
扩展配置|Extension settings
设置新技能、连接器的默认值及订阅刷新频率。|Set defaults for new skills and connectors, and the subscription refresh interval.
扩展配置分类|Extension settings categories
技能|Skills
默认安装位置|Default installation location
仅用于新增全局技能；项目技能装入对应项目目录。|For new global skills only; project skills go into their project directory.
自动选择可写来源|Automatically select a writable source
新增技能默认启用|Enable new skills by default
适用于创建、安装和上传；优先采用 JSON 中的启用状态。|Applies to creation, installation and uploads; an explicit enabled state in JSON takes precedence.
旧版停用目录|Legacy disabled directory
新启停保留原文件；旧版中转技能重新启用时恢复原位置。|Activation changes preserve original files. Legacy staged skills return to their original location when enabled.
打开目录失败|Failed to open directory
默认注入方式|Default injection mode
仅用于新增连接，详情中可调整。|For new connections only; change it in connection details.
按会话启用|Enable per session
宿主不支持会话隔离，暂不能按会话启用。|The host lacks session isolation; per-session activation is unavailable.
整数，范围1–300秒。|Integer from 1 to 300 seconds.
连接超时须为1–300秒整数。|Connection timeout must be an integer from 1 to 300 seconds.
自动刷新频率|Automatic refresh interval
后台仅刷新已启用订阅，暂停来源保留缓存。|Only enabled subscriptions refresh in the background. Paused sources retain their cache.
仅手动|Manual only
每15分钟|Every 15 minutes
每30分钟|Every 30 minutes
每小时|Every hour
关闭概览|Close overview
全局范围不可包含项目，项目范围至少选择一个项目|Global scope cannot include projects. Project scope requires at least one project.
技能文件最大 2 MB|Skill files must not exceed 2 MB
SKILL.md 需要名称、说明 frontmatter 与正文|SKILL.md requires name and description frontmatter and body content
上传 frontmatter 仅支持单行标量，请使用技能 JSON 上传复杂内容|Uploaded frontmatter supports single-line scalars only. Use skill JSON for complex content.
frontmatter 字段重复|Duplicate frontmatter field
不支持此 YAML 标量，请使用单行说明或技能 JSON|Unsupported YAML scalar. Use a single-line description or skill JSON.
数据源仅接受不含凭据和片段的 HTTP／HTTPS 地址|Data sources require HTTP/HTTPS URLs without credentials or fragments
请输入不含凭据、查询参数或片段的 HTTP/HTTPS 服务地址|Enter an HTTP/HTTPS service URL without credentials, query parameters or fragments
请填写命令|Enter a command
stdio 使用环境变量认证，不支持 HTTP 认证方式|stdio uses environment variables for authentication and does not support HTTP authentication
状态未知|Status unknown
连接中|Connecting
已连接|Connected
已安装|Installed
安装|Install
连接|Connect
需授权|Authorization required
连接失败|Connection failed
官方客户端不可用|Official client unavailable
开源协作与工程实践|Open-source collaboration and engineering practices
GitHub Blog 官方 RSS|Official GitHub Blog RSS
Web 技术与开发实践|Web technologies and development practices
Mozilla Hacks 官方 RSS|Official Mozilla Hacks RSS
人工智能研究论文|AI research papers
arXiv 官方 RSS|Official arXiv RSS
官方连接器管理器或其他插件|Official connector manager or other plugins
连接器工具未启用或不在当前登记项目范围|Connector tool is disabled or outside the current registered project scope
官方连接器客户端资源清理未确认，需要重启宿主|Official connector client resource cleanup is unconfirmed. Restart the host.
官方客户端没有提供运行状态|The official client provided no runtime status
官方客户端连接失败，请查看宿主诊断|Official client connection failed. See host diagnostics.
凭据缺失或已失效，请编辑凭据后重连|Credentials are missing or invalid. Edit credentials and reconnect.
OAuth 端点必须使用 HTTPS，本地回环测试除外|OAuth endpoints require HTTPS, except for local loopback testing
OAuth 服务拒绝请求|OAuth service rejected the request
OAuth 服务没有响应|OAuth service did not respond
OAuth 元数据或令牌响应过大|OAuth metadata or token response is too large
OAuth 返回不支持的令牌类型|OAuth returned an unsupported token type
OAuth 资源元数据与连接地址不匹配|OAuth resource metadata does not match the connection URL
OAuth 服务不支持公开客户端 PKCE S256 或 issuer 不匹配|OAuth service does not support public-client PKCE S256, or the issuer does not match
OAuth 授权已取消，配置保留|OAuth authorization cancelled. Configuration retained.
OAuth 授权被拒绝或缺少授权码|OAuth authorization denied or authorization code missing
OAuth 令牌交换失败，需要重新授权|OAuth token exchange failed. Authorize again.
OAuth 回调监听失败|OAuth callback listener failed
OAuth 授权超时，配置保留|OAuth authorization timed out. Configuration retained.
OAuth 服务没有动态注册端点，请填写公开客户端 ID|OAuth service has no dynamic registration endpoint. Enter a public client ID.
OAuth 注册不支持公开客户端|OAuth registration does not support public clients
OAuth 授权初始化失败|OAuth authorization initialization failed
OAuth 凭据缺失，需要重新授权|OAuth credentials missing. Authorize again.
OAuth 令牌到期且无法刷新，需要重新授权|OAuth token expired and cannot be refreshed. Authorize again.
OAuth 凭据缺失|OAuth credentials missing
连接器配置读取失败，原文件未改写|Connector configuration could not be read. Original file is unchanged.
连接器模块已卸载|Connector module unloaded
只能管理工作台自有连接器条目|Only Workbase-owned connector entries can be managed
官方宿主未提供按会话隔离，此选项不可用|The official host provides no per-session isolation. This option is unavailable.
请至少选择一个可用且未归档的登记项目|Select at least one available, unarchived registered project
缺少官方连接器客户端，不能建立连接|The official connector client is missing. Connections cannot be established.
连接握手或工具发现超时|Connection handshake or tool discovery timed out
OAuth 凭据缺失、过期或启动失败，需要重新授权|OAuth credentials are missing, expired or failed to initialize. Authorize again.
官方客户端启动、握手或工具注册失败，请检查服务与宿主诊断|Official client startup, handshake or tool registration failed. Check the service and host diagnostics.
OAuth 凭据引用缺失|OAuth credential reference missing
官方客户端资源清理未确认，请重启宿主后重试|Official client resource cleanup is unconfirmed. Restart the host and retry.
按会话隔离没有当前官方公开契约；OAuth 使用 PKCE 与官方凭据库|No official public contract currently supports per-session isolation. OAuth uses PKCE and the official credential store.
{p0} 个配置{p1}|{p0} configurations{p1}
 · {p0} 个异常| · {p0} issues
配置或官方凭据保存失败，未导入；可重试|Configuration or official credentials could not be saved. Nothing imported; retry.
来源名称或地址重复|Duplicate source name or URL
来源不存在|Source does not exist
OAuth 刷新不可用|OAuth refresh unavailable
OAuth 刷新失败，需要重新授权|OAuth refresh failed. Authorize again.
缺少官方连接器客户端|Official connector client missing
连接已停用|Connection disabled
当前连接不可用，工具开关已禁用|Connection unavailable; tool toggles disabled
工具不存在|Tool does not exist
官方凭据存储不可用|Official credential store unavailable
未知连接器操作|Unknown connector operation
配置已更新，请重新读取后保存|Configuration changed. Reload before saving.
连接名称重复|Duplicate connection name
不能引用其他条目的凭据|Credentials belonging to other entries cannot be referenced
此认证字段只适用于 HTTP|This authentication field applies only to HTTP
官方凭据存储不可用，不能保存敏感值|Official credential store unavailable. Sensitive values cannot be saved.
连接器配置与凭据已保存，但旧连接资源清理失败；请重启宿主后重试|Connector configuration and credentials saved, but old connection resource cleanup failed. Restart the host and retry.
连接器字段格式无效，请检查输入|Invalid connector field format. Check your input.
连接器配置或凭据保存失败，原配置保留|Connector configuration or credentials could not be saved. Original configuration retained.
JSON 文件不能超过 2 MB|JSON files must not exceed 2 MB
一次最多导入 500 个连接|Import up to 500 connections at a time
来源需要 HTTP/HTTPS 地址|Sources require HTTP/HTTPS URLs
市场目录加载失败或目录格式不支持；仍可手工添加连接|Marketplace catalog failed to load or its format is unsupported. Connections can still be added manually.
部分连接器资源清理未确认，请重启宿主|Some connector resource cleanup is unconfirmed. Restart the host.
OAuth 需要启用 HTTP 连接、官方客户端与官方凭据库|OAuth requires an enabled HTTP connection, the official client and the official credential store
授权正在进行，请完成或取消后重试|Authorization is in progress. Complete or cancel it before retrying.
等待 OAuth 授权，可打开授权页或取消|Waiting for OAuth authorization. Open the authorization page or cancel.
OAuth 已取消或超时，配置保留|OAuth cancelled or timed out. Configuration retained.
OAuth 授权或凭据保存失败，需要重新授权|OAuth authorization or credential saving failed. Authorize again.
OAuth 初始化失败，请检查服务元数据、PKCE 支持或公开客户端 ID|OAuth initialization failed. Check service metadata, PKCE support or the public client ID.
RSS 抓取已取消|RSS fetch cancelled
RSS 地址解析到私网或保留地址，默认拒绝访问|RSS URL resolves to a private or reserved address. Access is blocked by default.
RSS 响应超过上限|RSS response exceeds the size limit
RSS URL 无效，仅允许无凭据的 HTTP/HTTPS|Invalid RSS URL. Only HTTP/HTTPS without credentials is allowed.
RSS 抓取超时|RSS fetch timed out
RSS 重定向次数超过上限|RSS redirect limit exceeded
RSS 重定向地址无效|Invalid RSS redirect URL
RSS 压缩响应无效或超过上限|Compressed RSS response is invalid or exceeds the size limit
RSS 响应字符编码无效|Invalid RSS response character encoding
XML 包含未知或非法实体|XML contains unknown or invalid entities
XML 超过 2 MB 上限|XML exceeds the 2 MB limit
不允许 XML DTD 或实体声明|XML DTDs and entity declarations are not allowed
XML 格式无效|Invalid XML format
XML 嵌套或元素数量超过上限|XML nesting depth or element count exceeds the limit
不是 RSS / Atom 订阅源|Not an RSS / Atom feed
RSS 缺少 channel|RSS channel missing
无标题文章|Untitled article
不是有效的 OPML 文档|Not a valid OPML document
OPML 候选超过上限|OPML candidate limit exceeded
仅允许无凭据的 HTTP/HTTPS 地址|Only HTTP/HTTPS URLs without credentials are allowed
名称或分组超过 80 字符|Name or group exceeds 80 characters
撤销缓存容量不足，请稍后重试|Insufficient undo cache capacity. Retry later.
RSS 配置超过上限|RSS configuration exceeds the size limit
RSS 配置读取失败，保留原文件|RSS configuration could not be read. Original file retained.
RSS 配置身份重复|Duplicate RSS configuration identifiers
RSS 缓存超过上限|RSS cache exceeds the size limit
缓存不可用，请重新刷新|Cache unavailable. Refresh again.
订阅源不存在|Feed does not exist
文章缓存已不可用|Article cache is no longer available
请填写名称|Enter a name
名称最多 80 字符|Name must not exceed 80 characters
RSS 操作失败|RSS operation failed
RssManager home 必须是绝对路径|RssManager home must be an absolute path
RSS 容量参数无效：{p0}|Invalid RSS capacity parameter: {p0}
RSS 容量超过硬性上限|RSS capacity exceeds the hard limit
RSS Manager 已关闭|RSS Manager closed
分组不存在|Group does not exist
分组名称重复或保留|Group name is duplicate or reserved
订阅地址重复|Duplicate subscription URL
订阅数量超过上限|Subscription limit exceeded
尚未刷新|Not refreshed yet
检查失败 {p0} · 最近刷新 {p1}|Failed checks: {p0} · Last refreshed: {p1}
RSS 操作已取消|RSS operation cancelled
分组数量超过上限|Group limit exceeded
订阅版本已变化，请重新读取后保存|Subscription version changed. Reload before saving.
订阅已编辑，抓取已取消|Subscription edited; fetch cancelled
订阅已取消|Subscription cancelled
撤销期限已过或订阅已恢复|Undo expired or subscription already restored
已重新订阅相同地址，不重复恢复|This URL was subscribed to again. No duplicate restoration.
未知 RSS 方法：{p0}|Unknown RSS method: {p0}
无缓存条件的 304 响应|304 response without cache validators
RSS 抓取失败|RSS fetch failed
技能路径不可使用符号链接|Skill paths must not use symbolic links
来源必须是绝对目录|Source must be an absolute directory path
来源不是目录|Source is not a directory
技能目录层级过深|Skill directory nesting is too deep
技能关联文件不可使用符号链接|Related skill files must not use symbolic links
技能最多 500 个文件、20 MB|Skills support up to 500 files and 20 MB
技能目录仅接受普通文件|Skill directories accept regular files only
关联文件路径越界|Related file path is outside the allowed directory
技能文件已被外部修改或目标同名冲突，请重新扫描|Skill files were changed externally or the destination name conflicts. Rescan.
原技能文件已消失，请重新扫描|Original skill files are missing. Rescan.
技能文件发生并发修改|Skill files were modified concurrently
目标技能被其他工具创建|The destination skill was created by another tool
回滚路径被外部修改，恢复副本已保留|Rollback path was changed externally. Recovery copy retained.
技能事务恢复日志损坏|Skill transaction recovery log is corrupted
技能事务日志路径无效|Invalid skill transaction log path
技能保存失败且回滚未完成，恢复副本已保留：{p0}|Skill saving failed and rollback is incomplete. Recovery copies retained: {p0}
宿主文件系统无法映射技能目录事务路径|The host filesystem cannot map the skill transaction paths
宿主文件系统为 read-only，不能安装或修改技能|The host filesystem is read-only. Skills cannot be installed or edited.
宿主沙箱不能完整约束技能目录事务|The host sandbox cannot fully confine skill directory transactions
技能提交结果无法确认，文件与恢复日志已保留，请恢复宿主读取能力后重试|The skill commit outcome could not be confirmed. Files and the recovery journal were retained; restore host read access before retrying
宿主技能目录事务失败：{p0}|Host skill directory transaction failed: {p0}
技能事务只能在同一父目录内发布|Skill transactions can only publish within the same parent directory
技能安装目录没有可用父目录|No usable parent directory for skill installation
未知技能文件操作|Unknown skill file operation
技能市场重定向次数过多|Too many skill marketplace redirects
技能市场拒绝内网、回环或保留地址|Skill marketplace blocks private, loopback and reserved addresses
技能市场 HTTP {p0}|Skill marketplace HTTP {p0}
技能市场目录最大 2 MB|Skill marketplace catalogs must not exceed 2 MB
技能市场读取超时|Skill marketplace request timed out
技能市场重定向缺少地址|Skill marketplace redirect URL missing
技能模块已卸载|Skills module unloaded
技能状态读取失败，未覆盖原文件：{p0}|Skill state could not be read. Original file was not overwritten: {p0}
公共 Agent|Shared agents
宿主文件系统受限，不能使用本机目录事务；需要宿主授权的目录事务能力|The host filesystem is restricted; local directory transactions cannot be used. Host-authorized directory transactions are required.
宿主文件系统无法映射此技能路径|The host filesystem cannot map this skill path
宿主目录显示能力未接线，停用目录路径可查看|Host directory reveal is not connected. The disabled directory path is available to view.
市场数据源不存在|Marketplace data source does not exist
未知技能操作：{p0}|Unknown skill operation: {p0}
技能生效尚未确认 · 异常 {p0}|Skill activation unconfirmed · {p0} issues
项目 {p0} · 异常 {p1}|Projects: {p0} · Issues: {p1}
技能已不存在，请重新扫描|Skill no longer exists. Rescan.
此技能由外部提供器或技能管理器拥有，尚未接管，仅可读取|This skill belongs to an external provider or skill manager and is not managed here. Read access only.
安装来源已不可写，请重新选择|Installation source is no longer writable. Select another.
应用范围包含未登记、不可用或已归档项目|Scope includes unregistered, unavailable or archived projects
技能版本已变化，草稿已保留，请重新读取|Skill version changed. Draft retained; reload.
已存在同名技能，请编辑已有技能的应用范围|A skill with this name already exists. Edit the existing skill's scope.
文件已保存 · 技能已生效|Files saved · Skill active
文件已保存 · 后续技能调用已停用；当前会话已加载内容不保证撤回|Files saved · Future skill calls disabled. Content already loaded in this session may remain available.
启停策略已保存 · 后续技能调用已停用；当前会话已加载内容不保证撤回|Activation policy saved · Future skill calls disabled. Content already loaded in this session may remain available.
启停策略已保存 · 技能已生效|Activation policy saved · Skill active
启停策略已保存 · {p0}|Activation policy saved · {p0}
技能来源过大或层级过深，最多扫描 2000 个条目、20 层|Skill source exceeds 2,000 entries or 20 directory levels
同名技能由 {p0} 优先提供，停用尚未确认|A skill from {p0} takes precedence; disabling is unconfirmed
宿主技能调用策略与工作台不一致|Host skill invocation policy differs from Workbase
技能调用策略必须是 true 或 false|Skill invocation policy must be true or false
技能名称无法转换为宿主支持的调用名称|The skill name cannot be mapped to a supported host invocation name
来源策略已保存，旧版技能恢复失败：{p0}|Source policy saved; legacy skill restoration failed: {p0}
技能来源监听达到上限，请扫描确认文件变化|Skill watcher limit reached. Rescan to confirm file changes.
文件已保存 · {p0}|Files saved · {p0}
等待宿主确认生效|Waiting for the host to confirm activation
原范围项目已归档或不可用，禁止修改|Projects in the original scope are archived or unavailable. Changes are not allowed.
技能安装路径与登记归属不匹配|Skill installation path does not match registered ownership
来源名称重复|Duplicate source name
来源包含外部归属技能，宿主没有权威停用接口；未接管前不可切换来源|Source contains externally owned skills and the host has no authoritative disable interface. The source cannot be toggled until ownership is transferred.
市场数据源名称或地址重复|Duplicate marketplace data source name or URL
仅扫描已登记技能来源|Only registered skill sources are scanned
来源已停用，外部归属尚未接管|Source disabled; external ownership has not been transferred
技能读取或解析异常|Skill reading or parsing issue
安装文件已被外部修改|Installed files were modified externally
宿主技能服务不可用，文件已保存但未确认生效|Host skill service unavailable. Files saved, but activation is unconfirmed.
宿主技能目录读取未完成|Host skill catalog loading is incomplete
同名技能由 {p0} 优先提供|A skill with this name takes precedence from {p0}
宿主尚未发现此技能|The host has not discovered this skill yet
文件已保存，宿主生效确认失败：{p0}|Files saved, but host activation confirmation failed: {p0}
技能文件已发生外部修改|Skill files were modified externally
技能已被外部修改，请重新扫描|Skill was modified externally. Rescan.
技能来源监听失败：{p0}|Skill source monitoring failed: {p0}
技能来源监听不可用：{p0}|Skill source monitoring unavailable: {p0}
打开项目右栏|Open the project sidebar
重试打开项目右栏|Retry opening the project sidebar
正在准备项目右栏…|Preparing the project sidebar…
项目右栏加载失败|Failed to load the project sidebar
右栏会话目录与当前项目不一致，请重新打开项目。|The sidebar session directory does not match this project. Reopen the project.
右栏会话目录已改变，请重新打开项目。|The sidebar session directory changed. Reopen the project.
管理全局设置、初始化设置与项目规则。|Manage global settings, initialization settings and project rules.
全局设置|Global settings
初始化设置|Initialization settings
规则自动保存 · 其余配置点击保存|Rules save automatically · Save other settings with the button
写入 DSH 主目录的 AGENTS.md，全局生效；停用保留草稿。|Writes to AGENTS.md in the DSH home directory and applies globally; disabling keeps the draft.
点击或按 Enter 编辑 Markdown 原文|Click or press Enter to edit Markdown
点击此处编写规则正文。|Click here to write rule content.
点击正文编辑，点击外部查看预览。修改自动保存。|Click to edit, click outside to preview. Changes save automatically.
点击正文编辑，点击外部查看预览。修改后点击保存设置。|Click to edit, click outside to preview. Click Save settings to save changes.
搜索规则名称或应用项目|Search rule names or projects
清空规则搜索|Clear rule search
添加规则|Add rule
重试保存|Retry save
正在自动保存…|Saving automatically…
未保存修改|Unsaved changes
已自动保存|Saved automatically
找到 {p0} 条 · 共 {p1} 条规则|{p0} matches · {p1} rules total
{p0} 条规则|{p0} rules
项目规则列表|Project rules
应用项目|Projects
项目数|Project count
启用规则：{p0}|Enable rule: {p0}
删除规则：{p0}|Delete rule: {p0}
未命名规则|Untitled rule
未选择项目|No projects selected
没有匹配的规则，试试其他名称或项目。|No matching rules. Try a different name or project.
暂无规则。点击“添加规则”开始配置。|No rules yet. Click “Add rule” to get started.
返回规则列表|Back to rules
启用此规则|Enable this rule
选择项目 · 已选 {p0} 个|Select projects · {p0} selected
应用到 {p0} 个项目 · {p1} · {p2}|Applies to {p0} projects · {p1} · {p2}
停用|Disabled
启用|On
启用规则前，请填写正文。|Add content before enabling the rule.
正文最多20000字符，不能包含工作台区块标记。|Content is limited to 20000 characters and cannot contain managed block markers.
规则保存失败，请重试|Rule saving failed. Please retry.
规则仍有未保存修改，请完善内容或重试保存。|Rules have unsaved changes. Complete the content or retry saving.
放弃未保存规则并关闭|Discard unsaved rules and close
全局规则|Global rules
项目规则|Project rules
全局规则正文|Global rule content
项目规则正文|Project rule content
规则编辑工具|Rule editing tools
加粗|Bold
代码块|Code block
继续编辑|Continue editing
规则名称|Rule name
删除规则|Delete rule
启用项目规则|Enable project rule
适用项目|Projects
可多选，点击项目切换选择。|Select multiple projects; click to toggle each selection.
已选择 {p0} 个项目|{p0} projects selected
选择项目|Select projects
添加项目规则|Add project rule
项目已移除，请取消选择|Project removed; deselect it
保存到 DSH 主目录的 AGENTS.md，应用于整个 DSH。|Save to AGENTS.md in the DSH home directory and apply throughout DSH.
规则写入所选项目的 AGENTS.md，与全局规则共同生效。关闭保留草稿。|Write rules to AGENTS.md in the selected projects, alongside global rules. Turning them off preserves drafts.
保存后更新所选项目，保留 AGENTS.md 原有正文。|Update selected projects when saved, preserving the existing AGENTS.md content.
请检查规则名称、正文和适用项目|Check rule names, content and selected projects
项目目录不可用，无法保存规则|The project directory is unavailable for saving rules
当前宿主不支持保存规则文件|The host does not support saving rule files
规则已在其他窗口修改，请重新打开设置|Rules changed in another window. Reopen settings.
规则必须通过设置保存，并检查原规则版本|Save rules through settings with the original rule version
工作台规则区块已在外部修改，请恢复原区块后重试|The managed rule block changed externally. Restore the original block before retrying.
规则文件已在外部修改，保存已停止|The rule file changed externally. Saving stopped.
规则文件必须是普通文件，不能使用符号链接或硬链接|The rule file must be a regular file without symbolic or hard links
规则文件已变化或超过 2 MiB|The rule file changed or exceeds 2 MiB
规则目录必须使用绝对路径|Rule directories must use absolute paths
规则目录不能使用符号链接或已变化的路径|Rule directories cannot use symbolic links or changed paths
全局规则与项目规则目录不能重复|Global and project rule directories cannot be the same
规则文件不能超过 2 MiB|Rule files cannot exceed 2 MiB
规则保存后被外部修改|The saved rule file was changed externally
规则保存后被外部删除|The saved rule file was deleted externally
规则回滚失败，文件已保留，请检查：{p0}|Rule rollback failed. Files were preserved; check: {p0}
规则文件已回滚，但设置回滚失败，请重新检查设置|Rule files were rolled back, but settings rollback failed. Check the settings.
项目初始化|Project initialization
添加已有项目时补齐缺失内容|Fill missing files when adding existing projects
保存后自动用于新建项目。开启补齐后，也用于后续添加的已有项目。|Saved settings apply to new projects, and to existing projects added later when completion is enabled.
默认关闭；仅补齐已勾选项，保留已有文件和 Git 仓库。|Off by default; fills missing selected items and keeps existing files and Git repositories.
项目已添加，补齐 {p0} 项，保留 {p1} 项|Project added: {p0} items created, {p1} preserved
请提供绝对路径项目目录|Provide an absolute project directory path
项目目录不是文件夹|The project path is not a directory
初始化子目录不是普通目录，不能通过符号链接补齐|The initialization subdirectory is not a regular directory; completion cannot follow symbolic links
项目目录不可用，无法补齐初始化内容|The project directory is unavailable for initialization completion
当前宿主不支持补齐项目初始化内容|The host does not support project initialization completion
项目初始化补齐失败：{p0}。已有内容已保留，请检查目录后重试：{p1}|Project initialization completion failed: {p0}. Existing contents were preserved. Check the directory and retry: {p1}
添加已有项目补齐失败：{p0}。工作台尚未加入此项目，宿主登记及已有内容保留，可通过原路径重试。|Completion while adding an existing project failed: {p0}. The project has not been added to Workbase. Host registration and existing contents were preserved; retry using the same path.
初始化补齐已完成，但项目保存失败：{p0}。已补齐内容保留，请通过原路径重试。|Initialization completion finished, but saving the project failed: {p0}. Created contents were preserved; retry using the same path.
项目基础文件|Project basics
生成 README.md 和 .editorconfig。|Generate README.md and .editorconfig.
Agent 协作规范|Agent collaboration
生成 AGENTS.md 和 .agents/notes/dev-log.md。|Generate AGENTS.md and .agents/notes/dev-log.md.
Git 初始化|Git initialization
创建 main 分支空仓库和 .gitignore，不自动提交。|Create an empty repository on main and .gitignore, without committing.
生成提交规则|Generate commit rules
写入 .agents/rules/git-commit-message.md，并在 AGENTS.md 中引用。|Write .agents/rules/git-commit-message.md and reference it in AGENTS.md.
自定义提交规则|Customize commit rules
提交规则内容|Commit rule content
恢复默认提交规则|Restore default commit rules
请填写提交规则内容。|Enter commit rule content.
请填写提交规则内容|Enter commit rule content
请填写项目配置中的提交规则内容|Enter commit rule content in Project settings
以下配置保存后用于后续新建项目；打开已有目录不执行初始化。|Saved settings apply to future projects; existing directories are not initialized.
初始化模板|Initialization template
默认初始化模板|Default initialization template
默认初始化 Git|Initialize Git by default
新建项目时自动选用，可在创建表单中单独调整。|Selected automatically for new projects; you can change it in the creation form.
基础模板创建 main 分支，不自动提交。|The basic template creates the main branch without making a commit.
默认值来自项目全局配置，本次修改仅用于新建目录。|Defaults come from global project settings; changes here apply only to this new directory.
仅用于本次新建目录。|Only applies to this new directory.
不初始化|No initialization
基础协作模板|Basic collaboration template
初始化 Git|Initialize Git
创建 main 分支，不自动提交。|Create the main branch without making a commit.
将创建的文件|Files to create
不安装依赖；已有目录不执行初始化。|Dependencies are not installed; existing directories are not initialized.
初始化仅适用于创建新项目|Initialization only applies to new projects
初始化目标不是空目录|The initialization target is not empty
初始化目录不可用|The initialization directory is unavailable
初始化期间项目目录已变化|The project directory changed during initialization
初始化期间子目录已变化|A subdirectory changed during initialization
Git 初始化失败，请确认已安装 Git，或取消 Git 初始化后重试|Git initialization failed. Install Git or turn off Git initialization and retry
Git 初始化产生了不支持的文件类型|Git initialization produced an unsupported file type
Git 初始化结果不完整|Git initialization produced an incomplete repository
项目初始化失败|Project initialization failed
{p0}。本次创建的目录已回滚，可重试。|{p0}. The new directory was rolled back; you can retry.
{p0}。目录已保留：{p1}。请检查残留内容后重试。|{p0}. Directory kept: {p1}. Check the remaining contents before retrying.
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
配置终端字体、字号、配色和 Shell，关闭后保留设置。|Customize terminal fonts, size, colors and Shell. Settings are kept when disabled.
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
10–20 px，默认 13 px；留空恢复默认。|10–20 px, default 13 px; leave blank to restore the default.
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
简体中文|简体中文
默认跟随平台，仅切换界面语言，保留用户内容。|Follows the platform by default; changes the interface language and keeps your content.
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
经典湛蓝|Classic Blue
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
会话 ID 已复制|Session ID copied
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
侧栏入口与顶部返回按钮至少保留一个。|Keep either the sidebar entry or the header return button visible.
保存|Save
保存中…|Saving…
保存位置：|Saved to:
保存全部分类修改 · 主题即时预览|Save changes in all sections · Theme previews instantly
下次启动生效；宿主就绪且空闲后备份一次。|Applies on the next launch; backs up once the host is ready and idle.
保存设置|Save settings
修复失败，请重新检查|Repair failed; check again
倒序|From bottom,
停止并移除旧版本|Stop and remove old version
允许 Agent 管理待办|Allow agents to manage tasks
允许管理待办|Allow task management
校验预览后确认恢复；关闭设置不影响任务，期间请勿退出宿主。|Validate and preview before confirming recovery. Tasks continue after settings close; keep the host open.
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
同步中断|Sync interrupted
名称与 Harness 同步；不改变本地文件夹名称和路径。Enter 保存，Esc 取消。|The name syncs with Harness. Folder names and paths stay unchanged. Enter saves; Esc cancels.
后台|Background
保存当前备份配置并开始备份，关闭设置后继续。|Saves the current backup settings and starts a backup; continues after settings close.
后续项目专属设置将在这里显示。|Additional project-specific settings will appear here.
启动打开首页|Open home on launch
启动时自动备份|Back up on launch
回滚|Rollback
回滚副本|Rollback copy
国内镜像源|China mirror registry
图片上传失败（{p0}）|Image upload failed ({p0})
图片对象|Image objects
图片总大小不能超过 {p0} 字节|Total image size must not exceed {p0} bytes
图片读取失败（{p0}）|Image read failed ({p0})
在 DSH 侧边栏显示工作台入口。|Show the Workbase entry in the DSH sidebar.
在所选目录内新建独立目录。会话、附件、SQLite 和 Profile 文件不会自动激活到当前宿主。|Create a separate folder in the selected directory. Sessions, attachments, SQLite and profile files are not activated in the current host.
在插件页提供已安装插件的一键更新。|Add one-click updates for installed plugins on the plugin page.
在会话顶部提供返回工作台入口。|Adds a return-to-Workbase entry at the top of sessions.
在新工作树中开始|Start in a new worktree
在项目菜单中选择「归档项目」后显示在这里，业务只读。|Projects archived from their menu appear here in read-only mode.
基于 {p0}|Based on {p0}
填入会话草稿，由你发送。|Insert into the session draft for you to send.
处理中…|Processing…
备份|Backup
运行中文件不保证一致性；暂不含客户端草稿、自定义附件目录等。|Consistency is not guaranteed for live files. Client drafts, custom attachment directories and other unsupported data are excluded.
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
复制 SessionID|Copy session ID
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
所有项目生效：开启可增删改待办及完成状态，关闭仅可查询。|Applies to all projects: enables creating, editing, deleting and completing tasks; otherwise, read only.
下次启动 DSH 桌面端时进入工作台首页。|Opens Workbase home on the next launch of the DSH desktop app.
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
添加已有项目|Add existing project
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
操作结果已保留|Results retained
刷新失败：{p0}|Refresh failed: {p0}
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
插件更新|Plugin updates
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
当前正在运行的会话。|Sessions that are currently running.
尚未完成的待办，含手动创建与 Agent 创建。|Open tasks, whether created manually or by an agent.
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
缓存缺失会自动冷读重建，不作为异常|Missing cache rows are rebuilt by cold reads automatically and are not treated as issues
未发现母会话已缺失的子代理残留|No orphaned subagent leftovers
未归档|Unarchived
未能读取插件，请重新检查|Could not read plugins. Check again.
未覆盖|Not covered
未设置|Not set
本地安装包|Local package
权限在「工作台设置 → 项目配置 → 全局设置」中统一调整。|Manage permissions in Workbase settings → Project settings → Global settings.
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
{p0}：成功 {p1} · 跳过 {p2} · 失败 {p3}|{p0}: succeeded {p1} · skipped {p2} · failed {p3}
无法读取项目分支，请重新读取后再发送。|Unable to read project branches. Reload before sending.
检查目录、普通冷会话列表缓存、孤儿子代理及空会话；检查不读取正文。|Check directories, inactive session list caches, orphaned subagents and empty sessions without reading message bodies.
检查目录、列表缓存、孤儿子代理及空会话；缓存缺失的会话按需读取日志复核空会话状态。|Check directories, session list caches, orphaned subagents and empty sessions; sessions without a cache row have their logs read on demand to verify empty status.
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
启动时后台更新插件，保存后下次启动生效。|Update plugins in the background on launch. Applies on the next launch after saving.
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
清新森林|Fresh Forest
清理孤儿子代理|Clean up orphaned subagents
清理残留|Clean up leftovers
清理残留（|Clean up leftovers (
清空搜索|Clear search
清空输入|Clear input
暖纸阅读|Warm Paper
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
柔和紫晶|Soft Amethyst
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
最多 30 字。|Up to 30 characters.
观察副本|Observational copy
记下一步，按 Enter 添加…|Write your next step; Enter to add…
设置分类|Settings categories
设置已保存|Settings saved
诊断|Diagnostics
诊断分组内容|Diagnostic group content
诊断类型分组|Diagnostic types
语音模型|Voice model
请先停止运行中的会话，再永久删除|Stop running sessions before permanent deletion
请先在工作台设置 → 项目配置 → 全局设置中设置默认项目根目录。|Set a default project root in Workbase settings → Project settings → Global settings first.
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
跟随平台|Follow Platform
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
重新检查失败：{p0}|Recheck failed: {p0}
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
备份加密，密钥不在备份文件内，请单独保管。|Backups are encrypted. The key is not included; store it separately.
首页模块|Home modules
首页模块已隐藏，可通过右上角「工作台设置」恢复显示，或使用 Header 搜索打开项目和会话。|Home modules are hidden. Restore them in Workbase settings, or use header search to open projects and sessions.
默认安装源|Default registry
默认项目根目录|Default project root
，{p0} 个失败|, {p0} failed
，另有 {p0} 项大小未知|, plus {p0} items of unknown size
，并修改完成状态| and change completion status
；不包含附件及其他目录占用。|; excluding attachments and other directories.
；旧项目状态修改权限仍关闭，保存全局设置后统一生效|; legacy project status changes remain disabled until global settings are saved
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
目录已创建：{p0}。注册失败：{p1}。请切换「添加已有项目」重试此路径，不必再次创建文件夹。|Directory created: {p0}. Registration failed: {p1}. Choose “Add existing project” and retry this path without creating another folder.
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
RSS 网络限制参数无效|Invalid RSS network limits
撤销记录超过上限，请在 30 秒后重试|Undo history is full. Try again in 30 seconds.
OPML 候选已变化，请重新预览|OPML candidates changed. Preview again.
导入来源|Import source
技能文件|Skill file
已登记目录|Registered directory
GitHub 仓库|GitHub repository
仓库地址|Repository URL
加载候选|Load candidates
目录只读取已登记来源；仓库仅接受公开 GitHub HTTPS 地址，固定提交后保留关联文件。|Directories are read only from registered sources. Repositories require a public GitHub HTTPS URL; related files are imported from a fixed commit.
仓库导入支持无凭据的公开 GitHub HTTPS 仓库地址|Repository import requires a public GitHub HTTPS URL without credentials
仓库地址格式无效|Invalid repository URL
仓库子目录越界|Repository subdirectory is outside the allowed path
仓库目录索引不完整，不能可靠导入|The repository tree is incomplete and cannot be imported reliably
仓库指定范围没有 SKILL.md|No SKILL.md was found in the selected repository path
仓库技能拒绝越界路径、符号链接或子模块|Repository skills must not contain path traversal, symbolic links or submodules
技能导入最多 500 个文件、20 MB|Skill imports are limited to 500 files and 20 MB
仓库 SKILL.md 必须只定义一个技能|Each repository SKILL.md must define exactly one skill
请选择一个文件、已登记目录或仓库地址|Choose a file, registered directory or repository URL
请选择一个已登记来源、仓库预览或上传文件|Choose a registered source, repository preview or uploaded file
仓库预览已过期，请重新加载|The repository preview expired. Load it again.
技能来源条目过多，最多扫描 2000 个直接条目|The skill source is too large. At most 2000 direct entries can be scanned.
订阅名称|Subscription name
订阅名称不能为空|Subscription name cannot be empty
订阅名称最多 80 个字符|Subscription name must be at most 80 characters
订阅地址|Subscription URL
支持 RSS 与 Atom，例如 https://example.com/feed.xml|Supports RSS and Atom, for example https://example.com/feed.xml
支持 skills.sh、ClawHub、SKILL.md 和技能 JSON 目录；只读取目录，选中后加载正文。|Supports skills.sh, ClawHub, SKILL.md and skill JSON catalogs. The skill content is loaded when selected.
支持官方连接器注册表、社区连接器目录和自定义 servers JSON；只读取描述，不自动连接。|Supports the official connector registry, community connector catalogs and custom servers JSON. Reading a catalog does not connect to its services.
输入关键词搜索 skills.sh；ClawHub 默认显示下载榜单。|Enter keywords to search skills.sh. ClawHub shows the downloads chart by default.
正在加载市场目录|Loading the marketplace catalog
正在读取技能正文和关联文件|Loading the skill content and related files
关联文件将随技能保存。|Related files will be saved with the skill.
市场技能预览已失效，请重新打开详情|The marketplace preview expired. Open the skill details again.
市场技能版本已变化，请重新打开详情|The marketplace skill changed. Open its details again.
市场技能不存在或来源已停用|The marketplace skill is unavailable or its source is disabled.
当前工作台不支持 SSE 传输，请配置 Streamable HTTP 或 stdio。|SSE is not supported. Configure Streamable HTTP or stdio.
此目录条目的传输方式尚不支持。|This catalog entry uses an unsupported transport.
此目录条目的认证方式需要手工配置。|Configure this catalog entry's authentication manually.
此目录条目需要手工补充兼容的连接配置。|Provide a compatible connection configuration for this catalog entry.
此市场包需要手工配置启动命令。|Configure the startup command for this marketplace package.
请填写目录中的请求头、环境变量或参数后再保存。|Fill in the required headers, environment variables or arguments before saving.
已显示前 500 条市场记录，请输入关键词缩小范围。|Showing the first 500 marketplace entries. Enter keywords to narrow the results.
已显示前 50 条市场技能，请输入关键词缩小范围。|Showing the first 50 marketplace skills. Enter keywords to narrow the results.
技能市场返回了无效目录|The skill marketplace returned an invalid catalog.
技能市场分页游标无效|Invalid skill marketplace pagination cursor.
市场技能包含非法、重复或嵌套文件路径|The skill package contains invalid, duplicate or nested file paths.
市场技能归档最大 20 MB|Marketplace skill archives are limited to 20 MB.
市场技能 ZIP 格式不支持|Unsupported marketplace skill ZIP format.
市场技能 ZIP 目录无效或文件过多|Invalid ZIP directory or too many files.
市场技能 ZIP 目录损坏|The skill ZIP directory is damaged.
市场技能 ZIP 加密或压缩格式不支持|Encrypted ZIP files or this compression format are not supported.
市场技能归档不可包含符号链接|Skill archives must not contain symbolic links.
市场技能 ZIP 文件头损坏|The skill ZIP file header is damaged.
市场技能 ZIP 文件越界|The skill ZIP file is outside the archive bounds.
市场技能 ZIP 文件校验失败|The skill ZIP file checksum failed.
市场技能 ZIP 目录项无效|Invalid skill ZIP directory entry.
市场技能归档仅接受普通文件|Skill archives only accept regular files.
市场技能归档缺少 SKILL.md|The skill archive is missing SKILL.md.
技能市场标识无效|Invalid skill marketplace identifier.
技能市场包缺少 SKILL.md|The skill package is missing SKILL.md.
市场技能说明格式无效|Invalid marketplace skill document format.
创建会话缺少请求身份，请刷新后重试|The session creation request has no identity. Refresh and retry.
创建请求的项目或模式已变化，请核对原创建结果|The creation request's project or mode has changed. Check the original result.
创建回执保存未确认，请核对原创建结果|The creation receipt has not been confirmed. Check the original result.
会话创建结果未知，请核对宿主会话后再继续|The session creation result is unknown. Check the host's sessions before continuing.
会话创建回执已达上限，请先维护历史回执|The session creation receipt limit has been reached. Maintain historical receipts first.
`.trim().split('\n').map(line => {
  const divider = line.indexOf('|');
  return [line.slice(0, divider), line.slice(divider + 1)];
}));
