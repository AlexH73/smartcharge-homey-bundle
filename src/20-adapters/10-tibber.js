/**
 * Fetches price information from Tibber GraphQL API.
 *
 * @param {string} tibberAccessToken
 * @param {{timeoutMs?: number}} options
 * @returns {Promise<object>}
 */
async function fetchTibberPriceInfo(tibberAccessToken, options = {}) {
  let response;
  // Dedicated bounded-request sockets can be closed even if headers arrived
  // but the body stopped streaming. HomeyScript exposes the native https module.
  const agent = options.timeoutMs
    ? new https.Agent({ keepAlive: false })
    : null;
  try {
    response = await fetch(CONFIG.tibberApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tibberAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: TIBBER_PRICE_INFO_QUERY }),
      // HomeyScript exposes node-fetch v2. Native request timeout aborts the
      // transport; redirects and compressed-body negotiation cannot restart it.
      ...(options.timeoutMs
        ? {
            timeout: options.timeoutMs,
            redirect: 'error',
            compress: false,
            agent,
          }
        : {}),
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
  } catch (error) {
    if (
      options.timeoutMs &&
      ['request-timeout', 'body-timeout'].includes(error.type)
    ) {
      // node-fetch's body timeout rejects consumption. Close its stream too;
      // no abandoned planner task is left to publish a late response.
      response?.body?.destroy();
      throw new Error(
        `Tibber request timed out (${options.timeoutMs} ms per phase)`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    agent?.destroy();
  }
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
