# Requirement Pulse · 实施计划

> 状态：执行基线 v0.1  
> 日期：2026-11-26  
> 目标：在单个开发周期内交付可安装、可测试、可公开审阅的 Windows 桌面应用

---

## 1. 交付定义（Definition of Done）

一个版本只有在以下全部成立时才算完成：

- [x] Windows 11 上可启动，开发模式与打包模式都可用。
- [x] 需求 CRUD、状态移动、筛选、搜索、评论、分析采纳、活动记录全部可用。
- [x] Agent Bridge 可启动并受 Token 保护；文档化的 HTTP 端点通过集成测试。
- [x] MCP server 可构建，工具可注册，至少一次真实闭环（领取 → 获取 → 提交 → 释放）验证。
- [x] Agent 工作台能生成 Claude Code / Codex / DeepSeek-通用 / HTTP 四类接入片段。
- [x] 浅色/深色主题、键盘操作、减少动态、Dialog 焦点、拖拽替代可用。
- [x] `npm run typecheck`、`npm run test`、`npm run build` 全部通过。
- [x] Electron E2E 冒烟覆盖主流程与页面截图；报告已验证/未验证项。
- [x] 详细设计文档、规划、README、AGENT-PROTOCOL 入库。
- [x] GitHub 公共仓库创建并推送，MIT License 明确。

---

## 2. 里程碑

### M0 · 设计基线（本次先完成）

产物：

- `docs/PRODUCT-DESIGN.md`
- `docs/TECHNICAL-DESIGN.md`
- `docs/IMPLEMENTATION-PLAN.md`
- `docs/AGENT-PROTOCOL.md`（API/MCP 使用）

验收：

- 信息架构、数据模型、API、视觉 token、交互与无障碍范围明确。
- 关键取舍有记录（JSON 存储、HTTP+MCP、人工采纳、状态许可）。
- 开发不需要再临时决定核心行为。

### M1 · 工程骨架

任务：

1. 初始化 npm、TypeScript、electron-vite、React、目录。
2. 配置主/预加载/渲染进程编译、路径别名、CSP、窗口安全项。
3. 实现自定义窗口 chrome（最小化/最大化/关闭、拖动、状态持久化）。
4. 建立设计 token、基础排版、主题切换、App Shell（Titlebar + Sidebar + 内容区）。
5. 建立共享类型与常量。

验收：

- `npm run dev` 打开空白壳；主题可切换；窗口按钮工作；关闭重开位置恢复。
- 无 Electron 安全警告（开发 HMR 的正常提示除外）。

### M2 · 领域与持久化

任务：

1. 实现 zod 类型与 store（原子写、备份、损坏隔离、导出/导入）。
2. 实现 seed 数据（5 条示例需求、分析、活动）。
3. 实现 BoardService：CRUD、排序、领取、分析、采纳、评论、设置。
4. 实现 IPC + preload + snapshot 广播。
5. 单元测试覆盖全部领域不变量。

验收：

- 通过 IPC 新建需求，重启后仍在；删除后不复活。
- 写盘失败可回滚（模拟测试）；损坏文件被隔离。
- `npm run test` 中服务测试全绿。

### M3 · 看板与详情 UI

任务：

1. Board page：头部、视图切换、筛选、搜索入口、空/加载/错误。
2. 5 列看板；卡片、优先级、标签、Agent 指标、领取展示。
3. dnd-kit 拖拽 + 菜单替代；乐观更新与回滚。
4. 清单视图与排序。
5. Requirement Dialog（新建/编辑、未保存保护、校验、焦点管理）。
6. 详情页：头部状态/优先级菜单、内容、验收标准、分析卡、采纳、评论、右栏。
7. 删除 AlertDialog。
8. 命令面板（cmdk）与 `Ctrl+K` / `Ctrl+N`。
9. Toast / 空状态 / 骨架。
10. 视觉打磨第一轮：密度、间距、焦点、hover、响应断点。

验收：

- 用户能纯键盘完成创建 → 打开 → 移动状态 → 采纳 → 删除。
- 1440×900 下五列看板可用；1024×768 下无布局破版。
- 拖拽失败有回滚提示；菜单移动同样可用。

### M4 · Agent 接入层

任务：

1. AgentBridge：HTTP server、auth、Host 校验、body 限制、错误映射。
2. 端点集：health、board、requirements、brief、claim、analysis、comment、patch、activity。
3. 领取过期、冲突、自动 claim、幂等键。
4. MCP server 工具与 instructions，esbuild 打包。
5. Bridge 状态/端口/token 轮换 IPC。
6. Agent 工作台 UI：状态卡、接入 Tabs、复制配置、活跃 Agent、最近分析。
7. 桌面通知 + 点击跳转。
8. 集成测试（Bridge）+ MCP 冒烟脚本。

验收：

