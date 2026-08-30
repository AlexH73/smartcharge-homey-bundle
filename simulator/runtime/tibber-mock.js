const fs = require('fs');
const path = require('path');

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'tibber');
const TIME_ZONE = 'Europe/Berlin';

function loadTibberFixture(name) {
  const fixtureName = name || 'normal-day';
  const filePath = path.join(FIXTURE_DIR, `${fixtureName}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Tibber fixture not found: ${fixtureName}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createTibberFetch({ getFixtureName, getNow, getPriceAnchor }) {
  return async function tibberFetch(url) {
    if (!String(url).includes('tibber.com')) {
      return null;
    }

    const fixture = loadTibberFixture(getFixtureName());
    const priceInfo = buildPriceInfo(
      fixture,
      getPriceAnchor ? getPriceAnchor() : getNow(),
      getNow(),
    );

    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          viewer: {
            homes: [
              {
                currentSubscription: {
                  priceInfo,
                },
              },
            ],
          },
        },
      }),
    };
  };
}

function buildPriceInfo(fixture, anchorValue, nowValue = anchorValue) {
  const anchor = new Date(anchorValue);
  const anchorLocal = getLocalParts(anchor);
  const offset = getOffset(anchorValue);
  const today = normalizePrices(fixture.today || [], anchorLocal, offset);
  const tomorrowDate = addDays(anchorLocal, 1);
  const tomorrow =
    fixture.tomorrow === null
      ? []
      : normalizePrices(fixture.tomorrow || [], tomorrowDate, offset);
  const currentSlot = findCurrentSlot([...today, ...tomorrow], nowValue);
  const currentTotal =
    typeof fixture.current === 'number'
      ? fixture.current
      : (currentSlot?.total ??
        today[anchorLocal.hour]?.total ??
        today[0]?.total ??
        null);
  const currentFallbackParts = getLocalParts(new Date(nowValue));

  return {
    current:
      currentTotal === null
        ? null
        : {
            total: currentTotal,
            startsAt:
              currentSlot?.startsAt ||
              createLocalIso(
                currentFallbackParts,
                currentFallbackParts.hour,
                getOffset(nowValue),
              ),
          },
    today,
    tomorrow,
  };
}

function normalizePrices(values, dateParts, offset) {
  return values.map((total, hour) => ({
    total,
    startsAt: createLocalIso(dateParts, hour, offset),
  }));
}

function findCurrentSlot(slots, nowValue) {
  const now = new Date(nowValue).getTime();

  return slots.find((slot) => {
    const start = new Date(slot.startsAt).getTime();
    const end = start + 60 * 60 * 1000;

    return now >= start && now < end;
  });
}

function getLocalParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

function addDays(parts, days) {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 0,
  };
}

function createLocalIso(parts, hour, offset) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:00:00${offset}`;
}

function getOffset(value) {
  const match = String(value).match(/(Z|[+-]\d{2}:\d{2})$/);
  return match ? match[1] : '+02:00';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

module.exports = {
  buildPriceInfo,
  createTibberFetch,
  loadTibberFixture,
};
