import { useLanguage } from '../../context/LanguageContext';

const STYLES = {
  open:         { bg: 'rgba(59,130,246,0.1)',  fg: '#1d4ed8' },
  in_progress:  { bg: 'rgba(245,158,11,0.12)', fg: '#b45309' },
  blocked:      { bg: 'rgba(239,68,68,0.1)',   fg: '#b91c1c' },
  done:         { bg: 'rgba(16,185,129,0.12)', fg: '#047857' },
  dismissed:    { bg: 'rgba(100,116,139,0.1)', fg: '#475569' },
};

export default function MeasureStatusPill({ status }) {
  const { t } = useLanguage();
  const style = STYLES[status] || STYLES.open;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: style.bg, color: style.fg }}
    >
      {t(`measures.statuses.${status}`)}
    </span>
  );
}
