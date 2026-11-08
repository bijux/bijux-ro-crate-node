import Decimal from 'decimal.js'
import {temporalLiteral} from './temporal.js'
const D = Decimal.clone({precision: 28, rounding: Decimal.ROUND_HALF_EVEN})
const part = '([0-9]+(?:[.,][0-9]+)?)'
const period = new RegExp('^([+-])?P(?!\\b)(?:' + part + 'Y)?(?:' + part + 'M)?(?:' + part + 'W)?(?:' + part + 'D)?(?:T(?:' + part + 'H)?(?:' + part + 'M)?(?:' + part + 'S)?)?$')
const scale = text => (text.split('.')[1]?.length ?? 0)
const roundedScale = (value, expected) => value.isZero() ? expected : Math.min(expected, 27 - value.e)
const halfEven = value => {
  const lower = Math.floor(value), delta = value - lower
  return delta > 0.5 || (delta === 0.5 && lower % 2) ? lower + 1 : lower
}

// Accumulate integral microseconds separately, then round the combined
// fractional remainder with the reference's tie-to-even rule and argument order.
function microseconds(values) {
  let whole = 0n, rest = 0
  for (const [text, factor] of values.toReversed()) {
    const value = Number(text), integer = Math.trunc(value)
    if (!Number.isFinite(value)) return null
    whole += BigInt(integer) * BigInt(factor)
    const product = (value - integer) * factor, integral = Math.trunc(product)
    whole += BigInt(integral)
    rest += product - integral
  }
  const odd = Number(whole & 1n)
  whole += BigInt(halfEven(rest + odd) - odd)
  return whole / 86400000000n > 999999999n ? null : whole
}

export function durationLiteral(text) {
  const match = period.exec(text.endsWith('\n') ? text.slice(0, -1) : text)
  let sign = '', years, months, delta
  if (match) {
    const values = match.slice(2).map(value => (value ?? '0').replace(',', '.'))
    sign = match[1]
    years = values[0]
    months = values[1]
    delta = microseconds(values.slice(2).map((value, i) => [value, [604800000000, 86400000000, 3600000000, 60000000, 1000000][i]]))
  } else if (text.startsWith('P')) {
    const value = temporalLiteral(text.slice(1), 'dateTime')
    const alternative = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{6}))?(?:Z|[+-].*)?$/.exec(value)
    if (!alternative) return text
    years = alternative[1]; months = alternative[2]
    delta = microseconds([[alternative[3], 86400000000], [alternative[4], 3600000000],
      [alternative[5], 60000000], [alternative[6], 1000000]])
    if (delta !== null) delta += BigInt(alternative[7] ?? 0)
  } else return text
  if (delta === null || (sign === '-' && delta > 999999999n * 86400000000n)) return text
  // Decimal arithmetic uses the reference context precision; lexical scale
  // remains significant when the formatter emits fractional calendar months.
  const monthInput = new D(months).plus(0)
  const carried = monthInput.div(12).floor()
  const remaining = monthInput.minus(carried.mul(12))
  const remainderScale = roundedScale(remaining, Math.max(scale(months), 0))
  const yearValue = new D(years).plus(carried)
  const yearScale = roundedScale(yearValue, Math.max(scale(years), 0))
  const totalMonths = yearValue.mul(12).plus(remaining)
  const totalScale = roundedScale(totalMonths, Math.max(yearScale, remainderScale))
  const yearPart = totalMonths.divToInt(12)
  if (yearPart.e >= 28) throw new TypeError('Duration decimal quotient exceeds reference precision')
  const monthPart = totalMonths.mod(12)
  if (sign === '-' && !totalMonths.isZero() && delta > 0n)
    throw new TypeError('Duration cannot have negative years and negative days')
  let result = yearPart.isZero() ? '' : yearPart.toFixed(0) + 'Y'
  if (!remaining.isZero()) result += monthPart.toFixed(Math.max(0, totalScale)) + 'M'
  const days = delta / 86400000000n, hours = delta / 3600000000n % 24n,
    minutes = delta / 60000000n % 60n, seconds = delta / 1000000n % 60n, micros = delta % 1000000n
  if (days) result += days + 'D'
  if (hours || minutes || seconds || micros) {
    result += 'T'
    if (hours) result += hours + 'H'
    if (minutes) result += minutes + 'M'
    if (seconds || micros) result += seconds + (micros ? '.' + String(micros).padStart(6, '0').replace(/0+$/, '') : '') + 'S'
  }
  return (sign === '-' && (!totalMonths.isZero() || delta) ? '-P' : 'P') + (result || '0D')
}
