import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Appointments() {
  const { user, token } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, client:clients(full_name), staff:staff(name)')
        .eq('firm_id', user?.firm_id)
        .order('date', { ascending: false });
        
      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      console.error('Error fetching appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update');
      const json = await res.json();
      
      setAppointments(appointments.map(a => a.id === id ? { ...a, status } : a));
      toast.success(`Appointment status updated to ${status}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Could not update status');
    }
  };

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-6 flex flex-col h-full">
      <div>
        <h1 className="text-3xl font-light text-white tracking-tight flex items-center gap-4">
          <Calendar className="w-8 h-8 text-emerald-500" />
          Appointments Matrix
        </h1>
        <p className="text-slate-400 mt-2 text-lg">Manage firm-wide client appointments and staff sync.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-10 text-emerald-500">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="bg-[#151619] border border-white/10 rounded-2xl shadow-xl flex items-center justify-center min-h-[300px]">
            <p className="text-slate-500">No appointments booked yet.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {appointments.map(a => (
              <div key={a.id} className="bg-[#151619] shadow-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col md:flex-row transition-all hover:bg-white/[0.02]">
                <div className="bg-[#101010] p-6 md:w-56 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-center">
                  <div className="flex items-center text-emerald-400 font-medium mb-3">
                     <Calendar className="w-4 h-4 mr-2 opacity-80" />
                     {new Date(a.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="flex items-center text-slate-400 text-sm">
                     <Clock className="w-4 h-4 mr-2 opacity-80" />
                     {a.time}
                  </div>
                </div>
                
                <div className="p-6 flex-1 flex flex-col justify-center">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-medium text-white mb-1">
                        Client: <span className="font-light">{a.client?.full_name || 'Unknown'}</span>
                      </h3>
                      <p className="text-sm text-slate-400 flex items-center gap-2">
                        Staff Assignment: <span className="text-slate-300 font-medium bg-white/5 px-2 py-0.5 rounded">{a.staff?.name || 'Unassigned'}</span>
                      </p>
                    </div>
                    <div>
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
                        a.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                        a.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {a.status}
                      </span>
                    </div>
                  </div>
                  <div className="bg-[#1a1c20] p-4 rounded-xl border border-white/5">
                     <p className="text-sm text-slate-300 leading-relaxed"><span className="text-slate-500 font-medium uppercase text-xs tracking-wider mr-2">Reason</span> {a.reason || 'No reason provided.'}</p>
                  </div>
                </div>

                <div className="p-6 md:w-48 border-t md:border-t-0 md:border-l border-white/5 flex flex-row md:flex-col gap-3 justify-center bg-[#1a1c20]">
                  {a.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => updateStatus(a.id, 'confirmed')}
                        className="flex-1 w-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" /> Confirm
                      </button>
                      <button 
                        onClick={() => updateStatus(a.id, 'cancelled')}
                        className="flex-1 w-full bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" /> Cancel
                      </button>
                    </>
                  )}
                  {a.status === 'confirmed' && (
                     <button 
                       onClick={() => updateStatus(a.id, 'cancelled')}
                       className="flex-1 w-full bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                     >
                       <XCircle className="w-4 h-4" /> Cancel
                     </button>
                  )}
                  {a.status === 'cancelled' && (
                     <div className="text-center text-sm font-medium text-slate-500 py-2 border border-dashed border-white/10 rounded-xl">
                       Cancelled
                     </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
