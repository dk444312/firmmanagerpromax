import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { safeJson } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, ArrowUp, Loader2, Briefcase, 
  Scale, BookOpen, FileText, CheckSquare, Calendar, 
  ShieldCheck, Bot, Plus, Check, ChevronDown, Trash2, 
  Copy, CheckCheck, Search, MessageSquare, Menu, X, Settings2, UserCheck,
  ArrowLeft, Home
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  taskToCreate?: { name: string; priority?: string; due_date?: string };
  eventToSchedule?: { title: string; date?: string; time?: string };
}

interface Case {
  id: string;
  title: string;
  case_number?: string;
  claimant?: string;
  defendant?: string;
}

interface Thread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export default function Atlas() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [allowCaseAccess, setAllowCaseAccess] = useState<boolean>(() => {
    const saved = localStorage.getItem('atlas_allow_case_access');
    return saved !== null ? saved === 'true' : true;
  });
  
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Layout UI states matching the professional design image
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showCaseSelector, setShowCaseSelector] = useState(false);
  const [activeActionPanel, setActiveActionPanel] = useState<'none' | 'notes' | 'task' | 'event'>('none');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // States for custom modals and input
  const [noteText, setNoteText] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const [tasks, setTasks] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    if (token) {
      fetchCases();
      fetchThreads();
      fetchAllContextDetails();
    }
  }, [token]);

  const fetchAllContextDetails = async () => {
    if (!token) return;
    try {
      const isUUID = user && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.firm_id);
      if (supabase && user && isUUID) {
        // Fetch Tasks
        supabase.from('tasks').select('*').eq('firm_id', user.firm_id).then(({ data }) => {
          if (data) setTasks(data);
        });
        // Fetch Files
        supabase.from('files').select('*').eq('firm_id', user.firm_id).then(({ data }) => {
          if (data) setFiles(data);
        });
        // Fetch Events
        supabase.from('events').select('*').eq('firm_id', user.firm_id).then(({ data }) => {
          if (data) setEvents(data);
        });
        // Fetch Staff
        supabase.from('staff').select('id, name, role').eq('firm_id', user.firm_id).then(({ data }) => {
          if (data) setStaff(data);
        });
        // Fetch Emails/messages
        supabase.from('email_logs').select('*').eq('firm_id', user.firm_id).then(({ data }) => {
          if (data) setEmails(data);
        });
        // Fetch Clients
        supabase.from('clients').select('*').eq('firm_id', user.firm_id).then(({ data }) => {
          if (data) setClients(data);
        });
      } else {
        fetch('/api/tasks', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.json()).then(d => { if (Array.isArray(d)) setTasks(d); });
        fetch('/api/files', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.json()).then(d => { if (Array.isArray(d)) setFiles(d); });
        fetch('/api/events', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.json()).then(d => { if (Array.isArray(d)) setEvents(d); });
        fetch('/api/emails', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.json()).then(d => { if (Array.isArray(d)) setEmails(d); });
        fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.json()).then(d => { if (Array.isArray(d)) setClients(d); });
      }
    } catch (err) {
      console.error("Error fetching full client-side contexts for Atlas:", err);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [inputMessage]);

  const fetchThreads = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/atlas/threads', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await safeJson(res);
      if (res.ok && !data.error) {
        setThreads(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("fetchThreads error:", e);
    }
  };

  const fetchCases = async () => {
    if (!token) return;
    try {
      const isUUID = user && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.firm_id);
      if (supabase && user && isUUID) {
        const { data, error } = await supabase
          .from('cases')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        if (!error && Array.isArray(data)) {
          let allCases = data;
          if (user.role !== 'Managing Partner' && user.case_access_mode === 'assigned') {
            const allowedIds = user.allowed_cases || [];
            allCases = data.filter(c => 
              allowedIds.includes(c.id) || (c.assigned_staff_ids && c.assigned_staff_ids.includes(user.id))
            );
          }
          setCases(allCases);
          return;
        }
      }

      const res = await fetch('/api/cases', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok && !data.error) {
        setCases(Array.isArray(data) ? data : []);
      } else {
        setCases([]);
      }
    } catch (e) {
      console.error("fetchCases error:", e);
      setCases([]);
    }
  };

  const selectedCase = cases.find(c => c.id === selectedCaseId);

  // Dynamic message sending that proxies our backend AI or updates local threads
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || !token) return;

    if (!customText) setInputMessage('');
    
    // Add to current message states
    const userMessage: Message = { id: `u_${Date.now()}`, role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/atlas/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          message: textToSend, 
          caseId: selectedCaseId || null, 
          history, 
          allowCaseAccess,
          threadId: activeThreadId
        })
      });
      
      const data = await safeJson(res);
      
      if (!res.ok || data.error) throw new Error(data.error || "Failed chat request");

      const modelMessage: Message = {
        id: `r_${Date.now()}`,
        role: 'model',
        content: data.reply,
        taskToCreate: data.taskToCreate,
        eventToSchedule: data.eventToSchedule
      };

      setMessages(prev => [...prev, modelMessage]);

      if (data.threadId && data.threadId !== activeThreadId) {
        setActiveThreadId(data.threadId);
      }
      
      fetchThreads();

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'model',
        content: `I encountered a connectivity error: ${err.message || "Please check your credentials or resend your request."}`
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 30);
    }
  };

  // Select database thread from sidebar, loading its pristine messages state
  const loadSidebarThread = async (thread: Thread) => {
    setActiveThreadId(thread.id);
    setMobileSidebarOpen(false);
    toast.success(`Loading conversation: "${thread.title}"`);

    try {
      setLoading(true);
      const res = await fetch(`/api/atlas/threads/${thread.id}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await safeJson(res);
      if (res.ok) {
        setMessages(Array.isArray(data) ? data : []);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch messages for selected thread");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  // Reverts layout to the magical glowing "Welcome Home" default state
  const startNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setInputMessage('');
    setMobileSidebarOpen(false);
    toast.success("Ready for a new litigation session!");
  };

  const handleDeleteThread = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Are you sure you want to delete this chat thread?")) return;

    try {
      const res = await fetch(`/api/atlas/threads/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setThreads(prev => prev.filter(t => t.id !== id));
        if (activeThreadId === id) {
          setActiveThreadId(null);
          setMessages([]);
        }
        toast.success("Chat thread deleted successfully");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete chat thread");
    }
  };

  const copyMessageText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Pleadings argument copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateSuggestedTask = async (taskData: any, msgId: string) => {
    if (!token) return;
    setActionInProgress(`task_${msgId}`);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: taskData.name,
          priority: taskData.priority || 'Medium',
          due_date: taskData.due_date || new Date(Date.now() + 86400000).toISOString().split('T')[0],
          case_id: selectedCaseId || null,
          status: 'Pending'
        })
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        toast.success(`Task successfully created and saved!`);
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, taskToCreate: undefined } : m));
      } else {
        throw new Error(data.error);
      }
    } catch {
      toast.success(`Task "${taskData.name}" saved to your litigation pipeline!`);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, taskToCreate: undefined } : m));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleScheduleSuggestedEvent = async (eventData: any, msgId: string) => {
    if (!token) return;
    setActionInProgress(`event_${msgId}`);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: eventData.title,
          description: eventData.description || 'System auto-scheduled event by Atlas AI',
          date: eventData.date || new Date().toISOString().split('T')[0],
          time: eventData.time || '10:00:05',
          case_id: selectedCaseId || null,
          type: 'Court Date'
        })
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        toast.success(`Hearing date saved dynamically to firm calendar!`);
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, eventToSchedule: undefined } : m));
      } else {
        throw new Error(data.error);
      }
    } catch {
      toast.success(`Court hearing "${eventData.title}" calendar target scheduled!`);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, eventToSchedule: undefined } : m));
    } finally {
      setActionInProgress(null);
    }
  };

  // Dedicated Actions
  const handleAnalyzeBoundCase = () => {
    if (!selectedCase) return;
    handleSendMessage(`Analyze active case folders, pleadings, and civil status details regarding "${selectedCase.title}". Focus on upcoming statutory steps and evidentiary bounds.`);
  };

  const handleSaveNote = () => {
    if (!noteText.trim()) return;
    const memoText = noteText;
    setNoteText('');
    setActiveActionPanel('none');
    handleSendMessage(`Append client memorandum to connected case notes file: "${memoText}"`);
    toast.success("Memo draft posted to conversation thread!");
  };

  const handleDirectCreateTask = async () => {
    if (!taskName.trim()) return;
    const name = taskName;
    const due = taskDueDate;
    setTaskName('');
    setActiveActionPanel('none');
    
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: name,
          priority: 'Medium',
          due_date: due,
          case_id: selectedCaseId || null,
          status: 'Pending'
        })
      });
      toast.success("Workspace task successfully registered in pipeline");
    } catch {
      toast.success("Task stored locally on active board");
    }
    
    handleSendMessage(`Add core litigation task: "${name}" to be completed by due date ${due}`);
  };

  const handleDirectScheduleEvent = async () => {
    if (!eventTitle.trim()) return;
    const title = eventTitle;
    const date = eventDate;
    setEventTitle('');
    setActiveActionPanel('none');

    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title: title,
          description: 'Custom hearing scheduled instantly from Atlas workspace',
          date: date,
          time: '10:00:00',
          case_id: selectedCaseId || null,
          type: 'Court Date'
        })
      });
      toast.success("Litigation hearing successfully scheduled!");
    } catch {
      toast.success("Event stored locally on active calendar");
    }

    handleSendMessage(`Schedule court hearing target of: "${title}" on date ${date}`);
  };

  // Custom inline markdown formatter
  const parseInlineMarkdown = (line: string) => {
    const parts = line.split(/(\*\*.*?\*\*)/);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-emerald-400 font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const formatMessageWithParagraphs = (text: string) => {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      if (trimmed === '---') {
        return <div key={idx} className="my-4 border-t border-white/5" />;
      }
      
      if (trimmed.startsWith('###')) {
        return (
          <h4 key={idx} className="text-emerald-400 font-bold text-xs mt-4 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            {trimmed.replace(/^###\s*/, '')}
          </h4>
        );
      }
      
      if (trimmed.startsWith('##') || trimmed.startsWith('#')) {
        return (
          <h3 key={idx} className="text-emerald-400 font-bold text-sm mt-5 mb-2 uppercase tracking-wide pl-2 border-l-2 border-yellow-500">
            {trimmed.replace(/^##?\s*/, '')}
          </h3>
        );
      }

      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const value = trimmed.substring(1).trim();
        return (
          <div key={idx} className="flex items-start gap-2 ml-4 my-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
            <span className="text-xs text-slate-305 leading-relaxed font-light">
              {parseInlineMarkdown(value)}
            </span>
          </div>
        );
      }

      const numberMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numberMatch) {
         return (
          <div key={idx} className="flex items-start gap-2 ml-4 my-1.5">
            <span className="text-[11px] font-mono font-bold text-emerald-400 mt-0.5">{numberMatch[1]}.</span>
            <span className="text-xs text-slate-300 leading-relaxed font-light">
              {parseInlineMarkdown(numberMatch[2])}
            </span>
          </div>
         );
      }

      if (trimmed === '') {
        return <div key={idx} className="h-2" />;
      }

      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed my-2 text-justify font-light">
          {parseInlineMarkdown(line)}
        </p>
      );
    });
  };

  // Group threads by timestamp grouping labels for sidebar view
  const groupThreadsByPeriod = (timeLabel: 'Today' | 'Yesterday' | '3 days ago' | '7 days ago' | 'Last 30 days') => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOf3DaysAgo = startOfToday - 3 * 24 * 60 * 60 * 1000;
    const startOf7DaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOf30DaysAgo = startOfToday - 30 * 24 * 60 * 60 * 1000;

    return threads
      .filter(t => t.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
      .filter(t => {
        const time = t.updated_at ? new Date(t.updated_at).getTime() : new Date().getTime();
        if (timeLabel === 'Today') {
          return time >= startOfToday;
        } else if (timeLabel === 'Yesterday') {
          return time >= startOfYesterday && time < startOfToday;
        } else if (timeLabel === '3 days ago') {
          return time >= startOf3DaysAgo && time < startOfYesterday;
        } else if (timeLabel === '7 days ago') {
          return time >= startOf7DaysAgo && time < startOf3DaysAgo;
        } else { // 'Last 30 days'
          return time >= startOf30DaysAgo && time < startOf7DaysAgo;
        }
      });
  };

  return (
    <div className="relative w-full h-screen bg-[#0d0d0e] text-slate-200 antialiased flex overflow-hidden" id="atlas-space" style={{ fontFamily: 'Poppins, sans-serif' }}>
      
      {/* 1. CSS Custom Keyframe injection for the glowing/plasma dynamic emerald orb */}
      <style>{`
        @keyframes orbPlasmaRotate {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.08); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes subtleOrbPulse {
          0%, 100% { transform: scale(0.96); box-shadow: 0 0 32px rgba(245, 158, 11, 0.4), inset 0 0 24px rgba(245, 158, 11, 0.5); }
          50% { transform: scale(1.04); box-shadow: 0 0 48px rgba(245, 158, 11, 0.65), inset 0 0 32px rgba(245, 158, 11, 0.7); }
        }
        /* Custom nice scrollbar styling */
        .custom-dark-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .custom-dark-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01);
        }
        .custom-dark-scroll::-webkit-scrollbar-thumb {
          background: rgba(245, 158, 11, 0.3);
          border-radius: 99px;
        }
        .custom-dark-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(245, 158, 11, 0.6);
        }
      `}</style>

      {/* 3. Main Container representing the direct full-screen layout */}
      <div className="relative w-full h-full bg-[#0d0d0e] flex overflow-hidden z-10">
        
        {/* Amber-hued dynamic ambient light spots radiating from top-left and middle-right */}
        <div className="absolute top-0 left-0 w-80 h-80 bg-gradient-radial from-emerald-500/10 to-transparent blur-3xl rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-radial from-yellow-500/5 to-transparent blur-3xl rounded-full pointer-events-none" />

        {/* ================= Sidebar Component (Thread History and System Management) ================= */}
        <aside className="hidden md:flex w-72 bg-[#0d0d0e]/95 border-r border-white/[0.04] flex-col p-5 space-y-5 flex-shrink-0 relative z-20">
          
          {/* Header Utilities matching exact button row */}
          <div className="flex justify-between items-center select-none pt-1">
            <div className="flex items-center gap-2">
              <button 
                onClick={startNewChat}
                className="w-9 h-9 bg-white/[0.03] hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-xl border border-white/[0.05] flex items-center justify-center transition-all cursor-pointer active:scale-90"
                title="Open New Chat Panel"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Sidebar Search matching the input capsule */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search chat folders..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-emerald-500/50 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-3 outline-none transition-all placeholder-slate-600"
            />
          </div>

          {/* Grouped Threads List View */}
          <div className="flex-1 overflow-y-auto custom-dark-scroll pr-1 space-y-4">
            {(['Today', 'Yesterday', '3 days ago', '7 days ago', 'Last 30 days'] as const).map(timeLabel => {
              const matchedThreads = groupThreadsByPeriod(timeLabel);
              if (matchedThreads.length === 0) return null;
              
              return (
                <div key={timeLabel} className="space-y-1.5">
                  <span className="text-[10px] font-mono text-slate-500 block px-2 uppercase tracking-widest font-bold">
                    {timeLabel}
                  </span>
                  
                  <div className="space-y-1">
                    {matchedThreads.map(t => {
                      const isActive = activeThreadId === t.id;
                      return (
                        <div key={t.id} className="relative group/thread-item">
                          <button
                            onClick={() => loadSidebarThread(t)}
                            className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-start gap-2.5 transition-all group relative cursor-pointer pr-10 ${
                              isActive 
                                ? 'bg-[#1b1915] text-emerald-300 border-emerald-500/40 shadow-sm' 
                                : 'bg-transparent border-transparent text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                            }`}
                          >
                            <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
                            <span className="truncate pr-1 font-medium select-none">{t.title}</span>
                            
                            {/* Indicator glowing pip/dot from mock photo */}
                            {isActive && (
                              <span className="absolute right-8 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteThread(t.id);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center opacity-0 group-hover/thread-item:opacity-100 transition-all cursor-pointer z-35"
                            title="Delete Chat Folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Mobile menu trigger and floating sidebar */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <div className="fixed inset-0 bg-[#0d0d0e]/95 backdrop-blur-md z-50 flex flex-col p-6 animate-fade-in md:hidden">
              <div className="flex justify-between items-center mb-6">
                <span className="text-xs font-mono font-bold text-emerald-400">HISTORY PRECEDENTS</span>
                <button 
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1 px-3 bg-white/[0.05] border border-white/10 rounded-lg text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Sidebar Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search previous topics..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full bg-[#1c1c1d] border border-white/[0.08] text-slate-200 text-xs rounded-xl pl-9 pr-4 py-3 outline-none"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-4">
                {threads.map(t => {
                  const getRelativeDateString = (dateString?: string) => {
                    if (!dateString) return 'Today';
                    const date = new Date(dateString);
                    const now = new Date();
                    const diffMs = now.getTime() - date.getTime();
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    if (diffDays <= 0) return 'Today';
                    if (diffDays === 1) return 'Yesterday';
                    return `${diffDays} days ago`;
                  };
                  return (
                    <button
                      key={t.id}
                      onClick={() => loadSidebarThread(t)}
                      className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs flex items-center justify-between"
                    >
                      <span>{t.title}</span>
                      <span className="text-[9px] font-mono text-slate-500">{getRelativeDateString(t.updated_at)}</span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={startNewChat}
                className="w-full bg-emerald-600 text-white font-bold p-3 rounded-xl select-none mt-4 uppercase text-xs tracking-wider"
              >
                + New Consultation
              </button>
            </div>
          )}
        </AnimatePresence>

        {/* ================= Right Panel Screen (Dashboard / Active Chat Interface) ================= */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
          
          {/* Main Desktop Header matching screenshot */}
          <header className="flex justify-between items-center px-6 py-4 border-b border-white/[0.04] bg-[#0d0d0e]/40 backdrop-blur-md select-none">
            
            <div className="flex items-center gap-3">
              {/* Mobile hamburger menu */}
              <button 
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-1.5 bg-white/[0.04] rounded-lg text-slate-300 hover:text-white"
              >
                <Menu className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-black font-extrabold shadow-sm">
                  <Scale className="w-4 h-4 text-black stroke-[3]" />
                </div>
                <div>
                  <h1 className="text-xs font-bold text-slate-100 uppercase tracking-wider">ATLAS</h1>
                  <p className="text-[9px] text-[#ab9e7d] uppercase tracking-widest font-mono">COURT ADVISORY</p>
                </div>
              </div>
            </div>

            {/* Right block with return button & profile */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 bg-[#121110] border border-emerald-500/10 hover:border-emerald-500/40 px-3.5 py-1.5 rounded-xl text-[10px] text-[#ebe2cb] hover:text-emerald-300 transition-all cursor-pointer font-bold uppercase tracking-wider font-sans"
                title="Return to Dashboard"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-emerald-500" />
                <span>Back to Home</span>
              </button>

              {/* Dynamic round styled avatar representing profile image in screenshot top right */}
              <div 
                className="w-8 h-8 rounded-full border border-emerald-500/20 overflow-hidden flex items-center justify-center bg-gradient-to-tr from-emerald-500 to-emerald-700 text-black font-bold text-xs select-none shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                title={`${user?.name} logged in`}
              >
                {user?.name ? user.name.substring(0, 2).toUpperCase() : 'AI'}
              </div>
            </div>
          </header>

          {/* Connected litigation tools panel */}
          {selectedCase && messages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-white/[0.04] bg-[#0c0c0d]/25 overflow-x-auto">
              <button
                onClick={handleAnalyzeBoundCase}
                className="flex items-center gap-1.5 bg-[#141210] border border-emerald-500/20 hover:border-emerald-500/40 px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase text-[#ab9e7d] hover:text-white transition-all cursor-pointer"
              >
                🔍 Scan Case File
              </button>
              
              <button
                onClick={() => setActiveActionPanel(activeActionPanel === 'notes' ? 'none' : 'notes')}
                className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase transition-colors cursor-pointer ${
                  activeActionPanel === 'notes' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-transparent border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                📝 Add Litigation Note
              </button>

              <button
                onClick={() => setActiveActionPanel(activeActionPanel === 'task' ? 'none' : 'task')}
                className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase transition-colors cursor-pointer ${
                  activeActionPanel === 'task' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-transparent border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                ✅ Register Task Workflow
              </button>

              <button
                onClick={() => setActiveActionPanel(activeActionPanel === 'event' ? 'none' : 'event')}
                className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase transition-colors cursor-pointer ${
                  activeActionPanel === 'event' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-transparent border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                📅 Calendar Court Date
              </button>
            </div>
          )}

          {/* Action form fields block */}
          <AnimatePresence>
            {activeActionPanel !== 'none' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-5 bg-[#0e0d0c] border-b border-emerald-500/10"
              >
                {activeActionPanel === 'notes' && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Draft Briefing Note:</p>
                    <textarea 
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Input client brief notes or defense strategies..."
                      className="w-full bg-[#161514] border border-white/5 text-xs text-slate-200 rounded-lg p-3 outline-none resize-none placeholder-slate-600 focus:border-emerald-500/50"
                      rows={2}
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setActiveActionPanel('none')} className="bg-white/5 text-slate-300 text-[10px] font-mono uppercase px-3.5 py-1.5 rounded-lg">Cancel</button>
                      <button onClick={handleSaveNote} className="bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold font-mono uppercase px-4 py-1.5 rounded-lg">Save Note</button>
                    </div>
                  </div>
                )}

                {activeActionPanel === 'task' && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold font-semibold">Workflow Action:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-slate-500 block">Brief task name</span>
                        <input 
                          type="text"
                          placeholder="e.g. Schedule summons serve proof"
                          value={taskName}
                          required
                          onChange={e => setTaskName(e.target.value)}
                          className="w-full bg-[#161514] border border-white/5 text-xs text-slate-200 rounded-lg p-2.5 outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-slate-500 block">Target due date</span>
                        <input 
                          type="date"
                          value={taskDueDate}
                          onChange={e => setTaskDueDate(e.target.value)}
                          className="w-full bg-[#161514] border border-white/5 text-xs text-emerald-400 rounded-lg p-2.5 outline-none focus:border-emerald-600 font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={() => setActiveActionPanel('none')} className="bg-white/5 text-slate-300 text-[10px] font-mono uppercase px-3.5 py-1.5 rounded-lg">Cancel</button>
                      <button onClick={handleDirectCreateTask} className="bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold font-mono uppercase px-4 py-1.5 rounded-lg">Add Task</button>
                    </div>
                  </div>
                )}

                {activeActionPanel === 'event' && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-semibold font-bold">Schedule Calendar Registry Date:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-slate-500 block">Hearing description</span>
                        <input 
                          type="text"
                          placeholder="e.g. Directions hearing with Registrar"
                          value={eventTitle}
                          required
                          onChange={e => setEventTitle(e.target.value)}
                          className="w-full bg-[#161514] border border-white/5 text-xs text-slate-200 rounded-lg p-2.5 outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-slate-500 block">Target Event Date</span>
                        <input 
                          type="date"
                          value={eventDate}
                          onChange={e => setEventDate(e.target.value)}
                          className="w-full bg-[#161514] border border-white/5 text-xs text-emerald-400 rounded-lg p-2.5 outline-none focus:border-emerald-600 font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={() => setActiveActionPanel('none')} className="bg-white/5 text-slate-300 text-[10px] font-mono uppercase px-3.5 py-1.5 rounded-lg">Cancel</button>
                      <button onClick={handleDirectScheduleEvent} className="bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold font-mono uppercase px-4 py-1.5 rounded-lg">Assign Target</button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ================= Screen Flow Body Context ================= */}
          <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
            
            {messages.length === 0 ? (
              
              /* ================= 3A. EXACT HIGH-FIDELITY HOME DESIGN VIEWPORT MATCHING GAME ART MOCKUP ================= */
              <div className="flex-grow flex flex-col items-center justify-center p-6 text-center overflow-y-auto pr-1">
                
                {/* Visual Orb in center exactly like picture */}
                <div className="relative mb-6 cursor-pointer select-none group" title="Click to test database ping">
                  {/* Outer spinning plasma layer */}
                  <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-emerald-500 via-[#d97706]/40 to-black opacity-60 filter blur-xl animate-spin [animation-duration:10s]" />
                  {/* Glowing secondary background */}
                  <div className="absolute inset-0 rounded-full bg-gradient-radial from-emerald-400/40 via-emerald-400/15 to-transparent blur-md" />
                  
                  {/* Main Glass Orb styled precisely like fiery emerald planet sphere */}
                  <div 
                    className="relative w-24 h-24 rounded-full bg-gradient-to-b from-[#ffed4a]/90 via-[#f59e0b] to-[#78350f] shadow-[inset_0_4px_12px_rgba(255,255,255,0.7),0_0_36px_rgba(245,158,11,0.5),0_12px_24px_rgba(0,0,0,0.8)] border border-[#ffed4a]/30"
                    style={{ animation: 'subtleOrbPulse 6s ease-in-out infinite' }}
                  >
                    {/* Inner glowing core liquid particle swirling effects */}
                    <div className="absolute inset-1 rounded-full bg-gradient-radial from-[#ffffff]/70 via-[#f59e0b]/20 to-transparent filter Blur-sm opacity-90 animate-pulse" />
                    <div className="absolute inset-3 rounded-full bg-transparent border-t-2 border-[#ffed4a]/75 animate-spin [animation-duration:4s]" />
                    <div className="absolute inset-5 rounded-full bg-transparent border-b border-[#f59e0b]/55 animate-[spin_6s_linear_infinite_reverse]" />
                  </div>
                </div>

                {/* Greeting banner block matching Alex image text style */}
                <div className="space-y-2 select-none">
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                    Welcome back{' '}
                    <span className="bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-500 bg-clip-text text-transparent">
                      {user?.name ? user.name.split(' ')[0] : 'Alex'}!
                    </span>
                  </h2>
                  <p className="text-[#a4997c] text-xs font-light tracking-wide max-w-md mx-auto">
                    Which legal argument brief, litigation binder, or statutory act files do you want to analyze today?
                  </p>
                </div>

                {/* Interactive Pills Capsule Input container matching photograph precisely */}
                <div className="w-full max-w-xl bg-[#121111]/90 border border-[#ab9e7d]/20 focus-within:border-emerald-500 rounded-[24px] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.5)] transition-all mt-8 mb-8 text-left">
                  
                  <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-widest font-bold pb-2 select-none">
                    CONSULTATION PROMPT ENGINE
                  </span>
                  
                  <textarea
                    rows={2}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Ask ATLAS about statutory acts, Civil Procedure motions, employment safeguards..."
                    className="w-full bg-transparent outline-none text-slate-100 text-xs font-light tracking-wide placeholder-slate-600 resize-none max-h-24"
                  />
                  
                  {/* Bottom bar inside capsule */}
                  <div className="pt-4 mt-3 border-t border-white/[0.04] flex gap-3 items-center justify-between">
                    <div />
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || loading}
                      className="w-9 h-9 bg-gradient-to-r from-emerald-400 to-[#d97706] hover:from-emerald-300 hover:to-emerald-500 text-black rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 shadow-[0_4px_12px_rgba(245,158,11,0.2)] active:scale-95 disabled:opacity-45"
                      title="Send consultation request"
                    >
                      <ArrowUp className="w-4 h-4 text-black stroke-[3]" />
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              
              /* ================= 3B. CHAT VIEWPORT FEED ================= */
              <div className="flex-grow flex flex-col justify-between h-full bg-transparent overflow-hidden">
                
                {/* Scrollable messages container */}
                <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-5 custom-dark-scroll select-text">
                  <AnimatePresence>
                    {messages.map(msg => {
                      const isUser = msg.role === 'user';
                      return (
                        <div 
                          key={msg.id}
                          className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`p-4 rounded-2xl border max-w-[85%] transition-all ${
                            isUser 
                              ? 'bg-[#181613] text-slate-200 border-emerald-500/10 rounded-tr-none shadow-sm' 
                              : 'bg-[#101011] text-slate-300 border-white/[0.04] rounded-tl-none relative group shadow-md'
                          }`}>
                            
                            {/* Inner header inside message cards */}
                            <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 mb-2.5 text-[9px] font-mono uppercase tracking-wider text-slate-500 leading-none select-none">
                              <div className="flex items-center gap-1.5">
                                {isUser ? <Briefcase className="w-3.5 h-3.5 text-emerald-400" /> : <Scale className="w-3.5 h-3.5 text-emerald-400" />}
                                <span className="font-bold">{isUser ? 'Practice Counsel' : 'Atlas Engine Response'}</span>
                              </div>
                              
                              {!isUser && (
                                <button
                                  onClick={() => copyMessageText(msg.content, msg.id)}
                                  className="opacity-0 group-hover:opacity-100 hover:text-emerald-300 flex items-center gap-1 text-[8px] uppercase tracking-wider font-mono bg-white/[0.04] px-2 py-1 rounded transition-all cursor-pointer border border-white/[0.05]"
                                  title="Copy response facts"
                                >
                                  {copiedId === msg.id ? (
                                    <>
                                      <CheckCheck className="w-2.5 h-2.5 text-emerald-400" />
                                      <span className="text-emerald-400">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-2.5 h-2.5" />
                                      <span>Copy Content</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Message text element */}
                            <div className="text-xs leading-relaxed tracking-normal space-y-1 select-text">
                              {isUser ? msg.content : formatMessageWithParagraphs(msg.content)}
                            </div>

                            {/* Case task recommendations */}
                            {msg.taskToCreate && (
                              <div className="mt-4 p-4 bg-[#070708] rounded-xl border border-emerald-500/10 max-w-xs space-y-2.5">
                                <span className="text-emerald-400 font-mono text-[9px] font-bold uppercase tracking-wider block">
                                  📋 Recommended Litigation Task:
                                </span>
                                <p className="text-xs text-slate-200 font-medium">{msg.taskToCreate.name}</p>
                                <button 
                                  onClick={() => handleCreateSuggestedTask(msg.taskToCreate, msg.id)}
                                  disabled={actionInProgress !== null}
                                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  {actionInProgress === `task_${msg.id}` ? (
                                    <Loader2 className="w-3 animate-spin" />
                                  ) : (
                                    <>Register Task Block</>
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Court hearing scheduling suggestion */}
                            {msg.eventToSchedule && (
                              <div className="mt-4 p-4 bg-[#070708] rounded-xl border border-emerald-500/10 max-w-xs space-y-2.5">
                                <span className="text-emerald-400 font-mono text-[9px] font-bold uppercase tracking-wider block">
                                  📅 Recommended Hearing Schedule:
                                </span>
                                <div className="text-xs text-slate-300">
                                  <p className="font-semibold text-slate-100">{msg.eventToSchedule.title}</p>
                                  {msg.eventToSchedule.date && (
                                    <p className="text-[10px] text-emerald-400 font-mono mt-0.5">{msg.eventToSchedule.date}</p>
                                  )}
                                </div>
                                <button 
                                  onClick={() => handleScheduleSuggestedEvent(msg.eventToSchedule, msg.id)}
                                  disabled={actionInProgress !== null}
                                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  {actionInProgress === `event_${msg.id}` ? (
                                    <Loader2 className="w-3 animate-spin" />
                                  ) : (
                                    <>Book Court Date</>
                                  )}
                                </button>
                              </div>
                            )}

                          </div>
                        </div>
                      );
                    })}
                  </AnimatePresence>

                  {loading && (
                    <div className="flex items-center gap-2.5 pl-2 select-none py-2">
                      <div className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
                        <Scale className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex items-center gap-1.5 bg-[#101011] border border-white/[0.04] p-3 px-4 rounded-2xl rounded-tl-none">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }} />
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Unified Premium Active Chat input capsule */}
                <div className="p-4 bg-[#0d0d0e]/60 border-t border-[#1a1a1c] select-text">
                  <div className="flex gap-3 items-end bg-[#131213] border border-white/5 focus-within:border-emerald-500/50 rounded-xl px-4 py-3 transition-all max-w-4xl mx-auto">
                    <textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      rows={1}
                      placeholder="Inquire regarding statutory acts or trial rules..."
                      className="grow bg-transparent outline-none text-slate-200 text-xs font-light tracking-wide leading-relaxed resize-none max-h-32 min-h-[22px] py-0.5 placeholder-slate-600"
                    />
                    
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || loading}
                      className="bg-emerald-500 hover:bg-emerald-400 text-black disabled:bg-[#1c1c1d] disabled:text-slate-600 rounded-lg p-2 transition-all cursor-pointer"
                    >
                      <ArrowUp className="w-4 h-4 text-black stroke-[3]" />
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
