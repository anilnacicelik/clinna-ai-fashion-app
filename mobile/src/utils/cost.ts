/**
 * CLINNA — cost formatting + markup maths
 *
 * Lives outside the screens because the same two numbers are rendered in four
 * places now: ResultScreen, BuyResultScreen, the shared cost card and the
 * archive list. One formula, one rounding rule.
 */

/** "$1,299" — whole dollars, US grouping. Matches the receipt on ResultScreen. */
export function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * What the markup line should say, if anything.
 *
 *   none     — no production cost to compare against (0 / null), or no price.
 *              The line is not rendered at all rather than rendered as 0%.
 *   nearCost — the price is at or below the estimated production cost. There
 *              is no markup to report and CLINNA makes no judgement about it.
 *   markup   — round((price - cost) / price * 100)
 */
export type MarkupResult =
  | { kind: 'none' }
  | { kind: 'nearCost' }
  | { kind: 'markup'; pct: number };

export function markupOf(
  price: number | null | undefined,
  cost:  number | null | undefined,
): MarkupResult {
  if (price == null || !Number.isFinite(price) || price <= 0) return { kind: 'none' };
  if (cost  == null || !Number.isFinite(cost)  || cost  <= 0) return { kind: 'none' };
  if (price <= cost) return { kind: 'nearCost' };
  return { kind: 'markup', pct: Math.round(((price - cost) / price) * 100) };
}

/**
 * The price the "before you buy" headline compares against: what the user
 * typed off the tag, and failing that the model's retail estimate. Null when
 * neither exists — the headline then shows the production cost on its own.
 */
export function comparePrice(
  tagPrice:      number | null | undefined,
  estimatedRetail: number | null | undefined,
): number | null {
  if (tagPrice != null && Number.isFinite(tagPrice) && tagPrice > 0) return tagPrice;
  if (estimatedRetail != null && Number.isFinite(estimatedRetail) && estimatedRetail > 0) {
    return estimatedRetail;
  }
  return null;
}
