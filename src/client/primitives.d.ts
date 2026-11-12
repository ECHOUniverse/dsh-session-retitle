/**
 * Ambient declaration for the page baseline UI primitives module.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is a static seed in the Web page's
 * baseline module table (not a graph row loaded per plugin), so a third-party
 * bundle may require it and must keep it external. There is no npm package to
 * resolve at build time, so the glyph surface this plugin uses is declared
 * here as a structured seam instead of adding a dependency.
 *
 * This file must stay a script (no top-level import/export); the type import
 * lives inside the module body, otherwise this becomes a module augmentation.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactNode } from 'react'

  /** Props accepted by the product glyphs; the Menu style owns the size. */
  export interface IconProps {
    readonly size?: number
    readonly className?: string
  }

  /** Official refresh outline glyph used by shipped "regenerate" style actions. */
  export const IconRefreshOutlineRegular: (props: IconProps) => ReactNode
}
