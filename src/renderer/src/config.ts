import {
  AGENT_KIND_LABELS,
  getRecommendationMeta,
  getStatusMeta
} from '@shared/types'
import type { BridgeInfo, Requirement } from '@shared/types'

export interface ConfigTemplate {
  id: 'claude' | 'codex' | 'deepseek' | 'http'
  label: string
  fileName: string
  intro: string
  steps: string[]
  language: 'json' | 'toml' | 'bash'
  code: string
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

export function buildConfigTemplates(bridge: BridgeInfo): ConfigTemplate[] {
  const token = bridge.token
  const url = bridge.url
  const mcpPath = bridge.mcpServerPath || '<Requirement Pulse 安装目录>/resources/mcp/index.mjs'
  const serverName = 'requirement-pulse'

  const claudeConfig = {
    mcpServers: {
      [serverName]: {
        command: 'node',
        args: [mcpPath],
        env: {
          PULSE_BRIDGE_URL: url,
          PULSE_BRIDGE_TOKEN: token,
          PULSE_AGENT_NAME: 'Claude Code',
          PULSE_AGENT_KIND: 'claude-code'
        }
      }
    }
  }

  const deepseekConfig = {
    mcpServers: {
      [serverName]: {
        command: 'node',
        args: [mcpPath],
        env: {
          PULSE_BRIDGE_URL: url,
          PULSE_BRIDGE_TOKEN: token,
          PULSE_AGENT_NAME: 'DeepSeek',
          PULSE_AGENT_KIND: 'deepseek'
        }
      }
    }
  }

  const codexConfig = `[mcp_servers.${serverName}]
command = "node"
args = [${tomlString(mcpPath)}]

[mcp_servers.${serverName}.env]
PULSE_BRIDGE_URL = ${tomlString(url)}
PULSE_BRIDGE_TOKEN = ${tomlString(token)}
PULSE_AGENT_NAME = "Codex"
PULSE_AGENT_KIND = "codex"
`

  const httpCode = `# 1. 查看开放给 Agent 的需求
curl -sS "${url}/v1/requirements?agentReady=true" \\
  -H "Authorization: Bearer ${token}"

# 2. 读取完整需求与上下文
curl -sS "${url}/v1/requirements/REQ-003" \\
  -H "Authorization: Bearer ${token}"

# 3. 领取需求（返回 409 表示被其他 Agent 占用）
curl -sS -X POST "${url}/v1/requirements/REQ-003/claim" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: claim-$(date +%s)" \\
  -d '{"agent":{"name":"Claude Code","kind":"claude-code","model":"claude-sonnet-5-5"},"ttlMinutes":90}'

# 4. 回写结构化分析
curl -sS -X POST "${url}/v1/requirements/REQ-003/analyses" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: analysis-$(date +%s)" \\
  -d '{"agent":{"name":"Claude Code","kind":"claude-code","model":"claude-sonnet-5-5"},"summary":"建议先统一状态机，再拆出迁移脚本。","recommendation":"proceed","confidence":78,"estimatedEffort":"M","proposedSteps":["补齐状态迁移约束","增加导入校验"],"risks":["旧数据缺少时间戳"],"openQuestions":["是否需要兼容上一次导出格式？"]}'

# 5. 释放领取
curl -sS -X DELETE "${url}/v1/requirements/REQ-003/claim" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":{"name":"Claude Code","kind":"claude-code"}}'`

  return [
    {
      id: 'claude',
      label: 'Claude Code',
      fileName: '.mcp.json（项目根目录）',
      intro: '在需要协作的项目里放入 .mcp.json，Claude Code 会以 stdio 方式启动本地 MCP 服务。',
      steps: [
        '确认已安装 Node.js 20 或更高版本。',
        '在项目根目录新建或合并 .mcp.json。',
        '重新打开 Claude Code，使用 /mcp 检查 requirement-pulse 是否已连接。'
      ],
      language: 'json',
      code: `${JSON.stringify(claudeConfig, null, 2)}\n`
    },
    {
      id: 'codex',
      label: 'Codex',
      fileName: '~/.codex/config.toml',
      intro: 'Codex 使用 TOML 配置 MCP 服务。把下面内容合并到用户级 config.toml。',
      steps: [
        '确认 Node.js 20 或更高版本可用。',
        '合并配置后重启 Codex。',
        '用 codex mcp list 验证 requirement-pulse。'
      ],
      language: 'toml',
      code: codexConfig
    },
    {
      id: 'deepseek',
      label: 'DeepSeek / 通用 MCP',
      fileName: '客户端 MCP 配置',
      intro: '兼容标准 MCP stdio 配置的客户端可以直接使用这份 JSON，字段名以客户端文档为准。',
      steps: [
        '找到客户端自定义 MCP Server 的配置文件。',
        '粘贴 mcpServers 配置并按需合并。',
        '重启客户端，确认工具列表包含 pulse_ 前缀的工具。'
      ],
      language: 'json',
      code: `${JSON.stringify(deepseekConfig, null, 2)}\n`
    },
    {
      id: 'http',
      label: '直接 HTTP',
      fileName: '终端 / 任意 HTTP 客户端',
      intro: '不适合 MCP 的 Agent 可以直接调用本地 HTTP 桥接。所有写操作都需要 Bearer Token。',
      steps: [
        '桥接只监听 127.0.0.1，不会暴露到局域网。',
        '每次写请求建议携带 Idempotency-Key，重试不会重复写入。',
        '机器重启或令牌轮换后，旧令牌立即失效。'
      ],
      language: 'bash',
      code: `${httpCode}\n`
    }
  ]
}

export function buildAgentBrief(requirement: Requirement): string {
  const status = getStatusMeta(requirement.status)
  const analyses = requirement.analyses.length
    ? requirement.analyses
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((analysis) => {
          const lines = [
            `### ${analysis.agent.name}（${
              AGENT_KIND_LABELS[analysis.agent.kind] ?? analysis.agent.kind
            }）· ${getRecommendationMeta(analysis.recommendation).label}${
              analysis.confidence !== undefined ? ` · 置信度 ${analysis.confidence}%` : ''
            }`,
            '',
            analysis.summary
          ]
          if (analysis.proposedSteps.length) {
            lines.push(
              '',
              '**建议步骤**',
              ...analysis.proposedSteps.map((step, index) => `${index + 1}. ${step}`)
            )
          }
          if (analysis.risks.length) {
            lines.push('', '**风险**', ...analysis.risks.map((risk) => `- ${risk}`))
          }
          if (analysis.openQuestions.length) {
            lines.push(
              '',
              '**开放问题**',
              ...analysis.openQuestions.map((question) => `- ${question}`)
            )
          }
          if (analysis.notes) lines.push('', analysis.notes)
          return lines.join('\n')
        })
        .join('\n\n')
    : '（暂无）'

  return `# ${requirement.code} · ${requirement.title}

状态：${status.label}　优先级：${requirement.priority}
标签：${requirement.tags.length ? requirement.tags.join('、') : '无'}
开放给 Agent：${requirement.agentReady ? '是' : '否'}
创建：${requirement.createdAt}　更新：${requirement.updatedAt}

## 需求描述

${requirement.description || '（未填写）'}

## 验收标准

${requirement.acceptanceCriteria || '（未填写）'}

## 已有分析

${analyses}

## 工作协议

1. 使用 pulse_get_requirement 读取完整需求。
2. 深度分析前先使用 pulse_claim_requirement 领取；如冲突，停止并报告。
3. 产出结构化分析：summary、recommendation、confidence、proposedSteps、risks、openQuestions、notes。
4. 使用 pulse_submit_analysis 回写，建议携带 Idempotency-Key。
5. 不要修改代码文件或替代人做采纳决定；完成后释放领取。
`
}
