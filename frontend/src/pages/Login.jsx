import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, Lock, User, ShieldCheck } from 'lucide-react';
import { authenticate, isAuthenticated } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from '../components/LanguageToggle';

export default function Login() {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated()) navigate('/', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const session = await authenticate(username, password);
      if (session) {
        window.location.href = '/';
      } else {
        setError(t('login.error.invalid'));
      }
    } catch {
      setError(t('login.error.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #f0f4f8 0%, #e8f0fe 50%, #f0f4f8 100%)' }}
    >
      {/* Language toggle in top-right corner */}
      <div className="absolute top-6 right-6 z-20">
        <LanguageToggle />
      </div>
      {/* Decorative background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #0393da 0%, transparent 70%)' }}
        />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #0393da 0%, transparent 70%)' }}
        />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #0393da 0%, transparent 60%)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[420px] mx-4"
      >
        {/* Card */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#ffffff', boxShadow: '0 8px 60px rgba(26,26,46,0.08), 0 2px 8px rgba(26,26,46,0.04)' }}
        >
          {/* Top accent bar */}
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #0393da, #00c6ff, #0393da)' }} />

          <div className="p-8 sm:p-10">
            {/* Logo + Branding */}
            <div className="flex flex-col items-center mb-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="size-16 rounded-2xl flex items-center justify-center text-white mb-5"
                style={{
                  background: 'linear-gradient(135deg, #0393da 0%, #00c6ff 100%)',
                  boxShadow: '0 8px 24px rgba(3,147,218,0.3)',
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                  <line x1="12" y1="22" x2="12" y2="15.5" />
                  <polyline points="22 8.5 12 15.5 2 8.5" />
                </svg>
              </motion.div>
              <h1 className="text-xl font-bold tracking-tight leading-none"
                style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}
              >
                PRYZM
              </h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold mt-1"
                style={{ color: '#0393da' }}
              >
                Solutions GmbH
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-1.5"
                  style={{ color: '#404040' }}
                >
                  {t('login.username')}
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: '#a3a3a3' }}
                  />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ border: '1.5px solid #e5e5e5', background: '#fafafa', color: '#1a1a2e' }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0393da';
                      e.target.style.boxShadow = '0 0 0 3px rgba(3,147,218,0.08)';
                      e.target.style.background = '#ffffff';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e5e5';
                      e.target.style.boxShadow = 'none';
                      e.target.style.background = '#fafafa';
                    }}
                    placeholder={t('login.username.placeholder')}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1.5"
                  style={{ color: '#404040' }}
                >
                  {t('login.password')}
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: '#a3a3a3' }}
                  />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full pl-10 pr-11 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ border: '1.5px solid #e5e5e5', background: '#fafafa', color: '#1a1a2e' }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0393da';
                      e.target.style.boxShadow = '0 0 0 3px rgba(3,147,218,0.08)';
                      e.target.style.background = '#ffffff';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e5e5';
                      e.target.style.boxShadow = 'none';
                      e.target.style.background = '#fafafa';
                    }}
                    placeholder={t('login.password.placeholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword
                      ? <EyeOff size={16} style={{ color: '#a3a3a3' }} />
                      : <Eye size={16} style={{ color: '#a3a3a3' }} />
                    }
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 text-sm px-4 py-3 rounded-xl"
                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                >
                  <ShieldCheck size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={loading ? {} : { scale: 1.01, y: -1 }}
                whileTap={loading ? {} : { scale: 0.99 }}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all cursor-pointer mt-2"
                style={{
                  background: loading
                    ? '#a3a3a3'
                    : 'linear-gradient(135deg, #0393da 0%, #0373b0 100%)',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(3,147,218,0.35)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('login.signingIn')}
                  </span>
                ) : (
                  t('login.signIn')
                )}
              </motion.button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 mt-6">
          <ShieldCheck size={12} style={{ color: '#a3a3a3' }} />
          <p className="text-xs" style={{ color: '#a3a3a3' }}>
            {t('login.footer')}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
