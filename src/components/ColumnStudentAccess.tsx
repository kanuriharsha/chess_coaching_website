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
  hiddenContentIds?: string[];
  visibleContentIds?: string[];
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

  const changeContentAccess = (column: StudentColumn, contentId: string, checked: boolean) => {
    const current = value[column._id] || { enabled: false, allowedContentIds: [] };
    const allSelected = current.enabled && current.allowedContentIds.length === 0 &&
      current.hiddenContentIds === undefined && current.visibleContentIds === undefined;
    const selected = allSelected
      ? column.contents.map(content => content._id)
      : [...current.allowedContentIds];
    const nextSelected = checked
      ? [...new Set([...selected, contentId])]
      : selected.filter(id => id !== contentId);
    const hiddenIds = new Set(current.hiddenContentIds ?? column.contents
      .filter(content => !selected.includes(content._id))
      .map(content => content._id));
    const visibleIds = new Set(current.visibleContentIds || []);
    if (checked) hiddenIds.delete(contentId);
    if (checked) visibleIds.delete(contentId);
    else {
      hiddenIds.add(contentId);
      visibleIds.delete(contentId);
    }
    onChange({
      ...value,
      [column._id]: {
        enabled: current.enabled || checked,
        allowedContentIds: nextSelected,
        hiddenContentIds: [...hiddenIds],
        visibleContentIds: [...visibleIds]
      }
    });
  };

  const changeContentVisibility = (column: StudentColumn, contentId: string, hidden: boolean) => {
    const current = value[column._id] || { enabled: false, allowedContentIds: [] };
    const allSelected = current.enabled && current.allowedContentIds.length === 0 &&
      current.hiddenContentIds === undefined && current.visibleContentIds === undefined;
    const selected = allSelected
      ? column.contents.map(content => content._id)
      : [...current.allowedContentIds];
    const hiddenIds = new Set(current.hiddenContentIds ?? column.contents
      .filter(content => !selected.includes(content._id))
      .map(content => content._id));
    const visibleIds = new Set(current.visibleContentIds || []);
    if (hidden) {
      hiddenIds.add(contentId);
      visibleIds.delete(contentId);
    } else {
      hiddenIds.delete(contentId);
      if (!selected.includes(contentId)) visibleIds.add(contentId);
    }
    onChange({
      ...value,
      [column._id]: {
        enabled: current.enabled,
        allowedContentIds: selected,
        hiddenContentIds: [...hiddenIds],
        visibleContentIds: [...visibleIds]
      }
    });
  };

  const changeColumnAccess = (column: StudentColumn, enabled: boolean) => {
    const current = value[column._id] || { enabled: false, allowedContentIds: [] };
    const allSelected = current.enabled && current.allowedContentIds.length === 0 &&
      current.hiddenContentIds === undefined && current.visibleContentIds === undefined;
    const allowedContentIds = allSelected
      ? column.contents.map(content => content._id)
      : [...current.allowedContentIds];
    const hiddenContentIds = current.hiddenContentIds ?? column.contents
      .filter(content => !allowedContentIds.includes(content._id))
      .map(content => content._id);
    onChange({
      ...value,
      [column._id]: {
        ...current,
        enabled,
        allowedContentIds,
        hiddenContentIds,
        visibleContentIds: current.visibleContentIds || []
      }
    });
  };

  if (loading) return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading columns…</div>;
  if (error) return <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>;
  if (!columns.length) return <p className="text-sm text-muted-foreground">No columns are available to assign.</p>;

  return (
    <div className="space-y-4">
      {columns.map(column => {
        const settings = value[column._id] || { enabled: false, allowedContentIds: [] };
        const allSelected = settings.enabled && settings.allowedContentIds.length === 0 &&
          settings.hiddenContentIds === undefined && settings.visibleContentIds === undefined;
        return (
          <section key={column._id} className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="flex items-center gap-2 font-medium"><BookOpen className="h-4 w-4 text-primary" />{column.title}</h4>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Allow column</span>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={enabled => changeColumnAccess(column, enabled)}
                  aria-label={`Allow ${column.title} for student`}
                />
              </label>
            </div>
            {column.contents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content items.</p>
            ) : (
              <div className="grid gap-2">
                {column.contents.map(content => {
                  const unlocked = allSelected || settings.allowedContentIds.includes(content._id);
                  const hidden = Boolean(settings.hiddenContentIds?.includes(content._id)) ||
                    (!unlocked && !settings.visibleContentIds?.includes(content._id));
                  return (
                    <div key={content._id} className="flex flex-col gap-3 rounded-md bg-secondary/40 p-3 text-sm sm:flex-row sm:items-center">
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <Checkbox
                          checked={unlocked}
                          onCheckedChange={next => changeContentAccess(column, content._id, next === true)}
                          aria-label={`Unlock ${content.title || content.name || 'content'}`}
                        />
                        <span className="truncate">{content.title || content.name || 'Untitled content'}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          unlocked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {unlocked ? 'Unlocked' : 'Locked'}
                        </span>
                      </label>
                      <label className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        <Checkbox
                          checked={hidden}
                          onCheckedChange={next => changeContentVisibility(column, content._id, next === true)}
                          aria-label={`Hide ${content.title || content.name || 'content'} from student`}
                        />
                        Hide
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
