import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward, BookOpen, Lock, Plus, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useChessSound } from '@/hooks/useChessSound';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Opening {
  _id?: string;
  id?: string;
  name: string;
  description: string;
  moves: { san: string; comment?: string; evaluation?: 'best' | 'brilliant' | 'good' | 'inaccuracy' }[];
  category: string;
  startFen?: string; // Optional custom starting position
  isEnabled?: boolean;
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
  bestGamesAccess: {
    enabled: boolean;
    allowedGames: string[];
  };
}

// Default openings (fallback)
const defaultOpenings: Opening[] = [
  {
    id: 'italian-game',
    name: 'Italian Game',
    description: 'One of the oldest openings, focusing on rapid development and center control.',
    category: 'Open Games',
    moves: [
      { san: 'e4', comment: 'Control the center with the king pawn', evaluation: 'best' },
      { san: 'e5', comment: 'Black mirrors the move' },
      { san: 'Nf3', comment: 'Develop knight and attack e5', evaluation: 'best' },
      { san: 'Nc6', comment: 'Defend the pawn' },
      { san: 'Bc4', comment: 'The Italian Game! Targets f7', evaluation: 'brilliant' },
      { san: 'Bc5', comment: 'The Giuoco Piano response' },
    ],
  },
  {
    id: 'sicilian-defense',
    name: 'Sicilian Defense',
    description: 'The most popular response to 1.e4, fighting for the center asymmetrically.',
    category: 'Semi-Open Games',
    moves: [
      { san: 'e4', comment: 'The king pawn opening' },
      { san: 'c5', comment: 'The Sicilian! Fights for d4', evaluation: 'best' },
      { san: 'Nf3', comment: 'Most common continuation', evaluation: 'best' },
      { san: 'd6', comment: 'Preparing for development' },
      { san: 'd4', comment: 'Opening the center', evaluation: 'best' },
      { san: 'cxd4', comment: 'Trading for central control' },
    ],
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    description: 'A classic opening that offers a pawn for central control.',
    category: 'Closed Games',
    moves: [
      { san: 'd4', comment: 'The queen pawn opening', evaluation: 'best' },
      { san: 'd5', comment: 'Symmetrical response' },
      { san: 'c4', comment: "The Queen's Gambit!", evaluation: 'brilliant' },
      { san: 'e6', comment: 'Declining the gambit', evaluation: 'good' },
      { san: 'Nc3', comment: 'Develop and support center', evaluation: 'best' },
      { san: 'Nf6', comment: 'Natural development' },
    ],
  },
];

