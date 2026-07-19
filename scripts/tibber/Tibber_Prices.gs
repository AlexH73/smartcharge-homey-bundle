const TIBBER_API_URL = 'https://api.tibber.com/v1-beta/gql';
const TIBBER_SHEET_NAME = 'Tibber_Prices';
const SPREADSHEET_ID = 'SPREADSHEET_ID';

/*
 * Вариант A — временно вставить токен сюда:
 */
const TIBBER_TOKEN = 'ВСТАВЬ_СЮДА_СВОЙ_TOKEN';

/*
 * Вариант B — безопаснее:
 * оставить TIBBER_TOKEN пустым и добавить Script Property:
 *
 * TIBBER_ACCESS_TOKEN = твой токен
 */

/**
 * Загружает цены Tibber за сегодня и завтра
 * и записывает их в лист Tibber_Prices.
 */
function updateTibberPrices() {
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
    throw new Error('Tibber account enthält kein Home.');
  }

  const home = homes[0];
  const priceInfo = home?.currentSubscription?.priceInfo;

  if (!priceInfo) {
    throw new Error('Für das Tibber Home wurden keine Preisdaten gefunden.');
  }

  const prices = [];

  addPrices(prices, priceInfo.today, 'today');
  addPrices(prices, priceInfo.tomorrow, 'tomorrow');

  if (prices.length === 0) {
    throw new Error('Tibber hat keine Preise für heute oder morgen geliefert.');
  }

  prices.sort((a, b) => a.startsAt - b.startsAt);

  writeTibberPrices(home, priceInfo.current, prices);

  console.log(`${prices.length} Tibber price entries written successfully.`);
}

/**
 * Liest den Token entweder aus der Konstante
 * oder aus den Script Properties.
 */
function getTibberToken() {
  const hardcodedToken = TIBBER_TOKEN.trim();

  if (hardcodedToken && hardcodedToken !== 'ВСТАВЬ_СЮДА_СВОЙ_TOKEN') {
    return hardcodedToken;
  }

  const propertyToken = PropertiesService.getScriptProperties().getProperty(
    'TIBBER_ACCESS_TOKEN',
  );

  if (!propertyToken) {
    throw new Error(
      'Tibber Token fehlt. Füge ihn in TIBBER_TOKEN ein ' +
        'oder erstelle die Script Property TIBBER_ACCESS_TOKEN.',
    );
  }

  return propertyToken.trim();
}

/**
 * Fügt Today- oder Tomorrow-Preise zur gemeinsamen Liste hinzu.
 */
function addPrices(target, source, dayType) {
  if (!Array.isArray(source)) {
    return;
  }

  source.forEach((item) => {
    target.push({
      startsAt: new Date(item.startsAt),
      dayType,
      total: toNumberOrBlank(item.total),
      energy: toNumberOrBlank(item.energy),
      tax: toNumberOrBlank(item.tax),
      level: item.level || '',
    });
  });
}

/**
 * Schreibt die Preise in Google Sheets.
 */
function writeTibberPrices(home, currentPrice, prices) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  let sheet = spreadsheet.getSheetByName(TIBBER_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(TIBBER_SHEET_NAME);
  }

  const headers = [
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

  sheet.clearContents();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  formatTibberSheet(sheet, rows.length);
}

/**
 * Kleine Hilfsfunktion für null/undefined Werte.
 */
function toNumberOrBlank(value) {
  return typeof value === 'number' ? value : '';
}

function formatTibberSheet(sheet, rowCount) {
  sheet.setFrozenRows(1);

  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());

  headerRange
    .setFontWeight('bold')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF');

  if (rowCount > 0) {
    sheet.getRange(2, 1, rowCount, 1).setNumberFormat('dd.MM.yyyy HH:mm');

    sheet.getRange(2, 2, rowCount, 1).setNumberFormat('dd.MM.yyyy');

    sheet.getRange(2, 3, rowCount, 1).setNumberFormat('HH:mm');

    sheet.getRange(2, 5, rowCount, 3).setNumberFormat('0.0000');

    sheet.getRange(2, 12, rowCount, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  }

  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

function createTibberTrigger() {
  const functionName = 'updateTibberPrices';

  // Удаляем старые триггеры этой функции,
  // чтобы случайно не создать несколько одинаковых.
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === functionName)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  // Обновление каждый час
  ScriptApp.newTrigger(functionName).timeBased().everyHours(1).create();

  console.log('Tibber auto-update trigger created: every hour.');
}
