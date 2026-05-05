import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Briefcase, Calendar, FolderOpen, ShieldAlert, LogOut, ChevronDown, ChevronRight, CheckSquare, Settings, Users } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const { user, logout, uiConfig } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    diary: true,
    files: true,
    cases: true,
  });

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
      <main className="flex-1 overflow-auto bg-[#0f0f0f]">
        <Outlet />
      </main>
    </div>
  );
}
