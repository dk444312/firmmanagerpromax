import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Briefcase, Calendar, FolderOpen, ShieldAlert, LogOut, ChevronDown, ChevronRight, CheckSquare, Settings, Users, Bell, X } from 'lucide-react';
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
      (casesRes.data || []).forEach(c => allNotifs.push({ type: 'Case', title: `New Case: ${c.title}`, date: c.created_at, link: `/cases/${c.id}` }));
      (filesRes.data || []).forEach(f => allNotifs.push({ type: 'Document', title: `New Document: ${f.filename}`, date: f.created_at, link: `/files` }));
      (tasksRes.data || []).forEach(t => allNotifs.push({ type: 'Task', title: `New Task: ${t.name}`, date: t.created_at, link: `/tasks` }));
      (eventsRes.data || []).forEach(e => allNotifs.push({ type: 'Event', title: `New Event: ${e.title}`, date: e.created_at, link: `/diary` }));

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
    const intv = setInterval(fetchNotifications, 60000); // Check every minute
    return () => clearInterval(intv);
  }, [token, user]);

  const handleOpenNotifications = () => {
    setIsNotificationOpen(true);
    setUnreadCount(0);
    localStorage.setItem('lastCheckedNotifications', new Date().toISOString());
  };

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
    { name: 'Clients', path: '/clients', icon: Users, id: 'clients', always: false },
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
                  {item.subItems && (
                    isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
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
      <main className="flex-1 overflow-auto bg-[#0f0f0f] relative">
        <div className="absolute top-4 right-8 z-40">
          <button 
            onClick={handleOpenNotifications}
            className="relative p-2 rounded-full bg-[#151619] border border-white/10 text-slate-400 hover:text-white hover:bg-[#202226] transition-colors shadow-lg"
          >
            <Bell className="w-6 h-6" />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </button>
        </div>
        <Outlet />
      </main>

      {/* Notification Modal */}
      {isNotificationOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-2xl p-0 w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#1a1c20] rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Bell className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-medium text-white tracking-tight">Recent Activity</h2>
                  <p className="text-xs text-slate-400 mt-1">Updates from the last 7 days</p>
                </div>
              </div>
              <button onClick={() => setIsNotificationOpen(false)} className="text-slate-500 hover:text-red-400 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {notifications.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <Bell className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">No recent activity found.</p>
                </div>
              ) : (
                notifications.map((n, idx) => (
                  <NavLink 
                    key={idx} 
                    to={n.link}
                    onClick={() => setIsNotificationOpen(false)}
                    className="flex flex-col p-4 bg-[#1a1c20] hover:bg-[#202226] border border-white/5 hover:border-emerald-500/30 rounded-xl transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                       <span className={cn(
                         "text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md",
                         n.type === 'Case' ? 'bg-blue-500/10 text-blue-400' :
                         n.type === 'Document' ? 'bg-amber-500/10 text-amber-400' :
                         n.type === 'Task' ? 'bg-purple-500/10 text-purple-400' :
                         'bg-emerald-500/10 text-emerald-400'
                       )}>{n.type}</span>
                       <span className="text-xs text-slate-500">{new Date(n.date).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white">{n.title}</p>
                  </NavLink>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
