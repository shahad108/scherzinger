import { LogOut } from 'lucide-react';

export function SidebarUserCard() {
  return (
    <div className="pz-user-row">
      <div className="pz-avatar">FK</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pz-user-name">Frank Keller</div>
        <div className="pz-user-mail">frank@scherzinger.de</div>
      </div>
      <button type="button" aria-label="Logout" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
        <LogOut size={14} />
      </button>
    </div>
  );
}
