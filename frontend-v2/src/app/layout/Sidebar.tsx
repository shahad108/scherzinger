import { NavLink } from 'react-router-dom';
import { ClipboardCheck, FileText, LayoutGrid, Menu, Settings, Target, TrendingUp, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/stores/uiStore';
import { SidebarDeptList } from './SidebarDeptList';
import { SidebarDataStatus } from './SidebarDataStatus';
import { SidebarUserCard } from './SidebarUserCard';

const items = [
  { to: '/action-center', icon: Zap,             key: 'actionCenter' },
  { to: '/forecasting',   icon: TrendingUp,      key: 'forecasting' },
  { to: '/pricing',       icon: Target,          key: 'pricing' },
  { to: '/margin',        icon: LayoutGrid,      key: 'margin' },
  { to: '/quotes',        icon: ClipboardCheck,  key: 'quotes' },
  { to: '/ai',            icon: FileText,        key: 'ai' },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside className="pz-aside">
      <button
        type="button"
        className="pz-shell-toggle"
        aria-label="Toggle sidebar"
        aria-expanded={!sidebarCollapsed}
        onClick={toggle}
      >
        <Menu size={16} />
      </button>
      <div>
        <div className="pz-nav-title">Workspace</div>
        {items.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'pz-nav-item active' : 'pz-nav-item')}
          >
            <Icon className="ico" size={16} />
            <span className="label">{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'pz-nav-item active' : 'pz-nav-item')}>
          <Settings className="ico" size={16} />
          <span className="label">{t('nav.settings')}</span>
        </NavLink>
      </div>
      <div className="pz-nav-divider" />
      <SidebarDeptList />
      <SidebarDataStatus />
      <SidebarUserCard />
    </aside>
  );
}
