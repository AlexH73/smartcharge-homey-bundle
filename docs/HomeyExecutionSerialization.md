# HomeyScript and Advanced Flow execution serialization

Research date: 2026-10-11. No new executor is implemented. This document compares
options for one charging plug; it does not certify deployed Homey topology.

## Verified platform facts

- Advanced Flow has Start/Delay blocks, ANY/ALL joins and HomeyScript cards.
  These document ordering/join tools, not an exclusive queue across independent
  activations of the same or different Flows. A guarantee of non-overlapping
  invocations was not found in the official material reviewed.
  [Advanced Flow](https://homey.app/en-gb/features/advanced-flow/).
- The published Athom HomeyScript implementation creates a new VM context per
  `runScript` call, executes an async wrapper and awaits its result; no shared
  execution queue surrounds that path. Its Flow action directly calls
  `runScript`. This is source-level evidence for that published implementation,
  not a measurement of live execution exclusion. The subsequent installed API discovery
  identified HomeyScript 3.6.3; no strict execution queue was added to SmartCharge.
  [HomeyScript app.js](https://github.com/athombv/com.athom.homeyscript/blob/ca51e962b49ec03a1be069191df997b1775fc7ad/app.js),
  [RunAction](https://github.com/athombv/com.athom.homeyscript/blob/ca51e962b49ec03a1be069191df997b1775fc7ad/lib/flow/actions/RunAction.js).
- That implementation exposes cross-script `global.get/set` through Homey app
  settings. This does not share a script's lexical `let` variables. Settings
  are persistent values; the documented methods do not promise a distributed
  mutex or a fencing contract with device commands. A synchronous guard within
  the same app process could be investigated against a pinned runtime, but it
  cannot be assumed equivalent to a portable, durable command queue.
  [ManagerSettings](https://apps-sdk-v3.developer.homey.app/ManagerSettings.html).
- SDK App is instantiated once at startup, accessible through `this.homey.app`;
  settings survive reboots. These support a queue owned by that App instance.
  They do not automatically serialize asynchronous Flow listeners: the app must
  implement the queue and ensure all handlers use it.
  [App concepts](https://apps.developer.homey.app/the-basics/app).
- Flow action listeners return Promises. The listener can return the executor's
  acknowledgement and reject on failure; exposing custom action cards is a
  supported integration mechanism.
  [Flow SDK](https://apps.developer.homey.app/the-basics/flow).
- Homey Web API controls devices and Flows. In-app access requires the relevant
  API permission; an external integration needs its own execution environment
  and authentication. Local API keys are supported on the listed Homey Pro
  models; actual model/version/permissions must be checked before choosing them.
  [Web API](https://api.developer.homey.app/),
  [ManagerApi](https://apps-sdk-v3.developer.homey.app/ManagerApi.html),
  [API keys](https://support.homey.app/hc/en-us/articles/8178797067292-Create-and-use-API-Keys-on-Homey-Pro).

## Comparison

The guarantees below are architectural conclusions from those facts, conditional
on routing **every** charging command through the proposed owner. They are not
additional guarantees made by Athom about physical delivery or power loss.

| Aspect | A: Homey Flows / Advanced Flows | B: separate Homey App with one queue | C: external coordinator |
| --- | --- | --- | --- |
| Sequential execution | Ordered cards can sequence one invocation. No verified exclusion across separate invocations; Logic busy flag/Delay/ALL does not establish it. | One App-instance queue can dispatch and await one actuator request at a time, including every handler. Requires deliberate implementation. | One supervised process/worker can do the same. Multiple active replicas need external ownership/fencing that Homey itself does not provide. |
| API constraints | HomeyScript and Logic expose normal reads/writes; current adapter has no conditional update. API calls from another script can interleave. | Use existing Web API for the existing third-party plug; App SDK Device helpers alone do not confer ownership of another app's device. API permission, ACK/error and unknown outcomes remain necessary. | Web API authentication, network reachability, token/key handling and reconnects; no atomic intent+device transaction or guaranteed cancellation established by reviewed API. |
| Implementation complexity | Low for ordering one chain, high/unproven for global queue, retries, restart recovery and Stop priority. | Medium/high: new App, custom cards/API, queue, persisted intent, recovery and migration. | High: service deployment, durable storage, authentication, availability, network/reconnect and migration. |
| Always-running process | Homey and its HomeyScript app already run; no extra service. A sleeping script is a fragile worker, not a supported persistent service contract. | Homey-managed App must remain running; no separate machine needed. | Additional always-running supervised service and host required. |
| Restart | In-flight chain/VM memory cannot be treated as durable acknowledgement. Preserve intent/block, start OFF; Flow scheduling is not a recovered command journal. | Restore durable intent and block in onInit; discard queued ON, reconcile unresolved request, require safe recovery. Memory queue is reconstructed, not replayed blindly. | Restore journal and ownership, reconcile after both service and Homey restarts; do not replay stale ON or assume timeout cancelled a command. |
| Current Flows | Similar cards remain, but all triggers and legacy branches must be audited; unrelated triggers can overlap. | Replace physical control with request cards/API. Existing trigger/planner scripts can become clients; direct device cards must be removed. | Request through authenticated endpoint/client cards/scripts. Direct device control must also be removed. |
| USER_STOP | Direct OFF is prompt but competes with pending ON. Putting Stop behind an entire long Flow may delay it. | Stop sets deny intent immediately, cancels unsent ON, takes priority after current device request. Logging/planning must not block the command queue. | Same queue policy, but additional service/network outage can prevent Stop reaching the owner. Independent local emergency OFF is useful operationally but breaks strict single-writer serialization if another ON remains in flight. |

## Recommendation

**Prefer B for a future implementation**, provided the deployment supports a
Homey App with required API access. It keeps the command owner near the device,
uses documented App lifecycle/custom cards and avoids an extra host/network hop
for USER_STOP. This is a recommendation for a subsequent task, not a change in
the present HomeyScript bundle.

A can reduce collisions and improve clarity, but is not a demonstrated strict
mutex. Neither one watchdog nor chaining runtime cards proves exclusion if a
button, device trigger, legacy script or another activation can run concurrently.
C is reasonable if a maintained local service already exists and its failure
mode/availability are acceptable; no such environment has been established here.

The future executor should serialize durable permission changes and physical
commands, invalidate queued ON by generation, persist denial before Stop ACK,
and keep logger/Tibber outside the critical command dispatch path. It should
return distinct requested/acknowledged/unknown results. An already sent ON cannot
be unsent; OFF follows its settled outcome. A timeout without cancellation proof
must not free ownership for a new ON. If a previous request may survive restart,
verified OFF alone is not proof that no late ON can arrive: recovery must resolve
that uncertainty or keep automatic permission denied.

No option guarantees that failed hardware removes power. No software queue can
exclude an unaudited third-party writer. A separate emergency OFF bypass needs
an explicit tradeoff between availability and single-writer guarantees; it must
not be silently described as part of strict serialization.

## Present implementation boundary and future validation

`SmartChargeRuntimeLock` remains a **best-effort Logic lease**. The reviewed
read/write/read acquisition, ownership check before ON and release are not atomic
with other instances or the device. The terminal permission fix does not repair
that architectural race or turn USER_STOP compensation into cancellation.

Before implementing B, verify the installed Homey model/firmware/HomeyScript,
required permissions and third-party plug API. Prototype one App-owned queue;
assert maximum concurrent device requests is one for scheduler, legacy clients,
Manual ON, Auto and Stop. Test unknown ACKs, process/Homey restart, Stop priority,
late completions, journal recovery and failure to save denial. Audit actual Flows
and all device writers. At the research stage no real topology, installed version or runtime scheduling
was inspected. Later read-only discovery and controlled code installation are
recorded separately in [Homey deployment](HomeyDeployment.md); those do not prove
strict exclusion or resolve the mock race. Historical evidence is retained privately.
