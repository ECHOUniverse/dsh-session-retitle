/**
 * Minimal translation helper over the Client locale binding.
 *
 * The locale service returns a binder per namespace; placeholder replacement
 * stays local so the same copy works for Toast and menu labels.
 */
import type { LocaleKey } from './locale.js'

/** Translate one key and replace `{name}` placeholders. */
export function translate(
  bind: (key: string) => string,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const text = bind(key)
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/** Translator bound to one locale namespace, with placeholder support. */
export type NamespaceTranslator = (
  key: LocaleKey,
  params?: Readonly<Record<string, string | number>>,
) => string

/**
 * Bind one namespace's raw lookup function into a translator.
 *
 * Re-bind on every use so a live language switch is reflected; the binder is
 * never captured across a fiber change.
 * @param bind - raw key lookup returned by locale.bind(namespace).
 * @returns the placeholder-aware translator.
 */
export function bindTranslator(bind: (key: string) => string): NamespaceTranslator {
  return (key, params) => translate(bind, key, params)
}

/** Render an unknown failure as a short localized-safe reason. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
