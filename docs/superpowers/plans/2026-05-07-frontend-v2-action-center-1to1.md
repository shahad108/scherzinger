# Action Center 1:1 Mockup Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the v2 Action Center page to a pixel-faithful 1:1 visual match with `Pryzm_Dashboard_Mockup_Frank.html` — sidebar theme, hero card, bucket cards, decision cards (especially button radii, paddings, and the rank/tool/signal-with-trend layout).

**Architecture:** Targeted CSS/JSX edits in `frontend-v2/`. We do not refactor structure; we change radii, paddings, colors, sizes, and a handful of component compositions to match the mockup CSS verbatim. After every task, take a Playwright screenshot of `localhost:5174/action-center` and compare visually against the mockup served at `localhost:8765/Pryzm_Dashboard_Mockup_Frank.html` (Frank persona, Action Center tab) to confirm the delta is closed before moving on.

**Tech Stack:** React 19 + Vite 7 + Tailwind 4 (utility classes inline) + token-driven CSS at `frontend-v2/src/styles/{tokens.css,globals.css}` + Lucide icons + Playwright (already wired) for visual verification.

**Reference points (mockup line numbers in `Pryzm_Dashboard_Mockup_Frank.html`):**
- Tokens: `1550–1568`
- Shell layout: `1578–1647`
- Topbar: `1649–1711`
- Sidebar (`aside`): `1713–1800`
- Hero card (`hero-card`, `hero-headline`, `hero-split`, `btn-primary`): `1869–1988`
- Round (bucket) cards (`round-card`, `tag-chip`, `avatars`, `btn-act`): `1991–2042`
- Action card structure (`action-card`, `ac-section`, `ac-rank`, `ac-tools`, `ac-meta-grid`, `signal-with-trend`, `fbtn`, `btn-secondary`, `btn-primary-rose`, `ac-cta-row`): `2059–2257`
- Decision card markup template: `7577–7702`

**Verification convention:** After each task, run:
```bash
# refresh both pages then snapshot v2
curl -s -o /dev/null http://localhost:5174/action-center
```
and use Playwright (already configured) to take a 1440×900 viewport PNG of `http://localhost:5174/action-center`. Save to `audit-screens/parity/<task-N>-v2.png`. Open it and the mockup screenshot side-by-side and confirm the section under change matches.

---

### Task 1: Sidebar — active pill = steel-rose, sizes match mockup

**Why this is first:** It's the highest-visibility delta. Mockup's active "Action Center" pill is a steel-rose filled rectangle with white text+icon and a glow shadow. v2 currently shows a white card with dark text. This single change shifts the perceived theme the most.

**Files:**
- Modify: `frontend-v2/src/styles/globals.css:284-304` (the `.pz-nav-item` rules)
- Modify: `frontend-v2/src/styles/globals.css:265-282` (the `.pz-nav-title` and `.pz-nav-divider` rules)

**Spec from mockup `1714–1736`:**
```
nav-title:    font-size:13px; color:var(--ink); font-weight:600; padding:6px 14px 14px;
              letter-spacing:-0.01em; text-transform:none; (NOT uppercase)
nav-item:     padding:11px 14px; border-radius:12px; gap:12px;
              font-size:13.5px; font-weight:500; color:var(--ink-2);
nav-item .ico: width:18px; height:18px; color:var(--muted);
nav-item:hover: background:rgba(0,0,0,.035);
nav-item.active: background:var(--rose); color:#fff; font-weight:600;
                 box-shadow: 0 6px 16px -8px rgba(90,125,163,.55), 0 1px 0 rgba(0,0,0,.04);
nav-item.active .ico: color:#fff;
nav-divider: margin:14px 8px;
```

- [ ] **Step 1: Replace the `.pz-nav-title` rule**

In `frontend-v2/src/styles/globals.css`, find:
```css
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
```

Split into two separate rules and replace with:
```css
  body.pryzm-2026 .pz-nav-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
    text-transform: none;
    padding: 6px 14px 14px;
    background: transparent;
  }
  body.pryzm-2026 .pz-nav-sub-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--muted);
    font-weight: 500;
    padding: 6px 14px 8px;
    text-transform: none;
    letter-spacing: 0;
  }
```

- [ ] **Step 2: Replace the `.pz-nav-divider` rule**

Find:
```css
  body.pryzm-2026 .pz-nav-divider {
    height: 1px;
    background: var(--border);
    margin: 10px 8px;
  }
```

Replace `margin: 10px 8px` with `margin: 14px 8px`.

- [ ] **Step 3: Replace the `.pz-nav-item` rules (sizes, paddings, active state)**

Find:
```css
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
```

Replace with:
```css
  body.pryzm-2026 .pz-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    border-radius: 12px;
    font-size: 13.5px;
    color: var(--ink-2);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    border: none;
    background: transparent;
    transition: background 0.15s ease, color 0.15s ease;
  }
  body.pryzm-2026 .pz-nav-item:hover { background: rgba(0, 0, 0, 0.035); }
  body.pryzm-2026 .pz-nav-item:hover .ico { color: var(--ink-2); }
  body.pryzm-2026 .pz-nav-item.active {
    background: var(--rose);
    color: #fff;
    font-weight: 600;
    box-shadow: 0 6px 16px -8px rgba(90, 125, 163, 0.55), 0 1px 0 rgba(0, 0, 0, 0.04);
  }
  body.pryzm-2026 .pz-nav-item .ico {
    width: 18px;
    height: 18px;
    flex: none;
    color: var(--muted);
    transition: color 0.15s;
  }
  body.pryzm-2026 .pz-nav-item.active .ico { color: #fff; }
```

- [ ] **Step 4: Bump Lucide icon `size` to 18 in Sidebar.tsx**

In `frontend-v2/src/app/layout/Sidebar.tsx`, change both occurrences of `size={16}` (one in the `items.map` block, one on the `Settings` link) to `size={18}`.

- [ ] **Step 5: Verify with Playwright**

