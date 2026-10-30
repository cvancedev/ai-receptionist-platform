# Pilot Provider Budget and Reservations (Stage B2.4A)

## Purpose

Stage B2.4A adds the spending-protection foundation a real provider needs. It
does **not** activate a provider: provider network execution remains disabled,
no credential exists, and every committed turn still runs the offline simulated
transport at zero cost.

The stage adds four things:

1. a pre-call spending **reservation** with settlement inside the turn commit;
2. an explicit UTC **billing month** for every usage row (migration 010);
3. an allowlisted, explicitly provisional **price table** with a conservative
   integer estimator;
4. bounded **reconciliation** for reservations abandoned by interrupted requests.

## Reservation lifecycle

```
validate → authorize → reserve → provider execution → validate response
        → commit and settle
```

- **validate/authorize** are unchanged: the business and conversation come from
  the authenticated session, and the turn identifier is client-generated and
  scope-bound.
- **reserve** happens before any provider work. `reserveUsage` takes a
  transaction-scoped advisory lock on the business, re-reads the billing month's
  settled plus reserved total, and inserts a `reserved` row only when
  `spent + estimate ≤ monthly cap`. A refusal returns `budget-exhausted` before
  the provider is invoked.
- **settle** happens inside the existing turn transaction. The commit converts
  the reserved row to `settled` with the actual (or estimated) cost via
  `ON CONFLICT … WHERE state = 'reserved'`, and re-checks the cap excluding the
  turn's own row. State, messages, receipt, and usage commit atomically.
- **duplicate turns** cannot double-reserve or double-charge: the reservation
  primary key is the same `(business, profile version, conversation, turnId)`
  tuple as the receipt, and the identifier check happens before reservation.

### Programmable state machine

| Situation | Result |
| --- | --- |
| Reservation fits the cap | Turn proceeds; commit settles |
| Reservation would exceed the cap | `402 budget_exhausted`; provider never called |
| Same `turnId` retried | Existing reservation reused; receipt replays; one charge |
| Provider failure (unknown billing outcome) | Reservation **held**, response sanitized `502` |
| Turn rejected before the provider is reached | Reservation **released** |
| Request process dies mid-turn | Reservation becomes stale and is reconciled after the window |
| Settled charge exists | Never released; `releaseReservation` returns `not-found` |

### Reconciliation policy

A reservation abandoned by a dead process is released only after a bounded
window (`STALE_RESERVATION_MS`, 5 minutes by default). Pilot composition calls
`reconcileReservations()` at startup; nothing is pruned on a request path.

This is deliberately conservative. A provider may still be processing (or may
already have billed) a request whose caller disappeared, so an immediate release
would understate spending. Releasing later means temporary over-counting, which
is the safe direction for a cap. The trade-off is documented rather than hidden:
a crash followed by a provider charge can leave the ledger short by at most the
released reservation.

## Billing month

Migration 010 adds `billing_month` (`YYYY-MM`, UTC) to
`receptionist_usage_events`, back-fills existing rows once from `created_at`, and
makes the column `NOT NULL` with a format check and a
`(business, billing_month, state)` index.

The reservation and its settlement share one month value derived from trusted
server time. Month boundaries therefore no longer depend on when a row was read
or when a late settlement happened.

## Cost estimation

Prices live in [provider-pricing.ts](../src/server/billing/provider-pricing.ts)
and are an allowlist: an unknown provider resolves to `null`, and the durable
service then fails closed with a sanitized internal failure rather than calling
a provider outside the budget guard.

Each entry declares integer micro-units of USD per million tokens
(`1 USD = 1,000,000 micros`), an application input/output token budget, a
verification date, and a source URL.

**Estimates are deliberately conservative:** full input budget + full output
budget, then a 25 % safety margin, all in integer arithmetic.

