# Browser-to-Browser Smoke Test — Manual Script

## Context

The user wants a REAL two-browser-context (visitor + admin) end-to-end smoke test of Web Chat (Phase 2/3), explicitly ruling out mocked sockets, direct API calls, unit tests, and server-side scripts as substitutes.

I have no browser-automation tool available in this session (checked: no Playwright/browser MCP among deferred tools, no `.claude/skills/run/` to inspect, nothing in my standard toolset drives an interactive browser). The user chose: **I prepare a precise manual script; they execute it in two real browsers and report results back to me.**

This plan's only output is that script — no code changes, no code review of results yet (that happens after they report back).

## Prerequisites (for the user to have running before starting)

```
pnpm --filter @medcal/api dev        # :3001
pnpm --filter @medcal/web-api dev    # :3002
pnpm --filter @medcal/web dev        # :3000  (public site, visitor bubble)
pnpm --filter @medcal/portal dev     # :3003  (admin portal)
```

Two separate browser contexts so sessions never share cookies:
- **Browser A (visitor)**: a normal window, or an Incognito/Private window — must never have visited `apps.localhost:3003` or signed in.
- **Browser B (admin)**: a **different** browser (or a separate Incognito window in a different browser) signed in at `http://apps.localhost:3003/sign-in` with an account that has SUPERADMIN or ADMIN role (holds `chat:read`/`chat:reply`/`chat:close`).

## The script (10 tests, mapped to this app's actual UI)

**Test 1 — Visitor starts chat** (Browser A, `http://localhost:3000`)
1. Open the site, click the round chat bubble (bottom-right, "Chat dengan kami").
2. Confirm fields: Nama / Email / Pesan, helper text "Kirim pesan Anda, tim kami akan segera menjawab."
3. Fill Nama="Smoke Test Visitor", Email=a unique address (e.g. `smoke+<timestamp>@example.com`), Pesan="SMOKE TEST — first visitor message". Click "Kirim Pesan".
4. **Check**: no "Terkirim! Tim kami akan segera menghubungi Anda." screen. The same panel should show the message thread with your message in it, plus a composer for follow-ups.
5. **Known caveat to watch for**: reCAPTCHA is configured with dev placeholder keys that fail closed (`RECAPTCHA_SECRET_KEY` has no real Google credentials in `.env`) — if submission fails with "Gagal mengirim pesan," this is expected in this dev environment, not a new defect. Report it as such rather than as a blocker, and let me know if you want real reCAPTCHA keys configured before continuing.

**Test 2 — Admin sees the conversation** (Browser B, `http://apps.localhost:3003`)
1. Go to `/chat` (via the Chat tile on `/`, or the "Chat" nav item).
2. Confirm "Smoke Test Visitor" appears in the list with the right email and a preview of "SMOKE TEST — first visitor message".
3. Click it → opens `/chat/<sessionId>`. Confirm visitor identity + the first message are correct.
4. Separately confirm this conversation is **not** reachable by going through `/leads` first — it should only be discoverable via `/chat`.

**Test 3 — Admin replies in real time**
1. In Browser B's open conversation, type "SMOKE TEST — admin reply" in the composer, send.
2. Watch Browser A **without refreshing or reopening the bubble** — the reply should appear within ~1s, visually distinguished from visitor messages (different bubble side/color).
3. Back in Browser B, confirm the admin's own message appears exactly once (no duplicate).

**Test 4 — Visitor replies in real time**
1. In Browser A's composer, send "SMOKE TEST — visitor follow-up".
2. Watch Browser B without refreshing — should appear within ~1s, exactly once.

**Test 5 — Persistence / refresh**
1. Browser A: close the bubble (X), reopen it → should restore the same thread, not the start form.
2. Browser A: refresh the whole page (F5), reopen the bubble → same thread restored, still no start form.
3. Browser B: refresh `/chat/<sessionId>` → full history (all 4 messages so far) still there.

**Test 6 — Reconnect**
1. In Browser A, with the bubble open, briefly turn off Wi-Fi/network (or use DevTools Network tab → "Offline") for ~10s, then restore it.
2. Expect: connection recovers on its own (you may see a brief "Terputus, mencoba menyambung kembali…" indicator), no duplicate messages, no new conversation.
3. If disabling network isn't practical/safe on your machine, skip this test and say so explicitly — don't simulate it with a script.

**Test 7 — Close session**
1. Browser B: in the conversation, click "Tutup percakapan".
2. Browser A: should show a closed-conversation state; the composer should be disabled/rejected, but the existing history stays visible and readable.

**Test 8 — Lead side effect** (Browser B, `http://apps.localhost:3003/leads`)
1. Search/find "Smoke Test Visitor" in Lead Inbox.
2. Open its Lead Detail — INTERAKSI should show exactly **one** entry for this Web Chat session (the first message only), not one per subsequent chat message.

**Test 9 — Payload sanity** (either browser, DevTools → Network → WS frames, or Network tab filtered to `chat-sessions`)
1. Inspect an outgoing `send_message` WebSocket frame from Browser A (visitor) and one from Browser B (admin).
2. Visitor frame should contain only `body` (+ `clientMessageId`) — no `sessionId`, `companyId`, `senderType`, `senderUserId`, `role`.
3. Admin frame should contain only `sessionId`, `body`, `clientMessageId` — no `companyId`, `senderType`, `senderUserId`, `role`, `tenantId`.

**Test 10 — Console/network errors**
In both browsers' DevTools: note any console errors/warnings, failed requests, CORS errors, or hydration warnings that appear during the above steps (ignore unrelated noise from other parts of the site/portal).

## What happens after you report back

Send me PASS/FAIL + observations per test (screenshots welcome but not required). I will **not** start fixing anything automatically — per the task's own instructions, if you find a defect I'll report exact repro steps / expected vs actual / likely code boundary and wait for your go-ahead before touching code.
