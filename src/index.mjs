import { DIMENSIONS, UNITS, unitNames } from './units.mjs'

export { DIMENSIONS, UNITS, unitNames } from './units.mjs'

export const TOOL_ID = 'sensor-unit-normalizer'
export const REPORT_SCHEMA_VERSION = '1'

/** Thrown for a conversion that cannot be performed at all. */
export class UnitError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'UnitError'
    this.code = code
    Object.assign(this, details)
  }
}

/**
 * Say what a JSON parse failure was, without reproducing the document.
 *
 * V8 reports a parse failure two ways, and one of them quotes the input back:
 * `Unexpected token 'A', "AKIAIOSFODNN7EXAMPLE" is not valid JSON`. The quoted
 * run is the first ten characters of the document, or the whole document when
 * it is shorter than that -- so a file short enough to be nothing but a
 * credential is reproduced in full by its own error message, and interpolating
 * that message into a diagnostic walks the secret straight onto the stream.
 * Truncating does not help either: the snippet is at the front of the message.
 *
 * Position, line and column are the useful half and say nothing about content,
 * so they are kept whole. The quoted half never leaves this function. The
 * closing guard is deliberate belt and braces: every parse message V8 emits
 * without a snippet quotes JSON punctuation with apostrophes and holds no
 * double quote at all, so a double quote surviving to the end means a wording
 * this function has not been taught, and the generic sentence is used instead.
 */
export function parseFailureDetail(error) {
  const message = String(error?.message ?? '')
  const detail = describeParseFailure(message)
  return detail.includes('"') ? UNPARSEABLE : detail
}

const UNPARSEABLE = 'the document could not be parsed as JSON'

/** Where V8 puts the offending offset. Safe: an offset says nothing about content. */
const POSITION = /at position \d+(?: \(line \d+ column \d+\))?/

/**
 * The shape that quotes the input. A leading `...` means the quoted run came
 * from the middle of the document rather than its start, which is the only
 * thing about the position this shape reveals.
 */
const QUOTES_THE_INPUT = /^Unexpected token (.+?), (\.\.\.)?".*"(?:\.\.\.)? is not valid JSON$/s

function describeParseFailure(message) {
  const quoting = QUOTES_THE_INPUT.exec(message)
  if (quoting !== null) {
    const where = quoting[2] === undefined ? 'at the start of the document' : 'inside the document'
    return `unexpected token ${quoting[1]} ${where}`
  }
  const position = POSITION.exec(message)
  if (position !== null) return message.slice(0, position.index + position[0].length)
  if (message === 'Unexpected end of JSON input') return message
  return UNPARSEABLE
}

function requireUnit(name, role) {
  const unit = Object.hasOwn(UNITS, name) ? UNITS[name] : undefined
  if (!unit) {
    throw new UnitError('unknown-unit', `Unknown ${role} unit "${name}".`, { unit: name })
  }
  return unit
}

/**
 * Reject anything that is not a real reading.
 *
 * NaN is the important one: it propagates silently through arithmetic, so a
 * single bad sample can poison an entire derived series while every downstream
 * check still "succeeds". It is refused at the boundary rather than converted.
 */
function requireFiniteNumber(value) {
  if (typeof value !== 'number') {
    throw new UnitError('value-not-a-number', `Value must be a number; received ${value === null ? 'null' : typeof value}.`, {
      valueType: value === null ? 'null' : typeof value,
    })
  }
  if (Number.isNaN(value)) {
    throw new UnitError('value-not-a-number', 'Value is NaN, which is not a reading.', { valueType: 'NaN' })
  }
  if (!Number.isFinite(value)) {
    throw new UnitError('value-not-finite', `Value is ${value > 0 ? 'Infinity' : '-Infinity'}, which is not a reading.`, {
      valueType: 'Infinity',
    })
  }
  return value
}

function toBase(value, unit) {
  return value * unit.factor + unit.offset
}

function fromBase(value, unit) {
  return (value - unit.offset) / unit.factor
}

/**
 * Convert a reading between units of the same dimension.
 *
 * @param {number} value
 * @param {string} from
 * @param {string} to
 * @param {{ precision?: number, checkRange?: boolean }} [options]
 */
