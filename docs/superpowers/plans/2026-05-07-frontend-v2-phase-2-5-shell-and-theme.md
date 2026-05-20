# Frontend v2 — Phase 2.5: Shell & Theme parity (Pryzm 2026)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `frontend-v2` to a 1:1 visual match with `Pryzm_Dashboard_Mockup_Frank.html` by adopting the Pryzm 2026 design tokens, Manrope+Inter typography, the three-pane shell (rounded card on a warm canvas: 240px sidebar / fluid main / 320px right rail), the full top utility bar, and the chart palette overrides — without touching mock JSON or feature-page logic. Phases 1 (Action Center) and 2 (Margin Cockpit) drop into the corrected shell unchanged.

**Architecture:** Theme is delivered through a single source of truth (`tokens.css`) with the Pryzm 2026 palette, plus a Manrope `font-display` class consumed by all `h1–h5`. The shell is recomposed in `Shell.tsx` to render `<TopBar />` outside a rounded `<ShellCard>` that holds `<Sidebar />`, `<Outlet />`, and `<RightRail />` in a CSS grid with collapse states stored in `useUiStore`. `RightRail` content comes from a new `useShell()` TanStack-Query hook backed by `src/data/mocks/shell.json` so Phase 8 can swap to a real backend without component changes. Recharts color sweep is mechanical: rose/green/red/amber map to the new tokens.

**Tech Stack:** Same as prior phases (React 19, TS strict, Vite 7, Tailwind 4 with CSS-var tokens, TanStack Query v5, Recharts 3, Vitest + Testing Library, lucide-react, react-router-dom v7, react-i18next, Manrope+Inter via Google Fonts).

---

## Source of truth

- HTML reference: `Pryzm_Dashboard_Mockup_Frank.html`
  - Token block: lines 1550–1620
  - Topbar markup: lines 3793–3810
  - Sidebar markup: lines 3812–3895
  - Right rail markup: lines 7271–7353
  - Shell layout grid: lines 1578–1645

- Existing v2 code to replace (file purposes will not change, only contents):
  - `frontend-v2/src/styles/tokens.css`
  - `frontend-v2/src/styles/globals.css`
  - `frontend-v2/src/app/layout/Shell.tsx`
  - `frontend-v2/src/app/layout/TopBar.tsx`
  - `frontend-v2/src/app/layout/Sidebar.tsx`
  - `frontend-v2/src/app/layout/PersonaSwitcher.tsx`
  - `frontend-v2/src/stores/uiStore.ts` (extend, do not replace)

- New files (created by this plan):
  - `frontend-v2/src/app/layout/RightRail.tsx`
  - `frontend-v2/src/app/layout/SidebarUserCard.tsx`
  - `frontend-v2/src/app/layout/SidebarDeptList.tsx`
  - `frontend-v2/src/app/layout/SidebarDataStatus.tsx`
  - `frontend-v2/src/app/layout/TopBarSearch.tsx`
  - `frontend-v2/src/app/layout/TopBarPersona.tsx` (replaces `PersonaSwitcher` styling)
  - `frontend-v2/src/data/api/useShell.ts`
  - `frontend-v2/src/data/mocks/shell.json`
  - `frontend-v2/src/types/shell.ts`
  - `frontend-v2/src/lib/chartColors.ts`
  - `frontend-v2/src/tests/shell/Shell.test.tsx`
  - `frontend-v2/src/tests/shell/RightRail.test.tsx`
  - `frontend-v2/src/tests/shell/Sidebar.test.tsx`

## Conventions

1. **Pryzm 2026 is on by default in v2.** Apply the body class `pryzm-2026` once at app mount (in `src/main.tsx`) so token overrides cascade. Do not provide a toggle; the v2 frontend has no other theme.
2. **Tokens replace, do not extend.** Phase 1 / Phase 2 components reference variables like `--rose`, `--rose-bg`, `--green`, `--shadow-pop`. The Phase 2.5 token table redefines those values to the Pryzm 2026 palette; existing components rerender on a token change with no code edits.
3. **Manrope display, Inter body.** Reuse `font-display` Tailwind utility from Phase 0 for headings; `font-sans` (Inter) for body. Do not introduce a third font.
4. **Grid layout uses raw CSS, not Tailwind utilities,** because the grid template needs custom `grid-template-columns: 240px 1fr 320px` with collapse variants. Define those classes in `globals.css` under the `pryzm-2026` body scope; consume via `className`.
5. **Persona switching:** Frank stays on v2. Till and Heiko navigate to `/demo/#?persona=md` and `/demo/#?persona=sr` respectively (existing demo at Avanna EC2 honors the hash). The v2 router does not handle Till/Heiko; the top bar simply links out via `window.location.assign`.
6. **Tests are component-scope only,** not visual-regression. Snapshots tied to design tokens are brittle; instead assert on rendered text and the presence of major sections.
7. **Visual audit at end:** start the dev server and capture screenshots of `/action-center` and `/margin` at 1440×900 in headless Playwright; compare with `Pryzm_Dashboard_Mockup_Frank.html` at the same breakpoint. Diff pass = ship.

---

## Task 1: Tokens + global CSS + Manrope font + body class

**Files:**
- Replace: `frontend-v2/src/styles/tokens.css`
- Modify: `frontend-v2/src/styles/globals.css` — add font links + shell grid classes + `body.pryzm-2026` reset
- Modify: `frontend-v2/index.html` — add Google Fonts preconnect + stylesheet for Manrope+Inter
- Modify: `frontend-v2/src/main.tsx` — add `document.body.classList.add('pryzm-2026')` before render

- [ ] **Step 1.1: Replace `tokens.css` with Pryzm 2026 palette**

