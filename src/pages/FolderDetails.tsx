import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useParams, useNavigate } from 'react-router-dom';
import { FolderOpen, ArrowLeft, FileText, Download, Trash, Search, Upload, XCircle, Link as LinkIcon, RefreshCw, Info, Tag, History, Check, ShieldAlert, X, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import CaseSelectorModal from '../components/CaseSelectorModal';
import { supabase } from '../lib/supabase';

type FirmFile = { 
  id: string; 
  filename: string; 
  file_url: string; 
  folder_id: string; 
  created_at: string; 
  case_id?: string; 
  case_title?: string; 
  pending_filing?: boolean; 
  status?: string; 
  requires_approval?: boolean; 
  approval_status?: string; 
  uploaded_by?: string;
  doc_type?: string;
  version_number?: string;
  author?: string;
  last_edited_at?: string;
  tags?: string;
  classification?: string;
};

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
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);

  // New Upload Metadata States
  const [docType, setDocType] = useState('Other');
  const [classification, setClassification] = useState('Working Draft');
  const [tags, setTags] = useState('');
  const [authorName, setAuthorName] = useState('');

  // Selected File / Version Drawer States
  const [selectedFile, setSelectedFile] = useState<FirmFile | null>(null);
  const [fileVersions, setFileVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editDocType, setEditDocType] = useState('');
  const [editClassification, setEditClassification] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editFileName, setEditFileName] = useState('');

  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [versionFileObj, setVersionFileObj] = useState<File | null>(null);
  const [versionNotes, setVersionNotes] = useState('');
  const [versionNumber, setVersionNumber] = useState('');

  useEffect(() => {
    if (user) {
      setAuthorName(user.name || '');
    }
  }, [user]);

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
    if (selectedFile?.id === fileId) {
      setSelectedFile(null);
    }
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
    
    // Auto-generate standardized filename based on User Goal:
    // YYYY-MM-DD_Category_Claimant_v_Defendant.ext
    const originalName = uploadFileObj ? uploadFileObj.name : `Document-${Date.now()}.pdf`;
    let finalFilename = newFileName || originalName;
    
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '';
      const cleanStr = (s: string) => (s || '').replace(/[^a-zA-Z0-9]/g, '');

      let claimant = '';
      let defendant = '';

      if (fileCaseId) {
        const { data: caseObj } = await supabase
          .from('cases')
          .select('claimant, defendant')
          .eq('id', fileCaseId)
          .single();
        if (caseObj) {
          claimant = cleanStr(caseObj.claimant);
          defendant = cleanStr(caseObj.defendant);
        }
      }

      const cleanCategory = cleanStr(docType) || 'Document';
      let formattedName = `${todayStr}_${cleanCategory}`;
      if (claimant && defendant) {
        formattedName += `_${claimant}_v_${defendant}`;
      } else if (claimant) {
        formattedName += `_${claimant}`;
      } else {
        const baseName = originalName.includes('.') 
          ? originalName.substring(0, originalName.lastIndexOf('.')) 
          : originalName;
        formattedName += `_${cleanStr(baseName)}`;
      }
      
      finalFilename = `${formattedName}${ext}`;
    } catch (err) {
      console.error("Auto naming failed in FolderDetails, falling back", err);
    }
    
    let fileUrl = '#';
    if (uploadFileObj) {
      const fileName = `${Date.now()}-${finalFilename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage.from('files').upload(fileName, uploadFileObj);
      if (!error && data) {
        const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(fileName);
        fileUrl = publicUrl;
      }
    }

    const { data } = await supabase.from('files').insert([{ 
      filename: finalFilename, 
      file_url: fileUrl, 
      folder_id: folderId,
      case_id: fileCaseId || null,
      pending_filing: pendingFiling,
      requires_approval: requiresApproval,
      approval_status: requiresApproval ? 'pending' : 'approved',
      firm_id: user.firm_id,
      uploaded_by: user.id,
      doc_type: docType,
      version_number: '1.0',
      author: authorName || user.name,
      tags: tags,
      classification: classification,
      last_edited_at: new Date().toISOString()
    }]).select().single();
    
    if (data) {
      // Create initial version log in history
      try {
        await fetch(`/api/file_versions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            file_id: data.id,
            version_number: '1.0',
            filename: finalFilename,
            file_url: fileUrl,
            doc_type: docType,
            tags: tags,
            classification: classification,
            author: authorName || user.name,
            notes: 'Initial version upload'
          })
        });
      } catch (err) {
        console.error("Failed to create initial version history log", err);
      }

      setFiles([...files, {...data, case_title: fileCaseTitle}]);
      setUploadMode('none');
      setFileCaseId('');
      setFileCaseTitle('');
      setPendingFiling(false);
      setRequiresApproval(false);
      setNewFileName('');
      setUploadFileObj(null);
      setDocType('Other');
      setClassification('Working Draft');
      setTags('');
    }
  };

  const handleApprove = async (fileId: string) => {
    if (!token || !supabase) return;
    await supabase.from('files').update({ approval_status: 'approved' }).eq('id', fileId);
    setFiles(files.map(f => f.id === fileId ? { ...f, approval_status: 'approved' } : f));
  };

  const handleReplaceAndApprove = (file: FirmFile) => {
     const input = document.createElement('input');
     input.type = 'file';
     input.onchange = async (e: any) => {
        const fileObj = e.target.files[0];
        if (!fileObj) return;
        
        const fileName = `${Date.now()}-${fileObj.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const { data, error } = await supabase.storage.from('files').upload(fileName, fileObj);
        if (!error && data) {
          const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(fileName);
          
          // Increment version
          const nextVerNum = (parseFloat(file.version_number || '1.0') + 1.0).toFixed(1);

          // Update file record
          await supabase.from('files').update({ 
            file_url: publicUrl, 
            filename: fileObj.name, 
            approval_status: 'approved',
            version_number: nextVerNum,
            last_edited_at: new Date().toISOString()
          }).eq('id', file.id);

          // Log version
          try {
            await fetch(`/api/file_versions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                file_id: file.id,
                version_number: nextVerNum,
                filename: fileObj.name,
                file_url: publicUrl,
                doc_type: file.doc_type || 'Other',
                tags: file.tags || '',
                classification: file.classification || 'Working Draft',
                author: user.name || 'System',
                notes: 'Replaced and approved file version'
              })
            });
          } catch (vErr) {
            console.error(vErr);
          }

          fetchFolderContent();
        }
     };
     input.click();
  };

  // Drawer Version Operations
  const fetchVersions = async (fileId: string) => {
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/files/${fileId}/versions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setFileVersions(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleSelectFile = (file: FirmFile) => {
    setSelectedFile(file);
    setIsEditingMetadata(false);
    setEditDocType(file.doc_type || 'Other');
    setEditClassification(file.classification || 'Working Draft');
    setEditTags(file.tags || '');
    setEditAuthor(file.author || '');
    setEditFileName(file.filename || '');
    setVersionNotes('');
    setVersionFileObj(null);
    const curr = parseFloat(file.version_number || '1.0');
    setVersionNumber((isNaN(curr) ? 2.0 : curr + 1.0).toFixed(1));
    fetchVersions(file.id);
  };

  const handleSaveMetadata = async () => {
    if (!token || !selectedFile) return;
    try {
      const res = await fetch(`/api/files/${selectedFile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          filename: editFileName,
          doc_type: editDocType,
          classification: editClassification,
          tags: editTags,
          author: editAuthor,
          last_edited_at: new Date().toISOString()
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, ...updated } : f));
        setSelectedFile({ ...selectedFile, ...updated });
        setIsEditingMetadata(false);
      } else {
        alert("Failed to save metadata");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user || !selectedFile || !versionFileObj) {
      alert("Missing file information.");
      return;
    }
    setIsUploadingVersion(true);
    try {
      let fileUrl = '#';
      const fileName = `${Date.now()}-${versionFileObj.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data: up, error: upErr } = await supabase.storage.from('files').upload(fileName, versionFileObj);
      if (!upErr && up) {
        const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(fileName);
        fileUrl = publicUrl;
      }

      const vRes = await fetch(`/api/file_versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          file_id: selectedFile.id,
          version_number: versionNumber,
          filename: versionFileObj.name,
          file_url: fileUrl,
          doc_type: selectedFile.doc_type || 'Other',
          tags: selectedFile.tags || '',
          classification: selectedFile.classification || 'Working Draft',
          author: user.name || 'System',
          notes: versionNotes || 'Uploaded new version'
        })
      });

      if (vRes.ok) {
        const parentRes = await fetch(`/api/files/${selectedFile.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            filename: versionFileObj.name,
            file_url: fileUrl,
            version_number: versionNumber,
            last_edited_at: new Date().toISOString()
          })
        });

        if (parentRes.ok) {
          const updatedParent = await parentRes.json();
          setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, ...updatedParent } : f));
          setSelectedFile({ ...selectedFile, ...updatedParent });
          setVersionFileObj(null);
          setVersionNotes('');
          const next = parseFloat(versionNumber) + 1.0;
          setVersionNumber(next.toFixed(1));
          fetchVersions(selectedFile.id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploadingVersion(false);
    }
  };

  const handleRestoreVersion = async (v: any) => {
    if (!token || !selectedFile || !confirm(`Restore document to Version ${v.version_number}? This will revert document details.`)) return;
    try {
      const res = await fetch(`/api/files/${selectedFile.id}/restore-version`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          filename: v.filename,
          file_url: v.file_url,
          version_number: v.version_number,
          doc_type: v.doc_type,
          tags: v.tags,
          classification: v.classification,
          author: v.author
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, ...updated } : f));
        setSelectedFile({ ...selectedFile, ...updated });
        fetchVersions(selectedFile.id);
      } else {
        alert("Failed to restore version");
      }
    } catch (e) {
      console.error(e);
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
          <div className="bg-[#151619] border border-white/10 rounded-xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-light text-white mb-6">Upload to {folderName} ({uploadMode})</h2>
            <div className="flex gap-4 mb-6">
               <button onClick={() => setUploadMode('simple')} className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${uploadMode === 'simple' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400 bg-[#0a0a0a]'}`}>Simple Upload</button>
               <button onClick={() => setUploadMode('professional')} className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${uploadMode === 'professional' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400 bg-[#0a0a0a]'}`}>Professional (Bulk)</button>
            </div>
            
            <form onSubmit={handleUploadFile} className="space-y-4">
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

                {/* Metadata Fields */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Document Type</label>
                    <select 
                      value={docType} 
                      onChange={e => setDocType(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 text-sm cursor-pointer"
                    >
                      <option value="Pleading">Pleading</option>
                      <option value="Contract">Contract</option>
                      <option value="Affidavit">Affidavit</option>
                      <option value="Letter">Letter</option>
                      <option value="Brief">Brief</option>
                      <option value="Court Order">Court Order</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Classification</label>
                    <select 
                      value={classification} 
                      onChange={e => setClassification(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 text-sm cursor-pointer"
                    >
                      <option value="Confidential">🔒 Confidential</option>
                      <option value="Court Copy">⚖️ Court Copy</option>
                      <option value="Working Draft">📝 Working Draft</option>
                      <option value="Final Copy">✨ Final Copy</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Author</label>
                    <input 
                      type="text" 
                      placeholder="Uploader name"
                      value={authorName} 
                      onChange={e => setAuthorName(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags</label>
                    <input 
                      type="text" 
                      placeholder="e.g. litigation, reply"
                      value={tags} 
                      onChange={e => setTags(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white focus:outline-none focus:border-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={pendingFiling} onChange={e => setPendingFiling(e.target.checked)} className="form-checkbox bg-[#0a0a0a] border-white/20 text-emerald-500 rounded focus:ring-0" />
                    Mark as Pending Filing
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={requiresApproval} onChange={e => setRequiresApproval(e.target.checked)} className="form-checkbox bg-[#0a0a0a] border-white/20 text-emerald-500 rounded focus:ring-0" />
                    Requires Checking
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Document Name (Optional)</label>
                <input type="text" placeholder="Custom document name" value={newFileName} onChange={e => setNewFileName(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded py-2 px-3 text-white mb-4 text-sm" />
              </div>

              <label className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors cursor-pointer group block mb-6 relative">
                <input type="file" className="hidden" onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setUploadFileObj(e.target.files[0]);
                  }
                }} />
                <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2 group-hover:text-emerald-500 transition-colors" />
                <p className="text-slate-300 text-xs">
                  {uploadFileObj ? <span className="text-emerald-400 font-medium">{uploadFileObj.name}</span> : 'Click to browse or drag and drop files.'}
                </p>
                {uploadMode === 'professional' && <p className="text-[10px] text-slate-500 mt-1">Bulk upload supported</p>}
              </label>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setUploadMode('none')} className="px-5 py-2 text-slate-400 hover:text-white font-medium text-sm">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl font-semibold shadow-lg text-sm">Upload File</button>
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
                <th className="pb-4 font-semibold">Type</th>
                <th className="pb-4 font-semibold">Ver</th>
                <th className="pb-4 font-semibold">Classification</th>
                <th className="pb-4 font-semibold">Filing Status</th>
                <th className="pb-4 font-semibold">Approval</th>
                <th className="pb-4 font-semibold">Uploaded Date</th>
                <th className="pb-4 font-semibold">Linked Matter</th>
                <th className="pb-4 pr-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(file => (
                <tr key={file.id} className={`hover:bg-white/[0.02] transition-colors group ${file.requires_approval && file.approval_status === 'pending' ? 'bg-rose-500/5' : ''} ${selectedFile?.id === file.id ? 'bg-emerald-950/10 border-r-2 border-emerald-500' : ''}`}>
                  <td className="py-4 pl-4 flex items-center gap-3">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    <button 
                      onClick={() => handleSelectFile(file)}
                      className="text-sm text-white font-medium hover:text-emerald-400 hover:underline text-left transition-colors"
                    >
                      {file.filename}
                    </button>
                  </td>
                  <td className="py-4 text-xs text-slate-300 font-medium">
                    {file.doc_type || 'Other'}
                  </td>
                  <td className="py-4 text-xs font-mono font-bold text-emerald-400">
                    v{file.version_number || '1.0'}
                  </td>
                  <td className="py-4 text-xs font-medium">
                    <span className={`px-2.5 py-0.5 rounded-full border ${
                      file.classification === 'Confidential' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      file.classification === 'Court Copy' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      file.classification === 'Final Copy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      'bg-slate-800 text-slate-400 border-white/10'
                    }`}>
                      {file.classification || 'Working Draft'}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-medium">
                    <span className={`px-3 py-1 rounded-full ${
                      file.pending_filing ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {file.pending_filing ? 'Pending Filing' : 'Filed'}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-medium">
                    {!file.requires_approval ? (
                       <span className="text-slate-500">-</span>
                    ) : file.approval_status === 'pending' ? (
                       <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20 shadow-sm animate-pulse">Pending Review</span>
                    ) : (
                       <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">Approved</span>
                    )}
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
                    <div className="flex flex-col items-end gap-2">
                       <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                           onClick={() => handleSelectFile(file)}
                           className="text-slate-400 hover:text-emerald-400"
                           title="Details & Version History"
                         >
                           <Info className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => handleToggleFiling(file)}
                           className="text-slate-400 hover:text-emerald-400" 
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
                       {(user.role === 'Admin' || user.role === 'Managing Partner') && file.requires_approval && file.approval_status === 'pending' && (
                          <div className="flex items-center gap-2 mt-1">
                             <button onClick={() => handleApprove(file.id)} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded font-medium shadow-lg">Approve</button>
                             <button onClick={() => handleReplaceAndApprove(file)} className="text-[10px] bg-[#262626] border border-white/10 hover:border-emerald-500/50 text-white px-2 py-1 rounded font-medium shadow-lg hover:text-emerald-400">Replace & Approve</button>
                          </div>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sliding Drawer for Document Details & Version History */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="flex-1" onClick={() => setSelectedFile(null)} />
          
          <div className="w-[440px] max-w-full bg-[#111214] border-l border-white/10 h-full flex flex-col shadow-2xl animate-slide-in">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#151619]">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-emerald-500" />
                <h2 className="text-base font-bold text-white truncate max-w-[260px]">{selectedFile.filename}</h2>
              </div>
              <button 
                onClick={() => setSelectedFile(null)}
                className="text-slate-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Metadata Card */}
              <div className="bg-[#151619] rounded-2xl border border-white/5 p-5 space-y-4 text-left">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Document Metadata</h3>
                  <button 
                    onClick={() => setIsEditingMetadata(!isEditingMetadata)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20"
                  >
                    {isEditingMetadata ? "Cancel" : "Edit Metadata"}
                  </button>
                </div>

                {isEditingMetadata ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Document Name</label>
                      <input 
                        type="text" 
                        value={editFileName} 
                        onChange={e => setEditFileName(e.target.value)}
                        className="w-full text-xs bg-[#0a0a0a] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Type</label>
                        <select 
                          value={editDocType} 
                          onChange={e => setEditDocType(e.target.value)}
                          className="w-full text-xs bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="Pleading">Pleading</option>
                          <option value="Contract">Contract</option>
                          <option value="Affidavit">Affidavit</option>
                          <option value="Letter">Letter</option>
                          <option value="Brief">Brief</option>
                          <option value="Court Order">Court Order</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Classification</label>
                        <select 
                          value={editClassification} 
                          onChange={e => setEditClassification(e.target.value)}
                          className="w-full text-xs bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="Confidential">🔒 Confidential</option>
                          <option value="Court Copy">⚖️ Court Copy</option>
                          <option value="Working Draft">📝 Working Draft</option>
                          <option value="Final Copy">✨ Final Copy</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Author</label>
                        <input 
                          type="text" 
                          value={editAuthor} 
                          onChange={e => setEditAuthor(e.target.value)}
                          className="w-full text-xs bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tags (Comma Sep.)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. pleading, high-court"
                          value={editTags} 
                          onChange={e => setEditTags(e.target.value)}
                          className="w-full text-xs bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={handleSaveMetadata}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-semibold transition-all shadow"
                    >
                      Save Changes
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Classification</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold border ${
                        selectedFile.classification === 'Confidential' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        selectedFile.classification === 'Court Copy' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        selectedFile.classification === 'Final Copy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        'bg-slate-800 text-slate-400 border-white/10'
                      }`}>
                        {selectedFile.classification || 'Working Draft'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Document Type</span>
                      <span className="text-white font-medium">{selectedFile.doc_type || 'Other'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Author / Creator</span>
                      <span className="text-white font-medium">{selectedFile.author || 'System'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Current Version</span>
                      <span className="text-emerald-400 font-mono font-bold bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-lg">v{selectedFile.version_number || '1.0'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Uploaded On</span>
                      <span className="text-white font-medium">{new Date(selectedFile.created_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Last Edited</span>
                      <span className="text-white font-medium">{selectedFile.last_edited_at ? new Date(selectedFile.last_edited_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 block mb-1">Tags</span>
                      {selectedFile.tags ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedFile.tags.split(',').map((t, i) => (
                            <span key={i} className="bg-white/5 border border-white/5 text-slate-300 px-2 py-0.5 rounded text-[10px] font-medium">{t.trim()}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">No tags</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Version History Section */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 text-left">
                  <History className="w-4 h-4 text-emerald-500" />
                  Version Control History
                </h3>

                {/* Upload New Version Form */}
                <form onSubmit={handleUploadNewVersion} className="bg-[#151619] border border-white/5 rounded-2xl p-4 space-y-3 text-left">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Upload Revision / Draft</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Version Num</label>
                      <input 
                        type="text" 
                        required
                        value={versionNumber} 
                        onChange={e => setVersionNumber(e.target.value)} 
                        className="w-full text-xs bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Select File</label>
                      <label className="block bg-[#0a0a0a] border border-dashed border-white/10 hover:border-emerald-500/40 rounded-lg p-2 text-center text-xs text-slate-400 hover:text-emerald-400 cursor-pointer transition-colors truncate">
                        <input 
                          type="file" 
                          required
                          className="hidden" 
                          onChange={e => {
                            if (e.target.files && e.target.files.length > 0) {
                              setVersionFileObj(e.target.files[0]);
                            }
                          }}
                        />
                        {versionFileObj ? versionFileObj.name : "Choose draft..."}
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Revision Notes</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Corrected typos in paragraph 4" 
                      value={versionNotes} 
                      onChange={e => setVersionNotes(e.target.value)} 
                      className="w-full text-xs bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-white"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isUploadingVersion || !versionFileObj}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition-all shadow-md"
                  >
                    {isUploadingVersion ? "Uploading Revision..." : "Commit Revision"}
                  </button>
                </form>

                {/* Versions timeline list */}
                {loadingVersions ? (
                  <div className="text-slate-500 text-center text-xs py-4">Loading historical iterations...</div>
                ) : fileVersions.length === 0 ? (
                  <div className="text-slate-500 text-center text-xs py-4 italic text-left">No revision history found.</div>
                ) : (
                  <div className="relative border-l border-white/5 pl-4 ml-2 space-y-4 text-left">
                    {fileVersions.map((v, i) => {
                      const isCurrent = v.version_number === selectedFile.version_number;
                      return (
                        <div key={v.id} className="relative">
                          <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border ${isCurrent ? 'bg-emerald-500 border-emerald-500' : 'bg-[#111214] border-slate-700'}`} />
                          
                          <div className={`p-3 rounded-xl border transition-all ${isCurrent ? 'bg-emerald-950/10 border-emerald-500/25' : 'bg-[#151619] border-white/5'}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-white bg-white/5 px-2 py-0.5 rounded">v{v.version_number}</span>
                                {isCurrent && <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/55 border border-emerald-500/20 px-1.5 py-0.5 rounded">Live</span>}
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">{new Date(v.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs text-slate-300 font-medium mb-1 truncate" title={v.filename}>{v.filename}</p>
                            <p className="text-[11px] text-slate-500 leading-normal italic mb-2">"{v.notes || 'No description recorded.'}"</p>
                            <div className="flex items-center justify-between pt-2 border-t border-white/[0.03]">
                              <span className="text-[10px] text-slate-500">By: {v.author || 'System'}</span>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => { if(v.file_url && v.file_url !== '#') window.open(v.file_url, '_blank'); else alert('No attachment.'); }}
                                  className="text-[10px] text-emerald-400 hover:underline hover:text-emerald-300"
                                >
                                  View File
                                </button>
                                {!isCurrent && (
                                  <button 
                                    onClick={() => handleRestoreVersion(v)}
                                    className="text-[10px] text-amber-400 hover:underline hover:text-amber-300"
                                  >
                                    Restore This
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
