import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '@/data/api/useAuth';
import { useAuthStore } from '@/stores/authStore';

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function SidebarUserCard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const logout = useLogout();

  if (!user) {
    return (
      <div className="pz-user-row">
        <div className="pz-avatar">?</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pz-user-name">—</div>
          <div className="pz-user-mail">nicht angemeldet</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pz-user-row">
      <div className="pz-avatar">{initialsOf(user.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pz-user-name">{user.name}</div>
        <div className="pz-user-mail">{user.email}</div>
      </div>
      <button
        type="button"
        aria-label="Logout"
        className="pz-user-logout"
        onClick={async () => {
          await logout.mutateAsync().catch(() => {});
          navigate('/login', { replace: true });
        }}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
