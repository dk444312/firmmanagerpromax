import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { PlusCircle, UploadCloud, CalendarPlus, Briefcase, Calendar, CheckSquare, Edit, Trash2, XCircle, Link as LinkIcon, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { user, token } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<any>({ id: '', title: '', description: '', date: '', time: '', type: 'Court Date', case_id: '', case_title: '' });

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    
    // Fetch dashboard data
    const [casesRes, eventsRes, tasksRes, pendingRes] = await Promise.all([
      supabase.from('cases').select('*').eq('firm_id', user.firm_id),
      supabase.from('events').select('*').eq('firm_id', user.firm_id),
      supabase.from('tasks').select('*').eq('firm_id', user.firm_id),
      (user.role === 'Admin' || user.role === 'Managing Partner') ? supabase.from('files').select('*').eq('firm_id', user.firm_id).eq('requires_approval', true).eq('approval_status', 'pending') : Promise.resolve({ data: [] })
    ]);

    setCases(Array.isArray(casesRes.data) ? casesRes.data.slice(-4).reverse() : []);
    setEvents(Array.isArray(eventsRes.data) ? eventsRes.data.filter((e: any) => e.date >= new Date().toISOString().split('T')[0]).sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(0, 4) : []);
    setTasks(Array.isArray(tasksRes.data) ? tasksRes.data.filter((t: any) => t.status !== 'Completed').slice(-4).reverse() : []);
    setPendingApprovals(Array.isArray(pendingRes.data) ? pendingRes.data : []);
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    
    const payload = { ...currentEvent } as any;
    if (!payload.case_id) {
       payload.case_id = null;
       payload.case_title = null;
    }
    if (!isEditing) delete payload.id;

    if (isEditing) {
      await supabase.from('events').update(payload).eq('id', currentEvent.id);
    } else {
      await supabase.from('events').insert([{ ...payload, firm_id: user.firm_id }]);
    }
    
    fetchData();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || !supabase || !confirm("Delete this event?")) return;
    await supabase.from('events').delete().eq('id', id);
    fetchData();
  };

  const openEditModal = (event: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentEvent({ ...event });
    setIsEditing(true);
    setIsModalOpen(true);
  };
  
  if (!user) return null;

  return (
    <div className="p-10 max-w-6xl mx-auto overflow-y-auto h-full">
      <header className="mb-10 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight">Welcome, {user.name}</h1>
          <p className="text-slate-400 mt-2 text-lg">Here is your daily briefing.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium text-white">{user.name}</div>
            <div className="text-xs text-slate-500">{user.role}</div>
          </div>
          <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 overflow-hidden bg-[#151619] flex items-center justify-center">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="text-xl font-semibold text-emerald-500">{user.name.charAt(0)}</div>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <Link to="/cases" className="bg-[#151619] hover:bg-[#1a1c20] p-6 rounded-2xl border border-white/5 hover:border-emerald-500/30 shadow-lg flex flex-col items-center justify-center text-center transition-all group">
          <PlusCircle className="w-8 h-8 text-emerald-500 mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="text-sm font-medium text-white">Add Matter</h3>
          <p className="text-xs text-slate-500 mt-1">Open a new case</p>
        </Link>
        <Link to="/files" className="bg-[#151619] hover:bg-[#1a1c20] p-6 rounded-2xl border border-white/5 hover:border-blue-500/30 shadow-lg flex flex-col items-center justify-center text-center transition-all group">
          <UploadCloud className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="text-sm font-medium text-white">Upload File</h3>
          <p className="text-xs text-slate-500 mt-1">Vault new document</p>
        </Link>
        <Link to="/diary" className="bg-[#151619] hover:bg-[#1a1c20] p-6 rounded-2xl border border-white/5 hover:border-amber-500/30 shadow-lg flex flex-col items-center justify-center text-center transition-all group">
          <CalendarPlus className="w-8 h-8 text-amber-500 mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="text-sm font-medium text-white">Add Event</h3>
          <p className="text-xs text-slate-500 mt-1">Schedule hearing</p>
        </Link>
        <div className="bg-[#151619] p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-center relative group">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Role Status</h3>
          <div className="text-xl font-light text-white">{user.role}</div>
          <div className="text-xs mt-1 text-slate-400 capitalize">{user.case_access_mode} Case Access</div>
          
          {(user.role === 'Admin' || user.role === 'Managing Partner') && pendingApprovals.length > 0 && (
             <div className="absolute -top-3 -right-3 w-10 h-10 bg-rose-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-rose-500/20 border-[3px] border-[#151619] animate-bounce">
                {pendingApprovals.length}
             </div>
          )}
        </div>
      </div>

      {(user.role === 'Admin' || user.role === 'Managing Partner') && pendingApprovals.length > 0 && (
        <div className="mb-10 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
           <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-rose-400 flex items-center gap-2">
                 <CheckSquare className="w-5 h-5" />
                 Documents Pending Approval ({pendingApprovals.length})
              </h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingApprovals.map(file => (
                 <Link key={file.id} to={`/files/${file.folder_id}`} className="bg-[#151619] border border-white/10 hover:border-rose-500/50 p-4 rounded-xl flex items-center justify-between transition-colors group">
                    <div className="flex flex-col overflow-hidden">
                       <span className="text-sm font-medium text-white truncate">{file.filename}</span>
                       <span className="text-xs text-slate-500 truncate mt-1">Found in Vault</span>
                    </div>
                    <div className="text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity ml-4 text-xs font-medium">Review &rarr;</div>
                 </Link>
              ))}
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recent Cases */}
        <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-lg p-6 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-emerald-500" />
              Recent Matters
            </h3>
            <Link to="/cases" className="text-xs text-emerald-500 hover:text-emerald-400">View All</Link>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {cases.length === 0 ? (
              <p className="text-slate-500 text-sm mt-4 text-center">No recent matters.</p>
            ) : (
              cases.map(c => (
                <Link key={c.id} to={`/cases/${c.id}`} className="block bg-[#0a0a0a] p-4 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors">
                  <div className="text-xs text-slate-500 font-mono mb-1">{c.case_number || 'New'}</div>
                  <div className="text-sm font-medium text-slate-200">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-2">{c.stage || 'Pre-trial'}</div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-lg p-6 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              Upcoming Events
            </h3>
            <Link to="/diary/upcoming" className="text-xs text-amber-500 hover:text-amber-400">View All</Link>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {events.length === 0 ? (
              <p className="text-slate-500 text-sm mt-4 text-center">No upcoming events.</p>
            ) : (
              events.map(e => (
                <div key={e.id} onClick={(ev) => openEditModal(e, ev)} className="bg-[#0a0a0a] p-4 rounded-xl border border-white/5 hover:border-amber-500/30 transition-all group cursor-pointer relative overflow-hidden">
                  <div className="flex justify-between items-start mb-1 relative z-10">
                    <span className="text-xs text-slate-500">{e.date}</span>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] uppercase font-semibold text-amber-500 tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded">{e.type}</span>
                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Edit className="w-3 h-3 text-slate-400 hover:text-white" />
                          <Trash2 onClick={(ev) => handleDelete(e.id, ev)} className="w-3 h-3 text-slate-400 hover:text-red-400" />
                       </div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-slate-200 relative z-10">{e.title}</div>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 relative z-10">
                    <Clock className="w-3 h-3" /> {e.time}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-lg p-6 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-blue-500" />
              Pending Tasks
            </h3>
            <Link to="/tasks" className="text-xs text-blue-500 hover:text-blue-400">View All</Link>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {tasks.length === 0 ? (
              <p className="text-slate-500 text-sm mt-4 text-center">No pending tasks.</p>
            ) : (
              tasks.map(t => (
                <div key={t.id} className="bg-[#0a0a0a] p-4 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-slate-500 flex-shrink-0"></div>
                    <div>
                      <div className="text-sm font-medium text-slate-200">{t.title || t.name}</div>
                      <div className="text-xs text-slate-500 mt-1">Due: {t.due_date || 'No date'}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-medium text-white mb-4">{isEditing ? 'Edit Event' : 'Schedule Event'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Event Title</label>
                <input required type="text" value={currentEvent.title} onChange={e => setCurrentEvent({...currentEvent, title: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Matter (Optional)</label>
                {currentEvent.case_id ? (
                  <div className="flex items-center justify-between bg-[#0a0a0a] border border-emerald-500/30 rounded py-2 px-3 mb-4">
                    <span className="text-emerald-400 text-sm truncate">{currentEvent.case_title}</span>
                    <button type="button" onClick={() => setCurrentEvent({...currentEvent, case_id: '', case_title: ''})} className="text-slate-500 hover:text-red-400">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setIsSelectingCase(true)} className="w-full flex justify-center items-center gap-2 bg-[#0a0a0a] border border-dashed border-white/20 hover:border-emerald-500/50 rounded py-2 px-3 text-sm text-slate-400 hover:text-emerald-400 transition-colors mb-4">
                    <LinkIcon className="w-4 h-4" /> Link Matter
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date</label>
                  <input required type="date" value={currentEvent.date} onChange={e => setCurrentEvent({...currentEvent, date: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Time</label>
                  <input required type="time" value={currentEvent.time} onChange={e => setCurrentEvent({...currentEvent, time: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Type</label>
                <select value={currentEvent.type} onChange={e => setCurrentEvent({...currentEvent, type: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                  <option>Court Date</option>
                  <option>Client Meeting</option>
                  <option>Internal Review</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                <textarea value={currentEvent.description} onChange={e => setCurrentEvent({...currentEvent, description: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" rows={2}></textarea>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium">{isEditing ? 'Update' : 'Schedule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSelectingCase && (
        <CaseSelectorModal 
          onClose={() => setIsSelectingCase(false)}
          onSelect={(id, title) => {
            setCurrentEvent({ ...currentEvent, case_id: id, case_title: title });
            setIsSelectingCase(false);
          }}
        />
      )}
    </div>
  );
}
