import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Calendar as CalendarIcon, Search, Plus, Clock, Link as LinkIcon, XCircle, ChevronLeft, ChevronRight, Edit3, Trash2, CalendarPlus, Sparkles, AlertCircle, Edit, Check } from 'lucide-react';
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
  
  // Extra Lookup Data states
  const [cases, setCases] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  // View States
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month' | 'agenda'>('month');

  // Filter States
  const [filterCourt, setFilterCourt] = useState('');
  const [filterLawyer, setFilterLawyer] = useState('');
  const [filterJudge, setFilterJudge] = useState('');
  const [filterCase, setFilterCase] = useState('');
  const [filterDate, setFilterDate] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<FirmEvent>({ id: '', title: '', description: '', date: '', time: '', type: 'Court Date', case_id: '', case_title: '' });

  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const [evRes, taskRes, aptRes, casesRes, staffRes] = await Promise.all([
        supabase.from('events').select('*').eq('firm_id', user.firm_id),
        supabase.from('tasks').select('*').eq('firm_id', user.firm_id),
        supabase.from('appointments').select('*').eq('firm_id', user.firm_id),
        supabase.from('cases').select('*').eq('firm_id', user.firm_id),
        supabase.from('staff').select('id, name, role').eq('firm_id', user.firm_id)
      ]);
      
      let evs = evRes.data || [];
      let tsks = taskRes.data || [];
      let apts = aptRes.data || [];
      let cs = casesRes.data || [];
      let stf = staffRes.data || [];
      
      if (user.role !== 'Managing Partner' && user.case_access_mode === 'assigned') {
        const allowedCases = user.allowed_cases || [];
        evs = evs.filter(e => !e.case_id || allowedCases.includes(e.case_id));
        tsks = tsks.filter(t => !t.case_id || allowedCases.includes(t.case_id));
        cs = cs.filter(c => (c.assigned_staff_ids || []).includes(user.id) || allowedCases.includes(c.id));
      }
      
      setEvents(evs);
      setTasks(tsks);
      setAppointments(apts);
      setCases(cs);
      setStaff(stf);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  // Color Coding Helper based on Jurisdiction
  const getJurisdictionColor = (caseId?: string, type?: string) => {
    if (!caseId) {
      if (type === 'Court Date') return {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/20',
        dot: 'bg-red-400',
        label: 'Court Date'
      };
      return {
        bg: 'bg-slate-500/10',
        text: 'text-slate-400',
        border: 'border-slate-500/20',
        dot: 'bg-slate-400',
        label: type || 'Event'
      };
    }

    const linkedCase = cases.find(c => c.id === caseId);
    if (!linkedCase) {
      return {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/20',
        dot: 'bg-red-400',
        label: 'Court Appearance'
      };
    }

    const court = (linkedCase.court || '').trim().toLowerCase();

    if (court.includes('high')) {
      return {
        bg: 'bg-blue-500/15',
        text: 'text-blue-400',
        border: 'border-blue-500/30',
        dot: 'bg-blue-400',
        label: 'High Court'
      };
    }
    if (court.includes('supreme')) {
      return {
        bg: 'bg-purple-500/15',
        text: 'text-purple-400',
        border: 'border-purple-500/30',
        dot: 'bg-purple-400',
        label: 'Supreme Court'
      };
    }
    if (court.includes('magistrate')) {
      return {
        bg: 'bg-green-500/15',
        text: 'text-green-400',
        border: 'border-green-500/30',
        dot: 'bg-green-400',
        label: 'Magistrates\' Court'
      };
    }
    if (court.includes('industrial') || court.includes('relation')) {
      return {
        bg: 'bg-orange-500/15',
        text: 'text-orange-400',
        border: 'border-orange-500/30',
        dot: 'bg-orange-400',
        label: 'Industrial Relations'
      };
    }
    if (court.includes('appeal')) {
      return {
        bg: 'bg-red-500/15',
        text: 'text-red-400',
        border: 'border-red-500/30',
        dot: 'bg-red-400',
        label: 'Appeals'
      };
    }

    return {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-400',
      label: linkedCase.court || 'Court Appearance'
    };
  };

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

  const handleDelete = async (id: string) => {
    if (!token || !supabase || !confirm("Delete this event?")) return;
    await supabase.from('events').delete().eq('id', id);
    fetchData();
    setIsModalOpen(false);
  };

  const openAddModal = (initialDate?: string) => {
    setCurrentEvent({ 
      id: '', 
      title: '', 
      description: '', 
      date: initialDate || selectedCalendarDate, 
      time: '09:00', 
      type: 'Court Date', 
      case_id: '', 
      case_title: '' 
    });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (event: FirmEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentEvent({ ...event });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const filteredEvents = events.filter(e => {
    const matchesSearch = !search || 
      (e.title || '').toLowerCase().includes(search.toLowerCase()) || 
      (e.description || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    const linkedCase = cases.find(c => c.id === e.case_id);

    if (filterCourt) {
      if (!linkedCase || !linkedCase.court || !linkedCase.court.toLowerCase().includes(filterCourt.toLowerCase())) {
        return false;
      }
    }

    if (filterLawyer) {
      if (!linkedCase || !linkedCase.assigned_staff_ids || !linkedCase.assigned_staff_ids.includes(filterLawyer)) {
        return false;
      }
    }

    if (filterJudge) {
      if (!linkedCase || !linkedCase.judge_name || !linkedCase.judge_name.toLowerCase().includes(filterJudge.toLowerCase())) {
        return false;
      }
    }

    if (filterCase) {
      if (e.case_id !== filterCase) {
        return false;
      }
    }

    if (filterDate) {
      if (e.date !== filterDate) {
        return false;
      }
    }

    return true;
  });

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = !search || (t.name || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    const linkedCase = cases.find(c => c.id === t.case_id);

    if (filterCourt) {
      if (!linkedCase || !linkedCase.court || !linkedCase.court.toLowerCase().includes(filterCourt.toLowerCase())) {
        return false;
      }
    }

    if (filterLawyer) {
      if (!linkedCase || !linkedCase.assigned_staff_ids || !linkedCase.assigned_staff_ids.includes(filterLawyer)) {
        return false;
      }
    }

    if (filterJudge) {
      if (!linkedCase || !linkedCase.judge_name || !linkedCase.judge_name.toLowerCase().includes(filterJudge.toLowerCase())) {
        return false;
      }
    }

    if (filterCase) {
      if (t.case_id !== filterCase) {
        return false;
      }
    }

    if (filterDate) {
      if (t.due_date !== filterDate) {
        return false;
      }
    }

    return true;
  });

  const filteredAppointments = appointments.filter(a => {
    const matchesSearch = !search || (a.reason || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (filterCase || filterJudge || filterCourt) return false;

    if (filterDate) {
      if (a.date !== filterDate) {
        return false;
      }
    }

    return true;
  });

  const distinctJudges = Array.from(new Set(cases.map(c => c.judge_name).filter(Boolean))) as string[];
  const hoursOfDay = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

  const getWeekRangeString = () => {
    const current = new Date(currentDate);
    const dayOfWeek = current.getDay();
    const sunday = new Date(current);
    sunday.setDate(current.getDate() - dayOfWeek);
    
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    
    return `${sunday.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${saturday.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const getDayString = () => {
    try {
      const parts = selectedCalendarDate.split('-');
      const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return dObj.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return selectedCalendarDate;
    }
  };

  const getWeekDays = () => {
    const current = new Date(currentDate);
    const dayOfWeek = current.getDay();
    const sunday = new Date(current);
    sunday.setDate(current.getDate() - dayOfWeek);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const getFullAgendaItems = () => {
    const items: any[] = [];
    
    filteredEvents.forEach(e => {
      items.push({
        id: e.id,
        type: 'event',
        eventType: e.type,
        title: e.title,
        description: e.description,
        date: e.date,
        time: e.time,
        case_id: e.case_id,
        case_title: e.case_title,
        raw: e
      });
    });

    filteredAppointments.forEach(a => {
      items.push({
        id: a.id,
        type: 'appointment',
        eventType: 'Client Meet',
        title: a.reason || 'Legal Consultation',
        description: `Client: ${a.client?.full_name || 'Client Folder'}`,
        date: a.date,
        time: a.time,
        raw: a
      });
    });

    filteredTasks.forEach(t => {
      if (t.due_date) {
        items.push({
          id: t.id,
          type: 'task',
          eventType: 'Deadline',
          title: t.name,
          description: `Priority: ${t.priority} | Status: ${t.status}`,
          date: t.due_date,
          time: '23:59',
          raw: t
        });
      }
    });

    return items.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
      const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
      return dateA.getTime() - dateB.getTime();
    });
  };

  // Calendar rendering calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0-6 (Sun-Sat)
  
  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }
  
  const remainingCells = 42 - days.length;
  for (let i = 0; i < remainingCells; i++) {
    days.push(null);
  }

  const prevMonth = () => {
    if (calendarView === 'week') {
      const prevWeek = new Date(currentDate);
      prevWeek.setDate(currentDate.getDate() - 7);
      setCurrentDate(prevWeek);
    } else if (calendarView === 'day') {
      const prevDay = new Date(currentDate);
      prevDay.setDate(currentDate.getDate() - 1);
      setCurrentDate(prevDay);
      // Synchronize selectedCalendarDate
      setSelectedCalendarDate(`${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`);
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };
  
  const nextMonth = () => {
    if (calendarView === 'week') {
      const nextWeek = new Date(currentDate);
      nextWeek.setDate(currentDate.getDate() + 7);
      setCurrentDate(nextWeek);
    } else if (calendarView === 'day') {
      const nextDay = new Date(currentDate);
      nextDay.setDate(currentDate.getDate() + 1);
      setCurrentDate(nextDay);
      // Synchronize selectedCalendarDate
      setSelectedCalendarDate(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`);
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Today marker
  const todayObj = new Date();
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

  // Smart indicators calculation helper
  const checkDayHasHearing = (dayStr: string) => {
    return filteredEvents.some(e => e.date === dayStr && e.type === 'Court Date');
  };

  const checkDayHasAppointment = (dayStr: string) => {
    return filteredAppointments.some(a => a.date === dayStr) || filteredEvents.some(e => e.date === dayStr && e.type === 'Client Meeting');
  };

  const checkDayHasDeadline = (dayStr: string) => {
    return filteredTasks.some(t => t.due_date === dayStr) || filteredEvents.some(e => e.date === dayStr && (e.type === 'Internal Review' || e.type === 'Other'));
  };

  // Agenda Filtered List for Selected Day
  const selectedDateEvents = filteredEvents.filter(e => e.date === selectedCalendarDate);
  const selectedDateAppointments = filteredAppointments.filter(a => a.date === selectedCalendarDate);
  const selectedDateTasks = filteredTasks.filter(t => t.due_date === selectedCalendarDate);

  return (
    <div className="p-10 max-w-7xl mx-auto h-full overflow-y-auto flex flex-col font-sans">
      <header className="mb-8 flex flex-shrink-0 justify-between items-end">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight flex items-center gap-4">
            <CalendarIcon className="w-8 h-8 text-emerald-500 animate-pulse" />
            Firm Diary & Court Calendar
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Centralized scheduling, court appointments, case jurisdictions, and milestones.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search diary events..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[#151619] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 w-64"
            />
          </div>
          <button 
            onClick={() => openAddModal()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-950/20"
          >
            <Plus className="w-4 h-4" />
            Schedule Event
          </button>
        </div>
      </header>

      {/* ----------------------------------------------------
          DIARY FILTER PANEL
         ---------------------------------------------------- */}
      <div className="bg-[#151619] border border-white/10 rounded-2xl p-5 mb-8 flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Jurisdiction</label>
          <select 
            value={filterCourt}
            onChange={e => setFilterCourt(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Jurisdictions</option>
            <option value="High Court">High Court</option>
            <option value="Supreme Court">Supreme Court</option>
            <option value="Magistrate">Magistrates' Court</option>
            <option value="Industrial">Industrial Relations Court</option>
            <option value="Appeal">Appeals</option>
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assigned Lawyer</label>
          <select 
            value={filterLawyer}
            onChange={e => setFilterLawyer(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Lawyers</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Judge</label>
          <select 
            value={filterJudge}
            onChange={e => setFilterJudge(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Judges</option>
            {distinctJudges.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Case / Matter</label>
          <select 
            value={filterCase}
            onChange={e => setFilterCase(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Cases</option>
            {cases.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Specific Date</label>
          <input 
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        {(filterCourt || filterLawyer || filterJudge || filterCase || filterDate) && (
          <div className="pt-5">
            <button 
              onClick={() => {
                setFilterCourt('');
                setFilterLawyer('');
                setFilterJudge('');
                setFilterCase('');
                setFilterDate('');
              }}
              className="text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 px-3 py-2 rounded-xl font-bold transition-all"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left 2 Columns: Elegant Full-Sized Interactive Multi-View Calendar */}
        <div className="lg:col-span-2 bg-[#151619] border border-white/10 rounded-2xl flex flex-col shadow-xl overflow-hidden">
          
          {/* Calendar Header Control Block */}
          <div className="p-6 border-b border-white/5 bg-[#1a1c20] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">
                {calendarView === 'month' && monthName}
                {calendarView === 'week' && `Week of ${getWeekRangeString()}`}
                {calendarView === 'day' && getDayString()}
                {calendarView === 'agenda' && "Full Practice Agenda"}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {calendarView === 'month' && "Click any day to manage agendas & appointments"}
                {calendarView === 'week' && "Weekly schedule of court hearings, milestones, and client reviews"}
                {calendarView === 'day' && "Hour-by-hour diary timeline of events"}
                {calendarView === 'agenda' && "Chronological list of all upcoming case schedules"}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              {/* Navigator */}
              {calendarView !== 'agenda' && (
                <div className="flex items-center gap-1.5">
                  <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-lg border border-white/5 text-slate-400 hover:text-white transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      setCurrentDate(new Date());
                      setSelectedCalendarDate(todayStr);
                    }} 
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] text-slate-300 font-bold border border-white/5 transition-all uppercase tracking-wider"
                  >
                    Today
                  </button>
                  <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-lg border border-white/5 text-slate-400 hover:text-white transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* View Tabs */}
              <div className="flex bg-[#0a0a0a] border border-white/10 rounded-xl p-1 gap-1">
                {(['day', 'week', 'month', 'agenda'] as const).map(view => (
                  <button
                    key={view}
                    onClick={() => setCalendarView(view)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize
                      ${calendarView === view 
                        ? 'bg-emerald-600 text-white shadow' 
                        : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Month View Component */}
          {calendarView === 'month' && (
            <>
              <div className="grid grid-cols-7 border-b border-white/5 bg-[#151619] text-center">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                  <div key={day} className="py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{day.substring(0, 3)}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 bg-white/[0.02] gap-[1px]">
                {days.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="bg-[#151619] min-h-[110px]" />;
                  
                  const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvents = filteredEvents.filter(e => e.date === dateStr);
                  const dayTasks = filteredTasks.filter(t => t.due_date === dateStr);
                  const dayAppointments = filteredAppointments.filter(a => a.date === dateStr);
                  const isToday = todayStr === dateStr;
                  const isSelected = selectedCalendarDate === dateStr;

                  const hasHearing = checkDayHasHearing(dateStr);
                  const hasAppointment = checkDayHasAppointment(dateStr);
                  const hasDeadline = checkDayHasDeadline(dateStr);

                  return (
                    <div 
                      key={day} 
                      onClick={() => setSelectedCalendarDate(dateStr)}
                      className={`bg-[#151619] p-2.5 min-h-[110px] cursor-pointer flex flex-col justify-between hover:bg-[#1c1d22] transition-colors relative group border-t border-r border-white/[0.01]
                        ${isSelected ? 'ring-2 ring-emerald-500/80 ring-inset bg-[#171a1e]' : ''}
                      `}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg
                          ${isToday ? 'bg-emerald-600 text-white shadow-lg font-extrabold' : isSelected ? 'text-emerald-400' : 'text-slate-400'}
                        `}>
                          {day}
                        </span>
                        
                        {/* Visual Dots for mobile/responsive scaling */}
                        <div className="flex gap-1">
                          {hasHearing && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="Hearing Scheduled" />}
                          {hasAppointment && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Meeting Scheduled" />}
                          {hasDeadline && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="Task Deadline" />}
                        </div>
                      </div>

                      {/* Preview list of items on day */}
                      <div className="mt-2 space-y-1 z-10 max-h-[60px] overflow-hidden">
                        {dayEvents.slice(0, 2).map(e => {
                          const colors = getJurisdictionColor(e.case_id, e.type);
                          return (
                            <div 
                              key={e.id}
                              className={`text-[9px] px-1.5 py-0.5 rounded truncate font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
                            >
                              {e.title}
                            </div>
                          );
                        })}
                        {dayAppointments.slice(0, 1).map(a => (
                          <div 
                            key={a.id}
                            className="text-[9px] px-1.5 py-0.5 rounded truncate font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          >
                            MEET: {a.client?.full_name || 'Client'}
                          </div>
                        ))}
                        {dayEvents.length + dayAppointments.length > 3 && (
                          <div className="text-[8px] text-slate-500 font-medium pl-1">
                            + {dayEvents.length + dayAppointments.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Week View Component */}
          {calendarView === 'week' && (
            <div className="grid grid-cols-1 md:grid-cols-7 bg-white/[0.01] gap-[1px] p-4">
              {getWeekDays().map((dayObj) => {
                const dateStr = `${dayObj.getFullYear()}-${String(dayObj.getMonth() + 1).padStart(2, '0')}-${String(dayObj.getDate()).padStart(2, '0')}`;
                const dayEvents = filteredEvents.filter(e => e.date === dateStr);
                const dayTasks = filteredTasks.filter(t => t.due_date === dateStr);
                const dayAppointments = filteredAppointments.filter(a => a.date === dateStr);
                const isToday = todayStr === dateStr;
                const isSelected = selectedCalendarDate === dateStr;

                return (
                  <div 
                    key={dateStr}
                    onClick={() => setSelectedCalendarDate(dateStr)}
                    className={`bg-[#151619] p-3 min-h-[220px] cursor-pointer flex flex-col justify-between hover:bg-[#1c1d22] transition-all border border-white/[0.05] rounded-xl
                      ${isSelected ? 'ring-2 ring-emerald-500/80 ring-inset bg-[#171a1e]' : ''}
                    `}
                  >
                    <div>
                      <div className="flex justify-between items-center pb-2 border-b border-white/5 mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {dayObj.toLocaleDateString('default', { weekday: 'short' })}
                        </span>
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                          ${isToday ? 'bg-emerald-600 text-white shadow' : isSelected ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
                        >
                          {dayObj.getDate()}
                        </span>
                      </div>
                      
                      <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                        {dayEvents.map(e => {
                          const colors = getJurisdictionColor(e.case_id, e.type);
                          return (
                            <div key={e.id} className={`text-[9px] px-1.5 py-1 rounded truncate border font-medium leading-snug ${colors.bg} ${colors.text} ${colors.border}`} title={e.title}>
                              <span className="font-bold text-[8px] mr-1 block sm:inline">{e.time ? e.time.substring(0, 5) : 'All Day'}</span>
                              {e.title}
                            </div>
                          );
                        })}
                        {dayAppointments.map(a => (
                          <div key={a.id} className="text-[9px] px-1.5 py-1 rounded truncate border font-medium bg-blue-500/10 text-blue-400 border-blue-500/20 leading-snug" title={a.reason}>
                            <span className="font-bold text-[8px] mr-1 block sm:inline">{a.time ? a.time.substring(0, 5) : 'Meet'}</span>
                            {a.client?.full_name || 'Client'}
                          </div>
                        ))}
                        {dayTasks.map(t => (
                          <div key={t.id} className="text-[9px] px-1.5 py-1 rounded truncate border font-medium bg-rose-500/10 text-rose-400 border-rose-500/20 leading-snug" title={t.name}>
                            <span className="font-bold text-[8px] mr-1">Task</span>
                            {t.name}
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-600 text-right">
                      {dayEvents.length + dayAppointments.length + dayTasks.length} items
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Day View Component */}
          {calendarView === 'day' && (
            <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
              <div className="bg-[#0a0a0a] p-4 rounded-xl border border-white/5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tasks Due Today</h4>
                {filteredTasks.filter(t => t.due_date === selectedCalendarDate).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No task deadlines today.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredTasks.filter(t => t.due_date === selectedCalendarDate).map(t => (
                      <div key={t.id} className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-xs flex justify-between items-center text-rose-400">
                        <span className="font-medium truncate">{t.name}</span>
                        <span className="text-[9px] font-extrabold uppercase bg-rose-500/20 px-1.5 py-0.5 rounded">{t.priority} Priority</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {hoursOfDay.map(hour => {
                  const hourPrefix = hour.substring(0, 3);
                  const hourEvents = filteredEvents.filter(e => e.date === selectedCalendarDate && (e.time || '').startsWith(hourPrefix));
                  const hourAppointments = filteredAppointments.filter(a => a.date === selectedCalendarDate && (a.time || '').startsWith(hourPrefix));

                  return (
                    <div key={hour} className="flex gap-4 group">
                      <span className="text-xs font-bold font-mono text-slate-500 w-12 py-1 select-none">{hour}</span>
                      <div className="flex-1 border-l border-white/10 group-hover:border-emerald-500/30 pl-4 py-1 space-y-2">
                        {hourEvents.length === 0 && hourAppointments.length === 0 ? (
                          <div className="text-slate-600 text-xs py-1 select-none font-light italic">Clear Slot</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {hourEvents.map(e => {
                              const colors = getJurisdictionColor(e.case_id, e.type);
                              return (
                                <div 
                                  key={e.id} 
                                  onClick={() => openEditModal(e)}
                                  className={`p-3 rounded-xl border cursor-pointer hover:border-white/20 transition-all ${colors.bg} ${colors.text} ${colors.border}`}
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">{colors.label}</span>
                                    <span className="text-[10px] font-mono">{e.time}</span>
                                  </div>
                                  <h5 className="text-xs font-bold text-white mt-1.5">{e.title}</h5>
                                  {e.description && <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{e.description}</p>}
                                </div>
                              );
                            })}
                            {hourAppointments.map(a => (
                              <div 
                                key={a.id} 
                                className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Client Meet</span>
                                  <span className="text-[10px] font-mono">{a.time}</span>
                                </div>
                                <h5 className="text-xs font-bold text-white mt-1.5">{a.reason || 'Legal Consultation'}</h5>
                                <p className="text-[10px] text-slate-400 mt-0.5">Client: {a.client?.full_name}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agenda View Component */}
          {calendarView === 'agenda' && (
            <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
              {getFullAgendaItems().length === 0 ? (
                <div className="text-center py-16">
                  <Sparkles className="w-12 h-12 text-slate-700 mb-2 mx-auto animate-pulse" />
                  <p className="text-slate-400 font-semibold text-sm">No agenda items matching filters</p>
                </div>
              ) : (
                (() => {
                  const items = getFullAgendaItems();
                  const groups: { [key: string]: any[] } = {};
                  items.forEach(item => {
                    if (!groups[item.date]) groups[item.date] = [];
                    groups[item.date].push(item);
                  });

                  return Object.keys(groups).sort().map(dateStr => {
                    let prettyDate = dateStr;
                    try {
                      const parts = dateStr.split('-');
                      prettyDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                    } catch(e) {}

                    return (
                      <div key={dateStr} className="space-y-3">
                        <div className="sticky top-0 bg-[#151619] z-10 py-1.5 border-b border-white/10">
                          <h4 className="text-xs font-bold text-emerald-400 tracking-wider uppercase">{prettyDate}</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {groups[dateStr].map(item => {
                            let colors = { bg: 'bg-white/5', text: 'text-white', border: 'border-white/10', label: item.eventType };
                            if (item.type === 'event') {
                              colors = getJurisdictionColor(item.case_id, item.eventType);
                            } else if (item.type === 'appointment') {
                              colors = { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', label: 'Client Meet' };
                            } else if (item.type === 'task') {
                              colors = { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', label: 'Task Deadline' };
                            }

                            return (
                              <div 
                                key={item.id}
                                onClick={() => item.type === 'event' && openEditModal(item.raw)}
                                className={`p-4 rounded-xl border flex flex-col justify-between transition-all text-left
                                  ${item.type === 'event' ? 'cursor-pointer hover:border-white/20' : ''}
                                  ${colors.bg} ${colors.border}
                                `}
                              >
                                <div>
                                  <div className="flex items-center justify-between">
                                    <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${colors.text}`}>
                                      {colors.label}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> {item.time ? item.time.substring(0, 5) : 'All Day'}
                                    </span>
                                  </div>
                                  <h5 className="text-sm font-bold text-white mt-2 leading-snug">{item.title}</h5>
                                  {item.description && <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{item.description}</p>}
                                </div>
                                {item.case_title && (
                                  <div className="text-[10px] text-slate-500 mt-2.5 italic font-medium pt-2 border-t border-white/[0.03]">
                                    Matter: <span className="text-slate-400">{item.case_title}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          )}

          {/* Color Indicators Legend (Includes Specific Jurisdictions) */}
          <div className="p-4 bg-[#1a1c20] border-t border-white/5 flex flex-wrap gap-5 text-xs text-slate-400 font-semibold justify-center">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span>High Court (Blue)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500" />
              <span>Supreme Court (Purple)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span>Magistrates' Court (Green)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500" />
              <span>Industrial Relations (Orange)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span>Appeals (Red)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-400" />
              <span>Tasks & Deadlines</span>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Selected-Day Detailed Agenda Panel */}
        <div className="bg-[#151619] border border-white/10 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Selected Day Agenda</span>
              <span className="text-lg text-white font-bold block mt-0.5">
                {(() => {
                  if (!selectedCalendarDate) return 'Select a date';
                  try {
                    const parts = selectedCalendarDate.split('-');
                    if (parts.length !== 3) return selectedCalendarDate;
                    const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    return dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                  } catch (e) {
                    return selectedCalendarDate;
                  }
                })()}
              </span>
            </div>
            <button 
              onClick={() => openAddModal(selectedCalendarDate)}
              title="Schedule event for selected date"
              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 rounded-xl transition-all"
            >
              <CalendarPlus className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
            {selectedDateEvents.length === 0 && selectedDateAppointments.length === 0 && selectedDateTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="w-12 h-12 text-slate-700 mb-3 animate-pulse" />
                <p className="text-slate-400 text-sm font-semibold">Agenda is Clear</p>
                <p className="text-slate-500 text-xs mt-1 max-w-[200px]">No hearings, appointments, or deadlines scheduled for this day.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Court Hearings / Events */}
                {selectedDateEvents.map((e) => {
                  const colors = getJurisdictionColor(e.case_id, e.type);
                  return (
                    <div key={e.id} className="bg-[#121212] border border-white/5 p-4 rounded-xl flex flex-col gap-2 hover:border-white/10 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {colors.label}
                        </span>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => openEditModal(e)} 
                            className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(e.id)} 
                            className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h4 className="text-sm font-semibold text-white tracking-wide">{e.title}</h4>
                      {e.description && (
                        <p className="text-xs text-slate-400 leading-relaxed bg-black/25 p-2 rounded border border-white/[0.02]">{e.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1 font-mono">
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> {e.time ? e.time.substring(0, 5) : 'All Day'}</span>
                        {e.case_title && <span className="text-emerald-400 truncate max-w-[150px]">Matter: {e.case_title}</span>}
                      </div>
                    </div>
                  );
                })}

                {/* Client Appointments */}
                {selectedDateAppointments.map((a) => (
                  <div key={a.id} className="bg-[#121212] border border-white/5 p-4 rounded-xl flex flex-col gap-2 hover:border-white/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase tracking-wider">
                        Client Consultation
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${a.status === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {a.status}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-white tracking-wide">{a.reason || 'Legal Consultation'}</h4>
                    <p className="text-xs text-slate-400">
                      Client: <span className="text-white font-medium">{a.client?.full_name || 'Client Folder'}</span>
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-400" /> {a.time ? a.time.substring(0, 5) : 'Scheduled'}
                    </div>
                  </div>
                ))}

                {/* Task Deadlines */}
                {selectedDateTasks.map((t) => (
                  <div key={t.id} className="bg-[#121212] border border-white/5 p-4 rounded-xl flex flex-col gap-2 hover:border-white/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold uppercase tracking-wider">
                        Task Deadline
                      </span>
                      <span className={`text-[10px] font-bold ${t.priority === 'High' ? 'text-red-400' : 'text-slate-400'}`}>
                        {t.priority} Priority
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-white tracking-wide">{t.name}</h4>
                    <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                      <span>Status: <span className="text-slate-300 font-medium">{t.status}</span></span>
                      {t.case_title && <span className="text-slate-400 italic">Matter: {t.case_title}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">{isEditing ? 'Edit Scheduled Event' : 'Schedule New Event'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Event Title</label>
                <input required type="text" value={currentEvent.title} onChange={e => setCurrentEvent({...currentEvent, title: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-emerald-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Matter (Optional)</label>
                {currentEvent.case_id ? (
                  <div className="flex items-center justify-between bg-[#0a0a0a] border border-emerald-500/30 rounded-xl py-2.5 px-3">
                    <span className="text-emerald-400 text-sm truncate">{currentEvent.case_title}</span>
                    <button type="button" onClick={() => setCurrentEvent({...currentEvent, case_id: '', case_title: ''})} className="text-slate-500 hover:text-red-400">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setIsSelectingCase(true)} className="w-full flex justify-center items-center gap-2 bg-[#0a0a0a] border border-dashed border-white/20 hover:border-emerald-500/50 rounded-xl py-2.5 px-3 text-sm text-slate-400 hover:text-emerald-400 transition-colors">
                    <LinkIcon className="w-4 h-4" /> Link Matter
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date</label>
                  <input required type="date" value={currentEvent.date} onChange={e => setCurrentEvent({...currentEvent, date: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Time</label>
                  <input required type="time" value={currentEvent.time} onChange={e => setCurrentEvent({...currentEvent, time: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Type</label>
                <select value={currentEvent.type} onChange={e => setCurrentEvent({...currentEvent, type: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-emerald-500">
                  <option value="Court Date">Court Date / Hearing</option>
                  <option value="Client Meeting">Client Meeting</option>
                  <option value="Internal Review">Internal Review</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes & Details</label>
                <textarea value={currentEvent.description} onChange={e => setCurrentEvent({...currentEvent, description: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-emerald-500 resize-none" rows={2}></textarea>
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
                <div>
                  {isEditing && (
                    <button type="button" onClick={() => handleDelete(currentEvent.id)} className="text-sm text-red-500 hover:text-red-400 transition-colors">Delete Event</button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm font-medium">Cancel</button>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-md">{isEditing ? 'Update' : 'Schedule'}</button>
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
    </div>
  );
}
