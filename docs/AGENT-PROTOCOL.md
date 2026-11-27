# Requirement Pulse · Agent 接入协议

> 面向 Claude Code、Codex、DeepSeek Harness 及其他支持 MCP / HTTP 的 Agent。  
> 协议版本：v1 · 应用版本 0.1.x

---

## 1. 两种接入方式

| 方式 | 适合 | 优点 |
| --- | --- | --- |
| **MCP（推荐）** | 支持 Model Context Protocol 的 Agent | Agent 可直接发现工具、理解参数；无需拼 HTTP |
| **HTTP** | 支持自定义工具调用、脚本或 curl 的 Harness | 无额外运行时，语言无关 |

两者最终访问同一个本机 Bridge。MCP 只是一个 stdio 包装器。

### 1.1 前提

1. Requirement Pulse 正在运行。
2. Agent 工作台中的 **Agent Bridge 在线**。
3. Agent 所在机器有 Node.js ≥ 20（仅 MCP 方式需要）。
4. 你在 Agent 工作台复制了包含当前 Token 的配置。

### 1.2 安全边界

- Bridge 只监听 `127.0.0.1`，不向局域网暴露。
- 所有数据请求必须带 `Authorization: Bearer <token>`。
- Token 是本地秘密。不要把含 Token 的 MCP 配置、shell 历史或截图提交到 git。
- Agent 不能通过本协议读取你的文件系统、执行命令或修改需求的标题/描述/验收标准。
- Agent 只能提交分析、评论、领取/释放，以及（若允许）修改状态。
- 你始终可以关闭需求上的“开放给 Agent”，或轮换 Token 让所有旧配置失效。

---

## 2. 人类工作流

### 2.1 获取配置

打开 **Agent 工作台**：

1. 确认 Bridge 状态为“在线”。
2. 选择 Agent 分类：Claude Code / Codex / DeepSeek·通用 / HTTP。
3. 点击复制配置或复制命令。
4. 粘贴到对应配置文件，重启 Agent 会话。

### 2.2 发起一次分析

最简单的方式是在 Agent 会话中粘贴应用生成的 **任务提示词**（需求详情右栏 → 复制任务提示词）：

```text
你正在通过 Requirement Pulse MCP 工具处理需求 REQ-003。

请：
1. 用 pulse_get_requirement 读取 REQ-003。
2. 用 pulse_claim_requirement 领取它（除非已被其他 Agent 领取）。
3. 基于需求描述与验收标准，给出可执行的分析：结论、置信度、步骤、风险、开放问题。
4. 用 pulse_submit_analysis 回写。
5. 用 pulse_release_requirement 释放。

约束：
- 只做分析与方案设计，不修改任何代码文件。
- 不要编造事实；信息不足时选择 needs-info 并列出问题。
- 用需求使用的语言作答。
```

你也可以让 Agent 自行发现：

```text
请使用 Pulse 看板工具，列出所有开放给 Agent 的需求，选择优先级最高的一条进行分析并回写。
```

### 2.3 人如何审查

- 看板/详情会自动刷新。
- 打开需求详情，比较 Agent 分析。
- 点击“采纳此分析”，或继续评论/修改需求。
- Agent 不能采纳分析。

---

## 3. MCP 接入模板

> 以下路径/Token/端口为占位符，请从应用 Agent 工作台复制实际值。  
> MCP server 由应用构建到：  
> - 开发：`<repo>/tools/mcp-server/dist/index.mjs`  
> - 安装包：`<安装目录>/resources/mcp-server/index.mjs`

环境变量：

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `PULSE_BRIDGE_URL` | 否 | `http://127.0.0.1:47321` | Bridge 地址 |
| `PULSE_BRIDGE_TOKEN` | 是 | — | 从 Agent 工作台复制 |
| `PULSE_AGENT_NAME` | 否 | `MCP Agent` | 显示在分析/活动中的名称 |
| `PULSE_AGENT_KIND` | 否 | `generic` | `claude-code` / `codex` / `deepseek` / `generic` |
| `PULSE_AGENT_MODEL` | 否 | — | 模型名，可选 |

### 3.1 Claude Code

项目级 `.mcp.json`：

```json
{
  "mcpServers": {
    "pulse": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\Users\\YOU\\AppData\\Local\\Programs\\Requirement Pulse\\resources\\mcp-server\\index.mjs"],
      "env": {
        "PULSE_BRIDGE_URL": "http://127.0.0.1:47321",
        "PULSE_BRIDGE_TOKEN": "<从 Agent 工作台复制>",
        "PULSE_AGENT_NAME": "Claude Code",
        "PULSE_AGENT_KIND": "claude-code",
        "PULSE_AGENT_MODEL": "claude-sonnet-5-5"
      }
    }
  }
}
```

也可使用 CLI：

