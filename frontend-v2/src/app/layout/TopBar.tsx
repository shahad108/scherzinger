import { Bell, Calendar, ChevronDown, MoreHorizontal, UserPlus } from 'lucide-react';
import { TopBarSearch } from './TopBarSearch';
import { PersonaSwitcher } from './PersonaSwitcher';

export function TopBar() {
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

      <button type="button" className="pz-pill" aria-label="Add person">
        <UserPlus size={14} /> Add person
      </button>

      <button type="button" className="pz-pill has-dot" aria-label="Notifications">
        <Bell size={14} /> Notifications
      </button>

      <button type="button" className="pz-pill-icon" aria-label="More">
        <MoreHorizontal size={14} />
      </button>

      <span className="pz-grow" />

      <PersonaSwitcher />

      <button type="button" className="pz-lang" aria-label="Language">
        En <ChevronDown size={9} />
      </button>

      <div className="pz-date">
        <Calendar size={14} />
        <span>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      <button type="button" className="pz-cta">
        Create <span aria-hidden>→</span>
      </button>
    </header>
  );
}
