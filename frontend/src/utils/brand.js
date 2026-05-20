// Central brand switcher.
//
// The Scherzinger frontend is deployed in two places:
//   1. `demo.scherzinger.pryzm-solutions.com/` — the real Scherzinger demo
//      with the full Scherzinger branding.
//   2. `demo.pryzm-solutions.com/demo/` — an anonymised demo hosted under
//      another site's subpath, shown to new prospects who haven't signed
//      an NDA and shouldn't see the Scherzinger name.
//
// The deploy mode is derived from Vite's BASE_URL. When built with
// `vite build --base=/demo/`, BASE_URL is `/demo/` and we swap every
// user-visible reference to "Scherzinger" with the generic placeholder
// "Demo". The normal Scherzinger build (`base=/`) is unaffected.

const IS_DEMO_SUBPATH = import.meta.env.BASE_URL === '/demo/';

export const IS_DEMO = IS_DEMO_SUBPATH;

export const BRAND = {
  // Short company name — shown in sidebar user pill, chat bar context, etc.
  company: IS_DEMO_SUBPATH ? 'Demo' : 'Scherzinger',

  // Full legal name — shown in the footer line.
  companyFull: IS_DEMO_SUBPATH ? 'Demo' : 'Scherzinger GmbH',

  // Browser tab title.
  pageTitle: IS_DEMO_SUBPATH
    ? 'Demo Margin Intelligence | PRYZM Analytics'
    : 'Scherzinger Margin Intelligence | PRYZM Analytics',

  // HTML meta description.
  pageDescription: IS_DEMO_SUBPATH
    ? 'Demo Margin Intelligence Platform - PRYZM Analytics'
    : 'Scherzinger Margin Intelligence Platform - PRYZM Analytics',

  // Used inside AI system prompts so the LLM doesn't leak "Scherzinger"
  // into its responses on the anonymised demo.
  companyDescription: IS_DEMO_SUBPATH
    ? 'a precision industrial manufacturing company (anonymised demo data)'
    : 'Scherzinger GmbH — German pump manufacturing company specializing in high-precision industrial pumps',

  // Short description used by the shorter system-prompt variant.
  companyDescriptionShort: IS_DEMO_SUBPATH
    ? 'a precision industrial manufacturing company'
    : 'Scherzinger GmbH — German pump manufacturing company',

  // Phrase used at the end of follow-up prompts ("tailored to X").
  tailoredTo: IS_DEMO_SUBPATH ? 'the business' : 'Scherzinger',
};