```bash
claude mcp add pulse \
  -e PULSE_BRIDGE_URL=http://127.0.0.1:47321 \
  -e PULSE_BRIDGE_TOKEN=<token> \
  -e PULSE_AGENT_NAME="Claude Code" \
  -e PULSE_AGENT_KIND=claude-code \
  -- node "C:\path\to\mcp-server\index.mjs"
```

> 具体 CLI 参数以你安装的 Claude Code 版本为准。项目级 `.mcp.json` 最稳定，且可以被 `.gitignore` 排除。

### 3.2 Codex

`~/.codex/config.toml`：

```toml
[mcp_servers.pulse]
command = "node"
args = ["C:\\path\\to\\mcp-server\\index.mjs"]

[mcp_servers.pulse.env]
PULSE_BRIDGE_URL = "http://127.0.0.1:47321"
PULSE_BRIDGE_TOKEN = "<token>"
PULSE_AGENT_NAME = "Codex"
PULSE_AGENT_KIND = "codex"
PULSE_AGENT_MODEL = "gpt-5-codex"
```

> 若你的 Codex 版本使用不同的 MCP 配置键，以 `codex mcp` 帮助或官方文档为准；本质是 stdio server + env。

### 3.3 DeepSeek Harness / 通用 MCP

许多 harness 使用与 Claude Desktop 相同的 `mcpServers` 结构：

```json
{
  "mcpServers": {
    "pulse": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-server\\index.mjs"],
      "env": {
        "PULSE_BRIDGE_URL": "http://127.0.0.1:47321",
        "PULSE_BRIDGE_TOKEN": "<token>",
        "PULSE_AGENT_NAME": "DeepSeek",
        "PULSE_AGENT_KIND": "deepseek",
        "PULSE_AGENT_MODEL": "deepseek-v4"
      }
    }
  }
}
```

若 harness 不支持 MCP，使用第 4 节 HTTP API，将以下操作注册为工具即可：
- 列出需求
- 获取需求
- 领取
- 提交分析
- 释放

### 3.4 Node 路径

Windows 上，Agent 的 GUI 环境可能找不到 `node`。用绝对路径：

```json
"command": "C:\\Program Files\\nodejs\\node.exe"
```

先确认：

```powershell
node --version
```

---

## 4. HTTP API

Base URL：`http://127.0.0.1:47321`（以 Agent 工作台显示为准）。

所有请求：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

### 4.1 健康检查（无需令牌）

```http
GET /v1/health
```

```json
{ "ok": true, "data": { "status": "ok", "version": "0.1.0" } }
```

### 4.2 看板摘要

```http
GET /v1/board
Authorization: Bearer <token>
```

返回各状态计数、Agent Ready 数、活跃领取、Agent 最近活跃。

### 4.3 列出需求

```http
GET /v1/requirements?agentReady=true&status=inbox&limit=20
Authorization: Bearer <token>
```

参数：

- `status=inbox|planned|building|review|done`
- `priority=critical|high|medium|low`
- `agentReady=true|false`
- `q=关键词`（编号/标题/描述/标签）
- `limit=1..200`
- `updatedSince=<ISO>`
- `sort=updated|priority|code`

返回摘要，不含完整分析正文。用 `GET /v1/requirements/:id` 读取详情。

### 4.4 获取需求

```http
GET /v1/requirements/REQ-003
Authorization: Bearer <token>
```

`id` 可以是 UUID 或 `REQ-003`。返回完整需求（含分析、评论）。  
另有纯文本简报：

```http
GET /v1/requirements/REQ-003/brief
```

### 4.5 领取

```http
POST /v1/requirements/REQ-003/claim
Authorization: Bearer <token>
Content-Type: application/json

{
  "agent": {
    "name": "Claude Code",
    "kind": "claude-code",
    "model": "claude-sonnet-5-5"
  },
  "ttlMinutes": 90
}
```

- 领取 TTL 15–240 分钟。
- 需求必须“开放给 Agent”，且不是已完成。
- 已有其他 Agent 有效领取 → 409 `CLAIM_CONFLICT`。
- 同一 Agent 再次领取 → 刷新 TTL。

### 4.6 释放

```http
DELETE /v1/requirements/REQ-003/claim
Authorization: Bearer <token>
Content-Type: application/json

{
  "agent": { "name": "Claude Code", "kind": "claude-code" }
}
```

只有领取者或人类 UI 可以释放。HTTP API 中不同 Agent 尝试释放他人领取 → 409。

### 4.7 提交分析

```http
POST /v1/requirements/REQ-003/analyses
Authorization: Bearer <token>
Idempotency-Key: claude-run-20261126-001
Content-Type: application/json

{
  "agent": { "name": "Claude Code", "kind": "claude-code", "model": "claude-sonnet-5-5" },
  "summary": "一句话判断。",
  "recommendation": "proceed",
  "confidence": 78,
  "estimatedEffort": "M",
  "proposedSteps": ["步骤 1", "步骤 2"],
  "risks": ["风险 1"],
  "openQuestions": ["问题 1"],
  "notes": "可选 Markdown，补充方案细节。"
}
```

