import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { Search, Send, Paperclip, MoreVertical, Hash, MessageSquare, Users, Edit3, X, File, Download, Check, CheckCheck, Mic, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { RealtimeChannel } from '@supabase/supabase-js';

type Staff = { id: string; username: string; name?: string; role?: string; picture?: string };
type Channel = { id: string; type: 'direct' | 'group'; name?: string; created_at: string; other_user?: Staff; last_message?: Message; unread_count?: number; other_read_at?: string };
type Message = { id: string; channel_id: string; sender_id: string; content: string; file_url?: string; file_name?: string; created_at: string; sender?: Staff };

export default function Messages() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'direct' | 'group' | 'history'>('direct');
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [allUsers, setAllUsers] = useState<Staff[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatType, setNewChatType] = useState<'direct' | 'group'>('direct');
  
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!token || !user) return;
    fetchUsers();
    fetchChannels();
    return () => {
      if (subscriptionRef.current) {
        supabase?.removeChannel(subscriptionRef.current);
      }
    };
  }, [token, user]);

  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
      markAsRead(activeChannelId);
      
      // Setup Realtime for this channel
      if (subscriptionRef.current) {
        supabase?.removeChannel(subscriptionRef.current);
      }
      
      subscriptionRef.current = supabase!
        .channel(`messages:${activeChannelId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannelId}` }, async (payload) => {
          const newMsg = payload.new as Message;
          // Fetch sender details
          let { data: senderData } = await supabase!.from('staff').select('*').eq('id', newMsg.sender_id).single();
          if (!senderData) {
             const { data: clientData } = await supabase!.from('clients').select('*').eq('id', newMsg.sender_id).single();
             if (clientData) senderData = { id: clientData.id, username: clientData.username, name: clientData.full_name, role: 'Client' };
          }
          setMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, sender: senderData }];
          });
          if (newMsg.sender_id !== user!.id) {
             markAsRead(activeChannelId);
          }
        })
        .subscribe();
    }
  }, [activeChannelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchUsers = async () => {
    if (!supabase || !user) return;
    const { data: staffData } = await supabase.from('staff').select('*').eq('firm_id', user!.firm_id).neq('id', user!.id);
    let allStaff: Staff[] = staffData || [];

    let clientsData: any[] = [];
    if (user.role === 'Managing Partner') {
      const { data } = await supabase.from('clients').select('*').eq('firm_id', user.firm_id);
      clientsData = data || [];
    } else {
      const { data: assignedCases } = await supabase.from('cases').select('client_id').eq('firm_id', user.firm_id).contains('assigned_staff_ids', [user.id]);
      if (assignedCases && assignedCases.length > 0) {
        const clientIds = assignedCases.map(c => c.client_id).filter(Boolean);
        if (clientIds.length > 0) {
           const { data } = await supabase.from('clients').select('*').in('id', clientIds);
           clientsData = data || [];
        }
      }
    }
    
    const formattedClients: Staff[] = clientsData.map(c => ({
       id: c.id,
       username: c.username,
       name: c.full_name,
       role: 'Client'
    }));

    setAllUsers([...allStaff, ...formattedClients]);
  };

  const fetchChannels = async () => {
    if (!supabase || !user) return;
    const { data: members } = await supabase.from('channel_members').select('channel_id, last_read_at').eq('user_id', user.id);
    if (!members || members.length === 0) {
      setChannels([]);
      return;
    }
    const channelIds = members.map(m => m.channel_id);
    const { data: chs } = await supabase.from('channels').select('*').in('id', channelIds).order('created_at', { ascending: false });
    
    if (chs) {
      await Promise.all(chs.map(async (ch) => {
        const { data: lastMsg } = await supabase.from('messages')
          .select('*')
          .eq('channel_id', ch.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMsg) ch.last_message = lastMsg;

        const m = members.find(m => m.channel_id === ch.id);
        if (m) {
           const { count } = await supabase.from('messages')
             .select('*', { count: 'exact', head: true })
             .eq('channel_id', ch.id)
             .gt('created_at', m.last_read_at)
             .neq('sender_id', user.id);
           ch.unread_count = count || 0;
        }
      }));

      // Find other user for direct chats
      const directChats = chs.filter(c => c.type === 'direct');
      if (directChats.length > 0) {
         const { data: otherMembers } = await supabase.from('channel_members')
           .select('channel_id, user_id, last_read_at')
           .in('channel_id', directChats.map(c => c.id))
           .neq('user_id', user.id);
         
         if (otherMembers) {
            const allUserIds = otherMembers.map(m => m.user_id).filter(Boolean);
            
            let staffMap: any = {};
            let clientsMap: any = {};
            
            if (allUserIds.length > 0) {
              const { data: staffData } = await supabase.from('staff').select('*').in('id', allUserIds);
              if (staffData) staffData.forEach(s => staffMap[s.id] = s);
              
              const missingUserIds = allUserIds.filter(id => !staffMap[id]);
              if (missingUserIds.length > 0) {
                const { data: clientsData } = await supabase.from('clients').select('*').in('id', missingUserIds);
                if (clientsData) clientsData.forEach(c => clientsMap[c.id] = c);
              }
            }

            chs.forEach(c => {
               if (c.type === 'direct') {
                  const matchingMember = otherMembers.find(om => om.channel_id === c.id);
                  if (matchingMember) {
                     if (staffMap[matchingMember.user_id]) {
                        c.other_user = staffMap[matchingMember.user_id];
                     } else if (clientsMap[matchingMember.user_id]) {
                        const cl = clientsMap[matchingMember.user_id];
                        c.other_user = { id: cl.id, username: cl.username, name: cl.full_name, role: 'Client' };
                     }
                     c.other_read_at = matchingMember.last_read_at;
                  }
               }
            });
         }
      }
      setChannels(chs);
    }
  };

  const fetchMessages = async (channelId: string) => {
    if (!supabase) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });
      
    if (data) {
       const allSenderIds = [...new Set(data.map(m => m.sender_id).filter(Boolean))];
       
       let staffMap: any = {};
       let clientsMap: any = {};
       
       if (allSenderIds.length > 0) {
          const { data: staffData } = await supabase.from('staff').select('*').in('id', allSenderIds);
          if (staffData) staffData.forEach(s => staffMap[s.id] = s);
          
          const missingIds = allSenderIds.filter(id => !staffMap[id]);
          if (missingIds.length > 0) {
             const { data: clientsData } = await supabase.from('clients').select('*').in('id', missingIds);
             if (clientsData) clientsData.forEach(c => clientsMap[c.id] = c);
          }
       }
       
       const formatted = data.map(m => {
          let senderObj = null;
          if (staffMap[m.sender_id]) {
             senderObj = staffMap[m.sender_id];
          } else if (clientsMap[m.sender_id]) {
             const cl = clientsMap[m.sender_id];
             senderObj = { id: cl.id, username: cl.username, name: cl.full_name, role: 'Client' };
          }
          return {
             ...m,
             sender: senderObj
          };
       });
       setMessages(formatted as Message[]);
    }
  };

  const markAsRead = async (channelId: string) => {
    if (!supabase || !user) return;
    await supabase.from('channel_members').update({ last_read_at: new Date().toISOString() }).eq('channel_id', channelId).eq('user_id', user.id);
    setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, unread_count: 0 } : ch));
  };

  const createChat = async () => {
    if (!supabase || !user) return;
    
    if (newChatType === 'direct') {
      if (selectedUsers.length !== 1) return alert('Select exactly 1 user for a direct message');
      const targetUserId = selectedUsers[0];
      
      // check if exists
      const directChats = channels.filter(c => c.type === 'direct');
      const existing = directChats.find(c => c.other_user?.id === targetUserId);
      if (existing) {
         setActiveChannelId(existing.id);
         setShowNewChat(false);
         return;
      }
      
      const { data: channel, error } = await supabase.from('channels').insert([{ firm_id: user.firm_id, type: 'direct' }]).select().single();
      if (error) {
        alert('Error creating chat: ' + error.message);
        console.error(error);
        return;
      }
      if (channel) {
         const { error: memberError } = await supabase.from('channel_members').insert([
           { channel_id: channel.id, user_id: user.id },
           { channel_id: channel.id, user_id: targetUserId }
         ]);
         
         if (memberError) {
           console.error("Member insert error:", memberError);
         }
         
         await fetchChannels();
         setActiveChannelId(channel.id);
      }
    } else {
      if (!groupName || selectedUsers.length === 0) return alert('Enter a group name and select members');
      const { data: channel, error } = await supabase.from('channels').insert([{ firm_id: user.firm_id, type: 'group', name: groupName }]).select().single();
      if (error) {
        alert('Error creating group chat: ' + error.message);
        console.error(error);
        return;
      }
      if (channel) {
         const membersToInsert = [{ channel_id: channel.id, user_id: user.id }, ...selectedUsers.map(id => ({ channel_id: channel.id, user_id: id }))];
         const { error: memberError } = await supabase.from('channel_members').insert(membersToInsert);
         if (memberError) console.error("Member insert error:", memberError);
         await fetchChannels();
         setActiveChannelId(channel.id);
      }
    }
    
    setShowNewChat(false);
    setSelectedUsers([]);
    setGroupName('');
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !activeChannelId || !supabase || !user) return;
    
    const content = newMessage;
    setNewMessage('');
    
    const { error } = await supabase.from('messages').insert([{
      firm_id: user.firm_id,
      channel_id: activeChannelId,
      sender_id: user.id,
      content: content
    }]);
    
    if (error) {
      console.error(error);
      setNewMessage(content); // restore if failed
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeChannelId || !supabase || !user) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}_${Date.now()}.${fileExt}`;
    const filePath = `chat_files/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage.from('files').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(filePath);

      await supabase.from('messages').insert([{
        firm_id: user.firm_id,
        channel_id: activeChannelId,
        sender_id: user.id,
        content: `Sent a file: ${file.name}`,
        file_url: publicUrl,
        file_name: file.name
      }]);
    } catch (error: any) {
      alert("Error uploading file: " + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await uploadAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or not available. " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const uploadAudio = async (blob: Blob) => {
    if (!activeChannelId || !supabase || !user) return;
    setUploading(true);
    const fileName = `${user.id}_${Date.now()}.webm`;
    const filePath = `chat_files/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage.from('files').upload(filePath, blob, { contentType: 'audio/webm' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(filePath);

      await supabase.from('messages').insert([{
        firm_id: user.firm_id,
        channel_id: activeChannelId,
        sender_id: user.id,
        content: `Voice message`,
        file_url: publicUrl,
        file_name: fileName
      }]);
    } catch (error: any) {
      alert("Error uploading audio: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const filteredChannels = channels.filter(c => {
     if (activeTab === 'history') return true; // Show all in history
     return c.type === activeTab;
  }).filter(c => {
     if (!searchQuery) return true;
     const name = c.type === 'group' ? c.name : (c.other_user?.name || c.other_user?.username);
     return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-full flex flex-col bg-[#0f0f0f] p-4 text-white">
      <div className="flex-1 flex gap-4 overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-80 flex flex-col bg-[#151619] rounded-xl border border-white/5 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-white/5">
            <h1 className="text-xl font-medium tracking-tight mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-500" />
              Messages
            </h1>
            
            <div className="flex bg-[#0a0a0a] rounded-lg p-1 border border-white/5 mb-4">
               {(['direct', 'group', 'history'] as const).map(tab => (
                 <button
                   key={tab}
                   onClick={() => setActiveTab(tab)}
                   className={cn(
                     "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                     activeTab === tab ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-slate-300"
                   )}
                 >
                   {tab}
                 </button>
               ))}
            </div>

            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search chats..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/5text-sm rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {activeTab !== 'history' && (
              <button 
                onClick={() => { setShowNewChat(true); setNewChatType(activeTab); }}
                className="w-full py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" /> New {activeTab === 'group' ? 'Group' : 'Chat'}
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredChannels.length === 0 ? (
               <div className="text-center p-4 text-xs text-slate-500">No chats found.</div>
            ) : filteredChannels.map(channel => (
               <button
                 key={channel.id}
                 onClick={() => setActiveChannelId(channel.id)}
                 className={cn(
                   "w-full text-left flex items-center gap-3 p-3 rounded-lg transition-colors border",
                   activeChannelId === channel.id ? "bg-white/5 border-emerald-500/30" : "hover:bg-white/5 border-transparent"
                 )}
               >
                 <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                    {channel.type === 'group' ? <Hash className="w-5 h-5 text-slate-400" /> : <Users className="w-5 h-5 text-slate-400" />}
                 </div>
                 <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                       <p className={cn("text-sm truncate", channel.unread_count ? "font-bold text-emerald-500" : "font-medium text-slate-200")}>
                         {channel.type === 'group' ? channel.name : (channel.other_user?.name || channel.other_user?.username || 'Unknown User')}
                       </p>
                       <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                         {channel.last_message ? new Date(channel.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                       </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                       <p className={cn("text-xs truncate", channel.unread_count ? "font-bold text-emerald-500" : "text-slate-500")}>
                         {channel.last_message ? channel.last_message.content : (<span className="capitalize">{channel.type} Chat</span>)}
                       </p>
                       {channel.unread_count ? (
                         <div className="bg-emerald-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full ml-2 flex-shrink-0">
                           {channel.unread_count}
                         </div>
                       ) : null}
                    </div>
                 </div>
               </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-[#151619] rounded-xl border border-white/5 overflow-hidden shadow-sm relative">
           {!activeChannelId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                 <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
                 <p>Select a chat to start messaging</p>
              </div>
           ) : (
              <>
                 <div className="h-16 border-b border-white/5 flex items-center px-6 shrink-0 bg-[#1a1c20]">
                    {(() => {
                       const channel = channels.find(c => c.id === activeChannelId);
                       if (!channel) return null;
                       return (
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                                {channel.type === 'group' ? <Hash className="w-5 h-5 text-emerald-500" /> : <Users className="w-5 h-5 text-blue-500" />}
                             </div>
                             <div>
                                <h3 className="font-medium text-slate-200">
                                   {channel.type === 'group' ? channel.name : (channel.other_user?.name || channel.other_user?.username)}
                                </h3>
                                <p className="text-xs text-slate-500 capitalize">{channel.type} Chat</p>
                             </div>
                          </div>
                       );
                    })()}
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
                    {messages.map((msg, idx) => {
                       const isMe = msg.sender_id === user?.id;
                       const showHeader = idx === 0 || messages[idx-1].sender_id !== msg.sender_id;
                       
                       return (
                          <div key={msg.id} className={cn("flex flex-col max-w-[80%]", isMe ? "self-end items-end" : "self-start items-start")}>
                             {showHeader && !isMe && (
                                <span className="text-xs text-slate-500 ml-1 mb-1">{msg.sender?.name || msg.sender?.username || 'System'}</span>
                             )}
                             <div className={cn(
                                "px-4 py-2.5 rounded-2xl text-sm",
                                isMe ? "bg-emerald-600 text-white rounded-br-none" : "bg-[#25282e] text-slate-200 rounded-bl-none"
                             )}>
                                {msg.file_url ? (
                                   <div className="flex flex-col gap-2">
                                      {msg.file_name?.match(/\.(webm|mp3|wav|ogg|m4a)$/i) ? (
                                         <audio controls src={msg.file_url} className="h-10 outline-none w-[220px]" />
                                      ) : (
                                         <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg">
                                            <File className="w-8 h-8 text-slate-400" />
                                            <div className="overflow-hidden">
                                               <p className="font-medium truncate text-xs">{msg.file_name}</p>
                                            </div>
                                            <a href={msg.file_url} target="_blank" rel="noreferrer" className="p-1 hover:bg-white/10 rounded-lg ml-2">
                                               <Download className="w-4 h-4" />
                                            </a>
                                         </div>
                                      )}
                                      {msg.content !== 'Voice message' && <p>{msg.content}</p>}
                                   </div>
                                ) : (
                                   <p className="whitespace-pre-wrap">{msg.content}</p>
                                )}
                             </div>
                             <div className="flex items-center gap-1 mt-1 mx-1 text-[10px] text-slate-600">
                                <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {isMe && (
                                   (() => {
                                      const channel = channels.find(c => c.id === activeChannelId);
                                      if (channel && channel.type === 'direct' && channel.other_read_at) {
                                         const isSeen = new Date(channel.other_read_at) >= new Date(msg.created_at);
                                         return isSeen ? <CheckCheck className="w-3 h-3 text-emerald-500" /> : <Check className="w-3 h-3 text-slate-400" />;
                                      }
                                      return <Check className="w-3 h-3 text-slate-400" />;
                                   })()
                                )}
                             </div>
                          </div>
                       );
                    })}
                    <div ref={messagesEndRef} />
                 </div>
                 
                 <div className="p-4 border-t border-white/5 bg-[#1a1c20]">
                    <form onSubmit={handleSendMessage} className="flex items-end gap-2 relative">
                       <button
                         type="button"
                         onClick={() => fileInputRef.current?.click()}
                         disabled={uploading || isRecording}
                         className="p-3 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-colors disabled:opacity-50"
                       >
                         <Paperclip className="w-5 h-5" />
                       </button>
                       <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileUpload} 
                          className="hidden" 
                       />
                       
                       {isRecording ? (
                          <div className="flex-1 bg-[#0a0a0a] border border-red-500/50 rounded-xl py-3 px-4 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-sm text-red-500 font-medium">Recording {formatDuration(recordingDuration)}</span>
                             </div>
                             <button
                               type="button"
                               onClick={stopRecording}
                               className="text-slate-400 hover:text-white transition-colors"
                             >
                                <Square className="w-5 h-5 fill-current" />
                             </button>
                          </div>
                       ) : (
                          <textarea
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => {
                               if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSendMessage();
                               }
                            }}
                            placeholder={uploading ? "Uploading file..." : "Type a message..."}
                            disabled={uploading}
                            className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 resize-none h-[46px] min-h-[46px] max-h-32 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                            rows={1}
                          />
                       )}
                       
                       {newMessage.trim() || uploading ? (
                          <button
                            type="submit"
                            disabled={!newMessage.trim() || uploading}
                            className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-emerald-600 flex items-center justify-center shrink-0"
                          >
                            <Send className="w-5 h-5" />
                          </button>
                       ) : (
                          <button
                            type="button"
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={uploading}
                            className={cn(
                               "p-3 rounded-xl transition-colors flex items-center justify-center shrink-0",
                               isRecording ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-[#25282e] text-slate-400 hover:text-white hover:bg-[#2c3038] disabled:opacity-50"
                            )}
                          >
                            {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
                          </button>
                       )}
                    </form>
                 </div>
              </>
           )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#151619] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
               <div className="p-5 border-b border-white/5 flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight">New {newChatType === 'group' ? 'Group' : 'Direct'} Chat</h2>
                  <button onClick={() => { setShowNewChat(false); setSelectedUsers([]); }} className="p-2 text-slate-500 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
               </div>
               
               <div className="p-5 flex-1 overflow-y-auto space-y-5">
                  {newChatType === 'group' && (
                     <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Group Name</label>
                        <input 
                          type="text" 
                          value={groupName}
                          onChange={e => setGroupName(e.target.value)}
                          placeholder="e.g. Project Alpha Team"
                          className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                        />
                     </div>
                  )}
                  
                  <div>
                     <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Select Users {newChatType === 'direct' ? '(Pick 1)' : ''}</label>
                     <div className="space-y-1">
                        {allUsers.map(u => (
                           <label key={u.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/5">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-white/10 bg-[#0a0a0a] text-emerald-500 focus:ring-0 focus:ring-offset-0"
                                checked={selectedUsers.includes(u.id)}
                                onChange={e => {
                                   if (e.target.checked) {
                                      if (newChatType === 'direct') setSelectedUsers([u.id]);
                                      else setSelectedUsers([...selectedUsers, u.id]);
                                   } else {
                                      setSelectedUsers(selectedUsers.filter(id => id !== u.id));
                                   }
                                }}
                              />
                              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                                 <Users className="w-4 h-4 text-slate-500" />
                              </div>
                              <div className="flex-1">
                                 <p className="text-sm font-medium">{u.name || u.username}</p>
                                 <p className="text-[10px] text-slate-500">{u.role || 'Staff'}</p>
                              </div>
                           </label>
                        ))}
                     </div>
                  </div>
               </div>
               
               <div className="p-5 border-t border-white/5 bg-[#1a1c20] flex justify-end gap-3">
                  <button onClick={() => setShowNewChat(false)} className="px-4 py-2 hover:bg-white/5 rounded-lg text-sm text-slate-300">Cancel</button>
                  <button 
                    onClick={createChat}
                    disabled={(newChatType === 'direct' && selectedUsers.length !== 1) || (newChatType === 'group' && (!groupName || selectedUsers.length === 0))}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 rounded-lg text-sm font-medium text-white transition-colors"
                  >
                     Create Chat
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