Run dev server (already running at 5174) and the mockup server (already at 8765 from research). Take a 1440×900 screenshot of `http://localhost:5174/action-center`. Read the PNG and confirm the sidebar's active "Action Center" item is now a **steel-rose filled pill** with **white text and white icon**, sized roughly the same as the mockup's pill.

- [ ] **Step 6: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/styles/globals.css frontend-v2/src/app/layout/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(v2): sidebar active = steel-rose filled pill, 1:1 with mockup spec

- pz-nav-item active: white card → var(--rose) bg, white text/icon, glow shadow
- pz-nav-item radius 10→12px, padding 9/12→11/14, gap 10→12, font 13→13.5
- ico 16→18px, color ink-3→muted, active color → #fff
- Sidebar.tsx: Lucide size 16→18
- nav-title non-uppercase 13px ink-bold; nav-divider margin 10→14

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Sidebar — sub-title, departments, promo card, user row

**Files:**
- Modify: `frontend-v2/src/styles/globals.css:306-373` (dept-item, promo, promo-cta, user-row, avatar)
- Modify: `frontend-v2/src/app/layout/SidebarDeptList.tsx` (sub-title text and "+" button)
- Modify: `frontend-v2/src/app/layout/SidebarUserCard.tsx` (avatar gradient + sizes)

**Spec from mockup `1737–1800`:**
```
nav-sub-title .add: 20×20, border-radius:6px, bg rgba(0,0,0,.05), color ink-2, font 13px
dept-item:    padding:9px 14px; border-radius:10px; font-size:13px; color ink-2; gap:10px
dept-swatch:  14×14; border-radius:4px; inset shadow rgba(0,0,0,.06)
promo:        margin:14px 8px 0; bg surface; border 1px var(--border); border-radius:18px;
              padding:14px; gap:12px;
data-status .ds-dot: 8×8; .ds-dot.ok: var(--green) with 0 0 0 3px rgba(47,125,91,.18) glow
data-status .ds-t: 12.5px 600 ink; .ds-s: 11px muted
promo-cta:    bg #101418; color #fff; border-radius:11px; padding:11px 14px;
              font-size:12.5px 600; (NO size shrinkage — current v2 is 30px tall)
user-row:     margin:14px 8px 0; padding:14px 6px 0; border-top:1px solid var(--border)
user-row .avatar: 36×36; border-radius:50%;
              background:linear-gradient(135deg,#d6c8c8,#b89090); color #5a3838;
              inset shadow 0 0 0 1px rgba(0,0,0,.05); font 12px 700
user-row .user-name: 13px 600 ink; .user-mail: 11.5px muted
user-row .logout: 30×30, radius:8px, color muted, hover bg rgba(0,0,0,.05)
```

- [ ] **Step 1: Replace `.pz-dept-item` and `.pz-dept-swatch` rules**

In `frontend-v2/src/styles/globals.css`, find:
```css
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
```

Replace with:
```css
  body.pryzm-2026 .pz-dept-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--ink-2);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  body.pryzm-2026 .pz-dept-item:hover { background: rgba(0, 0, 0, 0.035); }
  body.pryzm-2026 .pz-dept-swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    flex: none;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
  }
```

- [ ] **Step 2: Replace `.pz-promo` block (radius, padding, ds-dot glow, divider, cta)**

In `frontend-v2/src/styles/globals.css`, find the `.pz-promo` block (lines 319–350) and replace with:
```css
  body.pryzm-2026 .pz-promo {
    margin: 14px 8px 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  body.pryzm-2026 .pz-promo .ds-meta { flex: 1; min-width: 0; }
  body.pryzm-2026 .pz-promo .ds-t { font-size: 12.5px; font-weight: 600; color: var(--ink); line-height: 1.3; }
  body.pryzm-2026 .pz-promo .ds-s { font-size: 11px; color: var(--muted); margin-top: 2px; line-height: 1.4; }
  body.pryzm-2026 .pz-promo .ds-divider { height: 1px; background: var(--hairline); margin: 2px -2px; }
  body.pryzm-2026 .pz-promo-cta {
    background: #101418;
    color: #fff;
    border-radius: 11px;
    padding: 11px 14px;
    font-size: 12.5px;
    font-weight: 600;
    text-align: center;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }
  body.pryzm-2026 .pz-promo-cta:hover { background: #252a33; }
```

- [ ] **Step 3: Replace `.pz-user-row` and `.pz-avatar` rules**

In `frontend-v2/src/styles/globals.css`, find the `.pz-user-row`/`.pz-avatar`/`.pz-user-name`/`.pz-user-mail` rules and replace with:
```css
  body.pryzm-2026 .pz-user-row {
    margin: 14px 8px 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 6px 0;
    border-top: 1px solid var(--border);
  }
  body.pryzm-2026 .pz-user-row .pz-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #d6c8c8, #b89090);
    color: #5a3838;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 12px;
    flex: none;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  }
  body.pryzm-2026 .pz-user-name { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.2; }
  body.pryzm-2026 .pz-user-mail {
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
  }
  body.pryzm-2026 .pz-user-logout {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    color: var(--muted);
    display: grid;
    place-items: center;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  body.pryzm-2026 .pz-user-logout:hover { background: rgba(0, 0, 0, 0.05); color: var(--ink-2); }
```

- [ ] **Step 4: Update `SidebarUserCard.tsx` to use `pz-user-logout` class**

Open `frontend-v2/src/app/layout/SidebarUserCard.tsx`. Find the logout button JSX. If it currently uses inline tailwind classes, change its `className` to `pz-user-logout`. The avatar div (the `FK` initials box) should keep its `pz-avatar` class — the new CSS rule will style it.

If `SidebarUserCard.tsx` does not currently render the avatar with `className="pz-avatar"`, change it. The avatar element should be:
```tsx
<div className="pz-avatar">FK</div>
```

- [ ] **Step 5: Update `SidebarDeptList.tsx` to render the `+` button**