`recommendation`：

- `proceed` 推进
- `needs-info` 需要补充信息
- `defer` 暂缓
- `decline` 不建议

字段上限见 `TECHNICAL-DESIGN.md`。  
若已有其他 Agent 的有效领取 → 409。  
若需求未开放给 Agent → 409 `AGENT_NOT_READY`。  
若重复使用同一 Idempotency-Key → 返回已有分析（200），不重复写入。

### 4.8 评论

```http
POST /v1/requirements/REQ-003/comments
Authorization: Bearer <token>
Content-Type: application/json

{
  "agent": { "name": "Codex", "kind": "codex" },
  "body": "请补充目标用户和失败场景。"
}
```

### 4.9 更新状态

需要应用中开启“允许 Agent 修改需求状态”。

```http
PATCH /v1/requirements/REQ-003
Authorization: Bearer <token>
Content-Type: application/json

{
  "agent": { "name": "Codex", "kind": "codex" },
  "status": "review"
}
```

只允许 `status`；其他字段返回 403。  
Agent 不能编辑标题、描述、验收标准、优先级、标签，不能采纳分析。

### 4.10 活动

```http
GET /v1/activity?limit=50
Authorization: Bearer <token>
```

### 4.11 错误格式

```json
{
  "ok": false,
  "error": {
    "code": "CLAIM_CONFLICT",
    "message": "需求已被 Codex 领取",
    "details": { "claimedBy": "Codex", "expiresAt": "2026-11-26T14:00:00.000Z" }
  }
}
```

Agent 应根据 `code` 决策，不要解析中文 `message`。

常见错误：

| code | 行动 |
| --- | --- |
| `UNAUTHORIZED` | 提示用户更新 Token，不要重试旧配置 |
| `AGENT_NOT_READY` | 停止；让用户打开“开放给 Agent” |
| `CLAIM_CONFLICT` | 停止；报告当前领取者/过期时间 |
| `REQUIREMENT_DONE` | 停止；让用户决定是否回退状态 |
| `VALIDATION_ERROR` | 修正参数：查看 details 路径 |
| 5xx | 可重试一次；仍失败则报告用户 |

---

## 5. Agent 行为规范

### 5.1 分析质量

一份好分析的形状：

- **摘要**：1–3 句话，先给判断。
- **结论**：四选一，不用“也许可以”。
- **置信度**：0–100；信息不足时低置信度 + `needs-info`。
- **步骤**：可执行、有顺序，避免“研究一下”。
- **风险**：具体到失败方式，不写“有风险”。
- **开放问题**：只列会改变决策的问题；不超过 5 个为宜。
- **事实与假设**：在 notes 中区分；不要编造预算、客户、排期。

### 5.2 领取礼仪

1. 深度阅读/分析前先领取。
2. 如果 `CLAIM_CONFLICT`，不要抢写；向用户报告。
3. 分析后立即回写；不要让领取长期空转。
4. 结束任务时释放领取；若还需要多轮评论，可保留 claim。
5. 不要替用户采纳分析，不要自动把需求标记完成。

### 5.3 多 Agent 协作

- 同一需求只应有一个有效分析者。
- 不同 Agent 可以先后分析；历史分析保留。
- 如需对已有分析提出异议，提交新分析并在 notes 中引用前一条，而不是覆盖。
- 人类采纳一条后，其他分析仍保留作为反例/上下文。

---

## 6. 故障排查

| 现象 | 检查 |
| --- | --- |
| `ECONNREFUSED` | 应用是否运行；Bridge 是否在线；端口正确 |
| `401` | Token 是否复制完整；是否刚轮换过 |
| Agent 看不到工具 | MCP 配置路径/JSON 语法；重启 Agent；node 绝对路径 |
| `EADDRINUSE`（应用） | 改端口；关闭占用程序 |
| 分析没出现在 UI | 刷新/重开详情；看应用日志；确认 API 返回 201 |
| 领取一直过期 | 检查系统时间；TTL；应用快照时间 |
| MCP 启动报错 | 在终端直接运行 `node <mcp路径>` 查看依赖/模块错误 |

> 将 MCP Token 放在用户级配置中，并把项目 `.mcp.json` 加入 `.gitignore`，可以显著降低泄漏风险。

---

## 7. 机器可读工具清单

MCP 工具名：

- `pulse_board_summary`
- `pulse_list_requirements`
- `pulse_get_requirement`
- `pulse_claim_requirement`
- `pulse_release_requirement`
- `pulse_submit_analysis`
- `pulse_add_comment`
- `pulse_update_status`

HTTP 与 MCP 的字段语义一致；数据以应用内当前快照为准。

协议版本变更遵循：先加字段，后废弃；破坏性变更提升 `/v2`，并在 CHANGELOG 标注。
