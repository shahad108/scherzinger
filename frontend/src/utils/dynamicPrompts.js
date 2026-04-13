/**
 * Dynamic Prompt Generator
 *
 * Generates context-aware suggested prompts based on active Intelligence Feed
 * reports. Both the static fallback prompts and the templates for
 * report-driven prompts are pulled from the i18n dictionary so the chat
 * suggestions follow the active language.
 */

const identityT = (key) => key;

const STATIC_PROMPT_KEYS = [
  'prompts.static.1',
  'prompts.static.2',
  'prompts.static.3',
  'prompts.static.4',
  'prompts.static.5',
  'prompts.static.6',
  'prompts.static.7',
  'prompts.static.8',
];

/**
 * Generate dynamic prompts from intelligence feed reports.
 * Returns up to `maxPrompts` suggestions, mixing feed-driven and static.
 */
export function generateDynamicPrompts(reports = [], maxPrompts = 8, tArg) {
  const t = tArg || identityT;
  const dynamic = [];

  for (const report of reports) {
    switch (report.reportType) {
      case 'margin': {
        dynamic.push(t('prompts.dyn.margin.1', { value: report.detail?.metrics?.[0]?.value || '' }));
        dynamic.push(t('prompts.dyn.margin.2'));
        break;
      }
      case 'pricing': {
        dynamic.push(t('prompts.dyn.pricing.1'));
        dynamic.push(t('prompts.dyn.pricing.2'));
        break;
      }
      case 'churn': {
        const customers = report.churnCustomers ?? [];
        if (customers.length > 0) {
          const top = customers[0];
          dynamic.push(t('prompts.dyn.churn.1', { name: top.name }));
          if (customers.length > 1) {
            dynamic.push(t('prompts.dyn.churn.2', { a: customers[0].name, b: customers[1].name }));
          }
        }
        dynamic.push(t('prompts.dyn.churn.3'));
        break;
      }
      case 'cost': {
        dynamic.push(t('prompts.dyn.cost.1'));
        dynamic.push(t('prompts.dyn.cost.2'));
        break;
      }
      case 'winrate': {
        dynamic.push(t('prompts.dyn.winrate.1'));
        dynamic.push(t('prompts.dyn.winrate.2'));
        break;
      }
      case 'pipeline': {
        dynamic.push(t('prompts.dyn.pipeline.1'));
        dynamic.push(t('prompts.dyn.pipeline.2'));
        break;
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const prompt of dynamic) {
    if (!seen.has(prompt)) {
      seen.add(prompt);
      unique.push(prompt);
    }
  }

  // Fill remaining slots with static fallbacks
  for (const key of STATIC_PROMPT_KEYS) {
    if (unique.length >= maxPrompts) break;
    const text = t(key);
    if (!seen.has(text)) {
      seen.add(text);
      unique.push(text);
    }
  }

  return unique.slice(0, maxPrompts);
}

/**
 * Generate bottom-strip quick prompts — rotated based on feed content.
 * Returns 3 prompts max for the bottom strip display.
 */
export function generateQuickPrompts(reports = [], tArg) {
  const t = tArg || identityT;
  const prompts = [];

  const topReports = reports.slice(0, 3);
  for (const report of topReports) {
    switch (report.reportType) {
      case 'margin':
        prompts.push(t('prompts.quick.margin'));
        break;
      case 'churn':
        if (report.churnCustomers?.[0]) {
          prompts.push(t('prompts.quick.churn', { name: report.churnCustomers[0].name }));
        }
        break;
      case 'pricing':
        prompts.push(t('prompts.quick.pricing'));
        break;
      case 'cost':
        prompts.push(t('prompts.quick.cost'));
        break;
      case 'winrate':
        prompts.push(t('prompts.quick.winrate'));
        break;
      case 'pipeline':
        prompts.push(t('prompts.quick.pipeline'));
        break;
    }
  }

  if (prompts.length === 0) {
    prompts.push(
      t('prompts.dyn.winrate.1'),
      t('prompts.quick.margin'),
      t('prompts.quick.pipeline'),
    );
  }

  return prompts.slice(0, 3);
}
