import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Settings as SettingsIcon, Upload, Edit3, Key, Mail, Lock, Database, RefreshCw, Bell, Play, CheckCircle2, Clock, List, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';
import toast from 'react-hot-toast';

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

  // Backup & Reminder States (Requirement 19 & 20)
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);

  const [reminderLogs, setReminderLogs] = useState<any[]>([]);
  const [reminderLogsLoading, setReminderLogsLoading] = useState(false);
  const [runningReminders, setRunningReminders] = useState(false);
  const [reminderRunReport, setReminderRunReport] = useState<string[]>([]);

  useEffect(() => {
    // initialize from global state if present
    setUiMap((prev) => ({ ...prev, ...uiConfig }));
  }, [uiConfig]);

  const fetchBackupsAndLogs = async () => {
    if (!token || user?.role !== 'Managing Partner') return;
    try {
      setBackupsLoading(true);
      const res = await fetch('/api/admin/backups', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBackupsLoading(false);
    }

    try {
      setReminderLogsLoading(true);
      const res = await fetch('/api/admin/reminders/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReminderLogs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReminderLogsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!token) return;
    try {
      setCreatingBackup(true);
      const res = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: backupName })
      });
      if (res.ok) {
        toast.success("System backup snapshot created successfully!");
        setBackupName('');
        fetchBackupsAndLogs();
      } else {
        toast.error("Failed to create system backup");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error creating system backup");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (id: string) => {
    if (!token) return;
    if (!window.confirm("CRITICAL WARNING: Restoring this backup will overwrite all current cases, clients, tasks, and calendar events with the snapshot data. This action is irreversible. Do you wish to continue?")) {
      return;
    }
    try {
      setRestoringBackupId(id);
      const res = await fetch(`/api/admin/backups/${id}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("System data restored to snapshot successfully!");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error("Failed to restore system backup");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error restoring system backup");
    } finally {
      setRestoringBackupId(null);
    }
  };

  const handleRunReminders = async () => {
    if (!token) return;
    try {
      setRunningReminders(true);
      setReminderRunReport([]);
      const res = await fetch('/api/admin/reminders/run', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success(`Scan complete! Reminders sent: ${data.sentCount}`);
          setReminderRunReport(data.reports || ["No new reminders needed at this time."]);
          fetchBackupsAndLogs();
        } else {
          toast.error("Reminders scan failed");
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Error running reminders scanning engine");
    } finally {
      setRunningReminders(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'Managing Partner') {
      fetchBackupsAndLogs();
    }
  }, [user, token]);

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

          {/* Backup & Recovery Panel (Requirement 20) */}
          <div className="bg-[#151619] border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" /> Automatic Daily Backups & Disaster Recovery
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              To ensure absolute business continuity, the system automatically performs daily state backups. In the event of accidental deletions, corruption, or audit requests, administrators can restore the system state to any prior snapshot.
            </p>

            <div className="bg-[#0a0a0a] rounded-xl p-6 border border-white/5 mb-8 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Create Manual Backup Snapshot</h3>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  placeholder="e.g. Pre-Audit Snapshot July 2026"
                  className="flex-1 bg-[#151619] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                />
                <button
                  onClick={handleCreateBackup}
                  disabled={creatingBackup}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded font-medium transition-colors"
                >
                  {creatingBackup ? 'Creating Snapshot...' : 'Create Backup Snapshot'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" /> Backup Recovery Logs & Snapshots
              </h3>
              {backupsLoading ? (
                <div className="text-center text-xs text-slate-500 py-4">Querying archives...</div>
              ) : backups.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-4 border border-dashed border-white/5 rounded-xl">No prior backup snapshots registered.</div>
              ) : (
                <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-[#0a0a0a]">
                  {backups.map((b) => (
                    <div key={b.id} className="p-4 flex items-center justify-between hover:bg-white/[0.01] transition-colors">
                      <div>
                        <span className="font-semibold text-slate-200 text-sm block">{b.name}</span>
                        <span className="text-xs text-slate-500 font-mono">{new Date(b.created_at).toLocaleString()}</span>
                      </div>
                      <button
                        onClick={() => handleRestoreBackup(b.id)}
                        disabled={restoringBackupId !== null}
                        className="flex items-center gap-1.5 border border-amber-500/30 hover:bg-amber-500 hover:text-black text-amber-500 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${restoringBackupId === b.id ? 'animate-spin' : ''}`} />
                        {restoringBackupId === b.id ? 'Restoring...' : 'Restore State'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Automated Reminders Panel (Requirement 19) */}
          <div className="bg-[#151619] border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-400" /> Automated Hearing & Task Reminders
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              The automated email engine proactively scans calendar event rosters and tasks database. Hearing reminders are automatically dispatched 7 days, 3 days, 1 day, and 2 hours prior to scheduled court times. Overdue tasks trigger daily email reminders to assignees until completed.
            </p>

            <div className="bg-[#0a0a0a] rounded-xl p-6 border border-white/5 mb-8 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-300">Run Automated Reminders Dispatch</h3>
                  <p className="text-xs text-slate-500 mt-1">Force an on-demand background scan of the event logs and overdue task boards.</p>
                </div>
                <button
                  onClick={handleRunReminders}
                  disabled={runningReminders}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded font-medium transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {runningReminders ? 'Scanning System...' : 'Execute Reminders Scan'}
                </button>
              </div>

              {reminderRunReport.length > 0 && (
                <div className="bg-black rounded-lg p-4 font-mono text-xs text-emerald-400 border border-emerald-500/20 max-h-48 overflow-y-auto space-y-1">
                  <span className="text-slate-500 block border-b border-white/10 pb-1 mb-2">Scan Report Console:</span>
                  {reminderRunReport.map((rep, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-emerald-600 select-none">&gt;</span>
                      <span>{rep}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <List className="w-4 h-4 text-emerald-400" /> Automated Reminders History logs
              </h3>
              {reminderLogsLoading ? (
                <div className="text-center text-xs text-slate-500 py-4">Querying dispatcher logs...</div>
              ) : reminderLogs.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-4 border border-dashed border-white/5 rounded-xl">No automated reminders logged recently.</div>
              ) : (
                <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-[#0a0a0a]">
                  {reminderLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-white/[0.01] transition-colors">
                      <div>
                        <span className="font-semibold text-slate-200 text-sm block">{log.subject}</span>
                        <span className="text-xs text-slate-500">Recipient: <span className="font-mono text-slate-400">{log.recipient_email}</span></span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
                        <span className="text-[10px] font-mono text-slate-500">{new Date(log.sent_at).toLocaleString()}</span>
                        <span className="text-[10px] uppercase tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
                          SENT
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
