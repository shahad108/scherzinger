import { Bell, Calendar, ChevronDown, MoreHorizontal, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TopBarSearch } from './TopBarSearch';
import { PersonaSwitcher } from './PersonaSwitcher';
import { useUiAction } from '@/hooks/useUiAction';

export function TopBar() {
  const { i18n, t } = useTranslation();
  const runAction = useUiAction();
  const lang = (i18n.language ?? 'de').slice(0, 2).toLowerCase();
  const toggleLang = () => {
    void i18n.changeLanguage(lang === 'de' ? 'en' : 'de');
  };

  return (
    <header className="pz-topbar" aria-label="Top utility bar">
      <div className="pz-logo" aria-label="Pryzm">
        <svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M12 3 4 9v6l8 6 8-6V9z" />
          <path d="M12 3v18M4 9l8 6 8-6" />
        </svg>
      </div>

      <TopBarSearch />

      <button
        type="button"
        className="pz-pill"
        aria-label={t('topbar.addPerson')}
        onClick={() =>
          runAction({
            drawer: {
              title: t('topbar.addPerson'),
              description: 'Invite and permission management needs the organization admin endpoint. This panel records the intended workflow.',
              items: [
                { label: 'Default role', value: 'Reviewer' },
                { label: 'Approval', value: 'Admin permission required' },
              ],
            },
            toast: 'Invite workflow opened',
            toastSeverity: 'info',
          })
        }
      >
        <UserPlus size={14} /> {t('topbar.addPerson')}
      </button>

      <button
        type="button"
        className="pz-pill has-dot"
        aria-label={t('topbar.notifications')}
        onClick={() => runAction({ route: '/notifications', toast: 'Opening notifications.' })}
      >
        <Bell size={14} /> {t('topbar.notifications')}
      </button>

      <button
        type="button"
        className="pz-pill-icon"
        aria-label={t('common.more')}
        onClick={() =>
          runAction({
            drawer: {
              title: t('common.more'),
              description: 'Workspace utility actions grouped for the current screen.',
              items: [
                { label: 'Notes', value: 'Open the notes route from the right rail.' },
                { label: 'Saved views', value: 'Open settings to manage saved views.' },
                { label: 'Audit', value: 'Action Center audit trail is visible on this page.' },
              ],
            },
            toast: 'More menu opened',
            toastSeverity: 'info',
          })
        }
      >
        <MoreHorizontal size={14} />
      </button>

      <span className="pz-grow" />

      <PersonaSwitcher />

      <button
        type="button"
        className="pz-lang"
        aria-label="Language"
        onClick={toggleLang}
        title={lang === 'de' ? 'Switch to English' : 'Auf Deutsch umschalten'}
      >
        {lang === 'de' ? 'De' : 'En'} <ChevronDown size={9} />
      </button>

      <div className="pz-date">
        <Calendar size={14} />
        <span>
          {new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <button
        type="button"
        className="pz-cta"
        onClick={() =>
          runAction({
            drawer: {
              title: t('topbar.create'),
              description: 'Create a new pricing workflow from the current workspace.',
              items: [
                { label: 'Recommended', value: 'Start with a manual Action Center decision.' },
                { label: 'Route', value: 'Pricing Studio for SKU-specific proposals.' },
              ],
            },
            toast: 'Create workflow opened',
            toastSeverity: 'info',
          })
        }
      >
        {t('topbar.create')} <span aria-hidden>→</span>
      </button>
    </header>
  );
}
