import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Shell() {
  return (
    <div className="flex min-h-screen w-screen bg-[var(--bg)]">
      <div className="sticky top-0 z-30 self-start">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="sticky top-0 z-20">
          <TopBar />
        </div>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
