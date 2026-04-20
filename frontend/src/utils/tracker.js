// ─── Scherzinger Analytics Tracker ──────────────────────────────
// Writes sessions / pageviews / clicks / events directly to Supabase
// (login_sessions + user_activity tables). The old /api/track/* backend
// was removed; everything is batched straight to the database via
// supabaseService. If Supabase is unreachable the calls fail silently —
// tracking is best-effort, never blocks UX.

import {
  createLoginSession,
  endLoginSession,
  trackActivity,
  setActiveSessionId,
  getActiveSessionId,
  clearActiveSessionId,
} from './supabaseService';
import { getSession } from './auth';

let eventQueue = [];
let clickQueue = [];
let currentPage = null;
let pageEnteredAt = null;
let pageVisitOrder = 0;
let maxScrollDepth = 0;
let lastActivityAt = Date.now();
let isUserActive = true;
let sessionStartTime = Date.now();

function getUsername() {
  const s = getSession();
  return s?.username || 'anonymous';
}

// ─── Session management ──────────────────────────────────────────

export async function startSession() {
  try {
    const row = await createLoginSession(getUsername());
    if (row?.id) setActiveSessionId(row.id);
    sessionStartTime = Date.now();
    startActivityMonitor();
    window.addEventListener('beforeunload', endSession);
    return row?.id || null;
  } catch { return null; }
}

export function endSession() {
  flushEvents();
  flushClicks();

  if (currentPage && pageEnteredAt) {
    const duration = Math.round((Date.now() - pageEnteredAt) / 1000);
    sendPageView(currentPage, duration, maxScrollDepth);
  }

  const id = getActiveSessionId();
  if (id) {
    endLoginSession(id).catch(() => {});
    clearActiveSessionId();
  }
}

export function getSessionId() {
  return getActiveSessionId();
}

// ─── Page tracking ───────────────────────────────────────────────

const PAGE_NAMES = {
  '/': 'Dashboard Overview',
  '/revenue': 'Revenue & Margins',
  '/products': 'Products & SKUs',
  '/customers': 'Customers',
  '/forecasting': 'Forecasting',
  '/pricing': 'Pricing & Quotes',
  '/cost-intelligence': 'Cost Intelligence',
  '/inventory': 'Cost Intelligence',
  '/ml-analytics': 'ML Analytics',
  '/ai-insights': 'AI Insights',
  '/measures': 'Measures',
  '/admin': 'Admin Dashboard',
};

export function trackPageEnter(path) {
  if (currentPage && pageEnteredAt) {
    const duration = Math.round((Date.now() - pageEnteredAt) / 1000);
    sendPageView(currentPage, duration, maxScrollDepth);
  }
  currentPage = path;
  pageEnteredAt = Date.now();
  pageVisitOrder++;
  maxScrollDepth = 0;
  // Emit an immediate page_enter so single-pageview sessions also land.
  trackActivity(getUsername(), 'page_enter', path, {
    page_name: PAGE_NAMES[path] || path,
    visit_order: pageVisitOrder,
  }).catch(() => {});
}

function sendPageView(path, duration, scrollDepth) {
  trackActivity(getUsername(), 'page_view', path, {
    page_name: PAGE_NAMES[path] || path,
    duration_seconds: duration,
    scroll_depth_percent: scrollDepth,
    visit_order: pageVisitOrder,
  }).catch(() => {});
}

// ─── Scroll depth ────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight > 0) {
      const depth = Math.round((scrollTop / docHeight) * 100);
      if (depth > maxScrollDepth) maxScrollDepth = depth;
    }
    lastActivityAt = Date.now();
  }, { passive: true });
}

// ─── Click coordinate tracking (for heatmaps) ───────────────────

