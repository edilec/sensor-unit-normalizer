/**
 * The unit registry.
 *
 * Every unit converts to its dimension's base unit by `value * factor + offset`.
 * Most units are purely multiplicative; temperature is not, which is the whole
 * reason `offset` exists. Getting that wrong is the classic sensor bug: scaling
 * 20 °C by 9/5 gives 36 instead of 68, and a linear-only registry will do
 * exactly that without complaining.
 *
 * `range` is the physically possible span expressed in the base unit. It is a
 * sanity bound on real-world readings, not a calibration limit.
 */

export const DIMENSIONS = Object.freeze({
  temperature: { base: 'K', range: { min: 0, max: 1e9 } },
  length: { base: 'm', range: { min: 0, max: 1e15 } },
  mass: { base: 'kg', range: { min: 0, max: 1e12 } },
  time: { base: 's', range: { min: 0, max: 1e12 } },
  pressure: { base: 'Pa', range: { min: 0, max: 1e12 } },
  speed: { base: 'm/s', range: { min: 0, max: 299_792_458 } },
  'electric-potential': { base: 'V', range: { min: -1e9, max: 1e9 } },
  'electric-current': { base: 'A', range: { min: -1e9, max: 1e9 } },
  'data-size': { base: 'B', range: { min: 0, max: 1e21 } },
  angle: { base: 'rad', range: { min: -1e6, max: 1e6 } },
  'relative-humidity': { base: '%RH', range: { min: 0, max: 100 } },
})

/** unit -> { dimension, factor, offset } into the dimension's base unit. */
export const UNITS = Object.freeze({
  // temperature: the affine cases
  K: { dimension: 'temperature', factor: 1, offset: 0 },
  degC: { dimension: 'temperature', factor: 1, offset: 273.15 },
  degF: { dimension: 'temperature', factor: 5 / 9, offset: 273.15 - (32 * 5) / 9 },

  // length
  m: { dimension: 'length', factor: 1, offset: 0 },
  km: { dimension: 'length', factor: 1000, offset: 0 },
  cm: { dimension: 'length', factor: 0.01, offset: 0 },
  mm: { dimension: 'length', factor: 0.001, offset: 0 },
  mi: { dimension: 'length', factor: 1609.344, offset: 0 },
  ft: { dimension: 'length', factor: 0.3048, offset: 0 },
  in: { dimension: 'length', factor: 0.0254, offset: 0 },

  // mass
  kg: { dimension: 'mass', factor: 1, offset: 0 },
  g: { dimension: 'mass', factor: 0.001, offset: 0 },
  mg: { dimension: 'mass', factor: 1e-6, offset: 0 },
  lb: { dimension: 'mass', factor: 0.45359237, offset: 0 },

  // time
  s: { dimension: 'time', factor: 1, offset: 0 },
  ms: { dimension: 'time', factor: 0.001, offset: 0 },
  min: { dimension: 'time', factor: 60, offset: 0 },
  h: { dimension: 'time', factor: 3600, offset: 0 },
  d: { dimension: 'time', factor: 86_400, offset: 0 },

  // pressure
  Pa: { dimension: 'pressure', factor: 1, offset: 0 },
  hPa: { dimension: 'pressure', factor: 100, offset: 0 },
  kPa: { dimension: 'pressure', factor: 1000, offset: 0 },
  bar: { dimension: 'pressure', factor: 100_000, offset: 0 },
  psi: { dimension: 'pressure', factor: 6894.757293168361, offset: 0 },

  // speed
  'm/s': { dimension: 'speed', factor: 1, offset: 0 },
  'km/h': { dimension: 'speed', factor: 1000 / 3600, offset: 0 },
  mph: { dimension: 'speed', factor: 1609.344 / 3600, offset: 0 },

  // electrical
  V: { dimension: 'electric-potential', factor: 1, offset: 0 },
  mV: { dimension: 'electric-potential', factor: 0.001, offset: 0 },
  A: { dimension: 'electric-current', factor: 1, offset: 0 },
  mA: { dimension: 'electric-current', factor: 0.001, offset: 0 },

  // data size: decimal and binary prefixes are distinct on purpose
  B: { dimension: 'data-size', factor: 1, offset: 0 },
  kB: { dimension: 'data-size', factor: 1000, offset: 0 },
  MB: { dimension: 'data-size', factor: 1e6, offset: 0 },
  GB: { dimension: 'data-size', factor: 1e9, offset: 0 },
  KiB: { dimension: 'data-size', factor: 1024, offset: 0 },
  MiB: { dimension: 'data-size', factor: 1024 ** 2, offset: 0 },
  GiB: { dimension: 'data-size', factor: 1024 ** 3, offset: 0 },

  // angle
  rad: { dimension: 'angle', factor: 1, offset: 0 },
  deg: { dimension: 'angle', factor: Math.PI / 180, offset: 0 },

  // relative humidity
  '%RH': { dimension: 'relative-humidity', factor: 1, offset: 0 },
})

export function unitNames() {
  return Object.keys(UNITS).sort()
}
