const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = vm.createContext({});
for (const file of [
  'src/00-config/10-config.js',
  'src/10-core/00-utils.js',
  'src/10-core/30-charging.js',
]) {
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'),
    context,
  );
}
for (const [battery, factor, reserve, minutes, slots] of [
  [11, 3.3, 15, 310, 6],
  [0, 3.3, 15, 345, 6],
  [0, 5, 20, 520, 9],
  [50, 3.3, 15, 180, 3],
  [99, 3.3, 15, 30, 1],
  [100, 3.3, 15, 0, 0],
]) {
  const actual = vm.runInContext(
    `calculateChargeMinutes(${battery}, ${factor}, ${reserve})`,
    context,
  );
  assert.equal(actual, minutes);
  assert.equal(
    vm.runInContext(`calculateChargeSlots(${actual})`, context),
    slots,
  );
}
console.log('PASS charging-duration');