function getElementZone(el) {
  if (!el) return 'unknown';
  const zones = ['kpi', 'chart', 'table', 'sidebar', 'header', 'chat', 'footer', 'filter'];
  let node = el;
  while (node && node !== document.body) {
    const cls = (node.className || '').toString().toLowerCase();
    const id = (node.id || '').toLowerCase();
    const tag = (node.tagName || '').toLowerCase();
    for (const z of zones) {
      if (cls.includes(z) || id.includes(z)) return z;
    }
    if (tag === 'table' || tag === 'thead' || tag === 'tbody') return 'table';
    if (tag === 'nav') return 'sidebar';
    node = node.parentElement;
  }
  return 'other';
}

if (typeof window !== 'undefined') {
  document.addEventListener('click', (e) => {
    const x = Math.round((e.clientX / window.innerWidth) * 100 * 10) / 10;
    const y = Math.round(((e.clientY + window.scrollY) / document.documentElement.scrollHeight) * 100 * 10) / 10;
    const zone = getElementZone(e.target);
    const elId = e.target.id || e.target.closest('[id]')?.id || e.target.tagName.toLowerCase();
    clickQueue.push({ x_percent: x, y_percent: y, element_id: elId, element_zone: zone });
    if (clickQueue.length >= 5) flushClicks();
  }, { passive: true });
}

function flushClicks() {
  if (clickQueue.length === 0) return;
  const batch = [...clickQueue];
  clickQueue = [];
  trackActivity(getUsername(), 'click_batch', currentPage || window.location.pathname, {
    clicks: batch,
  }).catch(() => {});
}

if (typeof window !== 'undefined') {
  setInterval(flushClicks, 10000);
}

// ─── Event tracking (batched) ────────────────────────────────────

export function trackEvent(eventType, category, targetElement, detail = null) {
  eventQueue.push({
    event_type: eventType,
    event_category: category,
    page_path: currentPage || window.location.pathname,
    target_element: targetElement,
    target_detail: detail,
  });
  lastActivityAt = Date.now();
  if (eventQueue.length >= 10) flushEvents();
}

function flushEvents() {
  if (eventQueue.length === 0) return;
  const batch = [...eventQueue];
  eventQueue = [];
  trackActivity(getUsername(), 'event_batch', currentPage || window.location.pathname, {
    events: batch,
  }).catch(() => {});
}

if (typeof window !== 'undefined') {
  setInterval(flushEvents, 5000);
}

// ─── KPI card hover tracking ─────────────────────────────────────

const hoverTimers = new Map();

export function trackKPIHoverStart(cardName) {
  hoverTimers.set(cardName, Date.now());
}

export function trackKPIHoverEnd(cardName, clicked = false) {
  const startTime = hoverTimers.get(cardName);
  if (!startTime) return;
  hoverTimers.delete(cardName);
  const duration = Date.now() - startTime;
  if (duration < 200) return;
  trackActivity(getUsername(), 'kpi_hover', currentPage || window.location.pathname, {
    card_name: cardName,
    hover_duration_ms: duration,
    clicked,
  }).catch(() => {});
}

// ─── AI Chat analytics ───────────────────────────────────────────

export function trackChatQuestion({ chatSessionId, pageContext, source, suggestionText, questionText }) {
  trackActivity(getUsername(), 'chat_question', pageContext || currentPage || window.location.pathname, {
    chat_session_id: chatSessionId,
    question_source: source,
    suggestion_text: suggestionText,
    question_text: questionText,
  }).catch(() => {});
}

export function trackChatRating(chatSessionId, questionText, rating) {
  trackActivity(getUsername(), 'chat_rating', currentPage || window.location.pathname, {
    chat_session_id: chatSessionId,
    question_text: questionText || 'rating',
    response_rating: rating,
  }).catch(() => {});
}

// ─── Idle detection & activity pings ─────────────────────────────

