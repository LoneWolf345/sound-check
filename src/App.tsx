import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import CreateJob from "./pages/CreateJob";
import JobList from "./pages/JobList";
import JobDetail from "./pages/JobDetail";
import AdminSettings from "./pages/AdminSettings";
import AuditLog from "./pages/AuditLog";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SSOCallback from "./pages/SSOCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/sso/callback" element={<SSOCallback />} />
            
            {/* Public routes - accessible without login */}
            <Route
              path="/"
              element={
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              }
            />
            <Route
              path="/jobs/new"
              element={
                <AppLayout>
                  <CreateJob />
                </AppLayout>
              }
            />
            <Route
              path="/jobs"
              element={
                <AppLayout>
                  <JobList />
                </AppLayout>
              }
            />
            <Route
              path="/jobs/:id"
              element={
                <AppLayout>
                  <JobDetail />
                </AppLayout>
              }
            />
            
            {/* Admin routes - require authentication + admin role */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AppLayout>
                    <AdminSettings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <ProtectedRoute requireAdmin>
                  <AppLayout>
                    <AuditLog />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
