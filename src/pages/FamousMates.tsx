import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward, Crown, Lock, Plus, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useChessSound } from '@/hooks/useChessSound';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface FamousMate {
  _id?: string;
  id?: string;
  name: string;
  description: string;
  moves: { san: string; comment?: string; evaluation?: 'best' | 'brilliant' | 'good' | 'inaccuracy' }[];
  category: string;
  startFen?: string; // Optional custom starting position
  isEnabled?: boolean;
  isLocked?: boolean;
}

interface ContentAccess {
  puzzleAccess: {
    [category: string]: {
      enabled: boolean;
      limit: number;
    };
  };
  openingAccess: {
    enabled: boolean;
    allowedOpenings: string[];
  };
  famousMatesAccess: {
    enabled: boolean;
    allowedMates: string[];
  };
  bestGamesAccess: {
    enabled: boolean;
    allowedGames: string[];
  };
}

// Default famous mates (fallback)
const defaultFamousMates: FamousMate[] = [
  {
    id: 'fools-mate',
    name: "Fool's Mate",
    description: 'The fastest possible checkmate in chess, occurring in just two moves.',
    category: 'Famous Mates',
    moves: [
      { san: 'f3', comment: 'A very weak move, exposing the king', evaluation: 'inaccuracy' },
      { san: 'e5', comment: 'Black develops normally' },
      { san: 'g4', comment: 'Another terrible move!', evaluation: 'inaccuracy' },
      { san: 'Qh4#', comment: 'Checkmate! The queen delivers mate', evaluation: 'brilliant' },
    ],
  },
  {
    id: 'scholars-mate',
    name: "Scholar's Mate",
    description: 'A four-move checkmate that targets the f7 square.',
    category: 'Famous Mates',
    moves: [
      { san: 'e4', comment: 'Control the center' },
      { san: 'e5', comment: 'Black responds symmetrically' },
      { san: 'Bc4', comment: 'Target f7', evaluation: 'good' },
      { san: 'Nc6', comment: 'Develop the knight' },
      { san: 'Qh5', comment: 'Threaten f7', evaluation: 'good' },
      { san: 'Nf6', comment: 'Defend but...', evaluation: 'inaccuracy' },
      { san: 'Qxf7#', comment: 'Checkmate!', evaluation: 'brilliant' },
    ],
  },
];

