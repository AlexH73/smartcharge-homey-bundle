# SmartCharge 0.6.4 — обновление с 0.6.3+build.16

Подготовленная локальная версия: **0.6.4+build.17**.
Ветка: `feature/manual-charging-reliability`. Production не изменялся.

## Что исправлено

- LOW_POWER: ≤5 W после подтверждённого потребления, интервал ≥180 секунд.
- Два свежих показания >500 W через ≥30 секунд подтверждают START_CONFIRMED;
  пятиминутный watchdog больше не сбрасывает первое показание на каждом tick.
- Свежесть отдельного показания: 60 секунд; допустимый observation gap: 360 секунд.
  Отсутствующие, старые и недостоверные показания не превращаются в 0 W.
- MAX_DURATION остаётся 360 минут от исходной активации, включая restart.
- После ACK команды события передают неизвестное состояние plugOn/plugPower,
  а не исходные true/2567 W или искусственное false. Snapshot до команды и ACK
  различаются в message; ACK не доказывает физическое снятие напряжения.

## Какие файлы устанавливать

Все 12 generated bundles изменены: builder включает общие исходники целиком,
включая исправленные config/model/runtime, в каждый файл. Это не только изменение
version header. Использовать согласованный набор **0.6.4+build.17** из `dist/`:

1. `SMARTCHARGE - Runtime Controller.js`
2. `SMARTCHARGE - Manual Override On.js`
3. `SMARTCHARGE - Manual Override Off.js`
4. `SMARTCHARGE - Auto Mode.js`
5. `SMARTCHARGE - Connection Evidence.js`
6. `SMARTCHARGE - Run Decision.js`
7. `SMARTCHARGE - State Sync.js`
8. `SMARTCHARGE - Start Session.js`
9. `SMARTCHARGE - Reset Session.js`
10. `SMARTCHARGE - Log On.js`
11. `SMARTCHARGE - Log Off.js`
12. `SMARTCHARGE - Stability Debug.js`

Entry-файлы не изменены. Stability Debug сохраняет read-only поведение.
SHA-256, проверка полного соответствия bundles исходникам и версиям:
`diagnostics/release-0.6.4/bundle-manifest.json` и `bundle-verification.log`.
Не выполнять отдельную сборку без `--reuse-version` перед установкой:
это увеличит версию/build ещё раз.

## Порядок будущего обновления

1. Завершить текущую зарядку, убедиться в безопасном OFF и отсутствии исполняющихся
   scripts. Временно приостановить triggers на время замены, сохранить код 0.6.3.
2. Заменить код существующих HomeyScripts перечисленными файлами, сохраняя их IDs
   и имена; проверить header `0.6.4+build.17`. Не смешивать старые и новые bundles.
3. Сохранить существующие Logic values, manual state, block/token и timestamps.
   Новых переменных и сброса состояния для этого обновления не требуется.
4. Возобновить прежний единственный пятиминутный watchdog и существующие controls.
   Под наблюдением проверить два новых power timestamps, START_CONFIRMED,
   USER_STOP, terminal block и отсутствие старых power values в terminal events.

Изменения структуры Flows **не требуются** при корректной миграции на 0.6.3;
расписание 5 минут сохраняется. Не добавлять второй controller или параллельные
ON/OFF writers. Apps Script, таблицы Events/Sessions и Dashboard schema
**не требуют обновления**. Live Flows и Dashboard этой подготовкой не проверялись.

## Фактические ограничения

LOW_POWER — выборочные показания, охватывающие ≥180 секунд, а не доказательство
непрерывного низкого потребления. На пятиминутном watchdog OFF обычно будет на
следующем tick после первого low sample; гарантий точного времени нет.
Возобновление мощности между ticks может остаться незамеченным; длительная пауза
автомобиля может завершить manual. Показания без достоверных свежих timestamps
не подтверждают START_CONFIRMED или LOW_POWER. Lease остаётся best-effort,
строгая сериализация и физический OFF по ACK не гарантируются.

AUTO MODE policy не изменена: требуется явное разрешение, завершённый manual,
safe plug state и свежие trustworthy Mercedes connection evidence/SOC <100.
Продление подписки само по себе не доказывает восстановление Mercedes.
Не подставлять текущее время вместо старых timestamps.

## Локальная валидация

Результаты и логи сохраняются в `diagnostics/release-0.6.4/`.
`npm run verify` — PASS: lint, format:check, unit suites, 52 manual-runtime cases,
112 terminal cases, 94/94 simulator scenarios и сборка 12 bundles с reuse-version.
Отдельная полная сверка всех bundles с исходниками, metadata, package/lock,
порогами и syntax parsing — PASS. `git diff --check` — PASS.
Установка на Homey и аппаратная проверка выполняются отдельно.
