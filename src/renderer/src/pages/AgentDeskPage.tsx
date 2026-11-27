import { useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Link } from 'react-router-dom'
import {
  Activity,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  KeyRound,
  Plug,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
  WifiOff
} from 'lucide-react'
import { GITHUB_URL } from '@shared/types'
import { applySnapshot, describeError, requireApi, useAppStore } from '../store'
import { useNow } from '../hooks'
import { buildConfigTemplates } from '../config'
import { formatRelative } from '../format'
import { AgentAvatar, agentKindLabel } from '../components/AgentBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { copyText, toast } from '../components/Toast'
import { Button, EmptyState, cn } from '../components/ui'

const MCP_TOOLS = [
  ['pulse_board_summary', '读取所有列的数量、活跃领取与待验收统计'],
  ['pulse_list_requirements', '按状态、优先级、标签或关键词筛选需求'],
  ['pulse_get_requirement', '读取完整需求、分析与 Markdown 上下文'],
  ['pulse_claim_requirement', '领取需求，避免多个 Agent 同时写同一份分析'],
  ['pulse_release_requirement', '释放领取，允许其他 Agent 接手'],
  ['pulse_submit_analysis', '回写结构化分析，可携带幂等键'],
  ['pulse_add_comment', '在需求下补充评论或追问'],
  ['pulse_update_status', '在允许时推进或回退阶段']
]

