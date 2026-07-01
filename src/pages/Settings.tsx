import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Settings as SettingsIcon, Upload, Edit3, Key, Mail, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';

export default function Settings() {
  const { user, token, uiConfig, updateUiConfig } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [picture, setPicture] = useState(user?.picture || '');
  const [messageNotifications, setMessageNotifications] = useState(user?.message_notifications ?? true);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const [password, setPassword] = useState('');
  const [passMsg, setPassMsg] = useState('');

  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [emailSettingsMsg, setEmailSettingsMsg] = useState('');
  const [isSavingEmailSettings, setIsSavingEmailSettings] = useState(false);

  const [uiMap, setUiMap] = useState<Record<string, string>>({
    Dashboard: 'Dashboard',
    Cases: 'Cases',
    Clients: 'Clients',
    Files: 'Files',
    Tasks: 'Tasks',
    Diary: 'Diary'
  });
  const [uiConfigMsg, setUiConfigMsg] = useState('');

  useEffect(() => {
    // initialize from global state if present
    setUiMap((prev) => ({ ...prev, ...uiConfig }));
  }, [uiConfig]);

  useEffect(() => {
    if (user && user.role === 'Managing Partner' && supabase) {
      (async () => {
        try {
          const { data, error } = await supabase
            .from('firms')
            .select('resend_api_key, resend_from_email')
            .eq('id', user.firm_id)
            .single();
          if (data && !error) {
            setResendApiKey(data.resend_api_key || '');
            setResendFromEmail(data.resend_from_email || '');
          }
        } catch (err) {
          console.error("Failed to fetch email credentials:", err);
        }
      })();
    }
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !supabase) return;

    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage.from('profiles').upload(fileName, file);
      
      if (error) throw error;
      
      if (data) {
        const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(fileName);
        setPicture(publicUrl);
        setMessage('Image uploaded. Please save changes.');
      }
    } catch (err) {
      console.error(err);
      setMessage('Error uploading image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    try {
      const { error } = await supabase.from('staff').update({ name, picture, message_notifications: messageNotifications }).eq('id', user.id);
      if (!error) {
        setMessage('Profile updated successfully.');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`Failed to update profile: ${error.message}`);
      }
    } catch {
      setMessage('Error updating profile.');
    }
  };

  const handleSaveConfig = async () => {
    if (!token || !supabase || !user) return;
    try {
      if (user.role !== 'Managing Partner') {
         setUiConfigMsg('Only Managing Partners can change UI config.');
         return;
      }
      const { error } = await supabase.from('firms').update({ ui_config: uiMap }).eq('id', user.firm_id);
      if (!error) {
        updateUiConfig(uiMap);
        setUiConfigMsg('UI Config saved successfully.');
        setTimeout(() => setUiConfigMsg(''), 3000);
      } else {
        setUiConfigMsg(`Failed to save: ${error.message}`);
      }
    } catch {
      setUiConfigMsg('Error saving configuration.');
    }
  };

  const handleSaveEmailSettings = async () => {
    if (!token || !supabase || !user) return;
    setIsSavingEmailSettings(true);
    try {
      if (user.role !== 'Managing Partner') {
        setEmailSettingsMsg('Only Managing Partners can update email configurations.');
        return;
      }
      const { error } = await supabase
        .from('firms')
        .update({ 
          resend_api_key: resendApiKey, 
          resend_from_email: resendFromEmail 
        })
        .eq('id', user.firm_id);
      
      if (!error) {
        setEmailSettingsMsg('Email settings saved successfully.');
        setTimeout(() => setEmailSettingsMsg(''), 3000);
      } else {
        setEmailSettingsMsg(`Failed to save settings: ${error.message}`);
      }
    } catch {
      setEmailSettingsMsg('Error saving email credentials.');
    } finally {
      setIsSavingEmailSettings(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password || !supabase || !user) return;
    try {
      const password_hash = await import('bcryptjs').then(m => m.hash(password, 10));
      const { error } = await supabase.from('staff').update({ password_hash }).eq('id', user.id);
      if (!error) {
        setPassMsg('Password updated successfully.');
        setPassword('');
        setTimeout(() => setPassMsg(''), 3000);
      } else {
        setPassMsg('Failed to update password.');
      }
    } catch {
      setPassMsg('Error updating password.');
    }
  };

  return (
    <div className="p-10 max-w-4xl mx-auto h-full flex flex-col space-y-8 overflow-y-auto">
      <header>
        <h1 className="text-3xl font-light text-white tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-emerald-500" />
          Settings
        </h1>
        <p className="text-slate-400 mt-2">Manage your account details and preferences.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#151619] border border-white/10 rounded-2xl p-8">
          <h2 className="text-xl font-medium text-white mb-6">Profile Settings</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Full Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Your Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Profile Picture</label>
              <div className="flex items-start gap-4">
                {picture ? (
                  <img src={picture} alt="Avatar" className="w-16 h-16 rounded-full border border-white/10 object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#0a0a0a] border border-dashed border-white/20 flex items-center justify-center text-slate-500 shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 mt-2">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#0a0a0a] file:text-emerald-400 hover:file:bg-[#1a1c20] transition-colors"
                  />
                  {uploading && <p className="text-xs text-emerald-500 mt-2">Uploading...</p>}
                </div>
              </div>
            </div>
            
            <div>
               <label className="flex items-center gap-3 cursor-pointer">
                 <input 
                   type="checkbox"
                   checked={messageNotifications}
                   onChange={e => setMessageNotifications(e.target.checked)}
                   className="w-4 h-4 rounded border-white/10 bg-[#0a0a0a] text-emerald-500 focus:ring-emerald-500/20"
                 />
                 <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200">Message Notifications</span>
                    <span className="text-xs text-slate-500">Enable or disable new message notifications</span>
                 </div>
               </label>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              {message ? <span className="text-sm text-emerald-400">{message}</span> : <span />}
              <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg transition-colors text-sm">
                Save Profile
              </button>
            </div>
          </form>
        </div>

        <div className="bg-[#151619] border border-white/10 rounded-2xl p-8">
          <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" /> Account Security
          </h2>
          <form onSubmit={handlePasswordUpdate} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">New Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              {passMsg ? <span className="text-sm text-emerald-400">{passMsg}</span> : <span />}
              <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium shadow-lg transition-colors text-sm">
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>

      {user?.role === 'Managing Partner' && (
        <>
          <div className="bg-[#151619] border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
              <Mail className="w-5 h-5 text-emerald-400" /> Resend Email Dispatch Credentials
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Configure your firm's Resend API Key and verified sender email. These are stored securely in your private database and are used to send real automated and manual emails directly from your static site using our serverless database integration.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Resend API Key</label>
                <input
                  type="password"
                  value={resendApiKey}
                  onChange={e => setResendApiKey(e.target.value)}
                  placeholder="re_..."
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Sender Email Address</label>
                <input
                  type="email"
                  value={resendFromEmail}
                  onChange={e => setResendFromEmail(e.target.value)}
                  placeholder="onboarding@resend.dev"
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-white/10 flex items-center justify-between">
              {emailSettingsMsg ? <span className="text-sm text-emerald-400">{emailSettingsMsg}</span> : <span />}
              <button 
                onClick={handleSaveEmailSettings} 
                disabled={isSavingEmailSettings}
                className="bg-[#10b981] hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg transition-colors text-sm disabled:opacity-50"
              >
                {isSavingEmailSettings ? 'Saving...' : 'Save Email Settings'}
              </button>
            </div>
          </div>

          <div className="bg-[#151619] border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-emerald-400" /> Platform Customization
            </h2>
            <p className="text-slate-400 text-sm mb-6">Customize menu labels to match your firm's terminology.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {Object.keys(uiMap).map((key) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">{key}</label>
                  <input
                    type="text"
                    value={uiMap[key]}
                    onChange={e => setUiMap({ ...uiMap, [key]: e.target.value })}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-white/10 flex items-center justify-between">
              {uiConfigMsg ? <span className="text-sm text-emerald-400">{uiConfigMsg}</span> : <span />}
              <button onClick={handleSaveConfig} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg transition-colors text-sm">
                Save Customization
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
