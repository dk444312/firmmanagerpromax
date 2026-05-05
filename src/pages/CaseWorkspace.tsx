import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Search } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function CaseWorkspace() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch('/api/cases', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setCases(Array.isArray(data) ? data : []));
  }, [token]);

  const filtered = cases.filter(c => c.title?.toLowerCase().includes(search.toLowerCase()) || c.case_number?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-10 max-w-5xl mx-auto h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl bg-[#151619] rounded-2xl border border-white/5 shadow-2xl p-8 flex flex-col">
        <div className="text-center mb-8">
          <Briefcase className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-3xl font-light text-white mb-2">Case Workspace</h2>
          <p className="text-slate-400">Select a matter to open its dedicated workspace.</p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search cases by title or number..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex-1 max-h-[400px] overflow-y-auto space-y-3 pr-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-500 border border-dashed border-white/10 rounded-xl">No cases found.</div>
          ) : (
            filtered.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-[#1a1c20] p-4 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors">
                <div>
                  <h3 className="text-white font-medium mb-1">{c.title}</h3>
                  <div className="text-xs text-slate-500">{c.case_number || 'N/A'} • {c.stage || 'Pre-trial'}</div>
                </div>
                <button 
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Open Case
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
