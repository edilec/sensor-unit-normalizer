# Sensor Unit Normalizer

Convert sensor readings between units of the same dimension, with dimension
checks, physical ranges and explicit handling of values that are not readings.

- **Repository:** [edilec/sensor-unit-normalizer](https://github.com/edilec/sensor-unit-normalizer)
- **Area:** IoT & Edge
- **License:** MIT

## Why it exists

Two failures show up again and again in telemetry pipelines.

The first is treating an **affine** conversion as a linear one. Scaling 20 °C by
9/5 gives 36 instead of 68, and a registry that only knows about multipliers
will do exactly that without complaining.

The second is **`NaN`**. It propagates silently through arithmetic, so one bad
sample can poison an entire derived series while every downstream check still
reports success.

This tool handles both at the boundary.

## Requirements

- Node.js 22 or newer
- no runtime dependencies

## Quick start

```sh
node bin/sensor-unit-normalizer.mjs convert 20 degC degF --precision 2   # 68
node bin/sensor-unit-normalizer.mjs normalize examples/readings.json --precision 3
node bin/sensor-unit-normalizer.mjs units
```

A batch records why each rejected reading failed, and still normalizes the rest:

```text
ERROR   /1 Cannot convert m (length) to kg (mass).
ERROR   /2 -400 degC is outside the physically possible range for temperature.
ERROR   /3 Unknown source unit "furlong".
ERROR   /4 No target unit declared for reading no-target.

5 reading(s): 1 normalized, 4 rejected, status fail.
```

A single bad sample in a telemetry export should not cost you the whole file.

## Library usage

```js
import { convert, normalizeReadings } from 'sensor-unit-normalizer'

convert(20, 'degC', 'degF')                    // 67.99999999999999
convert(20, 'degC', 'degF', { precision: 2 })  // 68
convert(1, 'm', 'kg')                          // throws UnitError dimension-mismatch
```

## Floating point

Conversions run in IEEE-754 doubles, and an affine conversion composes a
multiplication with an offset, so results carry roughly one unit in the last
place of error — `convert(0, 'degC', 'degF')` is `31.999999999999986`, not
exactly `32`.

That is expected, and it is why round-trip guarantees are stated as *within
tolerance*. Pass `precision` when you need an exact decimal for display or for a
stable serialized record.

## Units

Eleven dimensions: temperature, length, mass, time, pressure, speed, electric
potential, electric current, data size, angle and relative humidity. Decimal and
binary data prefixes are deliberately distinct — `GB` is 10⁹ bytes, `GiB` is 2³⁰.

The full registry, ranges and rule catalog are in
[`docs/units.md`](./docs/units.md).

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | every reading converted |
| `1` | at least one reading could not be converted |
| `2` | invalid usage, or the input could not be read |

## Limits and non-goals

- It converts units; it does not calibrate sensors, correct drift, or judge
  whether a reading is plausible beyond the coarse physical range.
- Ranges are sanity bounds on real-world readings, not calibration limits. Use
  `--no-range-check` for calibration or fault-injection data.
- It does not parse compound or derived units: `m/s` is a registered unit, not
  something assembled from `m` and `s`.
- It does not carry measurement uncertainty. A converted value is as precise as
  the double arithmetic that produced it, no more.
- Relative humidity is treated as a plain percentage; it is not converted to or
  from absolute humidity, which needs temperature and pressure.

## Development

```sh
npm test          # behaviour tests
npm run check     # lint, tests, runnable example, packaging check
```

## License

MIT. See [LICENSE](./LICENSE).
