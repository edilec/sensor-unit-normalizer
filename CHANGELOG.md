# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- a typed unit registry covering eleven dimensions, with affine conversion
  support so Celsius, Fahrenheit and Kelvin convert across their offsets rather
  than by scaling alone;
- dimension checking, so incompatible units are rejected instead of silently
  scaled;
- physical range checks per dimension, with an opt-out for calibration data;
- rejection of `NaN`, infinities and non-numbers at the boundary;
- `precision` rounding that avoids the usual `toFixed` surprises;
- `normalizeReadings` for batches, recording why each rejected reading failed
  while still normalizing the rest;
- a CLI with `convert`, `normalize` and `units`, and exit codes 0 / 1 / 2;
- runnable clean and broken reading examples;
- the registry and conversion rules in `docs/units.md`.

### Fixed

- `normalize` no longer republishes the readings file it could not parse. V8
  reports a parse failure two ways, and one of them quotes the input back --
  `Unexpected token 'A', "AKIAIOSFODNN7EXAMPLE" is not valid JSON` -- which
  reproduces the first ten characters of the file, or the whole file when it is
  shorter than that. The command line let that message reach stderr whole, so a
  readings file short enough to be nothing but a credential was printed in full.
  `parseFailureDetail` in `src/index.mjs` now keeps the offset, line and column
  and drops the quoted half. `test/parse-failure.test.mjs` plants the canary
  through the real binary and asserts it is absent from stdout, from stderr and
  from every prefix of it down to eight characters, because V8 quotes only ten.

No release has been published.
