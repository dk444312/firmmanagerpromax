import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, User as UserIcon } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // In dev, use Mock if real API fails, or rely on API
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        setError('Server returned invalid response');
        return;
      }
      
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      console.error("Login fetch error:", err);
      setError('Connection error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="bg-[#151619] border border-white/5 p-8 rounded-xl w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white content-center mb-2">FirmManager</h1>
          <p className="text-slate-400 text-sm tracking-wide">Enter your credentials to access the firm</p>
        </div>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded mb-6 text-center">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Username</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-md py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="johndoe"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-md py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-md font-medium tracking-wide transition-colors mt-2"
          >
            Authenticate
          </button>
        </form>
        <div className="mt-8 text-center">
          <Link to="/setup" className="text-xs text-slate-500 hover:text-emerald-500 transition-colors">First time? Activate your account.</Link>
        </div>
      </div>
    </div>
  );
}
