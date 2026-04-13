import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Search, Package, TrendingDown, UserMinus, Clock, DollarSign, Check, BarChart2, LogOut } from 'lucide-react';
import { dropdownVariants } from '../utils/animations';
import { useUI } from '../context/UIContext';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LanguageContext';
import { logout } from '../utils/auth';
import LanguageToggle from './LanguageToggle';
import forecastingData from '../data/forecasting.json';
import productsData from '../data/products.json';
import customersData from '../data/customers_detail.json';
import inventoryData from '../data/inventory_detail.json';

// Format helpers for search
const fmtEUR = (v) => { if (v == null) return '—'; const a = Math.abs(v); return a >= 1e6 ? `€${(a/1e6).toFixed(1)}M` : a >= 1e3 ? `€${(a/1e3).toFixed(0)}K` : `€${Math.round(a)}`; };
const fmtPct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—';

// Collect all commodity groups
const ALL_COMMODITY_GROUPS = [...new Set(productsData.products.map(p => p.commodity_group).filter(Boolean))].sort();

// Risk tier keys (translated in component via t())
const SKU_RISK_KEY = (p, margin) => {
  if (p.is_at_risk) return 'risk.atRisk';
  if (margin != null && margin < 0.50) return 'risk.critical';
  if (margin != null && margin < 0.55) return 'risk.monitor';
  return 'risk.ok';
};
const CUSTOMER_RISK_KEY = (tier) => {
  if (tier === 'high' || tier === 'critical') return 'risk.high';
  if (tier === 'medium') return 'risk.medium';
  return 'risk.low';
};

// Static portion of search index (not language-dependent: SKU codes, customer IDs, etc.)
const SEARCH_INDEX_BASE = (() => {
  const items = [];
  productsData.products.forEach((p) => {
    const margin = p.margin_2025 ?? p.margin_2024 ?? null;
    items.push({
      label: p.article_id,
      sublabel: p.description,
      category: 'SKU',
      path: '/products',
      revenue: p.total_revenue,
      margin,
      riskKey: SKU_RISK_KEY(p, margin),
      commodityGroup: p.commodity_group,
    });
  });
  customersData.customers.forEach((c) => {
    items.push({
      label: c.customer_id,
      sublabel: `${c.segment} · ${c.name}`,
      category: 'Customer',
      path: '/customers',
      revenue: c.total_revenue_eur,
      margin: c.avg_db2_margin,
      riskKey: CUSTOMER_RISK_KEY(c.risk_tier),
      commodityGroup: null,
    });
  });
  const groupSet = new Set();
  productsData.products.forEach((p) => {
    if (p.commodity_group && !groupSet.has(p.commodity_group)) {
      groupSet.add(p.commodity_group);
      items.push({
        label: p.commodity_group,
        sublabelTemplate: { count: productsData.products.filter(x => x.commodity_group === p.commodity_group).length },
        category: 'Category',
        rawCategory: p.commodity_group,
        path: '/products',
      });
    }
  });
  return items;
})();

// Page shortcuts use translation keys, resolved in component
const PAGE_SHORTCUTS = [
  { labelKey: 'nav.revenue', sublabelKey: 'pageShortcut.revenue', category: 'Page', path: '/revenue' },
  { labelKey: 'nav.forecasting', sublabelKey: 'pageShortcut.forecasting', category: 'Page', path: '/forecasting' },
  { labelKey: 'nav.pricing', sublabelKey: 'pageShortcut.pricing', category: 'Page', path: '/pricing' },
  { labelKey: 'nav.ml', sublabelKey: 'pageShortcut.ml', category: 'Page', path: '/ml-analytics' },
  { labelKey: 'nav.aiInsights', sublabelKey: 'pageShortcut.ai', category: 'Page', path: '/ai-insights' },
];

// Recent searches (session-only)
let _recentSearches = [];

