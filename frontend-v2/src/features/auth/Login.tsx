import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useLogin } from '@/data/api/useAuth';
import { analytics } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';

const schema = z.object({
  email: z.string().email('Bitte gültige E-Mail eingeben'),
  password: z.string().min(1, 'Passwort erforderlich'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { register, handleSubmit, formState } = useForm<FormValues>();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to={defaultLandingFor(user.ui_persona)} replace />;
  }

  const onSubmit = handleSubmit(async (raw) => {
    setError(null);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Eingabe ungültig');
      return;
    }
    try {
      const me = await login.mutateAsync(parsed.data);
      analytics.identify(me.id, { persona: me.ui_persona, roles: me.roles });
      analytics.track('login', { persona: me.ui_persona });
      const params = new URLSearchParams(location.search);
      const next = params.get('next');
      navigate(next ?? defaultLandingFor(me.ui_persona), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen');
    }
  });

  return (
    <div className="pz-login">
      <div className="pz-login-card">
        <h1>Pryzm — Anmeldung</h1>
        <form onSubmit={onSubmit} noValidate>
          <label>
            <span>E-Mail</span>
            <input
              type="email"
              autoComplete="username"
              autoFocus
              {...register('email', { required: true })}
            />
          </label>
          <label>
            <span>Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              {...register('password', { required: true })}
            />
          </label>
          {error && (
            <div role="alert" className="pz-login-error">
              {error}
            </div>
          )}
          <button type="submit" disabled={formState.isSubmitting || login.isPending}>
            {login.isPending ? 'Anmeldung läuft…' : 'Anmelden'}
          </button>
        </form>
        <div className="pz-login-hint">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Demo-Konten:</div>
          <div><code>frank@scherzinger.de</code> / <code>frank-demo-2026</code> · Pricing Analyst</div>
          <div><code>till@scherzinger.de</code> / <code>till-demo-2026</code> · Managing Director</div>
          <div><code>heiko@scherzinger.de</code> / <code>heiko-demo-2026</code> · Sales / KAM</div>
        </div>
      </div>
    </div>
  );
}

function defaultLandingFor(persona: string): string {
  switch (persona) {
    case 'till':
      return '/md/overview';
    case 'heiko':
      return '/deal/inbox';
    default:
      return '/action-center';
  }
}
