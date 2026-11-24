import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PortalLayout } from './components/PortalLayout';
import { SignInView } from './components/SignInView';
import { PortalProvider, usePortal } from './context/PortalContext';
import { ActivityLogsPage } from './pages/ActivityLogsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { ComplaintDetailPage } from './pages/ComplaintDetailPage';
import { ComplaintsPage } from './pages/ComplaintsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { LiveMapPage } from './pages/LiveMapPage';
import { PerformancePage } from './pages/PerformancePage';
import { SettingsPage } from './pages/SettingsPage';
import { StaffPage } from './pages/StaffPage';
import { UserManagementPage } from './pages/UserManagementPage';

const PortalRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = usePortal();

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F6F8]">
        <div className="rounded-md border border-[#E5E7EB] bg-white px-6 py-4 text-xs font-medium text-[#687385]">
          Initializing CivicTrack Government Administration Portal...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SignInView />;
  }

  return (
    <PortalLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/complaints" element={<ComplaintsPage queue="all" />} />
        <Route path="/complaints/new" element={<ComplaintsPage queue="new" />} />
        <Route path="/complaints/pending" element={<ComplaintsPage queue="pending" />} />
        <Route path="/complaints/in-progress" element={<ComplaintsPage queue="in-progress" />} />
        <Route path="/complaints/resolved" element={<ComplaintsPage queue="resolved" />} />
        <Route path="/complaints/escalated" element={<ComplaintsPage queue="escalated" />} />
        <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="/assign" element={<AssignmentPage />} />
        <Route path="/map" element={<LiveMapPage />} />
        <Route path="/departments" element={<DepartmentsPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/activity-logs" element={<ActivityLogsPage />} />
        <Route path="/users" element={<UserManagementPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PortalLayout>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <PortalProvider>
        <PortalRoutes />
      </PortalProvider>
    </BrowserRouter>
  );
}
