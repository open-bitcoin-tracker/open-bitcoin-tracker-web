export interface PriceMenuMeasurements {
  /** Positions in viewport pixels. */
  pickerLeft: number;
  pickerTop: number;
  priceRight: number;
  codeLeft: number;
  codeBottom: number;
  /** Bottom edge of the whole price button, in viewport pixels. */
  triggerBottom: number;
  menuWidth: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Space kept clear at the right edge of the viewport. */
  gutter: number;
  /** Space between the menu and what it opens from. */
  gap: number;
  /** Space kept clear beneath the menu for the chart controls. */
  bottomRoom: number;
  maxHeight: number;
}

export interface PriceMenuPlacement {
  /** Offsets from the picker's top-left corner. */
  left: number;
  top: number;
  maxHeight: number;
}

/**
 * Open the price's currency menu from its chevron. Where the menu fits beside the price it drops from the
 * currency code into the free space; otherwise it opens below the price, as close to the chevron as fits.
 */
export function placePriceCurrencyMenu(m: PriceMenuMeasurements): PriceMenuPlacement {
  const maxLeft = m.viewportWidth - m.gutter - m.menuWidth;
  const beside = m.codeLeft <= maxLeft && m.codeLeft >= m.priceRight;
  const left = Math.max(m.pickerLeft, Math.min(m.codeLeft, maxLeft));
  const top = (beside ? m.codeBottom : m.triggerBottom) + m.gap;
  return {
    left: left - m.pickerLeft,
    top: top - m.pickerTop,
    maxHeight: Math.max(0, Math.min(m.maxHeight, m.viewportHeight - top - m.bottomRoom)),
  };
}
