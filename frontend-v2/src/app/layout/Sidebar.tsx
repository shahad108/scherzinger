import { NavLink } from 'react-router-dom';
import { Activity, BarChart3, Brain, ClipboardList, LineChart, Menu, Settings, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/stores/uiStore';
import { SidebarDeptList } from './SidebarDeptList';
import { SidebarDataStatus } from './SidebarDataStatus';
import { SidebarUserCard } from './SidebarUserCard';

const items = [
  { to: '/action-center', icon: Activity,       key: 'actionCenter' },
  { to: '/forecasting',   icon: LineChart,      key: 'forecasting' },
  { to: '/pricing',       icon: Sparkles,       key: 'pricing' },
  { to: '/margin',        icon: BarChart3,      key: 'margin' },
  { to: '/quotes',        icon: ClipboardList,  key: 'quotes' },
  { to: '/ai',            icon: Brain,          key: 'ai' },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside className="pz-aside">
      <button type="button" className="pz-shell-toggle" aria-label="Toggle sidebar" onClick={toggle}>
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
          <span className="label">Settings</span>
        </NavLink>
      </div>
      <div className="pz-nav-divider" />
      <SidebarDeptList />
      <SidebarDataStatus />
      <SidebarUserCard />
    </aside>
  );
}
