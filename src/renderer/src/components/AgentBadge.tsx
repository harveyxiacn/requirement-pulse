import { Bot, Sparkles, Terminal, Waves } from 'lucide-react'
import type { AgentRef, Actor } from '@shared/types'
import { AGENT_KIND_LABELS } from '@shared/types'
import { cn } from './ui'

export function agentKindLabel(kind: string): string {
  return AGENT_KIND_LABELS[kind] ?? kind
}

function agentIcon(kind: string): typeof Bot {
  if (kind === 'claude-code') return Sparkles
  if (kind === 'codex') return Terminal
  if (kind === 'deepseek') return Waves
  return Bot
}

export function AgentAvatar({
  agent,
  size = 'md',
  className
}: {
  agent: Pick<AgentRef, 'name' | 'kind'>
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = agentIcon(agent.kind)
  const known = ['claude-code', 'codex', 'deepseek'].includes(agent.kind)
  return (
    <span
      className={cn('agent-avatar', `agent-avatar-${size}`, known ? `agent-kind-${agent.kind}` : 'agent-kind-generic', className)}
      title={`${agent.name} · ${agentKindLabel(agent.kind)}`}
      aria-hidden="true"
    >
      <Icon size={size === 'lg' ? 18 : size === 'sm' ? 11 : 14} strokeWidth={1.9} />
    </span>
  )
}

export function ActorAvatar({ actor, size = 'md' }: { actor: Actor; size?: 'sm' | 'md' | 'lg' }) {
  if (actor.kind === 'agent') {
    return (
      <AgentAvatar
        agent={{ name: actor.name, kind: actor.agentKind ?? 'generic' }}
        size={size}
      />
    )
  }
  if (actor.kind === 'system') {
    return (
      <span className={cn('agent-avatar', `agent-avatar-${size}`, 'agent-kind-system')} aria-hidden="true">
        <Bot size={size === 'lg' ? 18 : 14} strokeWidth={1.9} />
      </span>
    )
  }
  return (
    <span className={cn('agent-avatar', `agent-avatar-${size}`, 'agent-kind-human')} aria-hidden="true">
      {actor.name.trim().slice(0, 1) || '人'}
    </span>
  )
}

export function actorText(actor: Actor): string {
  if (actor.kind === 'agent') return `${actor.name} · ${agentKindLabel(actor.agentKind ?? 'generic')}`
  if (actor.kind === 'system') return '系统'
  return actor.name
}
