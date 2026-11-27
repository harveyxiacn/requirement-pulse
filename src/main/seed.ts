import type {
  Activity,
  AgentRecord,
  Analysis,
  Comment,
  Requirement
} from '@shared/types'

export interface SeedWorkspace {
  requirements: Requirement[]
  activities: Activity[]
  agents: AgentRecord[]
  nextRequirementSequence: number
}

const HUMAN = { kind: 'human' as const, name: '本地用户' }
const CLAUDE = { name: 'Claude Code', kind: 'claude-code', model: 'claude-sonnet-5-5' }
const CODEX = { name: 'Codex', kind: 'codex', model: 'gpt-5-codex' }
const DEEPSEEK = { name: 'DeepSeek', kind: 'deepseek', model: 'deepseek-v4' }

export function createSeedWorkspace(now = new Date()): SeedWorkspace {
  const nowMs = now.getTime()
  const iso = (minutesAgo: number): string =>
    new Date(nowMs - minutesAgo * 60_000).toISOString()

  const claudeAnalysis1: Analysis = {
    id: 'seed-analysis-001',
    agent: CLAUDE,
    summary:
      '闭环清晰，适合先做“领取 → 分析 → 回写 → 采纳”的最小链路。比较视图可以后置，但分析结构必须先稳定。',
    recommendation: 'proceed',
    confidence: 82,
    estimatedEffort: 'M',
    proposedSteps: [
      '定义分析结构：结论、置信度、步骤、风险、开放问题',
      '打通领取与冲突保护，确保同一需求只有一个活跃分析者',
      '实现人工采纳，并把采纳结论显示在卡片与详情',
      '最后补 Agent 工作台和配置生成，降低接入成本'
    ],
    risks: [
      '若分析结构频繁变化，旧数据会失去可比性，接口需要初始版本化',
      '采纳与状态流转不能自动绑定，否则会削弱人工裁决权'
    ],
    openQuestions: [
      '比较视图是否要在 v0.1 就支持并排 diff？',
      '分析是否需要记录模型与 token 成本？'
    ],
    notes:
      '**判断**：先把人和 Agent 的回路闭合，再优化比较。当前需求本身已经接近可执行的边界。',
    createdAt: iso(55)
  }

  const deepseekAnalysis1: Analysis = {
    id: 'seed-analysis-002',
    agent: DEEPSEEK,
    summary:
      '产品方向成立，但“比较”的定义还不够具体。暂时不建议把并排比较列为硬门槛；先确认分析字段和采纳后的下游行为。',
    recommendation: 'needs-info',
    confidence: 58,
    estimatedEffort: 'M',
    proposedSteps: [
      '先明确“采纳”之后需求状态是否自动变化',
      '确认多分析并存时的排序规则',
      '决定是否保留被拒绝分析的长期历史'
    ],
    risks: [
      '把比较做成视觉并排但没有结构化字段，会退化成聊天记录截图'
    ],
    openQuestions: [
      '采纳后是否允许覆盖？覆盖是否保留旧决策记录？',
      '一个需求预计会收到几份分析：2 份还是 10 份？'
    ],
    notes: '如果回答不了这两个问题，先收窄到“单分析 + 人工采纳”更稳。',
    createdAt: iso(126)
  }

  const claudeAnalysis3: Analysis = {
    id: 'seed-analysis-003',
    agent: CLAUDE,
    summary:
      '导出/恢复的边界可以很小：完整 JSON 往返、导入前备份、Token 不进入导出文件。已经足够覆盖本地可靠性需求。',
    recommendation: 'proceed',
    confidence: 86,
    estimatedEffort: 'S',
    proposedSteps: [
      '定义导出 payload 和版本号',
      '导入前做 schema 校验并强制备份',
      '保留本机 Bridge 配置，避免导入别人的 Token',
      '导入后广播一次完整快照'
    ],
    risks: ['Windows 文件占用时可能无法覆盖，需要清晰的错误提示'],
    openQuestions: [],
    notes: '**已落地**：导出文件不包含 Token，导入时保留当前 Bridge 配置。',
    createdAt: iso(2 * 24 * 60 + 80)
  }

  const codexComment: Comment = {
    id: 'seed-comment-001',
    author: { kind: 'agent', name: 'Codex', agentKind: 'codex', model: 'gpt-5-codex' },
    body: '已读取接入协议，正在把 Claude Code、Codex 与通用 MCP 的配置模板收敛到同一套环境变量。',
    createdAt: iso(12)
  }

  const humanComment: Comment = {
    id: 'seed-comment-002',
    author: HUMAN,
    body: '两份判断的差异在“比较是不是首版硬门槛”。先保留这个分歧，实现时按闭环优先。',
    createdAt: iso(184)
  }

  const requirements: Requirement[] = [
    {
      id: 'seed-req-001',
      code: 'REQ-001',
      title: '把 Agent 分析沉淀为可比较的决策卡',
      description:
        '不同 Agent 的判断散落在各自会话里，无法并排比较，也无法回看当时为什么做了这个决定。\n\n希望每条需求都能收到多份结构化分析：结论、置信度、建议步骤、风险和开放问题，并在看板上直接采纳其中一份。',
      acceptanceCriteria:
        '- [x] 一份分析包含结论、摘要、置信度、步骤、风险、开放问题\n- [x] 分析可以在需求详情中并列查看\n- [x] 采纳后在看板与详情都能看到当前结论\n- [ ] Agent 提交分析后，无需手动刷新页面',
      status: 'review',
      priority: 'critical',
      tags: ['Agent 协作', '决策'],
      source: '产品自用',
      effort: 'M',
      dueDate: new Date(nowMs + 3 * 86_400_000).toISOString().slice(0, 10),
      agentReady: true,
      claim: null,
      order: 0,
      analyses: [deepseekAnalysis1, claudeAnalysis1],
      comments: [humanComment],
      acceptedAnalysisId: claudeAnalysis1.id,
      createdBy: '本地用户',
      createdAt: iso(5 * 24 * 60),
      updatedAt: iso(48),
      completedAt: null
    },
    {
      id: 'seed-req-002',
      code: 'REQ-002',
      title: '需求详情支持键盘快速流转',
      description:
        '不想每次改状态都回到看板拖拽。详情页应该可以用键盘直接修改状态与优先级，并保持焦点可预测。\n\n需要同时照顾到自定义菜单的可访问语义。',
      acceptanceCriteria:
        '- [ ] J/K 在列表内切换需求（后续）\n- [ ] 状态菜单可用方向键操作\n- [ ] Esc 关闭菜单并返回触发按钮\n- [ ] 保存失败时焦点不丢失',
      status: 'planned',
      priority: 'high',
      tags: ['键盘', '效率'],
      source: '日常摩擦',
      effort: 'S',
      agentReady: true,
      claim: null,
      order: 0,
      analyses: [],
      comments: [],
      acceptedAnalysisId: null,
      createdBy: '本地用户',
      createdAt: iso(4 * 24 * 60),
      updatedAt: iso(5 * 60),
      completedAt: null
    },
    {
      id: 'seed-req-003',
      code: 'REQ-003',
      title: '为 Codex 和 DeepSeek 准备好接入示例',
      description:
        'Agent 工作台需要现场生成真实可用的 MCP 配置，而不是一段抽象文档。配置要覆盖 Claude Code、Codex、通用 MCP 和裸 HTTP 四种接入方式。\n\n路径、端口、Token 必须来自当前运行实例。',
      acceptanceCriteria:
        '- [x] 四类接入方式各有可复制片段\n- [x] 路径在开发版与安装版都正确\n- [ ] Token 默认遮罩，可一次性复制\n- [ ] 轮换 Token 后旧配置立即失效',
      status: 'building',
      priority: 'medium',
      tags: ['MCP', '接入'],
      source: 'Agent 协作',
      effort: 'M',
      agentReady: true,
      claim: {
        agent: CODEX,
        claimedAt: iso(20),
        expiresAt: iso(-70)
      },
      order: 0,
      analyses: [],
      comments: [codexComment],
      acceptedAnalysisId: null,
      createdBy: '本地用户',
      createdAt: iso(3 * 24 * 60),
      updatedAt: iso(12),
      completedAt: null
    },
    {
      id: 'seed-req-004',
      code: 'REQ-004',
      title: '安装包签名与自动更新',
      description:
        '当前安装包未签名，Windows SmartScreen 会打断首次安装。后续还需要一条稳定的自动更新链路。',
      acceptanceCriteria:
        '- [ ] 代码签名证书方案确定\n- [ ] 安装包签名\n- [ ] 自动更新可回滚\n- [ ] 更新失败不影响本地数据',
      status: 'inbox',
      priority: 'low',
      tags: ['发布'],
      source: '发布准备',
      agentReady: false,
      claim: null,
      order: 0,
      analyses: [],
      comments: [],
      acceptedAnalysisId: null,
      createdBy: '本地用户',
      createdAt: iso(6 * 24 * 60),
      updatedAt: iso(26 * 60),
      completedAt: null
    },
    {
      id: 'seed-req-005',
      code: 'REQ-005',
      title: '本地数据导出与恢复',
      description:
        '需求数据只存在本机。需要一种不依赖云端的备份方式，同时避免把 Bridge Token 带进导出文件。',
      acceptanceCriteria:
        '- [x] 导出完整工作区 JSON\n- [x] 导出文件不包含 Token\n- [x] 导入前自动备份当前数据\n- [x] 非法文件不覆盖现有数据',
      status: 'done',
      priority: 'medium',
      tags: ['数据', '可靠性'],
      source: '可靠性',
      effort: 'S',
      agentReady: true,
      claim: null,
      order: 0,
      analyses: [claudeAnalysis3],
      comments: [],
      acceptedAnalysisId: claudeAnalysis3.id,
      createdBy: '本地用户',
      createdAt: iso(9 * 24 * 60),
      updatedAt: iso(2 * 24 * 60),
      completedAt: iso(2 * 24 * 60)
    },
    {
      id: 'seed-req-006',
      code: 'REQ-006',
      title: 'MCP 工具描述支持中英双语',
      description:
        '不同 Agent 对中文工具描述的理解程度不稳定。需要评估是否在工具描述里同时提供中英文，而不把参数说明膨胀成文档。',
      acceptanceCriteria:
        '- [ ] 工具描述保持一行英文 + 一行中文\n- [ ] 参数说明不重复\n- [ ] 不增加明显上下文成本',
      status: 'inbox',
      priority: 'medium',
      tags: ['MCP', '文档'],
      agentReady: true,
      claim: null,
      order: 1,
      analyses: [],
      comments: [],
      acceptedAnalysisId: null,
      createdBy: '本地用户',
      createdAt: iso(2 * 24 * 60 + 120),
      updatedAt: iso(2 * 24 * 60 + 120),
      completedAt: null
    },
    {
      id: 'seed-req-007',
      code: 'REQ-007',
      title: '看板卡片显示 Agent 领取倒计时',
      description:
        '当 Agent 领取一条需求后，卡片需要显示它还要占用多久。过期后应当自动回到可领取状态，而不是一直挂着“正在分析”。',
      acceptanceCriteria:
        '- [ ] 卡片显示领取 Agent 与剩余时间\n- [ ] 剩余 15 分钟以内使用警示色 + 文字\n- [ ] TTL 到期后 UI 自动隐藏领取状态\n- [ ] 人工可以释放领取',
      status: 'building',
      priority: 'high',
      tags: ['Agent 协作', '界面'],
      effort: 'XS',
      agentReady: true,
      claim: null,
      order: 1,
      analyses: [],
      comments: [],
      acceptedAnalysisId: null,
      createdBy: '本地用户',
      createdAt: iso(2 * 24 * 60),
      updatedAt: iso(4 * 60),
      completedAt: null
    }
  ]

  let activityIndex = 0
  const activity = (
    minutesAgo: number,
    type: Activity['type'],
    actor: Activity['actor'],
    message: string,
    extra: Partial<Activity> = {}
  ): Activity => ({
    id: `seed-activity-${String(++activityIndex).padStart(3, '0')}`,
    type,
    actor,
    message,
    createdAt: iso(minutesAgo),
    ...extra
  })

  const activities: Activity[] = [
    activity(12, 'comment.added', { kind: 'agent', name: 'Codex', agentKind: 'codex' }, 'Codex 评论了 REQ-003「为 Codex 和 DeepSeek 准备好接入示例」', {
      requirementId: 'seed-req-003',
      requirementCode: 'REQ-003'
    }),
    activity(20, 'claim.created', { kind: 'agent', name: 'Codex', agentKind: 'codex' }, 'Codex 领取了 REQ-003，本次领取 90 分钟', {
      requirementId: 'seed-req-003',
      requirementCode: 'REQ-003',
      metadata: { ttlMinutes: 90 }
    }),
    activity(55, 'analysis.submitted', { kind: 'agent', name: 'Claude Code', agentKind: 'claude-code' }, 'Claude Code 提交了对 REQ-001 的分析：推进', {
      requirementId: 'seed-req-001',
      requirementCode: 'REQ-001'
    }),
    activity(50, 'analysis.accepted', { kind: 'human', name: '本地用户' }, '本地用户采纳了 Claude Code 对 REQ-001 的分析', {
      requirementId: 'seed-req-001',
      requirementCode: 'REQ-001'
    }),
    activity(126, 'analysis.submitted', { kind: 'agent', name: 'DeepSeek', agentKind: 'deepseek' }, 'DeepSeek 提交了对 REQ-001 的分析：补充信息', {
      requirementId: 'seed-req-001',
      requirementCode: 'REQ-001'
    }),
    activity(184, 'comment.added', { kind: 'human', name: '本地用户' }, '本地用户在 REQ-001 下添加了评论', {
      requirementId: 'seed-req-001',
      requirementCode: 'REQ-001'
    }),
    activity(240, 'requirement.status_changed', { kind: 'human', name: '本地用户' }, 'REQ-001 移到「待验收」', {
      requirementId: 'seed-req-001',
      requirementCode: 'REQ-001'
    }),
    activity(4 * 60, 'requirement.status_changed', { kind: 'human', name: '本地用户' }, 'REQ-007 移到「进行中」', {
      requirementId: 'seed-req-007',
      requirementCode: 'REQ-007'
    }),
    activity(5 * 60, 'requirement.updated', { kind: 'human', name: '本地用户' }, '更新了 REQ-002 的验收标准', {
      requirementId: 'seed-req-002',
      requirementCode: 'REQ-002'
    }),
    activity(2 * 24 * 60, 'requirement.status_changed', { kind: 'human', name: '本地用户' }, 'REQ-005 移到「已完成」', {
      requirementId: 'seed-req-005',
      requirementCode: 'REQ-005'
    }),
    activity(2 * 24 * 60 + 120, 'requirement.created', { kind: 'human', name: '本地用户' }, '创建了 REQ-006「MCP 工具描述支持中英双语」', {
      requirementId: 'seed-req-006',
      requirementCode: 'REQ-006'
    }),
    activity(3 * 24 * 60, 'requirement.created', { kind: 'human', name: '本地用户' }, '创建了 REQ-003「为 Codex 和 DeepSeek 准备好接入示例」', {
      requirementId: 'seed-req-003',
      requirementCode: 'REQ-003'
    }),
    activity(4 * 24 * 60, 'requirement.created', { kind: 'human', name: '本地用户' }, '创建了 REQ-002「需求详情支持键盘快速流转」', {
      requirementId: 'seed-req-002',
      requirementCode: 'REQ-002'
    }),
    activity(5 * 24 * 60, 'requirement.created', { kind: 'human', name: '本地用户' }, '创建了 REQ-001「把 Agent 分析沉淀为可比较的决策卡」', {
      requirementId: 'seed-req-001',
      requirementCode: 'REQ-001'
    })
  ]

  const agents: AgentRecord[] = [
    {
      key: 'claude-code:claude code',
      name: 'Claude Code',
      kind: 'claude-code',
      model: CLAUDE.model,
      firstSeenAt: iso(9 * 24 * 60),
      lastSeenAt: iso(48),
      analysisCount: 2,
      commentCount: 0
    },
    {
      key: 'codex:codex',
      name: 'Codex',
      kind: 'codex',
      model: CODEX.model,
      firstSeenAt: iso(3 * 24 * 60),
      lastSeenAt: iso(12),
      analysisCount: 0,
      commentCount: 1
    },
    {
      key: 'deepseek:deepseek',
      name: 'DeepSeek',
      kind: 'deepseek',
      model: DEEPSEEK.model,
      firstSeenAt: iso(126),
      lastSeenAt: iso(126),
      analysisCount: 1,
      commentCount: 0
    }
  ]

  return { requirements, activities, agents, nextRequirementSequence: 8 }
}
