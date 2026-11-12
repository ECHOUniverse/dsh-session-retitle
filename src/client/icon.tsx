/**
 * Glyph rendered in the 14x14 icon cell of the session-menu row.
 *
 * The shared Menu primitive reserves a 14x14 cell for every keyed
 * `contextMenu.icon` entry, forces the SVG to 14px and colors it with
 * `var(--dsw-alias-menu-icon)`, so the component passes no size. Reusing the
 * official product glyph `IconRefreshOutlineRegular` (instead of a hand-drawn
 * SVG) keeps "Regenerate title" visually identical to "Rename", "Fork session",
 * "Archive session" and the other shipped actions.
 */
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'

/**
 * Keyed `contextMenu.icon` component for the retitle action.
 * The overlay passes the captured action icon metadata; the Menu cell owns
 * sizing, so it is deliberately ignored.
 * @returns the official refresh outline glyph.
 */
export function RetitleMenuIcon(): ReactNode {
  return <IconRefreshOutlineRegular />
}
