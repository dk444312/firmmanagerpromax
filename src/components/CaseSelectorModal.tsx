import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Search, X } from 'lucide-react';

export default function CaseSelectorModal({ onClose, onSelect }: { onClose: () => void, onSelect: (caseId: string, caseTitle: string) => void }) {
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-[#151619] border border-white/10 p-6 rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-medium text-white">Select a Case</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search cases..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {filtered.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-500">No cases found.</div>
          ) : (
            filtered.map(c => (
              <button 
                key={c.id} 
                onClick={() => onSelect(c.id, c.title)}
                className="w-full text-left bg-[#1a1c20] p-3 rounded-xl border border-white/5 hover:border-emerald-500/50 transition-colors group text-sm block"
              >
                <div className="text-white font-medium group-hover:text-emerald-400">{c.title}</div>
                <div className="text-xs text-slate-500 mt-1">{c.case_number || 'N/A'}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
