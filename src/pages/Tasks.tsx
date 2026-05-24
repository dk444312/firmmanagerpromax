import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { CheckCircle2, Clock, PlayCircle, XCircle, Plus, Search, Link as LinkIcon, Trash, Edit3 } from 'lucide-react';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

type Task = {
  id: string;
  name: string;
  status: string;
  priority: string;
  case_id?: string;
  case_title?: string;
  assigned_to?: string[];
  due_date?: string;
};

type Member = {
  id: string;
  name: string;
  role: string;
};

export default function Tasks() {
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState<Member[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task>({ id: '', name: '', priority: 'Medium', status: 'Pending', case_id: '', case_title: '', due_date: '', assigned_to: [] });
  
  const STAGES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const [tasksRes, staffRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('firm_id', user.firm_id),
        supabase.from('staff').select('*').eq('firm_id', user.firm_id)
      ]);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (staffRes.data) setStaff(staffRes.data);
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
    
    const payload = { ...currentTask } as any;
    if (!payload.case_id) {
      payload.case_id = null;
      payload.case_title = null;
    }
    
    if (isEditing) {
      await supabase.from('tasks').update(payload).eq('id', currentTask.id);
      
      // Send notification
      if (payload.assigned_to && payload.assigned_to.length > 0) {
        fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userIds: payload.assigned_to, entityType: 'Task', entityName: payload.name, message: `Task details have been updated. Due: ${payload.due_date || 'N/A'}` })
        }).catch(console.error);
      }
    } else {
      delete payload.id;
      await supabase.from('tasks').insert([{ ...payload, firm_id: user.firm_id }]);
      
      // Send notification
      if (payload.assigned_to && payload.assigned_to.length > 0) {
        fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userIds: payload.assigned_to, entityType: 'Task', entityName: payload.name, message: `You have been assigned to a new task. Due: ${payload.due_date || 'N/A'}` })
        }).catch(console.error);
      }
    }
    fetchData();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!token || !supabase || !confirm("Delete this task?")) return;
    await supabase.from('tasks').delete().eq('id', id);
    fetchData();
  };

  const openAddModal = () => {
    setCurrentTask({ id: '', name: '', priority: 'Medium', status: 'Pending', case_id: '', case_title: '', due_date: '', assigned_to: [user.id] });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (t: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentTask({ ...t, assigned_to: t.assigned_to || [] });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const toggleAssignee = (id: string) => {
    const current = currentTask.assigned_to || [];
    if (current.includes(id)) {
      setCurrentTask({ ...currentTask, assigned_to: current.filter(uid => uid !== id) });
    } else {
      setCurrentTask({ ...currentTask, assigned_to: [...current, id] });
    }
  };

  const getPriorityColor = (p: string) => {
    if (p === 'High') return 'text-red-400 bg-red-400/10';
    if (p === 'Medium') return 'text-amber-400 bg-amber-400/10';
    return 'text-blue-400 bg-blue-400/10';
  };

  const filteredTasks = tasks.filter(t => (t.name || '').toLowerCase().includes((search || '').toLowerCase()));

  return (
    <div className="p-10 h-full flex flex-col max-w-[1600px] mx-auto">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight">Task Management</h1>
          <p className="text-slate-400 mt-2 text-lg">Manage and assign firm tasks.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
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
            Add Task
          </button>
        </div>
      </header>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-medium text-white mb-4">{isEditing ? 'Edit Task' : 'Create New Task'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Task Name</label>
                <input required type="text" value={currentTask.name} onChange={e => setCurrentTask({...currentTask, name: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Case</label>
                {currentTask.case_id ? (
                  <div className="flex items-center justify-between bg-[#0a0a0a] border border-emerald-500/30 rounded py-2 px-3">
                     <span className="text-emerald-400 text-sm truncate">{currentTask.case_title}</span>
                     <button type="button" onClick={() => setCurrentTask({...currentTask, case_id: '', case_title: ''})} className="text-slate-500 hover:text-red-400">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setIsSelectingCase(true)} className="w-full flex justify-center items-center gap-2 bg-[#0a0a0a] border border-dashed border-white/20 hover:border-emerald-500/50 rounded py-2 px-3 text-sm text-slate-400 hover:text-emerald-400 transition-colors">
                    <LinkIcon className="w-4 h-4" /> Link Matter
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Due Date</label>
                <input type="date" value={currentTask.due_date} onChange={e => setCurrentTask({...currentTask, due_date: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assign To Staff</label>
                <div className="space-y-2 max-h-32 overflow-y-auto p-2 bg-[#0a0a0a] border border-white/10 rounded">
                  {staff.map(s => (
                    <label key={s.id} className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={(currentTask.assigned_to || []).includes(s.id)}
                        onChange={() => toggleAssignee(s.id)}
                        className="rounded border-white/10 bg-white/5 text-emerald-500 focus:ring-emerald-500/50"
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{s.name} ({s.role})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Priority</label>
                <select value={currentTask.priority} onChange={e => setCurrentTask({...currentTask, priority: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                <select value={currentTask.status} onChange={e => setCurrentTask({...currentTask, status: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                  {STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium">Save Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSelectingCase && (
        <CaseSelectorModal 
          onClose={() => setIsSelectingCase(false)}
          onSelect={(id, title) => {
            setCurrentTask({ ...currentTask, case_id: id, case_title: title });
            setIsSelectingCase(false);
          }}
        />
      )}

      {loading ? (
        <div className="text-emerald-500">Loading tasks...</div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageTasks = filteredTasks.filter(c => c.status === stage);
            return (
              <div key={stage} className="flex-shrink-0 w-80 flex flex-col bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-[#151619]">
                  <h3 className="font-semibold text-slate-300 uppercase tracking-widest text-xs flex justify-between">
                    {stage}
                    <span className="bg-white/5 px-2 py-0.5 rounded text-slate-400">{stageTasks.length}</span>
                  </h3>
                </div>
                
                <div className="p-3 flex-1 overflow-y-auto space-y-3">
                  {stageTasks.length === 0 ? (
                    <div className="text-slate-600 text-sm text-center py-6 border border-dashed border-white/10 rounded-lg">No tasks</div>
                  ) : (
                    stageTasks.map(t => (
                      <div key={t.id} className="bg-[#1a1c20] p-4 rounded-lg border border-white/5 hover:border-white/20 transition-colors shadow-sm relative group">
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => openEditModal(t, e)} className="text-slate-400 hover:text-emerald-400 p-1 bg-[#121212] rounded">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-slate-400 hover:text-red-400 p-1 bg-[#121212] rounded">
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex justify-between items-start mb-2 pr-12">
                          <h4 className="text-white font-medium group-hover:text-emerald-400 transition-colors">{t.name}</h4>
                        </div>
                        {t.case_title && (
                          <div className="text-[10px] text-emerald-500/80 mb-2 truncate">Related to: {t.case_title}</div>
                        )}
                        {t.due_date && (
                          <div className="text-[10px] text-amber-500 mb-2 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Due: {new Date(t.due_date).toLocaleDateString()}
                          </div>
                        )}
                        <div className="flex justify-between items-center mt-3 text-xs">
                          <span className={`px-2 py-0.5 rounded-full ${getPriorityColor(t.priority)}`}>{t.priority}</span>
                          <div className="flex -space-x-2">
                            {(t.assigned_to || []).slice(0, 3).map(uid => {
                              const s = staff.find(sm => sm.id === uid);
                              return (
                                <div key={uid} title={s?.name} className="w-6 h-6 rounded-full bg-slate-800 border border-[#1a1c20] flex items-center justify-center text-[10px] text-slate-300">
                                  {s?.name?.charAt(0) || '?'}
                                </div>
                              );
                            })}
                            {(t.assigned_to || []).length > 3 && (
                              <div className="w-6 h-6 rounded-full bg-slate-800 border border-[#1a1c20] flex items-center justify-center text-[10px] text-slate-300">
                                +{(t.assigned_to || []).length - 3}
                              </div>
                            )}
                            {(t.assigned_to || []).length === 0 && <span className="text-slate-500">Unassigned</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}
