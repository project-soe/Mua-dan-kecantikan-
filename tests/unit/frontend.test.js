import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTheme } from '../../public/assets/js/theme.js';
import { rupiah, formatDuration, formatWindows } from '../../public/assets/js/format.js';

test('sanitizeTheme hanya menerima warna hex untuk kunci yang dikenal', () => {
  const out = sanitizeTheme({ colors: {
    primary: '#112233', accent: 'red', text: 'url(javascript:alert(1))', surface: '#12345',
    hacker: '#000000', constructor: '#000000', __proto__: '#000000',
  } });
  assert.deepEqual(out, { '--color-primary': '#112233' });
  assert.deepEqual(sanitizeTheme(undefined), {});
  assert.deepEqual(sanitizeTheme({ colors: 'x' }), {});
});
test('rupiah', () => assert.match(rupiah(120000), /^Rp\s?120\.000$/));
test('formatDuration', () => {
  assert.equal(formatDuration(180), '3 jam');
  assert.equal(formatDuration(90), '1 jam 30 menit');
  assert.equal(formatDuration(45), '45 menit');
});
test('formatWindows', () => {
  assert.equal(formatWindows([]), 'Tutup');
  assert.equal(formatWindows(undefined), 'Tutup');
  assert.equal(formatWindows([{ open: '09:00', close: '17:00' }]), '09:00–17:00');
});
