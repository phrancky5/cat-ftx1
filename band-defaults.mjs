/**
 * Typical default / calling frequencies (Hz) per FTX-1 band code (BS P2).
 * Used by the radio simulator; real hardware returns last-used memory via FA/FB.
 */
export const BAND_DEFAULT_HZ = {
  '00': 1_900_000,    // 160m
  '01': 3_650_000,    // 80m
  '02': 5_358_500,    // 60m
  '03': 7_100_000,    // 40m
  '04': 10_116_000,   // 30m
  '05': 14_225_000,   // 20m
  '06': 18_118_000,   // 17m
  '07': 21_225_000,   // 15m
  '08': 24_930_000,   // 12m
  '09': 28_400_000,   // 10m
  '10': 52_525_000,   // 6m
  '11': 70_200_000,   // 4m / GEN
  '12': 127_000_000,  // AIR (mid aviation)
  '13': 144_200_000,  // 2m
  '14': 432_100_000,  // 70cm
}

/** @param {string} bandCode Two-digit band code from BS command. */
export function bandDefaultHz(bandCode) {
  return BAND_DEFAULT_HZ[bandCode] ?? null
}

/** @param {number} hz Frequency in Hz. */
export function hzToBandCode(hz) {
  if (!hz || !Number.isFinite(hz)) return null
  const bands = [
    { code: '00', min: 1_800_000, max: 2_000_000 },
    { code: '01', min: 3_500_000, max: 4_000_000 },
    { code: '02', min: 5_000_000, max: 5_500_000 },
    { code: '03', min: 7_000_000, max: 7_300_000 },
    { code: '04', min: 10_000_000, max: 10_200_000 },
    { code: '05', min: 14_000_000, max: 14_400_000 },
    { code: '06', min: 18_000_000, max: 18_200_000 },
    { code: '07', min: 21_000_000, max: 21_500_000 },
    { code: '08', min: 24_500_000, max: 25_000_000 },
    { code: '09', min: 28_000_000, max: 30_000_000 },
    { code: '10', min: 50_000_000, max: 54_000_000 },
    { code: '11', min: 70_000_000, max: 108_000_000 },
    { code: '12', min: 108_000_000, max: 144_000_000 },
    { code: '13', min: 144_000_000, max: 148_000_000 },
    { code: '14', min: 430_000_000, max: 450_000_000 },
  ]
  return bands.find(b => hz >= b.min && hz < b.max)?.code ?? null
}

/** Step band code up/down (wrap). @param {string} code @param {number} dir +1 or -1 */
export function stepBandCode(code, dir) {
  const order = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14']
  const i = order.indexOf(code)
  const base = i >= 0 ? i : 0
  const next = (base + dir + order.length) % order.length
  return order[next]
}
