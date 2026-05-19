import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useStudio } from '@/data/api/useStudio';
import { useStudioWorkbench } from '@/data/api/useStudioWorkbench';
import { useProposals } from '@/data/api/useProposals';
import { useLivePricing } from '@/hooks/useLivePricing';
import { usePricingStream } from '@/hooks/usePricingStream';
import { useFanoutRescore } from '@/data/api/useFanoutRescore';
import { PageHead } from './components/PageHead';
import { SkuPicker } from './components/SkuPicker';
import { WorkbenchHero, type HeroView } from './components/WorkbenchHero';
import { PriceOptions, type ActiveOptionView } from './components/PriceOptions';
import { CustomerFanout } from './components/CustomerFanout';
import { CostHistory } from './components/CostHistory';
import { ComparablePanel } from './components/ComparablePanel';
// Pricing Studio v3 / Phase E — evidence tabs host (Cost · Quotes ·
// Customers · Comparable · Lineage).
import {
  EvidenceTabs,
  EvidencePanePlaceholder,
  type EvidenceTabKey,
  type EvidenceTabStatus,
} from './components/EvidenceTabs';
import { DecisionFooter } from './components/DecisionFooter';
import { RationaleMemo } from './components/RationaleMemo';
import { CrossLinks } from './components/CrossLinks';
import { StudioSkeleton } from './components/StudioSkeleton';
import { DeepLinkBanner } from './components/DeepLinkBanner';
import { ProposalContextPanel } from './components/ProposalContextPanel';
// Pricing Studio v3 / Phase 1 — new top-of-workbench surfaces.
import { RecommendationHero } from './components/RecommendationHero';
import { RecommendationKpiTiles } from './components/RecommendationKpiTiles';
import { WtpBandStrip } from './components/WtpBandStrip';
import { WinProbCurve } from './components/WinProbCurve';
import { DriverWaterfall } from './components/DriverWaterfall';
import { LineageDrawer } from './components/LineageDrawer';
import { LineageDrawerProvider } from './lineage/LineageDrawerContext';
import { useLineageUrlSync } from './lineage/useLineageUrlSync';
import { parseDecimal } from './lib/decimal';
// Pricing Studio v3 / Phase 3 — cost & margin reality.
import { TriggerBanner } from './components/TriggerBanner';
import { CostTrajectoryDrawer } from './components/CostTrajectoryDrawer';
// Pricing Studio v3 / Phase 8 — simulation + compare drawers.
import { SimulationDrawer } from './components/SimulationDrawer';
import { CompareDrawer } from './components/CompareDrawer';
// Pricing Studio v3 / Phase 4 — audit history + what-changed-since strip.
import { AuditDrawer } from './components/AuditDrawer';
import { WhatChangedStrip } from './components/WhatChangedStrip';
import { auditFeedKey } from '@/data/api/useAuditFeed';
// Pricing Studio v3 / Phase 5 — approval inbox + SSE-driven invalidation.
import { ApprovalInboxBell } from './components/ApprovalInboxBell';
import { AlertInboxBell } from './components/AlertInboxBell';
import { AlertBanner } from './components/AlertBanner';
import { approvalInboxKey } from '@/data/api/useApprovalInbox';
// Pricing Studio v3 / Phase 6 — batch repricing.
import { BatchWorkbench } from './components/BatchWorkbench';
import { BatchApprovalDrawer } from './components/BatchApprovalDrawer';
import { useBatch, batchKey, type ScopeFilter } from '@/data/api/useBatch';
import type { SkuPickerMode } from './components/SkuPicker';
// Pricing Studio v3 / Phase 7 — push-to-quoting SSE invalidation + toast.
import { priceBookKey } from '@/data/api/usePublishPrice';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';
// Pricing Studio v3 / Phase 11 — workflow polish.
import { ActiveFiltersStrip } from './components/ActiveFiltersStrip';
import { KeyboardCheatSheet } from './components/KeyboardCheatSheet';
import { SavedViewsMenu } from './components/SavedViewsMenu';
import { useStudioKeyboardShortcuts } from './hooks/useStudioKeyboardShortcuts';