```css
/* Pryzm 2026 — Frank-mockup-aligned tokens (Phase 2.5) */
@layer base {
  :root, body.pryzm-2026 {
    /* Surface */
    --canvas: #cdd5de;
    --shell: #eef1f5;
    --surface: #ffffff;
    --surface-soft: #f3f5f8;
    --surface-sunken: #e7eaef;
    --bg: var(--canvas);

    --hairline: #eaedf1;
    --border: #dde1e7;
    --border-strong: #c8cdd4;
    --border-subtle: var(--hairline);

    /* Ink (text) */
    --ink: #101418;
    --ink-2: #1f2530;
    --ink-3: #4a5360;
    --muted: #7d8693;
    --muted-2: #aab2bd;
    --text-primary: var(--ink);
    --text-muted: var(--muted);

    /* Brand — steel-rose */
    --rose: #5a7da3;
    --rose-deep: #3e5d80;
    --rose-soft: #9eb6ce;
    --rose-tint: #dde7f1;
    --rose-bg: #edf3f9;
    --rose-border: #c5d4e3;

    /* Semantic — softened palette */
    --green: #2f7d5b;
    --green-bg: #e3efe6;
    --green-border: #b9d4c3;

    --amber: #a5701f;
    --amber-bg: #f5ecd9;
    --amber-border: #e0caa3;

    --red: #9a3232;
    --red-bg: #f1dcdc;
    --red-border: #d8a9a9;

    --violet: #6d4ec5;
    --violet-bg: #ece4f6;

    --primary: var(--rose);
    --primary-deep: var(--rose-deep);

    /* Radii */
    --r-sm: 8px;
    --r: 12px;
    --r-md: 14px;
    --r-lg: 18px;
    --r-xl: 24px;
    --r-2xl: 32px;
    --radius-sm: var(--r-sm);
    --radius-md: var(--r);
    --radius-lg: var(--r-md);
    --radius-xl: var(--r-lg);
    --radius-2xl: var(--r-xl);
    --radius-pill: 9999px;

    /* Shadow */
    --shadow-card: 0 1px 0 rgba(15, 20, 28, 0.05), 0 2px 6px rgba(15, 20, 28, 0.06);
    --shadow-pop: 0 14px 32px -14px rgba(15, 20, 28, 0.20), 0 3px 8px rgba(15, 20, 28, 0.07);
    --shadow: var(--shadow-card);
    --shadow-md: var(--shadow-pop);
    --shadow-lg: 0 24px 48px rgba(15, 20, 28, 0.16);
    --shadow-1: var(--shadow);
    --shadow-2: var(--shadow-md);
    --shadow-3: var(--shadow-lg);
    --shadow-4: var(--shadow-lg);
    --surface-overlay: rgba(15, 20, 28, 0.4);

    /* Type */
    --font-display: 'Manrope', 'Inter', system-ui, sans-serif;
    --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --grey-bg: var(--surface-soft);
  }
}
```

- [ ] **Step 1.2: Modify `globals.css`**

Append (do not delete existing globals — `tokens.css` already imported there):

```css
@layer base {
  body.pryzm-2026 {
    font-family: var(--font-body);
    background: var(--canvas);
    color: var(--ink);
    font-size: 13.5px;
    line-height: 1.5;
    letter-spacing: -0.005em;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  body.pryzm-2026 h1,
  body.pryzm-2026 h2,
  body.pryzm-2026 h3,
  body.pryzm-2026 h4,
  body.pryzm-2026 h5 {
    font-family: var(--font-display);
    margin: 0;
    color: var(--ink);
    letter-spacing: -0.022em;
    font-weight: 700;
  }

  /* Shell layout — driven by Shell.tsx; classes consumed via className */
  .pz-app {
    min-height: 100vh;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--canvas);
  }

  .pz-shell {
    background: var(--shell);
    border-radius: var(--r-2xl);
    flex: 1;
    display: grid;
    grid-template-columns: 240px 1fr 320px;
    padding: 18px;
    min-height: 0;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.6),
      0 1px 0 rgba(255, 255, 255, 0.6),
      0 12px 32px -16px rgba(15, 20, 28, 0.22),
      0 4px 12px -4px rgba(15, 20, 28, 0.10);
    transition: grid-template-columns 0.25s ease;
  }

  .pz-shell.left-collapsed { grid-template-columns: 60px 1fr 320px; }
  .pz-shell.right-collapsed { grid-template-columns: 240px 1fr 44px; }
  .pz-shell.left-collapsed.right-collapsed { grid-template-columns: 60px 1fr 44px; }

  .pz-aside {
    display: flex;
    flex-direction: column;
    padding: 6px 4px 6px 0;
    gap: 2px;
    min-width: 0;
    background: transparent;
    position: relative;
  }

  .pz-main {
    padding: 6px 22px;
    overflow-y: auto;
    overflow-x: hidden;
    min-width: 0;
    scrollbar-width: thin;
  }
  .pz-main::-webkit-scrollbar { width: 8px; }
  .pz-main::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 4px; }

  .pz-rail {
    padding: 6px 0 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    position: relative;
  }
}
```

- [ ] **Step 1.3: Modify `index.html`**

Inside `<head>`, before any other stylesheet, add:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 1.4: Modify `main.tsx` to apply the body class once**

Add immediately before `createRoot(document.getElementById('root')!).render(...)`:

```ts
document.body.classList.add('pryzm-2026');
```