Open `frontend-v2/src/app/layout/SidebarDeptList.tsx`. Verify the sub-title contains a `+` button. If missing, add it. The section header should be:
```tsx
<div className="pz-nav-sub-title">
  <span>Departments</span>
  <button type="button" aria-label="Add department" className="pz-nav-add">+</button>
</div>
```

- [ ] **Step 6: Add the `.pz-nav-add` rule**

In `frontend-v2/src/styles/globals.css`, append after the `.pz-nav-sub-title` rule from Task 1:
```css
  body.pryzm-2026 .pz-nav-add {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.05);
    color: var(--ink-2);
    font-size: 13px;
    line-height: 1;
    display: grid;
    place-items: center;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }
  body.pryzm-2026 .pz-nav-add:hover { background: rgba(0, 0, 0, 0.08); }
```

- [ ] **Step 7: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npm run typecheck
cd /Users/dharmendersingh/Documents/Scherzinger_new && git add frontend-v2/src/styles/globals.css frontend-v2/src/app/layout/SidebarDeptList.tsx frontend-v2/src/app/layout/SidebarUserCard.tsx && git commit -m "$(cat <<'EOF'
feat(v2): sidebar dept list, promo card, user row 1:1 with mockup

- dept-item radius 8→10, padding 7/12→9/14, font 12.5→13, color ink-3→ink-2
- dept-swatch 10→14px square, radius 3→4px, inset hairline shadow
- promo radius 14→18, gap 10→12, padding standardised
- promo-cta 30px→auto height, radius 8→11, padding 11/14, font-size 12→12.5
- user-row 36×36 avatar with rose gradient (d6c8c8→b89090) + 5a3838 text
- user-name 12.5→13, user-mail 11→11.5 with ellipsis at 140px
- nav-sub-title sub-pill "+" button (20×20 r6 ink-2 on rgba(0,0,0,.05))

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Hero card — radius, asymmetric padding, delta = rounded RECTANGLE, CTA radius 8px

**Files:**
- Modify: `frontend-v2/src/features/action-center/components/MovableHero.tsx`

**Spec from mockup `1869–1964`:**
```
hero-card:        bg surface; border 1px var(--border); border-radius: var(--r-md) = 14px;
                  padding: 24px 28px 22px;
hero-headline .num: 56px 700, letter-spacing -0.035em, color ink, tabular-nums
hero-headline .delta: green-bg pill, padding:5px 10px, border-radius:7px (NOT 999)
                      font-size:13px 600 green
hero-grid:        grid-template-columns: minmax(0,1fr) 320px; gap:32px;
btn-primary:      bg var(--ink); color #fff; border:none; border-radius:8px;
                  padding:9px 14px; font-size:12.5px 600; gap:6px
btn-primary svg:  11×11
hero-bar:         height:6px; border-radius:4px; bg surface-soft;
                  seg-mov: var(--rose); flex:0 0 62%
                  seg-lock: var(--ink-3); opacity .35; flex:1
```

- [ ] **Step 1: Change card radius and padding**

In `frontend-v2/src/features/action-center/components/MovableHero.tsx`, find the wrapper `motion.div` (around line 35):
```tsx
className="mb-6 rounded-2xl border border-[var(--hairline)] bg-white p-7 shadow-[var(--shadow-card)]"
```

Replace with:
```tsx
className="mb-6 rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)]"
style={{ padding: '24px 28px 22px' }}
```
(Tailwind has no perfect 24/28/22 utility set — inline `style` is fine here. Border switches from `--hairline` to `--border` to match mockup.)

- [ ] **Step 2: Change delta chip from rounded-full to rounded-[7px] rectangle**

Find the `<span>` that wraps the `+9.2% vs Wk 17` chip (around line 56):
```tsx
className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold tabular-nums"
```

Replace with:
```tsx
className="inline-flex items-center gap-1.5 rounded-[7px] text-[13px] font-semibold tabular-nums"
style={{ background: 'var(--green-bg)', color: 'var(--green)', padding: '5px 10px', letterSpacing: '-0.005em' }}
```

