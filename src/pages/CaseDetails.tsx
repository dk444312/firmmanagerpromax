import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock, Users, ArrowRightCircle, CheckSquare, FileText, Edit, Trash2, Plus, Activity, CheckCircle2, Calendar, AlertCircle, Pin } from 'lucide-react';
import { supabase } from '../lib/supabase';

const getLabelStyle = (label: string) => {
  switch (label) {
    case 'Urgent':
      return 'bg-red-500/15 text-red-400 border border-red-500/20';
    case 'High Profile':
      return 'bg-orange-500/15 text-orange-400 border border-orange-500/20';
    case 'Confidential':
      return 'bg-purple-500/15 text-purple-400 border border-purple-500/20';
    case 'Pro Bono':
      return 'bg-blue-500/15 text-blue-400 border border-blue-500/20';
    case 'In-House':
      return 'bg-teal-500/15 text-teal-400 border border-teal-500/20';
    default:
      return 'bg-slate-500/15 text-slate-400 border border-slate-500/20';
  }
};

const DEFAULT_STAGES = [
  'Client Consultation',
  'Demand Letter',
  'Negotiations',
  'Filing',
  'Pleadings',
  'Applications',
  'Mediation',
  'Discovery',
  'Pre-Trial Conference',
  'Trial',
  'Judgment',
  'Appeal',
  'Enforcement',
  'Assessment of Costs',
  'Matter Closed'
];

