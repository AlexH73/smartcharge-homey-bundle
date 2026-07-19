/**
 * Creates a Date constructor that returns a fixed timestamp for new Date().
 *
 * The SmartCharge HomeyScript files use global Date directly. The simulator
 * passes this constructor into the executed script function so scenarios can
 * run deterministically.
 *
 * @param {string|number|Date} nowValue
 * @returns {DateConstructor}
 */
function createFixedDate(nowValue) {
  const RealDate = Date;
  const fixedTime = new RealDate(nowValue).getTime();

  if (Number.isNaN(fixedTime)) {
    throw new Error(`Invalid fixed date: ${nowValue}`);
  }

  function FixedDate(...args) {
    if (new.target) {
      return args.length > 0 ? new RealDate(...args) : new RealDate(fixedTime);
    }

    return args.length > 0
      ? RealDate(...args)
      : new RealDate(fixedTime).toString();
  }

  Object.setPrototypeOf(FixedDate, RealDate);
  FixedDate.prototype = RealDate.prototype;
  FixedDate.now = () => fixedTime;
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;

  return FixedDate;
}

module.exports = {
  createFixedDate,
};
