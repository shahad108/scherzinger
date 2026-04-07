// Client-side auth with SHA-256 hashed credentials
// Password is never stored in plaintext

import { createLoginSession, endLoginSession, setActiveSessionId, clearActiveSessionId, getActiveSessionId } from './supabaseService';

const SESSION_KEY = 'pryzm_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

// SHA-256 hash of the password — generated offline, never reversed
const USERS = {
  scherzinger: {
    hash: 'a07a8d065b19f1147fbf257ac4e0a1e20c6bbd8aa5d75d6e15ac10f229ffb092',
    name: 'Scherzinger',
    role: 'MD',
    initials: 'SZ',
  },
};

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password) {
  return sha256(password);
}

export async function authenticate(username, password) {
  const user = USERS[username.toLowerCase().trim()];
  if (!user) return null;

  const inputHash = await sha256(password);
  if (inputHash !== user.hash) return null;

  const session = {
    username: username.toLowerCase().trim(),
    name: user.name,
    role: user.role,
    initials: user.initials,
    expires: Date.now() + SESSION_DURATION,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));

  // Track login in Supabase — await before returning so the page doesn't navigate away
  try {
    const loginSession = await createLoginSession(session.username);
    if (loginSession?.id) setActiveSessionId(loginSession.id);
  } catch {}

  return session;
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expires) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function logout() {
  // End Supabase session tracking
  const sessionId = getActiveSessionId();
  if (sessionId) {
    try { await endLoginSession(sessionId); } catch {}
    clearActiveSessionId();
  }
  localStorage.removeItem(SESSION_KEY);
  window.location.href = '/login';
}

export function isAuthenticated() {
  return getSession() !== null;
}
