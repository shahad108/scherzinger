import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { Loader } from 'lucide-react';
import { useDateRange } from '../../hooks/useDateRange';

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'revenue', label: 'Revenue & Margins', path: '/revenue' },
  { key: 'products', label: 'Products & SKUs', path: '/products' },
  { key: 'customers', label: 'Customers', path: '/customers' },
  { key: 'forecasting', label: 'Forecasting', path: '/forecasting' },
  { key: 'pricing', label: 'Pricing & FX', path: '/pricing' },
  { key: 'inventory', label: 'Inventory', path: '/inventory' },
  { key: 'ml-analytics', label: 'ML Analytics', path: '/ml-analytics' },
  { key: 'ai-insights', label: 'AI Insights', path: '/ai-insights' },
];

const ZONE_COLORS = {
  kpi: '#7C3AED', chart: '#0393da', table: '#10b981', sidebar: '#6366f1',
  header: '#f59e0b', chat: '#ec4899', filter: '#06b6d4', footer: '#94a3b8',
  other: '#64748b', alert: '#ef4444', card: '#8b5cf6', model: '#f97316',
};

// Each page has unique zones: { label, x%, y%, w%, h%, color }
const PAGE_SCHEMATICS = {
  dashboard: [
    { label: 'Header & Search', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Revenue YTD', x: 0, y: 7, w: 25, h: 13, color: '#7C3AED' },
    { label: 'Gross Margin', x: 25, y: 7, w: 25, h: 13, color: '#7C3AED' },
    { label: 'Active Customers', x: 50, y: 7, w: 25, h: 13, color: '#7C3AED' },
    { label: 'FY26 Forecast', x: 75, y: 7, w: 25, h: 13, color: '#7C3AED' },
    { label: 'Revenue Performance Chart', x: 0, y: 22, w: 60, h: 28, color: '#0393da' },
    { label: 'Revenue Distribution Pie', x: 60, y: 22, w: 40, h: 28, color: '#0393da' },
    { label: 'Customer Concentration', x: 0, y: 52, w: 33, h: 14, color: '#ef4444' },
    { label: 'Inventory Alerts', x: 33, y: 52, w: 34, h: 14, color: '#ef4444' },
    { label: 'Churn Risk', x: 67, y: 52, w: 33, h: 14, color: '#ef4444' },
    { label: 'Sales Pipeline', x: 0, y: 68, w: 50, h: 22, color: '#10b981' },
    { label: 'Customer Retention', x: 50, y: 68, w: 50, h: 22, color: '#10b981' },
    { label: 'PRYZM AI Chat Bar', x: 15, y: 92, w: 70, h: 7, color: '#ec4899' },
  ],
  revenue: [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Revenue KPI', x: 0, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'COGS KPI', x: 25, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Gross Margin KPI', x: 50, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Net Margin KPI', x: 75, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Monthly Revenue & COGS Chart', x: 0, y: 21, w: 60, h: 30, color: '#0393da' },
    { label: 'Margin Trend Chart', x: 60, y: 21, w: 40, h: 30, color: '#0393da' },
    { label: 'Category Revenue Breakdown', x: 0, y: 53, w: 100, h: 22, color: '#10b981' },
    { label: 'Monthly Detail Table', x: 0, y: 77, w: 100, h: 18, color: '#10b981' },
    { label: 'Chat Bar', x: 15, y: 95, w: 70, h: 5, color: '#ec4899' },
  ],
  products: [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Category Filter Tabs', x: 0, y: 7, w: 100, h: 6, color: '#06b6d4' },
    { label: 'Total SKUs KPI', x: 0, y: 14, w: 25, h: 10, color: '#7C3AED' },
    { label: 'Revenue KPI', x: 25, y: 14, w: 25, h: 10, color: '#7C3AED' },
    { label: 'Avg Margin KPI', x: 50, y: 14, w: 25, h: 10, color: '#7C3AED' },
    { label: 'Top SKU KPI', x: 75, y: 14, w: 25, h: 10, color: '#7C3AED' },
    { label: 'Products Data Table', x: 0, y: 26, w: 100, h: 50, color: '#10b981' },
    { label: 'Category Performance Cards', x: 0, y: 78, w: 100, h: 16, color: '#8b5cf6' },
    { label: 'Chat Bar', x: 15, y: 95, w: 70, h: 5, color: '#ec4899' },
  ],
  customers: [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Total Customers', x: 0, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Active %', x: 25, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'At Risk', x: 50, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Avg Revenue', x: 75, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Customer Segments Chart', x: 0, y: 21, w: 50, h: 28, color: '#0393da' },
    { label: 'Regional Breakdown', x: 50, y: 21, w: 50, h: 28, color: '#0393da' },
    { label: 'Customer Risk Table', x: 0, y: 51, w: 100, h: 35, color: '#10b981' },
    { label: 'Chat Bar', x: 15, y: 92, w: 70, h: 7, color: '#ec4899' },
  ],
  forecasting: [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Holdout wMAPE', x: 0, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'FY26 Forecast', x: 25, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Pipeline Value', x: 50, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Models Tested', x: 75, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Forecast vs Actuals Chart', x: 0, y: 21, w: 100, h: 32, color: '#0393da' },
    { label: 'FY 2026 Monthly Outlook', x: 0, y: 55, w: 50, h: 25, color: '#0393da' },
    { label: 'Category Forecast Bars', x: 50, y: 55, w: 50, h: 25, color: '#0393da' },
    { label: 'Model Performance Cards', x: 0, y: 82, w: 100, h: 12, color: '#f97316' },
    { label: 'Chat Bar', x: 15, y: 95, w: 70, h: 5, color: '#ec4899' },
  ],
  pricing: [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Avg Margin KPI', x: 0, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Price Alerts', x: 25, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'FX Exposure', x: 50, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Margin at Risk', x: 75, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Price Governance Table', x: 0, y: 21, w: 100, h: 25, color: '#10b981' },
    { label: 'FX Sensitivity Chart', x: 0, y: 48, w: 50, h: 25, color: '#0393da' },
    { label: 'Price Recommendation Chart', x: 50, y: 48, w: 50, h: 25, color: '#0393da' },
    { label: 'SKU Pricing Detail Table', x: 0, y: 75, w: 100, h: 18, color: '#10b981' },
    { label: 'Chat Bar', x: 15, y: 95, w: 70, h: 5, color: '#ec4899' },
  ],
  inventory: [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Total SKUs', x: 0, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Critical Stock', x: 25, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Reorder Needed', x: 50, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Avg Days Supply', x: 75, y: 7, w: 25, h: 12, color: '#7C3AED' },
    { label: 'Stock Status Distribution', x: 0, y: 21, w: 40, h: 25, color: '#0393da' },
    { label: 'Demand Forecast Chart', x: 40, y: 21, w: 60, h: 25, color: '#0393da' },
    { label: 'Inventory Detail Table', x: 0, y: 48, w: 100, h: 35, color: '#10b981' },
    { label: 'Reorder Alerts', x: 0, y: 85, w: 100, h: 8, color: '#ef4444' },
    { label: 'Chat Bar', x: 15, y: 95, w: 70, h: 5, color: '#ec4899' },
  ],
  'ml-analytics': [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Model A Card', x: 0, y: 7, w: 33, h: 15, color: '#f97316' },
    { label: 'Model B Card', x: 33, y: 7, w: 34, h: 15, color: '#f97316' },
    { label: 'Model C Card', x: 67, y: 7, w: 33, h: 15, color: '#f97316' },
    { label: 'Walk-Forward Validation Chart', x: 0, y: 24, w: 50, h: 28, color: '#0393da' },
    { label: 'Holdout Validation Chart', x: 50, y: 24, w: 50, h: 28, color: '#0393da' },
    { label: 'Portfolio Analysis', x: 0, y: 54, w: 60, h: 25, color: '#10b981' },
    { label: 'Model Summary Table', x: 60, y: 54, w: 40, h: 25, color: '#10b981' },
    { label: 'Demand Forecast', x: 0, y: 81, w: 100, h: 13, color: '#8b5cf6' },
    { label: 'Chat Bar', x: 15, y: 95, w: 70, h: 5, color: '#ec4899' },
  ],
  'ai-insights': [
    { label: 'Header', x: 0, y: 0, w: 100, h: 6, color: '#f59e0b' },
    { label: 'Chat Session Sidebar', x: 0, y: 7, w: 22, h: 86, color: '#6366f1' },
    { label: 'Message Area', x: 22, y: 7, w: 78, h: 72, color: '#0393da' },
    { label: 'Suggestion Chips', x: 22, y: 80, w: 78, h: 6, color: '#8b5cf6' },
    { label: 'Chat Input', x: 22, y: 87, w: 78, h: 7, color: '#ec4899' },
  ],
};

