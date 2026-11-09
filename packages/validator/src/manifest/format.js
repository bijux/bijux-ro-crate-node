import {pythonStringRepr} from '../diagnostics/python-strings.js';
export {pythonStringRepr} from '../diagnostics/python-strings.js';

export function pythonString(value, floating = false) {
  if (Array.isArray(value)) return `[${value.map(pythonStringRepr).join(', ')}]`;
  if (value === null) return 'nan';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return value < 0 ? '-inf' : 'inf';
    if (floating && Object.is(value, -0)) return '-0.0';
    if (floating && value && (Math.abs(value) >= 1e16 || Math.abs(value) < 1e-4)) {
      return value.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');
    }
    if (floating && Number.isInteger(value)) return `${value}.0`;
  }
  return String(value);
}