Remove the previous inline `style={{ background: ..., color: ... }}` (it's merged into the new style above).

- [ ] **Step 3: Change "Open repricing queue" button to radius 8px and tighter padding**

Find the dark button (around line 130):
```tsx
className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors"
```

Replace with:
```tsx
className="inline-flex items-center gap-1.5 rounded-lg text-[12.5px] font-semibold text-white shadow-sm transition-colors"
style={{ background: 'var(--ink)', padding: '9px 14px' }}
```
(`rounded-lg` is 8px in default Tailwind 4 config. Inline padding for the exact 9px/14px from mockup.)

Remove the `style={{ background: 'var(--ink)' }}` from the original (merged above) and update the `onMouseEnter`/`onMouseLeave` handlers to remain — they read/write `e.currentTarget.style.background`.

The arrow `svg` inside is already 11×11, matches mockup.

- [ ] **Step 4: Confirm hero-bar segments use exact mockup proportions**

Find the bar (around line 121):
```tsx
<div className="mt-4 flex h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
  <div style={{ width: `${movablePct}%`, background: 'var(--rose)' }} />
  <div className="flex-1" style={{ background: 'var(--ink-3)', opacity: 0.35 }} />
</div>
```

Replace with:
```tsx
<div className="mt-3.5 flex h-1.5 overflow-hidden rounded bg-[var(--surface-soft)]">
  <div style={{ width: `${movablePct}%`, background: 'var(--rose)' }} />
  <div className="flex-1" style={{ background: 'var(--ink-3)', opacity: 0.35 }} />
</div>
```
(`h-1.5` = 6px to match mockup; `rounded` = 4px to match mockup `border-radius:4px`; `mt-3.5` = 14px to match.)

- [ ] **Step 5: Verify and commit**

Run typecheck (`cd frontend-v2 && npm run typecheck`). Take a screenshot at 1440×900 and visually confirm the hero now: (a) is slightly less round, (b) the green delta chip is a rounded RECTANGLE not a pill, (c) the dark "Open repricing queue" button has a tighter 8px corner radius matching the mockup.

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new && git add frontend-v2/src/features/action-center/components/MovableHero.tsx && git commit -m "$(cat <<'EOF'
feat(v2): hero card 1:1 — 14px radius, asymmetric padding, delta rectangle, CTA r8

- Card rounded-2xl→[14px], padding 28px→24/28/22 asymmetric, border var hairline→border
- "+9.2% vs Wk 17" chip rounded-full→[7px] rectangle, font 12→13, padding 4/8→5/10
- "Open repricing queue" CTA rounded-xl→lg(8px), font 13→12.5, padding 8/16→9/14
- hero-bar height 8→6px, radius full→[4px], mt 16→14

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Bucket cards — 14px radius, tag-chip rectangles, 30px avatars, btn-act 11px/36px

**Files:**
- Modify: `frontend-v2/src/features/action-center/components/BucketGrid.tsx`

**Spec from mockup `1991–2042`:**
```
round-card: bg surface; border 1px var(--border); border-radius: var(--r-md) = 14px;
            padding: 18px 20px 16px; box-shadow var(--shadow-card);
            display flex; flex-direction column; gap 12px;
round-card h3:    19px 700, letter-spacing -0.014em, line-height 1.2
round-card .sub:  muted 12.5px, margin-top 5px
tag-chip:         bg surface-sunken; border-radius:7px; padding:5px 9px; font 11.5px 500 ink-2
tag-chip.status:  pseudo ::before dot 6×6 var(--green) (NO bg, NO icon)
tag-chip.status.amber::before { background: var(--amber); }
tag-chip.dark:    bg #101418; color #fff
avatars .a:       30×30; radius:50%; border:2.5px solid #fff; font 11px 600 ink-2;
                  bg surface-sunken; margin-right:-9px (overlap LEFT-style not -space-x)
avatars .a.r:     bg var(--rose) (NOT rose-deep!); color #fff; font 11px 700; z-index 2
btn-act:          bg #101418; color #fff; border-radius:11px; height:36px;
                  padding:0 16px; gap:12px; font 12.5px 500 (NOT semibold);
                  box-shadow 0 1px 0 rgba(0,0,0,.06); border:none
btn-act:hover:    bg #252a33
```

- [ ] **Step 1: Replace card wrapper classes**

In `frontend-v2/src/features/action-center/components/BucketGrid.tsx`, find:
```tsx
className="rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-md)]"
```

Replace with:
```tsx
className="rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
style={{ padding: '18px 20px 16px' }}
```

- [ ] **Step 2: Bump heading + subtitle sizes**

Find the heading block:
```tsx
<div className="mb-3">
  <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
    {b.title}
  </h3>
  <div className="mt-1 text-xs text-[var(--muted)]">{b.subtitle}</div>
</div>
```

Replace with:
```tsx
<div>
  <h3 className="font-display text-[19px] font-bold leading-tight tracking-[-0.014em] text-[var(--ink)]">
    {b.title}
  </h3>
  <div className="mt-1 text-[12.5px] text-[var(--muted)]">{b.subtitle}</div>
</div>
```

- [ ] **Step 3: Replace the tag-chip Badge call with native chip**

Find the tag-chip row:
```tsx
<div className="mb-4 flex flex-wrap gap-1.5">
  {b.tags.map((t) => (
    <Badge key={t.label} tone={toneToBadge(t.tone)}>
      {t.label}
    </Badge>
  ))}
</div>
```

Replace with:
```tsx
<div className="flex flex-wrap items-center gap-1.5">
  {b.tags.map((t) => {
    const isStatus = t.tone === 'info' || t.tone === 'warning';
    const dotColor =
      t.tone === 'warning' ? 'var(--amber)'
      : t.tone === 'info' ? 'var(--green)'
      : null;
    return (
      <span
        key={t.label}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] text-[11.5px] font-medium text-[var(--ink-2)]"
        style={{ background: 'var(--surface-sunken)', padding: '5px 9px' }}
      >
        {isStatus && dotColor && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: dotColor }}
          />
        )}
        {t.label}
      </span>
    );
  })}
</div>
```

Also remove the now-unused imports: delete `import { Badge }` line, delete the `toneToBadge` helper, and remove `Tone` from the type-only import if no longer used. Run typecheck to confirm.

- [ ] **Step 4: Replace the avatar row block**

Find:
```tsx
<div className="flex -space-x-2">
  {b.avatars.map((a, i) => (
    <div
      key={a + i}
      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold ${
        a.startsWith('+')
          ? 'bg-[var(--rose-deep)] text-white'
          : `${avatarColors[i % avatarColors.length]} text-[var(--ink-2)]`
      }`}
    >
      {a}
    </div>
  ))}
</div>
```

Replace with:
```tsx
<div className="flex items-center">
  {b.avatars.map((a, i) => {
    const isExtra = a.startsWith('+');
    return (
      <div
        key={a + i}
        className="grid h-[30px] w-[30px] place-items-center rounded-full text-[11px] font-semibold"
        style={{
          background: isExtra ? 'var(--rose)' : 'var(--surface-sunken)',
          color: isExtra ? '#fff' : 'var(--ink-2)',
          border: '2.5px solid #fff',
          marginLeft: i === 0 ? 0 : '-9px',
          fontWeight: isExtra ? 700 : 600,
          zIndex: isExtra ? 2 : 1,
          boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
        }}
      >
        {a}
      </div>
    );
  })}
</div>
```

Delete the `avatarColors` constant at the top of the file — it's no longer used.

- [ ] **Step 5: Replace the CTA button with btn-act spec**

Find:
```tsx
<button
  type="button"
  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white transition-colors"
  style={{ background: 'var(--ink)' }}
  onMouseEnter={(e) => (e.currentTarget.style.background = '#000')}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ink)')}
>
  {b.cta}
  <ArrowRight size={12} />
