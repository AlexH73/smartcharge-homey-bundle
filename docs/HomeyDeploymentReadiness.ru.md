# SmartCharge — готовность к deployment на Homey Pro

Дата: 2026-10-11. Ветка: `feature/manual-charging-reliability`.
Релиз для review: **0.6.4+build.17**, package version **0.6.4**.
Это план будущих действий. Homey, реальные Flows и Google Sheets не изменялись.

## Решение по готовности

Исправление terminal manual lifecycle локально проверено. Релиз подготовлен
для контролируемого тестирования оператором после отдельного разрешения на
deployment. Готовность к автономной эксплуатации на реальном устройстве пока
не подтверждена: нужны инвентаризация writers, проверка driver timestamps,
физического OFF и реальной задержки выполнения. Строгая сериализация команд
текущей реализацией не обеспечивается.

Штатный builder увеличил patch/build с 0.6.3+build.16 до 0.6.4+build.17;
package.json и package-lock.json синхронизированы через npm version без tag.
Изменены manual observation gap (360 s), LOW_POWER (5 W), сброс недоступных
измерений и телеметрия после command ACK. MAX_DURATION остаётся 360 минут.
Для уже установленной 0.6.3 новые Flows/Logic/Apps Script не требуются:
[краткая инструкция обновления](Release-0.6.4.ru.md). Ниже сохранён полный
checklist исходной миграции; его не нужно повторять при корректной установке 0.6.3.

## Финальный аудит и известные ограничения

Проверены model, manual runtime, automatic runtime/controller, все 12 entries,
adapter, telemetry contract, regression tests и оба предыдущих review:
`diagnostics/pre-deployment-review/report.ru.md` и
`diagnostics/terminal-manual-review/`. Первый описывает исторический дефект;
его исходная failing matrix не является текущим результатом.

| Область | Текущий результат | Практический предел |
| --- | --- | --- |
| Terminal lifecycle | USER_STOP, LOW_POWER, BATTERY_FULL, MAX_DURATION_REACHED, COMMAND_FAILED блокируют automatic; session сохраняется | Неуспешный OFF оставляет ERROR без ложного completion |
| Durable block | Boolean block, terminal record, stop token и отсутствие grant совместно закрывают automatic ON | Logic writes не образуют transaction; полный отказ всех защитных записей не позволяет доказать durable Stop |
| Manual ON | Новый manual intent сохраняет block=true; повторная активация не продлевает deadline | ERROR/STOPPING проходят recovery, не новую активацию |
| Auto Mode | Только явный entry выдаёт grant, связанный с current stop token; требуется завершённый lifecycle, свободный lease и onoff=false | Grant и device call не атомарны с конкурентным Stop |
| Mercedes | Auto требует trustworthy connection evidence и SOC 0..<100 с non-future timestamp, окно 30 минут | Старый retained status нельзя переобозначать новым connection event |
| Plug power | Два разных свежих timestamp >500 W с интервалом ≥30 s подтверждают старт; два независимых ≤5 W samples, охватывающих ≥180 s, после подтверждения завершают зарядку | Watchdog 5 минут не доказывает непрерывную низкую мощность; недоступное/старое измерение или разрыв >360 s сбрасывает pending interval; каждый sample не старше 60 s; одинаковый timestamp не новый sample |
| Нет power timestamp | Недоступность диагностируется; нет подтверждения старта/LOW_POWER и подстановки 0 W | USER_STOP и исходный deadline 360 минут остаются; OFF производится на следующем runtime invocation |
| Actuator ownership | Все production ON/OFF проходят единый helper; automatic OFF не забирает валидную manual зарядку | Один helper в независимых VM не означает один исполнитель |
| Legacy | Active Run Decision/State Sync делегируют runtime; compatibility ON проходит тот же block gate | Shadow runtime сам не переключает, но compatibility legacy может переключать при разрешённом automatic |
| Restart | Старый terminal+block=false эффективно заблокирован; running/corrupt/missing safety и abandoned lease обрабатываются защитно | Неизвестный исход ранее отправленной команды нельзя восстановить из одних Logic values |
| Command/log failures | Protective OFF не зависит от webhook; runtime не объявляет успешный terminal при failed OFF | ACK/onoff=false не доказывают физически снятое напряжение; logger может удлинять invocation |

Постоянные tests покрывают partial persistence, ERROR/STOPPING, old terminal
records, repeated Manual ON/runtime, restart, explicit Auto freshness и
active/compatibility/shadow paths. Матрица terminal тестов проверяет существующую
automatic session, planner=true и отсутствие новых ON для всех пяти причин.

