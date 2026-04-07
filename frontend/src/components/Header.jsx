import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Search, Package, TrendingDown, UserMinus, Clock, DollarSign, Check, BarChart2, LogOut } from 'lucide-react';
import { dropdownVariants } from '../utils/animations';
import { useUI } from '../context/UIContext';
import { useUser } from '../context/UserContext';
import { logout } from '../utils/auth';
import forecastingData from '../data/forecasting.json';
import productsData from '../data/products.json';
import customersData from '../data/customers_detail.json';
import inventoryData from '../data/inventory_detail.json';

// Format helpers for search
const fmtEUR = (v) => { if (v == null) return '—'; const a = Math.abs(v); return a >= 1e6 ? `€${(a/1e6).toFixed(1)}M` : a >= 1e3 ? `€${(a/1e3).toFixed(0)}K` : `€${Math.round(a)}`; };
const fmtPct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—';

// Collect all commodity groups
const ALL_COMMODITY_GROUPS = [...new Set(productsData.products.map(p => p.commodity_group).filter(Boolean))].sort();

const SEARCH_INDEX = (() => {
  const items = [];
  productsData.products.forEach((p) => {
    const margin = p.margin_2025 ?? p.margin_2024 ?? null;
    const riskLabel = p.is_at_risk ? 'At Risk' : margin != null && margin < 0.50 ? 'Critical' : margin != null && margin < 0.55 ? 'Monitor' : 'OK';
    items.push({
      label: p.article_id,
      sublabel: p.description,
      category: 'SKU',
      path: '/products',
      revenue: p.total_revenue,
      margin,
      riskLabel,
      commodityGroup: p.commodity_group,
    });
  });
  customersData.customers.forEach((c) => {
    const riskLabel = c.risk_tier === 'high' || c.risk_tier === 'critical' ? 'High' : c.risk_tier === 'medium' ? 'Medium' : 'Low';
    items.push({
      label: c.customer_id,
      sublabel: `${c.segment} · ${c.name}`,
      category: 'Customer',
      path: '/customers',
      revenue: c.total_revenue_eur,
      margin: c.avg_db2_margin,
      riskLabel,
      commodityGroup: null,
    });
  });
  // Unique commodity groups
  const groupSet = new Set();
  productsData.products.forEach((p) => {
    if (p.commodity_group && !groupSet.has(p.commodity_group)) {
      groupSet.add(p.commodity_group);
      items.push({
        label: p.commodity_group,
        sublabel: `Commodity Group — ${productsData.products.filter(x => x.commodity_group === p.commodity_group).length} articles`,
        category: 'Category',
        rawCategory: p.commodity_group,
        path: '/products',
      });
    }
  });
  // Static page shortcuts
  items.push({ label: 'Revenue & Margins', sublabel: 'Revenue trends and margin analysis', category: 'Page', path: '/revenue' });
  items.push({ label: 'Forecasting', sublabel: 'Margin forecast with Monte Carlo simulation', category: 'Page', path: '/forecasting' });
  items.push({ label: 'Pricing & Quotes', sublabel: 'Pricing recommendations and quote management', category: 'Page', path: '/pricing' });
  items.push({ label: 'Cost Intelligence', sublabel: 'Cost analysis and supply chain optimization', category: 'Page', path: '/cost-intelligence' });
  items.push({ label: 'ML Analytics', sublabel: 'Model performance and validation', category: 'Page', path: '/ml-analytics' });
  items.push({ label: 'AI Insights', sublabel: 'Chat with your data', category: 'Page', path: '/ai-insights' });
  return items;
})();

// Recent searches (session-only)
let _recentSearches = [];

const buildForecastNotifications = () => {
  const notes = [];
  const fc = forecastingData.overall_forecast;
  const models = forecastingData.model_accuracy || [];
  const mc = forecastingData.monte_carlo?.overall;

  notes.push({
    id: 100,
    icon: BarChart2,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    title: 'Margin Forecast Updated',
    desc: `${models.length} models tested. Current margin: ${(fc.current_margin * 100).toFixed(1)}%. 12m forecast: ${(fc.forecast_12m.predicted * 100).toFixed(1)}%.`,
    time: 'Today',
    read: false,
  });

  if (models[0]) {
    notes.push({
      id: 101,
      icon: BarChart2,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-500',
      title: `Best Model: ${models[0].model.toUpperCase()}`,
      desc: `MAE ${models[0].mae.toFixed(3)}, directional accuracy ${(models[0].directional_accuracy * 100).toFixed(0)}%.`,
      time: 'Today',
      read: false,
    });
  }

  if (mc) {
    notes.push({
      id: 102,
      icon: BarChart2,
      iconBg: 'bg-blue-50',
      iconColor: 'text-[#0393da]',
      title: 'Monte Carlo Simulation Ready',
      desc: `Median margin: ${(mc.median * 100).toFixed(1)}% (P5: ${(mc.p5 * 100).toFixed(1)}%, P95: ${(mc.p95 * 100).toFixed(1)}%). ${(mc.prob_below_50pct * 100).toFixed(1)}% chance below 50%.`,
      time: 'Today',
      read: false,
    });
  }

  return notes;
};