</button>
```

Replace with:
```tsx
<button
  type="button"
  className="inline-flex items-center text-[12.5px] font-medium text-white transition-colors"
  style={{
    background: '#101418',
    height: 36,
    padding: '0 16px',
    borderRadius: 11,
    gap: 12,
    boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
    border: 'none',
  }}
  onMouseEnter={(e) => (e.currentTarget.style.background = '#252a33')}
  onMouseLeave={(e) => (e.currentTarget.style.background = '#101418')}
>
  {b.cta}
  <ArrowRight size={14} />
</button>
```

- [ ] **Step 6: Add a top-level flex column wrapper (round-card had gap:12px)**

The mockup `round-card` has `display:flex; flex-direction:column; gap:12px`. Add this to the wrapper:

Update the outer `<div>` from Step 1 — append `flex flex-col gap-3` to its className. Final classes:
```tsx
className="flex flex-col gap-3 rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
style={{ padding: '18px 20px 16px' }}
```

Also update the foot row to push CTA right with `mt-auto`:
```tsx
<div className="mt-auto flex items-center justify-between">
```
(Replace the existing `<div className="flex items-center justify-between">` at the bottom of the card.)

- [ ] **Step 7: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npm run typecheck && npm run test -- --run
cd /Users/dharmendersingh/Documents/Scherzinger_new && git add frontend-v2/src/features/action-center/components/BucketGrid.tsx && git commit -m "$(cat <<'EOF'
feat(v2): bucket cards 1:1 — 14px radius, sunken-bg avatars, btn-act 36/r11

- Card rounded-2xl→[14px], padding 20→18/20/16, border hairline→border, hover lift
- h3 15→19px, sub 12→12.5; column flex-col gap-3 to push CTA to bottom
- tag-chip: native span r7 surface-sunken bg, status dots 6px in green/amber
- Avatars 28→30px, border 2→2.5px, overlap -8→-9, all "non-+" use surface-sunken
- "+5/+3" chip steel-rose (var(--rose)) NOT rose-deep, white text z-2
- CTA: rounded-xl→[11px], py-2→h-36, font-semibold→medium, gap 8→12, ink→#101418

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Decision card — 14px radius, rank 34×34 sunken, ac-tools 32×32 sunken, signal-with-trend single panel

**Files:**
- Modify: `frontend-v2/src/features/action-center/components/DecisionCards.tsx`

**Spec from mockup `2061–2174`:**
```
action-card:    bg surface; border 1px var(--border); border-radius:14px;
                box-shadow var(--shadow-card); overflow:visible
ac-section:     padding:18px 22px; ac-section + ac-section: border-top 1px var(--hairline)
ac-rank:        34×34; border-radius:10px; bg var(--surface-sunken);
                color var(--ink-2); font-size 13px 700 (NOT white-on-ink!)
ac-title .h:    15.5px 700 ink, letter-spacing -0.012em, line-height 1.3
ac-title .t:    12px muted, margin-top 3px
ac-tools .b:    32×32; border-radius:9px; bg var(--surface-sunken);
                color var(--ink-2); always-on (NOT hover-only)
ac-tools .b svg: 13×13
grip:           32×32; radius:9px; bg surface-sunken; color muted
ac-meta-grid:   4-col grid, gap:14px, NO container background
meta-block .lab: 10.5px muted 600 uppercase letterspacing .06em margin-bottom 6px
meta-block .val: 13.5px ink 600
select-pill:    bg surface; border 1px var(--border); border-radius:10px;
                padding:8px 12px; font 12.5px 500 ink
input-pill:     same shell; padding:8px 10px; font 13px 600 ink; .unit chip 10.5px sunken
signal-with-trend: 1fr / 200px (NOT 220), bg var(--surface-soft);
                   border 1px var(--hairline); border-radius:11px; overflow:hidden;
                   margin-top:14px
.signal-pane:   padding:14px 18px
.trend-pane:    padding:14px 16px; border-left 1px hairline;
                bg rgba(0,0,0,.012); justify-content space-between
.signal-pane .ttl: 12.5px 700 ink with .ttl-sub 11.5px muted
fact-row:       grid 130px / 1fr; gap 14px; padding 9px 0;
                border-top 1px rgba(0,0,0,.05); first-child no border, no top pad
fact-l:         10.5px muted 600 uppercase tracking .06em
fact-v:         13.5px ink 700 tabular; .red ⇒ var(--red); .green ⇒ var(--green)
fact-s:         11.5px muted, margin-top 2px
trend-pane .lab:10.5px muted uppercase tracking .06em 600
trend-pane .v:  font-display Manrope 32px 700 letter-spacing -0.025em (NOT 26px!)
trend-pane .v .down: 12px 600 var(--red), margin-left 6px
```

- [ ] **Step 1: Change card wrapper to 14px radius and remove `overflow-hidden`**

In `frontend-v2/src/features/action-center/components/DecisionCards.tsx`, find the `motion.div` for each decision card (around line 202):
```tsx
className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
```

Replace with:
```tsx
className="rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
```
(Remove `overflow-hidden`. The dropdown popover for the Accept menu needs to be visible outside the card.)

- [ ] **Step 2: Replace top section padding to 18px / 22px**

Find the top `<div className="px-5 pt-4 pb-4">` (the wrapper containing the rank+title+tools+chips). Replace with:
```tsx
<div style={{ padding: '18px 22px' }}>
```

- [ ] **Step 3: Replace rank badge — 34×34 sunken bg ink-2 text**

Find:
```tsx
<div
  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[13px] font-bold text-white"
  style={{ background: 'var(--ink)' }}
>
  {d.rank}
</div>
```

Replace with:
```tsx
<div
  className="grid shrink-0 place-items-center font-display text-[13px] font-bold"
  style={{
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'var(--surface-sunken)',
    color: 'var(--ink-2)',
  }}
>
  {d.rank}
