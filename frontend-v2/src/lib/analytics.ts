/**
 * Phase 2 telemetry stub.
 *
 * Default implementation is a noop. Phase 14/15 wires a real provider
 * (Segment / PostHog / Sentry analytics) — when that ships, swap the
 * implementation behind this interface.
 */

export interface AnalyticsClient {
  identify(userId: string, traits?: Record<string, unknown>): void;
  track(event: string, props?: Record<string, unknown>): void;
}

const noop: AnalyticsClient = {
  identify() {},
  track() {},
};

let impl: AnalyticsClient = noop;

export function setAnalyticsClient(client: AnalyticsClient): void {
  impl = client;
}

export const analytics: AnalyticsClient = {
  identify(userId, traits) {
    impl.identify(userId, traits);
  },
  track(event, props) {
    impl.track(event, props);
  },
};
