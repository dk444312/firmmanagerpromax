/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import Diary from './pages/Diary';
import Files from './pages/Files';
import Admin from './pages/Admin';
import FolderDetails from './pages/FolderDetails';

import Tasks from './pages/Tasks';
import CaseDetails from './pages/CaseDetails';
import DiaryUpcoming from './pages/DiaryUpcoming';
import DiaryPast from './pages/DiaryPast';
import Appointments from './pages/Appointments';
import FilesHours from './pages/FilesHours';
import CaseWorkspace from './pages/CaseWorkspace';
import NotificationsPage from './pages/Notifications';
import Settings from './pages/Settings';
import Clients from './pages/Clients';
import ManageClients from './pages/ManageClients';
import Emails from './pages/Emails';

import Messages from './pages/Messages';
import Drafting from './pages/Drafting';
import Atlas from './pages/Atlas';

import TimeRecording from './pages/TimeRecording';
import Reports from './pages/Reports';
import AuditTrail from './pages/AuditTrail';

function ProtectedRoute({ children, reqMenu }: { children: React.ReactNode, reqMenu?: string }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="h-screen w-full flex items-center justify-center text-emerald-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  if (reqMenu && user.role !== 'Managing Partner' && !(user.accessible_menus || []).includes(reqMenu)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{ style: { background: '#333', color: '#fff' } }} />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            
            <Route path="/cases" element={<ProtectedRoute reqMenu="cases"><Cases /></ProtectedRoute>} />
            <Route path="/cases/workspace" element={<ProtectedRoute reqMenu="cases"><CaseWorkspace /></ProtectedRoute>} />
            <Route path="/cases/:id" element={<ProtectedRoute reqMenu="cases"><CaseDetails /></ProtectedRoute>} />
            
            <Route path="/tasks" element={<ProtectedRoute reqMenu="tasks"><Tasks /></ProtectedRoute>} />
            
            <Route path="/diary" element={<ProtectedRoute reqMenu="diary"><Diary /></ProtectedRoute>} />
            <Route path="/diary/upcoming" element={<ProtectedRoute reqMenu="diary"><DiaryUpcoming /></ProtectedRoute>} />
            <Route path="/diary/past" element={<ProtectedRoute reqMenu="diary"><DiaryPast /></ProtectedRoute>} />
            <Route path="/diary/appointments" element={<ProtectedRoute reqMenu="diary"><Appointments /></ProtectedRoute>} />
            
            <Route path="/files" element={<ProtectedRoute reqMenu="files"><Files /></ProtectedRoute>} />
            <Route path="/files/:folderId" element={<ProtectedRoute reqMenu="files"><FolderDetails /></ProtectedRoute>} />
            <Route path="/files/hours" element={<ProtectedRoute reqMenu="files"><FilesHours /></ProtectedRoute>} />
            
            <Route path="/clients" element={<ProtectedRoute reqMenu="clients"><Clients /></ProtectedRoute>} />
            <Route path="/clients/manage" element={<ProtectedRoute reqMenu="clients"><ManageClients /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute reqMenu="admin"><Admin /></ProtectedRoute>} />
            <Route path="/drafting" element={<ProtectedRoute><Drafting /></ProtectedRoute>} />
            <Route path="/atlas" element={<ProtectedRoute><Atlas /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            <Route path="/emails" element={<ProtectedRoute><Emails /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            
            <Route path="/time-recording" element={<ProtectedRoute><TimeRecording /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/audit-trail" element={<ProtectedRoute><AuditTrail /></ProtectedRoute>} />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
