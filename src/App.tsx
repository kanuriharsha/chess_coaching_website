import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Puzzles from "./pages/Puzzles";
import Games from "./pages/Games";
import Openings from "./pages/Openings";
import OpeningEditor from "./pages/OpeningEditor";
import BestGames from "./pages/BestGames";
import BestGameEditor from "./pages/BestGameEditor";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import Dashboard from "./pages/Dashboard";
import PuzzleManager from "./pages/PuzzleManager";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if student needs onboarding - skip if profile already has info
  if (user.role === 'student' && !user.onboardingComplete && !user.profile?.fullName) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

// Auth Route Component (for login page)
const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    if (user.role === 'student' && !user.onboardingComplete) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/puzzles" replace />;
  }

  return <>{children}</>;
};

// Onboarding Route Component
const OnboardingRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.onboardingComplete) {
    return <Navigate to="/puzzles" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<AuthRoute><Login /></AuthRoute>} />
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />
    <Route
      path="/puzzle-manager"
      element={
        <ProtectedRoute>
          <PuzzleManager />
        </ProtectedRoute>
      }
    />
    <Route
      path="/login"
      element={
        <AuthRoute>
          <Login />
        </AuthRoute>
      }
    />
    <Route
      path="/onboarding"
      element={
        <OnboardingRoute>
          <Onboarding />
        </OnboardingRoute>
      }
    />
    <Route
      path="/puzzles"
      element={
        <ProtectedRoute>
          <Puzzles />
        </ProtectedRoute>
      }
    />
    <Route
      path="/games"
      element={
        <ProtectedRoute>
          <Games />
        </ProtectedRoute>
      }
    />
    <Route
      path="/openings"
      element={
        <ProtectedRoute>
          <Openings />
        </ProtectedRoute>
      }
    />
    <Route
      path="/openings/create"
      element={
        <ProtectedRoute>
          <OpeningEditor />
        </ProtectedRoute>
      }
    />
    <Route
      path="/openings/edit/:id"
      element={
        <ProtectedRoute>
          <OpeningEditor />
        </ProtectedRoute>
      }
    />
    <Route
      path="/best-games"
      element={
        <ProtectedRoute>
          <BestGames />
        </ProtectedRoute>
      }
    />
    <Route
      path="/best-games/create"
      element={
        <ProtectedRoute>
          <BestGameEditor />
        </ProtectedRoute>
      }
    />
    <Route
      path="/best-games/edit/:id"
      element={
        <ProtectedRoute>
          <BestGameEditor />
        </ProtectedRoute>
      }
    />
    <Route
      path="/profile"
      element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      }
    />
    <Route
      path="/profile/:userId"
      element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin"
      element={
        <ProtectedRoute>
          <AdminDashboard />
        </ProtectedRoute>
      }
    />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