</div>
```

- [ ] **Step 4: Replace ac-tools `<button>` styling — always-on 32×32 sunken**

Find the snooze + more buttons + grip span (around line 221–230). Replace the whole block with:
```tsx
<div className="flex items-center" style={{ gap: 6 }}>
  <button
    type="button"
    aria-label="Snooze"
    className="grid place-items-center"
    style={{
      width: 32,
      height: 32,
      borderRadius: 9,
      background: 'var(--surface-sunken)',
      color: 'var(--ink-2)',
      border: 'none',
      cursor: 'pointer',
    }}
  >
    <Clock size={13} />
  </button>
  <button
    type="button"
    aria-label="More"
    className="grid place-items-center"
    style={{
      width: 32,
      height: 32,
      borderRadius: 9,
      background: 'var(--surface-sunken)',
      color: 'var(--ink-2)',
      border: 'none',
      cursor: 'pointer',
    }}
  >
    <MoreHorizontal size={13} />
  </button>
  <span
    aria-hidden
    className="grid place-items-center"
    style={{
      width: 32,
      height: 32,
      borderRadius: 9,
      background: 'var(--surface-sunken)',
      color: 'var(--muted)',
      cursor: 'grab',
    }}
  >
    <GripVertical size={14} />
  </span>
</div>
```

- [ ] **Step 5: Bump headline size to 15.5px**

In the title div, find:
```tsx
<div className="text-[15px] font-bold leading-tight tracking-[-0.012em] text-[var(--ink)]">
  {d.headline ?? d.title}
</div>
```

Replace with:
```tsx
<div className="text-[15.5px] font-bold leading-[1.3] tracking-[-0.012em] text-[var(--ink)]">
  {d.headline ?? d.title}
</div>
```

- [ ] **Step 6: Adjust the middle `border-t` section padding**

Find:
```tsx
<div className="border-t border-[var(--hairline)] px-5 py-4">
```

Replace with:
```tsx
<div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
```

- [ ] **Step 7: Merge "Why now" + trend into one `signal-with-trend` panel**

Find the block:
```tsx
{(d.facts || d.trend) && (
  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-3">
      <div className="mb-2 text-[12px]">
        <b className="font-bold text-[var(--ink)]">Why now</b>
        <span className="ml-1 text-[var(--muted)]">— top signals driving this recommendation</span>
      </div>
      <div className="flex flex-col">
        {(d.facts ?? []).map((f, j) => <FactRow key={j} fact={f} />)}
      </div>
    </div>
    {d.trend && (
      <div className="rounded-xl border border-[var(--hairline)] bg-white px-4 py-3">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">{d.trend.label}</div>
        <div className="mt-1 font-display text-[26px] font-bold leading-none tabular-nums text-[var(--ink)]">
          {d.trend.value}
          <span className="ml-2 text-[12px] font-semibold" style={{ color: 'var(--red)' }}>{d.trend.delta}</span>
        </div>
        <MiniSpark trend={d.trend} />
      </div>
    )}
  </div>
)}
```

Replace with:
```tsx
{(d.facts || d.trend) && (
  <div
    className="mt-4 grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_200px]"
    style={{
      background: 'var(--surface-soft)',
      border: '1px solid var(--hairline)',
      borderRadius: 11,
    }}
  >
    <div style={{ padding: '14px 18px' }}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2 text-[12.5px] font-bold leading-tight tracking-[-0.005em] text-[var(--ink)]">
        <b>Why now</b>
        <span className="text-[11.5px] font-medium text-[var(--muted)]">— top signals driving this recommendation</span>
      </div>
      <div className="flex flex-col">
        {(d.facts ?? []).map((f, j) => <FactRow key={j} fact={f} />)}
      </div>
    </div>
    {d.trend && (
      <div
        className="flex flex-col justify-between gap-2"
        style={{
          padding: '14px 16px',
          borderLeft: '1px solid var(--hairline)',
          background: 'rgba(0,0,0,0.012)',
        }}
      >
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{d.trend.label}</div>
        <div className="font-display text-[32px] font-bold leading-[1.05] tracking-[-0.025em] tabular-nums text-[var(--ink)]">
          {d.trend.value}
          <span className="ml-1.5 text-[12px] font-semibold" style={{ color: 'var(--red)' }}>{d.trend.delta}</span>
        </div>
        <MiniSpark trend={d.trend} />
      </div>
    )}
  </div>
)}
```

- [ ] **Step 8: Update FactRow to use mockup typography**

Find the `FactRow` function (around line 83). Replace its return statement with:
```tsx
return (
  <div
    className="grid grid-cols-[130px_minmax(0,1fr)] items-baseline gap-3.5 first:border-t-0 first:pt-0 last:pb-0"
    style={{ padding: '9px 0', borderTop: '1px solid rgba(0,0,0,0.05)' }}
  >
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] leading-[1.4] text-[var(--muted)]">{fact.label}</div>
    <div className="min-w-0">
      <div
        className="text-[13.5px] font-bold leading-[1.35] tracking-[-0.005em] tabular-nums"
        style={{ color: valueColor }}
      >
        {fact.value}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-[1.4] text-[var(--muted)]">{fact.detail}</div>
    </div>
  </div>
);
```
(Lab column 130px instead of 140px, font-size 10.5/13.5/11.5 to match mockup.)

- [ ] **Step 9: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npm run typecheck && npm run test -- --run
cd /Users/dharmendersingh/Documents/Scherzinger_new && git add frontend-v2/src/features/action-center/components/DecisionCards.tsx && git commit -m "$(cat <<'EOF'
feat(v2): decision card structure 1:1 — rank/tools sunken, signal+trend one panel

- Card rounded-2xl→[14px], removed overflow-hidden so popover can escape
- Section padding standardised to 18/22 (was 20/16)
- Rank badge 32×32 ink-filled white → 34×34 surface-sunken ink-2 text (mockup spec)
- ac-tools buttons 32×32 hover-only → always-on surface-sunken r9, ink-2/muted text
- Headline 15→15.5, line-height tightened to 1.3
- Why-now + trend: 2 separate cards → ONE signal-with-trend panel, surface-soft bg,
  hairline border r11, 1fr/200px grid, hairline divider via border-left on trend pane
- Trend value 26→32px Manrope, lab uppercase tracking, delta 12px red
- FactRow lab col 140→130px, font sizes 10.5/13.5/11.5 per mockup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Decision card buttons — feedback row + ac-cta-row 50/50 in one section

**Files:**
- Modify: `frontend-v2/src/features/action-center/components/DecisionCards.tsx`

**Spec from mockup `2176–2257`:**
```
ac-feedback:        flex wrap; gap 8px; align-items center
fbtn:               bg surface; border 1px var(--border); border-radius:10px;
                    padding:8px 12px; font 12.5px 500 ink-2
