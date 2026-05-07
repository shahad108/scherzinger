import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrollIntoView; stub it for components that call it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
