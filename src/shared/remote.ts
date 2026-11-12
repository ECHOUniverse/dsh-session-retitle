/**
 * The single Typert Remote definition for `sessionRetitle/execute`.
 *
 * The same `createTypertRemoteInfo()` instance feeds both faces: the Host
 * registers {@link sessionRetitleContribution} through `ctx.typert.register()`,
 * and the Client mounts {@link sessionRetitleRemoteInfo} through
 * `ctx.remote.$mount()`. The agent argument stays a strict Host lookup
 * (`source: 'lookup'`, `lookup: 'agent'`, wire field `agentId`) so the official
 * agent scope resolves a live Agent and can resume a cold Session before the
 * business method runs; it is never a plain JSON sessionId. The trailing
 * `signal` is descriptor cancellation metadata, not a wire argument.
 */
import { z } from 'zod'
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info'

import { ENDPOINT, NAMESPACE, PACKAGE_NAME, SERVICE_KEY } from './ids.js'
import {
  createRetitleRequestSchema,
  createRetitleResultSchema,
  REQUEST_JSON_SCHEMA,
  RESULT_JSON_SCHEMA,
  type RetitleRequest,
  type RetitleResult,
} from './result.js'

/** Canonical Host type symbol of the wire agent identity, as strict generation spells it. */
const AGENT_ID_TYPE_SYMBOL = '@deepseek-ai/dsh-session/types#SessionId'

const createAgentIdSchema = (): z.ZodType<string> => z.string()

/** Lazily materialized strict codec for one boundary value. */
const agentIdCodec = {
  mode: 'strict' as const,
  typeSymbol: AGENT_ID_TYPE_SYMBOL,
  create: createAgentIdSchema,
  jsonSchema: { type: 'string' } as Readonly<Record<string, unknown>>,
}

const requestCodec = {
  mode: 'strict' as const,
  typeSymbol: `${PACKAGE_NAME}#${ENDPOINT}:request`,
  create: createRetitleRequestSchema,
  jsonSchema: REQUEST_JSON_SCHEMA,
}

const resultCodec = {
  mode: 'strict' as const,
  typeSymbol: `${PACKAGE_NAME}#${ENDPOINT}:result`,
  create: createRetitleResultSchema,
  description: 'Structured outcome of one explicit title refresh.',
  jsonSchema: RESULT_JSON_SCHEMA,
}

/** Mountable Client artifact and Host descriptor truth for this package. */
export const sessionRetitleRemoteInfo = createTypertRemoteInfo({
  package: PACKAGE_NAME,
  methods: {
    'sessionRetitle/execute': {
      service: SERVICE_KEY,
      description:
        'Regenerate one Session title through the official all-prompts provider, with archive defense and manual-title confirmation.',
      invocation: { kind: 'direct' },
      // Retains the official agent scope: the Client may also call this from an
      // agent Context, and the Host receives the resolved Agent object.
      scope: { context: 'agent', wire: 'agentId' },
      parameters: [
        {
          name: 'agent',
          wire: 'agentId',
          description: 'exact receiving agent, resolved through the official agent lookup.',
          source: 'lookup',
          lookup: 'agent',
          codec: agentIdCodec,
          strictCodec: agentIdCodec,
        },
        {
          name: 'request',
          description: 'strict request object: {} or a manual-title confirmation token.',
          source: 'json',
          codec: requestCodec,
          strictCodec: requestCodec,
        },
      ],
      cancellation: { parameter: 'signal' },
      result: resultCodec,
    },
  },
}, z)

/**
 * Host contribution for `ctx.typert.register()`.
 *
 * The descriptor list is the same object the Client mounts; `schemas` stays
 * empty because the shared descriptor carries its Zod factories directly.
 */
export const sessionRetitleContribution = {
  package: PACKAGE_NAME,
  face: 'host' as const,
  schemas: [] as const,
  model: { services: [], events: [], objects: [] } as const,
  get invocations() {
    return sessionRetitleRemoteInfo.descriptors
  },
}

/** Result shape of one Client Remote invocation, structurally typed. */
export type RemoteResultLike<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: unknown }

/** Named input of one invoke, matching the wire fields of the descriptor. */
export interface SessionRetitleInvokeInput {
  readonly agentId: string
  readonly request: RetitleRequest
  readonly signal?: AbortSignal
}

interface DirectInvoker {
  invoke(remote: unknown, input: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<RemoteResultLike<RetitleResult>>
}

function directInvoker(): DirectInvoker {
  const methods = sessionRetitleRemoteInfo.methods as unknown as Readonly<Record<string, DirectInvoker | undefined>>
  const method = methods[ENDPOINT]
  if (method === undefined) {
    throw new Error(`sessionRetitle: missing direct Remote method ${ENDPOINT}`)
  }
  return method
}

/**
 * Invoke the mounted `sessionRetitle.execute` namespace method through the
 * shared descriptor: agent wire identity first, strict request second, caller
 * signal last.
 * @param remote - mounted Client Remote service (`ctx.remote`).
 * @param input - wire agent identity, strict request and optional lifetime.
 * @returns the carrier-decoded Remote result.
 */
export function invokeSessionRetitle(
  remote: unknown,
  input: SessionRetitleInvokeInput,
): Promise<RemoteResultLike<RetitleResult>> {
  return directInvoker().invoke(remote, { agentId: input.agentId, request: input.request }, input.signal)
}

export { NAMESPACE }
