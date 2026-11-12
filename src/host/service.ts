/**
 * Host service for `sessionRetitle/execute`.
 *
 * The Service is a thin adapter: it keeps the public `TypertRemoteService`
 * binding the Gateway requires, declares the official services it depends on,
 * and delegates the whole policy to the Host Retitle deep module. It registers
 * no command and no Agent tool, and never reimplements provider, LLM, or
 * prompt logic.
 *
 * `@Remote` is the public marker that makes `execute` a declared direct Remote
 * method of that Service.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import type { RetitleRequest, RetitleResult } from '../shared/result.js'
import {
  retitle,
  type RetitleAgent,
  type RetitleDeps,
  type SessionTitlePort,
  type WorkspaceRegistryPort,
} from './retitle.js'

/** Narrow the Gateway-resolved live Agent to the two facts the policy uses. */
function isRetitleAgent(agent: unknown): agent is RetitleAgent {
  if (agent === null || typeof agent !== 'object') return false
  const session = (agent as { readonly session?: unknown }).session
  if (session === null || typeof session !== 'object') return false
  return typeof (session as { readonly id?: unknown }).id === 'string'
}

/** Host service bound to the `sessionRetitle` key. */
export class SessionRetitleService extends TypertRemoteService {
  /** Only the official services the retitle policy needs are injected. */
  static inject: string[] = ['sessionTitle', 'workspaceRegistry']

  constructor(ctx: Context) {
    super(ctx, 'sessionRetitle')
  }

  /**
   * Resolve the injected official services and delegate one retitle request.
   * @param agent - live Agent resolved by the Gateway's official agent lookup.
   * @param request - strict request; `{}` or a manual-title confirmation token.
   * @param signal - caller cancellation forwarded to the official refresh.
   * @returns the structured retitle outcome, including mapped failures.
   */
  @Remote
  async execute(agent: unknown, request: RetitleRequest, signal: AbortSignal): Promise<RetitleResult> {
    const deps = this.retitleDeps()
    if (deps === undefined || !isRetitleAgent(agent)) return { outcome: 'failed', code: 'unknown' }
    return retitle(deps, agent, request, signal)
  }

  /** Read the two official services from the Context; both are required by inject. */
  private retitleDeps(): RetitleDeps | undefined {
    const ctx = this.ctx as unknown as { get(key: string): unknown }
    const sessionTitle = ctx.get('sessionTitle')
    const workspaceRegistry = ctx.get('workspaceRegistry')
    if (sessionTitle === undefined || sessionTitle === null) return undefined
    if (workspaceRegistry === undefined || workspaceRegistry === null) return undefined
    return {
      sessionTitle: sessionTitle as SessionTitlePort,
      workspaceRegistry: workspaceRegistry as WorkspaceRegistryPort,
    }
  }
}