fbtn .ic:           13×13
fbtn.selected:      color #fff; border-color transparent; font-weight 600
fbtn.acc.selected:  bg var(--green)
fbtn.rej.selected:  bg var(--red)
fbtn.ab.selected:   bg var(--violet)
fbtn.acc-main (split): always green-filled, white text, 600
fbtn.split-arr:     border-left:none; padding:8px 9px; svg 11×11 muted
                    OR (when selected) inherits acc colors
ac-cta-row:         flex; gap 10px; margin-top 14px (NOT a separate section)
btn-secondary:      flex:1; bg surface; border 1px var(--border); border-radius:12px;
                    padding:11px 18px; font 13px 500 ink; gap 8px
btn-primary-rose:   flex:1; bg var(--rose); color #fff; border 1px var(--rose);
                    border-radius:12px; padding:11px 18px; font 13px 600;
                    box-shadow 0 1px 0 rgba(0,0,0,.06)
btn-primary-rose:hover: bg var(--rose-deep); shadow 0 6px 16px -8px rgba(90,125,163,.55)
```

- [ ] **Step 1: Update fbtn base style (rounded-lg = 10px, padding 8/12)**

In the `FeedbackRow` function, find:
```tsx
const baseFbtn = 'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition-colors';
```

Replace with:
```tsx
const baseFbtn = 'inline-flex items-center gap-1.5 rounded-[10px] border text-[12.5px] font-medium transition-colors';
```
(Spec says `font-weight 500` for unselected, `600` for selected. Inline `style` already toggles to white text + transparent border on selected; we'll set the font-weight in the `style` object below.)

- [ ] **Step 2: Add explicit padding + font-weight to each style object**

Replace the three `accStyle`, `rejStyle`, `abStyle` blocks:
```tsx
const accStyle: React.CSSProperties = accSelected
  ? { background: 'var(--green)', borderColor: 'transparent', color: '#fff', padding: '8px 12px', fontWeight: 600 }
  : { background: '#fff', borderColor: 'var(--border)', color: 'var(--ink-2)', padding: '8px 12px', fontWeight: 500 };

const rejStyle: React.CSSProperties = act === 'rej'
  ? { background: 'var(--red)', borderColor: 'transparent', color: '#fff', padding: '8px 12px', fontWeight: 600 }
  : { background: '#fff', borderColor: 'var(--border)', color: 'var(--ink-2)', padding: '8px 12px', fontWeight: 500 };

const abStyle: React.CSSProperties = act === 'ab'
  ? { background: 'var(--violet)', borderColor: 'transparent', color: '#fff', padding: '8px 12px', fontWeight: 600 }
  : { background: '#fff', borderColor: 'var(--border)', color: 'var(--ink-2)', padding: '8px 12px', fontWeight: 500 };
```
(Mockup default state has `color: var(--ink-2)` and `border: var(--border)` — NOT colored borders. The selection determines color. We earlier shipped colored-by-default; this reverts to mockup behavior. The split-button "Accept" remains green-filled because it's `acc-main`, applied via `accStyle` while `accSelected` is true.)

- [ ] **Step 3: Tighten the split-arrow padding to mockup spec**

Find:
```tsx
className={`${baseFbtn} rounded-l-none border-l-0 px-2`}
```

Replace with:
```tsx
className={`${baseFbtn} rounded-l-none border-l-0`}
style={{ ...accStyle, padding: '8px 9px' }}
```

(The arrow chevron's padding is 8px / 9px per mockup.)

- [ ] **Step 4: Move the bottom "Insert From Library / Open in Studio" CTA INTO the feedback section, kill the separate grid**

Find the JSX block at the bottom of each decision card (around line 301–326):
```tsx
{/* Bottom section: feedback row */}
<div className="border-t border-[var(--hairline)] px-5 py-4">
  <FeedbackRow id={d.rank} />
</div>
{/* CTA row: secondary on left, big primary rose on the right */}
<div className="grid grid-cols-1 gap-0 border-t border-[var(--hairline)] sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
  <div className="flex items-center px-5 py-3">
    {d.secondaryCta && (
      <button
        type="button"
        className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-[12.5px] font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-soft)]"
      >
        {d.secondaryCta}
      </button>
    )}
  </div>
  <button
    type="button"
    className="flex w-full items-center justify-center gap-2 rounded-bl-2xl rounded-br-2xl px-5 py-4 text-[14px] font-semibold text-white transition-colors sm:rounded-bl-none"
    style={{ background: 'var(--rose)' }}
    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--rose-deep)')}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--rose)')}
  >
    {d.primaryCta ?? d.cta}
  </button>
</div>
```

Replace with a SINGLE bottom section containing both rows:
```tsx
{/* Bottom section: feedback row + CTA row, SAME ac-section */}
<div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
  <FeedbackRow id={d.rank} />
  <div className="mt-3.5 flex items-stretch" style={{ gap: 10 }}>
    {d.secondaryCta && (
      <button
        type="button"
        className="inline-flex flex-1 items-center justify-center gap-2 text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)]"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '11px 18px',
          cursor: 'pointer',
        }}
      >
        {d.secondaryCta}
      </button>
    )}
    <button
      type="button"
      className="inline-flex flex-1 items-center justify-center gap-2 text-[13px] font-semibold text-white transition-colors"
      style={{
        background: 'var(--rose)',
        border: '1px solid var(--rose)',
        borderRadius: 12,
        padding: '11px 18px',
        boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--rose-deep)';
        e.currentTarget.style.boxShadow = '0 6px 16px -8px rgba(90,125,163,0.55)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--rose)';
        e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.06)';
      }}
    >
      {d.primaryCta ?? d.cta}
    </button>
  </div>
