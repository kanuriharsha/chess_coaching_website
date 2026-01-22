import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Trophy, Star, AlertTriangle, ChevronLeft, ChevronRight, SkipBack, SkipForward, Lock, Plus, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useActivityTracker } from '@/hooks/useActivityTracker';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface BestGame {
  _id?: string;
  id?: string;
  title: string;
  players: string;
  description: string;
  category: 'brilliant' | 'best' | 'blunder';
  moves: string[];
  highlights: number[];
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

// Default best games (fallback)
const defaultBestGames: BestGame[] = [
  {
    id: 'immortal-game',
    title: 'The Immortal Game',
    players: 'Anderssen vs Kieseritzky, 1851',
    description: 'One of the most famous games in chess history, featuring stunning sacrifices.',
    category: 'brilliant',
    moves: ['e4', 'e5', 'f4', 'exf4', 'Bc4', 'Qh4+', 'Kf1', 'b5', 'Bxb5', 'Nf6', 'Nf3', 'Qh6'],
    highlights: [2, 4, 6],
  },
  {
    id: 'opera-game',
    title: 'The Opera Game',
    players: 'Morphy vs Duke/Count, 1858',
    description: 'A masterpiece of rapid development and attacking play.',
    category: 'best',
    moves: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6'],
    highlights: [3, 6, 10],
  },
  {
    id: 'deep-blue',
    title: 'Deep Blue Victory',
    players: 'Deep Blue vs Kasparov, 1997',
    description: 'Historic game where a computer defeated the world champion.',
    category: 'best',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7', 'Ng5', 'Ngf6', 'Bd3', 'e6'],
    highlights: [4, 8],
  },
];

const BestGames = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [bestGames, setBestGames] = useState<BestGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<BestGame | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [game, setGame] = useState(new Chess());
  const [contentAccess, setContentAccess] = useState<ContentAccess | null>(null);
  const [isContentLocked, setIsContentLocked] = useState(false);
  const { trackPageVisit, trackGameViewed } = useActivityTracker();

  const isAdmin = user?.role === 'admin';

  // Track page visit
  useEffect(() => {
    trackPageVisit('Best Games');
  }, []);

  useEffect(() => {
    loadBestGames();
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
        setIsContentLocked(!access.bestGamesAccess?.enabled);
      }
    } catch (error) {
      console.error('Load content access error:', error);
    }
  };

  useEffect(() => {
    loadBestGames();
  }, []);

  const loadBestGames = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/bestgames`);
      if (response.ok) {
        const data: BestGame[] = await response.json();
        const enabledGames = data.filter(g => g.isEnabled !== false);
        setBestGames(enabledGames);
      }
    } catch (error) {
      console.error('Load best games error:', error);
      // Keep default games on error
    }
  };

  // Reorder best games when contentAccess becomes available - ALWAYS sort for non-admin users
  useEffect(() => {
    if (!isAdmin && contentAccess?.bestGamesAccess?.enabled && bestGames.length > 0) {
      const hasGranularAccess = contentAccess.bestGamesAccess.allowedGames?.length > 0;
      
      if (hasGranularAccess) {
        // If there's a specific allowed list, put those first
        const allowed = new Set(contentAccess.bestGamesAccess.allowedGames.map(String));
        const reordered = [...bestGames].sort((a, b) => {
          const aKey = (a._id || a.id)?.toString() || '';
          const bKey = (b._id || b.id)?.toString() || '';
          const aAllowed = allowed.has(aKey) ? 0 : 1;
          const bAllowed = allowed.has(bKey) ? 0 : 1;
          return aAllowed - bAllowed; // allowed (0) come first, locked (1) come after
        });
        setBestGames(reordered);
      }
      // If allowedGames is empty, all games are unlocked, no need to reorder
    }
  }, [contentAccess, isAdmin]);

  const selectGame = (bestGame: BestGame) => {
    // Check if best games are globally locked
    if (!isAdmin && isContentLocked) {
      toast.error('Content Locked', {
        description: 'Best Games are locked. Contact your instructor to unlock.',
        icon: <Lock className="w-4 h-4" />,
      });
      return;
    }
    // Check if this specific game is allowed (granular access)
    if (!isAdmin && contentAccess?.bestGamesAccess?.allowedGames?.length) {
      const gameId = (bestGame._id || bestGame.id)?.toString() || '';
      const allowed = contentAccess.bestGamesAccess.allowedGames.map(String);
      if (!allowed.includes(gameId)) {
        toast.error('Content Locked', {
          description: 'This game is locked. Contact your instructor to unlock.',
          icon: <Lock className="w-4 h-4" />,
        });
        return;
      }
    }
    setSelectedGame(bestGame);
    setCurrentMoveIndex(-1);
    setGame(new Chess());
    trackGameViewed(bestGame.title, bestGame.category);
  };

  const goToMove = (index: number) => {
    if (!selectedGame) return;
    
    const newGame = new Chess();
    for (let i = 0; i <= index && i < selectedGame.moves.length; i++) {
      newGame.move(selectedGame.moves[i]);
    }
    setGame(newGame);
    setCurrentMoveIndex(index);
  };

  const nextMove = () => {
    if (!selectedGame || currentMoveIndex >= selectedGame.moves.length - 1) return;
    goToMove(currentMoveIndex + 1);
  };

  const prevMove = () => {
    if (currentMoveIndex < 0) return;
    if (currentMoveIndex === 0) {
      setGame(new Chess());
      setCurrentMoveIndex(-1);
    } else {
      goToMove(currentMoveIndex - 1);
    }
  };

  const goToStart = () => {
    setGame(new Chess());
    setCurrentMoveIndex(-1);
  };

  const goToEnd = () => {
    if (!selectedGame) return;
    goToMove(selectedGame.moves.length - 1);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'brilliant':
        return <Star className="w-5 h-5 text-brilliant" />;
      case 'best':
        return <Trophy className="w-5 h-5 text-success" />;
      case 'blunder':
        return <AlertTriangle className="w-5 h-5 text-warning" />;
      default:
        return null;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'brilliant':
        return 'bg-brilliant/20 text-brilliant';
      case 'best':
        return 'bg-success/20 text-success';
      case 'blunder':
        return 'bg-warning/20 text-warning';
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
                Best Games
              </h1>
              <p className="text-muted-foreground">
                Study legendary games and learn from the masters
              </p>
            </div>
            {isAdmin && !selectedGame && (
              <Button onClick={() => navigate('/best-games/create')}>
                <Plus className="w-4 h-4 mr-2" />
                Add New Best Game
              </Button>
            )}
          </div>
        </div>

        {!selectedGame ? (
          /* Game List */
          <div className="space-y-4">
            <div className="grid gap-4">
              {bestGames.map((bestGame) => {
                // Determine if this specific game is locked
                const gameId = (bestGame._id || bestGame.id)?.toString() || '';
                const hasGranularAccess = !isAdmin && contentAccess?.bestGamesAccess?.allowedGames?.length;
                const isGameLocked = hasGranularAccess 
                  ? !contentAccess.bestGamesAccess.allowedGames.map(String).includes(gameId)
                  : (!isAdmin && isContentLocked);
                
                return (
                <button
                  key={bestGame.id || bestGame._id}
                  onClick={() => selectGame(bestGame)}
                  className="card-premium p-5 text-left group hover:border-primary/50 relative"
                >
                  {/* Locked Badge - Top Right Corner */}
                  {isGameLocked && (
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 bg-destructive/90 text-destructive-foreground rounded-md text-xs font-medium shadow-sm">
                      <Lock className="w-3 h-3" />
                      Locked
                    </div>
                  )}
                  
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                      {getCategoryIcon(bestGame.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${getCategoryBadge(bestGame.category)}`}>
                          {bestGame.category}
                        </span>
                      </div>
                      <h3 className="font-serif text-xl font-semibold text-foreground mb-1">
                        {bestGame.title}
                      </h3>
                      <p className="text-sm text-primary font-medium mb-1">{bestGame.players}</p>
                      <p className="text-muted-foreground text-sm">{bestGame.description}</p>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/best-games/edit/${bestGame._id || bestGame.id}`);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </button>
              );
              })}
            </div>
          </div>
        ) : (
          /* Game Replay View */
          <div className="space-y-6">
            {/* Back Button */}
            <button
              onClick={() => setSelectedGame(null)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to games
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

              {/* Game Info */}
              <div className="space-y-4">
                <div className="card-premium p-5">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${getCategoryBadge(selectedGame.category)}`}>
                    {selectedGame.category}
                  </span>
                  <h2 className="font-serif text-2xl font-bold mt-3 mb-1">
                    {selectedGame.title}
                  </h2>
                  <p className="text-sm text-primary font-medium mb-2">
                    {selectedGame.players}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {selectedGame.description}
                  </p>
                </div>

                {/* Move List */}
                <div className="card-premium p-5">
                  <h3 className="font-medium mb-3">Moves</h3>
                  <div className="grid grid-cols-[2rem,1fr,1fr] gap-x-2 gap-y-1 text-sm font-mono">
                    {Array.from({ length: Math.ceil(selectedGame.moves.length / 2) }).map((_, i) => {
                      const whiteIndex = i * 2;
                      const blackIndex = i * 2 + 1;
                      return (
                        <>
                          <span key={`num-${i}`} className="text-muted-foreground">{i + 1}.</span>
                          <button
                            key={`white-${i}`}
                            onClick={() => goToMove(whiteIndex)}
                            className={`text-left px-2 py-1 rounded ${
                              currentMoveIndex === whiteIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                            } ${selectedGame.highlights.includes(whiteIndex) ? 'font-bold text-brilliant' : ''}`}
                          >
                            {selectedGame.moves[whiteIndex]}
                            {selectedGame.highlights.includes(whiteIndex) && ' ★'}
                          </button>
                          <button
                            key={`black-${i}`}
                            onClick={() => selectedGame.moves[blackIndex] && goToMove(blackIndex)}
                            className={`text-left px-2 py-1 rounded ${
                              currentMoveIndex === blackIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                            } ${selectedGame.highlights.includes(blackIndex) ? 'font-bold text-brilliant' : ''}`}
                          >
                            {selectedGame.moves[blackIndex] || ''}
                            {selectedGame.highlights.includes(blackIndex) && ' ★'}
                          </button>
                        </>
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
};

export default BestGames;
