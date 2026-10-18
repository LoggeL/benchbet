# Branding (overrides SPEC.md where they conflict)

Decided 2026-10-18 by the owner, after SPEC.md was written:

- **Name:** BenchBet (benchmark + bet). Wordmark style: `Bench/Bet.` may keep the old lime accent + violet slash vibe, but the text is "BenchBet".
- **URL:** https://bet.logge.top (`PUBLIC_URL` default, VAPID subject, OG tags, manifest `id`/`start_url`).
- **Repo:** LoggeL/benchbet (public). npm package name `benchbet`.
- **Language:** the whole UI is **English only**: every screen, microcopy, empty state, error message, validation message, toast, push notification text, manifest, OG/meta, README. No German left in user-facing strings.
  - The SPEC's German microcopy is the *intent*; translate it into natural, casual, slightly nerdy English (not literal). In the UI a game is a **"bet"**.
  - Numbers/dates are shown in English (`en-GB`-style: `Fri 24 Oct, 20:00`, 24 h clock, `54.5`, thousands separator `,`). Number input still accepts both `,` and `.` as decimal separator (German friends will type commas).
  - Name keys stay as specified (`nameKey` with `de-DE` lowercasing is fine – it is about matching, not display).
- **Storage keys / identifiers:** `benchbet.*` instead of `tipplab.*` (localStorage, SW cache names, push tags may stay generic).
- **Legacy:** imported data (prompts/descriptions of old bets) stays German as entered; `/#spiel-<id>` legacy links still redirect to the bet page. New routes should be English (`/bet/:id`, `/bet/:id/resolve`, `/bet/:id/edit`, `/new`, `/results`, `/leaderboard`, `/leaderboard/:name`, `/me`, `/how-it-works`), and old German paths (`/spiel/:id` etc.) redirect to the new ones.