export function AgentDeskPage() {
  const snapshot = useAppStore((state) => state.snapshot)
  const settings = snapshot?.data.settings
  const now = useNow(30_000)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotating, setRotating] = useState(false)

  const templates = useMemo(
    () => (snapshot ? buildConfigTemplates(snapshot.bridge) : []),
    [snapshot]
  )

  if (!snapshot || !settings) return null

  const { bridge, data } = snapshot
  const activeAgents = data.agents
  const bridgeState = bridge.running ? 'online' : bridge.starting ? 'starting' : bridge.error ? 'error' : 'offline'

  async function restartBridge(): Promise<void> {
    setRestarting(true)
    try {
      const next = await requireApi().restartBridge()
      applySnapshot(next)
      toast(next.bridge.running ? '桥接已重启' : '桥接已停止', next.bridge.error ? 'error' : 'success')
      if (next.bridge.error) toast(next.bridge.error, 'error')
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setRestarting(false)
    }
  }

  async function rotateToken(): Promise<void> {
    setRotating(true)
    try {
      const next = await requireApi().rotateBridgeToken()
      applySnapshot(next)
      setRotateOpen(false)
      toast('令牌已轮换，旧令牌立即失效', 'success')
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="page-scroll">
      <div className="page-content agent-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">AGENT OPERATIONS</p>
            <h1 className="page-title">Agent 值守</h1>
            <p className="page-subtitle">
              本地桥接把看板变成 Agent 可读写的决策队列。分析由 Agent 写，采纳由你决定。
            </p>
          </div>
          <div className="page-header-actions">
            <a
              className="btn btn-secondary btn-sm"
              href={`${GITHUB_URL}/blob/main/docs/AGENT-PROTOCOL.md`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} aria-hidden="true" />
              <span>接入协议</span>
            </a>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={13} />}
              loading={restarting}
              onClick={() => void restartBridge()}
            >
              重启桥接
            </Button>
          </div>
        </header>

        {!settings.bridgeEnabled ? (
          <div className="notice-banner" role="status">
            <WifiOff size={16} aria-hidden="true" />
            <p>Agent 桥接已在设置中关闭。开启后才能接受 Agent 连接。</p>
            <Link to="/settings" className="notice-link">去设置</Link>
          </div>
        ) : null}

        {bridge.error ? (
          <div className="notice-banner notice-error" role="alert">
            <WifiOff size={16} aria-hidden="true" />
            <p>{bridge.error}</p>
            <button type="button" className="notice-link" onClick={() => void restartBridge()}>重试</button>
          </div>
        ) : null}

        <div className="agent-top-grid">
          <section className={cn('panel bridge-status-panel', `bridge-state-${bridgeState}`)}>
            <div className="bridge-status-top">
              <span className="bridge-orb" aria-hidden="true">
                <Radio size={19} />
              </span>
              <div>
                <p className="eyebrow">LOCAL AGENT BRIDGE</p>
                <h2>
                  {bridge.running
                    ? '本地桥接在线'
                    : bridge.starting
                      ? '正在启动桥接'
                      : bridge.error
                        ? '桥接启动失败'
                        : '本地桥接已停止'}
                </h2>
                <p className="bridge-status-copy">
                  {bridge.running
                    ? '只监听 127.0.0.1。MCP 或 HTTP 客户端可以直接读取需求并回写分析。'
                    : settings.bridgeEnabled
                      ? '点击重启，让本机 Agent 重新连接。'
                      : '在设置中开启 Agent 桥接后再启动。'}
                </p>
              </div>
              <span className={cn('bridge-state-chip', `is-${bridgeState}`)}>
                <span className={cn('bridge-status-dot', bridge.running ? 'dot-online' : bridge.error ? 'dot-error' : 'dot-offline')} aria-hidden="true" />
                {bridge.running ? 'RUNNING' : bridge.starting ? 'STARTING' : 'STOPPED'}
              </span>
            </div>

            <dl className="bridge-facts">
              <div>
                <dt>端点</dt>
                <dd className="mono">{bridge.url}</dd>
              </div>
              <div>
                <dt>端口</dt>
                <dd className="mono">{bridge.port}</dd>
              </div>
              <div>
                <dt>MCP Server</dt>
                <dd>
                  {bridge.mcpServerReady ? (
                    <span className="inline-status is-ok"><ShieldCheck size={13} aria-hidden="true" /> 已就绪</span>
                  ) : (
                    <span className="inline-status is-warn"><Terminal size={13} aria-hidden="true" /> 未构建</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>已接入 Agent</dt>
                <dd>{activeAgents.length} 个</dd>
              </div>
            </dl>

            {!bridge.mcpServerReady ? (
              <div className="mcp-missing">
                <p>MCP Server 还未构建。开发环境下运行：</p>
                <code>npm run mcp:build</code>
                <p className="mono path-text">{bridge.mcpServerPath}</p>
              </div>
            ) : (
              <p className="bridge-path mono" title={bridge.mcpServerPath}>
                {bridge.mcpServerPath}
              </p>
            )}
          </section>

          <section className="panel token-panel">
            <header className="panel-heading">
              <h2>访问令牌</h2>
              <span className="panel-hint">Bearer Token</span>
            </header>
            <p className="token-description">
              所有读写请求都必须携带这个令牌。它只存在于本机数据文件，不会包含在导出中。
            </p>
            <div className="token-field">
              <code className={cn('token-value', !tokenVisible && 'is-masked')}>
                {tokenVisible ? bridge.token : `${bridge.token.slice(0, 5)}${'•'.repeat(26)}${bridge.token.slice(-4)}`}
              </code>
              <button
                type="button"
                className="icon-btn icon-btn-md"
                aria-label={tokenVisible ? '隐藏令牌' : '显示令牌'}
                title={tokenVisible ? '隐藏令牌' : '显示令牌'}
                onClick={() => setTokenVisible((current) => !current)}
              >
                {tokenVisible ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-md"
                aria-label="复制令牌"
                title="复制令牌"
                onClick={() => void copyText(bridge.token, '访问令牌已复制')}
              >
                <Copy size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="token-actions">
              <Button variant="ghost" size="sm" icon={<KeyRound size={13} />} onClick={() => setRotateOpen(true)}>
                轮换令牌
              </Button>
              <button
                type="button"
                className="link-button"
                onClick={() => void copyText(bridge.url, '桥接地址已复制')}
              >
                复制端点
              </button>
            </div>
            <div className="security-note">
              <ShieldCheck size={15} aria-hidden="true" />
              <p>不要把令牌提交到 Git 仓库、截图或公开文档。轮换后，旧令牌立即失效。</p>
            </div>
          </section>
        </div>

        <section className="panel config-panel" aria-labelledby="config-heading">
          <header className="panel-heading config-header">
            <div className="panel-heading-title">
              <h2 id="config-heading">接入配置</h2>
              <span className="count-pill">4</span>
            </div>
            <span className="panel-hint">复制后粘贴到对应客户端</span>
          </header>

          <Tabs.Root defaultValue="claude" className="config-tabs">
            <Tabs.List className="tabs-list" aria-label="Agent 接入方式">
              {templates.map((template) => (
                <Tabs.Trigger key={template.id} value={template.id} className="tab-trigger">
                  {template.id === 'http' ? <Server size={14} aria-hidden="true" /> : <Plug size={14} aria-hidden="true" />}
                  {template.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            {templates.map((template) => (
              <Tabs.Content key={template.id} value={template.id} className="tab-content">
                <div className="config-intro">
                  <div>
                    <h3>{template.label}</h3>
                    <p>{template.intro}</p>
                  </div>
                  <span className="config-file"><FileJson size={12} aria-hidden="true" /> {template.fileName}</span>
                </div>

                <ol className="config-steps">
                  {template.steps.map((step, index) => (
                    <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>
                  ))}
                </ol>

                <div className="code-block">
                  <div className="code-block-header">
                    <span className="mono">{template.fileName}</span>
                    <button
                      type="button"
                      className="code-copy"
                      onClick={() => void copyText(template.code, `${template.label} 配置已复制`)}
                    >
                      <Copy size={13} aria-hidden="true" />
                      复制配置
                    </button>
                  </div>
                  <pre className="code-pre"><code>{template.code}</code></pre>
                </div>
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </section>

        <div className="agent-lower-grid">
          <section className="panel roster-panel" aria-labelledby="roster-heading">
            <header className="panel-heading">
              <div className="panel-heading-title">
                <h2 id="roster-heading">Agent 名册</h2>
                <span className="count-pill">{activeAgents.length}</span>
              </div>
              <span className="panel-hint">首次写入后自动出现</span>
            </header>
            {activeAgents.length > 0 ? (
              <ul className="agent-roster">
                {activeAgents.map((agent) => (
                  <li key={agent.key} className="agent-roster-item">
                    <AgentAvatar agent={{ name: agent.name, kind: agent.kind }} size="md" />
                    <div className="agent-roster-main">
                      <div className="agent-roster-name-row">
                        <strong>{agent.name}</strong>
                        <span className={`agent-kind-chip agent-kind-${agent.kind}`}>{agentKindLabel(agent.kind)}</span>
                      </div>
                      <p className="agent-roster-meta">
                        {agent.model ? <span className="mono">{agent.model}</span> : <span>模型未标注</span>}
                        <span className="dot-separator" aria-hidden="true">·</span>
                        <span><Clock size={11} aria-hidden="true" /> {formatRelative(agent.lastSeenAt, now)}</span>
                      </p>
                    </div>
                    <div className="agent-roster-stats">
                      <span><Sparkles size={11} aria-hidden="true" /> {agent.analysisCount}</span>
                      <span><Activity size={11} aria-hidden="true" /> {agent.commentCount}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Radio size={20} />}
                title="还没有 Agent 接入"
                description="复制上方配置到 Claude Code、Codex 或 DeepSeek，让它们读取一条开放的需求。首次成功写回分析后，这里会出现记录。"
              />
            )}
          </section>

          <section className="panel tools-panel" aria-labelledby="tools-heading">
            <header className="panel-heading">
              <div className="panel-heading-title">
                <h2 id="tools-heading">Agent 可用工具</h2>
                <span className="count-pill">{MCP_TOOLS.length}</span>
              </div>
            </header>
            <ul className="tool-list">
              {MCP_TOOLS.map(([name, description]) => (
                <li key={name}>
                  <code>{name}</code>
                  <p>{description}</p>
                </li>
              ))}
            </ul>
            <p className="tools-note">
              MCP 服务只是本地桥接的薄封装。Agent 不会直接读写 board.json，也无法获得其他文件权限。
            </p>
          </section>
        </div>

        <section className="panel security-panel" aria-labelledby="security-heading">
          <header className="panel-heading">
            <h2 id="security-heading">安全检查</h2>
            <span className="inline-status is-ok"><Wifi size={13} aria-hidden="true" /> 仅本机回环</span>
          </header>
          <div className="security-grid">
            <div>
              <h3>网络边界</h3>
              <p>只绑定 127.0.0.1，不监听局域网地址；Host 头也会校验为回环地址。</p>
            </div>
            <div>
              <h3>认证</h3>
              <p>所有业务端点要求 Bearer Token。令牌以 SHA-256 摘要比较，轮换即时生效。</p>
            </div>
            <div>
              <h3>写入约束</h3>
              <p>请求体上限 512 KiB；写请求必须使用 JSON；不接受 CORS 跨域浏览请求。</p>
            </div>
            <div>
              <h3>人工边界</h3>
              <p>Agent 不能采纳分析、不能编辑标题或验收标准、不能修改 Agent 就绪状态。</p>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title="轮换访问令牌？"
        description="所有正在使用旧令牌的 Agent 会在下一次请求时被拒绝。你需要把新令牌更新到每个 MCP 配置中。"
        confirmLabel="轮换令牌"
        tone="danger"
        pending={rotating}
        onConfirm={() => void rotateToken()}
      />
    </div>
  )
}