## Локальные проверки

| Проверка | Результат |
| --- | --- |
| npm test | PASS: все unit suites, 52 manual-runtime и 112 manual-terminal cases |
| simulator (npm test → simulate:all) | PASS: 94/94, без XFAIL |
| npm run lint | PASS |
| npm run format:check | PASS |
| npm run build:homey | PASS: 12 bundles, единая версия |
| Build validation | PASS: package/lock/build metadata согласованы; полное сравнение каждого bundle с header и исходниками, syntax parsing |
| Compiled bundle smoke | Для 0.6.4 отдельно не повторялся; выполнены source-based suites и syntax parsing всех generated bundles |
| git diff --check | PASS |

Логи и SHA-256 manifest: `diagnostics/release-0.6.4/`.
Bundles находятся в dist, ignored по существующей политике репозитория;
commit фиксирует исходники и build metadata. Перед установкой использовать
именно проверенные bundles и сверять manifest, не делать отдельные target builds.

## Checklist: подготовка и резервные копии

- [ ] Получить отдельное разрешение на реальные изменения. Записать модель,
  firmware Homey, HomeyScript version, plug/Mercedes app versions, timezone.
- [ ] Снять нагрузку; штатно выключить питание и независимо убедиться в OFF.
  Обеспечить доступный оператору физический способ отключения при failed OFF.
- [ ] Выгрузить точный код всех старых HomeyScripts с ID, именами, версиями,
  временем и checksum в приватный backup; сохранить связь Script ID → Flow card.
  Секреты, webhook и device IDs не помещать в Git.
- [ ] Экспортировать JSON существующих Advanced Flows и обычных Flows, включая
  ID, cards, arguments, connections, enabled state и папки; сохранить screenshots.
  В официальном Web API есть getAdvancedFlows/getFlows; проверить доступность
  в установленной версии и выполнить read-only export разрешённым инструментом.
  Это snapshot для восстановления; универсальный one-click JSON import не обещается.
  [ManagerFlow API](https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerFlow.html).
- [ ] Сохранить Logic names/types/values, device capabilities с timestamp,
  текущие manual/automatic records и активный план до любых изменений.
- [ ] Сохранить Google Apps Script source/version/deployment ID, приватную
  конфигурацию и копию таблицы. Новые Events не удалять при rollback.
