/**
 * The Calm Ledger's light-theme colours, frozen for the document exports.
 *
 * A Word file or a rasterised SVG cannot read CSS custom properties, so this
 * is the one file (named in scripts/brand-lint.mjs) allowed to hold raw
 * colour values outside the token layers. Every value is a copy of a
 * primitive in design/tokens/primitive.css; change them together.
 *
 * Red is a brand accent only and never appears here: gaps are neutral, and
 * only a time-sensitive "due" takes the semantic warning pair.
 */

/** Bare hex, as WordML wants it. */
export const EXPORT = {
  /** --neutral-ink */
  ink: "1F1B1A",
  /** --neutral-ink-2 */
  ink2: "4A4542",
  /** --neutral-rule-strong */
  ink3: "8A8579",
  /** --neutral-rule */
  rule: "CFCCC1",
  /** --neutral-sand */
  band: "F3F2EC",
  /** --eand-white */
  paper: "FFFFFF",
  /** --ochre-700 */
  warning: "7A5A00",
  /** --ochre-50 */
  warningWash: "F6EFD9",
} as const;

/** The same colour for SVG attributes. */
export const svg = (value: string): string => `#${value}`;
