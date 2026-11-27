import type { ApiErrorShape } from '@shared/types'

export class BoardError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: Record<string, unknown>

  constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message)
    this.name = 'BoardError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export function toApiError(error: unknown): ApiErrorShape {
  if (error instanceof BoardError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    }
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message }
  }
  return { code: 'INTERNAL_ERROR', message: '发生未知错误' }
}
