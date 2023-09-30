# Unit registry and conversion rules

## How a conversion works

Every unit converts to its dimension's base unit by `value * factor + offset`.
Most units are purely multiplicative, so `offset` is zero. Temperature is not,
and that is the whole reason `offset` exists.

Getting it wrong is the classic sensor bug: scaling 20 °C by 9/5 gives 36
instead of 68, and a linear-only registry will do exactly that without
complaining. There is a test for every temperature anchor, including −40, where
the two scales cross.

## Dimensions

| Dimension | Base | Physical range (base units) |
| --- | --- | --- |
| `temperature` | `K` | 0 … 1e9 |
| `length` | `m` | 0 … 1e15 |
| `mass` | `kg` | 0 … 1e12 |
| `time` | `s` | 0 … 1e12 |
| `pressure` | `Pa` | 0 … 1e12 |
| `speed` | `m/s` | 0 … 299,792,458 |
| `electric-potential` | `V` | −1e9 … 1e9 |
| `electric-current` | `A` | −1e9 … 1e9 |
| `data-size` | `B` | 0 … 1e21 |
| `angle` | `rad` | −1e6 … 1e6 |
| `relative-humidity` | `%RH` | 0 … 100 |

The range is a sanity bound on real-world readings, not a calibration limit.
`--no-range-check` turns it off for calibration or fault-injection data.

## Units

`temperature` `K` `degC` `degF` · `length` `m` `km` `cm` `mm` `mi` `ft` `in` ·
`mass` `kg` `g` `mg` `lb` · `time` `s` `ms` `min` `h` `d` ·
`pressure` `Pa` `hPa` `kPa` `bar` `psi` · `speed` `m/s` `km/h` `mph` ·
`electric-potential` `V` `mV` · `electric-current` `A` `mA` ·
`data-size` `B` `kB` `MB` `GB` `KiB` `MiB` `GiB` · `angle` `rad` `deg` ·
`relative-humidity` `%RH`

Decimal and binary data prefixes are deliberately distinct: `GB` is 10⁹ bytes
and `GiB` is 2³⁰.

## Floating point and tolerance

Conversions run in IEEE-754 doubles. An affine conversion composes a
multiplication with an offset, so results carry roughly one unit in the last
place of error: `convert(0, 'degC', 'degF')` returns `31.999999999999986`
rather than exactly `32`.

This is expected and is why round-trip guarantees are stated as *within
tolerance*. Pass `precision` when you want an exact decimal for display or for
a stable serialized record:

```js
convert(0, 'degC', 'degF', { precision: 6 })  // 32
```

`round` avoids the usual `toFixed` surprises — `round(1.005, 2)` is `1.01`.

## Rejected values

| Rule ID | Meaning |
| --- | --- |
| `unknown-unit` | The unit is not in the registry. The message names whether it was the source or target. |
| `dimension-mismatch` | The units measure different things. Never silently scaled. |
| `value-not-a-number` | The value is not a number, or is `NaN`. |
| `value-not-finite` | The value is ±Infinity, or the conversion produced a non-finite result. |
| `value-out-of-range` | The reading is outside the dimension's physically possible range. |
| `invalid-precision` | Precision is not an integer from 0 through 15. |
| `reading-malformed` | A batch entry is not an object. |
| `target-unit-missing` | A batch entry has no target unit and none was declared for its dimension. |

## A readings file that will not parse

`normalize` reports the offset the parse failed at — position, line and column —
and never the text it failed on. V8 reports a parse failure two ways and one of
them quotes the input back, `Unexpected token 'A', "AKIAIOSFODNN7EXAMPLE" is not
valid JSON`, which reproduces the first ten characters of the file, or the whole
file when it is shorter than that. A readings file short enough to be nothing
but a credential would otherwise be printed in full to stderr, on the one path
an unparseable file is guaranteed to take. The quoted half is dropped before the
message is built; the offset, which says nothing about content, is kept whole.

`NaN` matters more than it looks. It propagates silently through arithmetic, so
one bad sample can poison an entire derived series while every downstream check
still reports success. It is refused at the boundary rather than converted.

## Batches

`normalizeReadings` does not abandon a batch when one reading fails. The rest
are still normalized and each failure is recorded with its reason, because a
single bad sample in a telemetry export should not cost you the whole file.
