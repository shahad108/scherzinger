# Frontend v2 — Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `frontend-v2/` project — Vite+React+TS app shell, design tokens, layout, routing skeleton, mock data layer, base UI/Fiori primitives, Zustand stores, i18n, demo build — with green typecheck/lint/test/build, ready for Phase 1 (Action Center).

**Architecture:** Greenfield React 19 + Vite 7 + TypeScript strict app at `frontend-v2/`, parallel to existing `frontend/`. Tailwind 4 with CSS-var design tokens (Pryzm 2026). React Router v7 routes for all 6 Frank features rendering placeholder pages. TanStack Query reads from JSON mocks via a single fetcher. Zustand for client UI state. shadcn-style copy-in primitives over Radix. SAP Fiori-derived layout components live alongside generic UI.

**Tech Stack:** Vite 7, React 19, TypeScript 5, Tailwind 4, React Router 7, Zustand 5, TanStack Query 5, motion, Recharts, Radix UI, react-hook-form + zod, date-fns, lucide-react, i18next, Vitest, ESLint, Prettier.

**Reference spec:** `docs/superpowers/specs/2026-05-06-frontend-v2-rebuild-design.md`

---

## File Structure

```
frontend-v2/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts                 # dev + default build
├── vite.config.demo.ts            # outDir → ../frontend/dist-demo-v2
├── vitest.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── eslint.config.js
├── .prettierrc.json
├── index.html
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx
    ├── app/
    │   ├── App.tsx
    │   ├── router.tsx
    │   ├── providers.tsx
    │   └── layout/
    │       ├── Shell.tsx
    │       ├── Sidebar.tsx
    │       ├── TopBar.tsx
    │       └── PersonaSwitcher.tsx
    ├── features/
    │   ├── action-center/index.tsx
    │   ├── margin-cockpit/index.tsx
    │   ├── quotes/index.tsx
    │   ├── forecasting/index.tsx
    │   ├── pricing-studio/index.tsx
    │   └── ai-briefing/index.tsx
    ├── components/
    │   ├── ui/
    │   │   ├── Button.tsx
    │   │   ├── Card.tsx
    │   │   ├── Badge.tsx
    │   │   ├── Tabs.tsx
    │   │   ├── Drawer.tsx
    │   │   ├── Dialog.tsx
    │   │   ├── Tooltip.tsx
    │   │   └── Separator.tsx
    │   └── fiori/
    │       ├── KpiTile.tsx
    │       ├── ObjectStatus.tsx
    │       └── MessageStrip.tsx
    ├── stores/
    │   ├── uiStore.ts
    │   └── personaStore.ts
    ├── hooks/
    │   ├── useDensity.ts
    │   └── usePersona.ts
    ├── lib/
    │   ├── cn.ts
    │   ├── format.ts
    │   └── api/
    │       ├── client.ts
    │       └── queryKeys.ts
    ├── data/
    │   ├── mocks/
    │   │   └── action-center.json
    │   └── api/
    │       └── useActionCards.ts
    ├── types/
    │   └── index.ts
    ├── i18n/
    │   ├── index.ts
    │   ├── de.json
    │   └── en.json
    ├── styles/
    │   ├── tokens.css
    │   └── globals.css
    └── tests/
        └── smoke.test.tsx
```

---

## Task 1: Scaffold project + install deps

**Files:**
- Create: `frontend-v2/package.json`
- Create: `frontend-v2/.gitignore`
- Create: `frontend-v2/.npmrc`