- curl 全链路通过 token 鉴权。
- 错误 token 401；无权限状态修改 403；冲突 409；重复幂等 200。
- MCP stdio server 注册 8 个工具并完成一次提交；Agent Desk 显示该 Agent 和分析。
- 轮换 token 后旧 token 立刻 401，新配置可用。

### M5 · 动态、设置、数据管理

任务：

1. Activity 页面与筛选、按日分组。
2. Settings：主题预览、用户名、Bridge 配置、通知、数据导出/导入/打开目录、关于。
3. Agent 状态与设置联动（Bridge 自动启动、关闭、错误）。
4. Import 校验、备份、失败保持原数据。
5. README / 截图 / 许可 / 仓库元数据。

验收：

- 导入导出往返数据一致；token 不导出。
- Bridge 停止后 UI 状态实时更新，Agent 请求失败。
- Settings 修改端口后重启 Bridge，status 正确。

### M6 · 验证与发布

任务：

1. Playwright Electron E2E：主流程、主题、Agent 页面、截图。
2. axe 自动扫描 + 手工键盘/对比度/reduced-motion 检查。
3. 构建 NSIS 安装包并在本机安装/启动/卸载验证。
4. 生成 GitHub 公共仓库，提交、打 tag、推送。
5. 汇总已修复/未验证清单，写入交付说明。

验收：

- 所有 DoD 勾选。
- 截图与 README 展示真实应用，不使用虚构数据。
- 公开仓库可克隆安装；无秘密文件。

---

## 3. 任务拆解与顺序

```text
Design docs
   ↓
Scaffold + tokens + window chrome
   ↓
Types/schemas → Store → Service → IPC → Preload
   ↓
App store + router + Shell
   ↓
Board + DnD + List
   ↓
Dialog + Detail + Analyses + Comments
   ↓
Command palette + Toasts + Empty/States
   ↓
Bridge API + tests
   ↓
MCP server + Agent Desk
   ↓
Activity + Settings + Export/Import + Notifications
   ↓
E2E + a11y + screenshots + package
   ↓
GitHub repo + push
```

关键依赖：

- UI 分析卡依赖 Service 的采纳/分析结构。
- Agent Desk 依赖 Bridge 状态 + MCP 路径生成。
- E2E 依赖可注入数据目录。
- 截图依赖稳定 seed + 主题。

---

## 4. 质量门

每个里程碑结束执行：

```bash
npm run typecheck
npm run test
npm run build
```

界面相关里程碑额外：

- 浅色/深色截图对照。
- 键盘走查至少一条完整任务。
- 减少动态切换。
- 1024 与 1440 宽度检查。

发布前额外：

- Bridge 集成测试全绿。
- MCP 冒烟通过。
- Playwright E2E 通过（或明确说明环境限制）。
- axe 报告没有严重/高优先级未解决项（知道限制并记录）。
- `git grep` 检查 token/绝对个人路径/开发临时文件未进入仓库。

---

## 5. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| Electron 打包/字体资源问题 | 中 | 安装包无法启动 | 先跑 dev → build → package 每阶段验证；字体用 Fontsource |
| Playwright 无法驱动 Electron（环境/显示） | 中 | 不能自动化 UI 验证 | 保留浏览器/Vite 预览兜底 + 手工截图；不伪称已验证 |
| dnd-kit 跨列实现复杂 | 中 | 拖拽体验差/缺陷 | 优先保证菜单替代；跨列落点算法单测；不阻塞其他功能 |
| MCP SDK API 版本差异 | 中 | 工具注册失败 | 锁版本；查看安装包类型；用最小 stdio 冒烟 |
| 本地 JSON 性能/体积 | 低 | 大量数据卡顿 | v0.1 小规模；活动上限；未来 SQLite |
| 字体包过大 | 低 | 安装包变大 | 仅打包必要字重；构建检查产物体积 |
| 无代码签名 SmartScreen | 高 | 用户安装犹豫 | README 说明；不提供自动更新；公开源码 |
| 中文字体/字距不一致 | 中 | 视觉不统一 | 明确 fallback；截图检查 Windows 实机 |
| 时间不足做全部视图 | 中 | 功能缺失 | 优先 P0：看板/详情/Agent Bridge/MCP；动态/设置可简化但不缺 |

---

## 6. 范围控制

### 必须（P0）

- 看板/清单、需求 CRUD、拖拽/菜单转移。
- 需求详情、评论、分析展示与采纳。
- Agent Ready、领取、Bridge HTTP、MCP、Token。
- Agent Desk 配置与状态。
- 浅/深主题、命令面板、Toast、设置、导出/导入。
- 测试、文档、公开仓库、Windows 打包。

### 应该（P1）

- 桌面通知、活跃 Agent 列表、活动筛选。
- 快捷键完整、未保存保护、撤销采纳。
- 截图和 axe 报告。
- 安装包本机验证。

### 可以不做（P2，明确排除 v0.1）

- 云同步、多人权限、GitHub Issue 同步。
- 自动更新、签名、代码执行。
- Agent 成本回执、分析 diff、自定义状态。
- 移动端/网页版。
- 自定义主题编辑器。

