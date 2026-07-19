/**
 * Tibber Price Fetcher for Google Sheets
 * 
 * This script fetches electricity prices from Tibber API
 * and writes them into a Google Spreadsheet.
 */

const TIBBER_API_URL = 'https://api.tibber.com/v1-beta/gql';
const TIBBER_SHEET_NAME = 'Tibber_Prices';

// Constants for Script Properties keys
const PROPERTY_TOKEN = 'TIBBER_ACCESS_TOKEN';
const PROPERTY_SPREADSHEET_ID = 'SPREADSHEET_ID';

// Hardcoded token – only for temporary testing (keep empty for production)
const TIBBER_TOKEN = '';

// Column headers for the sheet
const HEADERS = [
  'startsAt',
  'date',
  'time',
  'dayType',
  'totalPriceEurKwh',
  'energyPriceEurKwh',
  'taxEurKwh',
  'priceLevel',
  'isCurrentInterval',
  'homeId',
  'homeName',
  'updatedAt',
];

/**
 * Main function: fetch Tibber prices for today and tomorrow,
 * and write them to the sheet.
 */
function updateTibberPrices() {
  try {
    const token = getTibberToken();

    const query = `
      query SmartChargePrices {
        viewer {
          homes {
            id
            appNickname
            currentSubscription {
              priceInfo {
                current {
                  total
                  energy
                  tax
                  startsAt
                  level
                }
                today {
                  total
                  energy
                  tax
                  startsAt
                  level
                }
                tomorrow {
                  total
                  energy
                  tax
                  startsAt
                  level
                }
              }
            }
          }
        }
      }
    `;

    const response = UrlFetchApp.fetch(TIBBER_API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      payload: JSON.stringify({ query }),
      muteHttpExceptions: true,
    });

    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      throw new Error(`Tibber HTTP error ${responseCode}: ${responseBody}`);
    }

    const result = JSON.parse(responseBody);

    if (result.errors && result.errors.length > 0) {
      throw new Error(`Tibber GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    const homes = result?.data?.viewer?.homes;

    if (!homes || homes.length === 0) {
      throw new Error('Tibber account has no home.');
    }

    const home = homes[0];
    const priceInfo = home?.currentSubscription?.priceInfo;

    if (!priceInfo) {
      throw new Error('No price data found for the Tibber home.');
    }

    const prices = [];

    addPrices(prices, priceInfo.today, 'today');
    addPrices(prices, priceInfo.tomorrow, 'tomorrow');

    if (prices.length === 0) {
      throw new Error('Tibber did not provide prices for today or tomorrow.');
    }

    prices.sort((a, b) => a.startsAt - b.startsAt);

    writeTibberPrices(home, priceInfo.current, prices);

    console.log(`${prices.length} Tibber price entries written successfully.`);
  } catch (error) {
    console.error('Error in updateTibberPrices:', error.message);
    // Re-throw to see the error in the execution log
    throw error;
  }
}

/**
 * Retrieves the Tibber access token.
 * First checks the hardcoded constant, then falls back to Script Properties.
 */
function getTibberToken() {
  const hardcodedToken = TIBBER_TOKEN.trim();

  if (hardcodedToken && hardcodedToken !== '') {
    return hardcodedToken;
  }

  const propertyToken = PropertiesService.getScriptProperties().getProperty(PROPERTY_TOKEN);

  if (!propertyToken) {
    throw new Error(
      'Tibber token missing. Add it to TIBBER_TOKEN constant or create Script Property "' +
      PROPERTY_TOKEN + '".'
    );
  }

  return propertyToken.trim();
}

/**
 * Retrieves the spreadsheet ID from Script Properties.
 */
function getSpreadsheetId() {
  const id = PropertiesService.getScriptProperties().getProperty(PROPERTY_SPREADSHEET_ID);

  if (!id) {
    throw new Error(
      'Spreadsheet ID not found in Script Properties. Add a property with key "' +
      PROPERTY_SPREADSHEET_ID + '" and the spreadsheet ID as value.'
    );
  }

  return id.trim();
}

/**
 * Adds prices from a day array (today or tomorrow) to the target list.
 */
function addPrices(target, source, dayType) {
  if (!Array.isArray(source)) {
    return;
  }

  source.forEach((item) => {
    target.push({
      startsAt: new Date(item.startsAt),
      dayType: dayType,
      total: toNumberOrBlank(item.total),
      energy: toNumberOrBlank(item.energy),
      tax: toNumberOrBlank(item.tax),
      level: item.level || '',
    });
  });
}

/**
 * Converts a value to number or returns an empty string.
 */
function toNumberOrBlank(value) {
  return typeof value === 'number' ? value : '';
}

/**
 * Writes the price data into the Google Sheet and applies formatting.
 */
function writeTibberPrices(home, currentPrice, prices) {
  const spreadsheet = SpreadsheetApp.openById(getSpreadsheetId());

  let sheet = spreadsheet.getSheetByName(TIBBER_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(TIBBER_SHEET_NAME);
  }

  const now = new Date();

  const currentStartsAt = currentPrice?.startsAt
    ? new Date(currentPrice.startsAt)
    : null;

  const rows = prices.map((price) => {
    const isCurrentInterval =
      currentStartsAt !== null &&
      price.startsAt.getTime() === currentStartsAt.getTime();

    return [
      price.startsAt,
      price.startsAt,
      price.startsAt,
      price.dayType,
      price.total,
      price.energy,
      price.tax,
      price.level,
      Boolean(isCurrentInterval),
      home.id || '',
      home.appNickname || '',
      now,
    ];
  });

  // Clear existing content and write new data
  sheet.clearContents();

  // Write headers
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  // Write data rows (if any)
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  // Apply formatting
  formatTibberSheet(sheet, rows.length);
}

/**
 * Applies formatting to the sheet.
 */
function formatTibberSheet(sheet, rowCount) {
  sheet.setFrozenRows(1);

  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange
    .setFontWeight('bold')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF');

  if (rowCount > 0) {
    // Date and time formatting
    sheet.getRange(2, 1, rowCount, 1).setNumberFormat('dd.MM.yyyy HH:mm');
    sheet.getRange(2, 2, rowCount, 1).setNumberFormat('dd.MM.yyyy');
    sheet.getRange(2, 3, rowCount, 1).setNumberFormat('HH:mm');
    // Price columns (total, energy, tax)
    sheet.getRange(2, 5, rowCount, 3).setNumberFormat('0.0000');
    // UpdatedAt timestamp
    sheet.getRange(2, 12, rowCount, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  }

  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

/**
 * Creates a time-based trigger to run updateTibberPrices every hour.
 * Deletes any existing triggers for this function to avoid duplicates.
 */
function createTibberTrigger() {
  const functionName = 'updateTibberPrices';

  // Remove existing triggers for this function
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === functionName)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  // Create new hourly trigger
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Tibber auto-update trigger created: every hour.');
}