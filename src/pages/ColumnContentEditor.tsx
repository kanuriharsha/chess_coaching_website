import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useColumns } from '@/hooks/useColumns';

const API_BASE_URL = import.meta.env.VITE_API_URL;
type Evaluation = '' | 'best' | 'brilliant' | 'good' | 'inaccuracy';
interface MoveForm {
  san: string;
  comment: string;
  evaluation: Evaluation;
}
interface EditableContent {
  _id: string;
  title?: string;
  name?: string;
  players?: string;
  description?: string;
  category?: string;
  startFen?: string;
  moves?: Array<string | { san: string; comment?: string; evaluation?: Evaluation }>;
  highlights?: number[];
  isEnabled?: boolean;
}
interface ColumnInfo {
  _id: string;
  title: string;
  adminId: string;
  contentType: 'opening' | 'bestGame' | 'famousMate' | 'generic';
}

const blankMove = (): MoveForm => ({ san: '', comment: '', evaluation: '' });

export default function ColumnContentEditor() {
  const { columnId = '', contentId } = useParams();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: columns, isLoading: columnsLoading, error: columnsError } = useColumns(token);
  const navigate = useNavigate();
  const [column, setColumn] = useState<ColumnInfo | null>(null);
  const [title, setTitle] = useState('');
  const [players, setPlayers] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [startFen, setStartFen] = useState('');
  const [moves, setMoves] = useState<MoveForm[]>([blankMove()]);
  const [highlights, setHighlights] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isBestGame = column?.contentType === 'bestGame';

  useEffect(() => {
    if (!token || !columnId || columnsLoading) return;
    const load = async () => {
      setLoading(true);
      try {
        if (columnsError && !columns) throw columnsError;
        if (!columns) throw new Error('Failed to load columns');
        const current = columns.find(item => item._id === columnId);
        if (!current || current.adminId !== user?.id) throw new Error('You cannot manage this column');
        setColumn(current);
        if (!contentId) setCategory(current.contentType === 'bestGame' ? 'best' : 'General');
        if (contentId) {
          const response = await fetch(`${API_BASE_URL}/columns/${columnId}/contents`, { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) throw new Error('Failed to load column content');
          const items: EditableContent[] = await response.json();
          const content = items.find(item => item._id === contentId);
          if (!content) throw new Error('Content not found');
          setTitle(content.title || content.name || '');
          setPlayers(content.players || '');
          setDescription(content.description || '');
          setCategory(content.category || 'General');
          setStartFen(content.startFen || '');
          setMoves(content.moves?.length
            ? content.moves.map(move => typeof move === 'string'
              ? { san: move, comment: '', evaluation: '' }
              : { san: move.san, comment: move.comment || '', evaluation: move.evaluation || '' })
            : [blankMove()]);
          setHighlights((content.highlights || []).join(', '));
          setIsEnabled(content.isEnabled !== false);
        }
      } catch (error) {
        console.error('Load column content editor error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [columnId, contentId, token, user?.id, columns, columnsError, columnsLoading]);

  const updateMove = (index: number, field: keyof MoveForm, value: string) => {
    setMoves(current => current.map((move, moveIndex) =>
      moveIndex === index ? { ...move, [field]: value } : move
    ));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !column) return;
    const nonEmptyMoves = moves.filter(move => move.san.trim());
    if (!title.trim() || !nonEmptyMoves.length) {
      toast.error('Enter a title and at least one move');
      return;
    }
    const parsedHighlights = highlights.trim()
      ? highlights.split(',').map(value => Number(value.trim()))
      : [];
    if (parsedHighlights.some(value => !Number.isSafeInteger(value) || value < 0)) {
      toast.error('Highlights must be non-negative move numbers separated by commas');
      return;
    }
    const body = {
      title: title.trim(),
      players,
      description,
      category: category.trim() || 'General',
      startFen: startFen.trim() || undefined,
      moves: isBestGame
        ? nonEmptyMoves.map(move => move.san.trim())
        : nonEmptyMoves.map(move => ({
          san: move.san.trim(),
          comment: move.comment.trim() || undefined,
          evaluation: move.evaluation || undefined
        })),
      highlights: parsedHighlights,
      isEnabled
    };
    setSaving(true);
    try {
      const response = await fetch(
        contentId ? `${API_BASE_URL}/columns/${columnId}/contents/${contentId}` : `${API_BASE_URL}/columns/${columnId}/contents`,
        {
          method: contentId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body)
        }
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to save content');
      }
      await queryClient.invalidateQueries({ queryKey: ['column-contents', token, columnId] });
      toast.success(contentId ? 'Content updated' : 'Content created');
      navigate(`/columns/${columnId}`);
    } catch (error) {
      console.error('Save column content error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdminRole(user?.role)) return <AppLayout><p className="py-16 text-center">You do not have access to this page.</p></AppLayout>;
  if (loading) return <AppLayout><p className="py-16 text-center text-muted-foreground">Loading editor…</p></AppLayout>;
  if (!column || column.adminId !== user?.id) return <AppLayout><p className="py-16 text-center text-muted-foreground">Column not found.</p></AppLayout>;

  return (
    <AppLayout>
      <form onSubmit={save} className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm text-muted-foreground">{column.title}</p>
          <h1 className="text-3xl font-serif font-bold">{contentId ? 'Edit content' : 'Add content'}</h1>
        </header>
        <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="content-title">{isBestGame ? 'Game title' : 'Title'}</Label>
            <Input id="content-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={120} />
          </div>
          {isBestGame &&           <div className="space-y-2 sm:col-span-2"><Label htmlFor="players">Players</Label><Input id="players" value={players} onChange={event => setPlayers(event.target.value)} required /></div>}
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="description">Description</Label><Textarea id="description" value={description} onChange={event => setDescription(event.target.value)} rows={3} /></div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            {isBestGame ? (
              <select
                id="category"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                <option value="best">Best</option>
                <option value="brilliant">Brilliant</option>
                <option value="blunder">Blunder</option>
              </select>
            ) : (
              <Input id="category" value={category} onChange={event => setCategory(event.target.value)} />
            )}
          </div>
          <div className="space-y-2"><Label htmlFor="start-fen">Starting position (optional FEN)</Label><Input id="start-fen" value={startFen} onChange={event => setStartFen(event.target.value)} /></div>
          {isBestGame && <div className="space-y-2 sm:col-span-2"><Label htmlFor="highlights">Highlighted move indexes (comma-separated)</Label><Input id="highlights" value={highlights} onChange={event => setHighlights(event.target.value)} placeholder="0, 4, 8" /></div>}
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="content-enabled">Enabled for students</Label>
            <Switch id="content-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div><h2 className="text-xl font-semibold">Moves</h2><p className="text-sm text-muted-foreground">{isBestGame ? 'SAN moves are stored with the game format.' : 'Add move comments and evaluations where useful.'}</p></div>
            <Button type="button" variant="outline" onClick={() => setMoves(current => [...current, blankMove()])}><Plus className="mr-2 h-4 w-4" />Add move</Button>
          </div>
          {moves.map((move, index) => (
            <div key={index} className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[100px_1fr_150px_auto] sm:items-center">
              <Label className="text-muted-foreground">Move {index + 1}</Label>
              <Input aria-label={`Move ${index + 1} SAN`} value={move.san} onChange={event => updateMove(index, 'san', event.target.value)} placeholder="e.g. Nf3" />
              {!isBestGame && (
                <>
                  <Input aria-label={`Move ${index + 1} comment`} value={move.comment} onChange={event => updateMove(index, 'comment', event.target.value)} placeholder="Comment" />
                  <select aria-label={`Move ${index + 1} evaluation`} className="h-10 rounded-md border bg-background px-3 text-sm" value={move.evaluation} onChange={event => updateMove(index, 'evaluation', event.target.value)}>
                    <option value="">No evaluation</option>
                    <option value="best">Best</option>
                    <option value="brilliant">Brilliant</option>
                    <option value="good">Good</option>
                    <option value="inaccuracy">Inaccuracy</option>
                  </select>
                </>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove move ${index + 1}`} disabled={moves.length === 1} onClick={() => setMoves(current => current.filter((_, moveIndex) => moveIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </section>
        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save content'}</Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/columns/${columnId}`)}>Cancel</Button>
        </div>
      </form>
    </AppLayout>
  );
}
