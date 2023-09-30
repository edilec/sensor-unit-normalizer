#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  UnitError, convert, formatReport, normalizeReadings, parseFailureDetail, unitNames,
} from '../src/index.mjs'

const HELP = `sensor-unit-normalizer

Convert sensor readings between units of the same dimension.

Usage:
  sensor-unit-normalizer convert <VALUE> <FROM> <TO> [--precision N] [--no-range-check]
  sensor-unit-normalizer normalize <READINGS.json> [--precision N] [--json]
  sensor-unit-normalizer units

Options:
  --precision N       Round results to N decimal places (0-15)
  --no-range-check    Skip the physical range check, for calibration data
  --json              Emit the machine-readable report on stdout
  -h, --help          Show this help

Exit codes:
  0  every reading converted
  1  at least one reading could not be converted
  2  invalid usage, or the input could not be read
`

function parseArguments(argv) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) return { help: true }

  const [command, ...rest] = argv
  const options = { command, positional: [], precision: undefined, checkRange: true, json: false }

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === '--json') options.json = true
    else if (argument === '--no-range-check') options.checkRange = false
    else if (argument === '--precision') {
      const value = rest[index + 1]
      if (value === undefined) throw new Error('--precision requires a value')
      options.precision = Number(value)
      index += 1
    } else if (argument.startsWith('--')) throw new Error(`Unknown option "${argument}"`)
    else options.positional.push(argument)
  }
  return options
}

/**
 * Parse the readings file without letting it describe itself.
 *
 * V8 quotes the input back in one of its two parse-failure message shapes, so
 * a readings file short enough to be nothing but a credential would be printed
 * in full to stderr by its own error. `parseFailureDetail` keeps the offset,
 * which is the half that helps, and drops the quoted half.
 */
function parseReadings(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`The readings file is not valid JSON: ${parseFailureDetail(error)}.`)
  }
}

async function main(argv) {
  let options
  try {
    options = parseArguments(argv)
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${HELP}`)
    return 2
  }
  if (options.help) {
    process.stdout.write(HELP)
    return 0
  }

  try {
    if (options.command === 'units') {
      process.stdout.write(`${unitNames().join('\n')}\n`)
      return 0
    }

    if (options.command === 'convert') {
      const [rawValue, from, to] = options.positional
      if (rawValue === undefined || from === undefined || to === undefined) {
        throw new Error('convert requires VALUE FROM TO')
      }
      const value = Number(rawValue)
      const result = convert(value, from, to, {
        precision: options.precision,
        checkRange: options.checkRange,
      })
      process.stdout.write(`${result}\n`)
      return 0
    }

    if (options.command === 'normalize') {
      const [file] = options.positional
      if (file === undefined) throw new Error('normalize requires a readings file')
      const parsed = parseReadings(await readFile(resolve(file), 'utf8'))
      const readings = Array.isArray(parsed) ? parsed : parsed.readings
      const report = normalizeReadings(readings, {
        precision: options.precision,
        checkRange: options.checkRange,
        targetUnit: Array.isArray(parsed) ? undefined : parsed.targetUnit,
      })
      process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report))
      return report.status === 'fail' ? 1 : 0
    }

    throw new Error(`Unknown command "${options.command}"`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    // A UnitError means the input was read and a reading could not be
    // converted: a completed check that failed. Anything else -- an unreadable
    // file, malformed JSON, bad usage -- means the check never ran.
    return error instanceof UnitError ? 1 : 2
  }
}

process.exitCode = await main(process.argv.slice(2))
