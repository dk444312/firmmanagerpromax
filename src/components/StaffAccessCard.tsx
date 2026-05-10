import React from 'react';
import { Shield, Briefcase, CheckCircle, XCircle } from 'lucide-react';

export default function StaffAccessCard({ member, onUpdate, onClose }: any) {
  if (!member) return null;
  const isAllCases = member.case_access_mode === 'all';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-[#f8f9fa] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative text-slate-800">
        <div className="bg-[#ffffff] p-8 border-b border-slate-200 flex justify-between items-start">
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold">
               {member.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{member.name}</h2>
              <p className="text-slate-500 font-mono text-sm">@{member.username} — {member.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div>
            <h3 className="text-lg font-medium text-slate-800 mb-3 flex items-center gap-2"><Shield className="w-5 h-5 text-indigo-500"/> Module Access</h3>
            <div className="flex flex-wrap gap-2">
               {(member.accessible_menus || []).map((m: string) => (
                 <div key={m} className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-sm capitalize font-medium flex items-center gap-1">
                   <CheckCircle className="w-3.5 h-3.5" />
                   {m}
                 </div>
               ))}
               {(member.accessible_menus || []).length === 0 && <span className="text-slate-400 text-sm italic">No modules accessible</span>}
            </div>
          </div>

          <div className="h-px bg-slate-200 w-full" />

          <div>
             <h3 className="text-lg font-medium text-slate-800 mb-3 flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-500"/> Resource Access Parameters</h3>
             <div className="bg-[#ffffff] border border-slate-200 rounded-2xl p-6 shadow-sm">
                 <div className="flex justify-between items-center mb-6">
                    <span className="font-medium text-slate-700">Access Mode</span>
                    <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${isAllCases ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isAllCases ? 'Unrestricted (All)' : 'Assigned Only'}
                    </span>
                 </div>

                 {!isAllCases && (
                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-[#f8f9fa] border border-slate-200 p-4 rounded-xl">
                          <div className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-1 flex justify-between items-center">
                             <span>Cases</span>
                             <span className="text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded text-xs">{(member.allowed_cases || []).length}</span>
                          </div>
                          <button onClick={() => onUpdate('Cases')} className="mt-3 w-full py-2 bg-[#ffffff] border border-slate-200 shadow-sm hover:border-emerald-300 hover:text-emerald-600 text-slate-700 rounded-lg text-sm font-medium transition-colors">Assign Cases</button>
                       </div>
                       <div className="bg-[#f8f9fa] border border-slate-200 p-4 rounded-xl">
                          <div className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-1 flex justify-between items-center">
                             <span>Folders</span>
                             <span className="text-blue-500 bg-blue-50 px-2 py-0.5 rounded text-xs">{(member.allowed_folders || []).length}</span>
                          </div>
                          <button onClick={() => onUpdate('Folders')} className="mt-3 w-full py-2 bg-[#ffffff] border border-slate-200 shadow-sm hover:border-blue-300 hover:text-blue-600 text-slate-700 rounded-lg text-sm font-medium transition-colors">Assign Folders</button>
                       </div>
                    </div>
                 )}
                 {isAllCases && (
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                       <CheckCircle className="w-4 h-4 text-emerald-500" />
                       This user automatically has access to all active cases, files, and events.
                    </div>
                 )}
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
