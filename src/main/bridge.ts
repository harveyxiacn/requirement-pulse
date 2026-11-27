import { createHash, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { APP_VERSION } from '@shared/types'
import type { ApiErrorShape, RequirementStatus } from '@shared/types'
import { toActor } from '@shared/types'
import { BoardError, toApiError } from './errors'
import {
  claimRequestSchema,
  commentRequestSchema,
  formatZodError,
  patchRequirementRequestSchema,
  prioritySchema,
  releaseClaimRequestSchema,
  statusSchema,
  analysisRequestSchema
} from './schemas'
import type { BoardService } from './service'

const MAX_BODY_BYTES = 512 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export interface BridgeStatus {
  running: boolean
  starting: boolean
  port: number
  error?: string
}

interface ApiSuccess<T> {
  ok: true
  data: T
}

interface ApiFailure {
  ok: false
  error: ApiErrorShape
}

export class AgentBridge extends EventEmitter {
  private server: Server | null = null
  private status: BridgeStatus
  private readonly service: BoardService

  constructor(service: BoardService) {
    super()
    this.service = service
    this.status = {
      running: false,
      starting: false,
      port: service.getPublicSettings().bridgePort
    }
  }

  getStatus(): BridgeStatus {
    return { ...this.status }
  }

  async configure(enabled: boolean, port: number): Promise<BridgeStatus> {
    if (!enabled) {
      await this.stop()
      if (this.status.port !== port) {
        this.status.port = port
        this.emit('status', this.getStatus())
      }
      return this.getStatus()
    }
    if (this.status.running && this.status.port === port) return this.getStatus()
    await this.stop()
    return this.start(port)
  }

  async start(port: number): Promise<BridgeStatus> {
    if (this.server && this.status.running && this.status.port === port) {
      return this.getStatus()
    }
    await this.stop()
    this.status = { running: false, starting: true, port }
    this.emit('status', this.getStatus())

    const server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })
    server.requestTimeout = 20_000
    server.headersTimeout = 10_000
    server.keepAliveTimeout = 5_000
    this.server = server

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException): void => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = (): void => {
          server.off('error', onError)
          resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, '127.0.0.1')
      })
      this.status = { running: true, starting: false, port }
      this.emit('status', this.getStatus())
      return this.getStatus()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const message =
        code === 'EADDRINUSE'
          ? `端口 ${port} 已被其他应用占用，请在设置中换一个端口`
          : error instanceof Error
            ? error.message
            : 'Bridge 启动失败'
      this.server = null
      this.status = { running: false, starting: false, port, error: message }
      this.emit('status', this.getStatus())
      try {
        server.close()
      } catch {
        // ignore
      }
      return this.getStatus()
    }
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (!server) {
      if (this.status.running || this.status.starting) {
        this.status = { ...this.status, running: false, starting: false }
        this.emit('status', this.getStatus())
      }
      return
    }
    const closed = new Promise<void>((resolve) => {
      server.close(() => resolve())
      setTimeout(resolve, 750)
    })
    server.closeAllConnections?.()
    await closed
    this.status = {
      running: false,
      starting: false,
      port: this.status.port
    }
    this.emit('status', this.getStatus())
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    applyCommonHeaders(response)
    try {
      if (!isLoopbackHost(request.headers.host)) {
        throw new BoardError('INVALID_HOST', 'Bridge 只接受本机请求', 403)
      }
      const url = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? `127.0.0.1:${this.status.port}`}`
      )
      const pathname = url.pathname

      if (pathname === '/v1/health' && request.method === 'GET') {
        sendJson(response, 200, {
          ok: true,
          data: { status: 'ok', version: APP_VERSION }
        })
        return
      }

      if (!this.isAuthorized(request)) {
        throw new BoardError('UNAUTHORIZED', 'Token 缺失或无效', 401)
      }

      const parts = pathname.split('/').filter(Boolean)
      if (parts[0] !== 'v1') {
        throw new BoardError('NOT_FOUND', '接口不存在', 404)
      }

      if (parts[1] === 'board' && request.method === 'GET') {
        this.sendSuccess(response, 200, this.service.getBoardSummary())
        return
      }

      if (parts[1] === 'activity' && request.method === 'GET') {
        const limit = numericParam(url.searchParams.get('limit'), 50, 1, 200)
        this.sendSuccess(response, 200, this.service.getActivity(limit))
        return
      }

      if (parts[1] === 'requirements') {
        await this.handleRequirements(request, response, url, parts)
        return
      }

      throw new BoardError('NOT_FOUND', '接口不存在', 404)
    } catch (error) {
      const apiError =
        error instanceof BoardError
          ? toApiError(error)
          : error && typeof error === 'object' && 'issues' in error
            ? formatZodError(error as never)
            : toApiError(error)
      const status =
        error instanceof BoardError ? error.statusCode : apiError.code === 'VALIDATION_ERROR' ? 400 : 500
      if (status >= 500) {
        console.error('[bridge] request failed:', safeMessage(error))
      }
      sendError(
        response,
        status,
        apiError.code === 'VALIDATION_ERROR' && 'details' in apiError
          ? apiError
          : apiError
      )
    }
  }

  private async handleRequirements(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    parts: string[]
  ): Promise<void> {
    const method = request.method ?? 'GET'
    if (parts.length === 2) {
      if (method !== 'GET') {
        throw new BoardError('METHOD_NOT_ALLOWED', '仅支持 GET', 405)
      }
      const status = optionalEnum(url.searchParams.get('status'), statusSchema)
      const priority = optionalEnum(url.searchParams.get('priority'), prioritySchema)
      const agentReadyParam = url.searchParams.get('agentReady')
      const agentReady =
        agentReadyParam === null
          ? undefined
          : agentReadyParam === 'true'
            ? true
            : agentReadyParam === 'false'
              ? false
              : (() => {
                  throw new BoardError(
                    'VALIDATION_ERROR',
                    'agentReady 必须是 true 或 false',
                    400
                  )
                })()
      const limit = numericParam(url.searchParams.get('limit'), 50, 1, 200)
      const sortParam = url.searchParams.get('sort')
      const sort =
        sortParam === 'priority' || sortParam === 'code' || sortParam === 'updated'
          ? sortParam
          : undefined
      this.sendSuccess(
        response,
        200,
        this.service.listRequirementSummaries({
          status,
          priority,
          agentReady,
          q: url.searchParams.get('q') ?? undefined,
          limit,
          updatedSince: url.searchParams.get('updatedSince') ?? undefined,
          sort
        })
      )
      return
    }

    const id = decodeURIComponent(parts[2] ?? '')
    const sub = parts[3]
    if (!id) throw new BoardError('NOT_FOUND', '需求不存在', 404)

    if (!sub) {
      if (method === 'GET') {
        this.sendSuccess(response, 200, {
          requirement: this.service.getRequirement(id),
          briefMarkdown: this.service.getBrief(id)
        })
        return
      }
      if (method === 'PATCH') {
        const body = patchRequirementRequestSchema.parse(await readJson(request))
        const requirement = await this.service.updateStatusByAgent(
          id,
          body.status,
          body.agent
        )
        this.sendSuccess(response, 200, { requirement })
        return
      }
      throw new BoardError('METHOD_NOT_ALLOWED', '仅支持 GET 或 PATCH', 405)
    }

    if (sub === 'brief' && method === 'GET') {
      const brief = this.service.getBrief(id)
      response.writeHead(200, {
        ...commonSecurityHeaders(),
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      response.end(brief)
      return
    }

    if (sub === 'claim') {
      if (method === 'POST') {
        const body = claimRequestSchema.parse(await readJson(request))
        const result = await this.service.claimRequirement(
          id,
          body.agent,
          body.ttlMinutes ?? 90
        )
        this.sendSuccess(response, 200, {
          claim: result.claim,
          requirement: this.service.getRequirement(id)
        })
        return
      }
      if (method === 'DELETE') {
        const body = releaseClaimRequestSchema.parse(await readJson(request))
        const requirement = await this.service.releaseClaim(id, toActor(body.agent))
        this.sendSuccess(response, 200, { released: true, requirement })
        return
      }
      throw new BoardError('METHOD_NOT_ALLOWED', '仅支持 POST 或 DELETE', 405)
    }

    if (sub === 'analyses' && method === 'POST') {
      const body = analysisRequestSchema.parse(await readJson(request))
      const idempotencyKey = readIdempotencyKey(request)
      const result = await this.service.submitAnalysis(
        id,
        {
          summary: body.summary,
          recommendation: body.recommendation,
          confidence: body.confidence,
          estimatedEffort: body.estimatedEffort,
          proposedSteps: body.proposedSteps,
          risks: body.risks,
          openQuestions: body.openQuestions,
          notes: body.notes
        },
        body.agent,
        idempotencyKey
      )
      this.sendSuccess(response, 201, {
        analysis: result.analysis,
        requirement: this.service.getRequirement(id)
      })
      return
    }

    if (sub === 'comments' && method === 'POST') {
      const body = commentRequestSchema.parse(await readJson(request))
      const idempotencyKey = readIdempotencyKey(request)
      const comment = await this.service.addComment(
        id,
        body.body,
        toActor(body.agent),
        idempotencyKey
      )
      this.sendSuccess(response, 201, {
        comment,
        requirement: this.service.getRequirement(id)
      })
      return
    }

    if (sub === 'status' && method === 'PATCH') {
      const body = patchRequirementRequestSchema.parse(await readJson(request))
      const status = body.status as RequirementStatus
      const requirement = await this.service.updateStatusByAgent(id, status, body.agent)
      this.sendSuccess(response, 200, { requirement })
      return
    }

    throw new BoardError('NOT_FOUND', '接口不存在', 404)
  }

  private sendSuccess<T>(response: ServerResponse, status: number, data: T): void {
    sendJson(response, status, { ok: true, data } satisfies ApiSuccess<T>)
  }

  private isAuthorized(request: IncomingMessage): boolean {
    const header = request.headers.authorization ?? ''
    if (!header.startsWith('Bearer ')) return false
    const provided = header.slice('Bearer '.length).trim()
    if (!provided) return false
    const expected = this.service.getBridgeToken()
    const providedHash = createHash('sha256').update(provided).digest()
    const expectedHash = createHash('sha256').update(expected).digest()
    return timingSafeEqual(providedHash, expectedHash)
  }
}

function commonSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  }
}

function applyCommonHeaders(response: ServerResponse): void {
  for (const [key, value] of Object.entries(commonSecurityHeaders())) {
    response.setHeader(key, value)
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  if (response.headersSent) return
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    ...commonSecurityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  response.end(body)
}

function sendError(response: ServerResponse, status: number, error: ApiErrorShape): void {
  sendJson(response, status, { ok: false, error } satisfies ApiFailure)
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type'] ?? ''
  if (!String(contentType).toLowerCase().startsWith('application/json')) {
    throw new BoardError(
      'UNSUPPORTED_CONTENT_TYPE',
      '写请求必须使用 Content-Type: application/json',
      415
    )
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > MAX_BODY_BYTES) {
      throw new BoardError('PAYLOAD_TOO_LARGE', '请求体超过 512 KiB', 413)
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) throw new BoardError('VALIDATION_ERROR', '请求体不能为空', 400)
  try {
    return JSON.parse(text)
  } catch {
    throw new BoardError('VALIDATION_ERROR', '请求体不是合法 JSON', 400)
  }
}

function readIdempotencyKey(request: IncomingMessage): string | undefined {
  const raw = request.headers['idempotency-key']
  if (!raw) return undefined
  const value = String(Array.isArray(raw) ? raw[0] : raw).trim()
  if (!value) return undefined
  if (value.length > 120) {
    throw new BoardError('VALIDATION_ERROR', 'Idempotency-Key 不能超过 120 个字符', 400)
  }
  return value
}

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  try {
    const url = new URL(`http://${hostHeader}`)
    return LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function optionalEnum<T extends string>(
  value: string | null,
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } }
): T | undefined {
  if (value === null || value === '') return undefined
  const result = schema.safeParse(value)
  if (!result.success || !result.data) {
    throw new BoardError('VALIDATION_ERROR', `非法筛选值：${value}`, 400)
  }
  return result.data
}

function numericParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new BoardError('VALIDATION_ERROR', '参数必须是整数', 400)
  }
  return Math.max(min, Math.min(max, parsed))
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