// Static notification specs — the visible title/desc/time are looked up by
// translation key in the component, so the language is reactive.
const NOTIFICATION_SPECS = (() => {
  const fc = forecastingData.overall_forecast;
  const models = forecastingData.model_accuracy || [];
  const mc = forecastingData.monte_carlo?.overall;

  const specs = [];
  specs.push({
    id: 100,
    icon: BarChart2,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    titleKey: 'notif.forecast.updated.title',
    descKey: 'notif.forecast.updated.desc',
    descVars: {
      n: models.length,
      curr: `${(fc.current_margin * 100).toFixed(1)}%`,
      next: `${(fc.forecast_12m.predicted * 100).toFixed(1)}%`,
    },
    timeKey: 'time.today',
  });

  if (models[0]) {
    specs.push({
      id: 101,
      icon: BarChart2,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-500',
      titleKey: 'notif.forecast.bestModel.title',
      titleVars: { model: models[0].model.toUpperCase() },
      descKey: 'notif.forecast.bestModel.desc',
      descVars: {
        mae: models[0].mae.toFixed(3),
        acc: `${(models[0].directional_accuracy * 100).toFixed(0)}%`,
      },
      timeKey: 'time.today',
    });
  }

  if (mc) {
    specs.push({
      id: 102,
      icon: BarChart2,
      iconBg: 'bg-blue-50',
      iconColor: 'text-[#0393da]',
      titleKey: 'notif.forecast.monteCarlo.title',
      descKey: 'notif.forecast.monteCarlo.desc',
      descVars: {
        median: `${(mc.median * 100).toFixed(1)}%`,
        p5: `${(mc.p5 * 100).toFixed(1)}%`,
        p95: `${(mc.p95 * 100).toFixed(1)}%`,
        prob: `${(mc.prob_below_50pct * 100).toFixed(1)}%`,
      },
      timeKey: 'time.today',
    });
  }

  specs.push(
    {
      id: 1,
      icon: Package,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      titleKey: 'notif.cost.title',
      descKey: 'notif.cost.desc',
      timeKey: 'time.minutesAgo',
      timeVars: { n: 30 },
    },
    {
      id: 2,
      icon: TrendingDown,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      titleKey: 'notif.margin.title',
      descKey: 'notif.margin.desc',
      timeKey: 'time.hoursAgo',
      timeVars: { n: 2 },
    },
    {
      id: 3,
      icon: UserMinus,
      iconBg: 'bg-rose-50',
      iconColor: 'text-rose-500',
      titleKey: 'notif.churn.title',
      descKey: 'notif.churn.desc',
      timeKey: 'time.hoursAgo',
      timeVars: { n: 4 },
    },
    {
      id: 4,
      icon: Clock,
      iconBg: 'bg-blue-50',
      iconColor: 'text-[#0393da]',
      titleKey: 'notif.seasonal.title',
      descKey: 'notif.seasonal.desc',
      timeKey: 'time.hoursAgo',
      timeVars: { n: 6 },
    },
    {
      id: 5,
      icon: DollarSign,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-500',
      titleKey: 'notif.q1.title',
      descKey: 'notif.q1.desc',
      timeKey: 'time.daysAgo',
      timeVars: { n: 1 },
    },
  );

  return specs;
})();

