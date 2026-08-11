/**
 * Care / Metelka reward collect — drag apple → basket, coins → chest lock.
 * Credit happens on pointer-up (hit or miss); target pulses while dragging.
 */

export const APPLE_BASKET_HOST_SELECTOR = '[data-apple-basket-host="true"]';
export const APPLE_BASKET_SELECTOR = '[data-apple-basket="true"]';
export const CAPITAL_CHEST_HOST_SELECTOR = '[data-v3-capital-chest-host="true"]';
export const CAPITAL_CHEST_HIT_SELECTOR = '[data-capital-chest-hit="true"]';
/** Lock/clasp on the crate — visual drop target for Care coins. */
export const CAPITAL_CHEST_CLASP_SELECTOR = '[data-chest-clasp="true"]';

function pointHitsEl(
  el: Element | null,
  clientX: number,
  clientY: number,
  pad = 10,
): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return (
    clientX >= r.left - pad &&
    clientX <= r.right + pad &&
    clientY >= r.top - pad &&
    clientY <= r.bottom + pad
  );
}

export function resolveAppleBasketEl(doc: Document = document): Element | null {
  return (
    doc.querySelector(APPLE_BASKET_SELECTOR) ??
    doc.querySelector(APPLE_BASKET_HOST_SELECTOR)
  );
}

export function resolveCapitalChestEl(doc: Document = document): Element | null {
  return (
    doc.querySelector(CAPITAL_CHEST_CLASP_SELECTOR) ??
    doc.querySelector(CAPITAL_CHEST_HIT_SELECTOR) ??
    doc.querySelector(CAPITAL_CHEST_HOST_SELECTOR)
  );
}

/** True when viewport point overlaps the basket hit target. */
export function pointHitsAppleBasket(
  clientX: number,
  clientY: number,
  doc: Document = document,
): boolean {
  return pointHitsEl(resolveAppleBasketEl(doc), clientX, clientY);
}

/** True when viewport point overlaps the capital chest hit target. */
export function pointHitsCapitalChest(
  clientX: number,
  clientY: number,
  doc: Document = document,
): boolean {
  return pointHitsEl(resolveCapitalChestEl(doc), clientX, clientY);
}