| Provider / model | Input | Output | Turn estimate* |
| --- | ---: | ---: | ---: |
| Offline simulator | $0 | $0 | $0 |
| OpenAI `gpt-6-luna` | $0.10 / 1M | $0.50 / 1M | 820 micros ($0.00082) |
| Anthropic `claude-haiku-5-5` | $0.10 / 1M | $0.50 / 1M | 820 micros ($0.00082) |
| Google `gemini-3.1-flash-lite` | $0.25 / 1M | $1.50 / 1M | 2,300 micros ($0.0023) |

\* 4,000 input + 512 output tokens, plus the margin.

**These prices are provisional.** They were read from official documentation on
30 October 2026 and must be re-verified before any provider is activated. They
are not a contractual rate and confer no guaranteed cost.

### Estimate versus actual

When a provider reports usage, settlement records that cost instead of the
estimate. If the reported cost exceeds the reservation, the row is settled at the
reported amount and the commit re-checks the monthly cap: a turn that would
exceed the cap is refused, but money already spent cannot be recovered. The
25 % margin exists to make this rare, not to make it impossible. Providers that
report no usage fall back to the estimate.

## Internal control versus provider-side limit

An application reservation is **our** accounting boundary. It cannot stop a
provider from charging more than a reserved amount, and it is not a substitute
for a provider-side spend limit.

Before a real provider is activated, the account **must** additionally carry one
of:

- a prepaid credit balance sized to the pilot budget, or
- a provider-side hard spending limit (where the provider offers one), or
- a dedicated project/workspace with its own billing limit.

Google documents spend-based rolling limits; OpenAI and Anthropic document usage
limits that we could not verify as a hard stop. Until one of the above is in
place and tested, **no guarantee of a $10 hard ceiling may be claimed** — only
that the application refuses to *start* work beyond its own accounting cap.

## Security guarantees

- Every reservation and settlement is scoped by business, profile version,
  conversation, and turn. Cross-business reads and writes are impossible.
- Rows contain provider/model identifiers, token counts, integer micro-costs, a
  billing month, state, and timestamps. They contain **no** conversation text,
  prompt, credential, session token, handle, or raw provider error.
- The budget check runs inside the database transaction under an advisory lock,
  so concurrent turns cannot each observe the same headroom.
- Provider execution remains disabled: `providerNetworkExecution` must be
  `"disabled"`, no credential reference is read, and the only transport composed
  by any runtime is the offline simulator.
- CSRF, origin binding, session authority, rate limiting, bounded request bodies,
  and sanitized errors are unchanged by this stage.

## Migration and runtime readiness

Apply migrations explicitly; a request never migrates a database:

```powershell
$env:AI_RECEPTIONIST_PILOT_DATABASE_URL = "<server-side connection URL>"
npm run migrate:pilot
```

Pilot composition fails closed (`pilot-unavailable`) when the schema is missing,
unreadable, or older than version 10.

## Required before activating a real provider

1. Approve a provider, model, and the exact price table entry; re-verify prices.
2. Fund the account and set a provider-side limit or prepaid balance.
3. Implement the provider request/response envelope behind `HttpModelTransport`
   (B2.4B) — no route imports it yet.
4. Add the approved knowledge-context section and the grounding check, otherwise
   the model cannot answer from business information.
5. Wire reported token usage from the adapter into `reportedUsage` so settlement
   uses real numbers.
6. Verify with the loopback fake provider first, then with one explicitly
   authorized live call under a small sub-cap.
7. Confirm per-business caps (`monthlyBudgetMicros`, default $10) and decide
   whether the cap includes voice minutes; voice costs roughly $0.05–0.06/minute
   and does not fit inside $10 for a meaningful demo.

## Known limitations

- Estimation uses token budgets, not the provider tokenizer; the margin covers
  the gap but is not a proof.
- A crashed request leaves a reservation counted for one reconciliation window.
- A provider charge after release is not recoverable by the ledger.
- The rate limiter remains process-local.
- Reconciliation runs at composition and can be invoked periodically by an
  operator or a later scheduler; there is no background daemon in this stage.
- Only one transport is composed at a time; there is no provider fallback.
