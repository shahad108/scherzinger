import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { RightRail } from './RightRail';
import { useUiStore } from '@/stores/uiStore';

export function Shell() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const rightRailCollapsed = useUiStore((s) => s.rightRailCollapsed);

  const shellClass = [
    'pz-shell',
    sidebarCollapsed ? 'left-collapsed' : '',
    rightRailCollapsed ? 'right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="pz-app">
      <TopBar />
      <div className={shellClass}>
        <Sidebar />
        <main className="pz-main">
          <Outlet />
        </main>
        <RightRail />
      </div>
    </div>
  );
}
