import { Check, CheckCircle2, CircleHelp, ListChecks, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react'
import { EFFORT_LABELS, getRecommendationMeta } from '@shared/types'
import type { Analysis } from '@shared/types'
import { formatRelative } from '../format'
import { AgentAvatar, agentKindLabel } from './AgentBadge'
import { Markdown } from './Markdown'
import { Button, cn } from './ui'

export function AnalysisCard({
  analysis,
  accepted,
  now,
  onAccept,
  onUnaccept
}: {
  analysis: Analysis
  accepted: boolean
  now: number
  onAccept: () => void
  onUnaccept: () => void
}) {
  const meta = getRecommendationMeta(analysis.recommendation)
  const effort = analysis.estimatedEffort ? EFFORT_LABELS[analysis.estimatedEffort] ?? analysis.estimatedEffort : null

  return (
    <article className={cn('analysis-card', `analysis-${analysis.recommendation}`, accepted && 'is-accepted')}>
      <header className="analysis-header">
        <AgentAvatar agent={analysis.agent} size="md" />
        <div className="analysis-agent">
          <p className="analysis-agent-name">{analysis.agent.name}</p>
          <p className="analysis-agent-meta">
            {agentKindLabel(analysis.agent.kind)}
            {analysis.agent.model ? ` · ${analysis.agent.model}` : ''} · {formatRelative(analysis.createdAt, now)}
          </p>
        </div>
        <span className={cn('recommendation-badge', `recommendation-${analysis.recommendation}`)}>
          {meta.label}
        </span>
        {accepted ? (
          <span className="accepted-mark">
            <CheckCircle2 size={14} aria-hidden="true" />
            已采纳
          </span>
        ) : null}
      </header>

      <div className="analysis-meta-strip">
        {analysis.confidence !== undefined ? (
          <div className="confidence-block">
            <span className="analysis-meta-label">置信度</span>
            <span className="confidence-track" role="img" aria-label={`置信度 ${analysis.confidence}%`}>
              <span style={{ width: `${analysis.confidence}%` }} />
            </span>
            <span className="confidence-value">{analysis.confidence}%</span>
          </div>
        ) : null}
        {effort ? (
          <span className="analysis-meta-item">
            <ListChecks size={12} aria-hidden="true" />
            {effort}
          </span>
        ) : null}
        <span className="analysis-recommendation-hint">{meta.description}</span>
      </div>

      <div className="analysis-summary">
        <Markdown>{analysis.summary}</Markdown>
      </div>

      {analysis.proposedSteps.length > 0 ? (
        <section className="analysis-section">
          <h3><ListChecks size={13} aria-hidden="true" /> 建议步骤</h3>
          <ol className="analysis-steps">
            {analysis.proposedSteps.map((step, index) => (
              <li key={`${index}-${step}`}>
                <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {analysis.risks.length > 0 || analysis.openQuestions.length > 0 ? (
        <div className="analysis-columns">
          {analysis.risks.length > 0 ? (
            <section className="analysis-section">
              <h3><ShieldAlert size={13} aria-hidden="true" /> 风险</h3>
              <ul className="analysis-bullets">
                {analysis.risks.map((risk, index) => (
                  <li key={`${index}-${risk}`}>{risk}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {analysis.openQuestions.length > 0 ? (
            <section className="analysis-section">
              <h3><CircleHelp size={13} aria-hidden="true" /> 开放问题</h3>
              <ul className="analysis-bullets analysis-questions">
                {analysis.openQuestions.map((question, index) => (
                  <li key={`${index}-${question}`}>{question}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {analysis.notes ? (
        <section className="analysis-section analysis-notes">
          <h3><Sparkles size={13} aria-hidden="true" /> 备注</h3>
          <Markdown>{analysis.notes}</Markdown>
        </section>
      ) : null}

      <footer className="analysis-footer">
        {accepted ? (
          <>
            <span className="analysis-decision-copy">这条分析已作为当前决策依据。</span>
            <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={onUnaccept}>
              撤销采纳
            </Button>
          </>
        ) : (
          <>
            <span className="analysis-decision-copy">采纳是一次人工决策，会记录到活动日志。</span>
            <Button variant="secondary" size="sm" icon={<Check size={13} />} onClick={onAccept}>
              采纳此分析
            </Button>
          </>
        )}
      </footer>
    </article>
  )
}
