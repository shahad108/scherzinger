import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initPostHog } from './utils/posthog'

// ─── Demo-mode bootstrap ────────────────────────────────────────────
// When the bundle is built with `vite build --base=/demo/`, Vite sets
// import.meta.env.BASE_URL to `/demo/`. In that mode we're hosted under
// another site's subpath (the Avanna demo server) and the outer host
// already gates the route behind its own login — so we auto-satisfy
// Scherzinger's internal ProtectedRoute with a long-lived fake session
// instead of showing a second login page. We also skip telemetry.
const IS_DEMO_SUBPATH = import.meta.env.BASE_URL === '/demo/'

if (IS_DEMO_SUBPATH) {
  try {
    const raw = localStorage.getItem('pryzm_session')
    const session = raw ? JSON.parse(raw) : null
    if (!session || !session.expires || session.expires < Date.now()) {
      localStorage.setItem('pryzm_session', JSON.stringify({
        username: 'demo',
        name: 'Demo',
        role: 'Guest',
        initials: 'DE',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
      }))
    }
  } catch { /* localStorage blocked — user will hit the internal login */ }
} else {
  // Real Scherzinger deploy — telemetry enabled.
  initPostHog()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
