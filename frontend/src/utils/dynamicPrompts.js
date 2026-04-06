/**
 * Dynamic Prompt Generator
 *
 * Generates context-aware suggested prompts based on active Intelligence Feed
 * reports and current data state. Replaces static suggestion arrays.
 *
 * Per plan: "When a churn alert fires for Customer X, a new prompt appears:
 * 'Build a retention plan for Customer X.'"
 */

import { formatEUR } from './formatters';

// Static fallbacks — Scherzinger-specific, always available
const STATIC_PROMPTS = [
  'Why is BKAGG margin 14pp below BKAES?',
  'Which 5 articles have the highest repricing potential?',
  'Walk me through the Q3 2023 win rate collapse and recovery',
  'Build a retention plan for Customer 101580',
  'How much margin would we recover if we reprice the top 10 bleeders?',
  'Why is article 200832-E losing money and what should we do?',
  'Prepare a quarterly pricing review brief for Manuel',
  "What's the impact of a 5% BKAGG price increase on win rate?",
];

/**
 * Generate dynamic prompts from intelligence feed reports.
 * Returns up to `maxPrompts` suggestions, mixing feed-driven and static.
 */
export function generateDynamicPrompts(reports = [], maxPrompts = 8) {
  const dynamic = [];

  for (const report of reports) {
    switch (report.reportType) {
      case 'margin': {
        dynamic.push(`Explain the margin decline to ${report.detail?.metrics?.[0]?.value} — what's driving it?`);
        dynamic.push('How much margin would we recover if we reprice the top 10 bleeders?');
        break;
      }
      case 'pricing': {
        dynamic.push('Which 5 articles have the highest repricing potential?');
        dynamic.push('Prepare a pricing action plan for critical SKUs');
        break;
      }
      case 'churn': {
        const customers = report.churnCustomers ?? [];
        if (customers.length > 0) {
          const top = customers[0];
          dynamic.push(`Build a retention plan for ${top.name}`);
          if (customers.length > 1) {
            dynamic.push(`Compare churn risk factors for ${customers[0].name} vs ${customers[1].name}`);
          }
        }
        dynamic.push('Which customers are we actively losing to competitors?');
        break;
      }
      case 'cost': {
        dynamic.push('Which articles should we discontinue based on cost structure?');
        dynamic.push('What would supplier renegotiation save across our worst-margin SKUs?');
        break;
      }
      case 'winrate': {
        dynamic.push('Walk me through the Q3 2023 win rate collapse and recovery');
        dynamic.push("What's the optimal margin band for maximizing win rate?");
        break;
      }
      case 'pipeline': {
        dynamic.push('Which quoted deals should we prioritize for follow-up?');
        dynamic.push('Prepare a quarterly pricing review brief for Manuel');
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
  for (const prompt of STATIC_PROMPTS) {
    if (unique.length >= maxPrompts) break;
    if (!seen.has(prompt)) {
      seen.add(prompt);
      unique.push(prompt);
    }
  }

  return unique.slice(0, maxPrompts);
}

/**
 * Generate bottom-strip quick prompts — rotated based on feed content.
 * Returns 3 prompts max for the bottom strip display.
 */
export function generateQuickPrompts(reports = []) {
  const prompts = [];

  // Pick from the top 3 most severe reports
  const topReports = reports.slice(0, 3);
  for (const report of topReports) {
    switch (report.reportType) {
      case 'margin':
        prompts.push('Build a repricing plan for the top 5 BKAGG bleeders');
        break;
      case 'churn':
        if (report.churnCustomers?.[0]) {
          prompts.push(`What's happening with ${report.churnCustomers[0].name} and how do we save the account?`);
        }
        break;
      case 'pricing':
        prompts.push('Rank all open quotes by recovery potential and urgency');
        break;
      case 'cost':
        prompts.push('Which articles should we discontinue or renegotiate suppliers for?');
        break;
      case 'winrate':
        prompts.push('Walk me through the win rate trend and what it means for pricing strategy');
        break;
      case 'pipeline':
        prompts.push('Compare customer 101690 vs 100883 margin trajectories');
        break;
    }
  }

  // Fallback
  if (prompts.length === 0) {
    prompts.push(
      'Walk me through the Q3 2023 win rate collapse',
      'Build a repricing plan for the top 5 BKAGG bleeders',
      'Compare customer 101690 vs 100883 margin trajectories',
    );
  }

  return prompts.slice(0, 3);
}