export function convert(value, from, to, options = {}) {
  const source = requireUnit(from, 'source')
  const target = requireUnit(to, 'target')

  if (source.dimension !== target.dimension) {
    throw new UnitError(
      'dimension-mismatch',
      `Cannot convert ${from} (${source.dimension}) to ${to} (${target.dimension}).`,
      { from, to, fromDimension: source.dimension, toDimension: target.dimension },
    )
  }

  requireFiniteNumber(value)

  const base = toBase(value, source)

  if (options.checkRange !== false) {
    const { range } = DIMENSIONS[source.dimension]
    if (base < range.min || base > range.max) {
      throw new UnitError(
        'value-out-of-range',
        `${value} ${from} is outside the physically possible range for ${source.dimension}.`,
        {
          value,
          unit: from,
          dimension: source.dimension,
          baseValue: base,
          baseUnit: DIMENSIONS[source.dimension].base,
          range,
        },
      )
    }
  }

  const result = fromBase(base, target)

  if (!Number.isFinite(result)) {
    throw new UnitError('value-not-finite', 'Conversion produced a non-finite result.', { from, to, value })
  }

  return options.precision === undefined ? result : round(result, options.precision)
}

/**
 * Round to a number of decimal places without the usual floating-point
 * surprises of `toFixed` on values like 1.005.
 */
export function round(value, precision) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 15) {
    throw new UnitError('invalid-precision', 'Precision must be an integer from 0 through 15.', { precision })
  }
  const scaled = Number(`${value}e${precision}`)
  if (!Number.isFinite(scaled)) return value
  return Number(`${Math.round(scaled)}e-${precision}`)
}

export function dimensionOf(unit) {
  return requireUnit(unit, 'source').dimension
}

export function areCompatible(from, to) {
  return Object.hasOwn(UNITS, from)
    && Object.hasOwn(UNITS, to)
    && UNITS[from].dimension === UNITS[to].dimension
}

function byCodeUnit(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * Normalize a batch of readings.
 *
 * One unconvertible reading does not abandon the batch: it is recorded with its
 * reason and the rest are still normalized, because a single bad sample in a
 * telemetry export should not cost you the whole file.
 */
export function normalizeReadings(readings, options = {}) {
  if (!Array.isArray(readings)) throw new TypeError('Readings must be an array')

  const normalized = []
  const findings = []

  readings.forEach((reading, index) => {
    const pointer = `/${index}`
    if (!reading || typeof reading !== 'object' || Array.isArray(reading)) {
      findings.push({
        ruleId: 'reading-malformed',
        severity: 'error',
        message: 'Reading must be an object.',
        location: { pointer },
      })
      return
    }

    const target = reading.targetUnit ?? options.targetUnit?.[
      Object.hasOwn(UNITS, reading.unit) ? UNITS[reading.unit].dimension : ''
    ]

    if (target === undefined) {
      findings.push({
        ruleId: 'target-unit-missing',
        severity: 'error',
        message: `No target unit declared for reading ${reading.id ?? index}.`,
        location: { pointer },
      })
      return
    }

    try {
      const value = convert(reading.value, reading.unit, target, {
        precision: options.precision,
        checkRange: options.checkRange,
      })
      normalized.push({
        ...(reading.id !== undefined ? { id: reading.id } : {}),
        value,
        unit: target,
        originalValue: reading.value,
        originalUnit: reading.unit,
      })
    } catch (error) {
      if (!(error instanceof UnitError)) throw error
      findings.push({
        ruleId: error.code,
        severity: 'error',
        message: error.message,
        location: { pointer },
        ...(reading.id !== undefined ? { id: reading.id } : {}),
      })
    }
  })

  findings.sort((left, right) => byCodeUnit(left.location.pointer, right.location.pointer) || byCodeUnit(left.ruleId, right.ruleId))

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: TOOL_ID,
    status: findings.length > 0 ? 'fail' : 'pass',
    summary: {
      checked: readings.length,
      normalized: normalized.length,
      errors: findings.length,
      warnings: 0,
    },
    readings: normalized,
    findings,
  }
}

export function formatReport(report) {
  const lines = report.findings.map((item) =>
    `${item.severity.toUpperCase().padEnd(7)} ${item.location.pointer} ${item.message}`)
  lines.push('')
  lines.push(
    `${report.summary.checked} reading(s): ${report.summary.normalized} normalized, `
    + `${report.summary.errors} rejected, status ${report.status}.`,
  )
  return `${lines.join('\n')}\n`
}
