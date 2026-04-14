import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { IS_DEMO } from '../utils/brand';
import { useLanguage } from '../context/LanguageContext';
import ChartCard from '../components/shared/ChartCard';
import KPICard from '../components/shared/KPICard';
import ShockSlider from '../components/phase45/ShockSlider';
import MonteCarloHistogram from '../components/phase45/MonteCarloHistogram';
import RegimeToggle from '../components/phase45/RegimeToggle';
import { computeShockedMargin, getRegimeCurves, getBaseline } from '../utils/mockPhase45';

export default function ScenarioLab() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const [material, setMaterial]       = useState(0);
  const [labor, setLabor]             = useState(0);
  const [outsourcing, setOutsourcing] = useState(0);
  const [volume, setVolume]           = useState(0);
  const [regime, setRegime]           = useState('plateau');

  const baseline = getBaseline();
  const curves = getRegimeCurves();

  const shockedMargin = useMemo(
    () => computeShockedMargin({ material, labor, outsourcing, volume }),
    [material, labor, outsourcing, volume]
  );

  const chartData = useMemo(() => {
    const base = curves[regime];
    const delta = shockedMargin - baseline.marginPct;
    return base.map((p) => ({
      month: `M${p.m}`,
      baseline: p.v,
      shocked: Math.max(0, Math.min(1, p.v + delta)),
    }));
  }, [curves, regime, shockedMargin, baseline]);

  const deltaPP = ((shockedMargin - baseline.marginPct) * 100);

  const reset = () => { setMaterial(0); setLabor(0); setOutsourcing(0); setVolume(0); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 p-8"
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>
            {t('phase45.scenarioLab.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#737373' }}>{t('phase45.scenarioLab.subtitle')}</p>
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors hover:bg-slate-100"
          style={{ color: '#525252', border: '1px solid #e5e5e5' }}
        >
          {t('phase45.scenarioLab.reset')}
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPICard
          label={t('phase45.scenarioLab.kpi.combined')}
          value={`${deltaPP >= 0 ? '+' : ''}${deltaPP.toFixed(1)}pp`}
          changeType={deltaPP >= 0 ? 'positive' : 'negative'}
        />
        <KPICard label={t('phase45.scenarioLab.kpi.worst')} value={`${((shockedMargin - 0.06) * 100).toFixed(1)}%`} changeType="warning" />
        <KPICard label={t('phase45.scenarioLab.kpi.best')}  value={`${((shockedMargin + 0.06) * 100).toFixed(1)}%`} changeType="positive" />
      </div>

      {/* Sliders + live chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders panel */}
        <div className="p-6 rounded-2xl bg-white" style={{ boxShadow: '0 1px 3px rgba(26,26,46,0.04)' }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#1a1a2e' }}>Shocks</h3>
            <RegimeToggle value={regime} onChange={setRegime} />
          </div>
          <div className="space-y-5">
            <ShockSlider label={t('phase45.scenarioLab.material')}    value={material}    onChange={setMaterial} />
            <ShockSlider label={t('phase45.scenarioLab.labor')}       value={labor}       onChange={setLabor} />
            <ShockSlider label={t('phase45.scenarioLab.outsourcing')} value={outsourcing} onChange={setOutsourcing} />
            <ShockSlider label={t('phase45.scenarioLab.volume')}      value={volume}      onChange={setVolume} accent="#16a34a" />
          </div>
        </div>

        {/* Live chart */}
        <div className="lg:col-span-2">
          <ChartCard
            title={`${t('phase45.scenarioLab.baselineMargin')} vs ${t('phase45.scenarioLab.shockedMargin')}`}
            subtitle={t('phase45.scenarioLab.regime')}
          >
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: '#737373' }} domain={[0.4, 0.9]} />
                <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="baseline" name={t('phase45.scenarioLab.baselineMargin')} stroke="#94a3b8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="shocked"  name={t('phase45.scenarioLab.shockedMargin')}  stroke="#0393da" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Monte Carlo */}
      <MonteCarloHistogram />
    </motion.div>
  );
}
