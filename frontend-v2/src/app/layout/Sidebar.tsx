import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  BarChart3,
  Brain,
  ClipboardList,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';

const items = [
  { to: '/action-center', icon: Activity, key: 'actionCenter' },
  { to: '/margin', icon: BarChart3, key: 'margin' },
  { to: '/quotes', icon: ClipboardList, key: 'quotes' },
  { to: '/forecasting', icon: LineChart, key: 'forecasting' },
  { to: '/pricing', icon: Sparkles, key: 'pricing' },
  { to: '/ai', icon: Brain, key: 'ai' },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-[var(--border-subtle)] bg-white transition-[width]',
        collapsed ? 'w-[72px]' : 'w-[232px]',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-[var(--border-subtle)] px-4">
        {!collapsed && (
          <span className="font-display text-lg font-semibold tracking-tight">Pryzm</span>
        )}
        <button
          onClick={toggle}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav className="flex-1 px-2 py-3">
        {items.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
              )
            }
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span>{t(`nav.${key}`)}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
