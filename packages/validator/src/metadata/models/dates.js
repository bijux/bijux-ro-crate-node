const addError = (errors, loc, msg, type) => errors.push({loc, msg, type})

export function parseDate(value, loc, errors) {
  const invalid = detail => addError(errors, loc, `Input should be a valid date or datetime, ${detail}`, 'date_from_datetime_parsing');
  let dateValue = value;
  if (typeof dateValue === 'bigint') dateValue = Number(dateValue);
  if (typeof value === 'string' && /^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(value)) dateValue = Number(value);
  if (typeof dateValue === 'number') {
    if (Number.isNaN(dateValue)) {
      invalid('NaN values not permitted');
      return value;
    }
    const seconds = Math.abs(dateValue) > 2e10 ? dateValue / 1000 : dateValue;
    if (seconds > 253402300799 || seconds < -62167219200) {
      invalid(seconds < 0 ? 'dates before 0000 are not supported as unix timestamps' : 'dates after 9999 are not supported as unix timestamps');
      return value;
    }
    const wholeSeconds = Math.floor(seconds);
    // Preserve the signed-fraction behavior in poetry.lock's pydantic-core 2.41.5.
    const microseconds = Math.round(Math.abs(seconds % 1) * 1000000);
    const normalizedSeconds = wholeSeconds + (microseconds === 1000000 ? 1 : 0);
    const milliseconds = normalizedSeconds * 1000;
    if (normalizedSeconds % 86400 || microseconds % 1000000) {
      addError(errors, loc, 'Datetimes provided to dates should have zero time - e.g. be exact dates', 'date_from_datetime_inexact');
      return value;
    }
    const date = new Date(milliseconds);
    if (date.getUTCFullYear() === 0) {
      addError(errors, loc, 'Input should be a valid date in the format YYYY-MM-DD, year 0 is out of range', 'date_parsing');
      return value;
    }
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
      invalid(dateValue < 0 ? 'dates before 0000 are not supported as unix timestamps' : 'dates after 9999 are not supported as unix timestamps');
      return value;
    }
    return date.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') {
    addError(errors, loc, 'Input should be a valid date', 'date_type');
    return value;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})([\s\S]*)$/.exec(value);
  if (!match) {
    if (value.length < 10) invalid('input is too short');
    else if (!/^\d{4}/.test(value)) invalid('invalid character in year');
    else if (value[4] !== '-') invalid('invalid date separator, expected `-`');
    else if (!/^\d{2}$/.test(value.slice(5, 7))) invalid('invalid character in month');
    else if (value[7] !== '-') invalid('invalid date separator, expected `-`');
    else invalid('invalid character in day');
    return value;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (month < 1 || month > 12) invalid('month value is outside expected range of 1-12');
  else if (day < 1 || day > maxDay) invalid('day value is outside expected range');
  else if (year < 1) addError(errors, loc, 'Input should be a valid date in the format YYYY-MM-DD, year 0 is out of range', 'date_parsing');
  else if (match[4]) {
    if (!/^[Tt _]/.test(match[4])) invalid('invalid datetime separator, expected `T`, `t`, `_` or space');
    else {
      const result = timeParts(match[4].slice(1));
      if (result.error) invalid(result.error);
      else if (result.nonzero) addError(errors, loc, 'Datetimes provided to dates should have zero time - e.g. be exact dates', 'date_from_datetime_inexact');
    }
  }
  return value.slice(0, 10);
}

// Preserve speedate 0.17.0's parse order: clock, optional fractional seconds,
// timezone, then trailing data. A regex alone loses its distinct diagnostics.
function timeParts(text) {
  const fail = error => ({error});
  const digits = (at, length = 2) => new RegExp(`^[0-9]{${length}}$`).test(text.slice(at, at + length));
  if (text.length < 5) return fail('input is too short');
  if (!digits(0)) return fail('invalid character in hour');
  if (text[2] !== ':') return fail('invalid time separator, expected `:`');
  if (!digits(3)) return fail('invalid character in minute');
  const hour = Number(text.slice(0, 2)), minute = Number(text.slice(3, 5));
  if (hour > 23) return fail('hour value is outside expected range of 0-23');
  if (minute > 59) return fail('minute value is outside expected range of 0-59');
  let position = 5, second = 0, fraction = '';
  if (text[position] === ':') {
    if (!digits(6)) return fail('invalid character in second');
    second = Number(text.slice(6, 8));
    if (second > 59) return fail('second value is outside expected range of 0-59');
    position = 8;
    if (/[.,]/.test(text[position] ?? '')) {
      position++;
      while (/[0-9]/.test(text[position] ?? '')) fraction += text[position++];
      if (!fraction) return fail('second fraction digits missing after `.`');
    }
  }
  if (position < text.length) {
    const sign = text[position++];
    if (!/[Zz]/.test(sign)) {
      if (!/[+\-\u2212]/.test(sign)) return fail('invalid timezone sign');
      if (!digits(position)) return fail('invalid timezone hour');
      const hours = Number(text.slice(position, position + 2));
      position += 2;
      if (text[position] === ':') position++;
      if (!digits(position)) return fail('invalid timezone minute');
      const minutes = Number(text.slice(position, position + 2));
      position += 2;
      if (minutes > 59) return fail('timezone minute value is outside expected range of 0-59');
      if (hours >= 24) return fail('timezone offset must be less than 24 hours');
    }
  }
  if (position < text.length) return fail('unexpected extra characters at the end of the input');
  return {nonzero: hour !== 0 || minute !== 0 || second !== 0 || Number(fraction.slice(0, 6)) !== 0};
}
