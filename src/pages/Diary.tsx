import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Calendar as CalendarIcon, Search, Plus, Clock, Link as LinkIcon, XCircle, ChevronLeft, ChevronRight, Edit3, Trash2 } from 'lucide-react';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

type FirmEvent = {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  type: string;
  case_id?: string;
  case_title?: string;
};

type Task = {
  id: string;
  name: string;
  priority: string;
  status: string;
  case_id?: string;
  case_title?: string;
  due_date?: string;
};

export default function Diary() {
  const { user, token } = useAuth();
  const [events, setEvents] = useState<FirmEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<FirmEvent>({ id: '', title: '', description: '', date: '', time: '', type: 'Court Date', case_id: '', case_title: '' });

  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const [evRes, taskRes] = await Promise.all([
        supabase.from('events').select('*').eq('firm_id', user.firm_id),
        supabase.from('tasks').select('*').eq('firm_id', user.firm_id)
      ]);
      setEvents(evRes.data || []);
      setTasks(taskRes.data || []);
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
    
    // For creation, omit the ID if it's empty
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
  };

  const openAddModal = () => {
    setCurrentEvent({ id: '', title: '', description: '', date: '', time: '', type: 'Court Date', case_id: '', case_title: '' });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (event: FirmEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentEvent({ ...event });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const filteredEvents = events.filter(e => (e.title || '').toLowerCase().includes((search || '').toLowerCase()) || (e.description || '').toLowerCase().includes((search || '').toLowerCase()));
  const filteredTasks = tasks.filter(t => (t.name || '').toLowerCase().includes((search || '').toLowerCase()));

  // Calendar logic
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0-6 (Sun-Sat)
  
  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="p-10 max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight flex items-center gap-4">
            <CalendarIcon className="w-8 h-8 text-emerald-500" />
            Firm Diary
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Centralized event and court appointments.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search diary..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[#151619] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 w-64"
            />
          </div>
          <button 
            onClick={openAddModal}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        </div>
      </header>

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
              <div className="flex justify-between items-center mt-6">
                <div>
                  {isEditing && (
                    <button type="button" onClick={() => handleDelete(currentEvent.id)} className="text-sm text-red-500 hover:text-red-400 transition-colors">Delete Event</button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium">{isEditing ? 'Update' : 'Schedule'}</button>
                </div>
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

      <div className="bg-[#151619] border border-white/10 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-lg">
        <div className="p-4 border-b border-white/5 bg-[#1a1c20] flex items-center justify-between">
          <h2 className="text-xl font-medium text-white">{monthName}</h2>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded"><ChevronLeft className="w-5 h-5 text-slate-400" /></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1.5 hover:bg-white/5 rounded text-sm text-slate-400 font-medium">Today</button>
            <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded"><ChevronRight className="w-5 h-5 text-slate-400" /></button>
          </div>
        </div>
        
        <div className="grid grid-cols-7 border-b border-white/5 bg-[#151619]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">{day}</div>
          ))}
        </div>

        <div className="flex-1 grid grid-cols-7 grid-rows-5 bg-white/5 gap-[1px]">
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="bg-[#151619]" />;
            
            // Format check for 'YYYY-MM-DD'
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = filteredEvents.filter(e => e.date === dateStr);
            const dayTasks = filteredTasks.filter(t => t.due_date === dateStr);
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            return (
              <div key={day} className="bg-[#151619] p-2 overflow-y-auto hover:bg-[#1a1c20] transition-colors relative group min-h-[100px]">
                <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-sm mb-1 ${isToday ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>
                  {day}
                </div>
                <div className="space-y-1">
                  {dayEvents.map(e => (
                    <div 
                      key={e.id} 
                      onClick={(ev) => openEditModal(e, ev)}
                      className={`text-[10px] p-1 px-2 rounded truncate cursor-pointer transition-all hover:scale-[1.02] ${e.type === 'Court Date' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`} 
                      title={`Event: ${e.time} - ${e.title}`}
                    >
                      <span className="font-semibold">{e.time}</span> {e.title}
                    </div>
                  ))}
                  {dayTasks.map(t => (
                    <div 
                      key={t.id}
                      className="text-[10px] p-1 px-2 rounded truncate bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      title={`Task: ${t.name} (${t.status})`}
                    >
                      <span className="font-semibold">TASK:</span> {t.name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
