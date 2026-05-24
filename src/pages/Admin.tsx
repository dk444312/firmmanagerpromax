import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

type StaffDTO = {
  id: string;
  name: string;
  username: string;
  role: string;
  accessible_menus: string[];
  case_access_mode: string;
  allowed_cases: string[];
  allowed_folders: string[];
  status: string;
  picture?: string;
};

type SelectableItem = { id: string; name: string };

const ALL_MENUS = ['cases', 'diary', 'files', 'finance', 'tasks', 'clients'];

function SelectionModal({ title, items, selected, onSave, onClose }: { 
  title: string, 
  items: SelectableItem[], 
  selected: string[], 
  onSave: (ids: string[]) => void, 
  onClose: () => void 
}) {
  const [current, setCurrent] = useState<string[]>(selected || []);

  const toggle = (id: string) => {
    if (current.includes(id)) setCurrent(current.filter(i => i !== id));
    else setCurrent([...current, id]);
  };

  const toggleAll = () => {
    if (current.length === items.length) setCurrent([]);
    else setCurrent(items.map(i => i.id));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#151619] border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl relative">
        <h2 className="text-2xl font-light text-white mb-6">Select {title}</h2>
        
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
          <span className="text-sm text-slate-400">{current.length} selected</span>
          <button 
            onClick={toggleAll}
            className="text-xs text-emerald-500 hover:underline"
          >
            {current.length === items.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="space-y-2 max-h-[40vh] overflow-y-auto mb-8 pr-2 custom-scrollbar">
          {items.map(item => (
            <label key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-white/5 cursor-pointer group transition-colors">
              <input 
                type="checkbox" 
                checked={current.includes(item.id)}
                onChange={() => toggle(item.id)}
                className="rounded border-white/10 bg-white/5 text-emerald-500 focus:ring-emerald-500/50"
              />
              <span className="text-sm text-slate-300 group-hover:text-white">{item.name}</span>
            </label>
          ))}
          {items.length === 0 && <div className="text-slate-500 text-center py-4 italic">No items found</div>}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-medium transition-colors">Cancel</button>
          <button 
            onClick={() => onSave(current)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-emerald-600/10 transition-all"
          >
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}

import StaffAccessCard from '../components/StaffAccessCard';

export default function Admin() {
  const { token, user } = useAuth();
  const [staff, setStaff] = useState<StaffDTO[]>([]);
  const [cases, setCases] = useState<SelectableItem[]>([]);
  const [folders, setFolders] = useState<SelectableItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSelection, setActiveSelection] = useState<{ 
    type: 'Cases' | 'Folders', 
    staffId: string, 
    selected: string[] 
  } | null>(null);
  
  const [activeStaffProfile, setActiveStaffProfile] = useState<StaffDTO | null>(null);

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const [staffRes, casesRes, foldersRes] = await Promise.all([
        supabase.from('staff').select('*').eq('firm_id', user.firm_id),
        supabase.from('cases').select('*').eq('firm_id', user.firm_id),
        supabase.from('folders').select('*').eq('firm_id', user.firm_id)
      ]);
      const staffData = staffRes.data || [];
      const casesData = casesRes.data || [];
      const foldersData = foldersRes.data || [];
      
      if (Array.isArray(staffData)) setStaff(staffData);
      if (Array.isArray(casesData)) setCases(casesData.map((c: any) => ({ id: c.id, name: c.title })));
      if (Array.isArray(foldersData)) setFolders(foldersData.map((f: any) => ({ id: f.id, name: f.name })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  const updatePermissions = async (staffId: string, updates: Partial<StaffDTO>) => {
    if (!token || !supabase) return;
    
    // Optimistic UI update
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, ...updates } : s));

    try {
      const s = staff.find(sm => sm.id === staffId);
      if (!s) return;

      Object.keys(updates).forEach(key => {
        if (updates[key as keyof StaffDTO] === undefined) {
          delete updates[key as keyof StaffDTO];
        }
      });

      await supabase.from('staff').update(updates).eq('id', staffId);

      // Need to notify if allowed_cases or allowed_folders is updated
      if (updates.allowed_cases || updates.allowed_folders) {
        let msg = '';
        if (updates.allowed_cases) msg += `You have been granted access to specific cases. `;
        if (updates.allowed_folders) msg += `You have been granted access to specific folders. `;
        fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userIds: [staffId], entityType: 'Access Update', entityName: 'Workspace', message: msg })
        }).catch(console.error);
      }
    } catch (e) {
      fetchData();
    }
  };

  const toggleMenu = (staffId: string, menu: string, currentMenus: string[]) => {
    const isAdding = !currentMenus.includes(menu);
    const newMenus = isAdding ? [...currentMenus, menu] : currentMenus.filter(m => m !== menu);
    updatePermissions(staffId, { accessible_menus: newMenus });
  };

  const toggleMode = (staffId: string, currentMode: string) => {
    const newMode = currentMode === 'all' ? 'assigned' : 'all';
    updatePermissions(staffId, { case_access_mode: newMode });
  };

  if (user?.role !== 'Managing Partner') {
    return <div className="p-10 text-red-400">Unauthorized</div>;
  }

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight flex items-center gap-4">
            <ShieldAlert className="w-8 h-8 text-emerald-500" />
            Staff Access Matrix
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Central control for firm permissions and access levels.</p>
        </div>
      </header>

      {loading ? (
        <div className="text-emerald-500">Loading matrix...</div>
      ) : (
        <div className="bg-[#151619] border border-white/5 shadow-lg rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1a1c20] border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold uppercase">Staff Member</th>
                  <th className="px-6 py-4 font-semibold uppercase">Role</th>
                  <th className="px-6 py-4 font-semibold uppercase w-1/2">Menus (Tick to Grant)</th>
                  <th className="px-6 py-4 font-semibold uppercase border-l border-white/10">Case Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {staff.map(member => {
                  const isSelf = member.id === user.id;
                  
                  return (
                    <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden bg-[#0a0a0a] flex items-center justify-center flex-shrink-0">
                            {member.picture ? (
                              <img src={member.picture} alt={member.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-emerald-500">{member.name.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-white">{member.name}</div>
                            <div className="text-xs text-slate-500 font-mono">@{member.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2 py-1 bg-white/5 rounded text-xs text-slate-300 border border-white/10">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        {isSelf ? (
                          <div className="text-sm text-slate-500 italic">Unrestricted access</div>
                        ) : (
                          <div className="flex flex-wrap gap-3">
                            {ALL_MENUS.map(menu => {
                              const isActive = member.accessible_menus.includes(menu);
                              return (
                                <button
                                  key={menu}
                                  onClick={() => toggleMenu(member.id, menu, member.accessible_menus)}
                                  className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium tracking-wide transition-colors",
                                    isActive 
                                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                                      : "bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                                  )}
                                >
                                  {isActive ? <ShieldCheck className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                                  <span className="capitalize">{menu}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5 border-l border-white/10">
                        {isSelf ? (
                          <span className="text-slate-500 italic text-sm">All Access</span>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-1 bg-[#0a0a0a] rounded-md p-1 border border-white/10 self-start">
                              <button
                                onClick={() => member.case_access_mode !== 'assigned' && toggleMode(member.id, member.case_access_mode)}
                                className={cn(
                                  "px-3 py-1 text-[10px] uppercase font-bold tracking-widest rounded transition-colors",
                                  member.case_access_mode === 'assigned'
                                    ? "bg-[#262626] text-white"
                                    : "text-slate-500 hover:text-slate-300"
                                )}
                              >
                                Assigned Only
                              </button>
                              <button
                                onClick={() => member.case_access_mode !== 'all' && toggleMode(member.id, member.case_access_mode)}
                                className={cn(
                                  "px-3 py-1 text-[10px] uppercase font-bold tracking-widest rounded transition-colors",
                                  member.case_access_mode === 'all'
                                    ? "bg-[#262626] text-white"
                                    : "text-slate-500 hover:text-slate-300"
                                )}
                              >
                                All Cases
                              </button>
                            </div>

                            {member.case_access_mode === 'assigned' && (
                              <div className="flex gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                <button 
                                  onClick={() => setActiveSelection({ type: 'Cases', staffId: member.id, selected: member.allowed_cases || [] })}
                                  className="text-[10px] text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded"
                                >
                                  {(member.allowed_cases || []).length} Cases
                                </button>
                                <button 
                                  onClick={() => setActiveSelection({ type: 'Folders', staffId: member.id, selected: member.allowed_folders || [] })}
                                  className="text-[10px] text-blue-500 hover:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded"
                                >
                                  {(member.allowed_folders || []).length} Folders
                                </button>
                              </div>
                            )}
                            
                            <button onClick={() => setActiveStaffProfile(member)} className="text-[10px] bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white px-3 py-1.5 rounded-md font-medium tracking-wide w-max mt-1 transition-colors border border-white/5">
                               Access Parameters Card
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSelection && (
        <SelectionModal 
          title={activeSelection.type}
          items={activeSelection.type === 'Cases' ? cases : folders}
          selected={activeSelection.selected}
          onSave={(newIds) => {
            const field = activeSelection.type === 'Cases' ? 'allowed_cases' : 'allowed_folders';
            updatePermissions(activeSelection.staffId, { [field]: newIds });
            setActiveSelection(null);
            if (activeStaffProfile && activeStaffProfile.id === activeSelection.staffId) {
               setActiveStaffProfile({ ...activeStaffProfile, [field]: newIds });
            }
          }}
          onClose={() => setActiveSelection(null)}
        />
      )}
      
      {activeStaffProfile && (
        <StaffAccessCard 
           member={activeStaffProfile} 
           onClose={() => setActiveStaffProfile(null)}
           onUpdate={(type: 'Cases' | 'Folders') => setActiveSelection({ type, staffId: activeStaffProfile.id, selected: type === 'Cases' ? activeStaffProfile.allowed_cases || [] : activeStaffProfile.allowed_folders || [] })}
        />
      )}
    </div>
  );
}
