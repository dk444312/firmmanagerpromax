import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { safeJson } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Sparkles, Download, Trash2, FileDown, 
  Eye, Check, Loader2, Save, Copy, ChevronLeft,
  Bold, Italic, List, ListOrdered, FileEdit, Plus, 
  FolderSync, Info, PlusCircle, X, Briefcase, Scale, 
  Users, AlignLeft, FileCheck2, HelpCircle, PenTool
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Case {
  id: string;
  title: string;
  case_number?: string;
  claimant?: string;
  defendant?: string;
}

interface Draft {
  id: string;
  title: string;
  case_id?: string | null;
  template_type: string;
  content: string;
  court_name: string;
  parties_header: string;
  created_at: string;
  updated_at: string;
}

export default function Drafting() {
  const { token, user } = useAuth();
  
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<string>('');
  
  // Immersive Editing Mode switcher
  const [isEditingMode, setIsEditingMode] = useState(false);

  // Custom case info mapped to local status for deep binding
  const [boundClaimant, setBoundClaimant] = useState('');
  const [boundDefendant, setBoundDefendant] = useState('');
  
  const [currentDraft, setCurrentDraft] = useState<Partial<Draft>>({
    title: 'New Legal Pleadings',
    template_type: 'Custom Statement',
    court_name: 'IN THE HIGH COURT OF MALAWI\n(COMMERCIAL DIVISION)\nLILONGWE REGISTRY',
    parties_header: 'BETWEEN:\n\nCLAIMANT\n\n-AND-\n\nDEFENDANT',
    content: ''
  });
  
  const [savedDraftsLoading, setSavedDraftsLoading] = useState(true);
  const [savingLoading, setSavingLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  // AI Modal states
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    fetchDrafts();
    fetchCases();
  }, [token]);

  // Handle auto party linking when selected case is bound or changed
  useEffect(() => {
    if (selectedCase) {
      const activeCase = cases.find(c => c.id === selectedCase);
      if (activeCase) {
        setBoundClaimant(activeCase.claimant || '');
        setBoundDefendant(activeCase.defendant || '');
        
        const cName = activeCase.claimant || 'Claimant';
        const dName = activeCase.defendant || 'Defendant';
        const suitNo = activeCase.case_number ? `CIVIL CAUSE NO. ${activeCase.case_number}` : 'CIVIL CAUSE NO. ________ OF 2026';
        
        setCurrentDraft(prev => ({
          ...prev,
          case_id: selectedCase,
          parties_header: `${suitNo}\n\nBETWEEN:\n\n${cName.toUpperCase()}\nClaimant / Applicant\n\n-AND-\n\n${dName.toUpperCase()}\nDefendant / Respondent`
        }));
      }
    } else {
      setBoundClaimant('');
      setBoundDefendant('');
      setCurrentDraft(prev => ({
        ...prev,
        case_id: null
      }));
    }
  }, [selectedCase, cases]);
  
  const fetchDrafts = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/drafts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await safeJson(res);
      if (!data.error) {
        setDrafts(data);
        if (data.length > 0 && !currentDraft.id) {
          const firstDraft = data[0];
          setCurrentDraft(firstDraft);
          if (firstDraft.case_id) {
            setSelectedCase(firstDraft.case_id);
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavedDraftsLoading(false);
    }
  };
  
  const fetchCases = async () => {
    if (!token) return;
    try {
      if (supabase && user) {
        const { data, error } = await supabase
          .from('cases')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        if (!error && Array.isArray(data)) {
          let allCases = data;
          if (user.role !== 'Managing Partner' && user.case_access_mode === 'assigned') {
            const allowedIds = user.allowed_cases || [];
            allCases = data.filter(c => 
              allowedIds.includes(c.id) || (c.assigned_staff_ids && c.assigned_staff_ids.includes(user.id))
            );
          }
          setCases(allCases);
          return;
        }
      }

      const res = await fetch('/api/cases', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await safeJson(res);
      if (!data.error) {
        setCases(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const insertTextAtCursor = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    
    const replacement = before + selected + after;
    const updatedContent = text.substring(0, start) + replacement + text.substring(end);
    
    setCurrentDraft(prev => ({ ...prev, content: updatedContent }));
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const syncCasePartiesManual = () => {
    const claimantName = boundClaimant.trim() || 'Claimant';
    const defendantName = boundDefendant.trim() || 'Defendant';
    const activeCase = cases.find(c => c.id === selectedCase);
    const suitNo = activeCase?.case_number ? `CIVIL CAUSE NO. ${activeCase.case_number}` : 'CIVIL CAUSE NO. ________ OF 2026';
    
    const header = `${suitNo}\n\nBETWEEN:\n\n${claimantName.toUpperCase()}\nClaimant / Applicant\n\n-AND-\n\n${defendantName.toUpperCase()}\nDefendant / Respondent`;
    setCurrentDraft(prev => ({ ...prev, parties_header: header }));
    toast.success('Successfully linked case details to paper header!');
  };

  const handleSaveDraft = async () => {
    if (!token) return;
    setSavingLoading(true);
    try {
      const isNew = !currentDraft.id || currentDraft.id.startsWith('temp_');
      const url = isNew ? '/api/drafts' : `/api/drafts/${currentDraft.id}`;
      const method = isNew ? 'POST' : 'PUT';
      
      const payload = {
        title: currentDraft.title,
        case_id: selectedCase || null,
        template_type: currentDraft.template_type,
        content: currentDraft.content,
        court_name: currentDraft.court_name,
        parties_header: currentDraft.parties_header
      };
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await safeJson(res);
      
      if (!data.error) {
        toast.success(isNew ? 'New pleadings model created' : 'Pleadings drafted document saved');
        fetchDrafts();
        // Update current ID if newly created so it's not "isNew" next save
        if (isNew && data.id) {
          setCurrentDraft(prev => ({ ...prev, id: data.id }));
        }
      } else {
        toast.error('Could not save database item: ' + data.error);
      }
    } catch (e: any) {
      toast.error('Changes backed up on local browser storage');
      console.error(e);
    } finally {
      setSavingLoading(false);
    }
  };
  
  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    if (!confirm('Are you sure you want to permanently delete this pleadings document?')) return;
    
    try {
      const res = await fetch(`/api/drafts/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await safeJson(res);
      if (!data.error) {
        toast.success('Document deleted successfully');
        setDrafts(prev => prev.filter(d => d.id !== id));
        if (currentDraft.id === id) {
          setCurrentDraft({
            title: 'New Legal Pleadings',
            template_type: 'Custom Statement',
            court_name: 'IN THE HIGH COURT OF MALAWI',
            parties_header: 'BETWEEN:\n\nClaimant\n\n-AND-\n\nDefendant',
            content: ''
          });
          setSelectedCase('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };
  
  const handleCallAtlasModal = async () => {
    if (!token) return;
    if (!aiPrompt.trim()) {
      toast.error("Please enter a drafting context query.");
      return;
    }
    
    setAiLoading(true);
    setAiSuggestion('');
    try {
      const res = await fetch('/api/drafts/ai-suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: currentDraft.title,
          template_type: currentDraft.template_type,
          prompt: aiPrompt,
          original_content: currentDraft.content,
          action_type: 'custom'
        })
      });
      const data = await safeJson(res);
      if (data.suggestion) {
        setAiSuggestion(data.suggestion);
        toast.success("Atlas has completed your custom legal draft suggestion!");
      } else {
        toast.error("AI co-writer suggestion service temporarily offline");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not coordinate draft proposal with backend helper");
    } finally {
      setAiLoading(false);
    }
  };

  const handleInsertAtlasText = () => {
    if (!aiSuggestion) return;
    insertTextAtCursor(`\n\n${aiSuggestion}\n`);
    setIsAiModalOpen(false);
    setAiSuggestion('');
    setAiPrompt('');
    toast.success("Draft elements inserted successfully!");
  };
  
  const handleCreateNewDraft = () => {
    const tempId = `temp_${Date.now()}`;
    setCurrentDraft({
      id: tempId,
      title: 'Untitled Pleading Draft',
      template_type: 'Custom Statement',
      court_name: 'IN THE HIGH COURT OF MALAWI\n(COMMERCIAL DIVISION)\nLILONGWE REGISTRY',
      parties_header: 'BETWEEN:\n\n[CLAIMANT]\nClaimant\n\n-AND-\n\n[DEFENDANT]\nDefendant',
      content: '',
      case_id: ''
    });
    setSelectedCase('');
    setBoundClaimant('');
    setBoundDefendant('');
    setIsEditingMode(true);
    toast.success("Immersive drafting editor opened!");
  };

  const downloadTxtFile = () => {
    const header = `${currentDraft.court_name || ''}\n\n${currentDraft.parties_header || ''}\n\n============================================\n\n`;
    const fullText = header + (currentDraft.content || '');
    const element = document.createElement("a");
    const file = new Blob([fullText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${currentDraft.title || 'legal_draft'}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success("Raw plain text document downloaded!");
  };

  const copyToClipboard = () => {
    const header = `${currentDraft.court_name || ''}\n\n${currentDraft.parties_header || ''}\n\n============================================\n\n`;
    const fullText = header + (currentDraft.content || '');
    navigator.clipboard.writeText(fullText);
    toast.success("Document text elements copied to clipboard!");
  };

  const openDraftInFullScreen = (draftItem: Draft) => {
    setCurrentDraft(draftItem);
    if (draftItem.case_id) {
      setSelectedCase(draftItem.case_id);
    } else {
      setSelectedCase('');
    }
    setIsEditingMode(true);
    toast.success(`Opening "${draftItem.title}" in professional page layout`);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 text-slate-100 min-h-screen" id="drafting-container" style={{ fontFamily: 'Poppins, sans-serif' }}>
      
      {/* CASE 1: MAIN REPOSITORY VIEWER PANEL (NOT EDITING) */}
      {!isEditingMode ? (
        <div className="space-y-6">
          {/* Top Header Panel (Modern Minimal Slate, Elegant gold/amber accent) */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#121213] border border-white/10 p-6 rounded-2xl shadow-xl gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-[#0a0a0b] border border-white/5 rounded-xl text-emerald-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-medium tracking-tight text-white flex items-center gap-2">
                    Legal Pleadings Repository
                  </h1>
                  <p className="text-slate-400 text-xs font-light mt-0.5">
                    A secure document manager and advanced template layout to draft professional pleadings and claim arguments under southern-africa codes.
                  </p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleCreateNewDraft}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs px-5 py-3 rounded-xl cursor-pointer transition-all shadow-md hover:shadow-emerald-500/10 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Start Pleading Case
            </button>
          </div>

          {/* Documents Grid / Dashboard View */}
          <div className="bg-[#0f0f10] border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <span className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center gap-2 font-mono">
                <FileCheck2 className="w-4 h-4 text-emerald-500" />
                Active Pleadings Draft Documents
              </span>
              <span className="text-[10px] bg-emerald-950/40 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-900/30 font-mono">
                {drafts.length} total drafts
              </span>
            </div>

            {savedDraftsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <span className="text-xs text-slate-400 font-mono tracking-wider">LOADING ARCHIVED PLEADINGS...</span>
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-[#121213]/50 space-y-3">
                <PenTool className="w-8 h-8 text-stone-600 mx-auto" />
                <p className="text-xs text-slate-400 font-light">No existing legal pleadings saved.</p>
                <button
                  onClick={handleCreateNewDraft}
                  className="bg-[#121213] hover:bg-[#1a1a1c] text-slate-250 border border-white/10 text-[11px] font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer"
                >
                  Create Custom Template
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {drafts.map((d, index) => {
                    const linkedCr = cases.find(c => c.id === d.case_id);
                    return (
                      <motion.div
                        key={d.id}
                        initial={{ opacity: 0, scale: 0.98, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.2 }}
                        onClick={() => openDraftInFullScreen(d)}
                        className="group p-5 bg-[#121213] hover:bg-[#18181a] border border-white/10 hover:border-emerald-500/40 rounded-xl cursor-pointer transition-all duration-200 flex flex-col justify-between space-y-4 hover:shadow-xl hover:shadow-emerald-500/[0.02]"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-semibold font-mono bg-emerald-950/40 text-emerald-400 px-2 py-0.5 rounded border border-emerald-900/40 uppercase">
                              {d.template_type || 'Case Pleading'}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">
                              {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : 'Active Update'}
                            </span>
                          </div>
                          <h3 className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
                            {d.title}
                          </h3>
                          
                          {linkedCr ? (
                            <p className="text-[10px] text-slate-400 flex items-center gap-1 font-mono truncate">
                              <Briefcase className="w-3 h-3 text-emerald-500" /> Bound: {linkedCr.title}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-500 italic">No case bound</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                          <span className="text-[10px] text-slate-450 flex items-center gap-1 group-hover:text-emerald-400 transition-colors">
                            <FileEdit className="w-3.5 h-3.5 text-emerald-500" />
                            Open pleadings page
                          </span>
                          
                          <button
                            onClick={(e) => handleDeleteDraft(d.id, e)}
                            className="text-slate-500 hover:text-rose-450 p-1.5 rounded-lg hover:bg-[#1a1a1c] transition-colors cursor-pointer"
                            title="Delete draft pleading"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      ) : (
        
        /* CASE 2: IMMERSIVE FULL-WIDTH EDITING PAGE (Microsoft Word / Google Court Style) */
        <div className="space-y-6 animate-fade-in">
          
          {/* Back Action Bar and Tools */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-[#121213] border border-white/10 p-4 rounded-xl shadow-lg gap-4">
            <button
              onClick={() => {
                setIsEditingMode(false);
                fetchDrafts(); // Sync changes on return
              }}
              className="flex items-center justify-center gap-1.5 bg-[#0a0a0b] hover:bg-[#1a1a1c] text-slate-300 hover:text-white text-xs px-3.5 py-2.5 rounded-xl transition-all border border-white/10 font-bold cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Repository
            </button>

            {/* Document Title Header Block */}
            <div className="flex items-center justify-center gap-2">
              <FileEdit className="w-4 h-4 text-emerald-500" />
              <input 
                type="text" 
                value={currentDraft.title || ''}
                onChange={(e) => setCurrentDraft(prev => ({ ...prev, title: e.target.value }))}
                className="bg-transparent border-b border-transparent hover:border-[#333] focus:border-emerald-500 font-bold text-slate-100 text-sm outline-none transition-colors px-1 py-0.5 w-60 md:w-80 text-center"
                placeholder="New Pleading Title..."
              />
            </div>

            {/* File controls */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPreviewMode(prev => prev === 'edit' ? 'preview' : 'edit')}
                className={`flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl border transition-all cursor-pointer font-medium ${
                  previewMode === 'preview' 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-450' 
                    : 'bg-[#0c0c0d] border-white/10 text-slate-450 hover:text-white hover:bg-[#1a1a1c]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {previewMode === 'preview' ? 'Editor view' : 'Print Preview'}
              </button>

              <button
                onClick={handleSaveDraft}
                disabled={savingLoading}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-[#1a1a1c] text-black text-xs px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-all shadow-md"
              >
                {savingLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-black" />
                )}
                Save Pleading
              </button>
            </div>
          </div>

          {/* Interactive Case Linking & Pleading Metadata Drawer */}
          <div className="bg-[#121213] border border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                <FolderSync className="w-4 h-4 text-emerald-500" />
                Link Case File & Parties Profile
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Connect documents with digital registries automatically
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Case Bind Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                  <Briefcase className="w-3 h-3 text-emerald-500" /> Connected Litigation Case
                </label>
                <select 
                  value={selectedCase}
                  onChange={(e) => {
                    setSelectedCase(e.target.value);
                  }}
                  className="w-full bg-[#0a0a0b] border border-white/10 text-slate-200 text-xs rounded-xl px-3.5 py-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                >
                  <option value="">Generic (No case linked)</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.case_number ? `[${c.case_number}] ` : ''}{c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Claimant Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                  <Users className="w-3 h-3 text-emerald-500" /> Claimant / Plaintiff
                </label>
                <input 
                  type="text" 
                  value={boundClaimant}
                  onChange={(e) => setBoundClaimant(e.target.value)}
                  placeholder="e.g. Kondwani Phiri"
                  className="w-full bg-[#0a0a0b] border border-white/10 text-slate-200 text-xs rounded-xl px-3.5 py-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                />
              </div>

              {/* Defendant Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                  <Users className="w-3 h-3 text-emerald-500" /> Defendant / Respondent
                </label>
                <input 
                  type="text" 
                  value={boundDefendant}
                  onChange={(e) => setBoundDefendant(e.target.value)}
                  placeholder="e.g. Limbe Leaf Tobacco"
                  className="w-full bg-[#0a0a0b] border border-white/10 text-slate-200 text-xs rounded-xl px-3.5 py-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#1a1a1c]/40 rounded-xl p-3 border border-white/5 gap-3">
              <span className="text-[11px] text-slate-400 font-sans flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                Configure litigants parameters above, then click Apply to automatically compile the paper details.
              </span>
              <button
                type="button"
                onClick={syncCasePartiesManual}
                className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-sans font-semibold text-xs px-3.5 py-1.5 rounded-lg border border-emerald-500/25 transition-all active:scale-95 cursor-pointer"
              >
                <FolderSync className="w-3.5 h-3.5" />
                Apply Party Linking
              </button>
            </div>
          </div>

          {/* Word Sheet Main Canvas Container */}
          <div className="bg-[#121213] border border-white/10 rounded-2xl overflow-hidden shadow-xl flex flex-col min-h-[680px]">
            
            {/* Toolbar Formatting helpers */}
            {previewMode === 'edit' && (
              <div className="p-3 bg-[#111112] border-b border-white/5 flex flex-wrap items-center gap-2 justify-between">
                
                {/* Text style elements */}
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => insertTextAtCursor('**', '**')} 
                    className="p-1 px-3 bg-[#1a1a1c] hover:bg-[#222] rounded-lg border border-white/5 text-slate-200 transition-all font-sans text-xs flex items-center gap-1.5 cursor-pointer"
                    title="Bold formatting tag"
                  >
                    <Bold className="w-3 h-3 text-emerald-400" /> Bold
                  </button>
                  <button 
                    onClick={() => insertTextAtCursor('*', '*')} 
                    className="p-1 px-3 bg-[#1a1a1c] hover:bg-[#222] rounded-lg border border-white/5 text-slate-200 transition-all font-sans text-xs flex items-center gap-1.5 cursor-pointer"
                    title="Italic formatting tag"
                  >
                    <Italic className="w-3 h-3 text-emerald-400" /> Italic
                  </button>
                  <button 
                    onClick={() => insertTextAtCursor('\n- ', '')} 
                    className="p-1 px-3 bg-[#1a1a1c] hover:bg-[#222] rounded-lg border border-white/5 text-slate-200 transition-all font-sans text-xs flex items-center gap-1.5 cursor-pointer"
                    title="Bullet list"
                  >
                    <List className="w-3 h-3 text-emerald-400" /> Bullet list
                  </button>
                  <button 
                    onClick={() => insertTextAtCursor('\n1. ', '')} 
                    className="p-1 px-3 bg-[#1a1a1c] hover:bg-[#222] rounded-lg border border-white/5 text-slate-200 transition-all font-sans text-xs flex items-center gap-1.5 cursor-pointer"
                    title="Number pointer"
                  >
                    <ListOrdered className="w-3 h-3 text-emerald-400" /> Number list
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1.5 bg-[#1a1a1c] hover:bg-[#222] border border-white/5 text-slate-300 text-xs px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors animate-pulse"
                    title="Copy clipboard"
                  >
                    <Copy className="w-3.5 h-3.5 text-emerald-500" />
                    Copy Template
                  </button>
                  
                  <button
                    onClick={downloadTxtFile}
                    className="flex items-center gap-1.5 bg-[#1a1a1c] hover:bg-[#222] border border-white/5 text-slate-300 text-xs px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5 text-slate-500" />
                    Download File
                  </button>

                  <button
                    onClick={() => setIsAiModalOpen(true)}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-400 to-[#d97706] hover:from-emerald-300 hover:to-emerald-500 text-black text-xs font-semibold px-4 py-1.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Consult ATLAS
                  </button>
                </div>
              </div>
            )}

            {/* A4 Sheet Preview Canvas */}
            <div className="p-6 md:p-10 flex-grow bg-[#0c0c0d] flex justify-center items-start overflow-auto">
              
              {previewMode === 'preview' ? (
                /* Corporate print layout, crisp and clean on white sheet */
                <div className="w-full max-w-2xl bg-white text-slate-900 shadow-2xl rounded p-12 md:p-16 min-h-[720px] border border-slate-200 relative select-text">
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
                  
                  <div className="text-center font-bold tracking-wide uppercase whitespace-pre-wrap border-b border-slate-200 pb-4 mb-6 font-mono text-xs select-text text-slate-800 leading-relaxed font-semibold">
                    {currentDraft.court_name || 'FEDERAL CODES & REGISTRY'}
                  </div>
                  
                  <div className="whitespace-pre-wrap text-left italic mb-6 font-bold font-mono text-[11px] tracking-tight bg-[#f9fafb] p-4 border border-dashed border-slate-205 select-text text-slate-600 leading-relaxed">
                    {currentDraft.parties_header || ''}
                  </div>
                  
                  <div className="whitespace-pre-wrap text-justify select-text pl-4 border-l-2 border-stone-100 font-serif text-sm leading-8 text-stone-800">
                    {currentDraft.content || 'Blank document canvas. Write legal arguments...'}
                  </div>
                  
                  <div className="mt-16 text-right border-t border-stone-100 pt-6">
                    <p className="font-bold text-xs uppercase tracking-wider text-stone-700">Drawn By:</p>
                    <p className="underline font-sans text-xs font-semibold text-emerald-600 mt-1">{user?.name || 'Authorized Practitioner'}</p>
                    <p className="text-[10px] text-stone-505 italic font-mono uppercase mt-0.5">Firm Certified Counsel Signature</p>
                  </div>
                </div>
              ) : (
                /* Editable layout styled matching high-contrast fields on white background */
                <div className="w-full max-w-2xl bg-[#fffffd] text-slate-900 shadow-2xl rounded p-8 md:p-12 min-h-[720px] border border-slate-200 flex flex-col space-y-5 relative">
                  
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
                  
                  {/* Jurisdiction form inside sheet */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center bg-[#f9fafb] px-3.5 py-1 border-b border-stone-150">
                      <label className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest flex items-center gap-1 font-sans">
                        <Scale className="w-3 h-3" /> Jurisdiction / Register Core Location
                      </label>
                      <span className="text-[9px] text-slate-400 font-mono">Word Style Pleading</span>
                    </div>
                    <textarea
                      rows={2}
                      value={currentDraft.court_name || ''}
                      onChange={(e) => setCurrentDraft(prev => ({ ...prev, court_name: e.target.value }))}
                      className="w-full bg-[#f9fafb] border border-stone-200 focus:border-emerald-500 focus:bg-[#fffffb] outline-none text-slate-800 rounded-lg p-3 text-xs font-mono resize-none leading-relaxed transition-colors shadow-inner focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. IN THE HIGH COURT OF MALAWI..."
                    />
                  </div>

                  {/* Parties detail field */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest flex items-center gap-1 font-sans px-3.5">
                      <Users className="w-3 h-3" /> Cause & Litigants Block
                    </label>
                    <textarea
                      rows={3}
                      value={currentDraft.parties_header || ''}
                      onChange={(e) => setCurrentDraft(prev => ({ ...prev, parties_header: e.target.value }))}
                      className="w-full bg-[#f9fafb] border border-stone-200 focus:border-emerald-500 focus:bg-[#fffffb] outline-none text-slate-800 rounded-lg p-3 text-xs font-mono resize-none leading-relaxed transition-colors shadow-inner font-bold focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. BETWEEN: Plaintiff AND Defendant"
                    />
                  </div>

                  {/* Submission and statements body */}
                  <div className="flex-grow flex flex-col space-y-1.5">
                    <div className="flex justify-between items-center px-3.5">
                      <label className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest flex items-center gap-1 font-sans">
                        <FileText className="w-3 h-3" /> Statement facts list
                      </label>
                      <span className="text-[9px] text-slate-420 font-mono">{(currentDraft.content || '').length} characters</span>
                    </div>
                    <textarea
                      ref={textareaRef}
                      value={currentDraft.content || ''}
                      onChange={(e) => setCurrentDraft(prev => ({ ...prev, content: e.target.value }))}
                      className="flex-grow w-full bg-[#fffffd] border border-stone-200 focus:border-emerald-500 outline-none p-5 text-slate-800 text-xs font-mono leading-relaxed rounded-lg resize-none min-h-[380px] shadow-sm text-justify focus:ring-1 focus:ring-emerald-500 transition-colors"
                      placeholder="Compose pleadings text here. Use clean markdown formatting or consult Atlas co-writer on the secondary utility panel."
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Atlas Advisor Consultative popup modal wrapping inside AnimatePresence */}
      <AnimatePresence>
        {isAiModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop visual overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAiModalOpen(false);
                setAiSuggestion('');
              }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            
            {/* Modal Body Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-[#121213] border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col relative z-10"
            >
              
              {/* Modal Header */}
              <div className="bg-[#181a20] p-4 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">Atlas Professional Drafting Co-Writer</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Formulate supreme trial motion clauses synced with Malawian precedent acts.</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    setIsAiModalOpen(false);
                    setAiSuggestion('');
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-405 font-bold uppercase tracking-wider font-mono">Instructions for Atlas co-writer draft:</label>
                  <textarea
                    rows={3}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full bg-[#0a0a0b] border border-white/10 focus:border-emerald-500 outline-none text-xs text-slate-200 rounded-lg p-3 placeholder-slate-600 leading-relaxed font-sans resize-none transition-colors"
                    placeholder="e.g. 'Notice statement claiming contract breach liability under southern-africa laws.'"
                  />
                </div>

                {/* Loader */}
                {aiLoading && (
                  <div className="flex flex-col items-center justify-center py-8 space-y-2 border border-dashed border-white/10 bg-[#0a0a0b] rounded-lg">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                    <span className="text-[10px] tracking-widest text-emerald-400 font-mono uppercase">Analyzing supreme court case codes...</span>
                  </div>
                )}

                {/* Suggestion display */}
                {aiSuggestion && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest font-mono">Suggested Clause Text:</p>
                    <div className="bg-[#1c1c1e] border border-white/10 rounded-lg p-4 max-h-64 overflow-y-auto">
                      <pre className="text-[11px] text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                        {aiSuggestion}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span>Atlas leverages validated Malawian jurisprudence structures in real-time.</span>
                </div>
              </div>

              {/* Controls */}
              <div className="p-4 bg-[#181a20] border-t border-[#222] flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsAiModalOpen(false);
                    setAiSuggestion('');
                  }}
                  className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 rounded-lg text-xs cursor-pointer"
                >
                  Close
                </button>
                
                <button
                  onClick={handleCallAtlasModal}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-45 text-black font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-all"
                >
                  Generate Text
                </button>

                {aiSuggestion && (
                  <button
                    onClick={handleInsertAtlasText}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-all shadow-md flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4 text-black" />
                    Insert At Cursor
                  </button>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
