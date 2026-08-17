import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MessageSquare, Sparkles, AlertCircle } from 'lucide-react';

export default function AuthModal() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(username, email, password, avatarUrl);
      } else {
        await login(email, password);
      }
    } catch (err) {
      if (!err.response) {
        setError('Cannot connect to backend server. Please verify backend deployment and network connection.');
      } else if (typeof err.response.data?.detail === 'string') {
        setError(err.response.data.detail);
      } else if (err.response.status === 404) {
        setError('Backend API endpoint not found (404). Check backend deployment status or VITE_API_URL.');
      } else if (err.response.status === 401) {
        setError('Invalid email or password. If you do not have an account yet, click Register below.');
      } else {
        setError('Authentication failed. Please check your credentials or register a new account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const avatarPresets = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=Cyber',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Neon',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Gamer',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Pixel',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Phantom',
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-200">
      <div className="bg-surface-base border border-surface-border rounded-md w-full max-w-md shadow-2xl p-6 space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-md bg-accent-primary flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/20">
            <MessageSquare className="w-8 h-8 text-text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            {isRegister ? 'Create an Account' : 'Welcome Back!'}
          </h1>
          <p className="text-xs text-text-muted mt-1">
            {isRegister ? "Join the high-performance self-hosted platform" : "We're so excited to see you again!"}
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-sm flex items-center space-x-2 text-rose-400 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="CoolGamer123"
                  className="w-full bg-surface-active text-text-primary text-sm rounded-sm px-3 py-2.5 border border-surface-border focus:outline-none focus:border-accent-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Avatar Preset
                </label>
                <div className="flex items-center space-x-2 mb-2">
                  {avatarPresets.map((preset, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setAvatarUrl(preset)}
                      className={`w-9 h-9 rounded-full bg-surface-active p-0.5 border-2 transition-all ${
                        avatarUrl === preset ? 'border-accent-primary scale-110' : 'border-transparent hover:border-surface-hover'
                      }`}
                    >
                      <img src={preset} alt="preset" className="w-full h-full rounded-full" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full bg-surface-active text-text-primary text-sm rounded-sm px-3 py-2.5 border border-surface-border focus:outline-none focus:border-accent-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface-active text-text-primary text-sm rounded-sm px-3 py-2.5 border border-surface-border focus:outline-none focus:border-accent-primary transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent-primary hover:bg-accent-hover text-text-primary font-bold rounded-sm transition-all transform active:scale-95 shadow-md shadow-indigo-500/20 disabled:opacity-50"
          >
            {loading ? 'Processing...' : isRegister ? 'Register' : 'Log In'}
          </button>
        </form>

        {/* Toggle Register / Login */}
        <div className="text-center text-xs text-text-muted">
          {isRegister ? 'Already have an account?' : 'Need an account?'}{' '}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-accent-primary hover:underline font-semibold ml-1"
          >
            {isRegister ? 'Log In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
