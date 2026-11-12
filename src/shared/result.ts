import { z } from 'zod'

export type SessionTitleSourceKind = 'user' | 'provider' | 'fallback'

export type RetitleFailureCode =
  | 'input-too-large'
  | 'no-route'
  | 'invalid-output'
  | 'timeout'
  | 'cancelled'
  | 'superseded'
  | 'unknown'

export type RetitleRequest = Readonly<Record<string, never>> | {
  readonly confirmation: {
    readonly expectedUserTitleEventSeq: number
  }
}

export type RetitleResult =
  | { readonly outcome: 'no-input' }
  | { readonly outcome: 'archived' }
  | {
      readonly outcome: 'confirmation-required'
      readonly title: string
      readonly eventSeq: number
    }
  | {
      readonly outcome: 'refreshed'
      readonly title: string
      readonly eventSeq: number
      readonly changed: boolean
      readonly source: {
        readonly kind: 'provider'
        readonly provider: 'session-title-all-prompts-llm'
      }
    }
  | {
      readonly outcome: 'provider-unavailable'
      readonly actualTitle?: string
      readonly actualSourceKind?: SessionTitleSourceKind
      readonly recovered: boolean
      readonly recoveryError?: string
    }
  | {
      readonly outcome: 'failed'
      readonly code: RetitleFailureCode
      readonly actualTitle?: string
      readonly actualSourceKind?: SessionTitleSourceKind
    }

const sourceKindSchema = z.enum(['user', 'provider', 'fallback'])
const failureCodeSchema = z.enum([
  'input-too-large',
  'no-route',
  'invalid-output',
  'timeout',
  'cancelled',
  'superseded',
  'unknown',
])
const eventSeqSchema = z.number().int().nonnegative()
const actualStateSchema = {
  actualTitle: z.string().optional(),
  actualSourceKind: sourceKindSchema.optional(),
}

export const REQUEST_JSON_SCHEMA: Readonly<Record<string, unknown>> = {
  oneOf: [
    { type: 'object', properties: {}, required: [], additionalProperties: false },
    {
      type: 'object',
      properties: {
        confirmation: {
          type: 'object',
          properties: { expectedUserTitleEventSeq: { type: 'number', minimum: 0 } },
          required: ['expectedUserTitleEventSeq'],
          additionalProperties: false,
        },
      },
      required: ['confirmation'],
      additionalProperties: false,
    },
  ],
}

const OUTCOME_JSON_SCHEMA = { type: 'string' }
const ACTUAL_STATE_JSON_SCHEMA = {
  actualTitle: { type: 'string' },
  actualSourceKind: { type: 'string', enum: ['user', 'provider', 'fallback'] },
}
const STRICT_RESULT_BASE = { type: 'object', additionalProperties: false }

export const RESULT_JSON_SCHEMA: Readonly<Record<string, unknown>> = {
  oneOf: [
    {
      ...STRICT_RESULT_BASE,
      properties: { outcome: { ...OUTCOME_JSON_SCHEMA, const: 'no-input' } },
      required: ['outcome'],
    },
    {
      ...STRICT_RESULT_BASE,
      properties: { outcome: { ...OUTCOME_JSON_SCHEMA, const: 'archived' } },
      required: ['outcome'],
    },
    {
      ...STRICT_RESULT_BASE,
      properties: {
        outcome: { ...OUTCOME_JSON_SCHEMA, const: 'confirmation-required' },
        title: { type: 'string' },
        eventSeq: { type: 'number', minimum: 0 },
      },
      required: ['outcome', 'title', 'eventSeq'],
    },
    {
      ...STRICT_RESULT_BASE,
      properties: {
        outcome: { ...OUTCOME_JSON_SCHEMA, const: 'refreshed' },
        title: { type: 'string' },
        eventSeq: { type: 'number', minimum: 0 },
        changed: { type: 'boolean' },
        source: {
          type: 'object',
          properties: {
            kind: { type: 'string', const: 'provider' },
            provider: { type: 'string', const: 'session-title-all-prompts-llm' },
          },
          required: ['kind', 'provider'],
          additionalProperties: false,
        },
      },
      required: ['outcome', 'title', 'eventSeq', 'changed', 'source'],
    },
    {
      ...STRICT_RESULT_BASE,
      properties: {
        outcome: { ...OUTCOME_JSON_SCHEMA, const: 'provider-unavailable' },
        ...ACTUAL_STATE_JSON_SCHEMA,
        recovered: { type: 'boolean' },
        recoveryError: { type: 'string' },
      },
      required: ['outcome', 'recovered'],
    },
    {
      ...STRICT_RESULT_BASE,
      properties: {
        outcome: { ...OUTCOME_JSON_SCHEMA, const: 'failed' },
        code: {
          type: 'string',
          enum: ['input-too-large', 'no-route', 'invalid-output', 'timeout', 'cancelled', 'superseded', 'unknown'],
        },
        ...ACTUAL_STATE_JSON_SCHEMA,
      },
      required: ['outcome', 'code'],
    },
  ],
}

export function createRetitleRequestSchema(): z.ZodType<RetitleRequest> {
  return z.union([
    z.strictObject({}),
    z.strictObject({
      confirmation: z.strictObject({ expectedUserTitleEventSeq: eventSeqSchema }),
    }),
  ]) as z.ZodType<RetitleRequest>
}

export function createRetitleResultSchema(): z.ZodType<RetitleResult> {
  return z.discriminatedUnion('outcome', [
    z.strictObject({ outcome: z.literal('no-input') }),
    z.strictObject({ outcome: z.literal('archived') }),
    z.strictObject({
      outcome: z.literal('confirmation-required'),
      title: z.string(),
      eventSeq: eventSeqSchema,
    }),
    z.strictObject({
      outcome: z.literal('refreshed'),
      title: z.string(),
      eventSeq: eventSeqSchema,
      changed: z.boolean(),
      source: z.strictObject({
        kind: z.literal('provider'),
        provider: z.literal('session-title-all-prompts-llm'),
      }),
    }),
    z.strictObject({
      outcome: z.literal('provider-unavailable'),
      ...actualStateSchema,
      recovered: z.boolean(),
      recoveryError: z.string().optional(),
    }),
    z.strictObject({
      outcome: z.literal('failed'),
      code: failureCodeSchema,
      ...actualStateSchema,
    }),
  ]) as z.ZodType<RetitleResult>
}
