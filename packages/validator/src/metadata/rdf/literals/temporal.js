const pad = (value, width = 2) => String(value).padStart(width, '0')
const fraction = digits => (digits ?? '').slice(0, 6).padEnd(6, '0')
const fractionText = digits => Number(digits) ? '.' + digits : ''

function calendarDate(year, month, day) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null
}

function dateParts(text) {
  const calendar = /^(\d{4})(-?)(\d{2})\2(\d{2})$/.exec(text)
  if (calendar) {
    const date = calendarDate(Number(calendar[1]), Number(calendar[3]), Number(calendar[4]))
    return date?.toISOString().slice(0, 10) ?? null
  }
  const week = /^(\d{4})(-?)W(\d{2})(?:\2([1-7]))?$/.exec(text)
  if (!week) return null
  const year = Number(week[1]), number = Number(week[3]), day = Number(week[4] ?? 1)
  const jan4 = calendarDate(year, 1, 4)
  if (!jan4 || number < 1 || number > 53) return null
  const jan1 = calendarDate(year, 1, 1).getUTCDay() || 7
  const leap = calendarDate(year, 2, 29) !== null
  if (number === 53 && jan1 !== 4 && !(jan1 === 3 && leap)) return null
  jan4.setUTCDate(4 - ((jan4.getUTCDay() || 7) - 1) + (number - 1) * 7 + day - 1)
  if (jan4.getUTCFullYear() > 9999) return null
  return jan4.toISOString().slice(0, 10)
}

function clockParts(text, offset = false) {
  const match = /^(\d{2})(?:(:?)(\d{2})(?:\2(\d{2}))?)?(?:[.,](\d+))?$/.exec(text)
  if (!match) return null
  const [hour, minute, second] = [match[1], match[3] ?? 0, match[4] ?? 0].map(Number)
  if (!offset && (hour > 23 || minute > 59 || second > 59)) return null
  return {hour, minute, second, micros: fraction(match[5])}
}

function clock(text) {
  const match = /^([^+Z-]+)(Z|[+-].+)?$/.exec(text)
  if (!match) return null
  const value = clockParts(match[1])
  if (!value) return null
  let zone = ''
  if (match[2]) {
    const offset = match[2] === 'Z' ? {hour: 0, minute: 0, second: 0, micros: '000000'} : clockParts(match[2].slice(1), true)
    if (!offset) return null
    const seconds = offset.hour * 3600 + offset.minute * 60 + offset.second
    if (seconds + Number(offset.micros) / 1e6 >= 86400) return null
    // CPython discards a fractional offset when all whole components are zero.
    zone = seconds === 0 ? '+00:00' : (match[2][0] === '-' ? '-' : '+') +
      pad(Math.floor(seconds / 3600)) + ':' + pad(Math.floor(seconds / 60) % 60) +
      (seconds % 60 || Number(offset.micros) ? ':' + pad(seconds % 60) + fractionText(offset.micros) : '')
  }
  return pad(value.hour) + ':' + pad(value.minute) + ':' + pad(value.second) + fractionText(value.micros) + zone
}

/** Preserve local clock and offset spelling identity, rather than UTC instants. */
export function temporalLiteral(text, type) {
  if (type === 'date') {
    let value = text.replace(/[Zz]$/, '')
    if (value.startsWith('-')) return text
    if (value.includes('T')) value = value.split('T')[0]
    else {
      const plus = value.lastIndexOf('+'), minus = value.lastIndexOf('-')
      if (plus > 0) value = value.slice(0, plus)
      else if (minus > 0 && value.slice(minus).includes(':')) value = value.slice(0, minus)
    }
    return value.includes('-') ? dateParts(value) ?? text : text
  }
  if (type === 'time') return clock(text.replace(/^T/, '')) ?? text
  if (type !== 'dateTime') return text
  // ISO week dates allow a numeric date/time separator. The reference chooses
  // its boundary before parsing the clock, so greedy matching changes identity.
  let boundary
  if (text[4] === '-') {
    if (text[5] !== 'W') boundary = 10
    else if (text[8] === '-') {
      if (text.length === 9) return text
      boundary = text.length > 10 && /[0-9]/.test(text[10]) ? 8 : 10
    } else boundary = 8
  } else if (text[4] === 'W') {
    let end = 7
    while (end < text.length && /[0-9]/.test(text[end])) end++
    boundary = end < 9 ? end : end % 2 === 0 ? 7 : 8
  } else boundary = 8
  const date = dateParts(text.slice(0, boundary))
  const tail = text.slice(boundary)
  const time = tail ? clock(tail.slice(String.fromCodePoint(tail.codePointAt(0)).length)) : '00:00:00'
  return date && time ? date + 'T' + time : text
}
