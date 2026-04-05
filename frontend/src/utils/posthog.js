import posthog from 'posthog-js/dist/module.full.no-external.js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';

export function initPostHog() {
  if (!POSTHOG_KEY) {
    console.warn('PostHog: No API key configured (set VITE_POSTHOG_KEY)');
    return null;
  }

  posthog.init(POSTHOG_KEY, {
    // Route through own server to bypass ad blockers
    api_host: window.location.origin + '/t',
    ui_host: 'https://eu.posthog.com',
    person_profiles: 'identified_only',

    // Prevent any external script loading (everything is bundled)
    disable_external_dependency_loading: true,

    // Enable all visual features
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: false,

    // Session recording config
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
      },
    },

    // Heatmap config
    enable_heatmaps: true,
  });

  return posthog;
}

export function identifyUser(username) {
  if (!POSTHOG_KEY) return;
  posthog.identify(username, {
    name: username,
    app: 'Scherzinger Intelligence Platform',
    company: 'Scherzinger GmbH',
  });
}

export function trackEvent(event, properties = {}) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export { posthog };
