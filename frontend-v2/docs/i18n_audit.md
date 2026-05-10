# i18n audit — Phase 13

## Scope split

User-visible strings in the v2 frontend fall into two buckets:

1. **Chrome (frontend-owned).** Sidebar nav, TopBar pills + CTA, RightRail
   notifications/reviewers/sections labels, common messages (loading, error,
   filter, save). These ship as keys in `src/i18n/{de,en}.json` and resolve
   via `useTranslation()`.
2. **Body (BFF-owned).** Page heads, KPI labels, briefing memo paragraphs,
   decision card copy, audit feed entries, narrative HTML inside Margin
   Cockpit / Action Center / AI Briefing. These come from the BFF and respect
   the `?lang=` query parameter (P13.T2). The `pryzm_lang` cookie set by the
   i18n provider feeds `?lang=` into every `apiFetch` call.

## Frontend-owned keys (current)

```
nav.*       — Sidebar entries
topbar.*    — TopBar pills + Create CTA
rail.*      — RightRail card titles + footer buttons
common.*    — search, filter, save, cancel, more, loading, error
```

## Backend-owned content

The composers under `backend/services/<screen>/` already accept `lang` and
forward it to the per-block helper. Today only the AI-briefing provider has
a true `lang` switch; other screens render the seeded German copy regardless
of `?lang=`. As body text becomes user-edited (Phase 14), per-row payloads
will carry `(text_de, text_en)` pairs and the composer renders the requested
variant.

## Hard-coded strings still in components

The Frank-only screens still inline German narrative copy (memo paragraphs,
margin "Why now" labels, decision facts, etc.) but these are **rendered from
the BFF payload**, not from JSX literals. They flip when the BFF sends the
`en` variant.

The following inline German remains and is intentional for now — the surface
either won't ship to non-DE users in this phase, or its text comes from
admin-controlled DB rows that will localise via P13.T2:

- Margin Cockpit / Forecast / Quotes inline labels: come from seed JSON,
  swap automatically once en seeds land.
- Studio workbench picker: rendered from BFF payload.
- AI Briefing memo body: see `backend/services/ai_briefing/providers.py`,
  has `lang` parameter; `_template` returns en when `lang='en'`.

## Date / number formatting

`lib/format.ts` exposes `fmt.setLocale('de-DE' | 'en-GB')`. The i18n provider
calls this on every `languageChanged`. `de-DE` is the default. The TopBar
date pill uses the matching `Intl.DateTimeFormat` locale.
