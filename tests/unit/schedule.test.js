import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, weekdayOf, parseTime, formatTime, tenantNow, candidateStarts, unitMinutes,
  blockLength, activeCount, prunedHolds, fits, windowsFor, slotId,
} from '../../backend/src/bookings/schedule.js';

test('tanggal valid dan hari dalam seminggu', () => {
  assert.equal(isValidDate('2030-01-01'), true);
  assert.equal(isValidDate('2030-02-30'), false);
  assert.equal(isValidDate('30-01-2030'), false);
  assert.equal(weekdayOf('2030-01-01'), 'tue');
  assert.equal(weekdayOf('2030-01-06'), 'sun');
});
test('parseTime / formatTime', () => {
  assert.equal(parseTime('09:30'), 570);
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('9:30'), null);
  assert.equal(formatTime(570), '09:30');
});
test('tenantNow memakai offset zona waktu', () => {
  assert.deepEqual(tenantNow('Asia/Jakarta', Date.UTC(2030, 0, 1, 17, 30)), { date: '2030-01-02', minute: 30 });
  assert.deepEqual(tenantNow('Asia/Jayapura', Date.UTC(2030, 0, 1, 1, 0)), { date: '2030-01-01', minute: 600 });
});
test('blok dan unit slot', () => {
  assert.equal(blockLength(60, 30), 90);
  assert.equal(blockLength(35, 0), 45);
  assert.deepEqual(unitMinutes(600, 90), [600, 615, 630, 645, 660, 675]);
  assert.equal(slotId('2030-01-03', 570), '2030-01-03_0930');
});
test('candidateStarts dan fits', () => {
  const w = [{ open: 540, close: 1020 }];
  const starts = candidateStarts(w, 30, 90);
  assert.equal(starts[0], 540);
  assert.equal(starts.at(-1), 930);
  assert.equal(starts.length, 14);
  assert.equal(fits(w, 930, 90), true);
  assert.equal(fits(w, 960, 90), false);
});
test('windowsFor menghormati hari libur khusus', () => {
  const s = { weekly: { tue: [{ open: '09:00', close: '17:00' }] }, closedDates: ['2030-01-08'] };
  assert.equal(windowsFor(s, '2030-01-01').length, 1);
  assert.equal(windowsFor(s, '2030-01-08').length, 0);
  assert.equal(windowsFor(s, '2030-01-02').length, 0);
});
test('tahanan: kedaluwarsa tidak dihitung, null permanen', () => {
  const holds = { a: 2000, b: 500, c: null };
  assert.equal(activeCount(holds, 1000), 2);
  assert.equal(activeCount(holds, 1000, 'a'), 1);
  assert.deepEqual(prunedHolds(holds, 1000), { a: 2000, c: null });
  assert.equal(activeCount(undefined, 1000), 0);
});