- [ ] **Step 1: Create directory and package.json**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
mkdir -p frontend-v2
cd frontend-v2
```

Write `frontend-v2/package.json`:

```json
{
  "name": "scherzinger-frontend-v2",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:demo": "tsc -b && vite build --config vite.config.demo.ts",
    "preview": "vite preview",
    "preview:demo": "vite preview --config vite.config.demo.ts",
    "lint": "eslint .",
    "format": "prettier --write \"src/**/*.{ts,tsx,css,json}\"",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-tabs": "^1.1.3",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@tanstack/react-query": "^5.62.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "i18next": "^24.2.2",
    "i18next-browser-languagedetector": "^8.0.4",
    "lucide-react": "^0.576.0",
    "motion": "^12.34.4",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.54.2",
    "react-i18next": "^15.4.0",
    "react-router-dom": "^7.13.1",
    "recharts": "^3.7.0",
    "tailwind-merge": "^3.5.0",
    "zod": "^3.24.1",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@tailwindcss/postcss": "^4.2.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^22.10.5",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "@vitest/ui": "^3.2.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "jsdom": "^27.0.1",
    "postcss": "^8.5.1",
    "prettier": "^3.4.2",
    "prettier-plugin-tailwindcss": "^0.6.9",
    "tailwindcss": "^4.2.1",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.20.0",
    "vite": "^7.3.1",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Add .gitignore and .npmrc**

`frontend-v2/.gitignore`:
```
node_modules
dist
dist-demo
.DS_Store
*.log
.env.local
.env
.vite
coverage
```

`frontend-v2/.npmrc`:
```
engine-strict=false
```

- [ ] **Step 3: Install**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm install
```

Expected: install completes with no errors. Warnings are OK.

- [ ] **Step 4: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/package.json frontend-v2/.gitignore frontend-v2/.npmrc frontend-v2/package-lock.json
git commit -m "chore(v2): scaffold package.json + deps"
```

---

## Task 2: TypeScript + Vite config

**Files:**
- Create: `frontend-v2/tsconfig.json`
- Create: `frontend-v2/tsconfig.app.json`
- Create: `frontend-v2/tsconfig.node.json`
- Create: `frontend-v2/vite.config.ts`
- Create: `frontend-v2/vite.config.demo.ts`
- Create: `frontend-v2/vitest.config.ts`
- Create: `frontend-v2/index.html`

- [ ] **Step 1: Write tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 2: Write tsconfig.app.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": false,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vite.config.demo.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5174, host: true },
  build: { outDir: 'dist', sourcemap: true },
});
```

- [ ] **Step 5: Write vite.config.demo.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  base: '/demo-v2/',
  build: {
    outDir: path.resolve(__dirname, '../frontend/dist-demo-v2'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
```

- [ ] **Step 6: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
  },
});
```

- [ ] **Step 7: Write index.html**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=1280, initial-scale=1" />
    <title>Pryzm — Scherzinger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Verify typecheck runs**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck
```

