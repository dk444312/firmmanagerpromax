import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { NavLink } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export default function Notifications() {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!token || !supabase || !user) return;
      try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const sinceISO = oneWeekAgo.toISOString();

        const [casesRes, filesRes, tasksRes, eventsRes] = await Promise.all([
          supabase.from('cases').select('id, title, created_at').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
          supabase.from('files').select('id, filename, created_at').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
          supabase.from('tasks').select('id, name, created_at').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
          supabase.from('events').select('id, title, created_at').eq('firm_id', user.firm_id).gte('created_at', sinceISO)
        ]);

        const allNotifs: any[] = [];
        (casesRes.data || []).forEach(c => allNotifs.push({ type: 'Case', title: `New Case: ${c.title}`, date: c.created_at, link: `/cases` }));
        (filesRes.data || []).forEach(f => allNotifs.push({ type: 'Document', title: `New Document: ${f.filename}`, date: f.created_at, link: `/files` }));
        (tasksRes.data || []).forEach(t => allNotifs.push({ type: 'Task', title: `New Task: ${t.name}`, date: t.created_at, link: `/tasks` }));
        (eventsRes.data || []).forEach(e => allNotifs.push({ type: 'Event', title: `New Event: ${e.title}`, date: e.created_at, link: `/diary` }));

        allNotifs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setNotifications(allNotifs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
    localStorage.setItem('lastCheckedNotifications', new Date().toISOString());
  }, [token, user]);

  return (
    <div className="p-10 max-w-4xl mx-auto h-full flex flex-col">
      <header className="mb-10 flex items-end gap-6">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight flex items-center gap-3">
            <Bell className="w-8 h-8 text-emerald-500" />
            Notifications
          </h1>
          <p className="text-slate-400 mt-2">Recent activity across your firm.</p>
        </div>
      </header>

      <div className="flex-1 overflow-auto space-y-4">
        {loading ? (
           <div className="text-slate-500">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20 bg-[#151619] rounded-2xl border border-white/5">
            <Bell className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">No recent activity found.</p>
          </div>
        ) : (
          notifications.map((n, idx) => (
            <NavLink 
              key={idx} 
              to={n.link}
              className="flex flex-col p-5 bg-[#151619] hover:bg-[#1a1c20] border border-white/5 hover:border-emerald-500/30 rounded-xl transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                 <span className={cn(
                   "text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-md",
                   n.type === 'Case' ? 'bg-blue-500/10 text-blue-400' :
                   n.type === 'Document' ? 'bg-amber-500/10 text-amber-400' :
                   n.type === 'Task' ? 'bg-purple-500/10 text-purple-400' :
                   'bg-emerald-500/10 text-emerald-400'
                 )}>{n.type}</span>
                 <span className="text-xs text-slate-500">{new Date(n.date).toLocaleString()}</span>
              </div>
              <p className="text-base font-medium text-slate-200 group-hover:text-white mt-2">{n.title}</p>
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}
