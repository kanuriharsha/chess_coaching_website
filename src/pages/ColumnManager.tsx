import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Crown, Lightbulb, Puzzle, Star, Swords, Target, Trophy, Plus, Trash2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { DynamicColumn, useColumns } from '@/hooks/useColumns';

const API_BASE_URL = import.meta.env.VITE_API_URL;
const iconChoices = [
  { key: 'BookOpen', title: 'Book', Icon: BookOpen },
  { key: 'Trophy', title: 'Trophy', Icon: Trophy },
  { key: 'Crown', title: 'Crown', Icon: Crown },
  { key: 'Puzzle', title: 'Puzzle', Icon: Puzzle },
  { key: 'Star', title: 'Star', Icon: Star },
  { key: 'Target', title: 'Target', Icon: Target },
  { key: 'Lightbulb', title: 'Lightbulb', Icon: Lightbulb },
  { key: 'Swords', title: 'Swords', Icon: Swords },
];
const presetColumns = [
  { title: 'Openings', icon: 'BookOpen', contentType: 'opening' as const, description: 'Opening lines with move notes and evaluations.' },
  { title: 'Famous Mates', icon: 'Crown', contentType: 'famousMate' as const, description: 'Checkmate patterns with move notes and evaluations.' },
  { title: 'Best Games', icon: 'Trophy', contentType: 'bestGame' as const, description: 'Annotated games with player names and highlighted moves.' },
];

function columnIcon(iconName: string) {
  return iconChoices.find(({ key }) => key === iconName)?.Icon || BookOpen;
}

export default function ColumnManager() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: columns = [], isLoading: loading, error: columnsError } = useColumns(token);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('BookOpen');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (columnsError) {
      console.error('Load columns error:', columnsError);
      toast.error(columnsError instanceof Error ? columnsError.message : 'Failed to load columns');
    }
  }, [columnsError]);

  const createColumn = async (input: { title: string; icon: string; contentType: DynamicColumn['contentType'] }) => {
    if (!input.title.trim() || !token) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || `Failed to create column (HTTP ${response.status})`);
      }
      setTitle('');
      await queryClient.invalidateQueries({ queryKey: ['columns'] });
      toast.success(`${input.title} column created`);
    } catch (error) {
      console.error('Create column error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create column');
    } finally {
      setSaving(false);
    }
  };

  const createCustomColumn = async (event: FormEvent) => {
    event.preventDefault();
    await createColumn({ title: title.trim(), icon, contentType: 'generic' });
  };

  const updateColumn = async (column: DynamicColumn, update: Partial<DynamicColumn>) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/columns/${column._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(update)
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to update column');
      }
      await queryClient.invalidateQueries({ queryKey: ['columns'] });
      toast.success('Column updated');
    } catch (error) {
      console.error('Update column error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update column');
    }
  };

  const moveColumn = async (index: number, offset: -1 | 1) => {
    const ownColumns = columns.filter(column => column.adminId === user?.id);
    const targetIndex = index + offset;
    if (!token || targetIndex < 0 || targetIndex >= ownColumns.length) return;
    const reordered = [...ownColumns];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    try {
      const responses = await Promise.all(reordered.map((column, order) =>
        fetch(`${API_BASE_URL}/columns/${column._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ order })
        })
      ));
      const failed = responses.find(response => !response.ok);
      if (failed) throw new Error(`Failed to reorder columns (HTTP ${failed.status})`);
      await queryClient.invalidateQueries({ queryKey: ['columns'] });
    } catch (error) {
      console.error('Reorder columns error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reorder columns');
    }
  };

  const deleteColumn = async (column: DynamicColumn) => {
    if (!token || !window.confirm(`Delete "${column.title}" and all of its content?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/columns/${column._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete column');
      await queryClient.invalidateQueries({ queryKey: ['columns'] });
      toast.success('Column deleted');
    } catch (error) {
      console.error('Delete column error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete column');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-serif font-bold">Add Columns</h1>
          <p className="mt-2 text-muted-foreground">Create and organize your chess-learning sections.</p>
        </header>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Standard columns</h2>
          <p className="text-sm text-muted-foreground">Choose a built-in column type. Each type has its own matching content fields.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {presetColumns.map(preset => {
              const Icon = columnIcon(preset.icon);
              const exists = columns.some(column =>
                column.adminId === user?.id && column.contentType === preset.contentType
              );
              return (
                <article key={preset.contentType} className="space-y-3 rounded-xl border bg-card p-5">
                  <Icon className="h-6 w-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">{preset.title}</h3>
                    <p className="text-sm text-muted-foreground">{preset.description}</p>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={saving || loading || exists}
                    onClick={() => void createColumn(preset)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {exists ? 'Already added' : `Add ${preset.title}`}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        <details className="rounded-xl border bg-card p-5">
          <summary className="cursor-pointer font-semibold">Create a custom column</summary>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">Use a custom title and icon for other types of learning content.</p>
        <form onSubmit={createCustomColumn} className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="column-title">Column title</Label>
            <Input id="column-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {iconChoices.map(({ key, title: iconTitle, Icon }) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{iconTitle}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={saving || !title.trim()}>
            <Plus className="mr-2 h-4 w-4" />{saving ? 'Creating…' : 'Add Custom Column'}
          </Button>
        </form>
        </details>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your columns</h2>
          {loading ? <p className="text-muted-foreground">Loading columns…</p> :
            columns.filter(column => column.adminId === user?.id).length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No columns yet. Create one above.</p>
            ) : columns.filter(column => column.adminId === user?.id).map((column, index, ownColumns) => {
              const Icon = columnIcon(column.icon);
              return (
                <article key={column._id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
                  <Icon className="h-6 w-6 text-primary" />
                  <Link to={`/columns/${column._id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {column.title}
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Enabled</span>
                    <Switch checked={column.isEnabled} onCheckedChange={isEnabled => void updateColumn(column, { isEnabled })} aria-label={`Enable ${column.title}`} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={index === 0} onClick={() => void moveColumn(index, -1)}>Up</Button>
                    <Button variant="outline" size="sm" disabled={index === ownColumns.length - 1} onClick={() => void moveColumn(index, 1)}>Down</Button>
                    <Button variant="destructive" size="icon" onClick={() => void deleteColumn(column)} aria-label={`Delete ${column.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
        </section>
      </div>
    </AppLayout>
  );
}
