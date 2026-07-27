import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Briefcase, Calendar, FolderOpen, ShieldAlert, LogOut, ChevronDown, ChevronRight, CheckSquare, Settings, Users, Bell, MessageSquare, Mail, FileText, Sparkles, Clock, BarChart3, ShieldCheck, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import WelcomeTour from './WelcomeTour';

export default function Layout() {
  const { user, logout, uiConfig, token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    diary: true,
    files: true,
    cases: true,
  });
  
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showTour, setShowTour] = useState(false);

  // Universal Global Search state
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<any>(null);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [showGlobalResults, setShowGlobalResults] = useState(false);

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active && (
        active.tagName === 'INPUT' || 
        active.tagName === 'TEXTAREA' || 
        (active as HTMLElement).isContentEditable
      );

      // Ctrl + K or Cmd + K -> Global Search (always overrides)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setShowGlobalResults(true);
        return;
      }

      // Escape to close search / blur
      if (e.key === 'Escape') {
        if (active === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
        setShowGlobalResults(false);
        return;
      }

      // If user is typing in an input, do not trigger single-key shortcuts
      if (isInput) return;

      // F key -> Global Search Focus
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setShowGlobalResults(true);
        return;
      }

      // N key -> New Case
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        navigate('/cases?action=new');
        return;
      }

      // C key -> New Client
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        navigate('/clients?action=new');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  useEffect(() => {
    if (!globalQuery.trim()) {
      setGlobalResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingGlobal(true);
        const res = await fetch(`/api/universal-search?q=${encodeURIComponent(globalQuery)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const payload = await res.json();
          setGlobalResults(payload);
        }
      } catch (err) {
        console.error("Global search fetch error:", err);
      } finally {
        setSearchingGlobal(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [globalQuery, token]);


  useEffect(() => {
    // Check if the user has completed the major update tour
    const hasCompletedTour = localStorage.getItem('major_update_tour_v1');
    if (!hasCompletedTour) {
      setShowTour(true);
    }
  }, []);

  const completeTour = () => {
    localStorage.setItem('major_update_tour_v1', 'completed');
    setShowTour(false);
  };

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
        { name: 'Appointments', path: '/diary/appointments' },
      ]
    },
    { 
      name: 'Files', path: '/files', icon: FolderOpen, id: 'files', always: false,
      subItems: [
        { name: 'Files', path: '/files' },
        { name: 'Filing', path: '/files/hours' },
      ]
    },
    { name: 'Drafting', path: '/drafting', icon: FileText, id: 'drafting', always: true, comingSoon: true },
    { name: 'ATLAS', path: '/atlas', icon: Sparkles, id: 'atlas', always: true, comingSoon: true },
    { name: 'Admin Matrix', path: '/admin', icon: ShieldAlert, id: 'admin', always: false },
    { name: 'Messages', path: '/messages', icon: MessageSquare, id: 'messages', always: true },
    { name: 'Time Recording', path: '/time-recording', icon: Clock, id: 'time-recording', always: true },
    { name: 'Reports & Stats', path: '/reports', icon: BarChart3, id: 'reports', always: true },
    { name: 'Audit Trail', path: '/audit-trail', icon: ShieldCheck, id: 'audit-trail', always: true },
    { name: 'Sent Emails', path: '/emails', icon: Mail, id: 'emails', always: true },
    { name: 'Settings', path: '/settings', icon: Settings, id: 'settings', always: true },
  ];

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isAtlasPage = location.pathname === '/atlas';

  if (isAtlasPage) {
    return (
      <div className="flex h-screen bg-[#0d0d0e] text-white overflow-hidden">
        <main className="flex-1 flex flex-col bg-[#0d0d0e] relative overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

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
                  id={`nav-${item.id}`}
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
                    {(item as any).comingSoon && (
                      <span className="text-[8px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-tighter">
                        SOON
                      </span>
                    )}
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
        <header className="h-16 flex-shrink-0 border-b border-white/5 bg-[#151619] flex items-center justify-between px-8 z-40 shadow-sm gap-4">
          
          {/* Universal Global Search Input */}
          <div className="relative w-full max-w-md hidden md:block">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search clients, matters, documents, hearings, notes..."
                value={globalQuery}
                onChange={(e) => {
                  setGlobalQuery(e.target.value);
                  setShowGlobalResults(true);
                }}
                onFocus={() => setShowGlobalResults(true)}
                className="w-full bg-[#0a0a0a] border border-white/5 hover:border-white/10 focus:border-emerald-500 focus:bg-black rounded-xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none transition-all"
              />
              {globalQuery && (
                <button 
                  onClick={() => {
                    setGlobalQuery('');
                    setGlobalResults(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs font-semibold"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Global Results Dropdown Panel */}
            {showGlobalResults && (globalQuery.trim() || searchingGlobal) && (
              <div className="absolute left-0 mt-2 w-[540px] bg-[#151619] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[480px] overflow-y-auto">
                <div className="p-3 border-b border-white/5 flex justify-between items-center bg-[#1a1c20]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {searchingGlobal ? "Scanning system archives..." : "Search results"}
                  </span>
                  <button 
                    onClick={() => setShowGlobalResults(false)}
                    className="text-[10px] text-slate-400 hover:text-white font-medium bg-[#2c2d30] px-2 py-1 rounded"
                  >
                    Dismiss
                  </button>
                </div>

                {searchingGlobal ? (
                  <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    Retrieving matching logs...
                  </div>
                ) : globalResults && (
                  Object.values(globalResults).some((arr: any) => arr && arr.length > 0)
                ) ? (
                  <div className="divide-y divide-white/[0.03] p-2 space-y-2">
                    {/* Cases Category */}
                    {globalResults.cases && globalResults.cases.length > 0 && (
                      <div className="p-2 space-y-1">
                        <h4 className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1 px-1">Matters & Cases ({globalResults.cases.length})</h4>
                        {globalResults.cases.map((c: any) => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setShowGlobalResults(false);
                              navigate(`/cases/${c.id}`);
                            }}
                            className="p-2 rounded-lg hover:bg-[#1f2024] cursor-pointer transition-colors text-left"
                          >
                            <span className="text-xs font-semibold text-white block">{c.title}</span>
                            <span className="text-[10px] text-slate-400 font-mono">No: {c.case_number || 'Pending'} | Stage: {c.stage || 'Client Consultation'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Clients Category */}
                    {globalResults.clients && globalResults.clients.length > 0 && (
                      <div className="p-2 space-y-1">
                        <h4 className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mb-1 px-1">Registered Clients ({globalResults.clients.length})</h4>
                        {globalResults.clients.map((c: any) => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setShowGlobalResults(false);
                              navigate('/clients');
                            }}
                            className="p-2 rounded-lg hover:bg-[#1f2024] cursor-pointer transition-colors text-left"
                          >
                            <span className="text-xs font-semibold text-white block">{c.name}</span>
                            <span className="text-[10px] text-slate-400 font-medium">Company: {c.company || 'Private Client'} | Email: {c.email}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Documents Category */}
                    {globalResults.documents && globalResults.documents.length > 0 && (
                      <div className="p-2 space-y-1">
                        <h4 className="text-[9px] font-bold text-purple-400 uppercase tracking-wider mb-1 px-1">Documents & Folders ({globalResults.documents.length})</h4>
                        {globalResults.documents.map((d: any) => (
                          <div 
                            key={d.id} 
                            onClick={() => {
                              setShowGlobalResults(false);
                              if (d.case_id) navigate(`/cases/${d.case_id}`);
                              else navigate('/files');
                            }}
                            className="p-2 rounded-lg hover:bg-[#1f2024] cursor-pointer transition-colors text-left"
                          >
                            <span className="text-xs font-semibold text-white block">📂 {d.name}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{d.type} {d.category ? `• Category: ${d.category}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Hearings Category */}
                    {globalResults.hearings && globalResults.hearings.length > 0 && (
                      <div className="p-2 space-y-1">
                        <h4 className="text-[9px] font-bold text-amber-500 uppercase tracking-wider mb-1 px-1">Hearings & Calendar Diary ({globalResults.hearings.length})</h4>
                        {globalResults.hearings.map((h: any) => (
                          <div 
                            key={h.id} 
                            onClick={() => {
                              setShowGlobalResults(false);
                              navigate('/diary');
                            }}
                            className="p-2 rounded-lg hover:bg-[#1f2024] cursor-pointer transition-colors text-left"
                          >
                            <span className="text-xs font-semibold text-white block">{h.title}</span>
                            <span className="text-[10px] text-slate-400 font-medium">Venue: {h.venue} | Judge: {h.judge} | Date: {new Date(h.date).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Messages Category */}
                    {globalResults.messages && globalResults.messages.length > 0 && (
                      <div className="p-2 space-y-1">
                        <h4 className="text-[9px] font-bold text-sky-400 uppercase tracking-wider mb-1 px-1">Encrypted Messages ({globalResults.messages.length})</h4>
                        {globalResults.messages.map((m: any) => (
                          <div 
                            key={m.id} 
                            onClick={() => {
                              setShowGlobalResults(false);
                              navigate('/messages');
                            }}
                            className="p-2 rounded-lg hover:bg-[#1f2024] cursor-pointer transition-colors text-left"
                          >
                            <span className="text-xs text-slate-300 block truncate font-medium">"{m.content}"</span>
                            <span className="text-[10px] text-slate-500 font-mono">From: {m.sender} to {m.receiver}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notes Category */}
                    {globalResults.notes && globalResults.notes.length > 0 && (
                      <div className="p-2 space-y-1">
                        <h4 className="text-[9px] font-bold text-teal-400 uppercase tracking-wider mb-1 px-1">Pinboard & Case Notes ({globalResults.notes.length})</h4>
                        {globalResults.notes.map((n: any) => (
                          <div 
                            key={n.id} 
                            onClick={() => {
                              setShowGlobalResults(false);
                              if (n.case_id) navigate(`/cases/${n.case_id}`);
                              else navigate('/cases');
                            }}
                            className="p-2 rounded-lg hover:bg-[#1f2024] cursor-pointer transition-colors text-left"
                          >
                            <span className="text-xs text-slate-300 block truncate font-medium">"{n.note}"</span>
                            <span className="text-[10px] text-slate-500 font-mono">Authored by {n.author || 'Staff'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center text-xs text-slate-500 italic">
                    No matching records located in cases, clients, documents, hearings, messages or notes.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
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
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>

      {showTour && <WelcomeTour onComplete={completeTour} />}
    </div>
  );
}
