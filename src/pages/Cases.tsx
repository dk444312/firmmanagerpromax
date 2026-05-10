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

const DEFAULT_STAGES = ['Pre-trial', 'Discovery', 'Trial', 'Judgment', 'Closed'];
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
  
  const [isAdding, setIsAdding] = useState(false);
  const [titleMode, setTitleMode] = useState('auto'); // auto, claimant, defendant, custom
  const [newForm, setNewForm] = useState({
    title: '', description: '', case_number: '', 
    court: COURTS[0], specific_court_other: '', registry_court: '', judge_name: '', 
    brief_facts: '', status: 'Active', stage: 'Pre-trial'
  });
  const [claimants, setClaimants] = useState<string[]>(['']);
  const [defendants, setDefendants] = useState<string[]>(['']);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    
    const validClaimants = claimants.filter(c => c.trim() !== '');
    const validDefendants = defendants.filter(d => d.trim() !== '');
    const claimantStr = validClaimants.join(', ') || 'Unknown';
    const defendantStr = validDefendants.join(', ') || 'Unknown';

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
        assigned_staff_ids: [user.id]
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

      setCases([...cases, created]);
      setIsAdding(false);
      setTitleMode('auto');
      setNewForm({
        title: '', description: '', case_number: '', 
        court: COURTS[0], specific_court_other: '', registry_court: '', judge_name: '', 
        brief_facts: '', status: 'Active', stage: 'Pre-trial'
      });
      setClaimants(['']);
      setDefendants(['']);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!token || !supabase || !confirm("Delete this case? This will remove all associated logs and records.")) return;
    
    await supabase.from('cases').delete().eq('id', id);
    setCases(cases.filter(c => c.id !== id));
  };

  const filtered = cases.filter(c => 
    c.title?.toLowerCase().includes(search.toLowerCase()) || 
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

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
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Brief Facts / Description</label>
                <textarea rows={3} value={newForm.brief_facts} onChange={e => setNewForm({...newForm, brief_facts: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white"></textarea>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-400 hover:text-white font-medium">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium shadow-lg">Save Matter</button>
              </div>
            </form>
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
                  <td className="px-6 py-4 text-sm text-white font-medium group-hover:text-emerald-400 transition-colors">{c.title}</td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-400">
                    <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-white/5 text-slate-400">{c.status || 'Active'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-emerald-400">{c.stage || 'Pre-trial'}</td>
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
