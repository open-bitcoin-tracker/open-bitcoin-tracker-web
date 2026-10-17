export const AMOUNT_PRESETS = ['0.001', '0.01', '0.1', '0.5', '1', '5', '10', '100', '1000'] as const;
export type PresetAmount = (typeof AMOUNT_PRESETS)[number];

export const MAX_BTC = 21_000_000;
export const LAND_KM2 = 148_940_000;
export const toArea = (btc: number) => (btc / MAX_BTC) * LAND_KM2;