export default function Header({ title }) {
  const navigate = useNavigate();
  const { openSKUDetail, openCategoryDetail, openCustomerDetail } = useUI();
  const user = useUser();
  const { t, lang } = useLanguage();
  const [showNotifications, setShowNotifications] = useState(false);
  // Track only the read-state; render uses translated NOTIFICATION_SPECS.
  const [readIds, setReadIds] = useState(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchTab, setSearchTab] = useState('All');
  const [commodityFilter, setCommodityFilter] = useState(null);
  const [recentSearches, setRecentSearches] = useState(_recentSearches);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  // Build a language-aware search index that includes page shortcuts and
  // commodity-group sublabels.
  const SEARCH_INDEX = useMemo(() => {
    const base = SEARCH_INDEX_BASE.map(item => {
      if (item.category === 'Category' && item.sublabelTemplate) {
        return {
          ...item,
          sublabel: lang === 'de'
            ? `Warengruppe — ${item.sublabelTemplate.count} Artikel`
            : `Commodity Group — ${item.sublabelTemplate.count} articles`,
        };
      }
      return item;
    });
    const shortcuts = PAGE_SHORTCUTS.map(s => ({
      label: t(s.labelKey),
      sublabel: t(s.sublabelKey),
      category: 'Page',
      path: s.path,
    }));
    return [...base, ...shortcuts];
  }, [lang, t]);

  const allResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return SEARCH_INDEX.filter(
      (item) => item.label.toLowerCase().includes(q) || (item.sublabel || '').toLowerCase().includes(q)
    );
  }, [searchQuery, SEARCH_INDEX]);

  const searchResults = useMemo(() => {
    let filtered = allResults;
    if (searchTab === 'SKUs') filtered = filtered.filter(i => i.category === 'SKU');
    else if (searchTab === 'Customers') filtered = filtered.filter(i => i.category === 'Customer');
    if (commodityFilter) filtered = filtered.filter(i => i.commodityGroup === commodityFilter || i.category === 'Customer' || i.category === 'Page' || i.category === 'Category');
    return filtered.slice(0, 12);
  }, [allResults, searchTab, commodityFilter]);

  const tabCounts = useMemo(() => ({
    All: allResults.length,
    SKUs: allResults.filter(i => i.category === 'SKU').length,
    Customers: allResults.filter(i => i.category === 'Customer').length,
  }), [allResults]);

  const addRecentSearch = (query) => {
    if (!query.trim()) return;
    _recentSearches = [query, ..._recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(_recentSearches);
  };

  useEffect(() => {
    function handleClickOutsideSearch(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearch(false);
      }
    }
    if (showSearch) {
      document.addEventListener('mousedown', handleClickOutsideSearch);
      return () => document.removeEventListener('mousedown', handleClickOutsideSearch);
    }
  }, [showSearch]);

  const notifications = useMemo(
    () => NOTIFICATION_SPECS.map(spec => ({
      ...spec,
      title: t(spec.titleKey, spec.titleVars),
      desc: t(spec.descKey, spec.descVars),
      time: t(spec.timeKey, spec.timeVars),
      read: readIds.has(spec.id),
    })),
    [t, readIds],
  );
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifications]);

  function markRead(id) {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function markAllRead() {
    setReadIds(new Set(NOTIFICATION_SPECS.map(s => s.id)));
  }

  return (
    <header className="h-16 flex items-center justify-between px-8 flex-shrink-0 relative z-30" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', boxShadow: '0 1px 0 rgba(26,26,46,0.04)' }}>
      <h2 className="text-lg font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>{title}</h2>
      <div className="flex items-center gap-4 flex-1 max-w-xl mx-8" ref={searchRef}>
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-10 pr-4 py-2 bg-white rounded-lg text-sm focus:ring-2 focus:ring-[#0393da]/20 focus:outline-none"
            style={{ border: '1px solid #edeeef' }}
            placeholder={t('header.search.placeholder')}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setCommodityFilter(null); setSearchTab('All'); }
              if (e.key === 'Enter' && searchResults.length > 0) {
                const item = searchResults[0];
                addRecentSearch(searchQuery);
                if (item.category === 'SKU') {
                  openSKUDetail(item.label);
                } else if (item.category === 'Customer') {
                  openCustomerDetail(item.label);
                } else if (item.category === 'Category') {
                  openCategoryDetail(item.rawCategory);
                } else {
                  navigate(item.path);
                }
                setSearchQuery('');
                setShowSearch(false);
                setCommodityFilter(null);
                setSearchTab('All');
              }
            }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setShowSearch(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          <AnimatePresence>
          {showSearch && (searchQuery.trim() || recentSearches.length > 0) && (
            <motion.div
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute top-full left-0 right-0 mt-1 border border-slate-200/80 rounded-2xl shadow-xl z-50 overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}
            >
              {/* Recent searches when no query */}
              {!searchQuery.trim() && recentSearches.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[10px] text-slate-400 uppercase font-bold mb-2">{t('header.search.recent')}</p>
                  {recentSearches.map((rs, i) => (
                    <button key={i} onClick={() => { setSearchQuery(rs); setShowSearch(true); }} className="block w-full text-left text-sm text-slate-600 hover:text-[#0393da] py-1 transition-colors">
                      {rs}
                    </button>
                  ))}
                </div>
              )}

              {/* Search results */}
              {searchQuery.trim() && (
                <>
                  {/* Tabs */}
                  <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-slate-100">
                    {[
                      { key: 'All', labelKey: 'header.search.tab.all' },
                      { key: 'SKUs', labelKey: 'header.search.tab.skus' },
                      { key: 'Customers', labelKey: 'header.search.tab.customers' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setSearchTab(tab.key)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          searchTab === tab.key ? 'bg-[#0393da] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {t(tab.labelKey)} ({tabCounts[tab.key]})
                      </button>
                    ))}
                  </div>

                  {/* Commodity filter pills */}
                  {(searchTab === 'All' || searchTab === 'SKUs') && (
                    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-50 overflow-x-auto">
                      <button
                        onClick={() => setCommodityFilter(null)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors flex-shrink-0 ${
                          !commodityFilter ? 'bg-[#004b72] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {t('header.search.filter.all')}
                      </button>
                      {ALL_COMMODITY_GROUPS.map(grp => (
                        <button
                          key={grp}
                          onClick={() => setCommodityFilter(commodityFilter === grp ? null : grp)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors flex-shrink-0 ${
                            commodityFilter === grp ? 'bg-[#004b72] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {grp}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Results */}
                  <div className="max-h-80 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-sm text-slate-400">{t('header.search.noResults', { query: searchQuery })}</p>
                        <p className="text-xs text-slate-300 mt-1">{t('header.search.tryHint')}</p>
                      </div>
                    ) : (
                      searchResults.map((item, i) => (
                        <button
                          key={`${item.category}-${item.label}-${i}`}
                          onClick={() => {
                            addRecentSearch(searchQuery);
                            if (item.category === 'SKU') {
                              openSKUDetail(item.label);
                            } else if (item.category === 'Customer') {
                              openCustomerDetail(item.label);
                            } else if (item.category === 'Category') {
                              openCategoryDetail(item.rawCategory);
                            } else {
                              navigate(item.path);
                            }
                            setSearchQuery('');
                            setShowSearch(false);
                            setCommodityFilter(null);
                            setSearchTab('All');
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#c1e8ff]/20 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0"
                        >
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-14 text-center flex-shrink-0 ${
                            item.category === 'SKU' ? 'bg-[#c1e8ff] text-[#004b72]' :
                            item.category === 'Customer' ? 'bg-green-50 text-green-600' :
                            item.category === 'Category' ? 'bg-purple-50 text-purple-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>{
                            item.category === 'SKU' ? t('search.cat.sku') :
                            item.category === 'Customer' ? t('search.cat.customer') :
                            item.category === 'Category' ? t('search.cat.category') :
                            t('search.cat.page')
                          }</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                            <p className="text-xs text-slate-400 truncate">{item.sublabel}</p>
                          </div>
                          {item.revenue != null && (
                            <span className="text-xs font-semibold text-slate-600 flex-shrink-0">{fmtEUR(item.revenue)}</span>
                          )}
                          {item.margin != null && (
                            <span className={`text-xs font-bold flex-shrink-0 ${item.margin < 0.50 ? 'text-red-600' : item.margin < 0.55 ? 'text-amber-600' : 'text-slate-700'}`}>
                              {fmtPct(item.margin)}
                            </span>
                          )}
                          {item.riskKey && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${
                              item.riskKey === 'risk.atRisk' || item.riskKey === 'risk.critical' || item.riskKey === 'risk.high' ? 'bg-red-50 text-red-600' :
                              item.riskKey === 'risk.monitor' || item.riskKey === 'risk.medium' ? 'bg-amber-50 text-amber-600' :
                              'bg-green-50 text-green-600'
                            }`}>{t(item.riskKey)}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center gap-6">
        {/* Language Toggle */}
        <LanguageToggle />

        {/* Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications(prev => !prev)}
            className="relative text-slate-500 hover:text-[#0393da] transition-colors"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white px-1">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
          {showNotifications && (
            <motion.div
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute right-0 top-full mt-2 w-96 rounded-2xl border border-slate-200/80 shadow-xl z-50 overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">{t('header.notifications.title')}</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-[#0393da] hover:text-[#0280bd] transition-colors"
                  >
                    <Check size={12} />
                    {t('header.notifications.markAll')}
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.map(n => {
                  const Icon = n.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                        n.read ? 'opacity-60' : ''
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg ${n.iconBg} flex items-center justify-center ${n.iconColor} flex-shrink-0`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-slate-800 truncate">{n.title}</p>
                          {!n.read && <span className="w-2 h-2 bg-[#0393da] rounded-full flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{n.desc}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">{n.time}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
          <div className="text-right">
            <p className="text-sm font-bold leading-none">{user?.name || t('header.user.fallback')}</p>
            <p className="text-xs text-slate-500 mt-1">{user?.role || ''}</p>
          </div>
          <div className="size-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #0393da, #c1e8ff)' }}>
            {user?.initials || 'U'}
          </div>
          <button
            onClick={logout}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title={t('header.logout')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
