import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, User as UserIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';

export default function Setup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmValue, setConfirm] = useState('');
  const [picture, setPicture] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmValue) {
      setError("Passwords do not match");
      return;
    }

    if (!supabase) {
      setError("Supabase not configured");
      return;
    }

    try {
      const { data: staff, error: fetchError } = await supabase.from('staff').select('*').eq('username', username).single();
      if (fetchError || !staff) {
        setError("Assigned username not found. Please contact your firm administrator.");
        return;
      }

      if (staff.status !== 'pending') {
        setError("Account is already active.");
        return;
      }

      const password_hash = await import('bcryptjs').then(m => m.hash(password, 10));
      const { error: updateError } = await supabase.from('staff').update({
        password_hash,
        picture: picture || staff.picture,
        status: 'active'
      }).eq('id', staff.id);
      
      if (updateError) {
        setError(updateError.message || 'Setup failed');
        return;
      }
      
      setSuccess("Account activated successfully.");
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError('Connection error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="bg-[#151619] border border-white/5 p-8 rounded-xl w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">INITIAL SETUP</h1>
          <p className="text-slate-400 text-sm tracking-wide">Secure your pre-registered account</p>
        </div>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded mb-6 text-center">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 text-sm p-3 rounded mb-6 text-center">{success}</div>}

        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Assigned Username</label>
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
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Profile Picture URL (Optional)</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="url" 
                value={picture}
                onChange={(e) => setPicture(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-md py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="https://example.com/photo.jpg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">New Password</label>
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
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="password" 
                value={confirmValue}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-md py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-md font-medium tracking-wide transition-colors mt-4"
          >
            Activate Account
          </button>
        </form>
        <div className="mt-8 text-center">
          <Link to="/login" className="text-xs text-slate-500 hover:text-emerald-500 transition-colors">Return to login</Link>
        </div>
      </div>
    </div>
  );
}
