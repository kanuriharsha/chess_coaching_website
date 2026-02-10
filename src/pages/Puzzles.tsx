import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import PromotionDialog from '@/components/PromotionDialog';
import { isPromotionMove } from '@/lib/chess';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, CheckCircle, Puzzle as PuzzleIcon, ArrowRight, RotateCcw, Lightbulb, ShieldOff, Plus, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useChessSound } from '@/hooks/useChessSound';
import { useActivityTracker } from '@/hooks/useActivityTracker';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface PuzzleCategory {
  id: string;
  name: string;
  description: string;
  count: number;
  unlocked: boolean;
  accessLimit: number; // 0 = unlimited, >0 = limited
  icon: string;
}

interface PuzzleData {
  _id: string;
  name: string;
  category: string;
  description: string;
  fen: string;
  solution: string[];
  hint: string;
  difficulty: string;
  icon: string;
  isEnabled: boolean;
  isLocked?: boolean; // For user access control
  originalIndex?: number; // Original 1-based index in the category (for tracking)
  preloadedMove?: string; // Optional move to execute automatically before student plays
}

interface ContentAccess {
  puzzleAccess: {
    [category: string]: {
      enabled: boolean;
      limit: number; // 0 = unlimited
      rangeStart?: number; // 1-based inclusive
      rangeEnd?: number; // 1-based inclusive
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

// Default categories
const defaultCategories: PuzzleCategory[] = [
  { id: 'mate-in-1', name: 'Mate in 1', description: 'Find the winning move', count: 0, unlocked: true, accessLimit: 0, icon: '♔' },
  { id: 'mate-in-2', name: 'Mate in 2', description: 'Two moves to victory', count: 0, unlocked: true, accessLimit: 0, icon: '♕' },
  { id: 'mate-in-3', name: 'Mate in 3', description: 'Three move combinations', count: 0, unlocked: true, accessLimit: 0, icon: '♖' },
  { id: 'pins', name: 'Pins', description: 'Master the pin tactic', count: 0, unlocked: true, accessLimit: 0, icon: '♗' },
  { id: 'forks', name: 'Forks', description: 'Double attack patterns', count: 0, unlocked: true, accessLimit: 0, icon: '♘' },
  { id: 'traps', name: 'Traps', description: 'Lure your opponent', count: 0, unlocked: true, accessLimit: 0, icon: '♙' },
];

const Puzzles = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { trackPageVisit, trackPuzzleAttempt } = useActivityTracker();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [puzzleCategories, setPuzzleCategories] = useState<PuzzleCategory[]>(defaultCategories);
  const [categoryPuzzles, setCategoryPuzzles] = useState<PuzzleData[]>([]);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [game, setGame] = useState(new Chess());
  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [contentAccess, setContentAccess] = useState<ContentAccess | null>(null);
  const { playSound } = useChessSound();
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0); // Track which move in the solution we're on
  const [preloadedMoveExecuted, setPreloadedMoveExecuted] = useState(false); // Track if preloaded move has been executed
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white'); // Fixed orientation per puzzle

  const isAdmin = user?.role === 'admin';
  const currentPuzzle = categoryPuzzles[currentPuzzleIndex];

  // Track page visit
  useEffect(() => {
    trackPageVisit('Puzzles');
  }, []);

  // Track category change
  useEffect(() => {
    if (selectedCategory) {
      const categoryName = puzzleCategories.find(c => c.id === selectedCategory)?.name || selectedCategory;
      trackPageVisit(`Puzzles - ${categoryName}`);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadPuzzles();
    if (!isAdmin) {
      loadContentAccess();
    }
  }, [isAdmin]);

  // Execute preloaded move for current puzzle
  const executePreloadedMove = useCallback(() => {
    if (!currentPuzzle || !currentPuzzle.preloadedMove || !currentPuzzle.preloadedMove.trim()) {
      return;
    }

    console.log('Puzzle has preloaded move:', currentPuzzle.preloadedMove);
    const timer = setTimeout(() => {
      // The preloaded move is made by the OPPOSITE color of who's solving
      // If puzzle is "White to move", preloaded move is Black's move
      // So we need to flip the turn to execute it
      const fenParts = currentPuzzle.fen.split(' ');
      const currentTurn = fenParts[1]; // 'w' or 'b'
      const preloadedTurn = currentTurn === 'w' ? 'b' : 'w';
      fenParts[1] = preloadedTurn;
      const flippedFen = fenParts.join(' ');
      
      const gameCopy = new Chess(flippedFen);
      try {
        const move = gameCopy.move(currentPuzzle.preloadedMove!.trim());
        if (move) {
          console.log('Preloaded move executed successfully:', move.san);
          setGame(gameCopy);
          setLastMove({ from: move.from as Square, to: move.to as Square });
          setCurrentMoveIndex(0); // Keep at 0 - solution array doesn't include preloaded move
          setPreloadedMoveExecuted(true);
          playSound('move');
          toast.info(`Opponent played: ${move.san}`, {
            description: 'Now it\'s your turn!',
          });
        } else {
          console.error('Invalid preloaded move:', currentPuzzle.preloadedMove);
        }
      } catch (error) {
        console.error('Error executing preloaded move:', error);
      }
    }, 500); // 0.5 second delay
    
    return timer;
  }, [currentPuzzle, playSound]);

  // Reset puzzle state whenever current puzzle changes
  useEffect(() => {
    if (currentPuzzle) {
      const initialGame = new Chess(currentPuzzle.fen);
      setGame(initialGame);
      setSolved(false);
      setAttempts(0);
      setLastMove(null);
      setShowHint(false);
      setCurrentMoveIndex(0); // Critical: Reset move index for new puzzle
      setPreloadedMoveExecuted(false); // Reset preloaded move flag
      
      // Set board orientation based on initial position - this stays fixed for entire puzzle
      // Student plays from the perspective of the side that needs to move initially
      setBoardOrientation(initialGame.turn() === 'w' ? 'white' : 'black');
      
      // Execute preloaded move if specified
      const timer = executePreloadedMove();
      
      return () => {
        if (timer) {
          clearTimeout(timer);
        }
      };
    }
  }, [currentPuzzle?._id, currentPuzzleIndex, executePreloadedMove]);

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
      }
    } catch (error) {
      console.error('Load content access error:', error);
    }
  };

  const loadPuzzles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles`);
      if (response.ok) {
        const puzzles: PuzzleData[] = await response.json();
        
        // Count puzzles per category
        const categoryCounts: { [key: string]: number } = {};
        puzzles.forEach(p => {
          if (p.isEnabled) {
            categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
          }
        });

        // Update categories with counts (access will be applied in render)
        setPuzzleCategories(defaultCategories.map(cat => ({
          ...cat,
          count: categoryCounts[cat.id] || 0,
          unlocked: (categoryCounts[cat.id] || 0) > 0
        })));
      }
    } catch (error) {
      console.error('Load puzzles error:', error);
    }
  };

  // Check if user has access to a category
  const hasAccessToCategory = (categoryId: string): boolean => {
    if (isAdmin) return true;
    if (!contentAccess) return false;
    return contentAccess.puzzleAccess?.[categoryId]?.enabled || false;
  };

  // Get access limit for category
  const getAccessLimit = (categoryId: string): number => {
    if (isAdmin) return 0;
    if (!contentAccess) return 0;
    return contentAccess.puzzleAccess?.[categoryId]?.limit || 0;
  };

  const loadCategoryPuzzles = async (category: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles/category/${category}`);
      if (response.ok) {
        let puzzles: PuzzleData[] = await response.json();
        
        // Add original index (1-based) before any filtering/sorting
        puzzles = puzzles.map((puzzle, index) => ({
          ...puzzle,
          originalIndex: index + 1 // Store 1-based original position
        }));
        
        // Apply access limit or range for non-admin users
        const limit = getAccessLimit(category);
        const rangeCfg = contentAccess?.puzzleAccess?.[category];
        if (!isAdmin) {
          if (rangeCfg && rangeCfg.rangeStart && rangeCfg.rangeEnd && rangeCfg.rangeEnd >= rangeCfg.rangeStart) {
            const start = Math.max(1, rangeCfg.rangeStart) - 1; // convert to 0-based index
            const end = Math.min(puzzles.length, rangeCfg.rangeEnd) - 1;
            puzzles = puzzles.map((puzzle, index) => ({
              ...puzzle,
              isLocked: index < start || index > end
            }));
          } else if (limit > 0) {
            puzzles = puzzles.map((puzzle, index) => ({
              ...puzzle,
              isLocked: index >= limit
            }));
          }
        }

        // Ensure unlocked puzzles appear first for students
        if (!isAdmin) {
          puzzles = puzzles.sort((a, b) => {
            const aLocked = !!a.isLocked;
            const bLocked = !!b.isLocked;
            if (aLocked === bLocked) return 0;
            return aLocked ? 1 : -1; // unlocked (false) first
          });
        }
        
        setCategoryPuzzles(puzzles);
        if (puzzles.length > 0 && !puzzles[0].isLocked) {
          setGame(new Chess(puzzles[0].fen));
        }
      }
    } catch (error) {
      console.error('Load category puzzles error:', error);
    }
  };

  /**
   * Puzzle Move Handler - Strict Sequential Validation
   * 
   * Implementation: The user plays their side's move, and the engine automatically plays the opponent's reply.
   * - User must play pre-recorded solution moves in exact sequence
   * - Wrong moves are rejected immediately with feedback
   * - After each correct user move, the opponent's next move is auto-played
   * - Applies to all puzzle categories: Mate in 1, Mate in 2, Mate in 3, Pins, Forks, Traps
   */
  const handleMove = useCallback(
    (from: Square, to: Square): boolean => {
      if (solved || !currentPuzzle) return false;

      const gameCopy = new Chess(game.fen());
      
      // If move requires promotion, ask user to choose piece
      const moveVerbose = gameCopy.moves({ square: from, verbose: true }).find(m => m.to === to);
      if (moveVerbose && moveVerbose.promotion) {
        setPendingPromotion({ from, to, gameCopy });
        setShowPromotion(true);
        return false;
      }

      // Try to make the move
      const move = gameCopy.move({ from, to });
      if (!move) return false; // Invalid move

      // ALWAYS PLAY THE MOVE FIRST - Update the board visually
      setGame(gameCopy);
      setLastMove({ from, to });

      // Increment attempts counter
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      // Get category id for tracking (use ID not display name for backend matching)
      const categoryId = selectedCategory || '';

      // Check if this move matches the expected move in the solution
      const expectedMove = currentPuzzle.solution[currentMoveIndex];
      // Trim whitespace and make case-insensitive comparison for robust validation
      const expectedMoveTrimmed = expectedMove.trim().toLowerCase();
      const moveSanLower = move.san.toLowerCase();
      const fromTo = move.from + move.to;
      const moveMatches = 
        moveSanLower === expectedMoveTrimmed ||
        to.toLowerCase() === expectedMoveTrimmed ||
        fromTo.toLowerCase() === expectedMoveTrimmed;

      if (!moveMatches) {
        // Wrong move - show error and undo only this move
        playSound('illegal');
        toast.error('Wrong move, try again', {
          description: 'Think carefully about the correct move.',
        });
        
        // Track failed attempt - use originalIndex for correct puzzle number
        trackPuzzleAttempt(
          currentPuzzle._id,
          currentPuzzle.name,
          categoryId,
          'failed',
          newAttempts,
          currentPuzzle.originalIndex || currentPuzzleIndex + 1
        );
        
        // Undo only this wrong move after a brief delay to show it
        setTimeout(() => {
          setGame(new Chess(game.fen())); // Revert to previous position
          setLastMove(null);
        }, 300);
        
        return true; // Move was played, then undone
      }

      // Correct move!
      setCurrentMoveIndex(currentMoveIndex + 1);

      // Check if puzzle is completely solved
      if (currentMoveIndex + 1 >= currentPuzzle.solution.length) {
        // Puzzle solved!
        setSolved(true);
        playSound('checkmate');
        toast.success('Checkmate! Brilliant move! ♔', {
          description: 'You solved the puzzle!',
        });
        
        trackPuzzleAttempt(
          currentPuzzle._id,
          currentPuzzle.name,
          categoryId,
          'passed',
          newAttempts,
          currentPuzzle.originalIndex || currentPuzzleIndex + 1
        );
      } else {
        // There are more moves - automatically play the opponent's next move
        playSound('move');
        
        setTimeout(() => {
          const nextMove = currentPuzzle.solution[currentMoveIndex + 1];
          if (nextMove) {
            const updatedGame = new Chess(gameCopy.fen());
            try {
              // Try to play the opponent's move
              const opponentMove = updatedGame.move(nextMove);
              if (opponentMove) {
                setGame(updatedGame);
                setLastMove({ from: opponentMove.from as Square, to: opponentMove.to as Square });
                setCurrentMoveIndex(currentMoveIndex + 2); // Move past both user and opponent move
                playSound('move');
                
                // Check if that was the last move (puzzle solved after opponent's reply)
                if (currentMoveIndex + 2 >= currentPuzzle.solution.length) {
                  setSolved(true);
                  playSound('checkmate');
                  toast.success('Checkmate! Brilliant move! ♔', {
                    description: 'You solved the puzzle!',
                  });
                  
                  trackPuzzleAttempt(
                    currentPuzzle._id,
                    currentPuzzle.name,
                    categoryId,
                    'passed',
                    newAttempts,
                    currentPuzzle.originalIndex || currentPuzzleIndex + 1
                  );
                }
              }
            } catch (err) {
              console.error('Error playing opponent move:', err);
            }
          }
        }, 500); // Small delay to show the user's move first
      }

      return true;
    },
    [game, solved, playSound, currentPuzzle, attempts, selectedCategory, puzzleCategories, trackPuzzleAttempt, currentMoveIndex]
  );

  // Promotion modal state for puzzles
  const [showPromotion, setShowPromotion] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<null | { from: Square; to: Square; gameCopy: Chess }>(null);

  const handlePromotionSelect = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion || !currentPuzzle) return;
    const { from, to, gameCopy } = pendingPromotion;
    
    try {
      const mv = gameCopy.move({ from, to, promotion: piece });
      if (!mv) {
        toast.error('Invalid promotion move');
        setPendingPromotion(null);
        setShowPromotion(false);
        return;
      }

      // ALWAYS PLAY THE MOVE FIRST - Update the board visually
      setGame(gameCopy);
      setLastMove({ from, to });
      setPendingPromotion(null);
      setShowPromotion(false);

      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      const categoryId = selectedCategory || '';

      // Check if this move matches the expected move in the solution
      const expectedMove = currentPuzzle.solution[currentMoveIndex];
      // Trim whitespace and make case-insensitive comparison for robust validation
      const expectedMoveTrimmed = expectedMove.trim().toLowerCase();
      const moveSanLower = mv.san.toLowerCase();
      const fromTo = mv.from + mv.to;
      const moveMatches = 
        moveSanLower === expectedMoveTrimmed ||
        to.toLowerCase() === expectedMoveTrimmed ||
        fromTo.toLowerCase() === expectedMoveTrimmed;

      if (!moveMatches) {
        // Wrong move - show error and undo only this move
        playSound('illegal');
        toast.error('Wrong move, try again');
        trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'failed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
        
        // Undo only this wrong move after a brief delay to show it
        setTimeout(() => {
          setGame(new Chess(game.fen())); // Revert to previous position
          setLastMove(null);
        }, 300);
        
        return;
      }

      // Correct move!
      setCurrentMoveIndex(currentMoveIndex + 1);

      // Check if puzzle is solved
      if (currentMoveIndex + 1 >= currentPuzzle.solution.length) {
        setSolved(true);
        playSound('checkmate');
        toast.success('Checkmate! Brilliant move! ♔');
        trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
      } else {
        // Auto-play opponent's next move
        playSound('move');
        
        setTimeout(() => {
          const nextMove = currentPuzzle.solution[currentMoveIndex + 1];
          if (nextMove) {
            const updatedGame = new Chess(gameCopy.fen());
            try {
              const opponentMove = updatedGame.move(nextMove);
              if (opponentMove) {
                setGame(updatedGame);
                setLastMove({ from: opponentMove.from as Square, to: opponentMove.to as Square });
                setCurrentMoveIndex(currentMoveIndex + 2);
                playSound('move');
                
                if (currentMoveIndex + 2 >= currentPuzzle.solution.length) {
                  setSolved(true);
                  playSound('checkmate');
                  toast.success('Checkmate! Brilliant move! ♔');
                  trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
                }
              }
            } catch (err) {
              console.error('Error playing opponent move:', err);
            }
          }
        }, 500);
      }
    } catch (err) {
      toast.error('Invalid promotion move');
    }
    
    setPendingPromotion(null);
    setShowPromotion(false);
  };

  const resetPuzzle = () => {
    if (currentPuzzle) {
      setGame(new Chess(currentPuzzle.fen));
    }
    setSolved(false);
    setAttempts(0);
    setLastMove(null);
    setShowHint(false);
    setCurrentMoveIndex(0); // Reset move index
    setPreloadedMoveExecuted(false); // Reset preloaded move flag
    
    // Execute preloaded move again on reattempt
    executePreloadedMove();
  };

  const nextPuzzle = () => {
    if (currentPuzzleIndex < categoryPuzzles.length - 1) {
      setCurrentPuzzleIndex(prev => prev + 1);
      const nextP = categoryPuzzles[currentPuzzleIndex + 1];
      setGame(new Chess(nextP.fen));
      setSolved(false);
      setAttempts(0);
      setLastMove(null);
      setShowHint(false);
      setCurrentMoveIndex(0); // Reset move index for new puzzle
    } else {
      toast.info('You completed all puzzles in this category!');
    }
  };

  const handleCategoryClick = async (category: PuzzleCategory) => {
    // Check access for non-admin users
    if (!isAdmin && !hasAccessToCategory(category.id)) {
      toast.error('Content Locked', {
        description: 'This category is locked. Contact your instructor to unlock.',
        icon: <Lock className="w-4 h-4" />,
      });
      return;
    }

    if (category.count === 0 && !isAdmin) {
      toast.info('No puzzles available in this category yet', {
        icon: <Lock className="w-4 h-4" />,
      });
      return;
    }
    setSelectedCategory(category.id);
    setCurrentPuzzleIndex(0);
    await loadCategoryPuzzles(category.id);
    resetPuzzle();
  };

  const handlePuzzleSelect = (index: number) => {
    const puzzle = categoryPuzzles[index];
    if (puzzle.isLocked) {
      toast.error('Puzzle Locked', {
        description: 'This puzzle is locked. Contact your instructor to unlock more puzzles.',
        icon: <Lock className="w-4 h-4" />,
      });
      return;
    }
    setCurrentPuzzleIndex(index);
    setGame(new Chess(puzzle.fen));
    setSolved(false);
    setAttempts(0);
    setLastMove(null);
    setShowHint(false);
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-serif text-xl md:text-2xl font-bold text-foreground">
              Puzzles
            </h1>
            <p className="text-xs text-muted-foreground hidden md:block">
              Sharpen your tactics with carefully selected puzzles
            </p>
          </div>
          {isAdmin && !selectedCategory && (
            <Button size="sm" onClick={() => navigate('/puzzle-manager')}>
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>
          )}
        </div>

        {!selectedCategory ? (
          /* Category Grid */
          <div className="pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {puzzleCategories.map((category) => {
              const isAccessLocked = !isAdmin && !hasAccessToCategory(category.id);
              const isEmptyLocked = category.count === 0 && !isAdmin;
              const isLocked = isAccessLocked || isEmptyLocked;
              const accessLimit = getAccessLimit(category.id);
              
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryClick(category)}
                  className="card-premium p-5 text-left group relative"
                >
                  {/* Locked Badge - Top Right Corner */}
                  {isAccessLocked && (
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 bg-destructive/90 text-destructive-foreground rounded-md text-xs font-medium shadow-sm">
                      <Lock className="w-3 h-3" />
                      Locked
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{category.icon}</span>
                    {isLocked ? (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    )}
                  </div>
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
                    {category.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {category.description}
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <PuzzleIcon className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">{category.count} puzzles</span>
                  </div>
                  {/* Show access info */}
                  {!isAdmin && hasAccessToCategory(category.id) && (
                    <div className="mt-2">
                      {(() => {
                        const accessCfg = contentAccess?.puzzleAccess?.[category.id];
                        if (accessCfg?.rangeStart && accessCfg?.rangeEnd) {
                          return (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                              <ShieldOff className="w-3 h-3" />
                              Puzzles {accessCfg.rangeStart}-{accessCfg.rangeEnd}
                            </div>
                          );
                        } else if (accessCfg?.limit === 0) {
                          return (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/20 text-success rounded-full text-xs">
                              ✓ Full access
                            </div>
                          );
                        } else if (accessCfg?.limit && accessCfg.limit > 0) {
                          return (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning/20 text-warning-foreground rounded-full text-xs">
                              <ShieldOff className="w-3 h-3" />
                              First {accessCfg.limit} unlocked
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                </button>
              );
            })}
            </div>
          </div>
        ) : categoryPuzzles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No puzzles in this category yet.</p>
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-primary hover:underline"
            >
              ← Back to categories
            </button>
          </div>
        ) : (
          /* Puzzle View - Normal Scrolling */
          <div className="space-y-3">
            {/* Top Bar - Back & Puzzle Selector */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                ← Back
              </button>
              
              {/* Puzzle Selector - Horizontal Scroll */}
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-2 pb-1">
                  {categoryPuzzles.map((puzzle, index) => (
                    <button
                      key={puzzle._id}
                      onClick={() => handlePuzzleSelect(index)}
                      className={`
                        px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative whitespace-nowrap flex-shrink-0
                        ${currentPuzzleIndex === index 
                          ? 'bg-primary text-primary-foreground' 
                          : puzzle.isLocked
                            ? 'bg-secondary/50 text-secondary-foreground'
                            : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                        }
                      `}
                    >
                      {puzzle.isLocked && <Lock className="w-2.5 h-2.5 inline mr-1" />}
                      #{index + 1}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Progress Indicator - Compact */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                <span className="font-medium">
                  {currentPuzzleIndex + (solved ? 1 : 0)}/{categoryPuzzles.length}
                </span>
              </div>
            </div>

            {/* Main Content Area - 2 Column on Desktop, Stack on Mobile */}
            <div className="grid md:grid-cols-[1fr,300px] gap-4">
              {/* Board Area */}
              <div className="relative flex items-center justify-center">
                {currentPuzzle?.isLocked && (
                  <div className="absolute inset-0 bg-background/90 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                    <Lock className="w-10 h-10 text-muted-foreground mb-2" />
                    <span className="text-sm font-medium text-foreground">Puzzle Locked</span>
                  </div>
                )}
                <div className="w-full max-w-2xl aspect-square">
                  <ChessBoard
                    game={game}
                    onMove={handleMove}
                    orientation={boardOrientation}
                    interactive={!solved && !currentPuzzle?.isLocked}
                    lastMove={lastMove}
                  />
                  <PromotionDialog 
                    open={showPromotion} 
                    onOpenChange={setShowPromotion} 
                    onSelect={handlePromotionSelect}
                    color={(pendingPromotion && pendingPromotion.gameCopy.get(pendingPromotion.from)?.color) as 'w' | 'b' | undefined}
                  />
                </div>
              </div>

              {/* Side Panel - Controls */}
              <div className="flex flex-col gap-3">
                {/* Preloaded Move Info - Show if puzzle has preloaded move and it hasn't been executed yet */}
                {currentPuzzle?.preloadedMove && !preloadedMoveExecuted && (
                  <div className="card-premium p-3 bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center animate-pulse">
                        <span className="text-white text-xs font-bold">⏱</span>
                      </div>
                      <div className="text-xs">
                        <p className="font-semibold text-blue-900">Opponent is thinking...</p>
                        <p className="text-blue-700">Watch the position carefully</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Status Card */}
                <div className="card-premium p-3">
                  <div className="flex items-center gap-2 mb-3">
                    {solved ? (
                      <>
                        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                          <CheckCircle className="w-4 h-4 text-success" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-success">Solved!</p>
                          <p className="text-xs text-muted-foreground">
                            {attempts} {attempts === 1 ? 'attempt' : 'attempts'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <PuzzleIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {game.turn() === 'w' ? 'White' : 'Black'} to move
                          </p>
                          <p className="text-xs text-muted-foreground">Find the best move</p>
                        </div>
                      </>
                    )}
                    {/* Admin quick-edit button for current puzzle */}
                    {isAdmin && currentPuzzle && (
                      <div className="ml-auto">
                        <Button size="sm" variant="ghost" onClick={() => navigate('/puzzle-manager', { state: { editPuzzleId: currentPuzzle._id } })}>
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2">
                    {!solved && (
                      <button
                        onClick={() => setShowHint(true)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-warning/10 border border-warning/30 text-warning-foreground hover:bg-warning/20 transition-colors text-sm font-medium"
                      >
                        <Lightbulb className="w-4 h-4" />
                        Hint
                      </button>
                    )}
                    
                    {/* Hint Message - Between Hint and Reset */}
                    {showHint && !solved && currentPuzzle && (
                      <div className="p-2 bg-warning/10 border border-warning/30 rounded-lg">
                        <div className="flex gap-2 text-xs text-warning-foreground">
                          <span>💡</span>
                          <p>{currentPuzzle.hint || 'Look carefully at the position'}</p>
                        </div>

                        {/* Admin Edit Button */}
                        {isAdmin && currentPuzzle && (
                          <div className="mt-3">
                            <Button size="sm" variant="outline" onClick={() => navigate('/puzzle-manager', { state: { editPuzzleId: currentPuzzle._id } })}>
                              Edit Puzzle
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <button
                      onClick={solved ? nextPuzzle : resetPuzzle}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                    >
                      {solved ? <ArrowRight className="w-5 h-5 stroke-[3]" /> : <RotateCcw className="w-4 h-4" />}
                      {solved ? 'Next Puzzle' : 'Reset'}
                    </button>
                    
                    {/* Reattempt Button - shown when solved */}
                    {solved && (
                      <button
                        onClick={resetPuzzle}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm font-medium"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reattempt
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="card-premium p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-foreground">Progress</span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(((currentPuzzleIndex + (solved ? 1 : 0)) / categoryPuzzles.length) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all" 
                      style={{ width: `${((currentPuzzleIndex + (solved ? 1 : 0)) / categoryPuzzles.length) * 100}%` }}
                    />
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

export default Puzzles;