- [ ] **Step 1.5: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck && npm run lint && npm test
```

Expected: green, 15 tests still pass (Phase 2 tests are not bound to color tokens).

```bash
git add frontend-v2/src/styles/ frontend-v2/index.html frontend-v2/src/main.tsx
git commit -m "feat(v2): Phase 2.5 part 1 — Pryzm 2026 tokens + Manrope/Inter + body class"
```

---

## Task 2: TopBar — full utility bar

**Files:**
- Replace: `frontend-v2/src/app/layout/TopBar.tsx`
- Replace: `frontend-v2/src/app/layout/PersonaSwitcher.tsx` → rename component file to `TopBarPersona.tsx`; keep the existing path until Step 2.5 cleanup
- Create: `frontend-v2/src/app/layout/TopBarSearch.tsx`
- Modify: `frontend-v2/src/styles/globals.css` — add topbar pill classes
- Test: `frontend-v2/src/tests/shell/TopBar.test.tsx`

- [ ] **Step 2.1: Add topbar styles to `globals.css`**

Append:

```css
@layer base {
  body.pryzm-2026 .pz-topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    flex-wrap: wrap;
  }

  body.pryzm-2026 .pz-logo {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    background: #101418;
    display: grid;
    place-items: center;
    color: #fff;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  body.pryzm-2026 .pz-pill,
  body.pryzm-2026 .pz-pill-icon {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--ink-2);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  body.pryzm-2026 .pz-pill:hover { background: #f7f9fb; border-color: var(--border-strong); }
  body.pryzm-2026 .pz-pill svg { width: 14px; height: 14px; stroke: currentColor; }

  body.pryzm-2026 .pz-pill.has-dot { padding-left: 14px; }
  body.pryzm-2026 .pz-pill.has-dot::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--rose);
    box-shadow: 0 0 0 3.5px rgba(90, 125, 163, 0.18);
    margin-right: 4px;
  }

  body.pryzm-2026 .pz-pill-icon {
    width: 38px;
    padding: 0;
    justify-content: center;
    color: var(--ink-3);
  }

  body.pryzm-2026 .pz-search {
    flex: 1;
    max-width: 340px;
    justify-content: flex-start;
    color: var(--muted);
  }
  body.pryzm-2026 .pz-search:hover { color: var(--ink-2); }

  body.pryzm-2026 .pz-grow { flex: 1; }

  body.pryzm-2026 .pz-persona {
    display: inline-flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 3px;
    gap: 2px;
  }
  body.pryzm-2026 .pz-persona button {
    height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    background: transparent;
    color: var(--ink-3);
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;
  }
  body.pryzm-2026 .pz-persona button.active {
    background: var(--ink);
    color: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  body.pryzm-2026 .pz-lang {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    background: transparent;
    color: var(--ink-2);
    font-size: 13px;
    font-weight: 500;
    border: none;
    cursor: pointer;
  }

  body.pryzm-2026 .pz-date {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 38px;
    padding: 0 16px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--ink);
    font-weight: 500;
  }

  body.pryzm-2026 .pz-cta {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    height: 38px;
    padding: 0 18px;
    border-radius: 12px;
    background: #101418;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
  }
  body.pryzm-2026 .pz-cta:hover { background: #252a33; }
}
```

- [ ] **Step 2.2: Implement `TopBarSearch.tsx`**

```tsx
import { Search } from 'lucide-react';

export function TopBarSearch() {
  return (
    <button type="button" className="pz-pill pz-search" aria-label="Search SKUs, customers, clusters">
      <Search size={14} />
      <span>Search SKUs, customers, clusters…</span>
    </button>
  );
}
```

- [ ] **Step 2.3: Implement `TopBarPersona.tsx` (replaces `PersonaSwitcher.tsx`)**

Replace the contents of `frontend-v2/src/app/layout/PersonaSwitcher.tsx` (keep the file path so existing imports work):

```tsx
import { usePersonaStore } from '@/stores/personaStore';

const personas = [
  { id: 'frank', label: 'Frank' },
  { id: 'till',  label: 'Till',  external: '/demo/#?persona=md' },
  { id: 'heiko', label: 'Heiko', external: '/demo/#?persona=sr' },
] as const;

