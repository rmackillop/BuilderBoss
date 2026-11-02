# Phase 2 — Increment A

## Scope

The existing PWA now opens an authenticated Ask BuilderBoss tab. A user can type, or record up to 30 seconds of audio, review the transcription, and send an instruction. The server uses strict OpenAI function calling to select an accessible project and one of five read views. The existing financial GET handler executes with the signed-in user's bearer token; model output cannot select a URL, SQL statement, RPC, or write handler. Replies display the actual returned records rather than model-generated financial figures.

Environment: the user configured Vercel AI Gateway. Configure `AI_GATEWAY_API_KEY` as a server-only variable on the existing Vercel project, Production and Preview. The existing saved `OPENAI_API_KEY` is supported as a legacy name for that Gateway key because Vercel disallows renaming sensitive variables; it is never sent to OpenAI directly. Optional `AI_GATEWAY_MODEL` defaults to live-catalog model `openai/gpt-4.1-mini`; optional `AI_GATEWAY_TRANSCRIPTION_MODEL` defaults to `openai/gpt-transcribe`. Text uses the Gateway Responses endpoint; audio uses the Gateway transcription REST endpoint with bounded base64 input. No new infrastructure or database migrations are needed.

Audio uses MediaRecorder with MP4 preferred when supported, then WebM. It is sent to the authenticated transcription route and onward to OpenAI; the application does not persist it. Text fallback remains available when microphone permission or browser support is unavailable. Physical iPhone Safari and installed-PWA verification is required before claiming voice acceptance. Transcription is editable and never auto-submitted.

Conversation history is local component memory and clears on leaving the screen or changing the signed-in identity. Project context is selected explicitly or retained from a successful lookup; full prior messages are not sent to AI. For follow-up lookups, use “this project” or name the project again. Clear resets context. Financial writes are intentionally unavailable in this increment.

Each AI endpoint validates Supabase Auth first. Project discovery is scoped to a verified organization membership and RLS. Financial calls use existing API authorization and RLS. API lists reject more than 500 results instead of silently claiming a complete result. AI calls have a 45-second timeout and best-effort per-user, per-instance limit of 20 requests/minute; this is not a distributed production rate limiter.

## Financial interpretation

Approved commitment and recorded cash-payment subtotals are calculated separately from their respective returned ledgers, in cents. Voided transactions are excluded from the cash-payment subtotal. No commitment/invoice/payment totals are added together. Outstanding payable, formal approved budget, variance, forecasts, and legacy/new ledger reconciliation remain unsupported; the UI states this explicitly. Reports preserve the existing API's reconciliation-deferred response.

## Baseline inspected November 2, 2026

- Repository branch: `feature/financial-api-v1`, starting commit `e6e823448bca113ddb82d98b226bfdc6ddcf9c5d`; draft PR #2 remains unmerged.
- Production alias baseline: deployment `dpl_4MY6Atx8zXduiNnLERvG35hW7po5`, URL `builderboss-29zar7qqx-builderboss.vercel.app`, commit `30084060f3c91c263423f4492c3e77c3a16fffcb`.
- Supabase: existing BuilderBoss project `vtwvohdsmexuztuxrhiv`; public financial tables have RLS enabled. Financial functions were inspected, including database-level owner/admin restriction for commitment amendments and voiding. No policies, roles, or data were changed.
- `richmackillop@gmail.com` is Sun Haven Owner; `chat@sunhavengc.com`, UID `fcacb419-8f3a-4e75-83d5-73c8edfc350b`, is Member. The existing test-account identity owns both test organizations. Membership inspection is not authenticated application execution.
- Mineola Lot 20: All Pro Septic vendor resolves to “Dahl Alton — All Pro Septic”; commitment and legacy subcontract are $10,500. No vendor-linked financial transaction, invoice, or legacy payment matching check 1496 or the subcontract ID was returned. There is no separately established formal budget in these inspected records. Do not infer zero payable or a $700 variance, and recheck source evidence before Increment B.
- Existing architecture document and comprehensive register reviewed. The register already includes VOICE-01 through VOICE-10.

## Verification and test register mapping

Run `pnpm lint`, `pnpm test`, and `pnpm build`. Fourteen automated tests mock external services and verify authentication denial, organization denial, caller-token forwarding, returned database data, unavailable project denial, write rejection, malformed/unsupported tool rejection, existing API error propagation, reports routing, MP4/M4A transcription transport, non-audio rejection, bounded streaming uploads, and empty-speech handling. They do not count as live financial acceptance tests.

Increment A enables execution of VOICE-01/02/03/04 and read-side portions of VOICE-05, REPORT-09, and OPS-05. Physical speech input, actual OpenAI routing, authenticated API reads, and account switching must be executed before any corresponding Pass status. VOICE-06 through VOICE-10 and financial mutations remain deferred to Increment B; other unsupported capabilities and separate-environment tests remain deferred. Preserve prior historical test evidence instead of rewriting it as voice-test evidence.

## Release and rollback

Push the reviewed code to the existing feature branch to trigger the existing Git/Vercel preview pipeline. Verify the build, stage a production deployment for the same commit, and verify before assigning the production domain. Keep the baseline deployment above available; restore its alias if release checks fail. Do not merge draft PR #2 merely because a build succeeds.

## References

- Architecture: https://docs.google.com/document/d/1mKXfCGBCC_mZRH6DXqjhxoCuUnlvbCf3VMfnqm28HAI/edit
- Register: https://docs.google.com/spreadsheets/d/1YprOgbm4FUtddQxs0cZtWcjOKHk5phBQkVlbsFEQO7k/edit
- Function calling: https://developers.openai.com/api/docs/guides/function-calling
- Transcription: https://developers.openai.com/api/docs/guides/speech-to-text
- Browser recording: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
