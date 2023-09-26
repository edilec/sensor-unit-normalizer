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

No release has been published.
