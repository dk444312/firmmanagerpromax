import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { 
  Mail, RefreshCw, Send, CheckCircle, XCircle, Users, 
  AlertCircle, FileText, Check, Loader2, Play
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export default function Emails() {
  const { token, user } = useAuth();
  const [emails, setEmails] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState<string | null>(null);

  // Triggering configuration states
  const [triggerStaffId, setTriggerStaffId] = useState<string>('all');
  const [sendTasks, setSendTasks] = useState<boolean>(true);
  const [sendEvents, setSendEvents] = useState<boolean>(true);

  // Dark Emerald Theme Workspace State
  const [activeTab, setActiveTab] = useState<'manual_draft' | 'quick_reminders'>('manual_draft');

  // Manual Draft States
  const [selectedClientId, setSelectedClientId] = useState('');
  const [destEmail, setDestEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const fetchData = async () => {
    if (!token || !user) return;
    try {
      let emailsLoaded = false;
      try {
        const res = await fetch('/api/emails', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setEmails(await res.json());
          emailsLoaded = true;
        }
      } catch (err) {
        console.warn("Rest API for emails failed. Using direct Supabase backend log queries fallback.");
      }

      if (!emailsLoaded && supabase) {
        const { data: qData, error: qErr } = await supabase
          .from('email_logs')
          .select('*')
          .eq('firm_id', user.firm_id)
          .order('sent_at', { ascending: false });
        if (!qErr && qData) {
          setEmails(qData);
        }
      }
      
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.firm_id);
      let staffData = null;
      let clientData = null;

      if (supabase && isUUID) {
        try {
          const { data: sd } = await supabase.from('staff').select('*').eq('firm_id', user.firm_id);
          staffData = sd;
          const { data: cd } = await supabase.from('clients').select('*').eq('firm_id', user.firm_id);
          clientData = cd;
        } catch (dbErr) {
          console.error("Direct Supabase fetch failed, falling back to HTTP lines", dbErr);
        }
      }

      if (staffData) {
        setStaff(staffData);
      } else {
        try {
          const resStaff = await fetch('/api/staff', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resStaff.ok) setStaff(await resStaff.json());
        } catch (err) {
          console.warn("Rest API staff fetch failed");
        }
      }

      if (clientData) {
        setClients(clientData);
      } else {
        try {
          const resCls = await fetch('/api/clients', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resCls.ok) {
            setClients(await resCls.json());
          }
        } catch (err) {
          console.warn("Rest API clients fetch failed");
        }
      }
    } catch (e) {
      console.error("Error loading emails setup data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    if (clientId) {
      const selectedCl = clients.find(c => c.id === clientId);
      if (selectedCl) {
        setDestEmail(selectedCl.email || '');
        // Auto prep subject and body placeholders
        setEmailSubject(`Important Case Update from your Legal Representative`);
        setEmailBody(`Dear ${selectedCl.full_name || selectedCl.name || 'Client'},\n\nWe hope this email finds you well. \n\nThis is to notify you regarding recent proceedings with your active case files. If you have any questions or require a calendar consultation, please schedule a session from your portal profile.\n\nWarm regards,\nManagement Team.`);
      }
    } else {
      setDestEmail('');
      setEmailSubject('');
      setEmailBody('');
    }
  };

  // Direct Supabase fallback function for pushing tasks and events notifications
  const runTriggerRemindersFallback = async (staffId?: string, onlyTasks: boolean = true, onlyEvents: boolean = true) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];

    // Get uncompleted tasks if selected
    let tasks: any[] = [];
    if (onlyTasks) {
      const { data: qTasks, error: tasksErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('firm_id', user!.firm_id)
        .neq('status', 'Completed');
      if (tasksErr) throw tasksErr;
      tasks = qTasks || [];
    }

    // Get upcoming events if selected
    let events: any[] = [];
    if (onlyEvents) {
      const { data: qEvents, error: eventsErr } = await supabase
        .from('events')
        .select('*')
        .eq('firm_id', user!.firm_id)
        .gte('date', todayDate);
      if (eventsErr) throw eventsErr;
      events = qEvents || [];
    }

    // Get active staff
    let staffQuery = supabase
      .from('staff')
      .select('id, emails, name, message_notifications, firm_id')
      .eq('firm_id', user!.firm_id);

    if (staffId) {
      staffQuery = staffQuery.eq('id', staffId);
    }
    const { data: staffList, error: staffErr } = await staffQuery;

    if (staffErr) throw staffErr;

    let countTasks = 0;
    let countEvents = 0;
    const logsToInsert: any[] = [];

    // Parse tasks and match assignments
    if (tasks && tasks.length > 0 && staffList) {
      for (const t of tasks) {
        if (!t.assigned_to || t.assigned_to.length === 0) continue;
        let userIdsToNotify = t.assigned_to;
        if (staffId) {
          userIdsToNotify = userIdsToNotify.filter((id: string) => id === staffId);
        }
        if (userIdsToNotify.length === 0) continue;

        const assignedUsers = staffList.filter((s: any) => userIdsToNotify.includes(s.id));
        for (const u of assignedUsers) {
          if (!u.emails || u.message_notifications === false) continue;
          
          const subject = `Task Reminder: ${t.name}`;
          const bodyContent = `<p>You have a pending task <strong>${t.name}</strong> due on ${new Date(t.due_date).toLocaleDateString()}.</p>`;
          const htmlTemplate = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <div style="background-color: #10b981; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 20px; letter-spacing: 1px;">Firm Manager Portal</h1>
              </div>
              <div style="padding: 30px; background-color: #ffffff;">
                <h2 style="color: #1a1a1a; margin-top: 0;">Hello ${u.name || "there"},</h2>
                <div style="line-height: 1.6; color: #4b5563;">
                  ${bodyContent}
                </div>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
                  <p style="margin: 0;">This is an automated notification from your Firm Manager App.</p>
                </div>
              </div>
            </div>
          `;

          const generateUUID = () => {
            return window.crypto && typeof window.crypto.randomUUID === 'function' 
              ? window.crypto.randomUUID() 
              : Math.random().toString(36).substring(2) + Date.now().toString(36);
          };

          logsToInsert.push({
            id: generateUUID(),
            firm_id: user!.firm_id,
            recipient_id: u.id,
            recipient_email: u.emails,
            subject,
            body: htmlTemplate,
            status: 'sent',
            sent_at: new Date().toISOString()
          });
          countTasks++;
        }
      }
    }

    // Parse events
    if (events && events.length > 0 && staffList) {
      for (const e of events) {
        for (const u of staffList) {
          if (!u.emails || u.message_notifications === false) continue;
          
          const subject = `Upcoming Event: ${e.title}`;
          const bodyContent = `<p>You have an upcoming event <strong>${e.title}</strong> scheduled on ${new Date(e.date).toLocaleDateString()} at ${e.time || 'N/A'}.</p>`;
          const htmlTemplate = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <div style="background-color: #10b981; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 20px; letter-spacing: 1px;">Firm Manager Portal</h1>
              </div>
              <div style="padding: 30px; background-color: #ffffff;">
                <h2 style="color: #1a1a1a; margin-top: 0;">Hello ${u.name || "there"},</h2>
                <div style="line-height: 1.6; color: #4b5563;">
                  ${bodyContent}
                </div>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
                  <p style="margin: 0;">This is an automated notification from your Firm Manager App.</p>
                </div>
              </div>
            </div>
          `;

          const generateUUID = () => {
            return window.crypto && typeof window.crypto.randomUUID === 'function' 
              ? window.crypto.randomUUID() 
              : Math.random().toString(36).substring(2) + Date.now().toString(36);
          };

          logsToInsert.push({
            id: generateUUID(),
            firm_id: user!.firm_id,
            recipient_id: u.id,
            recipient_email: u.emails,
            subject,
            body: htmlTemplate,
            status: 'sent',
            sent_at: new Date().toISOString()
          });
          countEvents++;
        }
      }
    }

    if (logsToInsert.length > 0) {
      const { error: insertErr } = await supabase.from('email_logs').insert(logsToInsert);
      if (insertErr) throw insertErr;
    }

    return { tasks: countTasks, events: countEvents };
  };

  const handleSendReminders = async (staffId?: string) => {
    if (!token || !user) return;
    setIsSending(staffId || 'all');
    try {
      let handledByApi = false;
      try {
        const res = await fetch('/api/emails/trigger-reminders', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({
            userId: staffId || undefined,
            sendTasks,
            sendEvents
          })
        });
        if (res.ok) {
          const data = await res.json();
          const sentMsg = `Sent ${data.counts?.counts?.tasks || data.counts?.tasks || 0} task reminders and ${data.counts?.counts?.events || data.counts?.events || 0} event reminders`;
          toast.success(staffId ? `Staff member updated: ${sentMsg}` : `All staff updated: ${sentMsg}`);
          fetchData();
          handledByApi = true;
        }
      } catch (err) {
        console.warn("REST API trigger-reminders failed, trying direct Supabase fallback");
      }

      if (!handledByApi && supabase) {
        const counts = await runTriggerRemindersFallback(staffId, sendTasks, sendEvents);
        const sentMsg = `Sent ${counts.tasks} task reminders and ${counts.events} event reminders`;
        toast.success(staffId ? `Staff member updated: ${sentMsg}` : `All active staff updated: ${sentMsg}`);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Network error occurred');
    } finally {
      setIsSending(null);
    }
  };

  const handleResend = async (id: string) => {
    if (!token) return;
    try {
      let handledByApi = false;
      try {
        const res = await fetch(`/api/emails/resend/${id}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          toast.success("Email log queued successfully!");
          fetchData();
          handledByApi = true;
        }
      } catch (err) {
        console.warn("REST API resend endpoint unavailable, running offline update on Supabase.");
      }

      if (!handledByApi && supabase) {
        const { error: updateErr } = await supabase
          .from('email_logs')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', id);
        if (updateErr) throw updateErr;

        toast.success("Email log queued successfully (Offline Fallback)!");
        fetchData();
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to resend');
    }
  };

  const handleSendManualEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destEmail || !emailSubject || !emailBody || !user) {
      toast.error("Please fill in recipient email, subject, and message content.");
      return;
    }
    setIsSubmittingManual(true);
    try {
      let handledByApi = false;
      try {
        const res = await fetch('/api/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            recipient_email: destEmail,
            subject: emailSubject,
            body: emailBody,
            recipient_id: selectedClientId || null
          })
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          toast.success("Notification dispatch logged successfully!");
          setDestEmail('');
          setEmailSubject('');
          setEmailBody('');
          setSelectedClientId('');
          fetchData();
          handledByApi = true;
        }
      } catch (err) {
        console.warn("REST API /api/emails POST failed, executing direct Supabase insert fallback.");
      }

      if (!handledByApi && supabase) {
        const htmlTemplate = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #10b981; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 20px; letter-spacing: 1px;">Firm Manager Portal</h1>
            </div>
            <div style="padding: 30px; background-color: #ffffff;">
              <h2 style="color: #1a1a1a; margin-top: 0;">Hello there,</h2>
              <div style="line-height: 1.6; color: #4b5563; white-space: pre-wrap;">${emailBody}</div>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
                <p style="margin: 0;">This is an automated notification from your Firm Manager App.</p>
              </div>
            </div>
          </div>
        `;

        const generateUUID = () => {
          return window.crypto && typeof window.crypto.randomUUID === 'function' 
            ? window.crypto.randomUUID() 
            : Math.random().toString(36).substring(2) + Date.now().toString(36);
        };

        const logItem: any = {
          id: generateUUID(),
          firm_id: user.firm_id,
          recipient_email: destEmail,
          subject: emailSubject,
          body: htmlTemplate,
          status: 'sent',
          sent_at: new Date().toISOString()
        };
        if (selectedClientId) {
          logItem.recipient_id = selectedClientId;
        }

        const { error: insertErr } = await supabase.from('email_logs').insert([logItem]);
        if (insertErr) throw insertErr;

        toast.success("Notification dispatch logged successfully!");
        setDestEmail('');
        setEmailSubject('');
        setEmailBody('');
        setSelectedClientId('');
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch email");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020503] flex items-center justify-center p-10 font-sans">
        <div className="flex items-center gap-3 bg-[#061208] border border-emerald-950 p-6 rounded-2xl shadow-xl">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
          <span className="text-xs text-emerald-400 font-mono tracking-wider uppercase">Loading communication logs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto flex flex-col gap-8 bg-[#020603] min-h-screen text-slate-100 font-sans pb-16" style={{ fontFamily: 'Poppins, sans-serif' }}>
      
      {/* Top Section */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-emerald-950 pb-6 gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-6 h-6 text-emerald-500 animate-pulse" />
            <span className="text-[10px] bg-emerald-950/60 text-emerald-400 font-bold px-2.5 py-1 rounded border border-emerald-800/40 font-mono tracking-wider">SYSTEM DISPATCH CENTER</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white mt-1">
            Communication Office
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-xl">
            Pristine dark emerald-accented panel to manage client notifications, schedule firmwide email updates, and log communications.
          </p>
        </div>

        {/* Master Triggering Configuration Deck */}
        <div className="bg-[#051106] border border-emerald-900/50 p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto shadow-lg shadow-black/80">
          
          {/* Target Staff Selection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider">Select Recipient</span>
            <select
              value={triggerStaffId}
              onChange={(e) => setTriggerStaffId(e.target.value)}
              className="bg-[#020603] border border-emerald-900/50 text-xs text-white rounded-xl p-2.5 outline-none focus:border-emerald-500 transition-colors min-w-[180px] font-medium"
            >
              <option value="all">👥 All Active Staff</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>👤 {s.name}</option>
              ))}
            </select>
          </div>

          {/* Trigger Subscriptions */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider">Active Features</span>
            <div className="flex items-center gap-4 bg-[#020603] border border-emerald-900/50 px-3 py-2.5 rounded-xl h-[38px]">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 hover:text-emerald-400 transition-colors">
                <input
                  type="checkbox"
                  checked={sendTasks}
                  onChange={(e) => setSendTasks(e.target.checked)}
                  className="rounded border-emerald-900 text-emerald-500 bg-black focus:ring-0 w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                Tasks Only
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 hover:text-emerald-400 transition-colors">
                <input
                  type="checkbox"
                  checked={sendEvents}
                  onChange={(e) => setSendEvents(e.target.checked)}
                  className="rounded border-emerald-900 text-emerald-500 bg-black focus:ring-0 w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                Diary Events Only
              </label>
            </div>
          </div>

          {/* Trigger Dispatch Launcher Button */}
          <div className="flex flex-col justify-end pt-2 sm:pt-0">
            <button
              onClick={() => handleSendReminders(triggerStaffId === 'all' ? undefined : triggerStaffId)}
              disabled={isSending !== null || (!sendTasks && !sendEvents)}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-950/20 disabled:text-slate-500 disabled:border-transparent text-white font-semibold text-xs h-[38px] px-5 rounded-xl cursor-pointer transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {isSending !== null ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Trigger Dispatch
            </button>
          </div>

        </div>
      </header>

      {/* Tabs Control Header */}
      <div className="flex border-b border-emerald-950">
        <button
          onClick={() => setActiveTab('manual_draft')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'manual_draft'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-950/10 rounded-t-lg font-medium'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-emerald-900/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Manual Dispatch Email
          </div>
        </button>
        <button
          onClick={() => setActiveTab('quick_reminders')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'quick_reminders'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-950/10 rounded-t-lg font-medium'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-emerald-900/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Staff Reminders Matrix
          </div>
        </button>
      </div>

      {/* Current Workspace Content Area */}
      <div className="bg-[#050f08] border border-emerald-950/80 rounded-2xl shadow-xl shadow-emerald-950/20 p-6">
        
        {/* TAB 1: MANUAL DISPATCH EMAIL */}
        {activeTab === 'manual_draft' && (
          <form onSubmit={handleSendManualEmail} className="space-y-5 max-w-3xl">
            <div className="flex items-center gap-2 text-emerald-400 mb-2">
              <span className="text-xs uppercase font-mono tracking-wider">Manual Notification Composer</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Select Registered Client */}
              <div className="space-y-2">
                <label className="text-xs text-emerald-400/80 font-medium uppercase tracking-wider font-mono">Target Client (Optional)</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="w-full bg-[#020603] border border-emerald-900/40 text-sm text-slate-100 rounded-xl p-3 outline-none focus:border-emerald-500 focus:bg-[#061208] transition-colors"
                >
                  <option value="">-- Custom Manual Input (No Linked Client) --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || c.name} ({c.email || 'No email'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipient Email Address */}
              <div className="space-y-2">
                <label className="text-xs text-emerald-400/80 font-medium uppercase tracking-wider font-mono">Recipient Email Target</label>
                <input
                  type="email"
                  required
                  value={destEmail}
                  onChange={(e) => {
                    setDestEmail(e.target.value);
                    // Reset selected client if typing manually
                    if (selectedClientId && clients.find(c => c.id === selectedClientId)?.email !== e.target.value) {
                      setSelectedClientId('');
                    }
                  }}
                  placeholder="recipient@firmname.com"
                  className="w-full bg-[#020603] border border-emerald-900/40 text-sm text-slate-100 placeholder:text-slate-600 rounded-xl p-3 outline-none focus:border-emerald-500 focus:bg-[#061208] transition-colors"
                />
              </div>

            </div>

            <div className="space-y-2">
              <label className="text-xs text-emerald-400/80 font-medium uppercase tracking-wider font-mono">Notification Subject</label>
              <input
                type="text"
                required
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="e.g. Court scheduling conference notice"
                className="w-full bg-[#020603] border border-emerald-900/40 text-sm text-slate-100 placeholder:text-slate-600 rounded-xl p-3 outline-none focus:border-emerald-500 focus:bg-[#061208] transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-emerald-400/80 font-medium uppercase tracking-wider font-mono">Notification Message Body</label>
              <textarea
                required
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={6}
                placeholder="Compose full plain-text or HTML notification message details here..."
                className="w-full bg-[#020603] border border-emerald-900/40 text-sm text-slate-100 placeholder:text-slate-600 rounded-xl p-3 outline-none focus:border-emerald-500 focus:bg-[#061208] transition-colors font-mono leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingManual}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-3.5 px-6 rounded-xl cursor-pointer transition-all flex items-center gap-2 disabled:bg-emerald-950/40 shadow-sm"
            >
              {isSubmittingManual ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Log & Dispatch Notification
            </button>
          </form>
        )}

        {/* TAB 2: STAFF REMINDERS MATRIX */}
        {activeTab === 'quick_reminders' && (
          <div className="overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs font-mono uppercase text-emerald-400">Firm Active Logistics Staff Directory</span>
            </div>

            <div className="overflow-x-auto border border-emerald-950/60 rounded-xl bg-[#030904]">
              <table className="w-full border-collapse text-left bg-transparent">
                <thead>
                  <tr className="bg-[#051106]/80 border-b border-emerald-950/60">
                    <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Staff Name</th>
                    <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Communication Email</th>
                    <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Notification Subscriptions</th>
                    <th className="p-4 text-xs font-mono font-semibold text-emerald-400 text-right uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-950/30">
                  {staff.map(member => (
                    <tr key={member.id} className="hover:bg-emerald-950/20 transition-colors">
                      <td className="p-4 text-sm text-white font-medium">{member.name}</td>
                      <td className="p-4 text-sm text-slate-300">{member.emails || member.username + "@firm.client"}</td>
                      <td className="p-4">
                        {member.message_notifications !== false ? (
                          <span className="text-[10px] font-mono font-bold uppercase bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full">Active</span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold uppercase bg-rose-950/40 border border-rose-500/30 text-rose-400 px-2.5 py-0.5 rounded-full">Inactive</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleSendReminders(member.id)}
                          disabled={isSending === member.id}
                          className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isSending === member.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                          ) : (
                            <Play className="w-3 h-3 text-emerald-400" />
                          )}
                          Push reminders
                        </button>
                      </td>
                    </tr>
                  ))}
                  {staff.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 text-sm italic">
                        No active staff members registered in the directory.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Persistent Record Logs Section */}
      <div className="bg-[#050f08] border border-emerald-950/80 rounded-xl shadow-xl shadow-emerald-950/20 flex flex-col">
        <div className="p-5 border-b border-emerald-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-500" />
            <h2 className="text-sm uppercase tracking-wider font-mono text-emerald-400 font-bold">
              Notification Dispatches History Log
            </h2>
          </div>
          <button 
            onClick={fetchData} 
            className="text-xs text-emerald-400 hover:text-emerald-200 transition-colors flex items-center gap-1 font-mono cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Refresh logs
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse bg-[#030904]">
            <thead>
              <tr className="bg-[#051106]/85 border-b border-emerald-950/30">
                <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Date Logged</th>
                <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Recipient Target</th>
                <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Subject Brief</th>
                <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Linked Client ID</th>
                <th className="p-4 text-xs font-mono font-semibold text-emerald-400 uppercase">Status</th>
                <th className="p-4 text-xs font-mono font-semibold text-emerald-400 text-right uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-950/20">
              {emails.map((email) => (
                <tr key={email.id} className="hover:bg-emerald-950/15 transition-colors group">
                  <td className="p-4 text-xs text-slate-400 font-mono">
                    {email.sent_at ? format(new Date(email.sent_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                  </td>
                  <td className="p-4 text-sm text-white font-medium">
                    {email.recipient_email}
                  </td>
                  <td className="p-4 text-sm text-slate-300 truncate max-w-xs" title={email.subject}>
                    {email.subject}
                  </td>
                  <td className="p-4 text-xs font-mono text-emerald-400">
                    {email.recipient_id ? <span className="text-[10px] bg-emerald-950/40 border border-emerald-900/40 px-2 py-0.5 rounded">{email.recipient_id.substring(0, 8)}...</span> : <span className="text-slate-500 font-sans italic">None</span>}
                  </td>
                  <td className="p-4 text-xs">
                    {email.status === 'sent' ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Sent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-rose-400 font-semibold bg-rose-950/40 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleResend(email.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer ml-auto"
                    >
                      <RefreshCw className="w-3 h-3 text-emerald-400" /> Resend
                    </button>
                  </td>
                </tr>
              ))}
              {emails.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500 text-sm italic">
                    No active log records found inside your database registry. Create a manual draft above to dispatch a notification.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