- [ ] Если доступно для модели, создать Homey backup и проверить дату/доступность.
  Официальный backup включает Flows, variables/settings; способ восстановления
  может требовать factory reset. Он дополняет отдельные экспорты.
  [Homey backup](https://support.homey.app/hc/en-us/articles/12402204219164-Back-up-and-restore-Homey-Pro).
- [ ] Заполнить реестр фактических Flow IDs/имен: triggers, scripts, прямые
  device cards, variable writes, сторонние voice/UI/automation writers. До этого
  перечисленные ниже названия обозначают роли, а не обнаруженные реальные Flows.

## Checklist: отключить и изменить Flows

Отключить до замены кода и оставить отключёнными дублирующие ветви:

- [ ] Старые periodic Run Decision и State Sync, старый watchdog/recovery,
  price-update → actuator, automatic ON/OFF по SmartChargeShouldCharge.
- [ ] Все прямые plug ON/OFF cards, manual flag toggles, manual ON → old planner,
  сценарии включения по восстановленной session после startup.
- [ ] Legacy Start Session/Reset Session branches, конкурирующие с active runtime;
  `SESSION - Save ConnectedAt` и timer-based connection evidence.
- [ ] Дубли Log On/Log Off для runtime-owned команд. Эти scripts сами не
  переключают питание, но могут создавать лишние/несогласованные lifecycle events.
- [ ] Любые сторонние writers этого plug либо исключить из rollout, либо
  зафиксировать как незакрытый риск и не включать автономное управление.

Изменить/создать роли:

- [ ] Manual ON → только `SMARTCHARGE - Manual Override On`, без дополнительных
  ON cards, сброса block или прямых записей intent.
- [ ] USER_STOP → только `SMARTCHARGE - Manual Override Off`, независимо от
  battery/session/lease; повторное нажатие допустимо.
- [ ] Explicit Auto Mode → только `SMARTCHARGE - Auto Mode`; не ставить его
  в timer/startup/connection цепочку. Он может сразу разрешить и выполнить ON.
- [ ] Один обычный watchdog → Runtime Controller. Удалить отдельные price,
  power и decision timers, которые одновременно делают ту же работу.
- [ ] Реальный trustworthy connection event → Connection Evidence; не polling
  retained status. Этот bundle сохраняет evidence и сам вызывает runtime.
- [ ] Startup recovery → один Runtime Controller после доступности Logic/devices;
  не сбрасывать state/block/token/lock к initial defaults после каждого restart.
- [ ] Power events использовать для наблюдения; для предлагаемой topology
  не добавлять отдельный параллельный runtime вызов на каждый power update.
  Сохранить watchdog 5 минут, sample gaps ≤360 s и возраст каждого sample ≤60 s.
  Пауза/возобновление между ticks могут быть пропущены; непрерывные 180 s LOW_POWER
  не доказаны. Не увеличивать частоту runtime в рамках этого релиза.

## Logic variables и initial values

Четыре новых safety variables обязательны. Text `null` ниже — четыре символа,
не отсутствующая переменная и не пустая строка.

| Имя | Homey type | Начальное значение при первой миграции |
| --- | --- | --- |
| SmartChargeManualState | Text | JSON ниже |
| SmartChargeAutoStartBlocked | Boolean / Yes-No | true |
| SmartChargeRuntimeLock | Text | `null` |
| SmartChargeUserStopToken | Text | `null` |

```json
{"version":1,"status":"IDLE","id":null,"startedAt":null,"confirmedAt":null,"highPowerAt":null,"lastPowerAt":null,"lowPowerSince":null,"endedAt":null,"stopReason":null,"error":null,"activationStopToken":null,"autoGrant":null}
```

- [ ] Существующий SmartChargeManualMode: Boolean false; SmartChargeShouldCharge:
  Boolean false; питание OFF. Не уничтожать automatic session ради миграции.
- [ ] SmartChargeRuntimeMode: Text `active` только после установки всех bundles.
  `shadow` не является глобальным запретом физических legacy commands.
- [ ] Проверить существующие SmartChargeConnectionEvidenceAt и
  SmartChargeDisconnectObservedAt (Text), остальные planner/logger variables
  по Installation.md; отсутствующие timestamps не фабриковать текущим временем.
- [ ] Если safety variables уже существуют, сохранить их, проверить schema и
  применить recovery; не перезаписывать реальный running/terminal record JSON IDLE.
  Lease нельзя вручную очистить, пока возможна старая in-flight команда.

## Порядок установки bundles и Apps Script

Все writers/триггеры в maintenance, plug OFF. Никаких запусков mixed versions.

1. Проверить SHA-256 всех 12 dist файлов против manifest. Сохранить локальную
   копию проверенного dist как release artifact; отдельная сборка меняет identity.
2. Сначала подготовить Apps Script на тестовой копии таблицы: использовать
   `scripts/google-apps-script/SmartChargeLogger.gs`, сохранить private config,
   проверить manual event materialization и совместимость automatic events.
   Колонки Events/Sessions не мигрируются. Не смешивать test events с production.
3. После теста обновить production Apps Script существующим deployment новой
   версии, проверить права и URL; при новом URL обновить webhook отдельно.
   До этого Homey ingress остаётся выключенным. Сохранить предыдущую Apps Script
   version для возврата; реальных Apps Script изменений сейчас нет.
4. Заменить `SMARTCHARGE - Manual Override Off.js`, затем Runtime Controller,
   Manual Override On, Auto Mode. Ранний Stop готовится первым, но это не
   разрешение запускать его среди оставшихся старых writers.
5. Заменить Connection Evidence, Run Decision, State Sync; затем Start Session,
   Reset Session, Log On, Log Off, Stability Debug. Все — 0.6.4+build.17.
6. Проверить сохранённый код/headers, Script IDs и Flow references, Logic types,
   конфигурацию device matching. Обновлять существующие IDs либо явно исправить
   все ссылки при создании новых scripts. Проверить, что старых writers не осталось.
7. Настроить topology ниже, выполнить no-load acceptance. Только затем разрешить
   одну контролируемую ручную зарядку; automatic permission остаётся заблокированным
   до отдельного явного Auto Mode с реальной свежей telemetry.

## Concurrency: inventory и конкретная topology

| Entry / writer | Возможные команды | Потенциальный overlap |
| --- | --- | --- |
| Runtime Controller | ON/OFF | watchdog, startup, события и долгий предыдущий tick |
| Connection Evidence | ON/OFF через runtime | connection event одновременно с watchdog/кнопкой |
| Manual Override On | manual ON, recovery OFF | повторная кнопка, Stop, timer |
| Manual Override Off | OFF, повторный recovery | уже отправленный ON; bypass busy lease ради Stop |
| Auto Mode | проверочный OFF, automatic ON через runtime | Stop/Manual ON, watchdog, grant persistence |
| Run Decision | compatibility ON; active runtime ON/OFF | старый price/plan/watchdog trigger |
| State Sync | compatibility ON/OFF; active runtime | старый minute/ShouldCharge trigger |
| Start/Reset Session, Log On/Off, Stability Debug | Не отправляют device command непосредственно | Logic/lifecycle/log writes могут конкурировать с runtime |
| Старые scripts, прямые cards, UI/voice/другие apps | ON/OFF вне gate | Не перечислены реально до инвентаризации Homey |

Предлагаемые роли Advanced Flows (не созданы):

1. **SC Runtime Watchdog**: единственный обычный периодический caller Runtime
   Controller, сохраняется существующий интервал 5 минут. Для 0.6.4 не менять
   cadence и не добавлять looping chain или независимый power-event controller.
   Фактическую свежесть samples и задержку исполнения проверить под наблюдением.
   Завершение HomeyScript card ожидается внутри одной цепочки; нет parallel fan-out
   к State Sync/Run Decision и нет retries, повторяющих ON после timeout.
2. **SC Connection Evidence**: только реальные события подключения, один caller
   Connection Evidence. Он сохраняет событие до runtime, поэтому busy skip не
   теряет evidence: watchdog обработает его позже. Это всё ещё второй ingress,
   способный overlap; удалены polling и дубли connection branches.
3. **SC Startup Recovery**: один boot ingress runtime, без Auto Mode и очистки
   persisted safety. Во время первых supervised проверок watchdog включить
   оператором после завершения startup recovery.
4. **SC Manual ON / SC Auto Mode**: отдельные явные действия; при rollout временно
   остановить ordinary ingress, дождаться завершения известных runs и проверить
   clear lease перед действием, затем возобновить один watchdog. Не считать один
   clear lease доказательством отсутствия запоздалого device request.
5. **SC USER_STOP**: отдельная короткая цепочка Stop без vehicle/plan/busy условий,
   без логирования или Delay перед card. Доступна и при maintenance/ошибках.
6. Power/status/logging observations не должны запускать дополнительную ветвь
   управления. Ошибки направить в диагностику/оператору; не в Auto retry loop.

Это сокращает overlap, но не исключает его. Advanced Flow Start/Delay/ANY/ALL
задают порядок одного запуска, не подтверждённую глобальную очередь;
[официальная документация](https://homey.app/en-gb/features/advanced-flow/).
Read/write/read acquisition, ownership check → device call и lease release
не атомарны. Lease 60 s не отменяет долгую старую команду. Не добавлять ещё один
Logic busy flag как будто это строгий mutex.

В текущей подготовке повторно выполнен сохранённый lock-race reproducer в двух
независимых script scopes с общим mock: оба проходят ownership check и отправляют
`[ON, ON]`. Результат сохранён отдельно в
`diagnostics/deployment-readiness/lock-race-results.json`; исторический report
не перезаписан. Это успешное воспроизведение риска, а не passing safety test.

Без собственного executor остаются double acquisition, release race,
late ON после Stop, неизвестный outcome при timeout/restart и mixed writers.
Рекомендация для следующей архитектурной задачи — отдельное Homey App с единой
очередью, durable intent и Stop priority, после проверки модели/permissions.
Внешний coordinator требует отдельного постоянно работающего сервиса.
Сравнение A/B/C и первичные источники: HomeyExecutionSerialization.md.
Executor в этом релизе не реализован.

## No-load acceptance после будущего разрешения

- [ ] EV/нагрузка отключены, питание и независимое emergency OFF доступны.
  Проверить реальное onoff, power units/timestamps, выбор ровно одного plug.
- [ ] Запустить blocked runtime: никаких ON. Проверить missing/stale telemetry
  диагностикой; retained sample не обновляет START_CONFIRMED/LOW_POWER.
- [ ] Manual ON → STARTING и ON; повторное действие не меняет id/startedAt.
  При 0 W без подтверждённого старта LOW_POWER не запускается.
- [ ] USER_STOP → OFF, manual=false, block=true, terminal record. Повторить Stop
  и несколько runtime/legacy invocations: новых ON нет, session сохраняется.
- [ ] Restart Homey после Stop; проверить durable block и отсутствие ON.
  Не сбрасывать переменные startup Flow. Если recovery неясен — оставаться OFF.
- [ ] Auto Mode с реально stale telemetry не даёт grant. Не подменять SOC или
  timestamps в production Logic для получения положительного результата.
- [ ] Тесты остальных terminal reasons, persistence failures и concurrent commands
  уже выполнены локально; не ломать живую Logic/API ради fault injection.
  Пропущенные аппаратные проверки явно записать как непроверенные.
- [ ] Проверить logger на test copy; failed webhook не должен задерживать Stop
  до первой OFF команды. Измерить runtime latency и sample cadence.

## Контролируемая зарядка и критерии остановки

- [ ] Один оператор, один EV, остальные writers выключены. Manual ON с block=true;
  наблюдать два реальных power samples >500 W, разные timestamp, ≥30 s.
- [ ] Проверить USER_STOP под нагрузкой и физическое прекращение зарядки,
  repeated Stop, последующие blocked ticks и сохранность automatic session.
- [ ] Проверить естественное завершение: LOW_POWER при SOC не100 и свежих samples
  ≤5 W с независимыми timestamps, охватывающими ≥180 s, либо BATTERY_FULL при свежем реальном SOC100. Если
  условия не возникли, соответствующая аппаратная проверка остаётся pending.
- [ ] MAX_DURATION требует исходных 6 часов и работающего watchdog; не сокращать
  production threshold ради теста. До аппаратной проверки действует local evidence.
- [ ] После любого завершения несколько ticks не включают plug. Новый Manual ON
  сохраняет automatic block; explicit Auto разрешается только со свежим реальным
  connection evidence/SOC и безопасным OFF. Он может включить сразу по актуальному плану.
- [ ] При failed OFF, неконтролируемом ON, UNKNOWN command outcome, пропусках
  cadence, corrupt safety или конкурирующем writer: прекратить rollout, остановить
  ingress, снять нагрузку/питание безопасно и перейти к rollback.
- [ ] Сохранить version, timestamps, command/event history, physical observations,
  фактическую topology и результаты. Не объявлять unattended readiness по mocks.

## Rollback

1. Остановить normal ingress, Auto/Manual ON и все сторонние writers; USER_STOP
   оставить доступным. Запросить Stop и независимо проверить OFF. При failed OFF
   использовать доступное физическое отключение; не ждать software recovery под нагрузкой.
2. Зафиксировать manual state/block/token/lease, logs и pending/unknown commands.
   Не очищать lease и не возобновлять ON, пока исход старых запросов не выяснен.
3. В maintenance восстановить весь согласованный набор старых HomeyScripts
   и Flow references из backup, затем старую Apps Script deployment version и URL.
   Не смешивать старые helpers с новыми bundles.
4. Восстановить нужную старую конфигурацию по snapshot, оставив plug OFF,
   manual=false, shouldCharge=false и automation disabled. Не replay-ить старую
   automatic session/ON. Сохранить новые safety records отдельно; не удалять
   новые переменные до завершения разбора и проверки совместимости старого кода.
5. Проверить таблицу без удаления Events; сохранить новые manual records.
   Возврат старого materializer не гарантирует их корректную повторную обработку.
6. Старый релиз содержит известные manual/terminal риски. Возврат к его коду
   не разрешает снова включить старую автоматизацию. Сначала review причины
   rollback и отдельное supervised решение; безопасный fallback — OFF.
7. Полный Homey restore использовать только по официальной процедуре для модели
   и отдельному решению: это шире SmartCharge и может затронуть остальные устройства.

## Оставшиеся риски и release gate

- Logic lease — best effort; строгого mutex/command executor нет.
- In-flight ON нельзя отменить reread; компенсация OFF не исключает краткое питание.
- Полный отказ durable persistence и неизвестные команды после restart не закрыты
  доказательством: сохранять OFF/deny и разбирать вручную.
- Real driver ACK, electrical OFF, timestamps и installed Flow topology не проверены.
- Deadline и LOW_POWER зависят от фактических runtime invocations; 6 h не hardware timer.
- Compatibility shadow paths способны командовать при разрешённом automatic;
  правильный mode не заменяет удаление старых writers.
- External logger/Tibber задержки и долгие requests требуют измерения на устройстве.
- Предыдущие smartcharge-review.diff/new-files.patch — исторические snapshots;
  текущий release следует review-ить по feature commit и этому manifest.

До разрешённого rollout checklist остаётся невыполненным на Homey. Релиз
подготовлен локально; deployment, push, merge и PR не выполнялись.
