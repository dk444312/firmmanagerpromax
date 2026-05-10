import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { Clock, Download, Filter, Plus, FileText, CheckCircle, AlertCircle, Search, Trash, Edit, X, Calendar } from 'lucide-react';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

type FilingLog = {
  id: string;
  date: string;
  staff_name: string;
  document: string;
  hours: number;
  rate_mwk: number;
  case_id?: string;
  case_title?: string;
  file_id?: string;
};

type FirmFile = { 
  id: string; 
  filename: string; 
  file_url: string; 
  folder_id: string; 
  created_at: string; 
  case_id?: string; 
  case_title?: string; 
  pending_filing?: boolean 
};

export default function Filing() {
  const { token, user } = useAuth();
  const location = useLocation();
  
  const [logs, setLogs] = useState<FilingLog[]>([]);
  const [pendingFiles, setPendingFiles] = useState<FirmFile[]>([]);
  const [filedFiles, setFiledFiles] = useState<FirmFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [newLog, setNewLog] = useState({ 
    id: '',
    date: new Date().toISOString().split('T')[0], 
    document: '', 
    hours: 1, 
    rate_mwk: 50000, 
    case_id: '',
    case_title: '',
    file_id: ''
  });

  useEffect(() => {
    if (location.state && (location.state as any).logNow) {
      const s = location.state as any;
      setNewLog({
        id: '',
        date: new Date().toISOString().split('T')[0],
        document: s.document || '',
        hours: 1,
        rate_mwk: 50000,
        case_id: s.case_id || '',
        case_title: s.case_title || '',
        file_id: s.file_id || ''
      });
      if (s.case_id) fetchFilesForCase(s.case_id);
      setIsAdding(true);
      // Clear state after reading it
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [search, setSearch] = useState('');
  const [filterPeriod, setFilterPeriod] = useState<'All' | 'Today' | 'This Week' | 'Last Month'>('All');
  const [specificDate, setSpecificDate] = useState('');
  const [caseFiles, setCaseFiles] = useState<FirmFile[]>([]);
  const [serviceCharges, setServiceCharges] = useState<Record<string, string>>({});

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const [filesRes, logsRes] = await Promise.all([
        supabase.from('files').select('*').eq('firm_id', user.firm_id),
        supabase.from('filing_logs').select('*').eq('firm_id', user.firm_id)
      ]);
      const fileData = filesRes.data || [];
      const logData = logsRes.data || [];
      
      if (Array.isArray(fileData)) {
        setPendingFiles(fileData.filter(f => f.pending_filing === true));
        setFiledFiles(fileData.filter(f => f.pending_filing === false && logData.some(l => l.file_id === f.id)));
      }
      if (Array.isArray(logData)) {
        setLogs(logData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilesForCase = async (caseId: string) => {
    if (!token || !supabase || !user || !caseId) return;
    try {
      const res = await supabase.from('files').select('*').eq('firm_id', user.firm_id);
      if (res.data) {
        setCaseFiles(res.data.filter(f => f.case_id === caseId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  const handleToggleFiling = async (file: FirmFile) => {
    if (!token || !supabase || !user) return;
    
    // Auto log the filing
    const charge = parseFloat(serviceCharges[file.id]) || 0;
    
    await supabase.from('files').update({ pending_filing: false }).eq('id', file.id);

    const payload = {
      date: new Date().toISOString().split('T')[0],
      staff_name: user.full_name || user.role || 'Staff',
      document: file.filename,
      hours: 1,
      rate_mwk: charge,
      case_id: file.case_id || null,
      case_title: file.case_title || null,
      file_id: file.id,
      firm_id: user.firm_id
    };
    await supabase.from('filing_logs').insert([payload]);
    
    setServiceCharges(prev => {
      const next = { ...prev };
      delete next[file.id];
      return next;
    });

    fetchData();
  };

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;

    const payload = { ...newLog, hours: 1 } as any;
    if (!payload.case_id) {
       payload.case_id = null;
       payload.case_title = null;
    }
    if (!payload.file_id) payload.file_id = null;

    let success = false;
    if (isEditing) {
      const { error } = await supabase.from('filing_logs').update(payload).eq('id', newLog.id);
      success = !error;
    } else {
      delete payload.id;
      const { error } = await supabase.from('filing_logs').insert([{ ...payload, firm_id: user.firm_id }]);
      success = !error;
      
      if (success && payload.file_id && payload.file_id !== 'custom') {
        // Also move it to Filed Documents
        await supabase.from('files').update({ pending_filing: false }).eq('id', payload.file_id);
      }
    }

    if (success) {
      setIsAdding(false);
      setIsEditing(false);
      setNewLog({ 
        id: '',
        date: new Date().toISOString().split('T')[0], 
        document: '', 
        hours: 0.5, 
        rate_mwk: 50000, 
        case_id: '',
        case_title: '',
        file_id: ''
      });
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !supabase || !confirm("Delete this log entry?")) return;
    await supabase.from('filing_logs').delete().eq('id', id);
    fetchData();
  };

  const handleEdit = (log: FilingLog) => {
    setNewLog({
      id: log.id,
      date: log.date,
      document: log.document,
      hours: log.hours,
      rate_mwk: log.rate_mwk,
      case_id: log.case_id || '',
      case_title: log.case_title || '',
      file_id: log.file_id || ''
    });
    if (log.case_id) fetchFilesForCase(log.case_id);
    setIsEditing(true);
    setIsAdding(true);
  };

  const filteredLogs = logs.filter(log => {
    // Search
    const matchesSearch = 
      (log.case_title || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.document || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.staff_name || '').toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    // Period filter
    const logDate = new Date(log.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (specificDate && log.date === specificDate) return true;
    if (specificDate) return false;

    if (filterPeriod === 'Today') {
      return log.date === today.toISOString().split('T')[0];
    }
    if (filterPeriod === 'This Week') {
      const weekAgo = new Date();
      weekAgo.setDate(today.getDate() - 7);
      return logDate >= weekAgo;
    }
    if (filterPeriod === 'Last Month') {
      const monthAgo = new Date();
      monthAgo.setMonth(today.getMonth() - 1);
      return logDate >= monthAgo;
    }
    return true;
  });

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      alert("No data to export.");
      return;
    }
    
    const headers = ["Date", "Matter", "Document", "Staff Member", "Fee (MWK)"];
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => [
        log.date,
        `"${log.case_title || 'N/A'}"`,
        `"${log.document}"`,
        `"${log.staff_name}"`,
        log.rate_mwk
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `filing_report_${filterPeriod}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-10 max-w-6xl mx-auto h-full flex flex-col">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight flex items-center gap-3">
            <Clock className="w-8 h-8 text-blue-500" />
            Filing Workspace
          </h1>
          <p className="text-slate-400 mt-2">Manage filing status and service fees.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search matters, docs..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[#151619] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-emerald-500 transition-colors w-64"
            />
          </div>
          <button onClick={handleExport} className="bg-[#151619] border border-white/10 hover:bg-[#1a1c20] transition-colors text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Report
          </button>
          <button onClick={() => { setIsEditing(false); setIsAdding(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/10">
            <Plus className="w-4 h-4" /> Log Filing
          </button>
        </div>
      </header>
      
      {/* Pending Files Section */}
      <section className="mb-12">
        <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          Pending Filing Queue
        </h2>
        
        {loading ? (
          <div className="text-slate-500 text-sm">Loading queue...</div>
        ) : pendingFiles.length === 0 ? (
          <div className="bg-[#151619] border border-dashed border-white/10 rounded-xl p-8 text-center text-slate-500 italic">
            Your queue is clear. All documents have been filed.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingFiles.map(file => (
              <div key={file.id} className="bg-[#151619] border border-white/10 rounded-xl p-5 hover:border-emerald-500/30 transition-all group relative overflow-hidden flex flex-col justify-between">
                <div className="flex items-start justify-between mb-6 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-emerald-500/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <button 
                        onClick={() => { if(file.file_url && file.file_url !== '#') window.open(file.file_url, '_blank'); else alert('No file attached.'); }}
                        className="text-sm font-medium text-white truncate max-w-[150px] hover:text-emerald-400 hover:underline text-left transition-colors"
                      >
                        {file.filename}
                      </button>
                      <p className="text-[10px] text-slate-500">Added {new Date(file.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
                
                <div className="relative z-10 pt-4 border-t border-white/5 mt-auto">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Service Charge Fee (MWK)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0"
                      value={serviceCharges[file.id] || ''}
                      onChange={e => setServiceCharges({...serviceCharges, [file.id]: e.target.value})}
                      className="flex-1 bg-[#0a0a0a] border border-white/10 rounded py-1.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button 
                      onClick={() => handleToggleFiling(file)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center shadow-lg"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {file.case_title && (
                  <div className="text-[10px] text-slate-400 bg-white/5 inline-block px-2 py-0.5 rounded border border-white/5 absolute top-2 right-2 z-10">
                    Matter: {file.case_title}
                  </div>
                )}
                {/* Background Decoration */}
                <div className="absolute top-10 right-0 p-2 opacity-5 pointer-events-none">
                  <FileText className="w-20 h-20" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filed Files Section */}
      <section className="mb-12">
        <h2 className="text-xl font-medium text-white mb-6 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
          Filed Documents
        </h2>
        
        {loading ? (
          <div className="text-slate-500 text-sm">Loading filed documents...</div>
        ) : filedFiles.length === 0 ? (
          <div className="bg-[#151619] border border-dashed border-white/10 rounded-xl p-8 text-center text-slate-500 italic">
            No filed documents found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filedFiles.map(file => {
              const alreadyLogged = logs.some(l => l.file_id === file.id);
              return (
                <div key={file.id} className="bg-[#151619] border border-white/10 rounded-xl p-5 hover:border-emerald-500/30 transition-all group relative overflow-hidden">
                  <div className="flex items-start justify-between mb-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-emerald-500/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <button 
                          onClick={() => { if(file.file_url && file.file_url !== '#') window.open(file.file_url, '_blank'); else alert('No file attached.'); }}
                          className="text-sm font-medium text-white truncate max-w-[150px] hover:text-emerald-400 hover:underline text-left transition-colors"
                        >
                          {file.filename}
                        </button>
                        <p className="text-[10px] text-slate-500 font-mono">Filed {new Date(file.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {alreadyLogged ? (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 mt-3">
                        <CheckCircle className="w-3 h-3" /> Logged
                      </span>
                    ) : null}
                  </div>
                  {file.case_title && (
                    <div className="text-[10px] text-slate-400 bg-white/5 inline-block px-2 py-0.5 rounded border border-white/5 relative z-10">
                      Matter: {file.case_title}
                    </div>
                  )}
                  <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                    <CheckCircle className="w-20 h-20" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex-1 flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h2 className="text-xl font-medium text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Filing Fees Log
          </h2>
          
          <div className="flex items-center gap-2 bg-[#151619] p-1 rounded-lg border border-white/10">
            {(['All', 'Today', 'This Week', 'Last Month'] as const).map(p => (
              <button 
                key={p} 
                onClick={() => { setFilterPeriod(p); setSpecificDate(''); }}
                className={`px-3 py-1.5 rounded text-xs transition-all ${filterPeriod === p && !specificDate ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {p}
              </button>
            ))}
            <div className="h-4 w-px bg-white/10 mx-1" />
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input 
                type="date" 
                value={specificDate}
                onChange={e => setSpecificDate(e.target.value)}
                className="bg-transparent border-none text-xs text-white focus:outline-none pl-7 pr-2"
              />
            </div>
          </div>
        </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl relative">
            <button onClick={() => setIsAdding(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-light text-white mb-6">{isEditing ? 'Edit Log Entry' : 'Log Filing Fee'}</h2>
            <form onSubmit={handleSaveLog} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Matter / Case</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm min-h-[44px] flex items-center overflow-hidden">
                    <span className="truncate">{newLog.case_title || <span className="text-slate-600 italic font-normal tracking-wide">Click select to choose matter...</span>}</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setIsSelectingCase(true)} 
                    className="px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 active:scale-95 whitespace-nowrap"
                  >
                    SELECT
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date</label>
                  <input required type="date" value={newLog.date} onChange={e => setNewLog({...newLog, date: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm focus:border-blue-500/50 outline-none transition-colors" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Document / Filing Name</label>
                {newLog.case_id ? (
                  <select 
                    value={newLog.file_id} 
                    onChange={e => {
                      const file = caseFiles.find(f => f.id === e.target.value);
                      setNewLog({ ...newLog, file_id: e.target.value, document: file?.filename || '' });
                    }} 
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm focus:border-blue-500/50 outline-none transition-colors"
                  >
                    <option value="">-- Select from Matter Files --</option>
                    {caseFiles.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                    <option value="custom">-- Custom Name --</option>
                  </select>
                ) : (
                  <input required type="text" placeholder="Enter document name..." value={newLog.document} onChange={e => setNewLog({...newLog, document: e.target.value, file_id: ''})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm focus:border-blue-500/50 outline-none transition-colors" />
                )}
                {newLog.file_id === 'custom' && (
                  <input required type="text" placeholder="Enter custom filing name..." value={newLog.document} onChange={e => setNewLog({...newLog, document: e.target.value})} className="mt-3 w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm animate-in fade-in slide-in-from-top-1" />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Service Charge Fee (MWK)</label>
                <input required type="number" value={newLog.rate_mwk} onChange={e => setNewLog({...newLog, rate_mwk: parseInt(e.target.value)})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm focus:border-blue-500/50 outline-none transition-colors" />
              </div>

              <div className="bg-[#0a0a0a] p-4 rounded-xl border border-white/5 flex justify-between items-center">
                <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">Total Billable</span>
                <span className="text-xl font-light text-emerald-500">MWK {newLog.rate_mwk.toLocaleString()}</span>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-medium transition-colors">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-emerald-600/10 transition-all">
                  {isEditing ? 'Update Log' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSelectingCase && (
        <CaseSelectorModal 
          onClose={() => setIsSelectingCase(false)}
          onSelect={(id, title) => {
            setNewLog({ ...newLog, case_id: id, case_title: title, file_id: '', document: '' });
            fetchFilesForCase(id);
            setIsSelectingCase(false);
          }}
        />
      )}

      <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/5 border-b border-white/5">
              <tr className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 font-bold">
                <th className="px-8 py-5">Date</th>
                <th className="px-8 py-5">Matter & Document</th>
                <th className="px-8 py-5">Staff Member</th>
                <th className="px-8 py-5 text-right">Fee (MWK)</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-8 py-6 text-sm text-slate-400 font-mono">
                    {new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-sm font-medium text-white mb-1">{log.case_title || 'General Filing'}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" /> {log.document}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-bold uppercase">
                        {log.staff_name.charAt(0)}
                      </div>
                      <span className="text-sm text-slate-300">{log.staff_name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-sm font-bold text-emerald-400 text-right">{log.rate_mwk.toLocaleString()}</td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(log)} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(log.id)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Clock className="w-10 h-10 text-slate-700" />
                      <p className="text-slate-500 text-sm">No log entries match your filters.</p>
                      <button 
                        onClick={() => { setSearch(''); setFilterPeriod('All'); setSpecificDate(''); }}
                        className="text-xs text-emerald-500 hover:underline"
                      >
                        Reset all filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer with totals */}
        {filteredLogs.length > 0 && (
          <div className="bg-white/5 border-t border-white/5 px-8 py-4 flex justify-between items-center">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">
              Showing {filteredLogs.length} entries
            </div>
            <div className="flex gap-10">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total Value</span>
                <span className="text-lg font-bold text-emerald-500">MWK {filteredLogs.reduce((sum, l) => sum + l.rate_mwk, 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      </section>
    </div>
  );
}
