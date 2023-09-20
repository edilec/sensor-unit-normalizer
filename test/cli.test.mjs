import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = resolve(projectDirectory, 'bin/sensor-unit-normalizer.mjs')

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: projectDirectory, encoding: 'utf8' })
}

test('convert prints the converted value', () => {
  const result = run(['convert', '20', 'degC', 'degF', '--precision', '2'])

  assert.equal(result.status, 0)
  assert.equal(result.stdout.trim(), '68')
})

test('convert refuses an incompatible pair with a non-zero exit', () => {
  const result = run(['convert', '1', 'm', 'kg'])

  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Cannot convert m \(length\) to kg \(mass\)/)
})

test('convert refuses NaN input', () => {
  const result = run(['convert', 'not-a-number', 'degC', 'degF'])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /NaN/)
})

test('normalize on the clean example exits zero', () => {
  const result = run(['normalize', 'examples/readings.json', '--precision', '3'])

  assert.equal(result.status, 0)
  assert.match(result.stdout, /status pass/)
})

test('normalize on the broken example exits one and names each reason', () => {
  const result = run(['normalize', 'examples/broken-readings.json'])

  assert.equal(result.status, 1)
  assert.match(result.stdout, /Cannot convert m \(length\) to kg \(mass\)/)
  assert.match(result.stdout, /physically possible range/)
  assert.match(result.stdout, /Unknown source unit "furlong"/)
})

test('--json is parseable with a clean stderr', () => {
  const result = run(['normalize', 'examples/readings.json', '--json'])

  assert.equal(result.stderr, '')
  assert.equal(JSON.parse(result.stdout).tool, 'sensor-unit-normalizer')
})

test('repeated runs produce identical JSON', () => {
  const args = ['normalize', 'examples/broken-readings.json', '--json']
  assert.equal(run(args).stdout, run(args).stdout)
})

test('units lists the registry', () => {
  const result = run(['units'])
  const names = result.stdout.trim().split('\n')

  assert.equal(result.status, 0)
  assert.ok(names.includes('degC'))
  assert.ok(names.includes('GiB'))
  assert.deepEqual(names, [...names].sort())
})

test('--no-range-check allows calibration values', () => {
  const blocked = run(['convert', '-300', 'degC', 'degC'])
  const allowed = run(['convert', '-300', 'degC', 'degC', '--no-range-check'])

  assert.notEqual(blocked.status, 0)
  assert.equal(allowed.status, 0)
})

test('a missing file and unknown command are usage errors', () => {
  assert.equal(run(['normalize', 'examples/nope.json']).status, 2)
  assert.match(run(['frobnicate']).stderr, /Unknown command "frobnicate"/)
})

test('--help exits zero', () => {
  const result = run(['--help'])

  assert.equal(result.status, 0)
  assert.match(result.stdout, /Usage:/)
})
