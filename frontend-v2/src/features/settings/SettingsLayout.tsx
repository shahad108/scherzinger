// Phase 14 P14.T1 — Settings shell with left-rail nav inside <Outlet/>.
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellRing, BookmarkCheck, BrainCog, Database, NotebookPen, SlidersHorizontal, User } from 'lucide-react';

const links = [
  { to: '/settings/profile', icon: User, key: 'settings.profile' },
  { to: '/settings/preferences', icon: SlidersHorizontal, key: 'settings.preferences' },
  { to: '/settings/saved-views', icon: BookmarkCheck, key: 'settings.savedViews' },
  { to: '/settings/data-quality', icon: Database, key: 'settings.dataQuality' },
  { to: '/settings/model-cards', icon: BrainCog, key: 'settings.modelCards' },
  { to: '/notifications', icon: BellRing, key: 'settings.notifications' },
  { to: '/notes', icon: NotebookPen, key: 'settings.notes' },
] as const;

const fallback: Record<string, string> = {
  'settings.profile': 'Profile',
  'settings.preferences': 'Preferences',
  'settings.savedViews': 'Saved views',
  'settings.dataQuality': 'Data quality',
  'settings.modelCards': 'Model cards',
  'settings.notifications': 'Notifications',
  'settings.notes': 'Notes',
};

export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <div className="w-full px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
          {t('settings.title', { defaultValue: 'Settings' })}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          {t('settings.subtitle', {
            defaultValue: 'Profile, preferences, saved views, and data quality.',
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex flex-col gap-1">
          {links.map(({ to, icon: Icon, key }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--surface-soft)] text-[var(--ink)]'
                    : 'text-[var(--ink-2)] hover:bg-[var(--surface-soft)]'
                }`
              }
            >
              <Icon size={14} />
              {t(key, { defaultValue: fallback[key] })}
            </NavLink>
          ))}
        </nav>
        <div className="rounded-[14px] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card)]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