const Openings = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [game, setGame] = useState(new Chess());
  const [contentAccess, setContentAccess] = useState<ContentAccess | null>(null);
  const [isContentLocked, setIsContentLocked] = useState(false);
  const { trackPageVisit, trackOpeningViewed } = useActivityTracker();
  const { playSound } = useChessSound();
  const sortedRef = useRef(false); // Track if we've sorted the data

  const isAdmin = user?.role === 'admin';

  // Track page visit
  useEffect(() => {
    trackPageVisit('Openings');
  }, []);

  useEffect(() => {
    loadOpenings();
    if (!isAdmin) {
      loadContentAccess();
    }
  }, [isAdmin]);

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
        setIsContentLocked(!access.openingAccess?.enabled);
      }
    } catch (error) {
      console.error('Load content access error:', error);
    }
  };

  const loadOpenings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/openings`);
      if (response.ok) {
        const data: Opening[] = await response.json();
        const enabledOpenings = data.filter(o => o.isEnabled !== false);
        setOpenings(enabledOpenings);
      }
    } catch (error) {
      console.error('Load openings error:', error);
      // Keep default openings on error
    }
  };

  // Reorder openings when contentAccess becomes available - ALWAYS sort for non-admin users
  useEffect(() => {
    if (!isAdmin && contentAccess?.openingAccess?.enabled && openings.length > 0) {
      const hasGranularAccess = contentAccess.openingAccess.allowedOpenings?.length > 0;
      
      if (hasGranularAccess && !sortedRef.current) {
        // If there's a specific allowed list, put unlocked first, locked after
        const allowed = new Set(contentAccess.openingAccess.allowedOpenings.map(String));
        const reordered = [...openings].sort((a, b) => {
          const aKey = (a._id || a.id)?.toString() || '';
          const bKey = (b._id || b.id)?.toString() || '';
          const aAllowed = allowed.has(aKey) ? 0 : 1; // unlocked = 0
          const bAllowed = allowed.has(bKey) ? 0 : 1; // locked = 1
          return aAllowed - bAllowed; // 0 - 1 = -1 (unlocked first), 1 - 0 = 1 (locked after)
        });
        setOpenings(reordered);
        sortedRef.current = true;
      }
      // If allowedOpenings is empty, all openings are unlocked, no need to reorder
    }
  }, [contentAccess, isAdmin, openings.length]);

  const selectOpening = (opening: Opening) => {
    // Check if openings are globally locked
    if (!isAdmin && isContentLocked) {
      toast.error('Content Locked', {
        description: 'Openings are locked. Contact your instructor to unlock.',
        icon: <Lock className="w-4 h-4" />,
      });
      return;
    }
    // Check if this specific opening is allowed (granular access)
    if (!isAdmin && contentAccess?.openingAccess?.allowedOpenings?.length) {
      const openingId = (opening._id || opening.id)?.toString() || '';
      const allowed = contentAccess.openingAccess.allowedOpenings.map(String);
      if (!allowed.includes(openingId)) {
        toast.error('Content Locked', {
          description: 'This opening is locked. Contact your instructor to unlock.',
          icon: <Lock className="w-4 h-4" />,
        });
        return;
      }
    }
    setSelectedOpening(opening);
    trackOpeningViewed(opening.name, opening.category);
    setCurrentMoveIndex(-1);
    setGame(new Chess(opening.startFen || undefined));
  };

  const goToMove = (index: number) => {
    if (!selectedOpening) return;
    
    const newGame = new Chess(selectedOpening.startFen || undefined);
    for (let i = 0; i <= index && i < selectedOpening.moves.length; i++) {
      newGame.move(selectedOpening.moves[i].san);
    }
    setGame(newGame);
    setCurrentMoveIndex(index);
  };

  const nextMove = () => {
    if (!selectedOpening || currentMoveIndex >= selectedOpening.moves.length - 1) return;
    playSound('move');
    goToMove(currentMoveIndex + 1);
  };

  const prevMove = () => {
    if (currentMoveIndex < 0) return;
    if (currentMoveIndex === 0) {
      if (selectedOpening) {
        setGame(new Chess(selectedOpening.startFen || undefined));
      }
      setCurrentMoveIndex(-1);
    } else {
      goToMove(currentMoveIndex - 1);
    }
  };

  const goToStart = () => {
    if (selectedOpening) {
      setGame(new Chess(selectedOpening.startFen || undefined));
    }
    setCurrentMoveIndex(-1);
  };

  const goToEnd = () => {
    if (!selectedOpening) return;
    goToMove(selectedOpening.moves.length - 1);
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
                Openings
              </h1>
              <p className="text-muted-foreground">
                Master essential opening principles and theory
              </p>
            </div>
            {isAdmin && !selectedOpening && (
              <Button onClick={() => navigate('/openings/create')}>
                <Plus className="w-4 h-4 mr-2" />
                Add New Opening
              </Button>
            )}
          </div>
        </div>

        {!selectedOpening ? (
          /* Opening List */
          <div className="space-y-4">
            <div className="grid gap-4">
              {openings.map((opening) => {
                // Determine if this specific opening is locked
                const openingId = (opening._id || opening.id)?.toString() || '';
                const hasGranularAccess = !isAdmin && contentAccess?.openingAccess?.allowedOpenings?.length;
                const isOpeningLocked = hasGranularAccess 
                  ? !contentAccess.openingAccess.allowedOpenings.map(String).includes(openingId)
                  : (!isAdmin && isContentLocked);
                
                return (
                <button
                  key={opening.id || opening._id}
                  onClick={() => selectOpening(opening)}
                  className="card-premium p-5 text-left group hover:border-primary/50 relative"
                >
                  {/* Locked Badge - Top Right Corner */}
                  {isOpeningLocked && (
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 bg-destructive/90 text-destructive-foreground rounded-md text-xs font-medium shadow-sm">
                      <Lock className="w-3 h-3" />
                      Locked
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                        {opening.category}
                      </span>
                      <h3 className="font-serif text-xl font-semibold text-foreground mt-2 mb-1">
                        {opening.name}
                      </h3>
                      <p className="text-muted-foreground text-sm">{opening.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/openings/edit/${opening._id || opening.id}`);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      <BookOpen className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </button>
              );
              })}
            </div>
          </div>
        ) : (
          /* Opening Study View */
          <div className="space-y-6">
            {/* Back Button */}
            <button
              onClick={() => setSelectedOpening(null)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to openings
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

              {/* Opening Info */}
              <div className="space-y-4">
                <div className="card-premium p-5">
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                    {selectedOpening.category}
                  </span>
                  <h2 className="font-serif text-2xl font-bold mt-3 mb-2">
                    {selectedOpening.name}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {selectedOpening.description}
                  </p>
                </div>

                {/* Move List */}
                <div className="card-premium p-5">
                  <h3 className="font-medium mb-3">Moves</h3>
                  <div className="grid grid-cols-[2rem,1fr,1fr] gap-x-2 gap-y-1 text-sm font-mono">
                    <span className="text-muted-foreground text-sm md:text-base font-semibold"></span>
                    <span className="text-sm md:text-base font-semibold text-foreground">White</span>
                    <span className="text-sm md:text-base font-semibold text-foreground">Black</span>
                    {Array.from({ length: Math.ceil(selectedOpening.moves.length / 2) }).map((_, i) => {
                      const whiteIndex = i * 2;
                      const blackIndex = i * 2 + 1;
                      const whiteMove = selectedOpening.moves[whiteIndex];
                      const blackMove = selectedOpening.moves[blackIndex];

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
                {currentMoveIndex >= 0 && selectedOpening.moves[currentMoveIndex]?.comment && (
                  <div className="card-premium p-4 bg-primary/5 border-primary/20">
                    <p className="text-sm">
                      💬 {selectedOpening.moves[currentMoveIndex].comment}
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

export default Openings;