const FamousMates = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [famousMates, setFamousMates] = useState<FamousMate[]>([]);
  const [isLoadingFamousMates, setIsLoadingFamousMates] = useState(true);
  const [hasLoadedFamousMates, setHasLoadedFamousMates] = useState(false);
  const [famousMatesLoadError, setFamousMatesLoadError] = useState(false);
  const [selectedMate, setSelectedMate] = useState<FamousMate | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [game, setGame] = useState(new Chess());
  const [contentAccess, setContentAccess] = useState<ContentAccess | null>(null);
  const [isContentLocked, setIsContentLocked] = useState(false);
  const { trackPageVisit } = useActivityTracker();
  const { playSound } = useChessSound();
  const sortedRef = useRef(false);

  const isAdmin = isAdminRole(user?.role);

  // Track page visit
  useEffect(() => {
    trackPageVisit('Famous Mates');
  }, []);

  useEffect(() => {
    if (!token) return;
    loadFamousMates();
    if (!isAdmin) {
      loadContentAccess();
    }
  }, [isAdmin, token]);

  const loadContentAccess = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/my-content-access`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const access = await response.json();
        setContentAccess(access);
        setIsContentLocked(!access.famousMatesAccess?.enabled);
      }
    } catch (error) {
      console.error('Load content access error:', error);
    }
  };

  const loadFamousMates = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/famous-mates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`Failed to load famous mates: ${response.status}`);
      const data: FamousMate[] = await response.json();
      setFamousMates(data);
      setHasLoadedFamousMates(true);
    } catch (error) {
      console.error('Load famous mates error:', error);
      setFamousMatesLoadError(true);
    } finally {
      setIsLoadingFamousMates(false);
    }
  };

  // Reorder famous mates when contentAccess becomes available - ALWAYS sort for non-admin users
  useEffect(() => {
    if (!isAdmin && contentAccess && famousMates.length > 0) {
      const isEnabled = contentAccess.famousMatesAccess?.enabled;
      const hasGranularAccess = contentAccess.famousMatesAccess?.allowedMates?.length > 0;
      
      // If famous mates are enabled and there's granular access (specific mates unlocked)
      if (isEnabled && hasGranularAccess && !sortedRef.current) {
        // Put unlocked first, locked after
        const allowed = new Set(contentAccess.famousMatesAccess.allowedMates.map(String));
        const reordered = [...famousMates].sort((a, b) => {
          const aKey = (a._id || a.id)?.toString() || '';
          const bKey = (b._id || b.id)?.toString() || '';
          const aAllowed = allowed.has(aKey) ? 0 : 1; // unlocked = 0
          const bAllowed = allowed.has(bKey) ? 0 : 1; // locked = 1
          return aAllowed - bAllowed; // unlocked first, locked after
        });
        setFamousMates(reordered);
        sortedRef.current = true;
      }
      // If allowedMates is empty array (all unlocked) or feature is disabled (all locked), no need to reorder
    }
  }, [contentAccess, isAdmin, famousMates.length]);

  const selectMate = (mate: FamousMate) => {
    if (!isAdmin && mate.isLocked) {
      toast.error('Content Locked', {
        description: 'This famous mate is locked. Contact your instructor to unlock it.',
        icon: <Lock className="w-4 h-4" />,
      });
      return;
    }
    // Check if famous mates are globally locked
    if (!isAdmin && isContentLocked) {
      toast.error('Content Locked', {
        description: 'Famous Mates are locked. Contact your instructor to unlock.',
        icon: <Lock className="w-4 h-4" />,
      });
      return;
    }
    // Check if this specific mate is allowed (granular access)
    if (!isAdmin && contentAccess?.famousMatesAccess?.allowedMates?.length) {
      const mateId = (mate._id || mate.id)?.toString() || '';
      const allowed = contentAccess.famousMatesAccess.allowedMates.map(String);
      if (!allowed.includes(mateId)) {
        toast.error('Content Locked', {
          description: 'This famous mate is locked. Contact your instructor to unlock.',
          icon: <Lock className="w-4 h-4" />,
        });
        return;
      }
    }
    setSelectedMate(mate);
    setCurrentMoveIndex(-1);
    setGame(new Chess(mate.startFen || undefined));
  };

  const goToMove = (index: number) => {
    if (!selectedMate) return;
    
    const newGame = new Chess(selectedMate.startFen || undefined);
    for (let i = 0; i <= index && i < selectedMate.moves.length; i++) {
      newGame.move(selectedMate.moves[i].san);
    }
    setGame(newGame);
    setCurrentMoveIndex(index);
  };

  const nextMove = () => {
    if (!selectedMate || currentMoveIndex >= selectedMate.moves.length - 1) return;
    playSound('move');
    goToMove(currentMoveIndex + 1);
  };

  const prevMove = () => {
    if (currentMoveIndex < 0) return;
    if (currentMoveIndex === 0) {
      if (selectedMate) {
        setGame(new Chess(selectedMate.startFen || undefined));
      }
      setCurrentMoveIndex(-1);
    } else {
      goToMove(currentMoveIndex - 1);
    }
  };

  const goToStart = () => {
    if (selectedMate) {
      setGame(new Chess(selectedMate.startFen || undefined));
    }
    setCurrentMoveIndex(-1);
  };

  const goToEnd = () => {
    if (!selectedMate) return;
    goToMove(selectedMate.moves.length - 1);
  };

  const getEvaluationColor = (evaluation?: string) => {
    switch (evaluation) {
      case 'brilliant':
        return 'bg-brilliant text-brilliant-foreground';
      case 'best':
        return 'bg-success text-success-foreground';
      case 'good':
        return 'bg-primary text-primary-foreground';
      case 'inaccuracy':
        return 'bg-warning text-warning-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
                Famous Mates
              </h1>
              <p className="text-muted-foreground">
                Learn the most famous checkmate patterns in chess history
              </p>
            </div>
            {isAdmin && !selectedMate && (
              <Button onClick={() => navigate('/famous-mates/create')}>
                <Plus className="w-4 h-4 mr-2" />
                {famousMates.length === 0 ? 'Add' : 'Add New Mate'}
              </Button>
            )}
          </div>
        </div>

        {!selectedMate ? (
          /* Mates List */
          isLoadingFamousMates ? (
            <div className="space-y-4" aria-label="Loading famous mates" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="card-premium p-5 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/4 mb-3" />
                  <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : famousMatesLoadError ? (
            <p className="text-center text-muted-foreground py-12">Unable to load Famous Mates. Please try again.</p>
          ) : isAdmin && hasLoadedFamousMates && famousMates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No content in Famous Mates. Click the + Add button to add content.</p>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="grid gap-4">
              {famousMates.map((mate) => {
                // Determine if this specific mate is locked
                const mateId = (mate._id || mate.id)?.toString() || '';
                const hasGranularAccess = !isAdmin && contentAccess?.famousMatesAccess?.allowedMates?.length;
                const isMateLocked = !isAdmin && (mate.isLocked ?? (hasGranularAccess
                  ? !contentAccess.famousMatesAccess.allowedMates.map(String).includes(mateId)
                  : isContentLocked));
                
                return (
                <button
                  key={mate.id || mate._id}
                  onClick={() => selectMate(mate)}
                  disabled={isMateLocked}
                  className="card-premium p-5 text-left group hover:border-primary/50 relative"
                >
                  {/* Locked Badge - Top Right Corner */}
                  {isMateLocked && (
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 bg-destructive/90 text-destructive-foreground rounded-md text-xs font-medium shadow-sm">
                      <Lock className="w-3 h-3" />
                      Locked
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                        {mate.category}
                      </span>
                      <h3 className="font-serif text-xl font-semibold text-foreground mt-2 mb-1">
                        {mate.name}
                      </h3>
                      <p className="text-muted-foreground text-sm">{mate.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/famous-mates/edit/${mate._id || mate.id}`);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      <Crown className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </button>
              );
              })}
            </div>
          </div>
          )
        ) : (
          /* Mate Study View */
          <div className="space-y-6">
            {/* Back Button */}
            <button
              onClick={() => setSelectedMate(null)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to famous mates
            </button>

            <div className="grid md:grid-cols-[1fr,320px] gap-6">
              {/* Board */}
              <div>
                <ChessBoard game={game} interactive={false} />

                {/* Navigation Controls */}
                <div className="flex justify-center gap-2 mt-4">
                  <button
                    onClick={goToStart}
                    className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button
                    onClick={prevMove}
                    className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextMove}
                    className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    onClick={goToEnd}
                    className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Mate Info */}
              <div className="space-y-4">
                <div className="card-premium p-5">
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                    {selectedMate.category}
                  </span>
                  <h2 className="font-serif text-2xl font-bold mt-3 mb-2">
                    {selectedMate.name}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {selectedMate.description}
                  </p>
                </div>

                {/* Move List */}
                <div className="card-premium p-5">
                  <h3 className="font-medium mb-3">Moves</h3>
                  <div className="grid grid-cols-[2rem,1fr,1fr] gap-x-2 gap-y-1 text-sm font-mono">
                    <span className="text-muted-foreground text-sm md:text-base font-semibold"></span>
                    <span className="text-sm md:text-base font-semibold text-foreground">White</span>
                    <span className="text-sm md:text-base font-semibold text-foreground">Black</span>
                    {Array.from({ length: Math.ceil(selectedMate.moves.length / 2) }).map((_, i) => {
                      const whiteIndex = i * 2;
                      const blackIndex = i * 2 + 1;
                      const whiteMove = selectedMate.moves[whiteIndex];
                      const blackMove = selectedMate.moves[blackIndex];

                      return (
                        <>
                          <span key={`num-${i}`} className="text-muted-foreground">{i + 1}.</span>

                          <button
                            key={`white-${i}`}
                            onClick={() => goToMove(whiteIndex)}
                            className={`text-left px-2 py-1 rounded ${
                              currentMoveIndex === whiteIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium">{whiteMove?.san || ''}</span>
                              {whiteMove?.evaluation && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getEvaluationColor(whiteMove.evaluation)}`}>
                                  {whiteMove.evaluation}
                                </span>
                              )}
                            </div>
                          </button>

                          <button
                            key={`black-${i}`}
                            onClick={() => blackMove && goToMove(blackIndex)}
                            className={`text-left px-2 py-1 rounded ${
                              currentMoveIndex === blackIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium">{blackMove?.san || ''}</span>
                              {blackMove?.evaluation && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getEvaluationColor(blackMove.evaluation)}`}>
                                  {blackMove.evaluation}
                                </span>
                              )}
                            </div>
                          </button>
                        </>
                      );
                    })}
                  </div>
                </div>

                {/* Current Move Comment */}
                {currentMoveIndex >= 0 && selectedMate.moves[currentMoveIndex]?.comment && (
                  <div className="card-premium p-4 bg-primary/5 border-primary/20">
                    <p className="text-sm">
                      💬 {selectedMate.moves[currentMoveIndex].comment}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default FamousMates;
