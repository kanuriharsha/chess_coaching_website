import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import OpeningEditor from '@/pages/OpeningEditor';
import BestGameEditor from '@/pages/BestGameEditor';
import FamousMatesEditor from '@/pages/FamousMatesEditor';
import { toast } from 'sonner';
import { useColumns } from '@/hooks/useColumns';

type ContentType = 'opening' | 'bestGame' | 'famousMate' | 'generic';

export default function ColumnTypeEditor() {
  const { columnId = '' } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { data: columns, isLoading, error } = useColumns(token);
  const [contentType, setContentType] = useState<ContentType | null>(null);

  useEffect(() => {
    if (!token || !columnId || isLoading) return;
    if (error && !columns) {
      console.error('Load column editor type error:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to load your columns');
      navigate(`/columns/${columnId}`);
      return;
    }
    const column = columns?.find(item => item._id === columnId && item.adminId === user?.id);
    if (!column) {
      toast.error('You cannot edit this column');
      navigate(`/columns/${columnId}`);
      return;
    }
    setContentType(column.contentType);
  }, [columnId, token, user?.id, navigate, columns, isLoading, error]);

  if (isLoading || !contentType) {
    return <AppLayout><p className="py-16 text-center text-muted-foreground">Loading editor…</p></AppLayout>;
  }
  if (contentType === 'bestGame') return <BestGameEditor />;
  if (contentType === 'famousMate') return <FamousMatesEditor />;
  return <OpeningEditor />;
}
