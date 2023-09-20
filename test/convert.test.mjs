import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DIMENSIONS,
  UNITS,
  UnitError,
  areCompatible,
  convert,
  dimensionOf,
  normalizeReadings,
  round,
  unitNames,
} from '../src/index.mjs'

const TOLERANCE = 1e-9

function close(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < TOLERANCE,
    `${message ?? ''} expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
  )
}

test('Celsius and Fahrenheit convert across their offset, not by scaling alone', () => {
  // The classic failure is a linear-only registry: 20 * 9/5 = 36 instead of 68.
  close(convert(0, 'degC', 'degF'), 32, '0C')
  close(convert(20, 'degC', 'degF'), 68, '20C')
  close(convert(100, 'degC', 'degF'), 212, '100C')
  close(convert(-40, 'degC', 'degF'), -40, '-40C is the crossover')
  close(convert(98.6, 'degF', 'degC'), 37, 'body temperature')
})

test('Celsius/Fahrenheit round-trips stay within tolerance', () => {
  for (let celsius = -273; celsius <= 1000; celsius += 7.5) {
    const roundTripped = convert(convert(celsius, 'degC', 'degF'), 'degF', 'degC')
    close(roundTripped, celsius, `round trip at ${celsius}C`)
  }
})

test('Kelvin is the temperature base and anchors both scales', () => {
  close(convert(0, 'K', 'degC'), -273.15)
  close(convert(273.15, 'K', 'degC'), 0)
  close(convert(0, 'K', 'degF'), -459.67)
})

test('every unit round-trips through its dimension base within tolerance', () => {
  for (const name of unitNames()) {
    const base = DIMENSIONS[UNITS[name].dimension].base
    const sample = name === '%RH' ? 50 : 1
    const roundTripped = convert(convert(sample, name, base), base, name)
    close(roundTripped, sample, `${name} round trip`)
  }
})

test('incompatible dimensions are rejected, never silently scaled', () => {
  assert.throws(() => convert(1, 'm', 'kg'), (error) => {
    assert.ok(error instanceof UnitError)
    assert.equal(error.code, 'dimension-mismatch')
    assert.equal(error.fromDimension, 'length')
    assert.equal(error.toDimension, 'mass')
    return true
  })
  assert.throws(() => convert(1, 'degC', 's'), /Cannot convert degC \(temperature\) to s \(time\)/)
})

test('NaN is refused rather than propagated', () => {
  assert.throws(() => convert(Number.NaN, 'degC', 'degF'), (error) => {
    assert.equal(error.code, 'value-not-a-number')
    assert.match(error.message, /NaN/)
    return true
  })
})

test('infinities and non-numbers are refused', () => {
  assert.throws(() => convert(Number.POSITIVE_INFINITY, 'm', 'km'), /value is Infinity|is Infinity/i)
  assert.throws(() => convert(Number.NEGATIVE_INFINITY, 'm', 'km'), /Infinity/)
  assert.throws(() => convert('20', 'degC', 'degF'), /must be a number/)
  assert.throws(() => convert(null, 'degC', 'degF'), /received null/)
  assert.throws(() => convert(undefined, 'degC', 'degF'), /must be a number/)
})

test('an unknown unit names itself and its role', () => {
  assert.throws(() => convert(1, 'furlong', 'm'), /Unknown source unit "furlong"/)
  assert.throws(() => convert(1, 'm', 'furlong'), /Unknown target unit "furlong"/)
})

test('physically impossible readings are rejected', () => {
  assert.throws(() => convert(-300, 'degC', 'K'), (error) => {
    assert.equal(error.code, 'value-out-of-range')
    assert.equal(error.dimension, 'temperature')
    return true
  })
  assert.throws(() => convert(-1, 'm', 'cm'), /out of range|physically possible/)
  assert.throws(() => convert(101, '%RH', '%RH'), /physically possible/)
})

test('range checking can be turned off for a calibration workflow', () => {
  close(convert(-300, 'degC', 'degC', { checkRange: false }), -300)
})

test('decimal and binary data prefixes stay distinct', () => {
  close(convert(1, 'GiB', 'MiB'), 1024)
  close(convert(1, 'GB', 'MB'), 1000)
  assert.notEqual(convert(1, 'GiB', 'B'), convert(1, 'GB', 'B'))
})

test('known reference conversions are correct', () => {
  close(convert(1, 'mi', 'm'), 1609.344)
  close(convert(1, 'lb', 'kg'), 0.45359237)
  close(convert(1, 'bar', 'psi'), 14.503773773020924, 'bar to psi')
  close(convert(180, 'deg', 'rad'), Math.PI)
  close(convert(1, 'h', 's'), 3600)
  close(convert(100, 'km/h', 'm/s'), 27.77777777777778)
})

test('precision rounds without the usual toFixed surprises', () => {
  assert.equal(round(1.005, 2), 1.01)
  assert.equal(round(2.675, 2), 2.68)
  assert.equal(convert(0, 'degC', 'degF', { precision: 6 }), 32)
  assert.equal(convert(1, 'bar', 'psi', { precision: 2 }), 14.5)
})

test('an invalid precision is rejected', () => {
  assert.throws(() => round(1, -1), /integer from 0 through 15/)
  assert.throws(() => round(1, 1.5), /integer from 0 through 15/)
  assert.throws(() => round(1, 16), /integer from 0 through 15/)
})

test('dimension helpers report compatibility', () => {
  assert.equal(dimensionOf('degF'), 'temperature')
  assert.equal(areCompatible('m', 'ft'), true)
  assert.equal(areCompatible('m', 'kg'), false)
  assert.equal(areCompatible('m', 'furlong'), false)
})

test('a batch normalizes the good readings and records why the rest failed', () => {
  const report = normalizeReadings([
    { id: 'a', value: 20, unit: 'degC', targetUnit: 'degF' },
    { id: 'b', value: Number.NaN, unit: 'degC', targetUnit: 'degF' },
    { id: 'c', value: 1, unit: 'm', targetUnit: 'kg' },
    { id: 'd', value: 1, unit: 'km', targetUnit: 'm' },
  ], { precision: 4 })

  assert.equal(report.status, 'fail')
  assert.equal(report.summary.normalized, 2)
  assert.equal(report.summary.errors, 2)
  assert.equal(report.readings[0].value, 68)
  assert.equal(report.readings[0].originalUnit, 'degC')
  assert.deepEqual(report.findings.map((item) => item.ruleId), ['value-not-a-number', 'dimension-mismatch'])
})

test('a clean batch passes with the report envelope', () => {
  const report = normalizeReadings([{ value: 1, unit: 'km', targetUnit: 'm' }])

  assert.equal(report.schemaVersion, '1')
  assert.equal(report.tool, 'sensor-unit-normalizer')
  assert.equal(report.status, 'pass')
  assert.deepEqual(report.findings, [])
})

test('a per-dimension target unit applies to every reading of that dimension', () => {
  const report = normalizeReadings(
    [{ value: 20, unit: 'degC' }, { value: 1, unit: 'km' }],
    { targetUnit: { temperature: 'K', length: 'm' }, precision: 2 },
  )

  assert.equal(report.status, 'pass')
  assert.equal(report.readings[0].value, 293.15)
  assert.equal(report.readings[1].value, 1000)
})

test('a reading with no target unit is reported, not guessed', () => {
  const report = normalizeReadings([{ value: 1, unit: 'km' }])

  assert.deepEqual(report.findings.map((item) => item.ruleId), ['target-unit-missing'])
})

test('a malformed reading is reported without crashing the batch', () => {
  const report = normalizeReadings(['nope', null, { value: 1, unit: 'km', targetUnit: 'm' }])

  assert.equal(report.summary.normalized, 1)
  assert.equal(report.findings.filter((item) => item.ruleId === 'reading-malformed').length, 2)
})

test('batch results are deterministic', () => {
  const input = [
    { value: Number.NaN, unit: 'degC', targetUnit: 'degF' },
    { value: 1, unit: 'm', targetUnit: 'kg' },
  ]

  assert.deepEqual(normalizeReadings(input), normalizeReadings(input))
})

test('a non-array batch is rejected', () => {
  assert.throws(() => normalizeReadings(null), /must be an array/)
})
