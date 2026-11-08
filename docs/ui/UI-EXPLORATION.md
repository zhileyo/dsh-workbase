# DSH Workbase · 设计原型

当前可交互原型：[ui-directions.html](ui-directions.html)。该文件是已确认的 UI 开发基线，布局、图标和交互细节需与实际插件逐项核对。

现行需求见 [PRD](../PRD.md)，现行视觉规则见 [UI 设计](../UI-DESIGN.md)，真实功能和验收边界见 [开发日志](../../.agents/notes/dev-log.md)。

## 预览与范围

原型是独立 HTML，使用示例数据和浏览器本地存储。可直接打开；也可在项目根目录启动静态服务后访问：

```sh
uv run --no-project python -m http.server 8765 --bind 127.0.0.1
```

首页路径为 `/docs/ui/ui-directions.html`，详情可使用 `?view=detail`。服务需要自行启动，这些地址不是已部署的线上服务。

原型涵盖首页模块、项目宫格／列表、详情两栏／页签、待办分组、搜索、菜单、设置及异常状态。主题包含跟随 DSH、DSH 默认、清爽、温暖阅读和紫晶，顶部提供宿主主题与外观模拟控件。

原型的项目归档、迁移、迁移撤销、会话删除及示例全文定位均为模拟，不操作真实目录或宿主数据。实际插件的宿主能力限制以开发状态为准。

## 验证入口

- [当前插件截图对照](verification/index.html)：保留有效的插件验收证据，不用旧原型截图代表当前结果；截图为 WebP（每张约 26 KB），只用于人工比对，几何与颜色判定走 DOM 计算而非像素。
- `node docs/compress-evidence.mjs`：把 `verification/` 里残留的 PNG 批量转成 WebP 并改写报告引用（`--dry-run` 只看不写）。编码器需要 `cwebp`、ImageMagick 或 Python Pillow 之一，验收脚本通过 `docs/evidence-image.mjs` 复用同一套探测。
- `node docs/ui/pin-favorite-check.cjs`：原型个人标记和筛选的隔离检查。
- `node docs/ui/design-fix-check.cjs`：原型写入失败、焦点及详情等隔离检查。
- `node docs/ui/design-color-check.cjs`：DSH／清爽／温暖阅读的明暗令牌对比度复算；`--write` 写入 `verification/current-contrast-evidence.json`。

以上命令均从项目根目录执行。原型检查不等同于实际插件或模型执行验证。旧修订叙述、旧截图表及早期验证 JSON 已移出有效文档目录。
