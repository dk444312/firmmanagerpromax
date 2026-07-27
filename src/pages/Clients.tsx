import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Users, Plus, Search, Mail, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';

type Client = {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  gender: string;
  username: string;
  status: string;
};

export default function Clients() {
  const { token, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentClient, setCurrentClient] = useState({ id: '', full_name: '', phone_number: '', email: '', gender: 'Male', username: '', password: '' });

  const fetchClients = async () => {
    if (!token || !supabase || !user) return;
    const res = await supabase.from('clients').select('*').eq('firm_id', user.firm_id);
    setClients(res.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, [token, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') {
      openAddModal();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    
    let dbPayload = { ...currentClient };
    const rawPassword = dbPayload.password;
    delete (dbPayload as any).password;
    
    if (rawPassword) {
      (dbPayload as any).password_hash = await import('bcryptjs').then(m => m.hash(rawPassword, 10));
    }
    
    if (isEditing) {
      await supabase.from('clients').update(dbPayload).eq('id', currentClient.id);
    } else {
      const { id, ...dataToSend } = dbPayload;
      await supabase.from('clients').insert([{ ...dataToSend, firm_id: user.firm_id }]);
    }
    fetchClients();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!token || !supabase || !confirm("Delete this client?")) return;
    await supabase.from('clients').delete().eq('id', id);
    fetchClients();
    setIsModalOpen(false);
  };

  const openAddModal = () => {
    setCurrentClient({ id: '', full_name: '', phone_number: '', email: '', gender: 'Male', username: '', password: '' });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const openEditModal = (c: Client) => {
    setCurrentClient({ ...c, password: '' });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const filtered = clients.filter(c => (c.full_name || '').toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-10 max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight flex items-center gap-4">
            <Users className="w-8 h-8 text-blue-500" />
            Clients
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Manage client profiles and access.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} className="bg-[#151619] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 w-64" />
          </div>
          <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium tracking-wide flex items-center gap-2 transition-colors text-sm">
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      </header>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-medium text-white mb-4">{isEditing ? 'Edit Client Profile' : 'Add New Client'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                <input required type="text" value={currentClient.full_name} onChange={e => setCurrentClient({...currentClient, full_name: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email</label>
                  <input type="email" value={currentClient.email} onChange={e => setCurrentClient({...currentClient, email: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone</label>
                  <input type="text" value={currentClient.phone_number} onChange={e => setCurrentClient({...currentClient, phone_number: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Gender</label>
                <select value={currentClient.gender} onChange={e => setCurrentClient({...currentClient, gender: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white">
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <h3 className="text-sm font-medium text-slate-300 mt-6 mb-2 border-t border-white/10 pt-4">Portal Access</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Username</label>
                  <input required type="text" value={currentClient.username} onChange={e => setCurrentClient({...currentClient, username: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password {isEditing && "(Leave blank to keep current)"}</label>
                  <input type="password" value={currentClient.password} onChange={e => setCurrentClient({...currentClient, password: e.target.value})} required={!isEditing} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
                </div>
              </div>
              <div className="flex justify-between items-center mt-6">
                <div>
                  {isEditing && (
                     <button type="button" onClick={() => handleDelete(currentClient.id)} className="text-sm text-red-400 hover:text-red-300 transition-colors">Delete Client</button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded text-sm font-medium shadow-lg">Save Client</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 overflow-auto content-start">
        {loading ? (
          <div className="text-emerald-500 col-span-full">Loading clients...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-20 border border-dashed border-white/10 rounded-2xl bg-[#151619]">
            <Users className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <h2 className="text-xl text-white font-medium mb-2">No Clients Found</h2>
            <p className="text-slate-400">Add your first client to get started.</p>
          </div>
        ) : (
          filtered.map(c => (
            <div key={c.id} className="bg-[#151619] border border-white/10 rounded-2xl p-6 hover:border-emerald-500/30 transition-colors shadow-lg group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-xl font-medium">
                  {c.full_name.charAt(0)}
                </div>
                <span className={`px-2 py-1 text-[10px] uppercase tracking-widest rounded-full font-bold ${c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                  {c.status || 'Active'}
                </span>
              </div>
              <h3 className="text-xl font-medium text-white mb-2">{c.full_name}</h3>
              <div className="space-y-2 mt-4 text-sm text-slate-400">
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <span>{c.email}</span>
                  </div>
                )}
                {c.phone_number && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-500" />
                    <span>{c.phone_number}</span>
                  </div>
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-white/5 flex gap-2">
                <button onClick={() => openEditModal(c)} className="flex-1 py-2 bg-[#0a0a0a] hover:bg-[#1a1c20] text-slate-300 rounded-lg text-sm font-medium transition-colors border border-white/5">View Profile</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
