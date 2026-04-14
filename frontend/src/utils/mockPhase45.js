// Demo-only Phase 4/5 data accessors.
//
// Every getter is guarded by IS_DEMO. In the real Scherzinger build
// IS_DEMO is false at build time, so Vite's dead-code elimination
// drops the dynamic-import branch entirely and the JSON blob is
// never pulled into dist/.
//
// In demo builds the JSON is imported eagerly (small, ~10KB) so
// components don't have to deal with async loading.

import { IS_DEMO } from './brand';
import raw from '../data/mock_phase45.json';

const data = IS_DEMO ? raw : null;

const empty = { list: [], obj: {} };

export function getBaseline()            { return data ? data.baseline            : null; }
export function getNLHeader()            { return data ? data.nlHeader             : null; }
export function getLiveAlerts()          { return data ? data.liveAlerts           : []; }
export function getAnomalies()           { return data ? data.anomalies            : []; }
export function getFloorPrices()         { return data ? data.floorPrices          : []; }
export function getBreakEven()           { return data ? data.breakEven            : []; }
export function getProfitability()       { return data ? data.profitability        : []; }
export function getWTPBands()            { return data ? data.wtpBands             : []; }
export function getCLVRanking()          { return data ? data.clvRanking           : []; }
export function getCrossSell()           { return data ? data.crossSell            : []; }
export function getQuoteToCash()         { return data ? data.quoteToCash          : null; }
export function getPriceOptimizer()      { return data ? data.priceOptimizer       : []; }
export function getWinProbability()      { return data ? data.winProbability       : []; }
export function getElasticity()          { return data ? data.elasticity           : null; }
export function getCompetitive()         { return data ? data.competitive          : []; }
export function getLostOpportunity()     { return data ? data.lostOpportunity      : null; }
export function getChurn()               { return data ? data.churn                : null; }
export function getMonteCarloHistogram() { return data ? data.monteCarloHistogram  : []; }
export function getRegimeCurves()        { return data ? data.regimeCurves         : null; }

// Scenario Lab — single source of truth for the closed-form shock formula.
// Positive shock on a cost component REDUCES margin proportional to that
// component's share. Positive volume shock INCREASES margin via fixed-cost
// dilution (captured by volumeLeverage).
export function computeShockedMargin({ material, labor, outsourcing, volume }) {
  if (!data) return 0;
  const b = data.baseline;
  return (
    b.marginPct
    - b.matSharePct          * (material    / 100)
    - b.laborSharePct        * (labor       / 100)
    - b.outsourcingSharePct  * (outsourcing / 100)
    + b.volumeLeverage       * (volume      / 100)
  );
}

// Per-SKU lookups for the SKU deep-dive slide-over.
// `findBySku` returns whatever fields exist for that SKU across the dataset.
export function findSKUDetail(sku) {
  if (!data) return null;
  return {
    floorPrice:  data.floorPrices.find(r => r.sku === sku)        || null,
    breakEven:   data.breakEven.find(r => r.sku === sku)          || null,
    optimizer:   data.priceOptimizer.find(r => r.sku === sku)     || null,
    anomalies:   data.anomalies.filter(r => r.sku === sku),
    crossSell:   data.crossSell.filter(r => r.sku === sku),
    competitive: data.competitive.find(r => r.sku === sku)        || null,
  };
}
