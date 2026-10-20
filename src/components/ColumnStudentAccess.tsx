import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useColumns } from '@/hooks/useColumns';

const API_BASE_URL = import.meta.env.VITE_API_URL;

interface ColumnContent {
  _id: string;
  title?: string;
  name?: string;
  isEnabled?: boolean;
}
interface StudentColumn {
  _id: string;
  title: string;
  isEnabled?: boolean;
  contents: ColumnContent[];
}
export interface StudentColumnAccess {
  enabled: boolean;
  allowedContentIds: string[];
}
interface Props {
  value: Record<string, StudentColumnAccess>;
  onChange: (value: Record<string, StudentColumnAccess>) => void;
}

export default function ColumnStudentAccess({ value, onChange }: Props) {
  const { token } = useAuth();
  const { data: visibleColumns, isLoading: columnsLoading, error: columnsError } = useColumns(token);
  const [columns, setColumns] = useState<StudentColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || columnsLoading) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (columnsError && !visibleColumns) throw columnsError;
        if (!visibleColumns) throw new Error('Failed to load columns');
        const withContents = await Promise.all(visibleColumns.map(async column => {
          const contentResponse = await fetch(`${API_BASE_URL}/columns/${column._id}/contents`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!contentResponse.ok) throw new Error(`Failed to load ${column.title} contents`);
          const contents = (await contentResponse.json() as ColumnContent[])
            .filter(content => content.isEnabled !== false);
          return { ...column, contents };
        }));
        if (!cancelled) setColumns(withContents.filter(column =>
          column.isEnabled !== false && column.contents.length > 0
        ));
      } catch (loadError) {
        console.error('Load student column access options error:', loadError);
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Failed to load columns');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [token, columnsLoading, columnsError, visibleColumns]);

  const changeColumn = (column: StudentColumn, update: Partial<StudentColumnAccess>) => {
    const current = value[column._id] || { enabled: false, allowedContentIds: [] };
    onChange({
      ...value,
      [column._id]: {
        ...current,
        ...update,
        allowedContentIds: update.allowedContentIds || current.allowedContentIds
      }
    });
  };

  const changeContent = (column: StudentColumn, contentId: string, checked: boolean) => {
    const current = value[column._id] || { enabled: false, allowedContentIds: [] };
    const allSelected = current.enabled && current.allowedContentIds.length === 0;
    let selected = allSelected
      ? column.contents.map(content => content._id)
      : [...current.allowedContentIds];
    if (checked && !selected.includes(contentId)) selected.push(contentId);
    if (!checked) selected = selected.filter(id => id !== contentId);
    const normalizedIds = selected.length === column.contents.length
      ? []
      : [...new Set(selected)];
    changeColumn(column, {
      enabled: checked || normalizedIds.length > 0,
      allowedContentIds: normalizedIds
    });
  };

  if (loading) return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading columns…</div>;
  if (error) return <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>;
  if (!columns.length) return <p className="text-sm text-muted-foreground">No columns are available to assign.</p>;

  return (
    <div className="space-y-4">
      {columns.map(column => {
        const settings = value[column._id] || { enabled: false, allowedContentIds: [] };
        const allSelected = settings.enabled && settings.allowedContentIds.length === 0;
        return (
          <section key={column._id} className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="flex items-center gap-2 font-medium"><BookOpen className="h-4 w-4 text-primary" />{column.title}</h4>
              <Switch checked={settings.enabled} onCheckedChange={enabled => changeColumn(column, { enabled })} aria-label={`Allow ${column.title}`} />
            </div>
            {settings.enabled && (column.contents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content items.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {column.contents.map(content => {
                  const checked = allSelected || settings.allowedContentIds.includes(content._id);
                  return (
                    <label key={content._id} className="flex items-center gap-2 rounded-md bg-secondary/40 p-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={next => changeContent(column, content._id, next === true)}
                      />
                      <span>{content.title || content.name || 'Untitled content'}</span>
                    </label>
                  );
                })}
              </div>
            ))}
            {settings.enabled && settings.allowedContentIds.length === 0 && column.contents.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">All enabled content in this column is allowed.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