Expected: errors about missing `src/` files (OK — we haven't created them yet). The config itself should not error.

- [ ] **Step 9: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/tsconfig*.json frontend-v2/vite.config*.ts frontend-v2/vitest.config.ts frontend-v2/index.html
git commit -m "chore(v2): tsconfig + vite + vitest config"
```

---

## Task 3: Tailwind 4 + design tokens

**Files:**
- Create: `frontend-v2/postcss.config.js`
- Create: `frontend-v2/src/styles/tokens.css`
- Create: `frontend-v2/src/styles/globals.css`

- [ ] **Step 1: Write postcss.config.js**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: Write src/styles/tokens.css**

```css
/* Pryzm 2026 design tokens — warm gray + rose, Manrope display + Inter body */
@layer base {
  :root {
    /* Warm gray scale */
    --color-gray-50: #faf9f7;
    --color-gray-100: #f3f1ee;
    --color-gray-200: #e7e3dd;
    --color-gray-300: #d4cec5;
    --color-gray-400: #a8a195;
    --color-gray-500: #7c7468;
    --color-gray-600: #5b544a;
    --color-gray-700: #423d36;
    --color-gray-800: #2b2823;
    --color-gray-900: #1a1815;
    --color-gray-950: #0e0d0b;

    /* Rose accent */
    --color-rose-50: #fff1f2;
    --color-rose-100: #ffe4e6;
    --color-rose-200: #fecdd3;
    --color-rose-300: #fda4af;
    --color-rose-400: #fb7185;
    --color-rose-500: #e11d48;
    --color-rose-600: #be123c;
    --color-rose-700: #9f1239;
    --color-rose-800: #881337;
    --color-rose-900: #4c0519;

    /* Semantic */
    --color-success: #16a34a;
    --color-success-bg: #f0fdf4;
    --color-warning: #d97706;
    --color-warning-bg: #fffbeb;
    --color-error: #dc2626;
    --color-error-bg: #fef2f2;
    --color-info: #2563eb;
    --color-info-bg: #eff6ff;

    /* Surfaces */
    --surface-base: var(--color-gray-50);
    --surface-raised: #ffffff;
    --surface-sunken: var(--color-gray-100);
    --surface-overlay: rgba(26, 24, 21, 0.4);

    /* Text */
    --text-primary: var(--color-gray-900);
    --text-secondary: var(--color-gray-600);
    --text-muted: var(--color-gray-500);
    --text-inverse: var(--color-gray-50);

    /* Borders */
    --border-subtle: var(--color-gray-200);
    --border-default: var(--color-gray-300);
    --border-strong: var(--color-gray-400);

    /* Radii */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 10px;
    --radius-xl: 14px;
    --radius-2xl: 20px;
    --radius-pill: 9999px;

    /* Shadows */
    --shadow-1: 0 1px 2px rgba(26, 24, 21, 0.06);
    --shadow-2: 0 2px 8px rgba(26, 24, 21, 0.08);
    --shadow-3: 0 8px 24px rgba(26, 24, 21, 0.10);
    --shadow-4: 0 24px 48px rgba(26, 24, 21, 0.16);

    /* Motion */
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --duration-fast: 150ms;
    --duration-base: 220ms;
    --duration-slow: 320ms;

    /* Density (cozy default) */
    --density-row: 44px;
    --density-pad-x: 16px;
    --density-pad-y: 12px;
    --font-size-base: 14px;
  }

  [data-density='compact'] {
    --density-row: 36px;
    --density-pad-x: 12px;
    --density-pad-y: 8px;
    --font-size-base: 13px;
  }
}
```

- [ ] **Step 3: Write src/styles/globals.css**

```css
@import 'tailwindcss';
@import './tokens.css';

@theme {
  --font-display: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --font-body: 'Inter', ui-sans-serif, system-ui, sans-serif;

  --color-bg: var(--surface-base);
  --color-surface: var(--surface-raised);
  --color-text: var(--text-primary);
  --color-text-muted: var(--text-muted);
  --color-border: var(--border-subtle);
  --color-rose: var(--color-rose-500);
}

@layer base {
  html {
    font-family: var(--font-body);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    background: var(--surface-base);
    -webkit-font-smoothing: antialiased;
  }
  body {
    margin: 0;
    min-height: 100vh;
  }
  h1, h2, h3, h4, h5 {
    font-family: var(--font-display);
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }
  *:focus-visible {
    outline: 2px solid var(--color-rose-500);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  .tabular-nums { font-variant-numeric: tabular-nums; }
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/postcss.config.js frontend-v2/src/styles
git commit -m "chore(v2): tailwind 4 + design tokens"
```

---

## Task 4: ESLint + Prettier

**Files:**
- Create: `frontend-v2/eslint.config.js`
- Create: `frontend-v2/.prettierrc.json`
- Create: `frontend-v2/.prettierignore`

- [ ] **Step 1: Write eslint.config.js**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dist-demo', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 2: Write .prettierrc.json**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Write .prettierignore**

```
node_modules
dist
dist-demo
coverage
*.md
package-lock.json
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/eslint.config.js frontend-v2/.prettierrc.json frontend-v2/.prettierignore
git commit -m "chore(v2): eslint + prettier"
```

---

## Task 5: Utilities (cn, format)

**Files:**
- Create: `frontend-v2/src/lib/cn.ts`
- Create: `frontend-v2/src/lib/format.ts`

- [ ] **Step 1: Write src/lib/cn.ts**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Write src/lib/format.ts**

```ts
const eur = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const eurPrecise = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat('de-DE');

export const fmt = {
  eur: (n: number) => eur.format(n),
  eurPrecise: (n: number) => eurPrecise.format(n),
  pct: (n: number) => percent.format(n),
  num: (n: number) => number.format(n),
  signedPct: (n: number) => (n >= 0 ? '+' : '') + percent.format(n),
};
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/lib
git commit -m "feat(v2): cn helper + i18n number formatters"
```

---

## Task 6: Types

**Files:**
- Create: `frontend-v2/src/types/index.ts`

- [ ] **Step 1: Write src/types/index.ts**

```ts
export type Persona = 'frank' | 'till' | 'heiko';

export type Density = 'cozy' | 'compact';

export type Severity = 'info' | 'success' | 'warning' | 'error';

export type ObjectStatusKind = 'positive' | 'negative' | 'warning' | 'neutral';

export interface KpiDelta {
  value: number;        // signed percentage as decimal (0.12 = +12%)
  direction: 'up' | 'down' | 'flat';
  good: boolean;        // is this delta good news?
}

export interface KpiData {
  id: string;
  label: string;
  value: string;        // already-formatted display value
  raw?: number;
  delta?: KpiDelta;
  spark?: number[];
}

export interface ActionCard {
  id: string;
  type: 'churn' | 'margin' | 'opportunity' | 'risk' | 'forecast' | 'pricing';
  severity: Severity;
  title: string;
  subtitle: string;
  customer?: string;
  sku?: string;
  amount?: number;
  confidence?: number;  // 0..1
  createdAt: string;    // ISO
  recommendedAction?: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/types
git commit -m "feat(v2): shared types"
```

---

## Task 7: Zustand stores

**Files:**
- Create: `frontend-v2/src/stores/uiStore.ts`
- Create: `frontend-v2/src/stores/personaStore.ts`
- Create: `frontend-v2/src/hooks/useDensity.ts`
- Create: `frontend-v2/src/hooks/usePersona.ts`

- [ ] **Step 1: Write src/stores/uiStore.ts**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Density } from '@/types';

interface UiState {
  density: Density;
  sidebarCollapsed: boolean;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      density: 'cozy',
      sidebarCollapsed: false,
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'pryzm-v2-ui' },
  ),
);
```

- [ ] **Step 2: Write src/stores/personaStore.ts**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Persona } from '@/types';

interface PersonaState {
  persona: Persona;
  setPersona: (p: Persona) => void;
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set) => ({
      persona: 'frank',
      setPersona: (persona) => set({ persona }),
    }),
    { name: 'pryzm-v2-persona' },
  ),
);
```

- [ ] **Step 3: Write src/hooks/useDensity.ts**

```ts
import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';

export function useDensity() {
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  return { density, setDensity };
}
```

- [ ] **Step 4: Write src/hooks/usePersona.ts**

```ts
import { usePersonaStore } from '@/stores/personaStore';

export function usePersona() {
  const persona = usePersonaStore((s) => s.persona);
  const setPersona = usePersonaStore((s) => s.setPersona);
  return { persona, setPersona };
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/stores frontend-v2/src/hooks
git commit -m "feat(v2): ui + persona zustand stores"
```

---

## Task 8: i18n

**Files:**
- Create: `frontend-v2/src/i18n/de.json`
- Create: `frontend-v2/src/i18n/en.json`
- Create: `frontend-v2/src/i18n/index.ts`

- [ ] **Step 1: Write src/i18n/de.json**

```json
{
  "app": { "title": "Pryzm" },
  "nav": {
    "actionCenter": "Aktionszentrale",
    "margin": "Margen-Cockpit",
    "quotes": "Angebote",
    "forecasting": "Forecast",
    "pricing": "Preisstudio",
    "ai": "KI-Briefing"
  },
  "common": { "search": "Suchen", "filter": "Filter", "save": "Speichern", "cancel": "Abbrechen" }
}
```

- [ ] **Step 2: Write src/i18n/en.json**

```json
{
  "app": { "title": "Pryzm" },
  "nav": {
    "actionCenter": "Action Center",
    "margin": "Margin Cockpit",
    "quotes": "Quotes",
    "forecasting": "Forecasting",
    "pricing": "Pricing Studio",
    "ai": "AI Briefing"
  },
  "common": { "search": "Search", "filter": "Filter", "save": "Save", "cancel": "Cancel" }
}
```

- [ ] **Step 3: Write src/i18n/index.ts**

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import de from './de.json';
import en from './en.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de }, en: { translation: en } },
    fallbackLng: 'de',
    supportedLngs: ['de', 'en'],
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/i18n
git commit -m "feat(v2): i18n with DE+EN"
```

---

## Task 9: Base UI primitives — Button + Card + Badge + Separator

**Files:**
- Create: `frontend-v2/src/components/ui/Button.tsx`
- Create: `frontend-v2/src/components/ui/Card.tsx`
- Create: `frontend-v2/src/components/ui/Badge.tsx`
- Create: `frontend-v2/src/components/ui/Separator.tsx`

- [ ] **Step 1: Write Button.tsx**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700 shadow-[var(--shadow-1)]',
        secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 active:bg-gray-100',
        ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';
```

- [ ] **Step 2: Write Card.tsx**

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-subtle)] bg-white shadow-[var(--shadow-1)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-4 pb-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold tracking-tight', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 py-3 border-t border-[var(--border-subtle)] bg-gray-50/50', className)}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Write Badge.tsx**

```tsx
import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-gray-100 text-gray-700',
        positive: 'bg-emerald-50 text-emerald-700',
        negative: 'bg-red-50 text-red-700',
        warning: 'bg-amber-50 text-amber-800',
        info: 'bg-blue-50 text-blue-700',
        rose: 'bg-rose-50 text-rose-700',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
```

- [ ] **Step 4: Write Separator.tsx**

```tsx
import * as RadixSeparator from '@radix-ui/react-separator';
import { cn } from '@/lib/cn';

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof RadixSeparator.Root>) {
  return (
    <RadixSeparator.Root
      orientation={orientation}
      className={cn(
        'bg-[var(--border-subtle)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/components/ui
git commit -m "feat(v2): Button, Card, Badge, Separator primitives"
```

---

## Task 10: UI primitives — Tabs + Tooltip + Dialog + Drawer

**Files:**
- Create: `frontend-v2/src/components/ui/Tabs.tsx`
- Create: `frontend-v2/src/components/ui/Tooltip.tsx`
- Create: `frontend-v2/src/components/ui/Dialog.tsx`
- Create: `frontend-v2/src/components/ui/Drawer.tsx`

- [ ] **Step 1: Write Tabs.tsx**

```tsx
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'inline-flex items-center gap-1 border-b border-[var(--border-subtle)]',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'relative px-3 py-2 text-sm font-medium text-gray-600 transition-colors',
        'hover:text-gray-900',
        'data-[state=active]:text-rose-600',
        'data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-rose-500',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('pt-4', className)} {...props} />;
}
```

- [ ] **Step 2: Write Tooltip.tsx**

```tsx
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/cn';

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof RadixTooltip.Content>) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-gray-50 shadow-[var(--shadow-3)]',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          className,
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  );
}
```

- [ ] **Step 3: Write Dialog.tsx**

```tsx
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixDialog.Content>) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--surface-overlay)] data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl bg-white p-6 shadow-[var(--shadow-4)]',
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close className="absolute right-4 top-4 rounded-md p-1 text-gray-500 hover:bg-gray-100">
          <X size={16} />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Title>) {
  return (
    <RadixDialog.Title
      className={cn('text-lg font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      className={cn('mt-1 text-sm text-gray-600', className)}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Write Drawer.tsx**

```tsx
import * as RadixDialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface DrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  side?: 'right' | 'left';
  width?: number | string;
  children: React.ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  side = 'right',
  width = 480,
  children,
  className,
}: DrawerProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--surface-overlay)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild>
              <motion.aside
                className={cn(
                  'fixed top-0 z-50 h-full bg-white shadow-[var(--shadow-4)]',
                  side === 'right' ? 'right-0' : 'left-0',
                  className,
                )}
                style={{ width }}
                initial={{ x: side === 'right' ? '100%' : '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: side === 'right' ? '100%' : '-100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              >
                <RadixDialog.Close className="absolute right-4 top-4 rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                  <X size={16} />
                </RadixDialog.Close>
                {children}
              </motion.aside>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/components/ui
git commit -m "feat(v2): Tabs, Tooltip, Dialog, Drawer primitives"
```

---

## Task 11: Fiori primitives — KpiTile + ObjectStatus + MessageStrip

**Files:**
- Create: `frontend-v2/src/components/fiori/KpiTile.tsx`
- Create: `frontend-v2/src/components/fiori/ObjectStatus.tsx`
- Create: `frontend-v2/src/components/fiori/MessageStrip.tsx`

- [ ] **Step 1: Write KpiTile.tsx**

```tsx
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/format';
import type { KpiData } from '@/types';

interface KpiTileProps {
  kpi: KpiData;
  className?: string;
  onClick?: () => void;
}

export function KpiTile({ kpi, className, onClick }: KpiTileProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-white px-5 py-4 text-left',
        'shadow-[var(--shadow-1)] transition-all hover:shadow-[var(--shadow-2)]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpi.label}</div>
      <div className="text-2xl font-semibold tabular-nums text-gray-900">{kpi.value}</div>
      {kpi.delta && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            kpi.delta.good ? 'text-emerald-600' : 'text-red-600',
          )}
        >
          {kpi.delta.direction === 'up' && <ArrowUp size={12} />}
          {kpi.delta.direction === 'down' && <ArrowDown size={12} />}
          {kpi.delta.direction === 'flat' && <ArrowRight size={12} />}
          <span>{fmt.signedPct(kpi.delta.value)}</span>
        </div>
      )}
    </Wrapper>
  );
}
```

- [ ] **Step 2: Write ObjectStatus.tsx**

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ObjectStatusKind } from '@/types';

interface ObjectStatusProps {
  kind: ObjectStatusKind;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const toneMap: Record<ObjectStatusKind, string> = {
  positive: 'text-emerald-700',
  negative: 'text-red-700',
  warning: 'text-amber-800',
  neutral: 'text-gray-600',
};

export function ObjectStatus({ kind, icon, children, className }: ObjectStatusProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', toneMap[kind], className)}
    >
      {icon}
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Write MessageStrip.tsx**

```tsx
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Severity } from '@/types';

interface MessageStripProps {
  severity: Severity;
  children: ReactNode;
  closable?: boolean;
  className?: string;
}

const map = {
  info: { Icon: Info, bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  success: {
    Icon: CheckCircle2,
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  warning: {
    Icon: AlertTriangle,
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-200',
  },
  error: { Icon: XCircle, bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
} as const;

export function MessageStrip({ severity, children, closable, className }: MessageStripProps) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const { Icon, bg, text, border } = map[severity];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border px-4 py-2.5 text-sm',
        bg,
        text,
        border,
        className,
      )}
      role="status"
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {closable && (
        <button onClick={() => setOpen(false)} className="shrink-0 opacity-70 hover:opacity-100">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/components/fiori
git commit -m "feat(v2): Fiori primitives — KpiTile, ObjectStatus, MessageStrip"
```

---

## Task 12: API client + queryKeys

**Files:**
- Create: `frontend-v2/src/lib/api/client.ts`
- Create: `frontend-v2/src/lib/api/queryKeys.ts`

- [ ] **Step 1: Write client.ts**

```ts
// Single fetcher for all data. Phase 0-7: reads from JSON mocks.
// Phase 8: same signature, hits Scherzinger backend behind VITE_SCHERZINGER_API.

const USE_MOCKS = !import.meta.env.VITE_SCHERZINGER_API;

const mocks = import.meta.glob('../../data/mocks/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

function mockKey(path: string): string {
  // path "/action-cards" → "action-cards"
  return path.replace(/^\//, '').replace(/\//g, '-');
}

export async function apiFetch<T>(path: string): Promise<T> {
  if (USE_MOCKS) {
    const key = mockKey(path);
    const entry = Object.entries(mocks).find(([file]) => file.includes(`/${key}.json`));
    if (!entry) throw new Error(`No mock found for ${path} (looked for ${key}.json)`);
    return entry[1].default as T;
  }
  const base = import.meta.env.VITE_SCHERZINGER_API as string;
  const res = await fetch(`${base}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return (await res.json()) as T;
}
```

- [ ] **Step 2: Write queryKeys.ts**

```ts
export const qk = {
  actionCards: ['action-cards'] as const,
  margin: (period: string) => ['margin', period] as const,
  quotes: (filters: Record<string, unknown>) => ['quotes', filters] as const,
  forecast: (horizon: string) => ['forecast', horizon] as const,
  pricing: ['pricing'] as const,
  ai: ['ai-briefing'] as const,
} as const;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/lib/api
git commit -m "feat(v2): api client + query keys (mock-aware)"
```

---

## Task 13: First mock + first query hook

**Files:**
- Create: `frontend-v2/src/data/mocks/action-cards.json`
- Create: `frontend-v2/src/data/api/useActionCards.ts`

- [ ] **Step 1: Write data/mocks/action-cards.json**

```json
[
  {
    "id": "ac-1",
    "type": "churn",
    "severity": "warning",
    "title": "Kunde Müller GmbH zeigt Abwanderungs-Signal",
    "subtitle": "Bestellrhythmus -38% vs. 90-Tage-Schnitt",
    "customer": "Müller GmbH",
    "amount": 184000,
    "confidence": 0.82,
    "createdAt": "2026-05-06T08:12:00Z",
    "recommendedAction": "Account Review mit Heiko terminieren"
  },
  {
    "id": "ac-2",
    "type": "margin",
    "severity": "error",
    "title": "Marge auf SKU 200940-A unter 18%",
    "subtitle": "Material +6.2% YoY, Preis seit 14 Monaten unverändert",
    "sku": "200940-A",
    "amount": -42000,
    "confidence": 0.94,
    "createdAt": "2026-05-06T07:55:00Z",
    "recommendedAction": "Preisrunde Q2 vorziehen"
  }
]
```

- [ ] **Step 2: Write data/api/useActionCards.ts**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';
import type { ActionCard } from '@/types';

export function useActionCards() {
  return useQuery({
    queryKey: qk.actionCards,
    queryFn: () => apiFetch<ActionCard[]>('/action-cards'),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/data
git commit -m "feat(v2): action-cards mock + useActionCards hook"
```

---

## Task 14: Layout shell — Sidebar, TopBar, PersonaSwitcher, Shell

**Files:**
- Create: `frontend-v2/src/app/layout/Sidebar.tsx`
- Create: `frontend-v2/src/app/layout/TopBar.tsx`
- Create: `frontend-v2/src/app/layout/PersonaSwitcher.tsx`
- Create: `frontend-v2/src/app/layout/Shell.tsx`

- [ ] **Step 1: Write Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  BarChart3,
  Brain,
  ClipboardList,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';

const items = [
  { to: '/action-center', icon: Activity, key: 'actionCenter' },
  { to: '/margin', icon: BarChart3, key: 'margin' },
  { to: '/quotes', icon: ClipboardList, key: 'quotes' },
  { to: '/forecasting', icon: LineChart, key: 'forecasting' },
  { to: '/pricing', icon: Sparkles, key: 'pricing' },
  { to: '/ai', icon: Brain, key: 'ai' },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-[var(--border-subtle)] bg-white transition-[width]',
        collapsed ? 'w-[72px]' : 'w-[232px]',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        {!collapsed && (
          <span className="font-display text-lg font-semibold tracking-tight">Pryzm</span>
        )}
        <button
          onClick={toggle}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav className="flex-1 px-2 py-3">
        {items.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
              )
            }
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span>{t(`nav.${key}`)}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Write PersonaSwitcher.tsx**

```tsx
import { usePersona } from '@/hooks/usePersona';
import { cn } from '@/lib/cn';
import type { Persona } from '@/types';

const personas: { id: Persona; label: string }[] = [
  { id: 'frank', label: 'Frank' },
  { id: 'till', label: 'Till' },
  { id: 'heiko', label: 'Heiko' },
];

export function PersonaSwitcher() {
  const { persona, setPersona } = usePersona();
  return (
    <div className="inline-flex rounded-full border border-[var(--border-subtle)] bg-gray-50 p-0.5">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => setPersona(p.id)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            persona === p.id
              ? 'bg-white text-gray-900 shadow-[var(--shadow-1)]'
              : 'text-gray-600 hover:text-gray-900',
          )}
          disabled={p.id !== 'frank'}
          title={p.id !== 'frank' ? 'Frank only in v2' : undefined}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write TopBar.tsx**

```tsx
import { Search, Settings2 } from 'lucide-react';
import { useDensity } from '@/hooks/useDensity';
import { PersonaSwitcher } from './PersonaSwitcher';
import { cn } from '@/lib/cn';

export function TopBar() {
  const { density, setDensity } = useDensity();
  return (
    <header className="flex h-14 items-center gap-4 border-b border-[var(--border-subtle)] bg-white px-6">
      <div className="relative w-80">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="search"
          placeholder="Suchen…"
          className="w-full rounded-md border border-[var(--border-subtle)] bg-gray-50 py-1.5 pl-8 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => setDensity(density === 'cozy' ? 'compact' : 'cozy')}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50',
          )}
          title="Dichte umschalten"
        >
          <Settings2 size={12} />
          {density === 'cozy' ? 'Cozy' : 'Compact'}
        </button>
        <PersonaSwitcher />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Write Shell.tsx**

```tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Shell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto bg-[var(--surface-base)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/app/layout
git commit -m "feat(v2): Shell layout — Sidebar, TopBar, PersonaSwitcher"
```

---

## Task 15: Feature placeholder pages

**Files:**
- Create: `frontend-v2/src/features/action-center/index.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/index.tsx`
- Create: `frontend-v2/src/features/quotes/index.tsx`
- Create: `frontend-v2/src/features/forecasting/index.tsx`
- Create: `frontend-v2/src/features/pricing-studio/index.tsx`
- Create: `frontend-v2/src/features/ai-briefing/index.tsx`

- [ ] **Step 1: Write action-center placeholder (validates the data hook works)**

`frontend-v2/src/features/action-center/index.tsx`:

```tsx
import { MessageStrip } from '@/components/fiori/MessageStrip';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useActionCards } from '@/data/api/useActionCards';
import { fmt } from '@/lib/format';

export function ActionCenterPage() {
  const { data, isLoading, error } = useActionCards();

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Aktionszentrale</h1>
          <p className="text-sm text-gray-600">Frank · {new Date().toLocaleDateString('de-DE')}</p>
        </div>
      </div>
      <MessageStrip severity="info" closable className="mb-4">
        Phase 0 Foundation — placeholder cards rendered from mock JSON.
      </MessageStrip>
      {isLoading && <div className="text-sm text-gray-500">Lade…</div>}
      {error && <div className="text-sm text-red-600">Fehler: {(error as Error).message}</div>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data?.map((card) => (
          <Card key={card.id}>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>{card.title}</CardTitle>
              <Badge
                tone={
                  card.severity === 'error'
                    ? 'negative'
                    : card.severity === 'warning'
                      ? 'warning'
                      : 'info'
                }
              >
                {card.type}
              </Badge>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-600">{card.subtitle}</p>
              {card.amount !== undefined && (
                <p className="mt-2 text-lg font-semibold tabular-nums">{fmt.eur(card.amount)}</p>
              )}
              {card.recommendedAction && (
                <p className="mt-2 text-xs text-gray-500">→ {card.recommendedAction}</p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ActionCenterPage;
```

- [ ] **Step 2: Write the other 5 placeholder pages**

For each of `margin-cockpit`, `quotes`, `forecasting`, `pricing-studio`, `ai-briefing`, write `frontend-v2/src/features/<name>/index.tsx` with this template (replace `<Title>` with the German nav title from i18n):

```tsx
import { useTranslation } from 'react-i18next';
import { MessageStrip } from '@/components/fiori/MessageStrip';

const I18N_KEY = '<i18nKey>'; // replace per file: 'margin' | 'quotes' | 'forecasting' | 'pricing' | 'ai'

function PlaceholderPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight">
        {t(`nav.${I18N_KEY}`)}
      </h1>
      <MessageStrip severity="info">
        Phase 0 placeholder — feature ships in a later phase.
      </MessageStrip>
    </div>
  );
}

export default PlaceholderPage;
```

Concrete files to create (each with the matching `I18N_KEY`):
- `src/features/margin-cockpit/index.tsx` → `I18N_KEY = 'margin'`
- `src/features/quotes/index.tsx` → `I18N_KEY = 'quotes'`
- `src/features/forecasting/index.tsx` → `I18N_KEY = 'forecasting'`
- `src/features/pricing-studio/index.tsx` → `I18N_KEY = 'pricing'`
- `src/features/ai-briefing/index.tsx` → `I18N_KEY = 'ai'`

- [ ] **Step 3: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/features
git commit -m "feat(v2): feature placeholder pages — action-center wired to mock"
```

---

## Task 16: Router + Providers + main.tsx

**Files:**
- Create: `frontend-v2/src/app/router.tsx`
- Create: `frontend-v2/src/app/providers.tsx`
- Create: `frontend-v2/src/app/App.tsx`
- Create: `frontend-v2/src/main.tsx`

- [ ] **Step 1: Write router.tsx**

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from './layout/Shell';
import ActionCenterPage from '@/features/action-center';
import MarginPage from '@/features/margin-cockpit';
import QuotesPage from '@/features/quotes';
import ForecastingPage from '@/features/forecasting';
import PricingPage from '@/features/pricing-studio';
import AiPage from '@/features/ai-briefing';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Shell />,
      children: [
        { index: true, element: <Navigate to="/action-center" replace /> },
        { path: 'action-center', element: <ActionCenterPage /> },
        { path: 'margin', element: <MarginPage /> },
        { path: 'quotes', element: <QuotesPage /> },
        { path: 'forecasting', element: <ForecastingPage /> },
        { path: 'pricing', element: <PricingPage /> },
        { path: 'ai', element: <AiPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
```

- [ ] **Step 2: Write providers.tsx**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { useEffect, useState, type ReactNode } from 'react';
import { useDensity } from '@/hooks/useDensity';
import '@/i18n';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  // mount density attribute on html
  useDensity();
  useEffect(() => {
    document.documentElement.lang = 'de';
  }, []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Write App.tsx**

```tsx
import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
```

- [ ] **Step 4: Write main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/app frontend-v2/src/main.tsx
git commit -m "feat(v2): App + router + providers + entry"
```

---

## Task 17: Vitest setup + smoke test

**Files:**
- Create: `frontend-v2/src/tests/setup.ts`
- Create: `frontend-v2/src/tests/smoke.test.tsx`

- [ ] **Step 1: Write setup.ts**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Write smoke.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/Button';
import { fmt } from '@/lib/format';

describe('Phase 0 smoke', () => {
  it('Button renders children', () => {
    render(<Button>Hello</Button>);
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
  });

  it('format.eur formats euros in German locale', () => {
    expect(fmt.eur(184000)).toMatch(/184\.000/);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm test
```

Expected: 2 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/src/tests
git commit -m "test(v2): smoke tests for Button + format helpers"
```

---

## Task 18: Green gates — typecheck, lint, test, build

- [ ] **Step 1: Typecheck**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2
npm run typecheck
```

Expected: no errors. If errors: fix the file referenced before continuing.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: no errors. Warnings about react-refresh on `App.tsx` (default + named export) are acceptable.

- [ ] **Step 3: Tests**

```bash
npm test
```

Expected: 2 passed.

- [ ] **Step 4: Dev build**

```bash
npm run build
```

Expected: build completes; `frontend-v2/dist/` exists with `index.html` + assets.

- [ ] **Step 5: Demo build**

```bash
npm run build:demo
```

Expected: build completes; `frontend/dist-demo-v2/` exists. (We write into the existing `frontend/` folder so the existing deploy pipeline can pick it up later. `dist-demo/` is untouched.)

- [ ] **Step 6: Verify dev server boots**

```bash
npm run dev
```

Expected: Vite prints `Local: http://localhost:5174/`. Open it; verify:
- Sidebar shows 6 items, all in German
- Action Center renders 2 cards from the mock
- Cozy/Compact toggle in TopBar changes row density
- Sidebar collapse toggle works
- Persona switcher: Frank highlighted, Till/Heiko disabled

Press Ctrl+C to stop.

- [ ] **Step 7: Final commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend-v2/package-lock.json
git commit --allow-empty -m "chore(v2): Phase 0 foundation green — typecheck + lint + test + build pass"
```

---

## Definition of Done — Phase 0

- [ ] `frontend-v2/` exists, parallel to `frontend/`
- [ ] `npm run typecheck` green
- [ ] `npm run lint` green
- [ ] `npm test` 2/2 pass
- [ ] `npm run build` produces `frontend-v2/dist/`
- [ ] `npm run build:demo` produces `frontend/dist-demo-v2/`
- [ ] `npm run dev` boots; all 6 routes render placeholder pages without crashing
- [ ] Action Center renders 2 cards from `action-cards.json` mock through `useActionCards` hook
- [ ] Sidebar collapse, density toggle, persona switcher all work and persist across reload
- [ ] Live demo at `/demo/` is unchanged; `frontend/dist/` and `frontend/dist-demo/` are untouched

## Next: Phase 1 — Action Center

Plan written separately at `docs/superpowers/plans/2026-MM-DD-frontend-v2-phase-1-action-center.md` once Phase 0 lands.
