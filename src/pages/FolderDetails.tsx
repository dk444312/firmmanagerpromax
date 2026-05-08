import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useParams, useNavigate } from 'react-router-dom';
import { FolderOpen, ArrowLeft, FileText, Download, Trash, Search, Upload, XCircle, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

type FirmFile = { id: string; filename: string; file_url: string; folder_id: string; created_at: string; case_id?: string; case_title?: string; pending_filing?: boolean; status?: string };

export default function FolderDetails() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  
  const [folderName, setFolderName] = useState('');
  const [files, setFiles] = useState<FirmFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [uploadMode, setUploadMode] = useState<'none' | 'simple' | 'professional'>('none');
  const [isSelectingCase, setIsSelectingCase] = useState(false);
  const [fileCaseId, setFileCaseId] = useState('');
  const [fileCaseTitle, setFileCaseTitle] = useState('');
  const [pendingFiling, setPendingFiling] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);

  const fetchFolderContent = async () => {
    if (!token || !supabase || !user) return;
    if (!folderId) {
       console.error("Missing folderId");
       setLoading(false);
       return;
    }
    
    try {
      const [fRes, fileRes] = await Promise.all([
        supabase.from('folders').select('*').eq('firm_id', user.firm_id),
        supabase.from('files').select('*').eq('folder_id', folderId).eq('firm_id', user.firm_id)
      ]);
      
      const fData = fRes.data || [];
      const fileData = fileRes.data || [];
      
      const folder = fData.find((f: any) => f.id === folderId);
      if (folder) {
        setFolderName(folder.name);
      } else {
        console.warn("Folder not found in fetched list", folderId);
      }
      
      setFiles(fileData);
    } catch (e) {
      console.error("Error fetching folder content:", e);
      alert("Failed to load folder contents. Please try refreshing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolderContent();
  }, [token, folderId, user]);

  const handleDelete = async (fileId: string) => {
    if (!token || !supabase || !confirm("Delete this file?")) return;
    await supabase.from('files').delete().eq('id', fileId);
    fetchFolderContent();
  };

  const handleToggleFiling = async (file: FirmFile) => {
    if (!token || !supabase) return;
    const newStatus = !file.pending_filing;
    await supabase.from('files').update({ pending_filing: newStatus }).eq('id', file.id);

    if (!newStatus) {
      if (confirm(`Document "${file.filename}" marked as filed. Would you like to log your filing hours now?`)) {
        navigate('/files/hours', { state: { 
          logNow: true, 
          document: file.filename, 
          case_id: file.case_id, 
          case_title: file.case_title,
          file_id: file.id
        }});
      }
    }
    fetchFolderContent();
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user || !folderId) {
      alert("Missing folder information.");
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
      folder_id: folderId,
      case_id: fileCaseId || null,
      pending_filing: pendingFiling,
      firm_id: user.firm_id
    }]).select().single();
    
    if (data) {
      setFiles([...files, {...data, case_title: fileCaseTitle}]);
      setUploadMode('none');
      setFileCaseId('');
      setFileCaseTitle('');
      setPendingFiling(false);
      setNewFileName('');
      setUploadFileObj(null);
    }
  };

  const filtered = files.filter(f => (f.filename || '').toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-10 text-emerald-500">Loading folder contents...</div>;

  return (
    <div className="p-10 max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <button onClick={() => navigate('/files')} className="text-slate-500 hover:text-emerald-400 flex items-center gap-2 mb-4 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Files
          </button>
          <h1 className="text-4xl font-light text-white tracking-tight flex items-center gap-4">
            <FolderOpen className="w-8 h-8 text-emerald-500" />
            {folderName}
          </h1>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search this folder..." value={search} onChange={e => setSearch(e.target.value)} className="bg-[#151619] border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 w-64" />
          </div>
          <button onClick={() => setUploadMode('simple')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium tracking-wide flex items-center gap-2 transition-colors text-sm">
            <Upload className="w-4 h-4" /> Upload File
          </button>
        </div>
      </header>

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
            <h2 className="text-2xl font-light text-white mb-6">Upload to {folderName} ({uploadMode})</h2>
            <div className="flex gap-4 mb-6">
               <button onClick={() => setUploadMode('simple')} className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${uploadMode === 'simple' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400 bg-[#0a0a0a]'}`}>Simple Upload</button>
               <button onClick={() => setUploadMode('professional')} className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${uploadMode === 'professional' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400 bg-[#0a0a0a]'}`}>Professional (Bulk)</button>
            </div>
            
            <form onSubmit={handleUploadFile} className="space-y-6">
              <div>
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

      <div className="flex-1 overflow-auto bg-[#151619] border border-white/10 rounded-xl p-6 shadow-lg">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <h2 className="text-xl text-white font-medium mb-2">No files found</h2>
            <p className="text-slate-400">There are no matching documents in this folder.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-white/5">
                <th className="pb-4 pl-4 font-semibold">Document Name</th>
                <th className="pb-4 font-semibold">Filing Status</th>
                <th className="pb-4 font-semibold">Uploaded Date</th>
                <th className="pb-4 font-semibold">Linked Matter</th>
                <th className="pb-4 pr-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(file => (
                <tr key={file.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-4 pl-4 flex items-center gap-3">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm text-white font-medium">{file.filename}</span>
                  </td>
                  <td className="py-4 text-xs font-medium">
                    <span className={`px-3 py-1 rounded-full ${
                      file.pending_filing ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {file.pending_filing ? 'Pending Filing' : 'Filed'}
                    </span>
                  </td>
                  <td className="py-4 text-sm text-slate-400">
                    {new Date(file.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4">
                    {file.case_title ? (
                      <span className="text-xs font-medium text-slate-300">{file.case_title}</span>
                    ) : (
                      <span className="text-xs text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-4 pr-4 text-right">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleToggleFiling(file)}
                        className={`text-slate-400 hover:text-emerald-400`} 
                        title={file.pending_filing ? "Mark as Filed" : "Mark as Pending Filing"}
                      >
                        <RefreshCw className={cn("w-4 h-4", file.pending_filing ? "text-amber-500" : "")} />
                      </button>
                      <button 
                        onClick={() => { if(file.file_url && file.file_url !== '#') window.open(file.file_url, '_blank'); else alert('No file attached.'); }} 
                        className="text-slate-400 hover:text-emerald-400" 
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(file.id)} className="text-slate-400 hover:text-red-400" title="Delete"><Trash className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
