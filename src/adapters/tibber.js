/**
 * Fetches price information from Tibber GraphQL API.
 *
 * @param {string} tibberAccessToken
 * @returns {Promise<object>}
 */
async function fetchTibberPriceInfo(tibberAccessToken) {
  const response = await fetch(CONFIG.tibberApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tibberAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: TIBBER_PRICE_INFO_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Tibber HTTP error: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Tibber GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const homes = json?.data?.viewer?.homes || [];
  const priceInfo = homes[0]?.currentSubscription?.priceInfo;

  if (!priceInfo) {
    throw new Error('Tibber priceInfo not found');
  }

  return priceInfo;
}

/**
 * Converts Tibber priceInfo into sorted hourly price slots.
 *
 * @param {object} priceInfo
 * @returns {Array<{startsAt:string,startTime:Date,price:number,total:number,sourceDay:string}>}
 */
function normalizeTibberPrices(priceInfo) {
  const result = [];

  for (const [sourceDay, entries] of [
    ['today', priceInfo.today || []],
    ['tomorrow', priceInfo.tomorrow || []],
  ]) {
    for (const entry of entries) {
      if (!entry || !entry.startsAt || typeof entry.total !== 'number') {
        continue;
      }

      const startTime = new Date(entry.startsAt);

      if (Number.isNaN(startTime.getTime())) {
        continue;
      }

      result.push({
        startsAt: entry.startsAt,
        startTime,
        price: entry.total,
        total: entry.total,
        sourceDay,
      });
    }
  }

  return result.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
