/**
 * Host half of @hanxu131/dsh-session-retitle.
 *
 * Registers the Host Retitle service and the strict `sessionRetitle/execute`
 * Typert contribution. The service delegates all title policy to the deep
 * Host Retitle module; this plugin registers no command and no Agent tool.
 * The contribution is the same descriptor object the Client mounts, so wire
 * schema, parameter sources, cancellation and result parsing cannot drift
 * between the two faces.
 */
import type { Context } from '@deepseek-ai/cordis'

import { sessionRetitleContribution } from '../shared/remote.js'
import { SessionRetitleService } from './service.js'

/** The strict Host contribution needs the Typert registry. */
export const inject = ['typert']

/** The slice of `ctx.typert` this plugin relies on. */
interface TypertRegistryLike {
  register(contribution: unknown): () => void
}

/**
 * Mount the service and register the strict Remote descriptors.
 * @param ctx - Host plugin Context.
 */
export function apply(ctx: Context): void {
  ctx.plugin(SessionRetitleService)
  const registry = (ctx as unknown as { typert: TypertRegistryLike }).typert
  ctx.effect(
    () => registry.register(sessionRetitleContribution),
    'session-retitle: strict typert contribution',
  )
}