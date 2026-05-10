import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { Users, Link as LinkIcon, Unlink, FileText, Calendar, Briefcase } from 'lucide-react';

export default function ManageClients() {
  const { token, user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const [clientsRes, casesRes] = await Promise.all([
        supabase.from('clients').select('*').eq('firm_id', user.firm_id),
        supabase.from('cases').select('*').eq('firm_id', user.firm_id)
      ]);
      setClients(clientsRes.data || []);
      setCases(casesRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  const handleLinkCase = async (caseId: string, clientId: string | null) => {
    if (!token || !supabase || !user) return;
    const { error } = await supabase.from('cases').update({ client_id: clientId }).eq('id', caseId);
    if (!error) {
      setCases(cases.map(c => c.id === caseId ? { ...c, client_id: clientId } : c));
    } else {
      console.error(error);
      alert("Failed to link case");
    }
  };

  const activeClient = clients.find(c => c.id === selectedClient);

  if (loading) return <div className="p-10 text-emerald-500">Loading manage clients...</div>;

  return (
    <div className="p-10 max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-10">
        <h1 className="text-4xl font-light text-white tracking-tight flex items-center gap-4">
          <LinkIcon className="w-8 h-8 text-blue-500" />
          Manage Clients Access
        </h1>
        <p className="text-slate-400 mt-2 text-lg">Link clients to cases so they can view files and events in the client portal.</p>
      </header>

      <div className="flex gap-8 flex-1 overflow-hidden">
         {/* Left Side: Client List */}
         <div className="w-1/3 bg-[#151619] border border-white/10 rounded-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-[#1a1c20]">
               <h2 className="text-lg font-medium text-white flex items-center gap-2">
                 <Users className="w-5 h-5 text-emerald-500"/> Select a Client
               </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
               {clients.map(c => (
                 <button
                   key={c.id}
                   onClick={() => setSelectedClient(c.id)}
                   className={`w-full text-left p-4 rounded-xl border transition-colors ${selectedClient === c.id ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[#0a0a0a] border-white/5 hover:border-white/10'}`}
                 >
                    <div className="font-medium text-white">{c.full_name}</div>
                    <div className="text-xs text-slate-500 mt-1">@{c.username}</div>
                 </button>
               ))}
               {clients.length === 0 && <div className="text-slate-500 text-center py-4 text-sm">No clients exist.</div>}
            </div>
         </div>

         {/* Right Side: Case Linking */}
         <div className="flex-1 bg-[#151619] border border-white/10 rounded-2xl flex flex-col overflow-hidden">
            {!activeClient ? (
               <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center p-8">
                  <LinkIcon className="w-16 h-16 mb-4 opacity-20" />
                  <p>Select a client from the left pane<br/>to manage their case assignments.</p>
               </div>
            ) : (
               <>
                  <div className="p-6 border-b border-white/10 bg-[#1a1c20] flex items-center justify-between">
                     <div>
                        <h2 className="text-xl font-medium text-white mb-1">{activeClient.full_name}</h2>
                        <span className="text-xs text-slate-400 capitalize px-2 py-0.5 rounded-full bg-white/5">Client Account</span>
                     </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                     <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                           <Briefcase className="w-4 h-4"/> Linked Matters
                        </h3>
                        <div className="space-y-3">
                           {cases.filter(c => c.client_id === activeClient.id).map(c => (
                              <div key={c.id} className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl flex items-center justify-between">
                                 <div>
                                    <div className="font-medium text-white">{c.title}</div>
                                    <div className="text-xs text-slate-400 mt-1">{c.case_number || 'No Case Number'} • {c.stage}</div>
                                    <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-4">
                                       <span className="flex items-center gap-1"><FileText className="w-3 h-3"/> Granted Files Access</span>
                                       <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> Granted Events Access</span>
                                    </div>
                                 </div>
                                 <button onClick={() => handleLinkCase(c.id, null)} className="px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                                    <Unlink className="w-3.5 h-3.5" /> Unlink
                                 </button>
                              </div>
                           ))}
                           {cases.filter(c => c.client_id === activeClient.id).length === 0 && (
                              <p className="text-sm text-slate-500 italic">No cases linked to this client yet.</p>
                           )}
                        </div>
                     </div>

                     <div className="h-px w-full bg-white/5" />

                     <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Available Matters</h3>
                        <div className="space-y-3">
                           {cases.filter(c => c.client_id !== activeClient.id).map(c => (
                              <div key={c.id} className="bg-[#0a0a0a] border border-white/5 p-4 rounded-xl flex items-center justify-between group">
                                 <div>
                                    <div className="font-medium text-slate-300">{c.title}</div>
                                    <div className="text-xs text-slate-500 mt-1">{c.case_number || 'No Case Number'} • {c.client_id ? 'Linked to another client' : 'Unlinked'}</div>
                                 </div>
                                 <button onClick={() => handleLinkCase(c.id, activeClient.id)} className="px-3 py-1.5 bg-[#262626] text-emerald-400 hover:bg-[#333] border border-transparent hover:border-emerald-500/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                    <LinkIcon className="w-3.5 h-3.5" /> Link Case
                                 </button>
                              </div>
                           ))}
                           {cases.filter(c => c.client_id !== activeClient.id).length === 0 && (
                              <p className="text-sm text-slate-500 italic">No available cases to link.</p>
                           )}
                        </div>
                     </div>
                  </div>
               </>
            )}
         </div>
      </div>
    </div>
  );
}