// ─── Click Heatmap Canvas ────────────────────────────────────────
function ClickHeatmapCanvas({ clicks, pageKey }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.offsetWidth;
    const h = 550;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, 0, w, h);

    // Draw page-specific zones
    const zones = PAGE_SCHEMATICS[pageKey] || PAGE_SCHEMATICS.dashboard;
    zones.forEach(zone => {
      const zx = (zone.x / 100) * w;
      const zy = (zone.y / 100) * h;
      const zw = (zone.w / 100) * w;
      const zh = (zone.h / 100) * h;

      // Zone fill
      ctx.fillStyle = zone.color + '10';
      ctx.fillRect(zx + 1, zy + 1, zw - 2, zh - 2);

      // Zone border
      ctx.strokeStyle = zone.color + '35';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.roundRect(zx + 1, zy + 1, zw - 2, zh - 2, 6);
      ctx.stroke();

      // Zone label
      ctx.fillStyle = zone.color + 'AA';
      ctx.font = 'bold 10px Inter, system-ui, sans-serif';
      ctx.fillText(zone.label, zx + 8, zy + 16);
    });

    // Draw heatmap blobs
    if (clicks?.length) {
      clicks.forEach(click => {
        const cx = (click.x_percent / 100) * w;
        const cy = (click.y_percent / 100) * h;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
        gradient.addColorStop(0.4, 'rgba(249, 115, 22, 0.3)');
        gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fill();
      });

      // Dots on top
      clicks.forEach(click => {
        const cx = (click.x_percent / 100) * w;
        const cy = (click.y_percent / 100) * h;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

  }, [clicks, pageKey]);

  return (
    <div ref={containerRef} className="bg-white rounded-2xl p-5 overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Click Heatmap</h3>
      {clicks?.length ? (
        <>
          <canvas ref={canvasRef} className="w-full rounded-xl" style={{ height: 550 }} />
          <p className="text-[10px] text-slate-400 mt-2 text-center">{clicks.length} clicks recorded</p>
        </>
      ) : (
        <>
          <canvas ref={canvasRef} className="w-full rounded-xl" style={{ height: 550 }} />
          <p className="text-[10px] text-slate-400 mt-2 text-center">No clicks yet — schematic shows page layout</p>
        </>
      )}
    </div>
  );
}

