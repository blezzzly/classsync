import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { ToastProvider } from './context/ToastContext';
import { SyncProvider } from './context/SyncContext';
import { AppShell } from './components/AppShell';
import { RequireAuth } from './pages/RequireAuth';
import { HomeRedirect } from './pages/HomeRedirect';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

import { TeacherDashboardPage } from './pages/teacher/TeacherDashboardPage';
import { TeacherActivitiesPage } from './pages/teacher/TeacherActivitiesPage';
import { TeacherActivityDetailPage } from './pages/teacher/TeacherActivityDetailPage';
import { ActivityFormPage } from './pages/teacher/ActivityFormPage';
import { TeacherSubmissionsPage } from './pages/teacher/TeacherSubmissionsPage';
import { TeacherSubmissionDetailPage } from './pages/teacher/TeacherSubmissionDetailPage';
import { TeacherProfilePage } from './pages/teacher/TeacherProfilePage';

import { StudentHomePage } from './pages/student/StudentHomePage';
import { StudentJoinPage } from './pages/student/StudentJoinPage';
import { StudentActivitiesPage } from './pages/student/StudentActivitiesPage';
import { StudentActivityPage } from './pages/student/StudentActivityPage';
import { StudentSubmissionsPage } from './pages/student/StudentSubmissionsPage';
import { StudentProfilePage } from './pages/student/StudentProfilePage';

export default function App() {
  return (
    <AuthProvider>
      <ConnectionProvider>
        <ToastProvider>
          <SyncProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route path="/teacher" element={<TeacherDashboardPage />} />
                    <Route path="/teacher/activities" element={<TeacherActivitiesPage />} />
                    <Route path="/teacher/activities/new" element={<ActivityFormPage />} />
                    <Route path="/teacher/activities/:id" element={<TeacherActivityDetailPage />} />
                    <Route path="/teacher/activities/:id/edit" element={<ActivityFormPage />} />
                    <Route path="/teacher/submissions" element={<TeacherSubmissionsPage />} />
                    <Route path="/teacher/submissions/:id" element={<TeacherSubmissionDetailPage />} />
                    <Route path="/teacher/profile" element={<TeacherProfilePage />} />

                    <Route path="/student" element={<StudentHomePage />} />
                    <Route path="/student/join" element={<StudentJoinPage />} />
                    <Route path="/student/activities" element={<StudentActivitiesPage />} />
                    <Route path="/student/activities/:id" element={<StudentActivityPage />} />
                    <Route path="/student/submissions" element={<StudentSubmissionsPage />} />
                    <Route path="/student/profile" element={<StudentProfilePage />} />
                  </Route>
                </Route>
                <Route path="/index.html" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
          </SyncProvider>
        </ToastProvider>
      </ConnectionProvider>
    </AuthProvider>
  );
}
