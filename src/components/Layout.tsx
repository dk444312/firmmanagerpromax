import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Briefcase, Calendar, FolderOpen, ShieldAlert, LogOut, ChevronDown, ChevronRight, CheckSquare, Settings, Users, Bell, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const { user, logout, uiConfig, token } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    diary: true,
    files: true,
    cases: true,
  });
  
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const fetchUnreadMessages = async () => {
    if (!token || !supabase || !user) return;
    if (user.message_notifications === false) {
       setUnreadMessages(0);
       return;
    }
    try {
      const { data: members } = await supabase.from('channel_members').select('channel_id, last_read_at').eq('user_id', user.id);
      if (!members || members.length === 0) return;
      
      let count = 0;
      for (const m of members) {
        const { count: msgCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', m.channel_id)
          .gt('created_at', m.last_read_at)
          .neq('sender_id', user.id);
          
        count += (msgCount || 0);
      }
      setUnreadMessages(count);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNotifications = async () => {
    if (!token || !supabase || !user) return;
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const sinceISO = oneWeekAgo.toISOString();

      const [casesRes, filesRes, tasksRes, eventsRes, filingsRes, requiresApprovalRes] = await Promise.all([
        supabase.from('cases').select('id, title, created_at').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
        supabase.from('files').select('id, filename, created_at, uploaded_by, requires_approval, approval_status, folder_id').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
        supabase.from('tasks').select('id, name, created_at').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
        supabase.from('events').select('id, title, created_at').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
        supabase.from('filing_logs').select('id, document, date, created_at, rate_mwk, staff_name').eq('firm_id', user.firm_id).gte('created_at', sinceISO),
        (user.role === 'Admin' || user.role === 'Managing Partner') ? supabase.from('files').select('id, filename, created_at, folder_id, uploaded_by').eq('firm_id', user.firm_id).eq('requires_approval', true).eq('approval_status', 'pending') : Promise.resolve({ data: [] })
      ]);

      const allNotifs: any[] = [];
      (casesRes.data || []).forEach(c => allNotifs.push({ type: 'Case', title: `New Case: ${c.title}`, date: c.created_at, link: `/cases/${c.id}` }));
      (filesRes.data || []).forEach(f => {
         allNotifs.push({ type: 'Document', title: `New Document: ${f.filename}`, date: f.created_at, link: `/files` });
         if (f.uploaded_by === user.id && f.requires_approval && f.approval_status === 'approved') {
            allNotifs.push({ type: 'Approval', title: `Document Approved: ${f.filename}`, date: f.created_at, link: `/files/${f.folder_id}` });
         }
         if (f.uploaded_by === user.id && f.requires_approval && f.approval_status === 'rejected') {
            allNotifs.push({ type: 'Approval', title: `Document Rejected: ${f.filename}`, date: f.created_at, link: `/files/${f.folder_id}` });
         }
      });
      (tasksRes.data || []).forEach(t => allNotifs.push({ type: 'Task', title: `New Task: ${t.name}`, date: t.created_at, link: `/tasks` }));
      (eventsRes.data || []).forEach(e => allNotifs.push({ type: 'Event', title: `New Event: ${e.title}`, date: e.created_at, link: `/diary` }));
      (filingsRes.data || []).forEach(fl => {
         if (user.role === 'Admin' || user.role === 'Managing Partner') {
            allNotifs.push({ type: 'Filing', title: `Filed ${fl.document} by ${fl.staff_name} (MWK ${fl.rate_mwk})`, date: fl.created_at || fl.date, link: `/files/hours` });
         }
      });
      (requiresApprovalRes.data || []).forEach(f => {
         allNotifs.push({ type: 'Approval', title: `Approval required for document: ${f.filename}`, date: f.created_at, link: `/files/${f.folder_id}` });
      });

      allNotifs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setNotifications(allNotifs);
      
      // Simple unread mechanism based on session length
      const lastChecked = localStorage.getItem('lastCheckedNotifications');
      if (lastChecked) {
        setUnreadCount(allNotifs.filter(n => new Date(n.date) > new Date(lastChecked)).length);
      } else {
        setUnreadCount(allNotifs.length);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchUnreadMessages();
    const intv = setInterval(() => {
      fetchNotifications();
      fetchUnreadMessages();
    }, 60000); // Check every minute
    return () => clearInterval(intv);
  }, [token, user]);

  if (!user) return null;

  const canAccess = (menuName: string) => {
    if (user.role === 'Managing Partner') return true;
    return user.accessible_menus.includes(menuName);
  };

  const getLabel = (defaultLabel: string) => {
    return uiConfig?.[defaultLabel] || defaultLabel;
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, id: 'dashboard', always: true },
    { 
      name: 'Cases', path: '/cases', icon: Briefcase, id: 'cases', always: false,
      subItems: [
        { name: 'Cases Center', path: '/cases' },
        { name: 'Case Workspace', path: '/cases/workspace' }
      ]
    },
    { 
      name: 'Clients', path: '/clients', icon: Users, id: 'clients', always: false,
      subItems: [
        { name: 'Clients Directory', path: '/clients' },
        { name: 'Manage Clients', path: '/clients/manage' }
      ]
    },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare, id: 'tasks', always: false },
    { 
      name: 'Diary', path: '/diary', icon: Calendar, id: 'diary', always: false,
      subItems: [
        { name: 'Overview', path: '/diary' },
        { name: 'Upcoming Events', path: '/diary/upcoming' },
        { name: 'Past Events', path: '/diary/past' },
      ]
    },
    { 
      name: 'Files', path: '/files', icon: FolderOpen, id: 'files', always: false,
      subItems: [
        { name: 'Files', path: '/files' },
        { name: 'Filing', path: '/files/hours' },
      ]
    },
    { name: 'Admin Matrix', path: '/admin', icon: ShieldAlert, id: 'admin', always: false },
    { name: 'Messages', path: '/messages', icon: MessageSquare, id: 'messages', always: true },
    { name: 'Settings', path: '/settings', icon: Settings, id: 'settings', always: true },
  ];

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex h-screen bg-[#0f0f0f] text-white overflow-hidden">
      {/* Sidebar sidebar: #121212 with subtle white border-right */}
      <aside className="w-64 bg-[#121212] border-r border-white/10 flex flex-col flex-shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-semibold text-emerald-500 tracking-wide">FirmManager</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{user.role}</p>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.filter(item => item.always || canAccess(item.id)).map((item) => {
            const isExpanded = expanded[item.id];
            const isActiveRoot = location.pathname === item.path || (item.subItems && item.subItems.some(sub => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/')));
            
            return (
              <div key={item.path} className="mb-1">
                <NavLink
                  to={item.subItems ? '#' : item.path}
                  onClick={(e) => item.subItems ? toggleExpand(item.id, e) : undefined}
                  className={() => cn(
                    "flex items-center justify-between px-4 py-2.5 rounded-md transition-all duration-200 border-l-2",
                    isActiveRoot && !item.subItems
                      ? "bg-[#262626] border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                      : (item.subItems ? "border-transparent text-slate-300 hover:bg-[#1a1a1a]" : "border-transparent text-slate-400 hover:bg-[#1a1a1a] hover:text-slate-200")
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className={cn("w-4 h-4", isActiveRoot && !item.subItems ? "text-emerald-500" : "text-slate-400")} />
                    <span className="font-medium tracking-wide text-sm">{getLabel(item.name)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                     {item.id === 'messages' && unreadMessages > 0 && (
                       <div className="bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full mr-1">
                         {unreadMessages > 99 ? '99+' : unreadMessages}
                       </div>
                     )}
                     {item.subItems && (
                       isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />
                     )}
                  </div>
                </NavLink>

                {item.subItems && isExpanded && (
                  <div className="ml-8 mt-1 space-y-1 border-l border-white/10 pl-2">
                    {item.subItems.map(sub => (
                      <NavLink
                        key={sub.name}
                        to={sub.path}
                        end
                        className={({ isActive }) => cn(
                          "block px-3 py-2 rounded-md text-xs font-medium transition-colors",
                          isActive ? "bg-emerald-500/10 text-emerald-400" : "text-slate-400 hover:text-slate-200 hover:bg-[#1a1a1a]"
                        )}
                      >
                        {getLabel(sub.name)}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={logout}
            className="flex items-center space-x-3 px-4 py-3 w-full rounded-md text-slate-400 hover:bg-[#1a1a1a] hover:text-slate-200 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-[#0f0f0f] relative overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 border-b border-white/5 bg-[#151619] flex items-center justify-end px-8 z-40 shadow-sm gap-4">
          <NavLink 
            to="/messages"
            className="relative p-2 rounded-full border border-white/5 bg-[#1a1c20] text-slate-400 hover:text-emerald-500 hover:bg-[#26282d] transition-colors shadow-sm"
          >
            <MessageSquare className="w-5 h-5" />
            {unreadMessages > 0 && (
              <div className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </div>
            )}
          </NavLink>
          <NavLink 
            to="/notifications"
            onClick={() => {
               setUnreadCount(0);
               localStorage.setItem('lastCheckedNotifications', new Date().toISOString());
            }}
            className="relative p-2 rounded-full border border-white/5 bg-[#1a1c20] text-slate-400 hover:text-white hover:bg-[#26282d] transition-colors shadow-sm"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </NavLink>
        </header>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
