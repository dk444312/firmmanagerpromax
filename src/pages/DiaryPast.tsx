import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Calendar, Clock, Search, Edit3, Trash2, XCircle, Link as LinkIcon } from 'lucide-react';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

export default function DiaryPast() {
  const { user, token } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<any>({ id: '', title: '', description: '', date: '', time: '', type: 'Court Date', case_id: '', case_title: '' });

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const res = await supabase.from('events').select('*').eq('firm_id', user.firm_id);
      setEvents(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    
    const payload = isEditing ? currentEvent : { ...currentEvent };
    if (!isEditing) delete (payload as any).id;

    if (isEditing) {
      await supabase.from('events').update(payload).eq('id', currentEvent.id);
    } else {
      await supabase.from('events').insert([{ ...payload, firm_id: user.firm_id }]);
    }
    
    fetchData();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!token || !supabase || !confirm("Delete this event?")) return;
    await supabase.from('events').delete().eq('id', id);
    fetchData();
    setIsModalOpen(false);
  };

  const openEditModal = (event: any) => {
    setCurrentEvent({ ...event });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const today = new Date().toISOString().split('T')[0];
  const past = events
    .filter(e => e.date < today)
    .filter(e => (e.title || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-10 max-w-5xl mx-auto h-full flex flex-col">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-light text-slate-300 tracking-tight flex items-center gap-3">
            <Calendar className="w-8 h-8 text-slate-500" />
            Past Events
          </h1>
          <p className="text-slate-400 mt-2">Historical events and court schedules.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search past events..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#151619] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 w-64"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4">
        {loading ? (
          <div className="text-slate-500 text-center py-10">Loading events...</div>
        ) : past.length === 0 ? (
          <div className="text-slate-600 border border-dashed border-white/10 rounded-lg p-10 text-center">No past events recorded.</div>
        ) : (
          past.map(e => (
            <div key={e.id} className="bg-[#151619] opacity-80 border border-white/5 p-6 rounded-xl flex gap-6 hover:opacity-100 transition-opacity group relative">
              <div className="flex flex-col items-center justify-center p-4 bg-black/20 rounded-lg min-w-24">
                <span className="text-xs uppercase text-slate-500 font-semibold mb-1">
                   {new Date(e.date).toLocaleString('default', { month: 'short' })}
                </span>
                <span className="text-3xl text-slate-400 font-light leading-none">
                   {new Date(e.date).getDate()}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium text-slate-300">{e.title}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-widest bg-white/5 text-slate-400 px-2 py-1 rounded border border-white/10">{e.type}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditModal(e)} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/5"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(e.id)} className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 mb-3 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {e.time}</div>
                  {e.case_title && <div className="flex items-center gap-1.5 text-emerald-500/60"><LinkIcon className="w-3 h-3" /> {e.case_title}</div>}
                </div>
                {e.description && <p className="text-slate-400 text-sm whitespace-pre-wrap">{e.description}</p>}
              </div>
            </div>
          ))
        )}
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
