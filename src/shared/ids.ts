/**
 * Wire and presentation identities owned by @hanxu131/dsh-session-retitle.
 *
 * The Remote endpoint is the single source of truth shared by the Host
 * contribution and the Client mount; no other module restates these strings.
 */

/** npm package that owns the Host plugin and the Client artifact. */
export const PACKAGE_NAME = '@hanxu131/dsh-session-retitle'

/** Remote namespace (wire segment before the endpoint slash). */
export const NAMESPACE = 'sessionRetitle'

/** Cordis service key that receives the strict Remote dispatch. */
export const SERVICE_KEY = 'sessionRetitle'

/** Single Remote endpoint exposed by this package. */
export const ENDPOINT = 'sessionRetitle/execute'

/** Session context-menu contribution id; stable and namespaced. */
export const MENU_CONTRIBUTION_ID = `${PACKAGE_NAME}.session.retitle`

/** Action id inside the session menu contribution. */
export const MENU_ACTION_ID = `${PACKAGE_NAME}.session.retitle.action`

/** Sort position between Rename (200) and Fork (300). */
export const MENU_ORDER = 210

/** Client locale namespace owned by this plugin. */
export const LOCALE_NAMESPACE = 'sessionRetitle'