export default function PricingStudioPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  // Phase 21 — full deep-link filter quartet flows through `useStudio` so a
  // refresh preserves the exact slice the user landed on.
  // Pricing Studio plan B3 — Action Center customer-only churn rows route
  // here with `?customer=<cid>`. Forward as `customer_id` so the BFF
  // scopes `shell.skus[]` to that customer's purchased SKUs.
  const urlCustomerId = params.get('customer') ?? undefined;
  // Pricing Studio plan B4 — queue chip in URL (`?queue=churn` etc.).
  // The BFF accepts {churn, cost_riser, margin_erosion}; unknown values
  // are forwarded unchanged and the BFF will return the unfiltered list.
  const urlQueueRaw = params.get('queue') ?? undefined;
  const urlQueue =
    urlQueueRaw === 'churn' ||
    urlQueueRaw === 'cost_riser' ||
    urlQueueRaw === 'margin_erosion'
      ? urlQueueRaw
      : undefined;

  const studioParams = {
    aid: params.get('aid') ?? undefined,
    tier: params.get('tier') ?? undefined,
    family: params.get('family') ?? undefined,
    cluster: params.get('cluster') ?? undefined,
    scenario_id: params.get('scenario_id') ?? undefined,
    // Phase 3 — deep-link banner trigger; BFF returns trigger_context
    // when (source, reason) is a recognised tuple.
    source: params.get('source') ?? undefined,
    reason: params.get('reason') ?? undefined,
    // Pricing Studio plan B3 + B4 — customer scope + queue chip.
    customer_id: urlCustomerId,
    queue: urlQueue,
  };
  const { data, isLoading } = useStudio(studioParams);
  // Pricing Studio v3 / Phase 1 — live-wired tick + toast surface. The data
  // we read from `useStudio` above is still authoritative; this hook just
  // invalidates that cache and surfaces lastTickAt for the freshness chip.
  const live = useLivePricing(studioParams);
  // Phase 7 — dedicated stream subscription used to detect
  // `pricing.price_set` (hero "Live since…" flip via the existing studio
  // invalidation) and `pricing.price_rolled_back` (toast). We re-use the
  // existing `pricing` topic from `useLivePricing`; this hook is read-only
  // — it just observes the lastEvent to drive UI reactions below.
  const pricingStream = usePricingStream({
    topic: 'pricing',
    aid: studioParams.aid ?? null,
    enabled: Boolean(studioParams.aid),
  });
  const lastPricingPushEventTsRef = useRef<number | null>(null);
  // Phase 2 — `aid` from the URL drives initial selection so deep links
  // from Action Center / Margin / Forecasting land on the exact SKU.
  // Local state then overrides if the user picks a different SKU.
  const urlAid = params.get('aid');
  const [selectedAid, setSelectedAid] = useState<string | null>(urlAid);
  const [activeOption, setActiveOption] = useState<ActiveOptionView | null>(null);
  // Pricing Studio v3 / Phase 11 — drawer open state now lives on the
  // URL so a refresh + deep-link can restore the open drawer + filter
  // pills. We mirror the URL into a small helper below; the underlying
  // setter is `setParams` so a single source of truth (the URL) drives
  // both the drawer and any browser back/forward.
  const costDrawerOpen = params.get('cost_outlook_open') === '1';
  const setCostDrawerOpen = (open: boolean) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (open) next.set('cost_outlook_open', '1');
      else next.delete('cost_outlook_open');
      return next;
    }, { replace: true });

  const auditDrawerOpen = params.get('audit_open') === '1';
  const setAuditDrawerOpen = (open: boolean) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (open) next.set('audit_open', '1');
      else next.delete('audit_open');
      return next;
    }, { replace: true });
  const [auditBadge, setAuditBadge] = useState(0);

  // Phase 8 — simulation drawer is keyed on the option price (the URL
  // carries the option price so a refresh re-opens the same simulation).
  const simulationDrawerOpen = params.get('simulation_open') != null;
  const simulationPrice = params.get('simulation_open') ?? '';
  const setSimulationDrawerOpen = (open: boolean, price?: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (open) next.set('simulation_open', price ?? simulationPrice);
      else next.delete('simulation_open');
      return next;
    }, { replace: true });
  const compareDrawerOpen = params.get('compare_open') === '1';
  const setCompareDrawerOpen = (open: boolean) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (open) next.set('compare_open', '1');
      else next.delete('compare_open');
      return next;
    }, { replace: true });
  // Pre-fill for the ABTestCard when the user opts in via "Run as A/B"
  // from the SimulationDrawer.
  const [abPrefill, setAbPrefill] = useState<{ variant: string; control: string } | null>(null);

  // Phase 6 — Batch repricing state. Mode + the staged AID set live on
  // the URL so refresh / deep-link preserves them; the active batch_id
  // (post-preview) also lives there so a refresh re-loads the same batch.
  const urlMode = (params.get('mode') as SkuPickerMode | null) ?? null;
  const [pickerMode, setPickerMode] = useState<SkuPickerMode>(
    urlMode === 'batch' ? 'batch' : 'single',
  );
  const urlBatchAids = useMemo(() => {
    const raw = params.get('batch_aids') ?? params.get('aids');
    return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }, [params]);
  const [batchAids, setBatchAids] = useState<string[]>(urlBatchAids);
  const urlBatchId = params.get('batch_id');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(urlBatchId);
  const [batchLockedAids, setBatchLockedAids] = useState<string[]>([]);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);
  const [staleBatchAids, setStaleBatchAids] = useState<Set<string>>(new Set());

  // Phase 21 — SKU-picker clicks must update the URL so refresh preserves
  // the selection. Wrap setSelectedAid + setSearchParams in a single handler
  // so the existing SkuPicker prop contract is unchanged.
  const handleSelectSku = (aid: string) => {
    setSelectedAid(aid);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('aid', aid);
      return next;
    });
  };

  useEffect(() => {
    document.body.classList.add('pz-fullbleed');
    return () => {
      document.body.classList.remove('pz-fullbleed');
    };
  }, []);

  // If the URL aid changes (e.g. user navigates from another deep-link
  // CTA), re-select. Local picks win until the URL aid changes again.
  useEffect(() => {
    if (urlAid) setSelectedAid(urlAid);
  }, [urlAid]);

  // Pricing Studio plan B3 — customer-scope auto-select. When the URL
  // carries `?customer=` (no `?aid`), pick the first SKU returned by the
  // BFF (which is ordered by impact, so this lands on the highest-impact
  // / highest-margin SKU the customer buys — answer to plan §11 Q2).
  // Local picks win after the user clicks something else.
  useEffect(() => {
    if (urlAid) return;
    if (!urlCustomerId) return;
    if (selectedAid) return;
    const firstAid = data?.skus?.[0]?.aid;
    // setState in an effect is intentional here: we wait for the
    // customer-scoped shell to load, then promote the highest-impact
    // SKU as the initial selection. The plan §11 Q2 answer.
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    if (firstAid) setSelectedAid(firstAid);
  }, [urlCustomerId, urlAid, data?.skus]);

  const effectiveAid = selectedAid ?? data?.defaultAid ?? '';
  // Pricing Studio v3 / Phase 13 (p13) — per-SKU workbench, lazy-fetched.
  // The shell endpoint no longer carries per-aid recommendation/wtp/fanout
  // for every SKU; this hook fetches the enriched workbench for the
  // currently selected aid and we prefer its data over the static seed
  // returned by `useStudio`.
  const wbQuery = useStudioWorkbench(effectiveAid || null);
  // Phase 7 — derive a proposal id for DecisionFooter's Push-to-quoting +
  // Branded PDF buttons. We pick the most recently updated non-rejected
  // proposal for the open SKU, scoped to the deep-link recommendation when
  // one is present (so a user landing from Action Center sees the right
  // proposal). The hook is enabled-only when an aid is known.
  const proposalsForAid = useProposals({
    article_id: effectiveAid || undefined,
    recommendation_id: params.get('recommendation') ?? undefined,
  });
  const latestProposalId = useMemo(() => {
    const items = proposalsForAid.data?.items ?? [];
    const live = items.filter((p) => p.status !== 'rejected');
    if (live.length === 0) return null;
    // useProposals returns rows in BFF order — fall back to ISO compare.
    const sorted = [...live].sort((a, b) =>
      (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
    );
    return sorted[0]?.id ?? null;
  }, [proposalsForAid.data]);
  const selectedSku = useMemo(
    () => data?.skus.find((s) => s.aid === effectiveAid) ?? null,
    [data, effectiveAid],
  );
  // Phase 2 acceptance: when ?aid= points at an unknown SKU we must NOT
  // navigate away — render an explicit "SKU not found" banner instead.
  const requestedSkuMissing = Boolean(
    urlAid && data && !data.skus.some((s) => s.aid === urlAid),
  );

  const heroView: HeroView | null = useMemo(() => {
    if (!data) return null;
    // Pricing Studio v3 / Phase 13 (p13) — prefer the per-aid workbench
    // hero when it has loaded so the panel reflects the selected SKU
    // immediately (rather than the static seed for the default AID).
    const liveHero = wbQuery.data?.hero;
    if (liveHero) {
      return {
        eyebrow: liveHero.eyebrow,
        title: liveHero.title,
        sub: liveHero.sub,
        chips: liveHero.chips,
        meta: liveHero.meta,
        currentPrice: liveHero.currentPrice,
        currentMargin: liveHero.currentMargin,
        currentMarginTone: liveHero.currentMarginTone,
        targetText: liveHero.targetText,
      };
    }
    if (effectiveAid === data.defaultAid) {
      const h = data.workbench.hero;
      return {
        eyebrow: h.eyebrow,
        title: h.title,
        sub: h.sub,
        chips: h.chips,
        meta: h.meta,
        currentPrice: h.currentPrice,
        currentMargin: h.currentMargin,
        currentMarginTone: h.currentMarginTone,
        targetText: h.targetText,
      };
    }
    if (selectedSku?.shortHero) {
      return {
        eyebrow: data.workbench.hero.eyebrow,
        title: selectedSku.shortHero.title,
        sub: selectedSku.shortHero.sub,
        chips: [
          { label: selectedSku.shortHero.chipCluster },
          { label: selectedSku.locked ? 'Locked' : 'Movable', variant: 'movable' },
          { label: 'A/B status: not yet tested', variant: 'dashed' },
          { label: selectedSku.shortHero.chipApproval },
        ],
        meta: selectedSku.shortHero.meta,
        currentPrice: selectedSku.shortHero.currentPrice,
        currentMargin: selectedSku.shortHero.currentMargin,
        currentMarginTone: selectedSku.shortHero.currentMarginTone,
        targetText: selectedSku.shortHero.targetText,
      };
    }
    return {
      eyebrow: data.workbench.hero.eyebrow,
      title: `Article ${effectiveAid}`,
      sub: 'No detailed workbench data — showing default model.',
      chips: data.workbench.hero.chips,
      meta: data.workbench.hero.meta,
      currentPrice: data.workbench.hero.currentPrice,
      currentMargin: data.workbench.hero.currentMargin,
      currentMarginTone: data.workbench.hero.currentMarginTone,
      targetText: data.workbench.hero.targetText,
    };
  }, [data, effectiveAid, selectedSku, wbQuery.data]);

  // Pricing Studio v3 / Phase 2 — when the user picks a price option,
  // surface it as a Decimal-as-string so the BFF round-trip preserves
  // precision (formatted strings like "€5.10" lose currency context).
  // Hooks MUST run before the early-return below — React's rules of
  // hooks require a stable call order across renders.
  const proposedPriceDecimal = useMemo(() => {
    if (!activeOption?.price) return null;
    const cleaned = activeOption.price.replace(/[^\d,.\-]/g, '').replace(',', '.');
    const n = parseDecimal(cleaned);
    return Number.isFinite(n) && n > 0 ? cleaned : null;
  }, [activeOption?.price]);

  // F3: re-score the customer fanout at the selected price. The hook is
  // a no-op until both aid and proposed_price are non-empty; switching
  // back to a previously-selected price is a cache hit.
  const rescored = useFanoutRescore(effectiveAid, proposedPriceDecimal, {
    enabled: Boolean(proposedPriceDecimal) && Boolean(effectiveAid),
  });

  // Phase 7 — toast for `pricing.price_rolled_back`. The hero current-price
  // tile flip is already handled by useLivePricing's ['studio'] invalidation;
  // we just surface the rollback as a transient toast.
  const pushToast = useActionFeedbackStore((s) => s.pushToast);

  // Phase 4 — SSE channel for `audit.appended`. The audit drawer subscribes
  // to the same topic locally so it can drive its flash highlight; this
  // page-level subscription drives the badge counter + invalidates the
  // audit-feed cache so a refresh of the (closed) drawer is up-to-date.
  const auditStream = usePricingStream({
    topic: 'audit',
    aid: effectiveAid || null,
    enabled: Boolean(effectiveAid),
  });
  const lastAuditEventTsRef = useRef<number | null>(null);

  // Phase 5 — SSE channel for `proposal.*` topics. When the backend emits
  // proposal.submitted / approved / rejected / changes_requested / recalled
  // / commented we invalidate the approval-instance + approval-inbox query
  // caches so any open stepper or inbox refetches within ~1s.
  const proposalStream = usePricingStream({
    topic: 'proposal',
    aid: effectiveAid || null,
    enabled: Boolean(effectiveAid),
  });
  const lastProposalEventTsRef = useRef<number | null>(null);

  // F4: SSE-driven cache invalidation for the fanout block.
  // `useLivePricing` already invalidates the studio key on every tick;
  // we additionally drop the per-price fanout cache so the re-score
  // hook re-fetches on customer_state_updated.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!live.lastTickAt) return;
    queryClient.invalidateQueries({ queryKey: ['studio-fanout'] });
    queryClient.invalidateQueries({ queryKey: ['customer-drill-in'] });
    // Phase 3 — `pricing.cost_moved` flows through `useLivePricing` already
    // (it invalidates ['studio']). Additionally drop the cost-outlook
    // cache so the drawer reloads fresh data on the next render.
    queryClient.invalidateQueries({ queryKey: ['cost-outlook'] });
    // Phase 13 (p13) — drop the per-aid workbench cache so the next render
    // refetches the enriched recommendation/wtp/fanout block.
    queryClient.invalidateQueries({ queryKey: ['studio-workbench'] });
  }, [live.lastTickAt, queryClient]);

  // Phase 7 — react to `pricing.price_set` and `pricing.price_rolled_back`.
  //   - price_set        → invalidate the local price-book cache so the
  //                        Publish drawer reflects the new active row.
  //                        The hero "Live since…" stamp flips through the
  //                        ['studio'] invalidation already wired by
  //                        `useLivePricing`.
  //   - price_rolled_back → toast + price-book invalidation.
  useEffect(() => {
    const evt = pricingStream.lastEvent;
    if (!evt) return;
    if (
      evt.topic !== 'pricing.price_set' &&
      evt.topic !== 'pricing.price_rolled_back'
    ) {
      return;
    }
    if (evt.aid && effectiveAid && evt.aid !== effectiveAid) return;
    if (lastPricingPushEventTsRef.current === evt.ts) return;
    lastPricingPushEventTsRef.current = evt.ts;

    if (effectiveAid) {
      queryClient.invalidateQueries({ queryKey: priceBookKey(effectiveAid) });
    }

    if (evt.topic === 'pricing.price_rolled_back') {
      const reason =
        (evt.payload as Record<string, unknown> | undefined)?.reason;
      const label =
        typeof reason === 'string' && reason
          ? `Price rolled back: ${reason}`
          : `Price rolled back on ${evt.aid ?? effectiveAid}.`;
      pushToast(label, 'warning');
    }
  }, [pricingStream.lastEvent, effectiveAid, queryClient, pushToast]);

  // Phase 4 — react to `audit.appended` events:
  //   - invalidate the audit feed cache so the open drawer re-fetches
  //   - if the drawer is CLOSED, bump the "new audit" badge counter
  // Resets when the drawer opens (the badge represents "unseen" events).
  useEffect(() => {
    const evt = auditStream.lastEvent;
    if (!evt) return;
    if (evt.topic !== 'audit.appended') return;
    if (evt.aid && effectiveAid && evt.aid !== effectiveAid) return;
    if (lastAuditEventTsRef.current === evt.ts) return;
    lastAuditEventTsRef.current = evt.ts;
    queryClient.invalidateQueries({ queryKey: auditFeedKey(effectiveAid, { pills: [] }) });
    queryClient.invalidateQueries({ queryKey: ['audit', effectiveAid] });
    if (!auditDrawerOpen) {
      setAuditBadge((c) => c + 1);
    }
  }, [auditStream.lastEvent, effectiveAid, auditDrawerOpen, queryClient]);

  // Opening the drawer clears the badge.
  useEffect(() => {
    if (auditDrawerOpen) setAuditBadge(0);
  }, [auditDrawerOpen]);

  // Phase 6 — fetch the active batch (preview + items + KPI). The hook
  // is enabled only when an activeBatchId is set; switching batches is
  // a cache hit once the user has previewed.
  const batchQuery = useBatch(activeBatchId);
  const activeBatch = batchQuery.data ?? null;

  // Phase 6 — URL ↔ state sync. Mode + batch AIDs + active batch id all
  // round-trip through search params so refresh + deep links preserve
  // the working set.
  useEffect(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (pickerMode === 'batch') next.set('mode', 'batch');
      else next.delete('mode');
      if (batchAids.length > 0) next.set('batch_aids', batchAids.join(','));
      else {
        next.delete('batch_aids');
        next.delete('aids');
      }
      if (activeBatchId) next.set('batch_id', activeBatchId);
      else next.delete('batch_id');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerMode, batchAids, activeBatchId]);

  // Phase 6 — dedicated pricing.cost_moved subscription. The shell-wide
  // `usePricingStream` instance bound to the selected AID won't fire for
  // cost moves on OTHER AIDs in the staged batch, so we open a second
  // stream scoped to the batch's first AID (the bus filters per-key, but
  // any in-batch hit is relevant — we de-dupe via the Set below).
  const costStream = usePricingStream({
    topic: 'pricing',
    aid: batchAids[0] ?? null,
    enabled: pickerMode === 'batch' && batchAids.length >= 1,
  });
  useEffect(() => {
    const evt = costStream.lastEvent ?? null;
    if (!evt) return;
    if (evt.topic !== 'pricing.cost_moved') return;
    const movedAid = evt.aid;
    if (!movedAid) return;
    const inBatch =
      batchAids.includes(movedAid) ||
      activeBatch?.items.some((it) => it.aid === movedAid);
    if (!inBatch) return;
    setStaleBatchAids((prev) => {
      if (prev.has(movedAid)) return prev;
      const next = new Set(prev);
      next.add(movedAid);
      return next;
    });
  }, [costStream.lastEvent, batchAids, activeBatch]);

  // Re-run when proposal events affect a batch's proposal_ids.
  useEffect(() => {
    const evt = proposalStream.lastEvent;
    if (!evt) return;
    if (!evt.topic.startsWith('proposal.')) return;
    if (!activeBatchId) return;
    const proposalId = (evt.payload as Record<string, unknown>)?.proposal_id;
    if (typeof proposalId !== 'string') return;
    const inBatch = activeBatch?.items.some((it) => it.proposal_id === proposalId);
    if (!inBatch) return;
    queryClient.invalidateQueries({ queryKey: batchKey(activeBatchId) });
  }, [proposalStream.lastEvent, activeBatch, activeBatchId, queryClient]);

  // Phase 6 — handlers for the picker + workbench + drawer.
  const handleModeChange = (mode: SkuPickerMode) => {
    setPickerMode(mode);
    if (mode === 'single') {
      // Leaving batch mode discards the staged batch but keeps the
      // URL aid intact so the user lands on a sensible single workbench.
      setBatchAids([]);
      setActiveBatchId(null);
      setBatchLockedAids([]);
      setStaleBatchAids(new Set());
    }
  };

  const handleToggleAid = (aid: string) => {
    setBatchAids((prev) =>
      prev.includes(aid) ? prev.filter((x) => x !== aid) : [...prev, aid],
    );
  };

  const handleBuildBatch = (aids: string[]) => {
    // Build batch in the URL: switch to batch mode, persist aids, drop
    // any prior batch_id. The Batch Workbench renders + the user previews.
    setBatchAids(aids);
    setActiveBatchId(null);
    setBatchLockedAids([]);
    setStaleBatchAids(new Set());
  };

  const handleBatchCreated = (batchId: string) => {
    setActiveBatchId(batchId);
    setStaleBatchAids(new Set());
  };

  const handleToggleLock = (aid: string) => {
    setBatchLockedAids((prev) =>
      prev.includes(aid) ? prev.filter((x) => x !== aid) : [...prev, aid],
    );
  };

  const handleCommitClick = () => {
    setBatchDrawerOpen(true);
  };

  const handleBatchCancelled = () => {
    setActiveBatchId(null);
    setBatchAids([]);
    setBatchLockedAids([]);
    setStaleBatchAids(new Set());
    setBatchDrawerOpen(false);
  };

  const handleBatchCommitted = () => {
    setActiveBatchId(null);
    setBatchAids([]);
    setBatchLockedAids([]);
    setStaleBatchAids(new Set());
    setBatchDrawerOpen(false);
    setPickerMode('single');
  };

  // Open lineage / single-SKU workbench for a batch row.
  const handleOpenLineageForAid = (aid: string) => {
    setSelectedAid(aid);
    setPickerMode('single');
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('aid', aid);
      next.delete('mode');
      return next;
    });
  };

  const inBatchMode = pickerMode === 'batch' && batchAids.length >= 2;
  const scopeFilterForCreate: ScopeFilter = useMemo(() => {
    const f: ScopeFilter = {};
    if (studioParams.tier) f.tier = [studioParams.tier];
    if (studioParams.family) f.family = [studioParams.family];
    if (studioParams.cluster) f.cluster = [studioParams.cluster];
    return f;
  }, [studioParams.tier, studioParams.family, studioParams.cluster]);

  // Phase 5 — react to `proposal.*` events: invalidate the approval
  // instance cache for any open stepper + the global approval inbox.
  useEffect(() => {
    const evt = proposalStream.lastEvent;
    if (!evt) return;
    if (!evt.topic.startsWith('proposal.')) return;
    if (lastProposalEventTsRef.current === evt.ts) return;
    lastProposalEventTsRef.current = evt.ts;
    queryClient.invalidateQueries({ queryKey: ['approval-instance'] });
    queryClient.invalidateQueries({ queryKey: approvalInboxKey() });
    queryClient.invalidateQueries({ queryKey: ['pricing-proposals'] });
  }, [proposalStream.lastEvent, queryClient]);

  // Pricing Studio v3 / Phase 11 — keyboard shortcuts (j/k for SKU nav,
  // ?-to-open cheat sheet, a-to-Action Center). We register the hook here
  // so the listener is active for the whole studio page.
  const skuListForKb = data?.skus ?? [];
  const navigateToSku = (delta: number) => {
    if (skuListForKb.length === 0) return;
    const currentIdx = skuListForKb.findIndex(
      (s) => s.aid === (selectedAid ?? data?.defaultAid),
    );
    const base = currentIdx === -1 ? 0 : currentIdx;
    const nextIdx = (base + delta + skuListForKb.length) % skuListForKb.length;
    const nextAid = skuListForKb[nextIdx]?.aid;
    if (nextAid) handleSelectSku(nextAid);
  };
  useStudioKeyboardShortcuts({
    onNextSku: () => navigateToSku(1),
    onPrevSku: () => navigateToSku(-1),
    onOpenActionCenter: () => navigate('/action-center?source=studio'),
    onOpenCheatSheet: () => setCheatSheetOpen(true),
  });

  if (isLoading || !data || !heroView) {
    return <StudioSkeleton />;
  }
  // Phase C regression fix — when the user lands on (or navigates to) a
  // non-default aid via deep-link, the per-aid workbench is fetched
  // lazily via `useStudioWorkbench`. While that fetch is in flight we
  // must NOT fall through to `data.workbench` (the shell's default-aid
  // payload), because consumers below assume `wb` is shaped for the
  // currently-selected aid. Render the skeleton until the per-aid
  // workbench arrives.
  const needsLazyWorkbench =
    Boolean(effectiveAid) &&
    effectiveAid !== data.defaultAid &&
    !selectedSku?.workbench;
  if (needsLazyWorkbench && wbQuery.isLoading && !wbQuery.data) {
    return <StudioSkeleton />;
  }

  const showComparable = selectedSku?.isNew ?? false;
  // Pricing Studio v3 / Phase 13 (p13) — prefer the per-aid workbench
  // fetched by `useStudioWorkbench` so recommendation/wtp/fanout/etc.
  // reflect the selected SKU. Falls back to the SKU row's bundled
  // workbench (legacy mock mode) and finally to the shell seed.
  //
  // Phase C regression fix — accept the per-aid response only if it
  // carries the required `options` block; otherwise prefer the bundled
  // SKU workbench (or the shell seed) so downstream consumers always
  // see a fully-shaped workbench. This guards against partial/empty
  // BFF payloads tripping the React error boundary.
  const lazyWb = wbQuery.data;
  const lazyWbReady = Boolean(lazyWb && (lazyWb as { options?: unknown }).options);
  const wb = (lazyWbReady ? lazyWb : null) ?? selectedSku?.workbench ?? data.workbench;
  // Phase C — non-default SKUs may not carry the legacy `fanout`/`options`
  // blocks if the BFF returned them as empty/locked. Read defensively so
  // the page renders the locked/empty UI instead of crashing.
  const fanPrice = activeOption?.price ?? wb?.fanout?.fanPrice ?? null;

  // The fanout block we render: default workbench block when no price
  // option is selected; re-scored block otherwise. Both share the same
  // wire shape — `CustomerFanoutBlock`.
  const fanoutBlock = rescored.data ?? wb?.customer_fanout ?? null;

  // Phase 1 — derive a numeric current price for Δ calculations. The
  // existing heroView.currentPrice is a pre-formatted string ("€118.00").
  // We strip non-digits + parse so the new tiles can compute one delta
  // without forcing the BFF to ship a parallel numeric field.
  const currentPriceValue = (() => {
    const cleaned = (heroView.currentPrice ?? '').replace(/[^\d,.\-]/g, '').replace(',', '.');
    const n = parseDecimal(cleaned);
    return Number.isFinite(n) ? n : undefined;
  })();
  // Pre-formatted current margin (string) — used as the "Projected DB2 at
  // current" subtitle on the KPI tiles. Real projected-DB2 at recommended
  // ships in Phase 3 with option_margin.
  const deepLinkSource = params.get('source');

  return (
    <LineageDrawerProvider>
      <StudioUrlSyncBridge />
      <section id="screen-studio" className="w-full px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <PageHead header={data.header} dataThrough={data.dataThrough ?? null} />
          </div>
          {/* TODO §5.6: lift the bell into the app shell once placement
              is settled. For now it sits in the Studio page header so
              Phase 5 is functionally complete. Phase 9 adds the alerts
              bell next to it so Frank gets both queues in one glance. */}
          <div className="mt-2 flex shrink-0 items-center gap-2">
            <SavedViewsMenu />
            <AlertInboxBell />
            <ApprovalInboxBell />
          </div>
        </div>
        <DeepLinkBanner effectiveAid={effectiveAid} skuFound={!requestedSkuMissing} />
        <ActiveFiltersStrip />

        <div className="ws-grid">
          <SkuPicker
            skus={data.skus}
            filters={data.filters}
            toggles={data.toggles}
            selectedAid={effectiveAid}
            onSelect={handleSelectSku}
            mode={pickerMode}
            onModeChange={handleModeChange}
            selectedAids={batchAids}
            onToggleAid={handleToggleAid}
            onBuildBatch={handleBuildBatch}
            onSelectRange={(aids) => setBatchAids(aids)}
          />

          {inBatchMode ? (
            <div className="ws-bench">
              <BatchWorkbench
                aids={batchAids}
                batch={activeBatch}
                staleAids={staleBatchAids}
                lockedAids={batchLockedAids}
                onToggleLock={handleToggleLock}
                onBatchCreated={handleBatchCreated}
                onOpenLineageForAid={handleOpenLineageForAid}
                onCommitClick={handleCommitClick}
                onCancelClick={handleBatchCancelled}
                scopeFilter={scopeFilterForCreate}
              />
            </div>
          ) : (
          <div className="ws-bench">
            {/* Phase 9 — Live alert banner. Subscribes to the pricing SSE
                stream and surfaces a dismissible amber pill when an alert
                fires on the current SKU. */}
            <AlertBanner aid={effectiveAid} />

            <WorkbenchHero
              hero={heroView}
              onOpenAudit={() => setAuditDrawerOpen(true)}
              auditBadge={auditBadge}
            />

            {/* Phase 4 — "What changed since you last looked" strip.
                Renders only when the diff endpoint returns changes;
                click rows to deep-link or open the AuditDrawer. */}
            <WhatChangedStrip
              aid={effectiveAid}
              cluster={studioParams.cluster ?? null}
              onOpenAudit={() => setAuditDrawerOpen(true)}
            />

            {/* Phase 3 — Deep-link trigger banner. Persists for the
                session; clicking the body opens the Cost Trajectory
                Drawer; the inline link routes to the originating screen. */}
            <TriggerBanner
              trigger={wb?.trigger_context ?? null}
              onOpenCostDrawer={() => setCostDrawerOpen(true)}
            />

            {/* Phase 1 — Recommendation hero card replaces the top-of-page
                price options. Reads typed BFF blocks; PriceOptions is
                demoted to a compact alternatives row below. */}
            <RecommendationHero
              aid={effectiveAid}
              recommendation={wb?.recommendation}
              wtp={wb?.wtp}
              winProbCurve={wb?.win_prob_curve}
              competitorRef={wb?.competitor_ref}
              currentPriceLabel={heroView.currentPrice}
              currentPriceValue={currentPriceValue}
              lastTickAt={live.lastTickAt}
              source={deepLinkSource}
            />

            <RecommendationKpiTiles
              aid={effectiveAid}
              recommendation={wb?.recommendation}
              winProbCurve={wb?.win_prob_curve}
              wtp={wb?.wtp}
              currentPriceLabel={heroView.currentPrice}
              currentPriceValue={currentPriceValue}
              currentMarginLabel={heroView.currentMargin}
              // Phase 3 will wire projectedDb2Label from wb.option_margin.
            />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <WinProbCurve
                curve={wb?.win_prob_curve}
                recommendedPrice={wb?.recommendation?.recommended_price}
                nDeals={wb?.win_prob_curve?.n_deals ?? null}
                blockStatus={wb?.meta?.blocks?.win_prob_curve ?? null}
              />
              <DriverWaterfall
                drivers={wb?.recommendation?.drivers}
                emphasiseFloor={deepLinkSource === 'margin'}
              />
            </div>

            <WtpBandStrip
              wtp={wb?.wtp}
              recommendedPrice={wb?.recommendation?.recommended_price}
              floor={wb?.recommendation?.band?.min}
              blockStatus={wb?.meta?.blocks?.wtp ?? null}
              className="mt-3"
            />

            <PriceOptions
              options={wb?.options}
              optionsSub={wb?.optionsSub}
              onActiveChange={setActiveOption}
              compact
              optionMargins={wb?.option_margins}
              aid={effectiveAid}
              activeAbTest={wb?.active_ab_test ?? null}
              abTestControlPrice={
                abPrefill?.control ?? wb?.options?.hold?.price ?? null
              }
              abTestVariantPrice={
                abPrefill?.variant ?? wb?.options?.floor?.price ?? null
              }
              onSimulateOption={(price) => {
                setSimulationDrawerOpen(true, price);
              }}
              onOpenCompare={() => setCompareDrawerOpen(true)}
              onAbTestCreated={() => {
                // Clear the prefill so the active card reads from the
                // fresh ['studio'] invalidation rather than stale state.
                setAbPrefill(null);
              }}
            />

            {/* Pricing Studio v3 / Phase E — Evidence tabs host.
                Consolidates the right-column evidence panels (Cost ·
                Quotes · Customers · Comparable · Lineage) into a single
                tabbed surface so the recommendation hero stays on top.
                Quotes + Lineage are placeholders this pass — content
                arrives in follow-up E3 + E6 commits. */}
            <EvidenceTabs
              tabStatus={(() => {
                const blocks = wb?.meta?.blocks ?? {};
                const costStatus: EvidenceTabStatus =
                  blocks.cost_history?.status ?? 'empty';
                const customersStatus: EvidenceTabStatus =
                  blocks.customer_fanout?.status ?? 'empty';
                const comparableStatus: EvidenceTabStatus = !showComparable
                  ? 'locked'
                  : blocks.comparable?.status ?? 'empty';
                return {
                  cost: costStatus,
                  quotes: 'empty', // E3 — populated in follow-up.
                  customers: customersStatus,
                  comparable: comparableStatus,
                  lineage: 'empty', // E6 — populated in follow-up.
                } satisfies Record<EvidenceTabKey, EvidenceTabStatus>;
              })()}
              panes={{
                cost: (
                  <CostHistory
                    aid={effectiveAid}
                    cost={wb?.cost}
                    history={wb?.history}
                    costHistory={wb?.cost_history ?? null}
                    costHistoryStatus={wb?.meta?.blocks?.cost_history ?? null}
                    onOpenCostDrawer={() => setCostDrawerOpen(true)}
                  />
                ),
                quotes: (
                  <EvidencePanePlaceholder copy="Quote history coming in next pass" />
                ),
                customers: (
                  <CustomerFanout
                    data={wb?.fanout}
                    fanPrice={fanPrice}
                    block={fanoutBlock}
                    proposedPriceDecimal={proposedPriceDecimal}
                    aid={effectiveAid}
                    blockMeta={wb?.meta?.blocks?.customer_fanout ?? null}
                  />
                ),
                comparable: showComparable ? (
                  <ComparablePanelGate
                    data={data.comparable}
                    meta={wb?.meta?.blocks?.comparable ?? null}
                  />
                ) : (
                  <EvidencePanePlaceholder copy="Comparable cluster only shown for new SKUs." />
                ),
                lineage: (
                  <EvidencePanePlaceholder copy="Lineage view coming in next pass" />
                ),
              }}
            />

            <ProposalContextPanel
              articleId={effectiveAid}
              recommendationId={params.get('recommendation')}
            />

            <DecisionFooter
              data={wb?.decision}
              activeOption={activeOption}
              currentPriceLabel={heroView.currentPrice}
              proposalId={latestProposalId}
              onScrollToApproval={() => {
                window.setTimeout(() => {
                  const el = document.getElementById('proposal-context-panel');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
              }}
            />

            <RationaleMemo
              aid={effectiveAid}
              data={wb?.memo}
              blockMeta={wb?.meta?.blocks?.memo ?? null}
            />
          </div>
          )}
        </div>

        <CrossLinks
          links={data.crossLinks}
          aid={effectiveAid}
          cluster={selectedSku?.cluster ?? studioParams.cluster ?? null}
        />
        <KeyboardCheatSheet open={cheatSheetOpen} onOpenChange={setCheatSheetOpen} />
        <LineageDrawer aid={effectiveAid} />
        <BatchApprovalDrawer
          open={batchDrawerOpen}
          onOpenChange={setBatchDrawerOpen}
          batch={activeBatch}
          lockedAids={batchLockedAids}
          onCommitted={handleBatchCommitted}
          onCancelled={handleBatchCancelled}
        />
        <AuditDrawer
          open={auditDrawerOpen}
          onOpenChange={setAuditDrawerOpen}
          aid={effectiveAid}
          onScrollToProposalPanel={() => {
            // Defer to the next tick so the drawer close animation
            // doesn't fight the scroll.
            window.setTimeout(() => {
              const el = document.getElementById('proposal-context-panel');
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
          }}
        />
        <CostTrajectoryDrawer
          open={costDrawerOpen}
          onOpenChange={setCostDrawerOpen}
          aid={effectiveAid}
          cluster={selectedSku?.cluster ?? null}
          history={wb?.cost_history ?? null}
          horizonMonths={6}
        />
        {/* Phase 8 — Simulation Drawer. Opened by "Simulate this option"
            on any PriceOption. Read-only on the backend; we still wire
            "Set as proposal" and "Run as A/B" so the user can follow up. */}
        <SimulationDrawer
          open={simulationDrawerOpen}
          onOpenChange={setSimulationDrawerOpen}
          aid={effectiveAid}
          variantPrice={simulationPrice}
          controlPrice={(() => {
            const cleaned = (heroView.currentPrice ?? '')
              .replace(/[^\d,.\-]/g, '')
              .replace(',', '.');
            return cleaned || '0';
          })()}
          onProposalCreated={() => {
            // Phase 5's ProposalContextPanel reacts to the pricing-proposals
            // cache invalidation; scroll the user there so they can finish
            // the workflow.
            window.setTimeout(() => {
              const el = document.getElementById('proposal-context-panel');
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
          }}
          onRunAsAbTest={(variant, control) => {
            setAbPrefill({ variant, control });
            // Scroll to the PriceOptions so the user sees the pre-filled
            // ABTestCard.
            window.setTimeout(() => {
              const el = document.querySelector('[data-testid="ab-test-setup"]');
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
          }}
        />
        {/* Phase 8 — Compare Drawer. Triggered from PriceOptions header. */}
        <CompareDrawer
          open={compareDrawerOpen}
          onOpenChange={setCompareDrawerOpen}
          aid={effectiveAid}
          options={wb?.options}
          optionMargins={wb?.option_margins}
          winProbCurve={wb?.win_prob_curve}
          customerFanout={wb?.customer_fanout ?? null}
          currentPriceLabel={heroView.currentPrice}
        />
      </section>
    </LineageDrawerProvider>
  );
}

// Pricing Studio v3 / Phase 11 — opt-in lineage URL sync. Mounted inside
// `<LineageDrawerProvider>` so the hook can read the provider context.
function StudioUrlSyncBridge() {
  useLineageUrlSync();
  return null;
}

// Pricing Studio v3 / Phase C5 — gating wrapper for <ComparablePanel>. The
// panel only ever renders for new SKUs, and only when the BFF marks the
// ``meta.blocks.comparable`` block as ``live``. For ``locked`` / ``degraded``
// states we render a faded overlay over the (still-rendered) panel so
// Frank can see what would have been there + why it's not available.
function ComparablePanelGate({
  data,
  meta,
}: {
  data: import('@/types/studio').ComparablePanel;
  meta: import('@/types/studio').WorkbenchBlockMeta | null;
}) {
  const status = meta?.status ?? 'live';
  if (status === 'live') {
    return <ComparablePanel data={data} />;
  }
  if (status === 'empty') {
    // New-SKU + no comparable cluster yet — render a quiet placeholder.
    return (
      <div
        role="note"
        data-testid="comparable-panel-empty"
        style={{
          margin: '8px 0',
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--surface-sunken)',
          border: '1px dashed var(--hairline)',
          color: 'var(--ink-2)',
          fontSize: 12.5,
          lineHeight: 1.45,
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 12 }}>
          No comparable cluster yet
        </div>
        <div style={{ marginTop: 4 }}>
          {meta?.reason ??
            'New SKU has no similar items with enough history to anchor a price.'}
        </div>
      </div>
    );
  }
  // locked / degraded — overlay the panel so the shape stays visible but
  // it's clearly not actionable. Mirrors the Action Center pattern.
  const isLocked = status === 'locked';
  return (
    <div
      data-testid={`comparable-panel-${status}`}
      data-status={status}
      style={{ position: 'relative' }}
    >
      <div style={{ filter: 'blur(0.5px)', opacity: 0.5, pointerEvents: 'none' }}>
        <ComparablePanel data={data} />
      </div>
      <div
        role={isLocked ? 'note' : 'alert'}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: isLocked
            ? 'color-mix(in oklab, var(--surface-sunken) 75%, transparent)'
            : 'color-mix(in oklab, var(--amber-bg) 70%, transparent)',
          borderRadius: 12,
        }}
      >
        <div
          style={{
            maxWidth: 360,
            padding: '14px 16px',
            borderRadius: 12,
            background: 'white',
            border: isLocked
              ? '1px dashed var(--hairline)'
              : '1px solid color-mix(in oklab, var(--amber) 32%, white)',
            color: 'var(--ink-2)',
            fontSize: 12.5,
            lineHeight: 1.45,
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 12 }}>
            {isLocked ? 'Comparable panel is locked' : 'Comparable panel is degraded'}
          </div>
          <div style={{ marginTop: 4 }}>
            {meta?.reason ??
              (isLocked
                ? 'Data source not yet connected.'
                : 'Backend reported a partial failure computing comparables.')}
          </div>
        </div>
      </div>
    </div>
  );
}
