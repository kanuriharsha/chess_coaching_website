import AppLayout from '@/components/AppLayout';
import PuzzleCreator from '@/components/PuzzleCreator';
import { useAuth } from '@/contexts/AuthContext';

const PuzzleManager = () => {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">You don't have access to this page.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PuzzleCreator />
    </AppLayout>
  );
};

export default PuzzleManager;