export default function CaseDetails() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newStage, setNewStage] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'timeline'>('overview');
  const [note, setNote] = useState('');
  
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const [caseNotes, setCaseNotes] = useState<any[]>([]);

  // Milestones State
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');

  const fetchCase = async () => {
    if (!token || !supabase) return;
    try {
      const { data: resData, error } = await supabase.from('cases').select('*').eq('id', id).single();
      if (!error && resData) {
        setData(resData);
        setNewStage(resData.stage || 'Client Consultation');
      }

      // Fetch chronological case milestones
      setLoadingMilestones(true);
      try {
        const milRes = await fetch(`/api/cases/${id}/milestones`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (milRes.ok) {
          const milData = await milRes.json();
          setMilestones(milData);
        }
      } catch (e) {
        console.error("Error loading case milestones:", e);
      } finally {
        setLoadingMilestones(false);
      }

      const { data: notesData, error: notesError } = await supabase.from('case_notes').select('*').eq('case_id', id).order('created_at', { ascending: false });
      if (notesError) console.error("Error fetching notes:", notesError);
      if (notesData && notesData.length > 0) {
        const authorIds = [...new Set(notesData.map(n => n.author_id).filter(Boolean))];
        if (authorIds.length > 0) {
           const { data: staffData } = await supabase.from('staff').select('id, name, username').in('id', authorIds);
           if (staffData) {
             const staffMap = staffData.reduce((acc: any, s: any) => ({ ...acc, [s.id]: s }), {});
             notesData.forEach(n => { n.staff = staffMap[n.author_id]; });
           }
        }
        setCaseNotes(notesData);
      } else {
        setCaseNotes([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMilestone = async (milestoneId: string, updatedFields: any) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/case_milestones/${milestoneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedFields)
      });
      if (res.ok) {
        const updated = await res.json();
        setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, ...updated } : m));
      } else {
        alert("Failed to update milestone");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newMilestoneTitle.trim()) return;
    try {
      const res = await fetch(`/api/case_milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          case_id: id,
          title: newMilestoneTitle,
          description: newMilestoneDesc,
          status: 'Pending',
          completed_at: null,
          notes: ''
        })
      });
      if (res.ok) {
        const added = await res.json();
        setMilestones(prev => [...prev, added]);
        setIsAddingMilestone(false);
        setNewMilestoneTitle('');
        setNewMilestoneDesc('');
      } else {
        alert("Failed to create custom milestone");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNote = async () => {
    if (!note.trim() || !token || !supabase || !user) return;
    const { data: newNote, error } = await supabase.from('case_notes').insert([{
      case_id: id,
      author_id: user.id,
      content: note,
      pinned: false
    }]).select('*').single();
    
    if (error) {
       console.error("Save note error:", error);
       alert("Failed to save note: " + error.message);
    } else if (newNote) {
      newNote.staff = { name: user.name, username: user.username };
      setCaseNotes([newNote, ...caseNotes]);
      setNote('');
    }
  };

  const togglePinNote = async (noteId: string, currentPinned: boolean) => {
    if (!token || !supabase) return;
    const { error } = await supabase.from('case_notes').update({ pinned: !currentPinned }).eq('id', noteId);
    
    if (error) {
      // fallback in case of direct supabase issue
      try {
        await fetch(`/api/case_notes/${noteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ pinned: !currentPinned })
        });
      } catch (err) {
        console.error("Pin note route fallback error:", err);
      }
    }

    setCaseNotes(caseNotes.map(n => n.id === noteId ? { ...n, pinned: !currentPinned } : n));
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!token || !supabase || !confirm("Delete this case note permanently?")) return;
    await supabase.from('case_notes').delete().eq('id', noteId);
    setCaseNotes(caseNotes.filter(n => n.id !== noteId));
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
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-slate-300">{data.case_number || 'No Case Number'}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${data.status === 'Closed' ? 'bg-slate-800 text-slate-400 border border-white/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                {data.status || 'Active'}
              </span>
              {data.labels && data.labels.map((l: string) => (
                <span key={l} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getLabelStyle(l)}`}>
                  {l}
                </span>
              ))}
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
        <button 
          onClick={() => setActiveTab('timeline')}
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'timeline' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Case Timeline
          {activeTab === 'timeline' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
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
                    brief_facts: data.brief_facts || data.description || '',
                    labels: data.labels || []
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
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Nature of Claim</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.nature_of_claim || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Relief Sought</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.relief_sought || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Cause of Action</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.cause_of_action || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Counterclaim</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.counterclaim || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Amount Claimed</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">
                    {data.amount_claimed ? `MWK ${data.amount_claimed.toLocaleString()}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Opposing Counsel</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">{data.opposing_counsel || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Division & Registry</div>
                  <div className="text-white bg-[#0a0a0a] p-3 rounded-lg border border-white/5">
                    {[data.division, data.registry].filter(Boolean).join(' - ') || 'N/A'}
                  </div>
                </div>
              </div>
              
              <div className="mt-8 grid grid-cols-2 gap-8 border-t border-white/5 pt-6">
                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-400" />
                    Risk Assessment
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Risk Level</div>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        data.risk_level === 'Critical' ? 'bg-red-500/20 text-red-400' :
                        data.risk_level === 'High' ? 'bg-orange-500/20 text-orange-400' :
                        data.risk_level === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {data.risk_level || 'Medium'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Success Prob.</div>
                        <div className="text-white bg-[#0a0a0a] p-2 rounded text-sm">{data.likelihood_of_success || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Loss Prob.</div>
                        <div className="text-white bg-[#0a0a0a] p-2 rounded text-sm">{data.likelihood_of_loss || 'N/A'}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Risk Notes</div>
                      <div className="text-slate-300 bg-[#0a0a0a] p-3 rounded-lg border border-white/5 text-sm">
                        {data.risk_notes || 'No notes recorded.'}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    Financial Exposure
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                      <span className="text-slate-400">Potential Gain</span>
                      <span className="text-emerald-400 font-medium">MWK {(data.potential_gain || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                      <span className="text-slate-400">Potential Loss</span>
                      <span className="text-red-400 font-medium">MWK {(data.potential_loss || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                      <span className="text-slate-400">Est. Legal Fees</span>
                      <span className="text-white">MWK {(data.estimated_legal_fees || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                      <span className="text-slate-400">Filing Fees</span>
                      <span className="text-white">MWK {(data.court_filing_fees || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                      <span className="text-slate-400">Disbursements</span>
                      <span className="text-white">MWK {(data.disbursements || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                      <span className="text-slate-400">Expert / Transport / Other</span>
                      <span className="text-white">MWK {((data.expert_witness_costs || 0) + (data.transport_costs || 0) + (data.other_litigation_costs || 0)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm bg-white/5 p-2 rounded">
                      <span className="text-white font-semibold">Total Est. Cost</span>
                      <span className="text-white font-bold">MWK {((data.estimated_legal_fees || 0) + (data.court_filing_fees || 0) + (data.disbursements || 0) + (data.expert_witness_costs || 0) + (data.transport_costs || 0) + (data.other_litigation_costs || 0)).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-white/5 pt-6">
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
              <div className="mb-4 text-2xl font-light text-white">{data.stage || 'Client Consultation'}</div>
              
              <div className="flex gap-2">
                <select 
                  value={newStage} 
                  onChange={(e) => setNewStage(e.target.value)} 
                  className="bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 flex-1"
                >
                  {DEFAULT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
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
               <button onClick={handleSaveNote} disabled={!note.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium text-sm transition-colors shadow disabled:opacity-50">Save Note</button>
             </div>
           </div>
           <div className="w-80 bg-[#121212] rounded-2xl border border-white/5 shadow-lg p-6 max-h-[80vh] overflow-y-auto">
             <h3 className="text-sm font-medium text-slate-300 uppercase tracking-widest mb-4">Saved Notes</h3>
             {caseNotes.length === 0 ? (
                <div className="text-slate-500 text-sm italic">You haven't saved any notes yet for this matter.</div>
             ) : (
                <div className="space-y-4">
                  {[...caseNotes].sort((a, b) => {
                    const pinA = !!a.pinned;
                    const pinB = !!b.pinned;
                    if (pinA && !pinB) return -1;
                    if (!pinA && pinB) return 1;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  }).map(n => (
                    <div 
                      key={n.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        n.pinned 
                          ? 'bg-amber-500/5 border-amber-500/20 shadow-lg shadow-amber-950/5' 
                          : 'bg-[#1a1c20] border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-200">{n.staff?.name || n.staff?.username || 'Staff'}</span>
                          {n.pinned && <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">PINNED</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => togglePinNote(n.id, !!n.pinned)}
                            title={n.pinned ? "Unpin note" : "Pin note to top"}
                            className={`p-1.5 rounded transition-all ${
                              n.pinned ? 'text-amber-500 hover:bg-amber-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-[#2c2d30]'
                            }`}
                          >
                            <Pin className={`w-3.5 h-3.5 ${n.pinned ? 'fill-amber-500' : ''}`} />
                          </button>
                          <button 
                            onClick={() => handleDeleteNote(n.id)}
                            title="Delete note"
                            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-[#2c2d30] transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                      <span className="text-[9px] text-slate-500 mt-2 block font-mono">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
             )}
           </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-[#151619] p-6 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500 animate-pulse" />
                Chronological Case Timeline
              </h2>
              <p className="text-xs text-slate-400 mt-1">Automatic & custom milestones recorded throughout the lifespan of this matter.</p>
            </div>
            <button 
              onClick={() => setIsAddingMilestone(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-md shadow-emerald-950/20"
            >
              <Plus className="w-4 h-4" /> Add Custom Milestone
            </button>
          </div>

          {loadingMilestones ? (
            <div className="text-slate-400 text-center py-10">Loading timeline...</div>
          ) : milestones.length === 0 ? (
            <div className="text-slate-400 text-center py-10 bg-[#151619] rounded-2xl border border-white/5">No milestones initialized. Click "Add Custom Milestone" to begin.</div>
          ) : (
            <div className="relative pl-8 border-l-2 border-white/5 ml-4 space-y-6">
              {milestones.map((m, index) => {
                const isCompleted = m.status === 'Completed';
                const isNotApplicable = m.status === 'Not Applicable';
                return (
                  <div key={m.id} className="relative">
                    {/* Circle Indicator on the left line */}
                    <div className={`absolute -left-[41px] top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all bg-[#0a0a0a] z-10
                      ${isCompleted ? 'border-emerald-500 text-emerald-400 bg-emerald-950/50' : isNotApplicable ? 'border-slate-700 text-slate-600' : 'border-slate-500 text-slate-400'}
                    `}>
                      {isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <span className="text-[10px] font-bold">{index + 1}</span>
                      )}
                    </div>

                    {/* Milestone Card */}
                    <div className={`bg-[#151619] rounded-2xl border p-6 transition-all hover:border-white/10
                      ${isCompleted ? 'border-emerald-500/15 shadow-lg shadow-emerald-950/[0.05]' : 'border-white/5'}
                    `}>
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h3 className={`text-base font-bold text-white tracking-wide ${isNotApplicable ? 'line-through text-slate-500' : ''}`}>
                            {m.title}
                          </h3>
                          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">{m.description}</p>
                          {m.completed_at && (
                            <div className="text-[11px] text-emerald-400 font-mono font-semibold flex items-center gap-1 mt-1">
                              <Clock className="w-3.5 h-3.5" /> Completed on: {new Date(m.completed_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>

                        {/* Status Selectors */}
                        <div className="flex flex-wrap items-center gap-2">
                          <select 
                            value={m.status}
                            onChange={(e) => {
                              const nextStatus = e.target.value;
                              const completed_at = nextStatus === 'Completed' ? (m.completed_at || new Date().toISOString()) : null;
                              handleUpdateMilestone(m.id, { status: nextStatus, completed_at });
                            }}
                            className={`text-xs font-bold rounded-lg border py-1.5 px-3 bg-[#0a0a0a] focus:outline-none focus:border-emerald-500 transition-all cursor-pointer
                              ${m.status === 'Completed' ? 'border-emerald-500/30 text-emerald-400' : m.status === 'Not Applicable' ? 'border-slate-800 text-slate-500' : 'border-white/10 text-slate-300'}
                            `}
                          >
                            <option value="Pending">⏱️ Pending</option>
                            <option value="Completed">✅ Completed</option>
                            <option value="Not Applicable">🚫 N/A</option>
                          </select>

                          {isCompleted && (
                            <input 
                              type="date"
                              value={m.completed_at ? m.completed_at.substring(0, 10) : ''}
                              onChange={(e) => {
                                const dStr = e.target.value ? new Date(e.target.value).toISOString() : null;
                                handleUpdateMilestone(m.id, { completed_at: dStr });
                              }}
                              className="text-xs font-mono font-semibold bg-[#0a0a0a] border border-white/10 rounded-lg py-1.5 px-2.5 text-white focus:outline-none focus:border-emerald-500"
                            />
                          )}
                        </div>
                      </div>

                      {/* Milestone Notes & Comments */}
                      <div className="mt-4 pt-4 border-t border-white/[0.03]">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Filing Records & Case Notes</label>
                        <div className="flex gap-2">
                          <textarea 
                            defaultValue={m.notes || ''}
                            placeholder="Add case logs, sum of filing fees, docket numbers, service records..."
                            onBlur={(e) => {
                              if (e.target.value !== (m.notes || '')) {
                                handleUpdateMilestone(m.id, { notes: e.target.value });
                              }
                            }}
                            className="flex-1 bg-[#0a0a0a] border border-white/5 rounded-xl p-3 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none h-16 transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom Milestone Modal Dialog */}
          {isAddingMilestone && (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
              <div className="bg-[#151619] border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl">
                <h3 className="text-lg font-bold text-white mb-4">Add Custom Milestone</h3>
                <form onSubmit={handleAddMilestone} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Milestone Name / Title</label>
                    <input 
                      required 
                      type="text" 
                      placeholder="e.g., Filing of Reply to Defence"
                      value={newMilestoneTitle}
                      onChange={e => setNewMilestoneTitle(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-emerald-500 text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</label>
                    <textarea 
                      placeholder="e.g., Draft and file reply addressing allegations in paragraph 4 of defence..."
                      value={newMilestoneDesc}
                      onChange={e => setNewMilestoneDesc(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 px-3 text-white focus:outline-none focus:border-emerald-500 text-sm h-24 resize-none" 
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                    <button 
                      type="button" 
                      onClick={() => setIsAddingMilestone(false)} 
                      className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-md"
                    >
                      Save Milestone
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {isEditingMeta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#151619] border border-white/10 p-8 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-light text-white mb-6">Edit Matter Details</h2>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Claimants</label>
                   {editData.claimant.split(',').map((c: string, i: number) => (
                     <div key={`c-${i}`} className="flex gap-2 mb-2">
                       <input 
                         type="text" 
                         value={c.trim()} 
                         onChange={e => {
                           const arr = editData.claimant.split(',').map((s: string) => s.trim());
                           arr[i] = e.target.value;
                           setEditData({...editData, claimant: arr.join(', ')})
                         }} 
                         className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" 
                       />
                       {i > 0 && <button type="button" onClick={() => {
                          const arr = editData.claimant.split(',').map((s: string) => s.trim()).filter((_: any, idx: number) => idx !== i);
                          setEditData({...editData, claimant: arr.join(', ')});
                       }} className="text-red-400 hover:text-red-300 px-2"><Trash2 className="w-4 h-4" /></button>}
                     </div>
                   ))}
                   <button type="button" onClick={() => {
                     const currentStr = editData.claimant ? editData.claimant + ', ' : '';
                     setEditData({...editData, claimant: currentStr});
                   }} className="text-emerald-500 hover:text-emerald-400 text-xs font-medium flex items-center gap-1 mt-1"><Plus className="w-3 h-3" /> Add Claimant</button>
                </div>
                <div>
                   <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Defendants</label>
                   {editData.defendant.split(',').map((d: string, i: number) => (
                     <div key={`d-${i}`} className="flex gap-2 mb-2">
                       <input 
                         type="text" 
                         value={d.trim()} 
                         onChange={e => {
                           const arr = editData.defendant.split(',').map((s: string) => s.trim());
                           arr[i] = e.target.value;
                           setEditData({...editData, defendant: arr.join(', ')})
                         }} 
                         className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" 
                       />
                       {i > 0 && <button type="button" onClick={() => {
                          const arr = editData.defendant.split(',').map((s: string) => s.trim()).filter((_: any, idx: number) => idx !== i);
                          setEditData({...editData, defendant: arr.join(', ')});
                       }} className="text-red-400 hover:text-red-300 px-2"><Trash2 className="w-4 h-4" /></button>}
                     </div>
                   ))}
                   <button type="button" onClick={() => {
                     const currentStr = editData.defendant ? editData.defendant + ', ' : '';
                     setEditData({...editData, defendant: currentStr});
                   }} className="text-emerald-500 hover:text-emerald-400 text-xs font-medium flex items-center gap-1 mt-1"><Plus className="w-3 h-3" /> Add Defendant</button>
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

               <div className="grid grid-cols-2 gap-4 mt-4">
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nature of Claim</label>
                    <input type="text" value={editData.nature_of_claim || ''} onChange={e => setEditData({...editData, nature_of_claim: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Relief Sought</label>
                    <input type="text" value={editData.relief_sought || ''} onChange={e => setEditData({...editData, relief_sought: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cause of Action</label>
                    <input type="text" value={editData.cause_of_action || ''} onChange={e => setEditData({...editData, cause_of_action: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Counterclaim</label>
                    <input type="text" value={editData.counterclaim || ''} onChange={e => setEditData({...editData, counterclaim: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Division</label>
                    <input type="text" value={editData.division || ''} onChange={e => setEditData({...editData, division: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registry</label>
                    <input type="text" value={editData.registry || ''} onChange={e => setEditData({...editData, registry: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Opposing Counsel</label>
                    <input type="text" value={editData.opposing_counsel || ''} onChange={e => setEditData({...editData, opposing_counsel: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount Claimed (MWK)</label>
                    <input type="number" value={editData.amount_claimed || ''} onChange={e => setEditData({...editData, amount_claimed: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                 </div>
               </div>

               <div className="border-t border-white/10 pt-4 pb-2 mt-4">
                 <h3 className="text-sm font-semibold text-emerald-500 uppercase tracking-wider mb-4">Risk Assessment</h3>
                 <div className="grid grid-cols-3 gap-4">
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Risk Level</label>
                     <select value={editData.risk_level || 'Medium'} onChange={e => setEditData({...editData, risk_level: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                        <option>Critical</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Likelihood of Success</label>
                     <input type="text" placeholder="e.g. 70%" value={editData.likelihood_of_success || ''} onChange={e => setEditData({...editData, likelihood_of_success: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Likelihood of Loss</label>
                     <input type="text" placeholder="e.g. 30%" value={editData.likelihood_of_loss || ''} onChange={e => setEditData({...editData, likelihood_of_loss: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                 </div>
                 <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Risk Notes</label>
                    <textarea rows={2} value={editData.risk_notes || ''} onChange={e => setEditData({...editData, risk_notes: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white resize-none" />
                 </div>
               </div>

               <div className="border-t border-white/10 pt-4 pb-2 mt-4 mb-4">
                 <h3 className="text-sm font-semibold text-emerald-500 uppercase tracking-wider mb-4">Financial Exposure (MWK)</h3>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Potential Gain</label>
                     <input type="number" value={editData.potential_gain || ''} onChange={e => setEditData({...editData, potential_gain: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Potential Loss</label>
                     <input type="number" value={editData.potential_loss || ''} onChange={e => setEditData({...editData, potential_loss: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Est. Legal Fees</label>
                     <input type="number" value={editData.estimated_legal_fees || ''} onChange={e => setEditData({...editData, estimated_legal_fees: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Court Filing Fees</label>
                     <input type="number" value={editData.court_filing_fees || ''} onChange={e => setEditData({...editData, court_filing_fees: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Disbursements</label>
                     <input type="number" value={editData.disbursements || ''} onChange={e => setEditData({...editData, disbursements: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Expert Witness Costs</label>
                     <input type="number" value={editData.expert_witness_costs || ''} onChange={e => setEditData({...editData, expert_witness_costs: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Transport Costs</label>
                     <input type="number" value={editData.transport_costs || ''} onChange={e => setEditData({...editData, transport_costs: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                   <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Other Litigation Costs</label>
                     <input type="number" value={editData.other_litigation_costs || ''} onChange={e => setEditData({...editData, other_litigation_costs: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                   </div>
                 </div>
               </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Matter Labels (Classification)</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {['Urgent', 'High Profile', 'Confidential', 'Pro Bono', 'In-House'].map(lbl => {
                    const currentLabels = editData.labels || [];
                    const isSelected = currentLabels.includes(lbl);
                    return (
                      <button
                        type="button"
                        key={lbl}
                        onClick={() => {
                          const nextLabels = isSelected
                            ? currentLabels.filter((x: string) => x !== lbl)
                            : [...currentLabels, lbl];
                          setEditData({ ...editData, labels: nextLabels });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isSelected
                            ? lbl === 'Urgent' ? 'bg-red-500/20 text-red-400 border-red-500/30 font-bold'
                              : lbl === 'High Profile' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 font-bold'
                              : lbl === 'Confidential' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30 font-bold'
                              : lbl === 'Pro Bono' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 font-bold'
                              : 'bg-teal-500/20 text-teal-400 border-teal-500/30 font-bold'
                            : 'bg-[#0a0a0a] text-slate-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{lbl}
                      </button>
                    );
                  })}
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