</div>
```

- [ ] **Step 5: Verify and commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npm run typecheck && npm run test -- --run
cd /Users/dharmendersingh/Documents/Scherzinger_new && git add frontend-v2/src/features/action-center/components/DecisionCards.tsx && git commit -m "$(cat <<'EOF'
feat(v2): decision card buttons 1:1 — fbtn r10 8/12, cta-row 50/50 in same section

- fbtn padding 14/8 → 8/12, radius lg→[10px], default border var(--border) ink-2 text
- Selected colors via inline style only (green/red/violet) per mockup
- Split arrow padding 8→9, retains acc-style during selection
- "Insert From Library" + "Open in Studio →" moved INTO feedback section,
  no longer a full-width sticky-bottom row; gap 10, both flex:1 (50/50),
  radius 12, padding 11/18, font 13, rose→rose-deep with glow shadow on hover

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final visual verification + parity report

**Files (no code change — verification only):**
- New: `audit-screens/parity/comparison.md` (a 1-page log of before/after screenshots)

- [ ] **Step 1: Take after-screenshots of v2**

With both servers running (mockup at `http://localhost:8765/Pryzm_Dashboard_Mockup_Frank.html`, v2 at `http://localhost:5174/action-center`), use Playwright to take fresh full-page screenshots:

```
mcp__plugin_playwright_playwright__browser_resize(1440, 900)
mcp__plugin_playwright_playwright__browser_navigate("http://localhost:5174/action-center")
mcp__plugin_playwright_playwright__browser_take_screenshot(filename="audit-screens/parity/v2-after-full.png", fullPage=true)
mcp__plugin_playwright_playwright__browser_take_screenshot(filename="audit-screens/parity/v2-after-vp.png", fullPage=false)
mcp__plugin_playwright_playwright__browser_navigate("http://localhost:8765/Pryzm_Dashboard_Mockup_Frank.html")
mcp__plugin_playwright_playwright__browser_take_screenshot(filename="audit-screens/parity/mockup-full.png", fullPage=true)
mcp__plugin_playwright_playwright__browser_take_screenshot(filename="audit-screens/parity/mockup-vp.png", fullPage=false)
```

- [ ] **Step 2: Read both viewport PNGs side-by-side**

Read `audit-screens/parity/v2-after-vp.png` and `audit-screens/parity/mockup-vp.png` with the `Read` tool. Visually confirm parity for each region:
- Sidebar: active pill is steel-rose, icons are 18px, "Workspace"/"Departments" are non-uppercase
- Hero: 14px corners, asymmetric padding, green delta is a rounded RECTANGLE (7px), dark "Open repricing queue" CTA has tight 8px corners
- Buckets: 14px corners, tag-chips are r7 sunken pills with status dots, avatars are 30px with -9 overlap and "+5" is steel-rose, dark "View SKUs →" CTA is r11 36-tall with gap-12
- Decision card: rank is 34px sunken (NOT dark), tools are 32px sunken always-on, "Why now" + trend share ONE surface-soft panel with hairline divider, trend value is 32px Manrope
- Feedback row: white-with-default-text buttons, only selected = colored fill; bottom CTA row is 50/50 r12 with steel-rose Open in Studio

- [ ] **Step 3: Run full test suite + lint + build**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npm run typecheck && npm run lint && npm run test -- --run && npm run build
```

Expected: typecheck passes, lint clean, all tests pass, production build succeeds.

- [ ] **Step 4: Final commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new && git add audit-screens/parity/ && git commit -m "$(cat <<'EOF'
chore(v2): record parity screenshots after Action Center 1:1 sweep

Playwright-captured viewport + full-page snapshots of v2 vs mockup at 1440×900.
Use these as the ground-truth references when reviewing future Action Center
visual changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| User pain point | Task that addresses it |
|---|---|
| "buttons not rounded rectangle" (radii too round) | Task 3 (hero CTA r12→r8), Task 4 (bucket CTA r12→r11), Task 6 (fbtn r12→r10, ac-cta r12 confirmed) |
| "customer's profile" wrong | Task 2 (user-row 36×36 rose-gradient avatar, name/mail typography) |
| "the lock and the margins" | Task 5 (decision card structure: rank 34×34 sunken, signal+trend single panel, trend value Manrope 32px), Task 4 (bucket "Locked bucket" tag-chip-status-amber with dot) |
| "shape of the button, size of the buttons" | Task 3 (hero CTA), Task 4 (bucket btn-act 36-tall r11 medium-weight), Task 6 (fbtn 8/12, ac-cta 11/18 r12) |
| "the green buttons" | Task 6 (fbtn.acc.selected → solid green, default → white-with-default-text NOT green-text) |
| "chart colors" | Hero spark already steel-rose `#5a7da3`; trend pane mini-chart in Task 5 keeps steel-rose stroke + 18% gradient fill (already correct) |
| "icons on the sidebar" | Task 1 (size 16→18, color muted not ink-3, white when active) |
| "background colors, the grayish colors" | Task 4 (avatars + tag-chips switch to var(--surface-sunken) #e7eaef) |

**Placeholder scan:** No "TBD"/"adjust as needed" — every step shows the exact replacement code or class string.

**Type consistency:** No new type signatures introduced. CSS rules and class names in tasks 1–2 use the existing `pz-` prefix; no rename. The `BucketGrid` step removes the unused `Tone` import — the build will catch any remaining reference. The `FeedbackRow` styles keep the same `ActState` type.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-07-frontend-v2-action-center-1to1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each task has a focused scope (one file or two closely-related files), so subagents will have low context and can verify quickly.

**2. Inline Execution** — Execute tasks in this session, batching with checkpoints for review.

Which approach?
