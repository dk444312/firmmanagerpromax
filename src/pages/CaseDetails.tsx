import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock, Users, ArrowRightCircle, CheckSquare, FileText, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function CaseDetails() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newStage, setNewStage] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'notes'>('overview');
  const [note, setNote] = useState('');
  
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const fetchCase = async () => {
    if (!token || !supabase) return;
    try {
      const { data: resData, error } = await supabase.from('cases').select('*').eq('id', id).single();
      if (!error && resData) {
        setData(resData);
        setNewStage(resData.stage || 'Pre-trial');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCase();
  }, [id, token]);

  const updateStage = async () => {
    if (!token || !supabase) return;
    await supabase.from('cases').update({ stage: newStage }).eq('id', id);
    fetchCase();
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase) return;
    await supabase.from('cases').update(editData).eq('id', id);
    setIsEditingMeta(false);
    fetchCase();
  };

  const handleDelete = async () => {
    if (!token || !supabase || !confirm("CRITICAL: Delete this matter? All data associated with this matter will be lost.")) return;
    await supabase.from('cases').delete().eq('id', id);
    navigate('/cases');
  };

  const toggleCaseStatus = async () => {
    if (!token || !supabase) return;
    const newStatus = data?.status === 'Closed' ? 'Active' : 'Closed';
    await supabase.from('cases').update({ status: newStatus }).eq('id', id);
    fetchCase();
  };

  if (loading) return <div className="p-10 text-emerald-500">Loading case workspace...</div>;
  if (!data) return <div className="p-10 text-red-400">Matter not found.</div>;

  return (
    <div className="p-10 max-w-6xl mx-auto flex flex-col h-full">
      <button onClick={() => navigate('/cases')} className="text-slate-400 hover:text-white flex items-center gap-2 mb-6 text-sm transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Matters
      </button>

      <header className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-slate-300">{data.case_number || 'No Case Number'}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${data.status === 'Closed' ? 'bg-slate-800 text-slate-400 border border-white/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                {data.status || 'Active'}
              </span>
            </div>
            <h1 className="text-4xl font-semibold text-white tracking-tight">{data.title}</h1>
          </div>
          <div className="flex gap-3">
            <button onClick={toggleCaseStatus} className="bg-white/5 border border-white/10 text-white hover:bg-white/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Mark {data.status === 'Closed' ? 'Active' : 'Closed'}
            </button>
            <button onClick={handleDelete} className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Delete Matter
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 mb-8">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'overview' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Case Overview
          {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
        </button>
        <button 
          onClick={() => setActiveTab('notes')}
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'notes' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Case Notes & Research
          {activeTab === 'notes' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2 space-y-8">
            <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-lg p-8 relative">
              <button 
                onClick={() => {
                  setEditData({ 
                    claimant: data.claimant || '', 
                    defendant: data.defendant || '', 
                    court: data.court || '', 
                    judge_name: data.judge_name || '', 
                    brief_facts: data.brief_facts || data.description || '' 
                  });
                  setIsEditingMeta(true);
                }}
                className="absolute top-8 right-8 text-slate-400 hover:text-emerald-400 transition-colors bg-white/5 p-2 rounded-lg"
              >
                <Edit className="w-4 h-4" />
              </button>
              <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-500" />
                Case Meta & Brief Facts
              </h2>
              <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Claimant</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.claimant || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Defendant</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.defendant || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Court</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.court || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Judge / Magistrate</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.judge_name || 'Unassigned'}</div>
                </div>
              </div>
              
              <div className="mt-6">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Brief Facts / Description</div>
                <div className="text-slate-300 bg-[#0a0a0a] p-4 rounded-lg border border-white/5 whitespace-pre-wrap leading-relaxed">
                  {data.brief_facts || data.description || 'No facts recorded.'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-[#151619] rounded-xl border border-white/5 shadow-lg p-6">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <ArrowRightCircle className="w-4 h-4 text-emerald-500" />
                Current Stage
              </h3>
              <div className="mb-4 text-2xl font-light text-white">{data.stage || 'Pre-trial'}</div>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newStage} 
                  onChange={(e) => setNewStage(e.target.value)} 
                  className="bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 flex-1"
                  placeholder="Update stage..."
                />
                <button onClick={updateStage} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded text-sm font-medium transition-colors">
                  Update
                </button>
              </div>
            </div>

            <div className="bg-[#151619] rounded-xl border border-white/5 shadow-lg p-6">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Assigned Staff
              </h3>
              <div className="text-slate-500 text-sm">
                {data.assigned_staff_ids?.length > 0 ? `${data.assigned_staff_ids.length} Member(s)` : 'Unassigned'}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="flex-1 flex gap-8">
           <div className="flex-1 bg-[#151619] rounded-2xl border border-white/5 shadow-lg p-8 flex flex-col">
             <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                Quick Notes
             </h2>
             <textarea 
               value={note}
               onChange={(e) => setNote(e.target.value)}
               placeholder="Write down research, findings, meeting minutes, thoughts..."
               className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500/50 resize-none"
             ></textarea>
             <div className="mt-4 flex justify-end">
               <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium text-sm transition-colors shadow">Save Note</button>
             </div>
           </div>
           <div className="w-80 bg-[#121212] rounded-2xl border border-white/5 shadow-lg p-6">
             <h3 className="text-sm font-medium text-slate-300 uppercase tracking-widest mb-4">Saved Notes</h3>
             <div className="text-slate-500 text-sm italic">You haven't saved any notes yet for this matter.</div>
           </div>
        </div>
      )}

      {isEditingMeta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#151619] border border-white/10 p-8 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-light text-white mb-6">Edit Matter Details</h2>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Claimant</label>
                   <input type="text" value={editData.claimant} onChange={e => setEditData({...editData, claimant: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Defendant</label>
                   <input type="text" value={editData.defendant} onChange={e => setEditData({...editData, defendant: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Court</label>
                   <input type="text" value={editData.court} onChange={e => setEditData({...editData, court: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Judge / Magistrate</label>
                   <input type="text" value={editData.judge_name} onChange={e => setEditData({...editData, judge_name: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Brief Facts / Description</label>
                <textarea rows={6} value={editData.brief_facts} onChange={e => setEditData({...editData, brief_facts: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white resize-none" />
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-white/10">
                <button type="button" onClick={() => setIsEditingMeta(false)} className="px-6 py-2 text-slate-400 hover:text-white font-medium">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium shadow-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
