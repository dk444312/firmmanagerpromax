import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ShieldCheck, Search, Filter, RefreshCw, Eye, Calendar, Laptop, Globe, Server } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuditTrail() {
  const { token, user } = { token: useAuth().token, user: useAuth().user };
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter criteria
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchAuditLogs = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/audit_logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
        setFilteredLogs(data);
      } else {
        toast.error("Failed to fetch security audit trail");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error loading system logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [token]);

  // Apply filtering whenever terms change
  useEffect(() => {
    let result = logs;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(l => 
        (l.staff_name || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q) ||
        (l.ip_address || '').toLowerCase().includes(q)
      );
    }

    if (selectedStaff) {
      result = result.filter(l => l.staff_id === selectedStaff || l.staff_name === selectedStaff);
    }

    if (selectedAction) {
      result = result.filter(l => l.action === selectedAction);
    }

    setFilteredLogs(result);
  }, [searchTerm, selectedStaff, selectedAction, logs]);

  // Parse User Agent string to friendly device type
  const getFriendlyDevice = (ua: string) => {
    if (!ua) return "Unknown";
    const lowercase = ua.toLowerCase();
    if (lowercase.includes('iphone') || lowercase.includes('ipad')) return 'iOS Mobile/Tablet';
    if (lowercase.includes('android')) return 'Android Mobile';
    if (lowercase.includes('macintosh')) return 'macOS Workstation';
    if (lowercase.includes('windows')) return 'Windows PC';
    if (lowercase.includes('linux')) return 'Linux Workstation';
    return 'Generic Client';
  };

  const getUniqueActions = () => {
    const actions = logs.map(l => l.action).filter(Boolean);
    return Array.from(new Set(actions));
  };

  const getUniqueStaff = () => {
    const staff = logs.map(l => l.staff_name).filter(Boolean);
    return Array.from(new Set(staff));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-poppins">
      
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
            Immutable Audit Trail
          </h1>
          <p className="text-slate-400 text-sm mt-1">Permanently records every key operation, diagnostic log, and permission change. These logs cannot be updated or deleted.</p>
        </div>
        <button
          onClick={fetchAuditLogs}
          className="flex items-center gap-2 bg-[#1a1c20] hover:bg-[#26282d] text-slate-300 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/5 transition-all self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Logs
        </button>
      </div>

      {/* Filter panel */}
      <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Search Logs</label>
          <div className="relative">
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search keyword, staff, IP, or details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">By Team Member</label>
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">-- All Active Staff --</option>
            {getUniqueStaff().map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">By Action Type</label>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">-- All Action Types --</option>
            {getUniqueActions().map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main logs display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Logs Table column */}
        <div className="lg:col-span-2 bg-[#151619] rounded-2xl border border-white/5 shadow-xl p-6 overflow-hidden">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Security Activity log</h3>
          
          {loading ? (
            <div className="text-center py-20 text-slate-400">Filtering security logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-20 text-slate-500 italic text-sm bg-[#0a0a0a] rounded-xl border border-white/5">
              No matching diagnostic log entries located.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Timestamp</th>
                    <th className="pb-3">User</th>
                    <th className="pb-3">Action</th>
                    <th className="pb-3">IP Address</th>
                    <th className="pb-3 text-right pr-2">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredLogs.map(l => (
                    <tr 
                      key={l.id} 
                      className={`hover:bg-[#1c1d22]/50 transition-colors cursor-pointer ${selectedLog?.id === l.id ? 'bg-[#26282d]/50 border-l-2 border-emerald-500' : ''}`}
                      onClick={() => setSelectedLog(l)}
                    >
                      <td className="py-3 pl-2 font-mono text-slate-500">
                        {new Date(l.created_at).toLocaleDateString()} {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-3 font-semibold text-white">
                        {l.staff_name}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          l.action === 'Login Success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                          l.action === 'Conflict Check Performed' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                          l.action === 'Time Recorded' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                          l.action === 'Generated Analytics Report' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                          'bg-slate-500/10 border-slate-500/20 text-slate-400'
                        }`}>
                          {l.action}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-slate-400">
                        {l.ip_address}
                      </td>
                      <td className="py-3 text-right pr-2">
                        <button className="p-1 hover:bg-[#26282d] rounded text-slate-400 hover:text-white transition-all">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Log Metadata Panel */}
        <div className="lg:col-span-1">
          {selectedLog ? (
            <div className="bg-[#151619] rounded-2xl border border-white/5 p-6 shadow-xl space-y-6 sticky top-8">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h3 className="text-base font-semibold text-white tracking-wide">Inspection Vault</h3>
                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Verified
                </span>
              </div>

              <div className="space-y-4 text-sm leading-relaxed">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-blue-400" /> Action Event
                  </span>
                  <span className="text-white font-semibold block text-base bg-[#0a0a0a] p-2.5 rounded-lg border border-white/5">
                    {selectedLog.action}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-purple-400" /> Contextual Details
                  </span>
                  <p className="text-slate-300 bg-[#0a0a0a] p-3 rounded-lg border border-white/5 whitespace-pre-wrap text-xs font-medium leading-relaxed">
                    {selectedLog.details || "No supplementary parameters registered."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 bg-[#0a0a0a] p-3 rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Globe className="w-3 h-3 text-emerald-400" /> IP Host
                    </span>
                    <span className="font-mono text-xs text-white block truncate">{selectedLog.ip_address}</span>
                  </div>
                  <div className="space-y-1 bg-[#0a0a0a] p-3 rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Laptop className="w-3 h-3 text-amber-400" /> Device / Client
                    </span>
                    <span className="text-xs text-white block truncate font-medium">{getFriendlyDevice(selectedLog.user_agent)}</span>
                  </div>
                </div>

                <div className="space-y-1 bg-[#0a0a0a] p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" /> Logged Timestamp
                  </span>
                  <span className="font-mono text-xs text-white block">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="space-y-1 bg-[#0a0a0a] p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Server className="w-3 h-3 text-rose-400" /> Immutable Record ID
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 block select-all">
                    {selectedLog.id}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#151619]/40 rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500 text-sm italic flex flex-col items-center justify-center h-64 sticky top-8">
              <Eye className="w-8 h-8 text-slate-600 mb-2" />
              Select an action entry on the log list to inspect full security metadata.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