// ─── Click Zone Table ────────────────────────────────────────────
function ClickZoneTable({ zones, totalClicks }) {
  if (!zones?.length) return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Click Zones</h3>
      <p className="text-xs text-slate-400 text-center py-8">No zone data yet</p>
    </div>
  );
  const maxClicks = zones[0]?.clicks || 1;

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Click Zones ({totalClicks} total)</h3>
      <div className="space-y-3">
        {zones.map((z, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: ZONE_COLORS[z.zone] || '#94a3b8' }} />
            <span className="text-xs font-medium capitalize w-20" style={{ color: '#525252' }}>{z.zone}</span>
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(z.clicks / maxClicks) * 100}%` }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="h-full rounded-full"
                style={{ background: ZONE_COLORS[z.zone] || '#94a3b8' }}
              />
            </div>
            <span className="text-xs font-bold w-10 text-right" style={{ color: '#1a1a2e' }}>{z.clicks}</span>
            <span className="text-[10px] text-slate-400 w-8 text-right">{z.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page Click Summary ──────────────────────────────────────────
function PageClickSummary({ allPageData }) {
  if (!allPageData) return null;
  const pages = Object.entries(allPageData).filter(([_, d]) => d.totalClicks > 0).sort((a, b) => b[1].totalClicks - a[1].totalClicks);
  if (!pages.length) return null;

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Clicks by Page</h3>
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        {pages.map(([key, data]) => {
          const page = PAGES.find(p => p.key === key);
          return (
            <div key={key} className="text-center p-3 rounded-xl bg-slate-50">
              <p className="text-lg font-bold" style={{ color: '#7C3AED' }}>{data.totalClicks}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{page?.label || key}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Heatmaps Page ──────────────────────────────────────────
export default function AdminHeatmaps() {
  const { from } = useDateRange();
  const [selectedPage, setSelectedPage] = useState('dashboard');
  const [data, setData] = useState(null);
  const [allPageData, setAllPageData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/heatmap/${selectedPage}?from=${from}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [selectedPage, from]);

  const fetchAllPages = useCallback(async () => {
    try {
      const results = {};
      await Promise.all(PAGES.map(async (p) => {
        const res = await fetch(`/api/admin/heatmap/${p.key}?from=${from}`);
        if (res.ok) results[p.key] = await res.json();
      }));
      setAllPageData(results);
    } catch { /* silent */ }
  }, [from]);

  useEffect(() => { fetchPage(); }, [fetchPage]);
  useEffect(() => { fetchAllPages(); }, [fetchAllPages]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {PAGES.map(p => (
          <button
            key={p.key}
            onClick={() => setSelectedPage(p.key)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              selectedPage === p.key ? 'text-white shadow-md' : 'bg-white text-slate-600 hover:bg-purple-50'
            }`}
            style={selectedPage === p.key ? { background: '#7C3AED' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[400px]">
          <Loader size={24} className="animate-spin text-purple-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ClickHeatmapCanvas clicks={data?.clicks} pageKey={selectedPage} />
          </div>
          <ClickZoneTable zones={data?.zones} totalClicks={data?.totalClicks} />
        </div>
      )}

      <PageClickSummary allPageData={allPageData} />
    </div>
  );
}
