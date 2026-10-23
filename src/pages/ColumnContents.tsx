import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { ChevronLeft, ChevronRight, Edit, Plus, SkipBack, SkipForward, Star, Trash2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import ChessBoard from '@/components/ChessBoard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { toast } from 'sonner';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useColumns } from '@/hooks/useColumns';
import { useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_URL;

interface ColumnContent {
  _id: string;
  title?: string;
  name?: string;
  players?: string;
  description?: string;
  category?: string;
  startFen?: string;
  moves: Array<string | { san: string; comment?: string; evaluation?: string }>;
  highlights?: number[];
  isEnabled?: boolean;
  isShared?: boolean;
}

function moveSan(move: ColumnContent['moves'][number]) {
  return typeof move === 'string' ? move : move.san;
}

function itemTitle(content: ColumnContent) {
  return content.title || content.name || 'Untitled content';
}

export default function ColumnContents() {
  const { columnId = '' } = useParams();
  const { token, user } = useAuth();
  const { data: columns, isLoading: columnsLoading, error: columnsError } = useColumns(token);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { trackPageVisit, trackOpeningViewed } = useActivityTracker();
  const [column, setColumn] = useState<{ _id: string; title: string; adminId: string; isEnabled: boolean } | null>(null);
  const [contents, setContents] = useState<ColumnContent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [moveIndex, setMoveIndex] = useState(-1);
  const [game, setGame] = useState(new Chess());
  const [loading, setLoading] = useState(true);
  const isAdmin = isAdminRole(user?.role);
  const selected = contents.find(content => content._id === selectedId) || null;
  const canManage = isAdmin && column?.adminId === user?.id;

  const loadColumn = useCallback(async () => {
    if (!token || !columnId || columnsLoading) return;
    setLoading(true);
    try {
      if (columnsError && !columns) throw columnsError;
      if (!columns) throw new Error('Unable to load columns');
      const currentColumn = columns.find((item: { _id: string }) => item._id === columnId);
      if (!currentColumn) throw new Error('Column not found');
      const contentsResponse = await fetch(`${API_BASE_URL}/columns/${columnId}/contents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!contentsResponse.ok) throw new Error('Unable to load this column');
      const items: ColumnContent[] = await contentsResponse.json();
      setColumn(currentColumn);
      setContents(items);
      setSelectedId(current => items.some(item => item._id === current) ? current : '');
    } catch (error) {
      console.error('Load column contents error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load column');
      setColumn(null);
      setContents([]);
    } finally {
      setLoading(false);
    }
  }, [columnId, columns, columnsError, columnsLoading, token]);

  useEffect(() => { void loadColumn(); }, [loadColumn]);
  useEffect(() => {
    trackPageVisit(column?.title || 'Column');
  }, [column?.title, trackPageVisit]);

  const sans = useMemo(() => selected?.moves?.map(moveSan) || [], [selected]);

  useEffect(() => {
    if (!selected) return;

    const handleMoveNavigation = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, [role="combobox"], [contenteditable="true"]'))
      ) return;

      event.preventDefault();
      setMoveIndex(index => event.key === 'ArrowLeft'
        ? Math.max(-1, index - 1)
        : Math.min(sans.length - 1, index + 1)
      );
    };

    window.addEventListener('keydown', handleMoveNavigation);
    return () => window.removeEventListener('keydown', handleMoveNavigation);
  }, [selected, sans.length]);

  useEffect(() => {
    if (!selected) {
      setGame(new Chess());
      setMoveIndex(-1);
      return;
    }
    const nextGame = new Chess(selected.startFen || undefined);
    try {
      sans.slice(0, moveIndex + 1).forEach(san => nextGame.move(san));
      setGame(nextGame);
    } catch (error) {
      console.error('Replay column content moves error:', error);
      toast.error(`Could not replay the moves for ${itemTitle(selected)}`);
    }
  }, [selected, sans, moveIndex]);

  const selectContent = (content: ColumnContent) => {
    setSelectedId(content._id);
    setMoveIndex(-1);
    if (content._id) trackOpeningViewed(itemTitle(content), content.category || column?.title || 'Column');
  };

  const deleteContent = async (content: ColumnContent) => {
    if (!token || !window.confirm(`Delete "${itemTitle(content)}"?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/columns/${columnId}/contents/${content._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete content');
      await queryClient.invalidateQueries({ queryKey: ['column-contents', token, columnId] });
      if (selectedId === content._id) setSelectedId('');
      await loadColumn();
      toast.success('Content deleted');
    } catch (error) {
      console.error('Delete column content error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete content');
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <div className="mb-8">
            <div className="h-9 w-1/3 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-4" aria-label="Loading column contents" aria-busy="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="card-premium animate-pulse p-5">
                <div className="mb-3 h-4 w-1/4 rounded bg-muted" />
                <div className="mb-2 h-6 w-1/2 rounded bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }
  if (!column) return <AppLayout><p className="py-20 text-center text-muted-foreground">This column is unavailable.</p></AppLayout>;

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 font-serif text-3xl font-bold text-foreground md:text-4xl">
              {selected ? itemTitle(selected) : column.title}
            </h1>
            <p className="text-muted-foreground">
              {selected ? selected.description : `Choose a ${column.title.toLowerCase()} to study`}
            </p>
          </div>
          {canManage && !selected && (
            <Button onClick={() => navigate(`/columns/${columnId}/create`)}>
              <Plus className="mr-2 h-4 w-4" />
              {contents.length ? 'Add New' : 'Add'}
            </Button>
          )}
        </header>

        {!selected ? (
          contents.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                {canManage ? `No content in ${column.title} yet. Click + Add to create some.` : `No accessible content in ${column.title}.`}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {contents.map(content => (
                <article key={content._id} className="card-premium group relative flex items-start gap-4 p-5 hover:border-primary/50">
                  <button className="min-w-0 flex-1 text-left" onClick={() => selectContent(content)}>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      {content.category || column.title}
                    </span>
                    <h2 className="mb-1 mt-2 font-serif text-xl font-semibold text-foreground">
                      {itemTitle(content)}
                    </h2>
                    {content.players && <p className="mb-1 text-sm font-medium text-primary">{content.players}</p>}
                    <p className="text-sm text-muted-foreground">{content.description}</p>
                  </button>
                  {canManage && !content.isShared && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/columns/${columnId}/edit/${content._id}`)}
                        aria-label={`Edit ${itemTitle(content)}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void deleteContent(content)}
                        aria-label={`Delete ${itemTitle(content)}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedId('')}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to {column.title.toLowerCase()}
            </button>
            <div className="grid gap-6 md:grid-cols-[1fr,320px]">
              <div>
                <ChessBoard game={game} interactive={false} />
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setMoveIndex(-1)} disabled={moveIndex < 0} aria-label="Go to start"><SkipBack className="h-5 w-5" /></Button>
                  <Button variant="outline" size="icon" onClick={() => setMoveIndex(index => Math.max(-1, index - 1))} disabled={moveIndex < 0} aria-label="Previous move"><ChevronLeft className="h-5 w-5" /></Button>
                  <Button variant="outline" size="icon" onClick={() => setMoveIndex(index => Math.min(sans.length - 1, index + 1))} disabled={moveIndex >= sans.length - 1} aria-label="Next move"><ChevronRight className="h-5 w-5" /></Button>
                  <Button variant="outline" size="icon" onClick={() => setMoveIndex(sans.length - 1)} disabled={moveIndex >= sans.length - 1} aria-label="Go to end"><SkipForward className="h-5 w-5" /></Button>
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Use the ← and → arrow keys to move through the game.
                </p>
              </div>
              <div className="space-y-4">
                <div className="card-premium p-5">
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{selected.category || column.title}</span>
                  <h2 className="mb-2 mt-3 font-serif text-2xl font-bold">{itemTitle(selected)}</h2>
                  {selected.players && <p className="mb-2 font-medium text-primary">{selected.players}</p>}
                  <p className="text-sm text-muted-foreground">{selected.description}</p>
                  {canManage && !selected.isShared && (
                    <Button className="mt-4" variant="outline" onClick={() => navigate(`/columns/${columnId}/edit/${selected._id}`)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit
                    </Button>
                  )}
                </div>
                <div className="card-premium p-5">
                  <h3 className="mb-3 font-medium">Moves</h3>
                  <div className="grid grid-cols-[2rem,1fr,1fr] gap-x-2 gap-y-1 font-mono text-sm">
                    <span />
                    <span className="font-semibold text-foreground">White</span>
                    <span className="font-semibold text-foreground">Black</span>
                    {Array.from({ length: Math.ceil(selected.moves.length / 2) }).map((_, index) => {
                      const whiteIndex = index * 2;
                      const blackIndex = whiteIndex + 1;
                      const whiteMove = selected.moves[whiteIndex];
                      const blackMove = selected.moves[blackIndex];
                      const whiteDetail = typeof whiteMove === 'string' ? null : whiteMove;
                      const blackDetail = typeof blackMove === 'string' ? null : blackMove;
                      return (
                        <div key={index} className="contents">
                          <span className="text-muted-foreground">{index + 1}.</span>
                          <button
                            onClick={() => setMoveIndex(whiteIndex)}
                            className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                              moveIndex === whiteIndex
                                ? 'border-[#A6B398] bg-[#DEE1D7] font-semibold text-[#577240]'
                                : 'border-transparent hover:bg-secondary hover:text-primary'
                            }`}
                          >
                            {moveSan(whiteMove)}
                            {selected.highlights?.includes(whiteIndex) && <Star className="ml-1 inline h-3 w-3 fill-current text-amber-500" />}
                            {whiteDetail?.evaluation && <span className="ml-1 text-xs">({whiteDetail.evaluation})</span>}
                            {whiteDetail?.comment && <span className="block text-xs text-muted-foreground">{whiteDetail.comment}</span>}
                          </button>
                          {blackMove ? (
                            <button
                              onClick={() => setMoveIndex(blackIndex)}
                              className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                                moveIndex === blackIndex
                                  ? 'border-[#A6B398] bg-[#DEE1D7] font-semibold text-[#577240]'
                                  : 'border-transparent hover:bg-secondary hover:text-primary'
                              }`}
                            >
                              {moveSan(blackMove)}
                              {selected.highlights?.includes(blackIndex) && <Star className="ml-1 inline h-3 w-3 fill-current text-amber-500" />}
                              {blackDetail?.evaluation && <span className="ml-1 text-xs">({blackDetail.evaluation})</span>}
                              {blackDetail?.comment && <span className="block text-xs text-muted-foreground">{blackDetail.comment}</span>}
                            </button>
                          ) : <span />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
