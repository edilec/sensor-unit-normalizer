import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseFailureDetail } from '../src/index.mjs'

/**
 * A readings file that cannot be parsed must not be republished by its own
 * diagnostic.
 *
 * V8 reports a parse failure two ways, and one of them quotes the input back:
 * `Unexpected token 'A', "AKIAIOSFODNN7EXAMPLE" is not valid JSON`. The quoted
 * run is the first ten characters of the document, or the whole document when
 * it is shorter, so a file short enough to be nothing but a credential is
 * reproduced in full by its own error message. `normalize` interpolated that
 * message whole onto stderr -- on the error path, which is the path a
 * malformed or misnamed file is guaranteed to take.
 *
 * The canary is `AKIAIOSFODNN7EXAMPLE`, the access key id AWS publishes in its
 * own documentation. It is not a credential; it is the shape of one.
 */

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = resolve(projectDirectory, 'bin/sensor-unit-normalizer.mjs')

const CANARY = 'AKIAIOSFODNN7EXAMPLE'

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: projectDirectory, encoding: 'utf8' })
}

/** Write a readings file of the caller's choosing and run the real binary over it. */
async function withReadings(content, body) {
  const base = await mkdtemp(join(tmpdir(), 'sensor-unit-normalizer-canary-'))
  try {
    const path = join(base, 'readings.json')
    await writeFile(path, content, 'utf8')
    return await body(run(['normalize', path]))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

/**
 * Assert the canary is absent from both streams, and so is every prefix of it
 * down to eight characters. The prefixes matter because V8 quotes only the
 * first ten characters once the document is long enough: a test looking for
 * the whole canary would pass against a message still leaking `AKIAIOSFOD`.
 */
function assertNoCanary(result, label) {
  for (let length = CANARY.length; length >= 8; length -= 1) {
    const prefix = CANARY.slice(0, length)
    assert.equal(result.stdout.includes(prefix), false, `${label}: stdout carries ${prefix}`)
    assert.equal(result.stderr.includes(prefix), false, `${label}: stderr carries ${prefix}`)
  }
}

test('a readings file that is nothing but a credential is not echoed back', async () => {
  await withReadings(CANARY, (result) => {
    assert.equal(result.status, 2)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /not valid JSON/)
    assertNoCanary(result, 'whole document')
  })
})

test('a credential inside a longer readings file is not echoed either', async () => {
  await withReadings(`{"targetUnit": "degC", "readings": ${CANARY}}`, (result) => {
    assert.equal(result.status, 2)
    assertNoCanary(result, 'embedded in a document')
  })
})

test('the position, line and column survive -- a diagnostic that says nothing is a different defect', async () => {
  await withReadings('{"targetUnit": "degC" "readings": []}', (result) => {
    assert.equal(result.status, 2)
    assert.match(result.stderr, /at position \d+ \(line \d+ column \d+\)/)
  })
})

test('a readings file that cannot be read still says which syscall failed', () => {
  const result = run(['normalize', 'examples/nope.json'])

  assert.equal(result.status, 2)
  assert.match(result.stderr, /ENOENT/)
})

test('parseFailureDetail keeps the offset and drops the quoted document', () => {
  const detailFor = (text) => {
    try {
      JSON.parse(text)
    } catch (error) {
      return parseFailureDetail(error)
    }
    throw new Error('the fixture parsed, so it pins nothing')
  }

  assert.equal(detailFor(CANARY), "unexpected token 'A' at the start of the document")
  assert.equal(detailFor('ssn 123-45-6789'), "unexpected token 's' at the start of the document")
  assert.equal(detailFor('password=hunter2-correct-horse'), "unexpected token 'p' at the start of the document")
  assert.equal(detailFor(`{"a": 1, "b": ${CANARY}}`), "unexpected token 'A' inside the document")
  assert.equal(detailFor(''), 'Unexpected end of JSON input')
  assert.equal(detailFor('{"a": 1 "b": 2}'), "Expected ',' or '}' after property value in JSON at position 8 (line 1 column 9)")
  assert.equal(detailFor('{"a": 1} trailing'), 'Unexpected non-whitespace character after JSON at position 9 (line 1 column 10)')
})

test('parseFailureDetail refuses a wording it was not taught rather than guessing', () => {
  assert.equal(
    parseFailureDetail(new Error('Unexpected token \'A\', "AKIAIOSFODNN7EXAMPLE" is not valid JSON at position 0')),
    'the document could not be parsed as JSON',
    'a double quote surviving to the end means the snippet survived with it',
  )
  assert.equal(parseFailureDetail(undefined), 'the document could not be parsed as JSON')
})

/**
 * The order the two V8 spellings are recognised in is what keeps the rest true.
 *
 * `parseFailureDetail` looks for the quoting shape BEFORE it looks for the
 * offset, and the difference is not cosmetic: a readings file whose own text
 * reads `at position 1` is quoted back by V8 as `Unexpected token 'a', "at
 * position 1" is not valid JSON`, so an offset-first search finds that phrase
 * inside the quoted span and the slice hands the file straight back out.
 * Nineteen tools in this catalog shipped that ordering. These tests fail if
 * this one adopts it.
 */

const UNPARSEABLE = 'the document could not be parsed as JSON'

/** The detail for a document V8 actually refused -- never a hand-written message. */
function detailOf(document) {
  try {
    JSON.parse(document)
  } catch (error) {
    return parseFailureDetail(error)
  }
  throw new Error(`${JSON.stringify(document)} parsed, so it pins nothing`)
}

/** No run of four characters or more from the document survives into the detail. */
function assertNoRunOf(document, detail, label) {
  for (let length = 4; length <= document.length; length += 1) {
    const prefix = document.slice(0, length)
    assert.equal(detail.includes(prefix), false, `${label}: the detail carries ${JSON.stringify(prefix)}`)
  }
}

test('a readings file whose own text reads "at position 1" is not sliced back out', () => {
  const document = 'at position 1'
  const detail = detailOf(document)

  assert.equal(detail.includes('"'), false, 'a double quote in the detail means a quoted span survived')
  assert.equal(detail.includes(document), false, 'the file came back inside its own diagnostic')
  assert.equal(detail, "unexpected token 'a' at the start of the document")
})

test('a long readings file is not quoted back by any run of its sensitive opening', () => {
  const document = `${CANARY} and a great deal of trailing content nobody should read back`
  const detail = detailOf(document)

  assertNoRunOf(document, detail, 'long readings file')
  assert.equal(detail, "unexpected token 'A' at the start of the document")
})

test('a quoted span holding a newline is still recognised as a quoted span', () => {
  // Without the `s` flag the quoting shape does not match a span with a line
  // break in it, the offset branch is reached, and the generic sentence is all
  // that is left -- or worse, the span is sliced out.
  const detail = detailOf('}x\n')

  assert.equal(detail, "unexpected token '}' at the start of the document")
  assert.notEqual(detail, UNPARSEABLE, 'the newline case fell through to the generic sentence')
})

test('the safe positional spelling keeps its position, line and column', () => {
  // A helper that answered the generic sentence for everything would pass every
  // leak test above while destroying every diagnostic. This is the other half.
  const detail = detailOf('{"targetUnit": "degC" "readings": []}')

  assert.match(detail, /at position \d+ \(line \d+ column \d+\)$/)
  assert.equal(detail, "Expected ',' or '}' after property value in JSON at position 22 (line 1 column 23)")
})