export function PersonaSwitcher() {
  const persona = usePersonaStore((s) => s.persona);
  const setPersona = usePersonaStore((s) => s.setPersona);

  return (
    <div className="pz-persona" role="tablist" aria-label="Persona">
      {personas.map((p) => {
        const active = persona === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'active' : undefined}
            onClick={() => {
              if ('external' in p && p.external) {
                window.location.assign(p.external);
                return;
              }
              setPersona(p.id);
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
```

If `usePersonaStore` does not exist, locate the existing store (likely `useUiStore`) and use whichever field tracks the current persona. Run `grep -r "persona" frontend-v2/src/stores/` to confirm the import path. If neither exists, default to the existing `PersonaSwitcher.tsx` consumer pattern; the goal is to swap visuals only, not introduce a new store.

- [ ] **Step 2.4: Replace `TopBar.tsx`**

```tsx
import { Bell, Calendar, ChevronDown, MoreHorizontal, UserPlus } from 'lucide-react';
import { TopBarSearch } from './TopBarSearch';
import { PersonaSwitcher } from './PersonaSwitcher';

export function TopBar() {
  return (
    <header className="pz-topbar" aria-label="Top utility bar">
      <div className="pz-logo" aria-label="Pryzm">
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
          <path d="M12 3 4 9v6l8 6 8-6V9z" />
          <path d="M12 3v18M4 9l8 6 8-6" />
        </svg>
      </div>

      <TopBarSearch />

      <button type="button" className="pz-pill" aria-label="Add person">
        <UserPlus size={14} /> Add person
      </button>

      <button type="button" className="pz-pill has-dot" aria-label="Notifications">
        <Bell size={14} /> Notifications
      </button>

      <button type="button" className="pz-pill-icon" aria-label="More">
        <MoreHorizontal size={14} />
      </button>

      <span className="pz-grow" />

      <PersonaSwitcher />

      <button type="button" className="pz-lang" aria-label="Language">
        En <ChevronDown size={9} />
      </button>

      <div className="pz-date">
        <Calendar size={14} />
        <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>

      <button type="button" className="pz-cta">
        Create <span aria-hidden>→</span>
      </button>
    </header>
  );
}
```

- [ ] **Step 2.5: Test — `frontend-v2/src/tests/shell/TopBar.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from '@/app/layout/TopBar';

describe('TopBar', () => {
  it('renders logo, search, persona, language, date, and Create CTA', () => {
    render(<MemoryRouter><TopBar /></MemoryRouter>);
    expect(screen.getByLabelText('Pryzm')).toBeInTheDocument();
    expect(screen.getByLabelText(/Search SKUs/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Frank' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Till' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Heiko' })).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.6: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/app/layout/ frontend-v2/src/styles/globals.css frontend-v2/src/tests/shell/
git commit -m "feat(v2): Phase 2.5 part 2 — TopBar utility row (logo, search, add-person, notifications, persona, lang, date, Create)"
```

---

## Task 3: Sidebar — Workspace + nav + Departments + Data fresh + user card

**Files:**
- Replace: `frontend-v2/src/app/layout/Sidebar.tsx`
- Create: `frontend-v2/src/app/layout/SidebarDeptList.tsx`
- Create: `frontend-v2/src/app/layout/SidebarDataStatus.tsx`
- Create: `frontend-v2/src/app/layout/SidebarUserCard.tsx`
- Modify: `frontend-v2/src/styles/globals.css` — add sidebar classes
- Modify: `frontend-v2/src/stores/uiStore.ts` — extend with `rightRailCollapsed` (Sidebar reuses existing `sidebarCollapsed`)
- Test: `frontend-v2/src/tests/shell/Sidebar.test.tsx`

- [ ] **Step 3.1: Add sidebar styles to `globals.css`**

Append:

```css
@layer base {
  body.pryzm-2026 .pz-nav-title,
  body.pryzm-2026 .pz-nav-sub-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted-2);
    padding: 14px 12px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  body.pryzm-2026 .pz-nav-divider {
    height: 1px;
    background: var(--border);
    margin: 10px 8px;
  }

  body.pryzm-2026 .pz-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--ink-2);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  body.pryzm-2026 .pz-nav-item:hover { background: rgba(255, 255, 255, 0.55); color: var(--ink); }
  body.pryzm-2026 .pz-nav-item.active {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-card);
  }
  body.pryzm-2026 .pz-nav-item .ico { width: 16px; height: 16px; flex: none; color: var(--ink-3); }
  body.pryzm-2026 .pz-nav-item.active .ico { color: var(--rose-deep); }

  body.pryzm-2026 .pz-dept-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    border-radius: 8px;
    font-size: 12.5px;
    color: var(--ink-3);
    cursor: pointer;
  }
  body.pryzm-2026 .pz-dept-item:hover { background: rgba(255, 255, 255, 0.45); color: var(--ink-2); }
  body.pryzm-2026 .pz-dept-swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }

  body.pryzm-2026 .pz-promo {
    margin: 14px 8px 0;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  body.pryzm-2026 .pz-promo .ds-row { display: flex; align-items: center; gap: 10px; }
  body.pryzm-2026 .pz-promo .ds-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 3px rgba(47, 125, 91, 0.18);
    flex: none;
  }
  body.pryzm-2026 .pz-promo .ds-t { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  body.pryzm-2026 .pz-promo .ds-s { font-size: 11.5px; color: var(--muted); }
  body.pryzm-2026 .pz-promo .ds-divider { height: 1px; background: var(--hairline); }
  body.pryzm-2026 .pz-promo-cta {
    height: 30px;
    border-radius: 8px;
    background: var(--ink);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border: none;
    cursor: pointer;
  }

  body.pryzm-2026 .pz-user-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 8px 4px;
    margin-top: auto;
    border-top: 1px solid var(--border);
  }
  body.pryzm-2026 .pz-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--rose-tint);
    color: var(--rose-deep);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    flex: none;
  }
  body.pryzm-2026 .pz-user-name { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  body.pryzm-2026 .pz-user-mail { font-size: 11px; color: var(--muted); }

  body.pryzm-2026 .pz-shell-toggle {
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    color: var(--muted-2);
    cursor: pointer;
    border-radius: 7px;
    display: inline-grid;
    place-items: center;
    position: absolute;
    top: 6px;
    right: 8px;
    z-index: 5;
  }
  body.pryzm-2026 .pz-shell-toggle:hover { color: var(--ink-2); background: rgba(0, 0, 0, 0.04); }

  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-nav-item .label,
  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-nav-title,
  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-nav-sub-title,
  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-dept-item,
  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-promo,
  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-user-name,
  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-user-mail { display: none !important; }
  body.pryzm-2026 .pz-shell.left-collapsed .pz-aside .pz-nav-item { justify-content: center; padding: 11px 0; }
}
```

- [ ] **Step 3.2: Extend `uiStore.ts` to track right-rail collapse**

Read the existing `frontend-v2/src/stores/uiStore.ts`. Add `rightRailCollapsed: boolean` and `toggleRightRail: () => void` actions alongside the existing `sidebarCollapsed`/`toggleSidebar`. Persist in localStorage if the store already does so for `sidebarCollapsed`; otherwise add a basic in-memory state. Concretely add these two state slots:

```ts
interface UiState {
  // ... existing fields
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  rightRailCollapsed: boolean;
  toggleRightRail: () => void;
}
```

with the corresponding initial values (`false`) and toggles. Do not touch unrelated state.

- [ ] **Step 3.3: Implement `SidebarDeptList.tsx`**

```tsx
const departments = [
  { name: 'Pricing & Analytics', color: '#7c66dc' },
  { name: 'Sales',               color: '#d97757' },
  { name: 'Operations',          color: '#3a8a5e' },
];

export function SidebarDeptList() {
  return (
    <>
      <div className="pz-nav-sub-title">
        <span>Departments</span>
        <button type="button" aria-label="Add department" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>+</button>
      </div>
      {departments.map((d) => (
        <div key={d.name} className="pz-dept-item">
          <span className="pz-dept-swatch" style={{ background: d.color }} />
          {d.name}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 3.4: Implement `SidebarDataStatus.tsx`**

```tsx
export function SidebarDataStatus() {
  return (
    <div className="pz-promo">
      <div className="ds-row">
        <span className="ds-dot" />
        <div>
          <div className="ds-t">Data fresh</div>
          <div className="ds-s">Last sync 8 min ago</div>
        </div>
      </div>
      <div className="ds-divider" />
      <div className="ds-row">
        <div>
          <div className="ds-t">My saved views</div>
          <div className="ds-s">3 · Margin watch, BKAES, Renewals</div>
        </div>
      </div>
      <button type="button" className="pz-promo-cta">Open saved views</button>
    </div>
  );
}
```

- [ ] **Step 3.5: Implement `SidebarUserCard.tsx`**

```tsx
import { LogOut } from 'lucide-react';

export function SidebarUserCard() {
  return (
    <div className="pz-user-row">
      <div className="pz-avatar">FK</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pz-user-name">Frank Keller</div>
        <div className="pz-user-mail">frank@scherzinger.de</div>
      </div>
      <button type="button" aria-label="Logout" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
        <LogOut size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3.6: Replace `Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom';
import { Activity, BarChart3, Brain, ClipboardList, LineChart, Menu, Settings, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/stores/uiStore';
import { SidebarDeptList } from './SidebarDeptList';
import { SidebarDataStatus } from './SidebarDataStatus';
import { SidebarUserCard } from './SidebarUserCard';

const items = [
  { to: '/action-center', icon: Activity,       key: 'actionCenter' },
  { to: '/forecasting',   icon: LineChart,      key: 'forecasting' },
  { to: '/pricing',       icon: Sparkles,       key: 'pricing' },
  { to: '/margin',        icon: BarChart3,      key: 'margin' },
  { to: '/quotes',        icon: ClipboardList,  key: 'quotes' },
  { to: '/ai',            icon: Brain,          key: 'ai' },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside className="pz-aside">
      <button type="button" className="pz-shell-toggle" aria-label="Toggle sidebar" onClick={toggle}>
        <Menu size={16} />
      </button>
      <div>
        <div className="pz-nav-title">Workspace</div>
        {items.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'pz-nav-item active' : 'pz-nav-item')}
          >
            <Icon className="ico" size={16} />
            <span className="label">{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'pz-nav-item active' : 'pz-nav-item')}>
          <Settings className="ico" size={16} />
          <span className="label">Settings</span>
        </NavLink>
      </div>
      <div className="pz-nav-divider" />
      <SidebarDeptList />
      <SidebarDataStatus />
      <SidebarUserCard />
    </aside>
  );
}
```

The `/settings` route does not yet exist; the link is dressing for fidelity. If router strict-mode warns, leave it — Phase 7 will add the route.

- [ ] **Step 3.7: Test — `Sidebar.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/app/layout/Sidebar';

describe('Sidebar', () => {
  it('renders Workspace label, six nav items, Departments, Data fresh, and user card', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Action Center/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Forecast/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pricing Studio/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Margin/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quotes/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /AI/ })).toBeInTheDocument();
    expect(screen.getByText('Departments')).toBeInTheDocument();
    expect(screen.getByText('Data fresh')).toBeInTheDocument();
    expect(screen.getByText('Frank Keller')).toBeInTheDocument();
  });
});
```

The exact `nav.*` translation keys must already exist in `frontend-v2/src/i18n/`. Confirm via `grep "actionCenter" frontend-v2/src/i18n/`. If labels mismatch the regex in the test, adjust the regex to the actual rendered text.

- [ ] **Step 3.8: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/app/layout/ frontend-v2/src/stores/uiStore.ts frontend-v2/src/styles/globals.css frontend-v2/src/tests/shell/Sidebar.test.tsx
git commit -m "feat(v2): Phase 2.5 part 3 — Sidebar with Workspace, nav, Departments, Data status, user card"
```

---

## Task 4: Right rail — notifications, reviewers, sections + `useShell()` mock

**Files:**
- Create: `frontend-v2/src/types/shell.ts`
- Create: `frontend-v2/src/data/mocks/shell.json`
- Create: `frontend-v2/src/data/api/useShell.ts`
- Create: `frontend-v2/src/app/layout/RightRail.tsx`
- Modify: `frontend-v2/src/styles/globals.css` — rail classes
- Test: `frontend-v2/src/tests/shell/RightRail.test.tsx`

- [ ] **Step 4.1: Add rail styles to `globals.css`**

```css
@layer base {
  body.pryzm-2026 .pz-rail-card {
    background: var(--surface);
    border-radius: 14px;
    box-shadow: var(--shadow-card);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  body.pryzm-2026 .pz-rail-card.pad { padding: 14px 16px; }

  body.pryzm-2026 .pz-rail-h {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  body.pryzm-2026 .pz-rail-h h3 {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    margin: 0;
  }
  body.pryzm-2026 .pz-rail-h .sub {
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 2px;
  }

  body.pryzm-2026 .pz-notif {
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    align-items: flex-start;
    cursor: pointer;
    transition: background 0.15s;
  }
  body.pryzm-2026 .pz-notif:hover { background: var(--surface-soft); }
  body.pryzm-2026 .pz-notif.unread { background: var(--rose-bg); }
  body.pryzm-2026 .pz-notif-ic {
    width: 28px; height: 28px;
    border-radius: 8px;
    display: grid; place-items: center;
    flex: none;
  }
  body.pryzm-2026 .pz-notif-ic.ok { background: var(--green-bg); color: var(--green); }
  body.pryzm-2026 .pz-notif-ic.info { background: var(--rose-bg); color: var(--rose-deep); }
  body.pryzm-2026 .pz-notif-ic.warn { background: var(--amber-bg); color: var(--amber); }
  body.pryzm-2026 .pz-notif-title { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  body.pryzm-2026 .pz-notif-sub { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
  body.pryzm-2026 .pz-notif-arr { color: var(--muted-2); font-size: 14px; align-self: center; }

  body.pryzm-2026 .pz-notif-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--hairline);
    padding-top: 10px;
    margin-top: 4px;
  }
  body.pryzm-2026 .pz-notif-foot .see {
    background: transparent; border: none; cursor: pointer;
    color: var(--rose-deep); font-size: 12px; font-weight: 600;
  }

  body.pryzm-2026 .pz-avatars { display: flex; gap: -4px; }
  body.pryzm-2026 .pz-avatars .a {
    width: 30px; height: 30px; border-radius: 50%;
    display: grid; place-items: center;
    font-size: 11px; font-weight: 700;
    color: var(--ink);
    border: 2px solid var(--surface);
    margin-left: -6px;
  }
  body.pryzm-2026 .pz-avatars .a:first-child { margin-left: 0; }
  body.pryzm-2026 .pz-avatars .a.r { background: var(--surface-sunken); color: var(--ink-3); }

  body.pryzm-2026 .pz-sec-list { display: flex; flex-direction: column; gap: 2px; }
  body.pryzm-2026 .pz-sec-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px;
    border-radius: 8px;
    text-decoration: none;
    color: var(--ink-2);
    cursor: pointer;
    transition: background 0.15s;
  }
  body.pryzm-2026 .pz-sec-row:hover { background: var(--surface-soft); }
  body.pryzm-2026 .pz-sec-row .t { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  body.pryzm-2026 .pz-sec-row .s { font-size: 11px; color: var(--muted); margin-top: 1px; }
  body.pryzm-2026 .pz-sec-row .pz-sec-arr { color: var(--muted-2); font-size: 14px; }

  body.pryzm-2026 .pz-shell.right-collapsed .pz-rail .pz-rail-card { display: none; }
}
```

- [ ] **Step 4.2: Create `src/types/shell.ts`**

```ts
export type NotifTone = 'ok' | 'info' | 'warn';

export interface ShellNotification {
  id: string;
  tone: NotifTone;
  title: string;
  sub: string;
  unread: boolean;
}

export interface ShellReviewer {
  id: string;
  initials: string;
  bg: string;
}

export interface ShellSection {
  id: string;       // anchor id used by the active feature page
  title: string;
  sub: string;
  href: string;     // "#sec-movable" — RightRail scrolls main to that anchor
}

export interface ShellRailData {
  notifications: ShellNotification[];
  reviewers: { panelLabel: string; people: ShellReviewer[]; extraCount: number };
  sections: ShellSection[];
}
```

- [ ] **Step 4.3: Create `src/data/mocks/shell.json`**

```json
{
  "notifications": [
    { "id": "pro",     "tone": "ok",   "title": "PRO mode activated",        "sub": "All premium features unlocked · just now",        "unread": true },
    { "id": "sku",     "tone": "info", "title": "New SKU recommendation",    "sub": "Article 205418-A entered A/B · 2h ago",            "unread": true },
    { "id": "phase",   "tone": "warn", "title": "Phase deadline soon",       "sub": "Initial review ends in 2 days",                     "unread": false }
  ],
  "reviewers": {
    "panelLabel": "Cross-functional pricing panel",
    "people": [
      { "id": "hm", "initials": "HM", "bg": "#cdb6f0" },
      { "id": "th", "initials": "TH", "bg": "#f4cdb1" },
      { "id": "fk", "initials": "FK", "bg": "#dcd1c4" },
      { "id": "nb", "initials": "NB", "bg": "#bdd9c5" }
    ],
    "extraCount": 5
  },
  "sections": [
    { "id": "sec-movable",   "title": "Movable revenue",     "sub": "~62% · €3.88M",       "href": "#sec-movable" },
    { "id": "sec-decisions", "title": "Today's decisions",   "sub": "3 ranked actions",     "href": "#sec-decisions" },
    { "id": "sec-trust",     "title": "Model trust",         "sub": "4 KPIs",               "href": "#sec-trust" },
    { "id": "sec-lost",      "title": "Lost-quote analysis", "sub": "+1.8pp differential",  "href": "#sec-lost" },
    { "id": "sec-sku",       "title": "SKU pricing engine",  "sub": "1,015 SKUs",           "href": "#sec-sku" }
  ]
}
```

- [ ] **Step 4.4: Implement `useShell.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { ShellRailData } from '@/types/shell';

export function useShell() {
  return useQuery({
    queryKey: ['shell'] as const,
    queryFn: () => apiFetch<ShellRailData>('/shell'),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 4.5: Implement `RightRail.tsx`**

```tsx
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Menu, Plus } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useShell } from '@/data/api/useShell';
import type { NotifTone } from '@/types/shell';

const ToneIcon = ({ tone }: { tone: NotifTone }) => {
  if (tone === 'ok')   return <CheckCircle2 size={14} />;
  if (tone === 'warn') return <AlertTriangle size={14} />;
  return <Activity size={14} />;
};

export function RightRail() {
  const toggle = useUiStore((s) => s.toggleRightRail);
  const { data, isLoading } = useShell();

  if (isLoading || !data) return <aside className="pz-rail" aria-busy="true" />;

  return (
    <aside className="pz-rail">
      <button type="button" className="pz-shell-toggle" aria-label="Toggle right rail" onClick={toggle} style={{ left: 8, right: 'auto' }}>
        <Menu size={16} />
      </button>

      <div className="pz-rail-card">
        {data.notifications.map((n) => (
          <button type="button" key={n.id} className={`pz-notif${n.unread ? ' unread' : ''}`}>
            <span className={`pz-notif-ic ${n.tone}`}><ToneIcon tone={n.tone} /></span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <span className="pz-notif-title">{n.title}</span>
              <span className="pz-notif-sub" style={{ display: 'block' }}>{n.sub}</span>
            </span>
            <span className="pz-notif-arr" aria-hidden>↗</span>
          </button>
        ))}
        <div className="pz-notif-foot">
          <button type="button" className="see">See all notifications →</button>
        </div>
      </div>

      <div className="pz-rail-card pad">
        <div className="pz-rail-h">
          <div>
            <h3>Assigned reviewers</h3>
            <div className="sub">{data.reviewers.panelLabel}</div>
          </div>
          <button type="button" aria-label="Open reviewers panel" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-2)' }}>
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="pz-avatars">
          {data.reviewers.people.map((p) => (
            <div key={p.id} className="a" style={{ background: p.bg }}>{p.initials}</div>
          ))}
          {data.reviewers.extraCount > 0 && <div className="a r">+{data.reviewers.extraCount}</div>}
        </div>
      </div>

      <div className="pz-rail-card pad">
        <div className="pz-rail-h">
          <h3>Sections</h3>
          <button type="button" aria-label="Add section" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
            <Plus size={11} /> Add
          </button>
        </div>
        <div className="pz-sec-list">
          {data.sections.map((s) => (
            <a key={s.id} className="pz-sec-row" href={s.href}>
              <div>
                <div className="t">{s.title}</div>
                <div className="s">{s.sub}</div>
              </div>
              <span className="pz-sec-arr" aria-hidden>→</span>
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4.6: Test — `RightRail.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RightRail } from '@/app/layout/RightRail';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RightRail', () => {
  it('renders notifications, reviewers panel, and sections list from useShell()', async () => {
    render(withProviders(<RightRail />));
    await waitFor(() => expect(screen.getByText('PRO mode activated')).toBeInTheDocument());
    expect(screen.getByText('New SKU recommendation')).toBeInTheDocument();
    expect(screen.getByText('Phase deadline soon')).toBeInTheDocument();
    expect(screen.getByText('Assigned reviewers')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Movable revenue')).toBeInTheDocument();
    expect(screen.getByText('Lost-quote analysis')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.7: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/app/layout/RightRail.tsx frontend-v2/src/data/api/useShell.ts frontend-v2/src/data/mocks/shell.json frontend-v2/src/types/shell.ts frontend-v2/src/styles/globals.css frontend-v2/src/tests/shell/RightRail.test.tsx
git commit -m "feat(v2): Phase 2.5 part 4 — RightRail with notifications, reviewers, sections + useShell() mock"
```

---

## Task 5: Shell composition — three-pane grid + collapse

**Files:**
- Replace: `frontend-v2/src/app/layout/Shell.tsx`
- Test: `frontend-v2/src/tests/shell/Shell.test.tsx`

- [ ] **Step 5.1: Replace `Shell.tsx`**

```tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { RightRail } from './RightRail';
import { useUiStore } from '@/stores/uiStore';

export function Shell() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const rightRailCollapsed = useUiStore((s) => s.rightRailCollapsed);

  const shellClass = [
    'pz-shell',
    sidebarCollapsed ? 'left-collapsed' : '',
    rightRailCollapsed ? 'right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="pz-app">
      <TopBar />
      <div className={shellClass}>
        <Sidebar />
        <main className="pz-main">
          <Outlet />
        </main>
        <RightRail />
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Test — `Shell.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Shell } from '@/app/layout/Shell';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/some']}>
        <Routes>
          <Route element={ui as React.ReactElement}>
            <Route path="/some" element={<div>Outlet content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Shell', () => {
  it('mounts TopBar, Sidebar, Outlet, and RightRail together', async () => {
    render(withProviders(<Shell />));
    await waitFor(() => expect(screen.getByText('PRO mode activated')).toBeInTheDocument());
    expect(screen.getByLabelText('Pryzm')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Outlet content')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.3: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/app/layout/Shell.tsx frontend-v2/src/tests/shell/Shell.test.tsx
git commit -m "feat(v2): Phase 2.5 part 5 — Shell three-pane grid (sidebar/main/rail) with collapse states"
```

---

## Task 6: Chart palette sweep + visual audit

**Files:**
- Create: `frontend-v2/src/lib/chartColors.ts`
- Modify: every Recharts consumer to import from `chartColors`:
  - `frontend-v2/src/features/action-center/components/MovableHero.tsx` (or wherever the green hero line is — locate via `grep -r "stroke=\"var(--green" frontend-v2/src/features/action-center/`)
  - `frontend-v2/src/features/margin-cockpit/components/WaterfallCard.tsx`
  - `frontend-v2/src/features/margin-cockpit/components/CostVsPriceCard.tsx`
- Audit: capture screenshots; confirm parity by eye

- [ ] **Step 6.1: Create `chartColors.ts`**

```ts
/**
 * Single source of truth for Recharts series color decisions.
 * Resolves CSS variables once at import time so SVG rendering uses real
 * hex values (Recharts cannot consume `var(--rose)` directly).
 *
 * If tokens change, this module re-resolves on next module load (HMR).
 */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export const chart = {
  rose:      () => token('--rose',      '#5a7da3'),
  roseDeep:  () => token('--rose-deep', '#3e5d80'),
  roseBg:    () => token('--rose-bg',   '#edf3f9'),
  green:     () => token('--green',     '#2f7d5b'),
  greenBg:   () => token('--green-bg',  '#e3efe6'),
  amber:     () => token('--amber',     '#a5701f'),
  red:       () => token('--red',       '#9a3232'),
  ink:       () => token('--ink',       '#101418'),
  ink3:      () => token('--ink-3',     '#4a5360'),
  muted:     () => token('--muted',     '#7d8693'),
  hairline:  () => token('--hairline',  '#eaedf1'),
} as const;
```

- [ ] **Step 6.2: Sweep `MovableHero` (Action Center hero chart) — replace bright green line with rose**

Locate the file by grep:
```bash
grep -rn 'stroke="var(--green' frontend-v2/src/features/action-center/
```
In every match (typically `<Line stroke="var(--green)" .../>` or `<Area stroke=... fill=...>`), replace `var(--green)` with `var(--rose)` and any `var(--green-bg)` fill with `var(--rose-bg)`. The hero is the bright revenue line in the screenshot.

If a chart is genuinely a "good direction" chart (e.g. recovery sparkline in CostVsPriceCard), KEEP it green. Don't sweep blindly — be intentional: hero accent line = rose; "we're recovering money" sparkline = green.

- [ ] **Step 6.3: Sweep `WaterfallCard` chart**

`frontend-v2/src/features/margin-cockpit/components/WaterfallCard.tsx`. The endpoint bars use `var(--green)` and the loss bars use `var(--rose)` — those mappings are correct semantically and need no swap. Only verify; no edit unless you find a hardcoded color outside the token set.

- [ ] **Step 6.4: Sweep `CostVsPriceCard`**

`frontend-v2/src/features/margin-cockpit/components/CostVsPriceCard.tsx`. The cost line is rose (correct), the price line is ink (correct), the recovery sparkline is rose-on-rose-bg (the Phase 2 review intentionally chose rose; under the new palette `--rose: #5a7da3` is steel-blue and reads as a neutral accent — keep). No edit.

- [ ] **Step 6.5: Verify build still works**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck && npm run lint && npm test && npm run build
```

All four green; tests still 15+3 (= 18 total: 15 from Phase 2 + 3 new from Phase 2.5).

- [ ] **Step 6.6: Capture audit screenshots and compare**

Boot the dev server (already running from earlier sessions; otherwise `npm run dev` from `frontend-v2/`). Open in your local browser at the port Vite reports. For each of `/action-center` and `/margin`, take a 1440×900 viewport screenshot.

Open `Pryzm_Dashboard_Mockup_Frank.html` (served via the existing `python3 -m http.server 8765` from earlier) at the same width with `body.pryzm-2026` activated (`document.body.classList.add('pryzm-2026')` in the console, then `setScreen('action')` and `setScreen('margin')`).

Place the four screenshots in `audit-screens/phase-2-5/` and eyeball the diff:

- App canvas color (warm grey, not white)?
- Rounded shell container with inset highlight?
- Top bar matches: logo / search pill / add-person / notifications-with-dot / more / persona / EN / date / Create?
- Sidebar matches: Workspace label / 6 nav items + Settings / Departments + 3 swatches / Data fresh card / user card?
- Right rail matches: 3 notifications / reviewers card / sections list?
- Hero accent on Action Center is steel-rose, not bright green?
- Margin Cockpit cards have correct shadow + warm backgrounds?

If anything is wrong, log it as a Phase 2.5 follow-up issue in the commit message; do not fix in this commit.

- [ ] **Step 6.7: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/lib/chartColors.ts frontend-v2/src/features/action-center/
git commit -m "feat(v2): Phase 2.5 part 6 — chart palette sweep (Action Center hero accent → steel-rose)"
```

If no Action Center file actually changed (because the hero might already use `--rose`), still create the `chartColors.ts` helper for Phase 3 reuse and commit just that file.

---

## Self-review notes

- **Spec coverage:** Tokens (T1), Manrope+Inter (T1), top utility bar with all 8 controls (T2), sidebar with Workspace/Nav/Departments/Data fresh/user card (T3), right rail with notifications/reviewers/sections via mock-driven hook (T4), three-pane grid with collapse (T5), chart palette sweep + audit (T6).
- **No placeholders:** every step contains real code; commands are exact; no "TBD" or "implement later".
- **Type consistency:** `ShellRailData` shape used in `useShell()` matches `RightRail.tsx` consumption. `useUiStore` extension uses the existing `sidebarCollapsed`/`toggleSidebar` pattern.
- **DRY:** Tone palettes from Phase 2 are not refactored here (out of scope); a Phase 7 polish ticket already exists. Chart colors get a new helper because Recharts SVG cannot consume CSS variables, so resolution at runtime is required.
- **YAGNI:** No real notifications backend, no working "Add person" / "Settings" flows, no language switcher logic — all buttons are dressing for fidelity. The mock-driven `useShell()` only exists so Phase 8 has a clean swap point. Right-rail collapse persistence to localStorage matches the existing `sidebarCollapsed` pattern, but only if that pattern is already in `uiStore.ts`; otherwise both stay in-memory until a future polish ticket.
- **Risk:** the chart-color helper relies on `getComputedStyle(document.documentElement)` returning the resolved CSS variable. Vitest jsdom may return an empty string for custom properties; the `fallback` argument exists for this reason. Tests should not assert on chart colors — only on rendered text.
