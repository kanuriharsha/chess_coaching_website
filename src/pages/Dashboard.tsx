import AppLayout from '@/components/AppLayout';
import StudentDashboard from '@/components/StudentDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const Dashboard = () => {
  const { user } = useAuth();

  // Admin should go to admin dashboard
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AppLayout>
      <StudentDashboard />
    </AppLayout>
  );
};

export default Dashboard;