const INITIAL_NOTIFICATIONS = [
  ...buildForecastNotifications(),
  {
    id: 1,
    icon: Package,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    title: 'Cost Alert: 12 Products High Expense',
    desc: '12 pump models showing material cost increases. Supply chain pressure detected. Action required.',
    time: '30m ago',
    read: false,
  },
  {
    id: 2,
    icon: TrendingDown,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    title: 'Margin Floor Breach — 7 Products',
    desc: '7 products below 25% margin floor. Manufacturing cost pressure compounding in Q1.',
    time: '2h ago',
    read: false,
  },
  {
    id: 3,
    icon: UserMinus,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    title: '24 Customers High Churn Risk',
    desc: 'ML model flagged 24 high-risk customers. Combined revenue at risk: €3.16M. Top 1% = 19.7% of revenue.',
    time: '4h ago',
    read: false,
  },
  {
    id: 4,
    icon: Clock,
    iconBg: 'bg-blue-50',
    iconColor: 'text-[#0393da]',
    title: 'March Seasonal Peak Approaching',
    desc: 'Seasonal index 1.64x — strongest month. Ensure manufacturing capacity and pipeline acceleration.',
    time: '6h ago',
    read: false,
  },
  {
    id: 5,
    icon: DollarSign,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    title: 'Q1 2026 Revenue Forecast: €38.3M',
    desc: 'Model prediction: €38.3M. Monitor actuals vs forecast through quarter end.',
    time: '1d ago',
    read: false,
  },
];

export default function Header({ title }) {
  const navigate = useNavigate();
  const { openSKUDetail, openCategoryDetail, openCustomerDetail } = useUI();
  const user = useUser();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchTab, setSearchTab] = useState('All');
  const [commodityFilter, setCommodityFilter] = useState(null);
  const [recentSearches, setRecentSearches] = useState(_recentSearches);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const allResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return SEARCH_INDEX.filter(
      (item) => item.label.toLowerCase().includes(q) || item.sublabel.toLowerCase().includes(q)
    );
  }, [searchQuery]);

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
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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
            placeholder="Search analytics, customers, or products..."
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
                  <p className="text-[10px] text-slate-400 uppercase font-bold mb-2">Recent Searches</p>
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
                    {['All', 'SKUs', 'Customers'].map(tab => (
                      <button
                        key={tab}
                        onClick={() => setSearchTab(tab)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          searchTab === tab ? 'bg-[#0393da] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {tab} ({tabCounts[tab]})
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
                        All
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
                        <p className="text-sm text-slate-400">No matches for &quot;{searchQuery}&quot;</p>
                        <p className="text-xs text-slate-300 mt-1">Try searching by article ID, customer name, or product type.</p>
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
                          }`}>{item.category === 'Customer' ? 'CUST' : item.category}</span>
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
                          {item.riskLabel && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${
                              item.riskLabel === 'At Risk' || item.riskLabel === 'Critical' || item.riskLabel === 'High' ? 'bg-red-50 text-red-600' :
                              item.riskLabel === 'Monitor' || item.riskLabel === 'Medium' ? 'bg-amber-50 text-amber-600' :
                              'bg-green-50 text-green-600'
                            }`}>{item.riskLabel}</span>
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
                <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-[#0393da] hover:text-[#0280bd] transition-colors"
                  >
                    <Check size={12} />
                    Mark all read
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
            <p className="text-sm font-bold leading-none">{user?.name || 'User'}</p>
            <p className="text-xs text-slate-500 mt-1">{user?.role || ''}</p>
          </div>
          <div className="size-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #0393da, #c1e8ff)' }}>
            {user?.initials || 'U'}
          </div>
          <button
            onClick={logout}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
