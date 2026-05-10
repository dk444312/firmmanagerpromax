# Client Portal Integration Guide

You mentioned you are building the client portal elsewhere. Here is the code you need to integrate Case Details, Files, Events, and Messages (Chat) into your Client Portal.

### 1. Connecting to Supabase
Make sure your client portal uses the same Supabase project URL and anon key. When a client logs in, their `client.id` will be their `user_id` in these queries.

### 2. Fetching Linked Cases & Details

```tsx
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient'; // your supabase client

export default function ClientCases({ clientId }) {
  const [cases, setCases] = useState([]);

  useEffect(() => {
    const fetchCases = async () => {
      // Fetch cases linked to this client
      const { data } = await supabase
        .from('cases')
        .select('*')
        .eq('client_id', clientId);
        
      if (data) setCases(data);
    };
    fetchCases();
  }, [clientId]);

  return (
    <div>
      <h2>My Cases</h2>
      {cases.map(c => (
        <div key={c.id}>
          <h3>{c.title}</h3>
          <p>Stage: {c.stage}</p>
        </div>
      ))}
    </div>
  );
}
```

### 3. Fetching Files & Events for Linked Cases

```tsx
export default function ClientFilesAndEvents({ clientId }) {
  const [files, setFiles] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      // First get the case IDs for this client
      const { data: cases } = await supabase.from('cases').select('id').eq('client_id', clientId);
      if (!cases || cases.length === 0) return;
      const caseIds = cases.map(c => c.id);

      // Fetch Files
      const { data: filesData } = await supabase.from('files').select('*').in('case_id', caseIds);
      if (filesData) setFiles(filesData);

      // Fetch Events
      const { data: eventsData } = await supabase.from('events').select('*').in('case_id', caseIds);
      if (eventsData) setEvents(eventsData);
    };
    fetchData();
  }, [clientId]);

  // Render files and events here...
}
```

### 4. Client Portal Messages / Chat Implementation

Here is a full component you can use in your client portal to chat with the law firm staff.

```tsx
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function ClientMessages({ clientId, firmId }) {
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [staffMap, setStaffMap] = useState({});

  useEffect(() => {
    fetchChannels();
  }, [clientId]);

  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
      
      // Subscribe to new messages
      const channel = supabase.channel('client_chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannelId}` }, async (payload) => {
          const newMsg = payload.new;
          
          if (newMsg.sender_id !== clientId) {
             const { data: senderData } = await supabase.from('staff').select('*').eq('id', newMsg.sender_id).single();
             if (senderData) {
               newMsg.sender = senderData;
               setStaffMap(prev => ({...prev, [senderData.id]: senderData}));
             }
          } else {
             newMsg.sender = { id: clientId, name: "Me", role: "Client" };
          }
          
          setMessages(prev => {
             if (prev.find(m => m.id === newMsg.id)) return prev;
             return [...prev, newMsg];
          });
        })
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeChannelId]);

  const fetchChannels = async () => {
    // Get channels where the client is a member
    const { data: members } = await supabase.from('channel_members').select('channel_id').eq('user_id', clientId);
    if (!members || members.length === 0) return;
    
    const channelIds = members.map(m => m.channel_id);
    const { data: chs } = await supabase.from('channels').select('*').in('id', channelIds);
    setChannels(chs || []);
  };

  const fetchMessages = async (channelId) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });
      
    if (data) {
       // load staff names
       const senderIds = [...new Set(data.map(m => m.sender_id).filter(id => id !== clientId))];
       if (senderIds.length > 0) {
          const { data: staffData } = await supabase.from('staff').select('*').in('id', senderIds);
          if (staffData) {
             const sm = {};
             staffData.forEach(s => sm[s.id] = s);
             setStaffMap(sm);
          }
       }
       
       setMessages(data);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChannelId) return;

    const { error } = await supabase.from('messages').insert([{
      channel_id: activeChannelId,
      sender_id: clientId,
      content: newMessage
    }]);

    if (!error) setNewMessage('');
  };

  return (
    <div style={{ display: 'flex', height: '600px', border: '1px solid #ccc' }}>
      {/* Sidebar: Chat List */}
      <div style={{ width: '250px', borderRight: '1px solid #ccc' }}>
        <h3>My Law Firm Chats</h3>
        {channels.map(c => (
          <div 
             key={c.id} 
             onClick={() => setActiveChannelId(c.id)}
             style={{ padding: '10px', cursor: 'pointer', background: activeChannelId === c.id ? '#eee' : 'transparent' }}
          >
            {c.name || 'Staff Chat'}
          </div>
        ))}
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeChannelId ? (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {messages.map(m => (
                <div key={m.id} style={{ textAlign: m.sender_id === clientId ? 'right' : 'left', marginBottom: '10px' }}>
                  <small style={{ color: '#888' }}>
                     {m.sender_id === clientId ? 'Me' : (staffMap[m.sender_id]?.name || 'Staff')}
                  </small>
                  <div style={{
                    display: 'inline-block',
                    background: m.sender_id === clientId ? '#007BFF' : '#E5E5EA',
                    color: m.sender_id === clientId ? '#FFF' : '#000',
                    padding: '8px 12px',
                    borderRadius: '15px'
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage} style={{ padding: '10px', borderTop: '1px solid #ccc', display: 'flex' }}>
              <input 
                type="text" 
                value={newMessage} 
                onChange={e => setNewMessage(e.target.value)} 
                placeholder="Type a message..."
                style={{ flex: 1, padding: '10px' }}
              />
              <button type="submit" style={{ padding: '10px 20px' }}>Send</button>
            </form>
          </>
        ) : (
          <div style={{ padding: '20px' }}>Select a chat to start messaging</div>
        )}
      </div>
    </div>
  );
}
```
