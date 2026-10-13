# Task 12: Claude turns free text into catalogue lines (phase 2)

## Status

not scheduled — phase 2. Do not start until action-required's task-12 prerequisites are settled.

## Wave

6

## Description

Above the item list, a "Describe what you're moving" text box. The client writes "a 3-seat sofa, a double fridge and about 15 boxes of books". Claude maps it onto catalogue codes with quantities, plus custom lines for anything not in the catalogue. The result is shown as **proposed lines the client must confirm** before they join the list.

Claude never prices, never chooses a vehicle, and never submits anything. The deterministic catalogue and load plan stay the authority.

## Dependencies

**Depends on:** task-05, task-11
**Blocks:** none

## Files to Modify

- `package.json` — Anthropic TypeScript SDK
- `env.example` — `ANTHROPIC_API_KEY`, commented in the file's house style
- `src/app/api/booking/parse-items/route.ts` — new
- `src/lib/orders/parse-items-prompt.ts` — new (server-only)
- `src/components/home/item-list-picker.tsx` — the text box and the proposal review
- `src/messages/en/home.json`, `src/messages/ka/home.json`

## Technical Details

### Implementation Steps

1. **Load the `claude-api` skill before writing any SDK code.** Use it for the current model choice, the SDK API, and structured output / tool-use syntax. Do not write model IDs or parameters from memory. A small, fast model tier is expected to be enough for this mapping; confirm with the skill.

2. **Route:** `POST /api/booking/parse-items`.
   - **Session required.**
   - Rate-limited with `src/lib/rate-limit.ts` (e.g. 10/min per user).
   - Body `{ text: string (1–500 chars), locale: "en" | "ka" }`.
   - If `ANTHROPIC_API_KEY` is unset, return 503 and the UI hides the feature entirely. Expose availability through a server-rendered prop, not a client env var.

3. **Prompt and output:**
   - Give the model the active catalogue as `code — label (en) / label (ka) — synonyms`.
   - Force a structured result via a tool or JSON schema whose `code` field is an **enum of active codes**:

     ```ts
     { lines: Array<
         | { kind: "CATALOGUE"; code: CatalogueCode; quantity: number }
         | { kind: "CUSTOM"; label: string; quantity: number; size: "S" | "M" | "L" | "XL" }
       >,
       unparsed: string[] }   // fragments it could not interpret
     ```

   - The system prompt says: no invented weights; prefer catalogue codes; quantities default to 1; "a few" → 3; ignore addresses, names and phone numbers in the text.
   - Validate the response server-side again: codes exist, quantities 1–99. Drop anything that fails.

4. **Privacy:**
   - Send only the text and the catalogue: no user id, email or address.
   - Do not log the text.
   - The privacy-policy decision is an action-required prerequisite.

5. **UI:**
   - Below the text box, "Suggested items" lists the proposed lines with quantities, each removable and editable.
   - Two buttons: "Add these items" (merges into `lines`, incrementing duplicates) and "Discard".
   - `unparsed` fragments appear as "We couldn't place: …" with an "Add as other item" shortcut.
   - Loading state uses `aria-busy`. Errors render as `role="alert"` with the server's wording.

6. **Tests:** unit-test the response validator and merge logic without calling the API. Add one opt-in live test, skipped unless `ANTHROPIC_API_KEY` is set, that sends three fixed sentences (one Georgian) and asserts the expected codes appear.

7. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.

## Acceptance Criteria

- [ ] Feature invisible when no API key is configured
- [ ] Output constrained to active catalogue codes and re-validated server-side
- [ ] Nothing joins the list without the client pressing "Add these items"
- [ ] No personal data beyond the typed text is sent; text not logged
- [ ] Rate-limited and session-only
