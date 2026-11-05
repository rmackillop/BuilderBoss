# BuilderBoss financial API v1 (feature branch)

This API uses the existing Next.js PWA, Supabase Auth, tenant membership, and database RPCs. No service-role credentials, auth impersonation, or MCP adapter.

## Authentication
Supply `Authorization: Bearer <Supabase user access_token>` and for writes `Content-Type: application/json`. The Next.js route validates the token with Supabase Auth, then forwards the user JWT to Supabase, so RPCs use `auth.uid()`. Never put passwords or tokens into git, logs, or URLs. Use the test account's freshly rotated password via a client login or a protected test harness, not in source.

## Implemented routes
- GET /api/v1/financial/context?project_id=UUID — projects, vendors, commitments, bills, transactions, components.
- GET /api/v1/financial/reports?project_id=UUID — separate raw ledgers. **Aggregated reports are deferred pending reconciliation of legacy payments and new transactions.**
- GET /api/v1/financial/audit?organization_id=UUID&entity_id=UUID — actor/action readback.
- POST /api/v1/financial/bills — project_id, vendor_id, amount, source_key, invoice_number?, due_date?, commitment_id?
- POST /api/v1/financial/transactions — project_id, vendor_id?, kind, amount, date (YYYY-MM-DD), source_key, allocations [{amount,phase_id?,category?}], cash_effect?, notes?
- POST /api/v1/financial/bill-payments — bill_id, transaction_id, amount
- POST /api/v1/financial/commitments/UUID/amendments — new_amount, expected_amount, allocations [{phase_id,amount,trigger?}]; Owner/Admin only.
- Transaction voiding is deliberately reserved for increment 2, after dependency/audit verification.

Successful writes read back the saved entity and existing audit events. Error JSON uses {error:{code,message}}. Client source_key must be stable for retries; amendment uses optimistic old amount. Payment application relies on database row locks and unique bill/transaction pair. No new DB tables or permissions needed for initial routes.

## Verification gates before merge
1. `npm ci && npm run lint && npm run build`.
2. Preview deploy must be READY; test 401 for missing/bad token and 403 for valid member attempting amendment.
3. Test all operations with synthetic data in the two preexisting test organizations. Verify cross-tenant denial, idempotency, rounding, and audit.
4. Before All-Pro Septic writes: read formal budget, all existing septic commitments, invoice #8516 and check #1496 in **both legacy and unified ledgers**, then verify old/new ledger accounting definitions.
5. Owner/Admin amendment must be performed as an actual Owner/Admin, never as the Member test user.
6. Production promotion only after successful checks. Maintain existing `main` release as rollback baseline.

## Known gaps
No rate limiter yet (must be supplied at edge/route before public rollout); bearer-token API is intended for temporary authenticated test harness and future PWA reuse. No signing of dedicated external ChatGPT sessions. Reports do not yet calculate aggregates. No double-counting claims without reconciliation.
