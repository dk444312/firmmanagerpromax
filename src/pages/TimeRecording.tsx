import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Clock, Play, Square, FileText, CheckCircle2, ChevronRight, Briefcase, Trash2, Calendar, User, Search, RefreshCw, Layers } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TimeRecording() {
  const { token, user } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Timer State
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Form State for saving the record
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [natureOfWork, setNatureOfWork] = useState('Drafting');
  const [description, setDescription] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [entryMode, setEntryMode] = useState<'timer' | 'manual'>('timer');

  const natures = [
    'Drafting',
    'Legal Research',
    'Court Attendance',
    'Consultations',
    'Travelling',
    'Telephone Calls',
    'Other'
  ];

  const fetchRecordsAndCases = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [recordsRes, casesRes] = await Promise.all([
        fetch('/api/time_records', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/cases', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (recordsRes.ok) {
        const data = await recordsRes.json();
        setRecords(data);
      }
      if (casesRes.ok) {
        const data = await casesRes.json();
        setCases(data);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load time tracking data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordsAndCases();
  }, [token]);

  // Start / Stop Timer logic
  useEffect(() => {
    if (isRunning) {
      const startTime = Date.now() - seconds * 1000;
      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning]);

  const handleStartTimer = () => {
    setIsRunning(true);
    toast.success("Stopwatch active. Recording time...");
  };

  const handleStopTimer = () => {
    setIsRunning(false);
    toast.success("Timer paused. Ready to log your session.");
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    setSeconds(0);
    toast.success("Timer reset");
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    let finalDurationSeconds = 0;
    if (entryMode === 'timer') {
      finalDurationSeconds = seconds;
      if (finalDurationSeconds < 5) {
        toast.error("Duration must be at least 5 seconds to log");
        return;
      }
    } else {
      const hrs = parseInt(manualHours || '0', 10);
      const mins = parseInt(manualMinutes || '0', 10);
      finalDurationSeconds = (hrs * 3600) + (mins * 60);
      if (finalDurationSeconds <= 0) {
        toast.error("Please enter a valid manual duration");
        return;
      }
    }

    const caseObj = cases.find(c => c.id === selectedCaseId);

    try {
      setSubmitting(true);
      const res = await fetch('/api/time_records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          case_id: selectedCaseId || null,
          case_title: caseObj ? caseObj.title : '',
          duration_seconds: finalDurationSeconds,
          nature_of_work: natureOfWork,
          description: description
        })
      });

      if (res.ok) {
        const saved = await res.json();
        setRecords(prev => [saved, ...prev]);
        toast.success("Time record logged successfully!");
        
        // Reset state
        setSeconds(0);
        setDescription('');
        setSelectedCaseId('');
        setManualHours('');
        setManualMinutes('');
        setNatureOfWork('Drafting');
      } else {
        toast.error("Failed to save time record");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while logging time");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Are you sure you want to permanently delete this time record?")) return;

    try {
      const res = await fetch(`/api/time_records/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setRecords(prev => prev.filter(r => r.id !== id));
        toast.success("Time log deleted");
      } else {
        toast.error("Failed to delete record");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error deleting time record");
    }
  };

  // Helper formatting seconds to HH:MM:SS
  const formatTime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  const formatHoursReadable = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    if (hrs > 0) {
      return `${hrs} hr ${mins} min`;
    }
    return `${mins} min`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-poppins">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-wide flex items-center gap-2">
            <Clock className="w-8 h-8 text-emerald-500" />
            Built-in Time Recording
          </h1>
          <p className="text-slate-400 text-sm mt-1">Accurately record and classify billable and non-billable legal hours for future invoices and performance metrics.</p>
        </div>
        <div className="flex bg-[#1a1c20] p-1.5 rounded-xl border border-white/5 self-start">
          <button
            onClick={() => setEntryMode('timer')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${entryMode === 'timer' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            ⏱️ Stopwatch Timer
          </button>
          <button
            onClick={() => setEntryMode('manual')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${entryMode === 'manual' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            ✍️ Manual Hour Log
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Recording Engine */}
        <div className="lg:col-span-1 bg-[#151619] rounded-2xl border border-white/5 p-8 flex flex-col justify-between shadow-xl relative overflow-hidden h-fit">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>

          {entryMode === 'timer' ? (
            <div className="space-y-6 text-center">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Stopwatch</h3>
              
              <div className="relative py-8 flex items-center justify-center">
                <div className={`absolute w-44 h-44 rounded-full border-2 transition-all duration-1000 ${isRunning ? 'border-emerald-500/40 animate-ping scale-110' : 'border-white/5'}`}></div>
                <div className={`w-40 h-40 rounded-full bg-[#0a0a0a] border-2 flex flex-col items-center justify-center shadow-inner ${isRunning ? 'border-emerald-500 shadow-emerald-950/20' : 'border-white/10'}`}>
                  <span className="text-3xl font-mono font-bold text-white tracking-wider">{formatTime(seconds)}</span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 mt-1 tracking-widest">{isRunning ? 'Running' : 'Paused'}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                {!isRunning ? (
                  <button
                    onClick={handleStartTimer}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/30"
                  >
                    <Play className="w-4 h-4 fill-current" /> Start Timer
                  </button>
                ) : (
                  <button
                    onClick={handleStopTimer}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Square className="w-4 h-4 fill-current" /> Stop Timer
                  </button>
                )}
                <button
                  onClick={handleResetTimer}
                  disabled={seconds === 0}
                  className="bg-[#1a1c20] hover:bg-[#26282d] text-slate-300 py-3 px-4 rounded-xl text-sm font-semibold border border-white/5 disabled:opacity-40 transition-all"
                >
                  Reset
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Manual Time Entry</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Hours</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={manualHours}
                    onChange={(e) => setManualHours(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3 text-white text-center text-lg font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Minutes</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={manualMinutes}
                    onChange={(e) => setManualMinutes(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3 text-white text-center text-lg font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="bg-[#0a0a0a] p-4 rounded-xl border border-white/5 text-center">
                <span className="text-xs text-slate-400 block mb-1">Estimated Log Duration</span>
                <span className="text-xl font-mono font-bold text-emerald-400">
                  {formatHoursReadable((parseInt(manualHours || '0', 10) * 3600) + (parseInt(manualMinutes || '0', 10) * 60))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Logging Parameters */}
        <div className="lg:col-span-2 bg-[#151619] rounded-2xl border border-white/5 p-8 shadow-xl">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Matter Allocation & Work Details</h3>
          
          <form onSubmit={handleSaveRecord} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-blue-400" /> Case / Matter (Optional)
                </label>
                <select
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3.5 text-white focus:outline-none focus:border-emerald-500 text-sm cursor-pointer"
                >
                  <option value="">-- General Firm / Non-Allocated Work --</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.case_number ? `[${c.case_number}] ` : ''}{c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-purple-400" /> Nature of Work
                </label>
                <select
                  value={natureOfWork}
                  onChange={(e) => setNatureOfWork(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-3.5 text-white focus:outline-none focus:border-emerald-500 text-sm cursor-pointer"
                >
                  {natures.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-emerald-400" /> Session Summary & Notes
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your legal accomplishments or tasks completed (e.g. Drafted Statement of Claim, Reviewed opposing discovery requests...)"
                rows={4}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
              ></textarea>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting || (entryMode === 'timer' && seconds <= 0)}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm px-8 py-3 rounded-xl transition-all shadow-lg shadow-emerald-950/20"
              >
                {submitting ? 'Submitting...' : 'Log Time Record'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Section: Past Records Table */}
      <div className="bg-[#151619] rounded-2xl border border-white/5 shadow-xl p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white tracking-wide">Historical Time Log</h3>
            <p className="text-xs text-slate-400 mt-1">Audit log of hours submitted by firm lawyers.</p>
          </div>
          <button
            onClick={fetchRecordsAndCases}
            className="p-2 hover:bg-[#1a1c20] text-slate-400 hover:text-white rounded-lg border border-white/5 transition-colors"
            title="Refresh History"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-400">Loading historical logs...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 bg-[#0a0a0a] rounded-xl border border-white/5 text-slate-500 italic text-sm">
            No time sessions have been logged yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead>
                <tr className="border-b border-white/5 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-4">Staff Member</th>
                  <th className="pb-3">Case / Matter</th>
                  <th className="pb-3">Nature of Work</th>
                  <th className="pb-3">Duration</th>
                  <th className="pb-3">Notes & Summary</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-[#1c1d22]/50 transition-colors">
                    <td className="py-4 pl-4 font-semibold text-white flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                        {r.staff_name ? r.staff_name.substring(0, 2).toUpperCase() : 'LW'}
                      </div>
                      <span>{r.staff_name || 'Lawyer'}</span>
                    </td>
                    <td className="py-4 text-xs font-medium max-w-[200px] truncate">
                      {r.case_title ? (
                        <span className="text-slate-200">{r.case_title}</span>
                      ) : (
                        <span className="text-slate-500 italic">General Admin</span>
                      )}
                    </td>
                    <td className="py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        r.nature_of_work === 'Court Attendance' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                        r.nature_of_work === 'Legal Research' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                        r.nature_of_work === 'Drafting' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        r.nature_of_work === 'Consultations' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                        r.nature_of_work === 'Travelling' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                        'bg-slate-500/10 border-slate-500/20 text-slate-400'
                      }`}>
                        {r.nature_of_work}
                      </span>
                    </td>
                    <td className="py-4 font-mono font-bold text-white">
                      {formatHoursReadable(r.duration_seconds)}
                    </td>
                    <td className="py-4 text-xs max-w-[280px] truncate text-slate-400 leading-relaxed" title={r.description}>
                      {r.description || <span className="italic text-slate-600">No notes provided</span>}
                    </td>
                    <td className="py-4 text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 pr-4 text-right">
                      {user && (user.role === 'Managing Partner' || user.id === r.staff_id) && (
                        <button
                          onClick={() => handleDeleteRecord(r.id)}
                          className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded-lg transition-colors"
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
