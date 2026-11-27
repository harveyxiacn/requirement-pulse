# Changelog

## 0.1.0 — 2026-11-27

首个可用版本。

### 看板与决策

- 五阶段需求看板与列表视图，拖拽换列、键盘拖拽、菜单换列。
- 需求创建/编辑/删除、优先级、标签、工作量、期望日期、Agent 就绪开关。
- 需求详情：Markdown 说明与验收标准、结构化分析、人工采纳、评论。
- 活动记录：需求、领取、分析、采纳、导入导出事件。
- 命令面板、全局新建快捷键、浅色/深色主题、减少动态支持。

### Agent 接入

- 本地 HTTP Agent Bridge：回环监听、Bearer Token、Host 校验、无 CORS、512 KiB 请求上限、幂等键。
- stdio MCP server（8 个工具），用 esbuild 打包为单文件，随安装包分发。
- 领取 TTL、冲突检测、提交分析自动续领、Agent 名册与最近活动。
- Claude Code / Codex / 通用 MCP / HTTP 配置模板，一键复制。

### 本地数据

- 单文件 JSON 存储，原子写入、每日备份、损坏文件隔离。
- 导出不包含桥接 Token；导入前自动备份并保留本机桥接配置。

### 工程

- Electron 45 + React 19 + TypeScript 5.9 + electron-vite 6。
- 23 个单元 / 桥接 / MCP 集成测试；Playwright Electron E2E 与 axe 扫描。
- Windows x64 NSIS 安装包。