function startActivityMonitor() {
  const markActive = () => { lastActivityAt = Date.now(); isUserActive = true; };
  window.addEventListener('mousemove', markActive, { passive: true });
  window.addEventListener('keydown', markActive, { passive: true });
  window.addEventListener('click', markActive, { passive: true });
  window.addEventListener('touchstart', markActive, { passive: true });

  setInterval(() => {
    isUserActive = (Date.now() - lastActivityAt) < 60000;
    if (!getActiveSessionId()) return;
    trackActivity(getUsername(), 'ping', currentPage || window.location.pathname, {
      is_active: isUserActive,
      session_duration_seconds: Math.round((Date.now() - sessionStartTime) / 1000),
    }).catch(() => {});
  }, 60000);
}

// ─── Shorthand helpers ───────────────────────────────────────────

export const track = {
  chartClick: (chartName, detail) => trackEvent('chart_click', 'chart', chartName, detail),
  chartHover: (chartName, detail) => trackEvent('chart_hover', 'chart', chartName, detail),
  chartDrilldown: (chartName, detail) => trackEvent('chart_drilldown', 'chart', chartName, detail),

  tableSort: (tableName, column, direction) => trackEvent('table_sort', 'table', tableName, { column, direction }),
  tableSearch: (tableName, query) => trackEvent('table_search', 'table', tableName, { query }),
  tableRowClick: (tableName, rowId) => trackEvent('table_row_click', 'table', tableName, { row_id: rowId }),
  tablePaginate: (tableName, page) => trackEvent('table_paginate', 'table', tableName, { page }),

  skuDrilldown: (skuCode) => trackEvent('sku_drilldown', 'drilldown', skuCode),
  customerDrilldown: (customerCode) => trackEvent('customer_drilldown', 'drilldown', customerCode),
  categoryDrilldown: (categoryName) => trackEvent('category_drilldown', 'drilldown', categoryName),
  slideoverClose: (type) => trackEvent('slideover_close', 'drilldown', type),

  sidebarNavigate: (page) => trackEvent('sidebar_navigate', 'navigation', page),
  sidebarCollapse: () => trackEvent('sidebar_collapse', 'navigation', 'sidebar'),
  sidebarExpand: () => trackEvent('sidebar_expand', 'navigation', 'sidebar'),

  notificationOpen: () => trackEvent('notification_open', 'notification', 'bell'),
  notificationClick: (alertText) => trackEvent('notification_click', 'notification', alertText),
  notificationDismiss: (alertText) => trackEvent('notification_dismiss', 'notification', alertText),

  filterApply: (filterName, value) => trackEvent('filter_apply', 'filter', filterName, { value }),
  filterClear: (filterName) => trackEvent('filter_clear', 'filter', filterName),

  globalSearch: (query) => trackEvent('search_global', 'search', query),
  searchResultClick: (result) => trackEvent('search_result_click', 'search', result),

  chatOpen: () => trackEvent('chat_open', 'ai_chat', 'global_chat'),
  chatClose: () => trackEvent('chat_close', 'ai_chat', 'global_chat'),
  chatSend: (text) => trackEvent('chat_send', 'ai_chat', text),
  chatSuggestionClick: (text) => trackEvent('chat_suggestion_click', 'ai_chat', text),
  chatViewDetailed: () => trackEvent('chat_view_detailed', 'ai_chat', 'view_analysis_link'),
  chatNewConversation: () => trackEvent('chat_new_conversation', 'ai_chat', 'new_chat'),

  kpiCardHover: (cardName) => trackEvent('kpi_card_hover', 'kpi', cardName),
  kpiCardClick: (cardName) => trackEvent('kpi_card_click', 'kpi', cardName),

  measureCreate: (measure) => trackEvent('measure_create', 'measures', measure?.title || 'measure', {
    id: measure?.id,
    source_dashboard: measure?.sourceDashboard,
    source_element_id: measure?.sourceElementId,
    status: measure?.status,
  }),
  measureUpdate: (id, patch) => trackEvent('measure_update', 'measures', id, patch),
  measureDelete: (id) => trackEvent('measure_delete', 'measures', id),
};
