// ─── Scherzinger Analytics Tracker ──────────────────────────────
// Lightweight tracker that batches events and sends to server → Supabase

let sessionId = null;
let eventQueue = [];
let currentPage = null;
let pageEnteredAt = null;
let pageVisitOrder = 0;
let maxScrollDepth = 0;
let lastActivityAt = Date.now();
let isUserActive = true;
let sessionStartTime = Date.now();

// ─── Session management ──────────────────────────────────────────

export async function startSession() {
  try {
    const res = await fetch('/api/track/session-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
      }),
    });
    const data = await res.json();
    sessionId = data.id;
    sessionStartTime = Date.now();

    // Start activity monitor
    startActivityMonitor();

    // End session on tab close
    window.addEventListener('beforeunload', endSession);

    return sessionId;
  } catch { return null; }
}

export function endSession() {
  // Flush remaining events
  flushEvents();

  // Send final page view
  if (currentPage && pageEnteredAt) {
    const duration = Math.round((Date.now() - pageEnteredAt) / 1000);
    sendPageView(currentPage, duration, maxScrollDepth);
  }

  if (!sessionId) return;
  const payload = JSON.stringify({
    session_id: sessionId,
    duration_seconds: Math.round((Date.now() - sessionStartTime) / 1000),
  });
  navigator.sendBeacon('/api/track/session-end', new Blob([payload], { type: 'application/json' }));
}

export function getSessionId() {
  return sessionId;
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
  '/admin': 'Admin Dashboard',
};

export function trackPageEnter(path) {
  // Save previous page duration
  if (currentPage && pageEnteredAt) {
    const duration = Math.round((Date.now() - pageEnteredAt) / 1000);
    sendPageView(currentPage, duration, maxScrollDepth);
  }

  currentPage = path;
  pageEnteredAt = Date.now();
  pageVisitOrder++;
  maxScrollDepth = 0;
}

function sendPageView(path, duration, scrollDepth) {
  fetch('/api/track/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      page_path: path,
      page_name: PAGE_NAMES[path] || path,
      duration_seconds: duration,
      scroll_depth_percent: scrollDepth,
      visit_order: pageVisitOrder,
    }),
  }).catch(() => {});
}

// ─── Scroll depth tracking ───────────────────────────────────────

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

let clickQueue = [];

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

  fetch('/api/track/clicks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      page_path: currentPage || window.location.pathname,
      clicks: batch,
    }),
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

  // Flush every 10 events
  if (eventQueue.length >= 10) flushEvents();
}

function flushEvents() {
  if (eventQueue.length === 0) return;
  const batch = [...eventQueue];
  eventQueue = [];

  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, events: batch }),
  }).catch(() => {});
}

// Flush events periodically
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
  if (duration < 200) return; // ignore accidental hovers

  fetch('/api/track/kpi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      page_path: currentPage || window.location.pathname,
      card_name: cardName,
      hover_duration_ms: duration,
      clicked,
    }),
  }).catch(() => {});
}

// ─── AI Chat analytics ───────────────────────────────────────────

export function trackChatQuestion({ chatSessionId, pageContext, source, suggestionText, questionText }) {
  fetch('/api/track/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_session_id: chatSessionId,
      page_context: pageContext,
      question_source: source,
      suggestion_text: suggestionText,
      question_text: questionText,
    }),
  }).catch(() => {});
}

export function trackChatRating(chatSessionId, questionText, rating) {
  fetch('/api/track/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_session_id: chatSessionId,
      question_source: 'chat_rating',
      question_text: questionText || 'rating',
      response_rating: rating,
    }),
  }).catch(() => {});
}

// ─── Idle detection & activity pings ─────────────────────────────

function startActivityMonitor() {
  const markActive = () => { lastActivityAt = Date.now(); isUserActive = true; };
  window.addEventListener('mousemove', markActive, { passive: true });
  window.addEventListener('keydown', markActive, { passive: true });
  window.addEventListener('click', markActive, { passive: true });
  window.addEventListener('touchstart', markActive, { passive: true });

  // Send ping every 60 seconds
  setInterval(() => {
    isUserActive = (Date.now() - lastActivityAt) < 60000;

    if (sessionId) {
      fetch('/api/track/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          page_path: currentPage || window.location.pathname,
          is_active: isUserActive,
        }),
      }).catch(() => {});
    }
  }, 60000);
}

// ─── Shorthand helpers for common events ─────────────────────────

export const track = {
  // Charts
  chartClick: (chartName, detail) =>
    trackEvent('chart_click', 'chart', chartName, detail),
  chartHover: (chartName, detail) =>
    trackEvent('chart_hover', 'chart', chartName, detail),
  chartDrilldown: (chartName, detail) =>
    trackEvent('chart_drilldown', 'chart', chartName, detail),

  // Tables
  tableSort: (tableName, column, direction) =>
    trackEvent('table_sort', 'table', tableName, { column, direction }),
  tableSearch: (tableName, query) =>
    trackEvent('table_search', 'table', tableName, { query }),
  tableRowClick: (tableName, rowId) =>
    trackEvent('table_row_click', 'table', tableName, { row_id: rowId }),
  tablePaginate: (tableName, page) =>
    trackEvent('table_paginate', 'table', tableName, { page }),

  // Drilldowns
  skuDrilldown: (skuCode) =>
    trackEvent('sku_drilldown', 'drilldown', skuCode),
  customerDrilldown: (customerCode) =>
    trackEvent('customer_drilldown', 'drilldown', customerCode),
  categoryDrilldown: (categoryName) =>
    trackEvent('category_drilldown', 'drilldown', categoryName),
  slideoverClose: (type) =>
    trackEvent('slideover_close', 'drilldown', type),

  // Navigation
  sidebarNavigate: (page) =>
    trackEvent('sidebar_navigate', 'navigation', page),
  sidebarCollapse: () =>
    trackEvent('sidebar_collapse', 'navigation', 'sidebar'),
  sidebarExpand: () =>
    trackEvent('sidebar_expand', 'navigation', 'sidebar'),

  // Notifications
  notificationOpen: () =>
    trackEvent('notification_open', 'notification', 'bell'),
  notificationClick: (alertText) =>
    trackEvent('notification_click', 'notification', alertText),
  notificationDismiss: (alertText) =>
    trackEvent('notification_dismiss', 'notification', alertText),

  // Filters
  filterApply: (filterName, value) =>
    trackEvent('filter_apply', 'filter', filterName, { value }),
  filterClear: (filterName) =>
    trackEvent('filter_clear', 'filter', filterName),

  // Search
  globalSearch: (query) =>
    trackEvent('search_global', 'search', query),
  searchResultClick: (result) =>
    trackEvent('search_result_click', 'search', result),

  // Chat
  chatOpen: () => trackEvent('chat_open', 'ai_chat', 'global_chat'),
  chatClose: () => trackEvent('chat_close', 'ai_chat', 'global_chat'),
  chatSend: (text) => trackEvent('chat_send', 'ai_chat', text),
  chatSuggestionClick: (text) =>
    trackEvent('chat_suggestion_click', 'ai_chat', text),
  chatViewDetailed: () =>
    trackEvent('chat_view_detailed', 'ai_chat', 'view_analysis_link'),
  chatNewConversation: () =>
    trackEvent('chat_new_conversation', 'ai_chat', 'new_chat'),

  // KPI
  kpiCardHover: (cardName) =>
    trackEvent('kpi_card_hover', 'kpi', cardName),
  kpiCardClick: (cardName) =>
    trackEvent('kpi_card_click', 'kpi', cardName),
};
