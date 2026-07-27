import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type CaseData = {
  id: string;
  title: string;
  description: string;
  stage: string;
  court: string;
  status: string;
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
const COURTS = [
  'Magistrates Court', 
  'Industrial Relations Court', 
  'High Court - Civil Division',
  'High Court - Criminal Division',
  'High Court - Commercial Division',
  'High Court - Financial Crimes Division',
  'High Court - Family and Probate Division',
  'Supreme Court of Appeal',
  'Other'
];

export default function Cases() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedFilterLabel, setSelectedFilterLabel] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  
  const [isAdding, setIsAdding] = useState(false);
  const [titleMode, setTitleMode] = useState('auto'); // auto, claimant, defendant, custom
  const [newForm, setNewForm] = useState({
    title: '', description: '', case_number: '', 
    court: COURTS[0], specific_court_other: '', registry_court: '', judge_name: '', 
    brief_facts: '', status: 'Active', stage: DEFAULT_STAGES[0],
    companies: '', directors: '',
    nature_of_claim: '', relief_sought: '', amount_claimed: 0,
    counterclaim: '', cause_of_action: '', division: '',
    registry: '', opposing_counsel: '',
    likelihood_of_success: '', likelihood_of_loss: '', risk_level: 'Medium', risk_notes: '',
    potential_gain: 0, court_filing_fees: 0, disbursements: 0,
    expert_witness_costs: 0, transport_costs: 0, other_litigation_costs: 0
  });
  const [claimants, setClaimants] = useState<string[]>(['']);
  const [defendants, setDefendants] = useState<string[]>(['']);

  // Conflict of interest state
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [checkingConflict, setCheckingConflict] = useState(false);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') {
      setIsAdding(true);
      // Clean up the parameter from URL without page reload
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!token || !supabase || !user) return;
    
    supabase
      .from('cases')
      .select('*')
      .eq('firm_id', user.firm_id)
      .then(({ data }) => {
        let allCases = Array.isArray(data) ? data : [];
        if (user.role !== 'Managing Partner' && user.case_access_mode === 'assigned') {
           const allowedIds = user.allowed_cases || [];
           allCases = allCases.filter(c => 
             allowedIds.includes(c.id) || (c.assigned_staff_ids && c.assigned_staff_ids.includes(user.id))
           );
        }
        setCases(allCases);
        setLoading(false);
      });
  }, [token, user]);

  const executeCreate = async (claimantStr: string, defendantStr: string) => {
    if (!token || !supabase || !user) return;

    let finalTitle = newForm.title;
    if (titleMode === 'auto') {
      finalTitle = `${claimantStr} v. ${defendantStr}`;
    } else if (titleMode === 'claimant') {
      finalTitle = claimantStr;
    } else if (titleMode === 'defendant') {
      finalTitle = defendantStr;
    }

    const { data: created, error } = await supabase
      .from('cases')
      .insert([{ 
        ...newForm, 
        claimant: claimantStr,
        defendant: defendantStr,
        title: finalTitle || 'Untitled Matter',
        firm_id: user.firm_id,
        assigned_staff_ids: [user.id],
        labels: selectedLabels
      }])
      .select()
      .single();

    if (created && !error) {
      // Auto-create folder for the case
      await supabase.from('folders').insert([{ 
        name: created.title || 'Case Folder', 
        firm_id: user.firm_id, 
        case_id: created.id 
      }]);

      // Note: By default the case is assigned to [user.id] which is the person creating it,
      // so notifying them might be redundant, but we handle it just in case.
      fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userIds: [user.id], entityType: 'Case', entityName: created.title, message: `You have created and been assigned to a new case.` })
      }).catch(console.error);

      setCases([...cases, created]);
      setIsAdding(false);
      setTitleMode('auto');
      setNewForm({
        title: '', description: '', case_number: '', 
        court: COURTS[0], specific_court_other: '', registry_court: '', judge_name: '', 
        brief_facts: '', status: 'Active', stage: DEFAULT_STAGES[0],
        companies: '', directors: '',
        nature_of_claim: '', relief_sought: '', amount_claimed: 0,
        counterclaim: '', cause_of_action: '', division: '',
        registry: '', opposing_counsel: '',
        likelihood_of_success: '', likelihood_of_loss: '', risk_level: 'Medium', risk_notes: '',
        potential_gain: 0, court_filing_fees: 0, disbursements: 0,
        expert_witness_costs: 0, transport_costs: 0, other_litigation_costs: 0
      });
      setSelectedLabels([]);
      setClaimants(['']);
      setDefendants(['']);
      setShowConflictModal(false);
      setConflictWarnings([]);
    } else if (error) {
      alert("Failed to register matter: " + error.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    
    const validClaimants = claimants.filter(c => c.trim() !== '');
    const validDefendants = defendants.filter(d => d.trim() !== '');
    const claimantStr = validClaimants.join(', ') || 'Unknown';
    const defendantStr = validDefendants.join(', ') || 'Unknown';

    try {
      setCheckingConflict(true);
      const res = await fetch('/api/cases/conflict-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          claimant: claimantStr,
          defendant: defendantStr,
          companies: newForm.companies,
          directors: newForm.directors
        })
      });

      setCheckingConflict(false);
      if (res.ok) {
        const conflictData = await res.json();
        if (conflictData.conflict) {
          setConflictWarnings(conflictData.reasons);
          setShowConflictModal(true);
          return; // Stop flow and show warning dialog
        }
      }
    } catch (err) {
      console.error("Conflict checking failure:", err);
      setCheckingConflict(false);
    }

    await executeCreate(claimantStr, defendantStr);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!token || !supabase || !confirm("Delete this case? This will remove all associated logs and records.")) return;
    
    await supabase.from('cases').delete().eq('id', id);
    setCases(cases.filter(c => c.id !== id));
  };

  const filtered = cases.filter(c => {
    const matchesSearch = (c.title || '').toLowerCase().includes(search.toLowerCase()) || 
                          (c.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesLabel = !selectedFilterLabel || (c.labels && c.labels.includes(selectedFilterLabel));
    return matchesSearch && matchesLabel;
  });

  return (
    <div className="p-10 h-full flex flex-col max-w-[1600px] mx-auto">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight">Cases Center</h1>
          <p className="text-slate-400 mt-2 text-lg">
            {user?.role === 'Managing Partner' || user?.case_access_mode === 'all' 
              ? "Viewing all firm cases." 
              : "Viewing assigned cases."}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search matters..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[#151619] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 w-64"
            />
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Matter
          </button>
        </div>
      </header>

      {/* Label Classification Filter Bar */}
      <div className="flex items-center gap-2 mb-6 bg-[#151619]/60 p-2.5 rounded-xl border border-white/5 overflow-x-auto">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest pl-2 pr-4">Filter by Label:</span>
        <button
          onClick={() => setSelectedFilterLabel('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            selectedFilterLabel === ''
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          All Matters
        </button>
        {['Urgent', 'High Profile', 'Confidential', 'Pro Bono', 'In-House'].map(lbl => {
          const isSelected = selectedFilterLabel === lbl;
          let colorCls = '';
          if (lbl === 'Urgent') colorCls = isSelected ? 'bg-red-500/25 text-red-400 border border-red-500/40' : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10';
          else if (lbl === 'High Profile') colorCls = isSelected ? 'bg-orange-500/25 text-orange-400 border border-orange-500/40' : 'text-slate-400 hover:text-orange-400 hover:bg-orange-500/10';
          else if (lbl === 'Confidential') colorCls = isSelected ? 'bg-purple-500/25 text-purple-400 border border-purple-500/40' : 'text-slate-400 hover:text-purple-400 hover:bg-purple-500/10';
          else if (lbl === 'Pro Bono') colorCls = isSelected ? 'bg-blue-500/25 text-blue-400 border border-blue-500/40' : 'text-slate-400 hover:text-blue-400 hover:bg-blue-500/10';
          else if (lbl === 'In-House') colorCls = isSelected ? 'bg-teal-500/25 text-teal-400 border border-teal-500/40' : 'text-slate-400 hover:text-teal-400 hover:bg-teal-500/10';

          return (
            <button
              key={lbl}
              onClick={() => setSelectedFilterLabel(lbl)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${colorCls} ${
                !isSelected ? 'border-transparent' : ''
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#151619] border border-white/10 rounded-xl p-8 w-full max-w-3xl my-8">
            <h2 className="text-2xl font-light text-white mb-6">Open New Matter</h2>
            <form onSubmit={handleCreate} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Claimants</label>
                  {claimants.map((c, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                       <input 
                         required={i === 0}
                         type="text" 
                         value={c} 
                         onChange={e => {
                           const newC = [...claimants];
                           newC[i] = e.target.value;
                           setClaimants(newC);
                         }} 
                         className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" 
                       />
                       {i > 0 && <button type="button" onClick={() => setClaimants(claimants.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 px-2"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => setClaimants([...claimants, ''])} className="text-emerald-500 hover:text-emerald-400 text-xs font-medium flex items-center gap-1 mt-1"><Plus className="w-3 h-3" /> Add Claimant</button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Defendants</label>
                  {defendants.map((d, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                       <input 
                         required={i === 0}
                         type="text" 
                         value={d} 
                         onChange={e => {
                           const newD = [...defendants];
                           newD[i] = e.target.value;
                           setDefendants(newD);
                         }} 
                         className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" 
                       />
                       {i > 0 && <button type="button" onClick={() => setDefendants(defendants.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 px-2"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => setDefendants([...defendants, ''])} className="text-emerald-500 hover:text-emerald-400 text-xs font-medium flex items-center gap-1 mt-1"><Plus className="w-3 h-3" /> Add Defendant</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Case Number</label>
                  <input type="text" value={newForm.case_number} onChange={e => setNewForm({...newForm, case_number: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Title Generation</label>
                  <select value={titleMode} onChange={e => setTitleMode(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                    <option value="auto">Auto (Claimant vs Defendant)</option>
                    <option value="claimant">Claimant Only</option>
                    <option value="defendant">Defendant Only</option>
                    <option value="custom">Custom Title</option>
                  </select>
                </div>
              </div>
              
              {titleMode === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Custom Matter Title</label>
                  <input type="text" placeholder="Enter custom title" value={newForm.title} onChange={e => setNewForm({...newForm, title: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nature of Claim</label>
                  <input type="text" value={newForm.nature_of_claim} onChange={e => setNewForm({...newForm, nature_of_claim: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cause of Action</label>
                  <input type="text" value={newForm.cause_of_action} onChange={e => setNewForm({...newForm, cause_of_action: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Relief Sought</label>
                  <input type="text" value={newForm.relief_sought} onChange={e => setNewForm({...newForm, relief_sought: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Counterclaim</label>
                  <input type="text" value={newForm.counterclaim} onChange={e => setNewForm({...newForm, counterclaim: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount Claimed</label>
                  <input type="number" value={newForm.amount_claimed || ''} onChange={e => setNewForm({...newForm, amount_claimed: Number(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Opposing Counsel</label>
                  <input type="text" value={newForm.opposing_counsel} onChange={e => setNewForm({...newForm, opposing_counsel: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Court</label>
                  <select value={newForm.court} onChange={e => setNewForm({...newForm, court: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                    {COURTS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {newForm.court === 'Other' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Specify Court</label>
                    <input type="text" value={newForm.specific_court_other} onChange={e => setNewForm({...newForm, specific_court_other: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registry Court</label>
                  <input type="text" value={newForm.registry_court} onChange={e => setNewForm({...newForm, registry_court: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Division</label>
                  <input type="text" value={newForm.division} onChange={e => setNewForm({...newForm, division: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registry</label>
                  <input type="text" value={newForm.registry} onChange={e => setNewForm({...newForm, registry: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Associated Companies</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Acme Corp, Lexis Ltd" 
                    value={newForm.companies} 
                    onChange={e => setNewForm({...newForm, companies: e.target.value})} 
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white placeholder-slate-600" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Directors Involved</label>
                  <input 
                    type="text" 
                    placeholder="e.g. John Doe, Sarah Jenkins" 
                    value={newForm.directors} 
                    onChange={e => setNewForm({...newForm, directors: e.target.value})} 
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white placeholder-slate-600" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Judge / Magistrate Name</label>
                  <input type="text" value={newForm.judge_name} onChange={e => setNewForm({...newForm, judge_name: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                  <select value={newForm.status} onChange={e => setNewForm({...newForm, status: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                    <option>Active</option>
                    <option>Pending</option>
                    <option>Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Matter Labels (Classification)</label>
                <div className="flex flex-wrap gap-2">
                  {['Urgent', 'High Profile', 'Confidential', 'Pro Bono', 'In-House'].map(lbl => {
                    const isSelected = selectedLabels.includes(lbl);
                    return (
                      <button
                        type="button"
                        key={lbl}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedLabels(selectedLabels.filter(x => x !== lbl));
                          } else {
                            setSelectedLabels([...selectedLabels, lbl]);
                          }
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
                <textarea rows={3} value={newForm.brief_facts} onChange={e => setNewForm({...newForm, brief_facts: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white"></textarea>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-400 hover:text-white font-medium" disabled={checkingConflict}>Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium shadow-lg flex items-center gap-2" disabled={checkingConflict}>
                  {checkingConflict ? "Analyzing Conflicts..." : "Save Matter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Conflict of Interest Warnings Modal */}
      {showConflictModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 font-poppins">
          <div className="bg-[#151619] border-2 border-amber-500/40 rounded-2xl p-8 w-full max-w-xl shadow-2xl shadow-amber-950/20">
            <div className="flex items-center gap-3 border-b border-amber-500/10 pb-4 mb-4">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                ⚠️
              </div>
              <div>
                <h2 className="text-xl font-semibold text-amber-500">Conflict of Interest Detected</h2>
                <p className="text-xs text-slate-400">Automated pre-registration clearance scan results.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              The conflict check database scanner detected potential matches. Before launching this new case, review the reasons below to satisfy professional responsibility directives:
            </p>

            <div className="bg-[#0a0a0a] rounded-xl border border-white/5 p-4 space-y-2.5 max-h-48 overflow-y-auto">
              {conflictWarnings.map((reason, i) => (
                <div key={i} className="text-xs text-amber-300 flex items-start gap-2 leading-relaxed">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 my-5">
              <p className="text-xs text-amber-400 font-semibold leading-relaxed">
                Clearance Directive: Open this matter only if professional clearance has been formally verified or a client consent waiver has been signed.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowConflictModal(false);
                  setConflictWarnings([]);
                }}
                className="w-1/2 bg-[#202124] hover:bg-[#2c2d30] border border-white/5 text-slate-300 py-3 rounded-xl text-xs font-semibold transition-all"
              >
                Cancel & Re-verify
              </button>
              <button
                type="button"
                onClick={() => {
                  const validClaimants = claimants.filter(c => c.trim() !== '');
                  const validDefendants = defendants.filter(d => d.trim() !== '');
                  executeCreate(
                    validClaimants.join(', ') || 'Unknown',
                    validDefendants.join(', ') || 'Unknown'
                  );
                }}
                className="w-1/2 bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl text-xs font-semibold transition-all shadow-lg"
              >
                Bypass & Force Create
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-emerald-500">Loading cases...</div>
      ) : (
        <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-lg overflow-hidden flex-1 flex flex-col">
          <table className="w-full text-left">
            <thead className="bg-[#1a1c20] border-b border-white/5">
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4 font-semibold">Matter Title</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Stage</th>
                <th className="px-6 py-4 font-semibold">Court</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group" onClick={() => navigate(`/cases/${c.id}`)}>
                  <td className="px-6 py-4 text-sm text-white font-medium group-hover:text-emerald-400 transition-colors">
                    <div>
                      <div>{c.title}</div>
                      {c.labels && c.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.labels.map(l => (
                            <span key={l} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getLabelStyle(l)}`}>
                              {l}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-400">
                    <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-white/5 text-slate-400">{c.status || 'Active'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-emerald-400">{c.stage || 'Client Consultation'}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{c.court || 'Unknown Court'}</td>
                  <td className="px-6 py-4 text-sm text-right flex justify-end gap-2">
                    <button className="text-emerald-500 hover:text-emerald-400 font-medium px-3 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-xs">Open Case</button>
                    <button onClick={(e) => handleDelete(e, c.id)} className="text-red-500 hover:text-red-400 p-1.5 rounded border border-red-500/20 bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500 border border-dashed border-white/10 m-4 rounded-lg">No cases found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
