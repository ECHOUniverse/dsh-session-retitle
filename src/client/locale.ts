import type { RetitleFailureCode } from '../shared/result.js'

/**
 * Client-side dictionaries owned by the sessionRetitle locale namespace.
 *
 * locale/en.json and locale/zh.json carry the same ui keys for the
 * installed-plugin metadata; a contract test keeps both sources in sync.
 * English uses sentence case.
 */

/** English copy: baseline locale required by the Client locale service. */
export const en = {
  'menu.retitle': 'Regenerate title',
  'toast.refreshed': 'Session title regenerated: {title}',
  'toast.noInput': 'This session has no eligible conversation text; the title was not regenerated.',
  'toast.providerUnavailable': 'The official all-prompts title provider is unavailable. Enable it and try again.',
  'toast.providerUnavailableRecovered':
    'The official all-prompts title provider is unavailable. Your manual title “{title}” was restored and kept.',
  'toast.providerUnavailableFallback':
    'The official all-prompts title provider is unavailable and the manual title could not be restored: {reason}. The title is still the automatic fallback “{title}”.',
  'toast.providerCheckFailed': 'Could not confirm the official title provider. Please try again.',
  'toast.archived': 'This session is archived, so its title was not regenerated.',
  'toast.failed': 'Could not regenerate the title: {reason}',
  'failure.inputTooLarge': 'the conversation text is too long for the title provider',
  'failure.noRoute': 'no model route is available',
  'failure.invalidOutput': 'the provider returned an invalid title',
  'failure.truncatedOutput': 'the title model output was cut off at the output length limit; raise maxOutputTokens (for example 512) in the official title provider configuration and retry',
  'failure.timeout': 'the request timed out',
  'failure.cancelled': 'the request was cancelled',
  'failure.superseded': 'a newer request replaced this one',
  'failure.unknown': 'an unknown error occurred',
  'modal.title': 'Replace the manual title?',
  'modal.description': 'This session has the manual title “{title}”. Regenerating replaces it and unpins the manual title.',
  'modal.consequence':
    'The new title comes from the official all-prompts title provider. If generation fails, the title may fall back to an automatic title and cannot be rolled back.',
  'modal.cancel': 'Keep manual title',
  'modal.confirm': 'Replace title',
} as const

/** Simplified Chinese copy. */
export const zh = {
  'menu.retitle': '重新生成标题',
  'toast.refreshed': '已重新生成会话标题：{title}',
  'toast.noInput': '当前会话没有可用的对话文本，未重新生成标题。',
  'toast.providerUnavailable': '官方 all-prompts 标题 Provider 不可用，请启用后重试。',
  'toast.providerUnavailableRecovered': '官方 all-prompts 标题 Provider 不可用，已恢复并保留手动标题“{title}”。',
  'toast.providerUnavailableFallback':
    '官方 all-prompts 标题 Provider 不可用，手动标题恢复失败：{reason}。标题仍为自动 fallback“{title}”。',
  'toast.providerCheckFailed': '无法确认官方标题 Provider 状态，请重试。',
  'toast.archived': '该会话已归档，未重新生成标题。',
  'toast.failed': '重新生成标题失败：{reason}',
  'failure.inputTooLarge': '对话内容超出标题 Provider 的长度上限',
  'failure.noRoute': '没有可用的模型路由',
  'failure.invalidOutput': 'Provider 返回了无效标题',
  'failure.truncatedOutput': '标题模型输出被输出长度上限截断；请在官方“随对话更新的标题”插件配置中提高 maxOutputTokens（例如 512）后重试',
  'failure.timeout': '请求超时',
  'failure.cancelled': '请求已取消',
  'failure.superseded': '该请求已被更新的请求取代',
  'failure.unknown': '发生未知错误',
  'modal.title': '替换手动标题？',
  'modal.description': '当前会话使用了手动标题“{title}”。重新生成会替换该标题并解除手动固定。',
  'modal.consequence': '新标题来自官方 all-prompts 标题 Provider。若生成失败，标题可能回退为自动标题且无法回滚。',
  'modal.cancel': '保留手动标题',
  'modal.confirm': '替换标题',
} as const

/** Key union shared by every dictionary. */
export type LocaleKey = keyof typeof en

/** Dictionaries registered under the sessionRetitle namespace. */
export const dictionaries = { en, zh } as const

/** Failure codes mapped to the localized reason shown inside toast.failed. */
export const FAILURE_REASON_KEYS = {
  'input-too-large': 'failure.inputTooLarge',
  'no-route': 'failure.noRoute',
  'invalid-output': 'failure.invalidOutput',
  'truncated-output': 'failure.truncatedOutput',
  timeout: 'failure.timeout',
  cancelled: 'failure.cancelled',
  superseded: 'failure.superseded',
  unknown: 'failure.unknown',
} as const satisfies Readonly<Record<RetitleFailureCode, LocaleKey>>
