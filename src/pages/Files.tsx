import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Upload, Search, FileText, Download, Trash, RefreshCw, Clock, Link as LinkIcon, XCircle } from 'lucide-react';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

type Folder = { id: string; name: string; firm_id: string; };
type FirmFile = { id: string; filename: string; file_url: string; folder_id: string; created_at: string; case_id?: string; case_title?: string; pending_filing?: boolean };

export default function Files() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FirmFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadMode, setUploadMode] = useState<'none'|'simple'|'professional'>('none');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [newFileName, setNewFileName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [fileCaseId, setFileCaseId] = useState('');
  const [fileCaseTitle, setFileCaseTitle] = useState('');
  const [pendingFiling, setPendingFiling] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);

  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]);
  };

  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    const [fRes, fileRes] = await Promise.all([
      supabase.from('folders').select('*').eq('firm_id', user.firm_id),
      supabase.from('files').select('*').eq('firm_id', user.firm_id)
    ]);
    
    let allFolders = fRes.data || [];
    if (user.role !== 'Managing Partner' && user.case_access_mode === 'assigned') {
      const allowedFolders = user.allowed_folders || [];
      allFolders = allFolders.filter(f => allowedFolders.includes(f.id));
    }
    
    setFolders(allFolders);
    setFiles(fileRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    const { data } = await supabase.from('folders').insert([{ name: newFolderName, firm_id: user.firm_id }]).select().single();
    if (data) {
      setFolders([...folders, data]);
      setIsAddingFolder(false);
      setNewFolderName('');
    }
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user || !selectedFolder) {
      alert("Folder is required.");
      return;
    }

    let fileUrl = '#';
    if (uploadFileObj) {
      const fileName = `${Date.now()}-${uploadFileObj.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage.from('files').upload(fileName, uploadFileObj);
      if (!error && data) {
        const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(fileName);
        fileUrl = publicUrl;
      }
    }

    const { data } = await supabase.from('files').insert([{ 
      filename: newFileName || (uploadFileObj ? uploadFileObj.name : `Document-${Date.now()}.pdf`), 
      file_url: fileUrl, 
      folder_id: selectedFolder,
      case_id: fileCaseId || null,
      pending_filing: pendingFiling,
      requires_approval: requiresApproval,
      approval_status: requiresApproval ? 'pending' : 'approved',
      firm_id: user.firm_id,
      uploaded_by: user.id
    }]).select().single();
    
    if (data) {
      if (fileCaseId) {
         // Optionally notify case assignees that a file was uploaded!
         if (supabase) {
             const { data: caseRecord } = await supabase.from('cases').select('assigned_staff_ids, title').eq('id', fileCaseId).single();
             if (caseRecord && caseRecord.assigned_staff_ids && caseRecord.assigned_staff_ids.length > 0) {
                fetch('/api/send-notification', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({ 
                    userIds: caseRecord.assigned_staff_ids.filter((id: string) => id !== user.id), 
                    entityType: 'File', 
                    entityName: data.filename, 
                    message: `A new file has been uploaded to case ${caseRecord.title}.` 
                  })
                }).catch(console.error);
             }
         }
      }

      setFiles([...files, {...data, case_title: fileCaseTitle}]);
      setUploadMode('none');
      setFileCaseId('');
      setFileCaseTitle('');
      setPendingFiling(false);
      setRequiresApproval(false);
      setNewFileName('');
      setUploadFileObj(null);
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (!token || !supabase || !confirm("Delete this folder and all its contents?")) return;
    await supabase.from('folders').delete().eq('id', folderId);
    setFolders(folders.filter(f => f.id !== folderId));
    setFiles(files.filter(f => f.folder_id !== folderId));
  };

  const filteredFolders = folders.filter(f => (f.name || '').toLowerCase().includes((search || '').toLowerCase()));

  return (
    <div className="p-10 max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight flex items-center gap-4">
            <FolderOpen className="w-8 h-8 text-emerald-500" />
            Files
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Secure document management & billing records.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search vault..." value={search} onChange={e => setSearch(e.target.value)} className="bg-[#151619] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 w-64" />
          </div>
          <button onClick={() => setIsAddingFolder(true)} className="bg-[#262626] hover:bg-[#333] text-white px-4 py-2 rounded-lg font-medium tracking-wide flex items-center gap-2 transition-colors border border-white/10 text-sm">
            <FolderOpen className="w-4 h-4 text-emerald-400" /> New Folder
          </button>
          <button onClick={() => { setSelectedFolder(''); setUploadMode('simple'); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium tracking-wide flex items-center gap-2 transition-colors text-sm">
            <Upload className="w-4 h-4" /> Upload File
          </button>
        </div>
      </header>

      {isAddingFolder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-medium text-white mb-4">Create Folder</h2>
            <form onSubmit={handleAddFolder} className="space-y-4">
              <input required type="text" placeholder="Folder Name" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white" />
              <button type="submit" className="w-full bg-emerald-600 text-white py-2 rounded font-medium">Create</button>
              <button type="button" onClick={() => setIsAddingFolder(false)} className="w-full text-slate-400 py-2">Cancel</button>
            </form>
          </div>
        </div>
      )}

      {isSelectingCase && (
        <CaseSelectorModal 
          onClose={() => setIsSelectingCase(false)}
          onSelect={(id, title) => {
            setFileCaseId(id);
            setFileCaseTitle(title);
            setIsSelectingCase(false);
          }}
        />
      )}

      {uploadMode !== 'none' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151619] border border-white/10 rounded-xl p-8 w-full max-w-lg">
            <h2 className="text-2xl font-light text-white mb-6">File Upload ({uploadMode})</h2>
            <div className="flex gap-4 mb-6">
               <button onClick={() => setUploadMode('simple')} className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${uploadMode === 'simple' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400 bg-[#0a0a0a]'}`}>Simple Upload</button>
               <button onClick={() => setUploadMode('professional')} className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${uploadMode === 'professional' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400 bg-[#0a0a0a]'}`}>Professional (Bulk)</button>
            </div>
            
            <form onSubmit={handleUploadFile} className="space-y-6">
              <div>
                {!selectedFolder || (selectedFolder && !folders.find(f => f.id === selectedFolder)) ? (
                  <>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Target Folder</label>
                    <select required value={selectedFolder} onChange={e => setSelectedFolder(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white mb-4">
                      <option value="" disabled>Choose a folder...</option>
                      {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Target Folder</label>
                    <input disabled value={folders.find(f => f.id === selectedFolder)?.name || ''} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-slate-500 mb-4" />
                  </>
                )}

                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Matter (Optional)</label>
                {fileCaseId ? (
                  <div className="flex items-center justify-between bg-[#0a0a0a] border border-emerald-500/30 rounded py-2 px-3 mb-4">
                    <span className="text-emerald-400 text-sm truncate">{fileCaseTitle}</span>
                    <button type="button" onClick={() => {setFileCaseId(''); setFileCaseTitle('');}} className="text-slate-500 hover:text-red-400">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setIsSelectingCase(true)} className="w-full flex justify-center items-center gap-2 bg-[#0a0a0a] border border-dashed border-white/20 hover:border-emerald-500/50 rounded py-2 px-3 text-sm text-slate-400 hover:text-emerald-400 transition-colors mb-4">
                    <LinkIcon className="w-4 h-4" /> Link Matter
                  </button>
                )}

                <label className="flex items-center gap-2 text-sm text-slate-300 mb-6">
                  <input type="checkbox" checked={pendingFiling} onChange={e => setPendingFiling(e.target.checked)} className="form-checkbox bg-[#0a0a0a] border-white/20 text-emerald-500 rounded focus:ring-0" />
                  Mark as Pending Filing
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-300 mb-6">
                  <input type="checkbox" checked={requiresApproval} onChange={e => setRequiresApproval(e.target.checked)} className="form-checkbox bg-[#0a0a0a] border-white/20 text-emerald-500 rounded focus:ring-0" />
                  Requires Approval/Checking
                </label>

                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Document Name (Optional)</label>
                <input type="text" placeholder="Custom document name" value={newFileName} onChange={e => setNewFileName(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white mb-4" />
              </div>

              <label className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors cursor-pointer group block mb-8 relative">
                <input type="file" className="hidden" onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setUploadFileObj(e.target.files[0]);
                  }
                }} />
                <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3 group-hover:text-emerald-500 transition-colors" />
                <p className="text-slate-300 text-sm">
                  {uploadFileObj ? <span className="text-emerald-400 font-medium">{uploadFileObj.name}</span> : 'Click to browse or drag and drop files.'}
                </p>
                {uploadMode === 'professional' && <p className="text-xs text-slate-500 mt-2">Bulk upload supported</p>}
              </label>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setUploadMode('none')} className="px-6 py-2 text-slate-400 hover:text-white font-medium">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium shadow-lg">Upload Files</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? <div className="text-emerald-500">Loading files...</div> : filteredFolders.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-2xl bg-[#151619]">
             <FolderOpen className="w-16 h-16 text-slate-700 mb-6" />
             <h2 className="text-xl text-white font-medium mb-2">Vault Empty</h2>
             <p className="text-slate-400">Create a folder to start organizing case files.</p>
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredFolders.map(folder => {
              const folderFiles = files.filter(f => f.folder_id === folder.id);
              return (
                <div 
                  key={folder.id} 
                  className="bg-[#151619] border border-white/10 rounded-xl shadow-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-[#202226] hover:border-emerald-500/30 transition-all group relative"
                >
                  <button 
                    onClick={(e) => handleDeleteFolder(e, folder.id)} 
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                  <div className="w-full flex flex-col items-center justify-center" onClick={() => navigate(`/files/${folder.id}`)}>
                    <FolderOpen className="w-12 h-12 text-slate-500 group-hover:text-emerald-400 mb-4 transition-colors" />
                    <h3 className="font-semibold text-white text-center mb-1 group-hover:text-emerald-400 transition-colors pointer-events-none">
                      {folder.name}
                    </h3>
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-full pointer-events-none">{folderFiles.length} file(s)</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
