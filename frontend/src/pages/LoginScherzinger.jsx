import { useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, Lock, User, ShieldCheck } from 'lucide-react';
import { identifyUser } from '../utils/posthog';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        identifyUser(username);
        const user = username.toLowerCase().trim();
        const target = user === 'admin' ? '/admin' : user === 'demo' ? '/demo' : '/';
        window.location.href = target;
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Invalid credentials');
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #f0f4f8 0%, #e8f0fe 50%, #f0f4f8 100%)' }}
    >
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
              <h1 className="text-2xl font-bold tracking-tight"
                style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}
              >
                Scherzinger
              </h1>
              <p className="text-sm mt-1.5" style={{ color: '#737373' }}>
                Margin Intelligence Platform
              </p>
            </div>

            {/* Error message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              >
                {error}
              </motion.div>
            )}

            {/* Login form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username field */}
              <div>
                <label htmlFor="username" className="block text-xs font-bold mb-1.5" style={{ color: '#1a1a2e' }}>
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0393da]/30 focus:border-[#0393da] transition-all"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-xs font-bold mb-1.5" style={{ color: '#1a1a2e' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0393da]/30 focus:border-[#0393da] transition-all"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-6 py-2.5 bg-[#0393da] text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Sign In
                  </>
                )}
              </motion.button>
            </form>

            {/* Footer text */}
            <p className="mt-6 text-center text-xs" style={{ color: '#999' }}>
              German pump manufacturer intelligence platform
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
