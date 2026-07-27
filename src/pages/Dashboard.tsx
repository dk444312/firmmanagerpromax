import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { 
  PlusCircle, UploadCloud, CalendarPlus, Briefcase, Calendar, CheckSquare, 
  Edit, Trash2, XCircle, Link as LinkIcon, Clock, Mail, FileText, Plus, 
  Search, UserPlus, ChevronLeft, ChevronRight, AlertCircle, Check, 
  Activity, X, ExternalLink, MessageSquare, Sparkles, ShieldAlert, Users, FolderCheck, Scale, Coins
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // Primary Data State
  const [cases, setCases] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  
  // Quick Action Lookup Data State
  const [staff, setStaff] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [filingLogs, setFilingLogs] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // Fetch standard date string representation
  const getLocalDateString = (dateObj: Date = new Date()) => {
    const d = dateObj;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  };

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(getLocalDateString());

  // Universal Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState<any>(null);

  const performSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      } else {
        console.error("Failed to fetch search results");
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }

    if (!val.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(val);
    }, 400);
    setSearchDebounce(timer);
  };

  // Quick Action Modal Switcher
  const [activeQuickAction, setActiveQuickAction] = useState<'client' | 'case' | 'document' | 'hearing' | 'task' | 'email' | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // ----------------------------------------------------
  // QUICK ACTIONS FORM STATES
  // ----------------------------------------------------
  
  // 1. New Client
  const [newClient, setNewClient] = useState({
    full_name: '',
    username: '',
    email: '',
    phone_number: '',
    gender: 'Male',
    company: '',
    password: ''
  });

  // 2. New Case
  const [newCase, setNewCase] = useState({
    title: '',
    case_number: '',
    claimant: '',
    defendant: '',
    court: 'High Court',
    specific_court_other: '',
    registry_court: '',
    judge_name: '',
    brief_facts: '',
    description: '',
    status: 'Active',
    stage: 'Client Consultation',
    client_id: ''
  });

  // 3. Upload Document
  const [uploadDoc, setUploadDoc] = useState({
    filename: '',
    folder_id: '',
    case_id: '',
    requires_approval: false,
    pending_filing: false
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // 4. Schedule Hearing
  const [newHearing, setNewHearing] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    case_id: '',
    type: 'Court Date'
  });

  // 5. Create Task
  const [newTask, setNewTask] = useState({
    name: '',
    priority: 'Medium',
    case_id: '',
    due_date: '',
    assigned_to: [] as string[]
  });

  // 6. Send Email
  const [newEmail, setNewEmail] = useState({
    recipient_email: '',
    subject: '',
    body: '',
    client_id: ''
  });



  const fetchData = async () => {
    if (!token || !supabase || !user) return;
    try {
      const [
        casesRes,
        eventsRes,
        tasksRes,
        draftsRes,
        filesRes,
        channelMembersRes,
        messagesRes,
        appointmentsRes,
        staffRes,
        clientsRes,
        foldersRes,
        filingLogsRes
      ] = await Promise.all([
        supabase.from('cases').select('*').eq('firm_id', user.firm_id),
        supabase.from('events').select('*').eq('firm_id', user.firm_id),
        supabase.from('tasks').select('*').eq('firm_id', user.firm_id),
        supabase.from('drafting_documents').select('*').eq('firm_id', user.firm_id),
        supabase.from('files').select('*').eq('firm_id', user.firm_id),
        supabase.from('channel_members').select('*'),
        supabase.from('messages').select('*').eq('firm_id', user.firm_id),
        supabase.from('appointments').select('*').eq('firm_id', user.firm_id),
        supabase.from('staff').select('id, name, role').eq('firm_id', user.firm_id),
        supabase.from('clients').select('id, full_name, email, phone_number, created_at').eq('firm_id', user.firm_id),
        supabase.from('folders').select('id, name').eq('firm_id', user.firm_id),
        supabase.from('filing_logs').select('*').eq('firm_id', user.firm_id)
      ]);

      setCases(casesRes.data || []);
      setEvents(eventsRes.data || []);
      setTasks(tasksRes.data || []);
      setDrafts(draftsRes.data || []);
      setFiles(filesRes.data || []);
      setChannelMembers(channelMembersRes.data || []);
      setMessages(messagesRes.data || []);
      setAppointments(appointmentsRes.data || []);
      setStaff(staffRes.data || []);
      setClients(clientsRes.data || []);
      setFolders(foldersRes.data || []);
      setFilingLogs(filingLogsRes.data || []);
    } catch (err) {
      console.error("Dashboard failed to load database stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  if (!user) return null;

  const todayStr = getLocalDateString();

  // ----------------------------------------------------
  // COMPUTED PROPERTIES (TODAY'S PLANNING DETAILS)
  // ----------------------------------------------------
  
  // 1. Today's Hearings: Events scheduled for today with type === 'Court Date'
  const todayHearings = events.filter((e: any) => e.date === todayStr && e.type === 'Court Date');
  
  // 2. Today's Deadlines: Tasks scheduled for today that are not Completed
  const todayDeadlines = tasks.filter((t: any) => t.due_date === todayStr && t.status !== 'Completed');
  
  // 3. Pending Drafting: Count of documents waiting inside drafting_documents
  const pendingDraftingCount = drafts.length;

  // 4. Unread Messages: messages inside channels the user belongs to created after the user's last_read_at timestamp
  const userChannels = channelMembers.filter((m: any) => m.user_id === user.id);
  const unreadMessages = messages.filter((msg: any) => {
    const member = userChannels.find((m: any) => m.channel_id === msg.channel_id);
    if (!member) return false;
    if (msg.sender_id === user.id) return false; // Ignore own messages
    return new Date(msg.created_at) > new Date(member.last_read_at);
  });
  const unreadMessagesCount = unreadMessages.length;

  // 5. Files Waiting for Review: requires_approval is true and approval_status is pending
  const filesWaitingReview = files.filter((f: any) => f.requires_approval === true && f.approval_status === 'pending');

  // 6. Cases Requiring Immediate Action: Active cases linked to high priority overdue tasks or court hearings today
  const immediateCaseIds = new Set<string>();
  tasks.forEach((t: any) => {
    if (t.priority === 'High' && t.status !== 'Completed' && t.case_id) {
      if (t.due_date && t.due_date <= todayStr) {
        immediateCaseIds.add(t.case_id);
      }
    }
  });
  events.forEach((e: any) => {
    if (e.date === todayStr && e.case_id) {
      immediateCaseIds.add(e.case_id);
    }
  });
  const immediateCasesList = cases.filter((c: any) => immediateCaseIds.has(c.id));
  const casesImmediateActionCount = immediateCasesList.length;

  // 7. Court Attendance Today
  const courtAttendanceToday = events.filter((e: any) => e.date === todayStr && e.type === 'Court Date');

  // ----------------------------------------------------
  // ADDITIONAL FIRM-WIDE STATISTICS (REAL-TIME SNAPSHOT)
  // ----------------------------------------------------
  
  // Total Clients
  const totalClientsCount = clients.length;

  // New Clients This Month
  const getNewClientsThisMonthCount = () => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);
    return clients.filter((c: any) => c.created_at && new Date(c.created_at) >= startOfMonth).length;
  };
  const newClientsThisMonth = getNewClientsThisMonthCount();

  // Hearings This Week (current calendar week)
  const getHearingsThisWeekCount = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDay);
    startOfWeek.setHours(0,0,0,0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23,59,59,999);

    return events.filter((e: any) => {
      if (e.type !== 'Court Date') return false;
      const d = new Date(e.date);
      return d >= startOfWeek && d <= endOfWeek;
    }).length;
  };
  const hearingsThisWeek = getHearingsThisWeekCount();

  // Documents Uploaded Today
  const docsUploadedTodayCount = files.filter((f: any) => {
    const d = new Date(f.created_at);
    return d.toDateString() === new Date().toDateString();
  }).length;

  // Pending Bills (Count & Total outstanding from filing logs)
  const pendingBillsCount = filingLogs.length;
  const pendingBillsAmount = filingLogs.reduce((acc: number, cur: any) => acc + Number(cur.rate_mwk || 0), 0);

  // Cases Awaiting Hearing (c.stage === 'Applications' or falls back to Active pre-trial stages)
  const casesAwaitingHearingCount = cases.filter((c: any) => c.status === 'Active' && (c.stage === 'Applications' || c.stage === 'Pre-Trial Conference' || c.stage === 'Filing')).length;

  // Cases Awaiting Judgment (c.stage === 'Judgment' or falls back to Active trial stages)
  const casesAwaitingJudgmentCount = cases.filter((c: any) => c.status === 'Active' && (c.stage === 'Trial' || c.stage === 'Judgment' || c.stage === 'Appeal')).length;

  // ----------------------------------------------------
  // RECENT ACTIVITIES STREAM GENERATOR
  // ----------------------------------------------------
  const getRecentActivities = () => {
    const list: any[] = [];

    // Document uploads
    files.forEach((f: any) => {
      list.push({
        id: f.id,
        type: 'document_upload',
        title: 'Document Vaulted',
        subtitle: `${f.filename} was uploaded by ${staff.find(s => s.id === f.uploaded_by)?.name || 'Staff'}.`,
        createdAt: new Date(f.created_at),
        link: '/files'
      });
    });

    // New cases
    cases.forEach((c: any) => {
      list.push({
        id: c.id,
        type: 'new_matter',
        title: 'New Matter Opened',
        subtitle: `Case: "${c.title}" (${c.case_number || 'N/A'}) was registered in the firm database.`,
        createdAt: new Date(c.created_at),
        link: '/cases'
      });
    });

    // Hearings
    events.filter((e: any) => e.type === 'Court Date').forEach((e: any) => {
      list.push({
        id: e.id,
        type: 'hearing_scheduled',
        title: 'Hearing Scheduled',
        subtitle: `"${e.title}" was scheduled on ${e.date} at ${e.time}.`,
        createdAt: new Date(e.created_at || e.date),
        link: '/diary/upcoming'
      });
    });

    // Closed matters
    cases.filter((c: any) => c.status === 'Closed').forEach((c: any) => {
      list.push({
        id: c.id,
        type: 'matter_closed',
        title: 'Matter Closed',
        subtitle: `Case: "${c.title}" has been completed and marked as resolved.`,
        createdAt: new Date(c.created_at),
        link: '/cases'
      });
    });

    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6);
  };

  const recentActivities = getRecentActivities();

  // ----------------------------------------------------
  // MINI CALENDAR LOGIC
  // ----------------------------------------------------
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(month, year);
  const firstDayIndex = getFirstDayOfMonth(month, year);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Calendar Highlight Markers Checkers
  const checkDayHasHearing = (dayStr: string) => {
    return events.some((e: any) => e.date === dayStr && e.type === 'Court Date');
  };

  const checkDayHasAppointment = (dayStr: string) => {
    return appointments.some((a: any) => a.date === dayStr) || events.some((e: any) => e.date === dayStr && e.type !== 'Court Date');
  };

  const checkDayHasDeadline = (dayStr: string) => {
    return tasks.some((t: any) => t.due_date === dayStr && t.status !== 'Completed');
  };

  // Agenda list for selected calendar date
  const selectedDateEvents = events.filter((e: any) => e.date === selectedCalendarDate);
  const selectedDateAppointments = appointments.filter((a: any) => a.date === selectedCalendarDate);
  const selectedDateTasks = tasks.filter((t: any) => t.due_date === selectedCalendarDate && t.status !== 'Completed');

  // Greeting Message based on time of day
  const getGreetingText = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 18) return "Good afternoon";
    return "Good evening";
  };

  const getBriefingSummary = () => {
    let msg = `You have ${todayHearings.length} hearings, ${todayDeadlines.length} deadlines, and ${filesWaitingReview.length} files awaiting review today.`;
    if (todayHearings.length === 0 && todayDeadlines.length === 0 && filesWaitingReview.length === 0) {
      msg = "Your schedule is clear of immediate hearings and deadlines today. Excellent opportunity to review case briefs.";
    }
    return msg;
  };

  // ----------------------------------------------------
  // QUICK ACTIONS MUTATIONS
  // ----------------------------------------------------

  // 1. Create Client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    setIsSubmittingAction(true);
    try {
      const plainPassword = newClient.password || 'client123';
      const hash = await import('bcryptjs').then(m => m.hash(plainPassword, 10));

      const payload = {
        firm_id: user.firm_id,
        full_name: newClient.full_name,
        username: newClient.username,
        email: newClient.email || null,
        phone_number: newClient.phone_number || null,
        gender: newClient.gender,
        company: newClient.company || null,
        password_hash: hash,
        status: 'active'
      };

      const { error } = await supabase.from('clients').insert([payload]);
      if (error) throw error;

      toast.success(`Client "${newClient.full_name}" registered! Password is set to: ${plainPassword}`);
      setNewClient({ full_name: '', username: '', email: '', phone_number: '', gender: 'Male', company: '', password: '' });
      setActiveQuickAction(null);
      await fetchData();
    } catch (err: any) {
      toast.error(`Failed to register client: ${err.message || err}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 2. Create Case
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    setIsSubmittingAction(true);
    try {
      const payload = {
        firm_id: user.firm_id,
        title: newCase.title,
        case_number: newCase.case_number || null,
        claimant: newCase.claimant || null,
        defendant: newCase.defendant || null,
        court: newCase.court,
        specific_court_other: newCase.specific_court_other || null,
        registry_court: newCase.registry_court || null,
        judge_name: newCase.judge_name || null,
        brief_facts: newCase.brief_facts || null,
        description: newCase.description || null,
        status: newCase.status,
        stage: newCase.stage,
        client_id: newCase.client_id || null
      };

      const { error } = await supabase.from('cases').insert([payload]);
      if (error) throw error;

      toast.success(`New matter "${newCase.title}" has been initialized successfully.`);
      setNewCase({
        title: '', case_number: '', claimant: '', defendant: '', court: 'High Court',
        specific_court_other: '', registry_court: '', judge_name: '', brief_facts: '',
        description: '', status: 'Active', stage: 'Client Consultation', client_id: ''
      });
      setActiveQuickAction(null);
      await fetchData();
    } catch (err: any) {
      toast.error(`Failed to open case: ${err.message || err}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 3. Drag and Drop + Upload File
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!uploadDoc.filename) {
        setUploadDoc(prev => ({ ...prev, filename: file.name }));
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!uploadDoc.filename) {
        setUploadDoc(prev => ({ ...prev, filename: file.name }));
      }
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    setIsSubmittingAction(true);
    try {
      let destFolderId = uploadDoc.folder_id;
      if (!destFolderId) {
        const unsorted = folders.find((f: any) => f.name === 'Unsorted Vault');
        if (unsorted) {
          destFolderId = unsorted.id;
        } else {
          const { data: newF, error: folderErr } = await supabase
            .from('folders')
            .insert([{ name: 'Unsorted Vault', firm_id: user.firm_id }])
            .select()
            .single();
          if (folderErr) throw folderErr;
          destFolderId = newF.id;
        }
      }

      // Auto-generate standardized filename based on User Goal:
      // YYYY-MM-DD_Category_Claimant_v_Defendant.ext
      const originalName = selectedFile ? selectedFile.name : `Document-${Date.now()}.pdf`;
      let finalFilename = uploadDoc.filename || originalName;
      
      const linkedCase = cases.find((c: any) => c.id === uploadDoc.case_id);

      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '';
        const cleanStr = (s: string) => (s || '').replace(/[^a-zA-Z0-9]/g, '');

        let claimant = '';
        let defendant = '';

        if (linkedCase) {
          claimant = cleanStr(linkedCase.claimant);
          defendant = cleanStr(linkedCase.defendant);
        }

        const cleanCategory = uploadDoc.filename ? cleanStr(uploadDoc.filename) : 'Document';
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
        console.error("Auto naming failed in Dashboard, falling back", err);
      }

      let fileUrl = '#';
      if (selectedFile) {
        const cleanedName = `${Date.now()}-${finalFilename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const { data, error: storageErr } = await supabase.storage.from('files').upload(cleanedName, selectedFile);
        if (storageErr) throw storageErr;
        
        if (data) {
          const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(cleanedName);
          fileUrl = publicUrl;
        }
      }

      const payload = {
        firm_id: user.firm_id,
        folder_id: destFolderId,
        filename: finalFilename,
        file_url: fileUrl,
        case_id: uploadDoc.case_id || null,
        case_title: linkedCase ? linkedCase.title : null,
        requires_approval: uploadDoc.requires_approval,
        approval_status: uploadDoc.requires_approval ? 'pending' : 'approved',
        pending_filing: uploadDoc.pending_filing,
        uploaded_by: user.id
      };

      const { error } = await supabase.from('files').insert([payload]);
      if (error) throw error;

      toast.success("Document successfully uploaded and cataloged in the Vault.");
      setUploadDoc({ filename: '', folder_id: '', case_id: '', requires_approval: false, pending_filing: false });
      setSelectedFile(null);
      setActiveQuickAction(null);
      await fetchData();
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || err}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 4. Create Hearing
  const handleCreateHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    setIsSubmittingAction(true);
    try {
      const linkedCase = cases.find((c: any) => c.id === newHearing.case_id);
      const payload = {
        firm_id: user.firm_id,
        title: newHearing.title,
        description: newHearing.description || null,
        date: newHearing.date,
        time: newHearing.time ? `${newHearing.time}:00` : '09:00:00',
        case_id: newHearing.case_id || null,
        case_title: linkedCase ? linkedCase.title : null,
        type: newHearing.type,
        created_by: user.id
      };

      const { error } = await supabase.from('events').insert([payload]);
      if (error) throw error;

      toast.success(`Court hearing "${newHearing.title}" has been added to the firm diary.`);
      setNewHearing({ title: '', description: '', date: '', time: '', case_id: '', type: 'Court Date' });
      setActiveQuickAction(null);
      await fetchData();
    } catch (err: any) {
      toast.error(`Scheduling failed: ${err.message || err}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 5. Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    setIsSubmittingAction(true);
    try {
      const linkedCase = cases.find((c: any) => c.id === newTask.case_id);
      const payload = {
        firm_id: user.firm_id,
        name: newTask.name,
        priority: newTask.priority,
        status: 'Pending',
        case_id: newTask.case_id || null,
        case_title: linkedCase ? linkedCase.title : null,
        due_date: newTask.due_date || null,
        assigned_to: newTask.assigned_to,
        created_by: user.id
      };

      const { error } = await supabase.from('tasks').insert([payload]);
      if (error) throw error;

      toast.success(`Task "${newTask.name}" successfully created and assigned.`);
      setNewTask({ name: '', priority: 'Medium', case_id: '', due_date: '', assigned_to: [] });
      setActiveQuickAction(null);
      await fetchData();
    } catch (err: any) {
      toast.error(`Failed to assign task: ${err.message || err}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 6. Send Email (Direct Serverless Integration via Trigger)
  const handleSendEmailAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !supabase || !user) return;
    setIsSubmittingAction(true);
    try {
      const payload = {
        firm_id: user.firm_id,
        recipient_email: newEmail.recipient_email,
        subject: newEmail.subject,
        body: `<div style="font-family: 'Poppins', sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
                 <h2 style="color: #10b981; font-weight: 600; margin-bottom: 16px;">FirmManager Automated Dispatch</h2>
                 <p style="font-size: 15px; line-height: 1.6; color: #334155;">${newEmail.body.replace(/\n/g, '<br>')}</p>
                 <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                 <p style="font-size: 11px; color: #94a3b8; line-height: 1.5;">This is an authenticated legal communication sent securely via FirmManager Practice Management Engine.</p>
               </div>`,
        status: 'pending',
        recipient_id: newEmail.client_id || null
      };

      const { error } = await supabase.from('email_logs').insert([payload]);
      if (error) throw error;

      toast.success("Client communication sent! Running serverless out-of-band delivery...");
      setNewEmail({ recipient_email: '', subject: '', body: '', client_id: '' });
      setActiveQuickAction(null);
      await fetchData();
    } catch (err: any) {
      toast.error(`Failed to dispatch email: ${err.message || err}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Calculate Calendar Month Grid
  const days = [];
  // padding for previous month offset
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(null);
  }
  // current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto overflow-y-auto h-full space-y-8 select-none">
      
      {/* ----------------------------------------------------
          TOP BANNER: PERSONALIZED GREETING
         ---------------------------------------------------- */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase">
              Operational briefing
            </span>
            <span className="text-slate-400 text-xs font-mono">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight mt-2 flex items-center gap-2">
            {getGreetingText()}, {user.name}
          </h1>
          <p className="text-slate-300 mt-2 text-base max-w-2xl font-light leading-relaxed">
            {getBriefingSummary()}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-[#121212] p-4 rounded-2xl border border-white/5">
          <div className="text-right">
            <div className="text-sm font-semibold text-white">{user.name}</div>
            <div className="text-xs text-emerald-400 font-mono mt-0.5">{user.role}</div>
          </div>
          <div className="w-12 h-12 rounded-xl border border-white/10 overflow-hidden bg-[#1a1c20] flex items-center justify-center shadow-inner">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-full h-full object-cover" referrerPolicy="referrer" />
            ) : (
              <div className="text-xl font-bold text-emerald-400">{user.name.charAt(0)}</div>
            )}
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------
          UNIVERSAL SEARCH SYSTEM
         ---------------------------------------------------- */}
      <div className="relative z-35">
        <div className="bg-[#121212] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" /> Universal Search Engine
            </h3>
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                className="text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 px-3 py-1 rounded-xl font-medium transition-colors"
              >
                Clear Search
              </button>
            )}
          </div>
          <div className="relative">
            <input 
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search entire system (clients, cases, documents, hearings, messages, notes, tasks, milestones)..."
              className="w-full pl-12 pr-4 py-4 bg-[#0a0a0a] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-base font-light shadow-inner transition-all"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {isSearching ? (
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="w-5 h-5 text-slate-500" />
              )}
            </div>
          </div>

          {/* Search Results Display */}
          <AnimatePresence>
            {searchQuery && searchResults && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-6 border-t border-white/5 pt-6 space-y-6"
              >
                {Object.values(searchResults).every((arr: any) => !arr || arr.length === 0) ? (
                  <div className="text-center py-10">
                    <p className="text-slate-400 text-sm">No records found matching "<span className="text-white font-medium">{searchQuery}</span>".</p>
                    <p className="text-xs text-slate-600 mt-1">Try searching for alternative keywords (e.g. Richard, Court, Case, Client name).</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Cases Column */}
                    {searchResults.cases && searchResults.cases.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5" /> Matters ({searchResults.cases.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.cases.map((c: any) => (
                            <Link 
                              key={c.id} 
                              to={`/cases/${c.id}`}
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-emerald-500/20 transition-all group text-left"
                            >
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-mono font-bold text-emerald-400">{c.case_number || 'No Number'}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400 font-semibold">{c.status}</span>
                              </div>
                              <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors truncate">{c.title}</p>
                              {c.claimant && <p className="text-[11px] text-slate-500 mt-1 truncate">Claimant: {c.claimant} v. Defendant: {c.defendant}</p>}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Clients Column */}
                    {searchResults.clients && searchResults.clients.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Clients ({searchResults.clients.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.clients.map((c: any) => (
                            <Link 
                              key={c.id} 
                              to="/clients"
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-blue-500/20 transition-all group text-left"
                            >
                              <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">{c.full_name}</p>
                              {c.company && <p className="text-[11px] text-slate-400 font-medium">{c.company}</p>}
                              <div className="flex gap-4 mt-1.5 text-[11px] text-slate-500">
                                {c.email && <span className="truncate">{c.email}</span>}
                                {c.phone_number && <span>{c.phone_number}</span>}
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Files/Documents Column */}
                    {searchResults.files && searchResults.files.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Documents ({searchResults.files.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.files.map((f: any) => (
                            <Link 
                              key={f.id} 
                              to={`/files/${f.folder_id}`}
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-purple-500/20 transition-all group text-left"
                            >
                              <p className="text-sm font-semibold text-white group-hover:text-purple-400 transition-colors truncate">{f.filename}</p>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">v{f.version_number || '1.0'}</span>
                                <span className="text-[10px] text-slate-500">{f.classification || 'Draft'}</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hearings / Events Column */}
                    {searchResults.events && searchResults.events.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> Diary & Hearings ({searchResults.events.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.events.map((e: any) => (
                            <Link 
                              key={e.id} 
                              to="/diary/upcoming"
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-amber-500/20 transition-all group text-left"
                            >
                              <div className="flex justify-between items-center mb-1 text-[10px] font-mono text-amber-400 font-bold">
                                <span>{e.date} {e.time}</span>
                                <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400">{e.type}</span>
                              </div>
                              <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors truncate">{e.title}</p>
                              {e.description && <p className="text-[11px] text-slate-500 mt-1 truncate">{e.description}</p>}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Messages Column */}
                    {searchResults.messages && searchResults.messages.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5" /> Chat Messages ({searchResults.messages.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.messages.map((m: any) => (
                            <Link 
                              key={m.id} 
                              to={m.source === 'atlas' ? '/atlas' : '/messages'}
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-cyan-500/20 transition-all group text-left"
                            >
                              <div className="flex justify-between items-center mb-1 text-[9px] font-semibold tracking-wider uppercase">
                                <span className={m.source === 'atlas' ? 'text-purple-400' : 'text-blue-400'}>{m.source} Thread</span>
                                <span className="text-slate-500 font-mono">{new Date(m.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-xs text-slate-300 leading-normal line-clamp-3 italic">"{m.content}"</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Case Notes Column */}
                    {searchResults.notes && searchResults.notes.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Edit className="w-3.5 h-3.5" /> Case Notes ({searchResults.notes.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.notes.map((n: any) => (
                            <Link 
                              key={n.id} 
                              to={`/cases/${n.case_id}`}
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-pink-500/20 transition-all group text-left"
                            >
                              <div className="flex justify-between items-center mb-1 text-[9px] font-semibold text-slate-500">
                                <span>Note Entry</span>
                                <span className="font-mono">{new Date(n.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">"{n.note}"</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tasks Column */}
                    {searchResults.tasks && searchResults.tasks.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckSquare className="w-3.5 h-3.5" /> Tasks ({searchResults.tasks.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.tasks.map((t: any) => (
                            <Link 
                              key={t.id} 
                              to="/tasks"
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-rose-500/20 transition-all group text-left"
                            >
                              <div className="flex justify-between items-center mb-1 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                                  t.priority === 'High' ? 'bg-red-500/10 text-red-400' :
                                  t.priority === 'Medium' ? 'bg-amber-500/10 text-amber-400' :
                                  'bg-blue-500/10 text-blue-400'
                                }`}>{t.priority} Priority</span>
                                <span className="text-slate-500">{t.due_date}</span>
                              </div>
                              <p className="text-sm font-semibold text-white group-hover:text-rose-400 transition-colors truncate">{t.name}</p>
                              <p className="text-[11px] text-slate-500 mt-1">Status: <span className="text-slate-400 font-medium">{t.status}</span></p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Folders Column */}
                    {searchResults.folders && searchResults.folders.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                            <FolderCheck className="w-3.5 h-3.5" /> Folders ({searchResults.folders.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.folders.map((f: any) => (
                            <Link 
                              key={f.id} 
                              to={`/files/${f.id}`}
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-yellow-500/20 transition-all group text-left"
                            >
                              <p className="text-sm font-semibold text-white group-hover:text-yellow-400 transition-colors truncate">{f.name}</p>
                              <p className="text-[10px] text-slate-500 mt-1">Practice folder storage</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Milestones Column */}
                    {searchResults.milestones && searchResults.milestones.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> Case Milestones ({searchResults.milestones.length})
                          </span>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {searchResults.milestones.map((m: any) => (
                            <Link 
                              key={m.id} 
                              to={`/cases/${m.case_id}`}
                              className="block p-3 rounded-xl bg-[#0a0a0a] border border-white/5 hover:border-emerald-500/20 transition-all group text-left"
                            >
                              <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors truncate">{m.title}</p>
                              {m.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{m.description}</p>}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ----------------------------------------------------
          "TODAY AT A GLANCE" METRIC BENTO GRID (7 Cards)
         ---------------------------------------------------- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" /> Today at a Glance
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          
          {/* Card 1: Today's Hearings */}
          <Link to="/diary/upcoming" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-emerald-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Hearings</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                {todayHearings.length}
              </span>
              <span className="text-xs text-slate-500">scheduled</span>
            </div>
          </Link>

          {/* Card 2: Today's Deadlines */}
          <Link to="/tasks" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-rose-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Deadlines</span>
              <CheckSquare className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white group-hover:text-rose-400 transition-colors">
                {todayDeadlines.length}
              </span>
              <span className="text-xs text-slate-500">pending</span>
            </div>
          </Link>

          {/* Card 3: Pending Drafting */}
          <Link to="/atlas" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-purple-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Pending Drafting</span>
              <FileText className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white group-hover:text-purple-400 transition-colors">
                {pendingDraftingCount}
              </span>
              <span className="text-xs text-slate-500">drafts</span>
            </div>
          </Link>

          {/* Card 4: Unread Messages */}
          <Link to="/messages" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-blue-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Unread Messages</span>
              <MessageSquare className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white group-hover:text-blue-400 transition-colors">
                {unreadMessagesCount}
              </span>
              <span className="text-xs text-slate-500">new messages</span>
            </div>
          </Link>

          {/* Card 5: Files Waiting for Review */}
          <Link to="/files" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-amber-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Review Vault</span>
              <FolderCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white group-hover:text-amber-400 transition-colors">
                {filesWaitingReview.length}
              </span>
              <span className="text-xs text-slate-500">to review</span>
            </div>
          </Link>

          {/* Card 6: Cases Immediate Action */}
          <Link to="/cases" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-red-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Action Matters</span>
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white group-hover:text-red-400 transition-colors">
                {casesImmediateActionCount}
              </span>
              <span className="text-xs text-slate-500">critical</span>
            </div>
          </Link>

          {/* Card 7: Court Attendance Today */}
          <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 flex flex-col justify-between h-32 relative overflow-hidden xl:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Attendance</span>
              <Briefcase className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-1">
              {courtAttendanceToday.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-emerald-400 truncate">
                    {courtAttendanceToday[0].title}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Room: {courtAttendanceToday[0].description || "General Room"}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic">No court locations today</div>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ----------------------------------------------------
          FIRM OPERATIONS EXECUTIVE SNAPSHOT (Request 16)
         ---------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Firm Operations Snapshot
          </h2>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full font-bold">
            Real-time metrics
          </span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          
          {/* 1. Total Clients */}
          <Link to="/clients" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-emerald-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Total Clients</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                {totalClientsCount}
              </span>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">registered</div>
            </div>
          </Link>

          {/* 2. New Clients This Month */}
          <Link to="/clients" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-cyan-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">New Clients</span>
              <UserPlus className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white group-hover:text-cyan-400 transition-colors">
                {newClientsThisMonth}
              </span>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">this month</div>
            </div>
          </Link>

          {/* 3. Hearings This Week */}
          <Link to="/diary/upcoming" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-amber-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Hearings Week</span>
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white group-hover:text-amber-400 transition-colors">
                {hearingsThisWeek}
              </span>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">scheduled</div>
            </div>
          </Link>

          {/* 4. Documents Uploaded Today */}
          <Link to="/files" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-purple-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Docs Today</span>
              <FolderCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white group-hover:text-purple-400 transition-colors">
                {docsUploadedTodayCount}
              </span>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">uploaded</div>
            </div>
          </Link>

          {/* 5. Pending Bills */}
          <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-rose-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Pending Bills</span>
              <Coins className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 min-w-0">
              <div className="text-base font-bold text-white group-hover:text-rose-400 transition-colors truncate">
                MWK {pendingBillsAmount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{pendingBillsCount} logs</div>
            </div>
          </div>

          {/* 6. Cases Awaiting Hearing */}
          <Link to="/cases" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-blue-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Awaiting Hearing</span>
              <Scale className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white group-hover:text-blue-400 transition-colors">
                {casesAwaitingHearingCount}
              </span>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">cases</div>
            </div>
          </Link>

          {/* 7. Cases Awaiting Judgment */}
          <Link to="/cases" className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-teal-500/30 transition-all flex flex-col justify-between group h-32 hover:translate-y-[-2px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Awaiting Judgment</span>
              <Briefcase className="w-4 h-4 text-teal-400" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-bold text-white group-hover:text-teal-400 transition-colors">
                {casesAwaitingJudgmentCount}
              </span>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">cases</div>
            </div>
          </Link>

        </div>
      </section>

      {/* ----------------------------------------------------
          MAIN TWO-COLUMN DASHBOARD SPLIT
         ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: MINI CALENDAR & RECENT ACTIVITES (2/3 width) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* A. Dynamic Miniature Calendar */}
          <section className="bg-[#121212] border border-white/5 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">Interactive Diary Calendar</h2>
                <p className="text-xs text-slate-500">Track and view scheduling without navigating away</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-400 hover:text-white transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-white min-w-[120px] text-center uppercase tracking-wider font-mono">
                  {monthNames[month]} {year}
                </span>
                <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-400 hover:text-white transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-stretch">
              
              {/* Calendar Grid - Takes 3 columns on desktop */}
              <div className="md:col-span-3 space-y-4">
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest pb-2 border-b border-white/[0.03]">
                  <div>Su</div>
                  <div>Mo</div>
                  <div>Tu</div>
                  <div>We</div>
                  <div>Th</div>
                  <div>Fr</div>
                  <div>Sa</div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {days.map((day, index) => {
                    if (day === null) {
                      return <div key={`empty-${index}`} className="aspect-square bg-transparent" />;
                    }

                    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = selectedCalendarDate === dayStr;
                    const isToday = todayStr === dayStr;
                    const hasHearing = checkDayHasHearing(dayStr);
                    const hasAppointment = checkDayHasAppointment(dayStr);
                    const hasDeadline = checkDayHasDeadline(dayStr);

                    return (
                      <button 
                        key={`day-${day}`}
                        onClick={() => setSelectedCalendarDate(dayStr)}
                        className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all group
                          ${isSelected 
                            ? 'bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-950/50 border border-emerald-500' 
                            : isToday 
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold' 
                            : 'bg-[#151619] border border-white/[0.02] hover:border-white/10 text-slate-300 hover:text-white'
                          }`}
                      >
                        <span className="text-sm">{day}</span>
                        
                        {/* Absolute indicator dots at bottom center */}
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5 items-center justify-center">
                          {hasHearing && (
                            <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400 animate-pulse'}`} title="Hearing" />
                          )}
                          {hasAppointment && (
                            <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}`} title="Meeting" />
                          )}
                          {hasDeadline && (
                            <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-rose-400'}`} title="Deadline" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Calendar Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-4 border-t border-white/5 text-[10px] text-slate-400 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Hearings</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span>Appointments</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>Deadlines</span>
                  </div>
                </div>
              </div>

              {/* Selected-Day Detailed Agenda Panel - Takes 2 columns on desktop */}
              <div className="md:col-span-2 bg-[#151619] border border-white/5 rounded-xl p-5 flex flex-col justify-between min-h-[340px]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Day Agenda</span>
                      <span className="text-xs text-white font-semibold block">
                        {(() => {
                          if (!selectedCalendarDate) return 'Select a date';
                          try {
                            const parts = selectedCalendarDate.split('-');
                            if (parts.length !== 3) return selectedCalendarDate;
                            const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                            return dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                          } catch (e) {
                            return selectedCalendarDate;
                          }
                        })()}
                      </span>
                    </div>
                    {/* Compact Date Quick Actions */}
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setNewHearing(prev => ({ ...prev, date: selectedCalendarDate }));
                          setActiveQuickAction('hearing');
                        }}
                        title="Add Court Hearing"
                        className="p-1.5 hover:bg-white/5 rounded-lg text-emerald-400 hover:text-emerald-300 border border-white/5 transition-colors"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => {
                          setNewTask(prev => ({ ...prev, due_date: selectedCalendarDate }));
                          setActiveQuickAction('task');
                        }}
                        title="Delegate Task"
                        className="p-1.5 hover:bg-white/5 rounded-lg text-rose-400 hover:text-rose-300 border border-white/5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 overflow-y-auto max-h-[250px] pr-1 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
                    {selectedDateEvents.length === 0 && selectedDateAppointments.length === 0 && selectedDateTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Sparkles className="w-8 h-8 text-slate-700 mb-2" />
                        <p className="text-slate-400 text-xs font-semibold">Agenda is Clear</p>
                        <p className="text-slate-500 text-[10px] mt-1 max-w-[150px]">No hearings, meetings, or deadlines scheduled.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {/* Selected Hearings */}
                        {selectedDateEvents.map((e: any) => (
                          <div key={e.id} className="bg-[#121212] border border-white/5 p-3 rounded-xl flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-wider">
                                {e.type}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {e.time ? e.time.substring(0, 5) : 'All Day'}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold text-white truncate">{e.title}</h4>
                            {e.case_title && (
                              <p className="text-[10px] text-slate-400 truncate">Matter: {e.case_title}</p>
                            )}
                          </div>
                        ))}

                        {/* Selected Appointments */}
                        {selectedDateAppointments.map((a: any) => (
                          <div key={a.id} className="bg-[#121212] border border-white/5 p-3 rounded-xl flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold uppercase tracking-wider">
                                Client Meeting
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {a.time ? a.time.substring(0, 5) : 'All Day'}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold text-white truncate">{a.reason || 'Consultation'}</h4>
                            <p className="text-[10px] text-slate-400 truncate">
                              Client: {clients.find((c: any) => c.id === a.client_id)?.full_name || 'Client File'}
                            </p>
                          </div>
                        ))}

                        {/* Selected Deadlines */}
                        {selectedDateTasks.map((t: any) => (
                          <div key={t.id} className="bg-[#121212] border border-white/5 p-3 rounded-xl flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold uppercase tracking-wider">
                                Task Deadline
                              </span>
                              <span className="text-[9px] text-rose-400 bg-rose-500/15 px-1 rounded font-bold uppercase">
                                {t.priority}
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold text-white truncate">{t.name}</h4>
                            {t.case_title && (
                              <p className="text-[10px] text-slate-400 truncate">Matter: {t.case_title}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Selected date focus</span>
                  <span className="text-emerald-400 font-semibold">{selectedCalendarDate}</span>
                </div>
              </div>

            </div>
          </section>

          {/* B. Live Activity Stream inside the Firm */}
          <section className="bg-[#121212] border border-white/5 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Live Firm Actions Stream</h2>
              <p className="text-xs text-slate-500">Real-time chronicle of recent documents, events, and cases registered within the firm</p>
            </div>

            <div className="space-y-6 relative before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-0.5 before:bg-white/5">
              {recentActivities.length === 0 ? (
                <div className="text-slate-500 text-xs italic pl-8 py-4">No recent activities found in the firm database.</div>
              ) : (
                recentActivities.map((act: any) => {
                  let Icon = Activity;
                  let colorClass = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                  
                  if (act.type === 'document_upload') {
                    Icon = UploadCloud;
                    colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  } else if (act.type === 'new_matter') {
                    Icon = Briefcase;
                    colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  } else if (act.type === 'hearing_scheduled') {
                    Icon = Calendar;
                    colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                  } else if (act.type === 'matter_closed') {
                    Icon = FolderCheck;
                    colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                  }

                  return (
                    <div key={act.id} className="flex gap-4 relative items-start group">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 z-10 transition-transform group-hover:scale-105 bg-[#121212] ${colorClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 bg-[#151619] border border-white/5 rounded-xl p-4 hover:border-slate-700 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">{act.title}</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(act.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs mt-2 leading-relaxed">{act.subtitle}</p>
                        <div className="mt-3 flex justify-end">
                          <Link to={act.link} className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium tracking-wider uppercase flex items-center gap-1">
                            Go to module <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: QUICK ACTIONS PANEL (1/3 width) */}
        <div className="space-y-8">
          
          <section className="bg-[#121212] border border-white/5 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Quick Operations Panel</h2>
              <p className="text-xs text-slate-500">Instant database workflows without leaving the command center</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              
              {/* Quick Action 1: New Client */}
              <button 
                onClick={() => setActiveQuickAction('client')} 
                className="w-full bg-[#151619] hover:bg-slate-800 border border-white/5 hover:border-emerald-500/30 p-4 rounded-xl flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Register Client</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Access profiles & custom secure portal credentials</p>
                </div>
              </button>

              {/* Quick Action 2: New Case */}
              <button 
                onClick={() => setActiveQuickAction('case')} 
                className="w-full bg-[#151619] hover:bg-slate-800 border border-white/5 hover:border-blue-500/30 p-4 rounded-xl flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Open New Matter</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Register legal pleadings, claimants, and judges</p>
                </div>
              </button>

              {/* Quick Action 3: Upload Document */}
              <button 
                onClick={() => setActiveQuickAction('document')} 
                className="w-full bg-[#151619] hover:bg-slate-800 border border-white/5 hover:border-amber-500/30 p-4 rounded-xl flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Vault Legal Document</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Vault files, assign permissions, trigger review approvals</p>
                </div>
              </button>

              {/* Quick Action 4: Schedule Hearing */}
              <button 
                onClick={() => setActiveQuickAction('hearing')} 
                className="w-full bg-[#151619] hover:bg-slate-800 border border-white/5 hover:border-purple-500/30 p-4 rounded-xl flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <CalendarPlus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Schedule Court Hearing</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Link court dates and courtrooms directly to diaries</p>
                </div>
              </button>

              {/* Quick Action 5: Create Task */}
              <button 
                onClick={() => setActiveQuickAction('task')} 
                className="w-full bg-[#151619] hover:bg-slate-800 border border-white/5 hover:border-rose-500/30 p-4 rounded-xl flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Delegate Task</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Assign workload to associate advocates with priorities</p>
                </div>
              </button>

              {/* Quick Action 6: Send Email */}
              <button 
                onClick={() => setActiveQuickAction('email')} 
                className="w-full bg-[#151619] hover:bg-slate-800 border border-white/5 hover:border-teal-500/30 p-4 rounded-xl flex items-center gap-4 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Secure Email Dispatch</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Direct client email updates with Resend API triggers</p>
                </div>
              </button>

            </div>
          </section>

        </div>

      </div>

      {/* ----------------------------------------------------
          MODALS & FLYOUT DIALOGS FOR QUICK ACTIONS
         ---------------------------------------------------- */}
      <AnimatePresence>
        {activeQuickAction && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 font-sans select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              
              {/* Modal Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#151619]">
                <div className="flex items-center gap-2">
                  {activeQuickAction === 'client' && <UserPlus className="w-5 h-5 text-emerald-400" />}
                  {activeQuickAction === 'case' && <Briefcase className="w-5 h-5 text-blue-400" />}
                  {activeQuickAction === 'document' && <UploadCloud className="w-5 h-5 text-amber-400" />}
                  {activeQuickAction === 'hearing' && <CalendarPlus className="w-5 h-5 text-purple-400" />}
                  {activeQuickAction === 'task' && <CheckSquare className="w-5 h-5 text-rose-400" />}
                  {activeQuickAction === 'email' && <Mail className="w-5 h-5 text-teal-400" />}
                  <h3 className="text-lg font-bold text-white capitalize">
                    {activeQuickAction === 'client' && 'Register New Client'}
                    {activeQuickAction === 'case' && 'Initialize New Matter'}
                    {activeQuickAction === 'document' && 'Vault Legal Document'}
                    {activeQuickAction === 'hearing' && 'Schedule Court Hearing'}
                    {activeQuickAction === 'task' && 'Delegate Task & Workload'}
                    {activeQuickAction === 'email' && 'Secure Client Dispatch'}
                  </h3>
                </div>
                <button 
                  onClick={() => {
                    setActiveQuickAction(null);
                    setSelectedFile(null);
                  }}
                  className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content Scroll Area */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                
                {/* 1. NEW CLIENT FORM */}
                {activeQuickAction === 'client' && (
                  <form id="qc-client-form" onSubmit={handleCreateClient} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Full Client Name</label>
                        <input required type="text" placeholder="Johnathan Doe" value={newClient.full_name} onChange={e => setNewClient({...newClient, full_name: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unique Username</label>
                        <input required type="text" placeholder="johndoe_client" value={newClient.username} onChange={e => setNewClient({...newClient, username: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                        <input type="email" placeholder="john@example.com" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                        <input type="text" placeholder="+1 (555) 0192" value={newClient.phone_number} onChange={e => setNewClient({...newClient, phone_number: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Gender</label>
                        <select value={newClient.gender} onChange={e => setNewClient({...newClient, gender: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Company / Organization</label>
                        <input type="text" placeholder="Acme Legal Corp" value={newClient.company} onChange={e => setNewClient({...newClient, company: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Secure Access Password</label>
                        <button 
                          type="button" 
                          onClick={() => setNewClient({...newClient, password: Math.random().toString(36).substring(2, 10)})}
                          className="text-[10px] text-emerald-400 hover:underline"
                        >
                          Auto-generate password
                        </button>
                      </div>
                      <input required type="text" placeholder="Min 8 characters" value={newClient.password} onChange={e => setNewClient({...newClient, password: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono" />
                    </div>
                  </form>
                )}

                {/* 2. NEW CASE FORM */}
                {activeQuickAction === 'case' && (
                  <form id="qc-case-form" onSubmit={handleCreateCase} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Case/Matter Title</label>
                      <input required type="text" placeholder="State vs. Chambers Patent Dispute" value={newCase.title} onChange={e => setNewCase({...newCase, title: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Case Registry Number</label>
                        <input type="text" placeholder="FMR-2026-902A" value={newCase.case_number} onChange={e => setNewCase({...newCase, case_number: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Client Owner</label>
                        <select value={newCase.client_id} onChange={e => setNewCase({...newCase, client_id: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option value="">Unlinked (General Practice)</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.full_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Claimant / Plaintiff</label>
                        <input type="text" placeholder="The State" value={newCase.claimant} onChange={e => setNewCase({...newCase, claimant: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Defendant</label>
                        <input type="text" placeholder="Chambers Corp Ltd" value={newCase.defendant} onChange={e => setNewCase({...newCase, defendant: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Target Court Jurisdiction</label>
                        <select value={newCase.court} onChange={e => setNewCase({...newCase, court: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option>High Court</option>
                          <option>Supreme Court</option>
                          <option>Magistrate Court</option>
                          <option>Commercial Court</option>
                          <option>Arbitration Tribunal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Presiding Judge</label>
                        <input type="text" placeholder="Hon. Justice Vance" value={newCase.judge_name} onChange={e => setNewCase({...newCase, judge_name: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Brief Pleadings Summary</label>
                      <textarea placeholder="Outline the core claims and case description here..." value={newCase.description} onChange={e => setNewCase({...newCase, description: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" rows={2}></textarea>
                    </div>
                  </form>
                )}

                {/* 3. UPLOAD DOCUMENT FORM */}
                {activeQuickAction === 'document' && (
                  <form id="qc-document-form" onSubmit={handleUploadDocument} className="space-y-4">
                    {/* Drag and Drop Zone */}
                    <div 
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center
                        ${dragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/10 hover:border-emerald-500/30'}`}
                    >
                      <UploadCloud className="w-10 h-10 text-slate-400 mb-2" />
                      {selectedFile ? (
                        <div>
                          <span className="text-xs font-semibold text-emerald-400 block">{selectedFile.name}</span>
                          <span className="text-[10px] text-slate-500 mt-1 block">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs text-slate-300 font-medium block">Drag and drop document here, or <label htmlFor="qc-file-input" className="text-emerald-400 hover:underline cursor-pointer">browse files</label></span>
                          <span className="text-[10px] text-slate-500 block mt-1">PDF, DOCX, PNG up to 15MB</span>
                        </div>
                      )}
                      <input id="qc-file-input" type="file" onChange={handleFileChange} className="hidden" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Document Name (Vault Alias)</label>
                      <input required type="text" placeholder="e.g. Affidavit of Service" value={uploadDoc.filename} onChange={e => setUploadDoc({...uploadDoc, filename: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Vault Destination Folder</label>
                        <select value={uploadDoc.folder_id} onChange={e => setUploadDoc({...uploadDoc, folder_id: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option value="">Unsorted Vault (Default)</option>
                          {folders.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Matter File</label>
                        <select value={uploadDoc.case_id} onChange={e => setUploadDoc({...uploadDoc, case_id: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option value="">Independent Document</option>
                          {cases.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3 bg-[#151619] p-4 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-white block">Requires Approval</span>
                          <span className="text-[10px] text-slate-400 block">Requires Managing Partner verification</span>
                        </div>
                        <input type="checkbox" checked={uploadDoc.requires_approval} onChange={e => setUploadDoc({...uploadDoc, requires_approval: e.target.checked})} className="w-4 h-4 rounded text-emerald-500 bg-black border-white/20 focus:ring-0 focus:ring-offset-0" />
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        <div>
                          <span className="text-xs font-semibold text-white block">Flag for Legal Filing</span>
                          <span className="text-[10px] text-slate-400 block">Will show up inside clerk filing logs</span>
                        </div>
                        <input type="checkbox" checked={uploadDoc.pending_filing} onChange={e => setUploadDoc({...uploadDoc, pending_filing: e.target.checked})} className="w-4 h-4 rounded text-emerald-500 bg-black border-white/20 focus:ring-0 focus:ring-offset-0" />
                      </div>
                    </div>
                  </form>
                )}

                {/* 4. SCHEDULE HEARING FORM */}
                {activeQuickAction === 'hearing' && (
                  <form id="qc-hearing-form" onSubmit={handleCreateHearing} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Hearing Title</label>
                      <input required type="text" placeholder="Pleadings / Application of Injunction" value={newHearing.title} onChange={e => setNewHearing({...newHearing, title: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Case Matter</label>
                        <select required value={newHearing.case_id} onChange={e => setNewHearing({...newHearing, case_id: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option value="">Choose Case...</option>
                          {cases.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Event Classification</label>
                        <select value={newHearing.type} onChange={e => setNewHearing({...newHearing, type: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option>Court Date</option>
                          <option>Client Meeting</option>
                          <option>Internal Review</option>
                          <option>Arbitration</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date</label>
                        <input required type="date" value={newHearing.date} onChange={e => setNewHearing({...newHearing, date: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Time</label>
                        <input required type="time" value={newHearing.time} onChange={e => setNewHearing({...newHearing, time: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Courtroom / Location details</label>
                      <textarea placeholder="Specify Court Chamber 4B, Registry Desk, or virtual link..." value={newHearing.description} onChange={e => setNewHearing({...newHearing, description: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" rows={2}></textarea>
                    </div>
                  </form>
                )}

                {/* 5. CREATE TASK FORM */}
                {activeQuickAction === 'task' && (
                  <form id="qc-task-form" onSubmit={handleCreateTask} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Task Description</label>
                      <input required type="text" placeholder="Draft Chamber Application for Injunction" value={newTask.name} onChange={e => setNewTask({...newTask, name: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Priority Level</label>
                        <select value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                          <option>High</option>
                          <option>Medium</option>
                          <option>Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Due Date</label>
                        <input required type="date" value={newTask.due_date} onChange={e => setNewTask({...newTask, due_date: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Case File</label>
                      <select value={newTask.case_id} onChange={e => setNewTask({...newTask, case_id: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500">
                        <option value="">General Administrative Task</option>
                        {cases.map(c => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assign Team Members</label>
                      <div className="bg-[#151619] border border-white/10 rounded-lg p-3 max-h-32 overflow-y-auto space-y-2">
                        {staff.map(s => {
                          const isAssigned = newTask.assigned_to.includes(s.id);
                          return (
                            <label key={s.id} className="flex items-center justify-between text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                              <span>{s.name} ({s.role})</span>
                              <input 
                                type="checkbox" 
                                checked={isAssigned} 
                                onChange={() => {
                                  if (isAssigned) {
                                    setNewTask({...newTask, assigned_to: newTask.assigned_to.filter(id => id !== s.id)});
                                  } else {
                                    setNewTask({...newTask, assigned_to: [...newTask.assigned_to, s.id]});
                                  }
                                }}
                                className="w-4 h-4 rounded text-emerald-500 bg-black border-white/20 focus:ring-0 focus:ring-offset-0" 
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </form>
                )}

                {/* 6. SEND EMAIL FORM */}
                {activeQuickAction === 'email' && (
                  <form id="qc-email-form" onSubmit={handleSendEmailAction} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Link Client Profile</label>
                      <select 
                        value={newEmail.client_id} 
                        onChange={e => {
                          const matched = clients.find(c => c.id === e.target.value);
                          setNewEmail({
                            ...newEmail,
                            client_id: e.target.value,
                            recipient_email: matched ? matched.email || '' : ''
                          });
                        }} 
                        className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Manually specify email...</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.full_name} ({c.email || 'No email registered'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recipient Email</label>
                      <input required type="email" placeholder="client@domain.com" value={newEmail.recipient_email} onChange={e => setNewEmail({...newEmail, recipient_email: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Subject</label>
                      <input required type="text" placeholder="Legal Briefing Update / Hearing Schedule" value={newEmail.subject} onChange={e => setNewEmail({...newEmail, subject: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Message Body</label>
                      <textarea required placeholder="Write your legal update or briefing here..." value={newEmail.body} onChange={e => setNewEmail({...newEmail, body: e.target.value})} className="w-full bg-[#151619] border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-emerald-500" rows={5}></textarea>
                    </div>
                  </form>
                )}

              </div>

              {/* Modal Actions Footer */}
              <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-[#151619]">
                <button 
                  type="button" 
                  onClick={() => {
                    setActiveQuickAction(null);
                    setSelectedFile(null);
                  }} 
                  className="px-4 py-2 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  form={`qc-${activeQuickAction}-form`}
                  disabled={isSubmittingAction}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-semibold tracking-wide flex items-center gap-2 shadow-lg shadow-emerald-500/10 transition-all"
                >
                  {isSubmittingAction ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" /> processing...
                    </span>
                  ) : (
                    'Execute Action'
                  )}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
