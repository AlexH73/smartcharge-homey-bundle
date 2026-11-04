const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
for (const file of ['src/00-config/10-config.js', 'src/10-core/10-time.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
    filename: file,
  });
}

const cases = [
  ['2026-11-03T23:55:00+01:00', '2026-11-04 07:30:00'],
  ['2026-11-04T00:00:00+01:00', '2026-11-04 07:30:00'],
  ['2026-11-04T03:00:00+01:00', '2026-11-04 07:30:00'],
  ['2026-11-04T07:29:59.999+01:00', '2026-11-04 07:30:00'],
  ['2026-11-04T07:30:00+01:00', '2026-11-05 07:30:00'],
  ['2026-11-04T08:00:00+01:00', '2026-11-05 07:30:00'],
  ['2026-11-05T22:00:00+01:00', '2026-11-06 07:30:00'],
  ['2026-11-06T03:00:00+01:00', '2026-11-06 07:30:00'],
  ['2026-11-06T07:30:00+01:00', '2026-11-07 13:00:00'],
  ['2026-11-06T22:00:00+01:00', '2026-11-07 13:00:00'],
  ['2026-11-07T03:00:00+01:00', '2026-11-07 13:00:00'],
  ['2026-11-07T12:59:59+01:00', '2026-11-07 13:00:00'],
  ['2026-11-07T13:00:00+01:00', '2026-11-08 13:00:00'],
  ['2026-11-08T03:00:00+01:00', '2026-11-08 13:00:00'],
  ['2026-11-08T13:00:00+01:00', '2026-11-09 07:30:00'],
  ['2026-11-08T22:00:00+01:00', '2026-11-09 07:30:00'],
  ['2026-03-28T14:00:00+01:00', '2026-03-29 13:00:00'],
  ['2026-03-29T03:00:00+02:00', '2026-03-29 13:00:00'],
  ['2026-10-24T14:00:00+02:00', '2026-10-25 13:00:00'],
  ['2026-10-25T02:30:00+02:00', '2026-10-25 13:00:00'],
  ['2026-10-25T02:30:00+01:00', '2026-10-25 13:00:00'],
  ['2026-12-31T22:00:00+01:00', '2027-01-01 07:30:00'],
];
for (const [anchor, expected] of cases) {
  context.anchor = anchor;
  const result = vm.runInContext(
    '(() => { const date = new Date(anchor); const target = getTargetDeparture(date); return { local: formatLocal(target), future: target > date }; })()',
    context,
  );
  assert.equal(result.local, expected, anchor);
  assert.equal(result.future, true, anchor);
}
console.log(
  `PASS ${cases.length} nearest departure cases: midnight, cutoff, weekdays/weekends, DST and year boundary`,
);