---

## 7. 提交策略

- 仓库：`harveyxiacn/requirement-pulse`（public，MIT）。
- 提交风格：人类作者 + 结尾：
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 建议提交序列：
  1. `docs: establish product and technical design`
  2. `feat: scaffold Electron desktop shell and core board`
  3. `feat: add agent bridge, MCP server, and analysis workflow`
  4. `test: verify domain, bridge, and desktop flows`
  5. `docs: add README, screenshots, and release notes`
- 不提交：`.env`、用户数据、token、`node_modules`、`release/` 安装包产物（若需发行包则通过 GitHub Release）。
- Secrets 扫描：`git grep -nE "PULSE_BRIDGE_TOKEN=[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9_-]{20,}"`（seed/example 除外，示例必须是占位符）。
- 版本 tag：`v0.1.0`。

---

## 8. 验收脚本

### 8.1 自动

```bash
npm ci
npm run typecheck
npm run test
npm run mcp:build
npm run build
npm run test:e2e        # 若环境可运行 Electron GUI
```

### 8.2 手工

1. 启动应用，确认 seed 数据/空状态。
2. `Ctrl+N` 新建需求：标题为空时错误；填写保存；关闭重开仍在。
3. 拖拽卡片到进行中；再用菜单移动到待验收；重启保持。
4. 打开详情；Ctrl+K 搜索编号；采纳分析；取消采纳。
5. 打开 Agent 工作台；确认 Bridge 在线；复制 Claude Code 配置。
6. 用测试客户端提交分析（curl 或 MCP）；UI 自动更新并出现通知（失焦时）。
7. 修改设置主题为深色；重启保持。
8. 导出 JSON，检查无 token；导入，数据恢复。
9. 停止 Bridge，确认 Agent 请求失败；重启后恢复。
10. 键盘走查：Tab 顺序、Dialog 关闭焦点、命令面板、列表排序。

### 8.3 无障碍

- 用 axe 扫描 Board / Detail / Agents / Settings。
- 手工：关闭鼠标，仅键盘完成核心路径。
- 系统设置开启减少动态，确认无位移动画/时长为 0。
- 高对比/深色主题下检查 focus ring 可见。
- 记录未测试的屏幕阅读器/输入法项。

---

## 9. 状态记录

| 里程碑 | 状态 | 证据 |
| --- | --- | --- |
| M0 设计基线 | 完成 | 本目录四份文档 |
| M1 工程骨架 | 完成 | Electron 45 + React 19 + electron-vite 6，主/预加载/渲染进程构建通过 |
| M2 领域/持久化 | 完成 | 原子存储、每日备份、隔离、导出/导入；服务测试全绿 |
| M3 看板/详情 | 完成 | 五阶段看板、列表、拖拽/键盘/菜单、详情、采纳、活动 |
| M4 Agent 接入 | 完成 | HTTP Bridge 集成测试 + 8 工具 MCP 真实闭环 + 打包路径验证 |
| M5 设置/数据 | 完成 | 主题、名称、桥接端口、通知、导出/导入、Token 轮换 |
| M6 验证/发布 | 进行中 | 类型检查、23 项测试、构建、E2E、axe、NSIS 打包均通过；待推送 GitHub |

### 9.1 验证记录（2026-11-27）

| 命令 / 场景 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过（node + web） |
| `npm test` | 通过：3 个测试文件，23 项测试 |
| `npm run build` | 通过：main/preload/renderer + MCP 单文件 |
| `npm run test:e2e` | 通过：4 项 E2E（1440×900、1024×768、浅/深色） |
| axe（Board / Agents / Activity / Settings，浅色 + 深色 + 1024 宽） | serious/critical = 0 |
| `npm run dist:win` | 通过：`release/Requirement-Pulse-0.1.0-Setup.exe` |
| 打包版启动 + HTTP + MCP | 通过：8 工具列出并调用 `pulse_board_summary`，MCP 路径指向 `resources/mcp-server/index.mjs` |
| 严格 CSP / sandbox / contextIsolation | 打包与未打包均加载正常，无页面错误 |
| `npm run dev` | 通过：Vite 绑定 127.0.0.1，Electron 正常加载并写入用户数据 |
| `npm run smoke:packaged` | 通过：打包版 UI、HTTP health、需求列表、8 个 MCP 工具 |
| GitHub Actions（push / PR） | 通过：1m13s，类型检查、23 项测试、构建全绿 |

### 9.2 尚未验证

- 真实屏幕阅读器（NVDA / JAWS）与输入法组合。
- Windows 高对比度模式、非 100% 显示缩放下的拖拽手感。
- 多显示器热插拔、系统休眠恢复后的窗口位置。
- 安装包在干净 Windows 机器上的 SmartScreen 交互（未签名）。

> 以上项目保留为“未验证”，不以自动化扫描替代真实辅助技术或设备测试。
