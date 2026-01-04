import AppLayout from '@/components/AppLayout';
import PuzzleCreator from '@/components/PuzzleCreator';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';

const PuzzleManager = () => {
  const { user } = useAuth();
  const location = useLocation();
  const editPuzzleId = (location.state as any)?.editPuzzleId as string | undefined;

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
      <PuzzleCreator editPuzzleId={editPuzzleId} />
    </AppLayout>
  );
};

export default PuzzleManager;
