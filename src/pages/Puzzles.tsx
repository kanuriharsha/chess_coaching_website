import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import PromotionDialog from '@/components/PromotionDialog';
import { isPromotionMove } from '@/lib/chess';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, CheckCircle, Puzzle as PuzzleIcon, ArrowRight, RotateCcw, Lightbulb, ShieldOff, Plus, Edit3, GripVertical, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useChessSound } from '@/hooks/useChessSound';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import type { MoveNode } from '@/components/VisualBoardEditor';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface PuzzleCategory {
  id: string;
  name: string;
  description: string;
  count: number;
  unlocked: boolean;
  accessLimit: number; // 0 = unlimited, >0 = limited
  icon: string;
  order_index?: number; // Admin-defined display order
}

interface CategoryOrder {
  categoryId: string;
  order_index: number;
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
  isLocked?: boolean;
  originalIndex?: number;
  preloadedMove?: string;
  successMessage?: string;
  moveTree?: MoveNode[]; // Branching move tree (flat nodes with parentId refs)
}

interface ContentAccess {
  puzzleAccess: {
    [category: string]: {
      enabled: boolean;
      limit: number; // 0 = unlimited
      rangeStart?: number; // 1-based inclusive
      rangeEnd?: number; // 1-based inclusive
      specificPuzzles?: number[]; // specific 1-based puzzle numbers
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
  const [customCategories, setCustomCategories] = useState<Array<{id: string, name: string, description?: string, icon?: string}>>([]);

  const [puzzleCategories, setPuzzleCategories] = useState<PuzzleCategory[]>(defaultCategories);
  const [isInitializing, setIsInitializing] = useState(true);
  const [categoryPuzzles, setCategoryPuzzles] = useState<PuzzleData[]>([]);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [game, setGame] = useState(new Chess());
  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [contentAccess, setContentAccess] = useState<ContentAccess | null>(null);
  const { playSound } = useChessSound();
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0); // Track which move in the solution we're on (legacy flat-array fallback)
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null); // Tree-based: ID of the last correctly-played node
  const [preloadedMoveExecuted, setPreloadedMoveExecuted] = useState(false); // Track if preloaded move has been executed
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white'); // Fixed orientation per puzzle

  // Reorder mode state (admin only)
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderList, setReorderList] = useState<PuzzleCategory[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedReorderIndex, setSelectedReorderIndex] = useState<number | null>(null);
  const [categoryOrder, setCategoryOrder] = useState<CategoryOrder[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

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
    // Load puzzle categories from server first, then load puzzles with those categories
    const init = async () => {
      const cats = await loadCustomCategories();
      const orderData = await loadCategoryOrder();
      await loadPuzzles(cats, orderData);
      if (!isAdmin) {
        loadContentAccess();
      }
      setIsInitializing(false);
    };
    init();
  }, [isAdmin]);

  // Load category display order from API
  const loadCategoryOrder = async (): Promise<CategoryOrder[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzle-category-order`);
      if (response.ok) {
        const data: CategoryOrder[] = await response.json();
        setCategoryOrder(data);
        return data;
      }
    } catch (error) {
      console.error('Failed to load category order');
    }
    return [];
  };

  // Save category order (admin only)
  const saveCategoryOrder = async (orderedCategories: PuzzleCategory[]) => {
    setSavingOrder(true);
    try {
      const order = orderedCategories.map((cat, idx) => ({
        categoryId: cat.id,
        order_index: idx
      }));
      const response = await fetch(`${API_BASE_URL}/puzzle-category-order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ order }),
      });
      if (response.ok) {
        const updatedOrder: CategoryOrder[] = await response.json();
        setCategoryOrder(updatedOrder);
        // Apply new order to puzzle categories
        const orderMap = new Map(updatedOrder.map(o => [o.categoryId, o.order_index]));
        const sorted = [...orderedCategories].map((cat, idx) => ({ ...cat, order_index: idx }));
        setPuzzleCategories(sorted);
        toast.success('Category order saved!');
        setIsReorderMode(false);
      } else {
        toast.error('Failed to save order');
      }
    } catch (error) {
      console.error('Save category order error:', error);
      toast.error('Failed to save order');
    }
    setSavingOrder(false);
  };

  // Drag and drop handlers for category reordering — live reorder on dragOver (same as puzzle rearrange)
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    setDragOverIndex(index);

    // Live reorder: splice dragged item to new position immediately
    const updated = [...reorderList];
    const dragged = updated[dragIndex];
    updated.splice(dragIndex, 1);
    updated.splice(index, 0, dragged);
    setReorderList(updated);
    setDragIndex(index); // Track dragged item's new position
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const enterReorderMode = () => {
    setReorderList([...puzzleCategories]);
    setSelectedReorderIndex(null);
    setIsReorderMode(true);
  };

  const cancelReorderMode = () => {
    setReorderList([]);
    setSelectedReorderIndex(null);
    setIsReorderMode(false);
  };

  // Keyboard navigation for selected category in reorder mode
  const handleReorderKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isReorderMode || selectedReorderIndex === null) return;
    const maxIndex = reorderList.length - 1;

    let targetIndex: number | null = null;
    if (e.key === 'ArrowLeft' && selectedReorderIndex > 0) {
      e.preventDefault();
      targetIndex = selectedReorderIndex - 1;
    } else if (e.key === 'ArrowRight' && selectedReorderIndex < maxIndex) {
      e.preventDefault();
      targetIndex = selectedReorderIndex + 1;
    } else if (e.key === 'ArrowUp' && selectedReorderIndex > 0) {
      e.preventDefault();
      targetIndex = Math.max(0, selectedReorderIndex - 2);
    } else if (e.key === 'ArrowDown' && selectedReorderIndex < maxIndex) {
      e.preventDefault();
      targetIndex = Math.min(maxIndex, selectedReorderIndex + 2);
    }

    if (targetIndex !== null) {
      const updated = [...reorderList];
      const [item] = updated.splice(selectedReorderIndex, 1);
      updated.splice(targetIndex, 0, item);
      setReorderList(updated);
      setSelectedReorderIndex(targetIndex);
      toast.info(`Moved to position ${targetIndex + 1}`);
    }
  }, [isReorderMode, selectedReorderIndex, reorderList]);

  useEffect(() => {
    if (isReorderMode) {
      window.addEventListener('keydown', handleReorderKeyDown);
      return () => window.removeEventListener('keydown', handleReorderKeyDown);
    }
  }, [isReorderMode, handleReorderKeyDown]);

  // Load custom categories from API (server-side – consistent for all users)
  const loadCustomCategories = async (): Promise<Array<{id: string, name: string, description?: string, icon?: string}>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzle-categories`);
      if (response.ok) {
        const data = await response.json();
        const cats = data.map((c: any) => ({ id: c.categoryId, name: c.name, description: c.description, icon: c.icon }));
        setCustomCategories(cats);
        return cats;
      }
    } catch (error) {
      console.error('Failed to load custom categories');
    }
    return [];
  };

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
      setCurrentNodeId(null); // Reset tree traversal pointer
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

  const loadPuzzles = async (cats: Array<{id: string, name: string, description?: string, icon?: string}> = [], orderData: CategoryOrder[] = []) => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles`);
      if (response.ok) {
        const puzzles: PuzzleData[] = await response.json();
        
        // Count puzzles per category (including custom ones)
        const categoryCounts: { [key: string]: number } = {};
        puzzles.forEach(p => {
          if (p.isEnabled) {
            categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
          }
        });

        // Build custom category cards from the server-fetched list
        const customCategoryCards = cats.map((cat) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description || 'Custom puzzle category',
          count: categoryCounts[cat.id] || 0,
          unlocked: (categoryCounts[cat.id] || 0) > 0,
          accessLimit: 0,
          icon: cat.icon || '🎯'
        }));

        // Update default categories with counts
        const updatedDefault = defaultCategories.map(cat => ({
          ...cat,
          count: categoryCounts[cat.id] || 0,
          unlocked: (categoryCounts[cat.id] || 0) > 0
        }));

        // Merge and apply admin-defined order
        let allCategories: PuzzleCategory[] = [...updatedDefault, ...customCategoryCards];
        if (orderData.length > 0) {
          const orderMap = new Map(orderData.map(o => [o.categoryId, o.order_index]));
          allCategories = allCategories.map(cat => ({
            ...cat,
            order_index: orderMap.has(cat.id) ? orderMap.get(cat.id) : 999
          }));
          allCategories.sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));
        }

        setPuzzleCategories(allCategories);
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
          const hasRange = rangeCfg && rangeCfg.rangeStart && rangeCfg.rangeEnd && rangeCfg.rangeEnd >= rangeCfg.rangeStart;
          const hasSpecific = rangeCfg && rangeCfg.specificPuzzles && rangeCfg.specificPuzzles.length > 0;
          if (hasRange || hasSpecific) {
            // Merge range and specific puzzles into one combined enabled set
            const enabledSet = new Set<number>();
            if (hasRange) {
              for (let i = rangeCfg!.rangeStart!; i <= rangeCfg!.rangeEnd!; i++) {
                enabledSet.add(i);
              }
            }
            if (hasSpecific) {
              for (const n of rangeCfg!.specificPuzzles!) {
                enabledSet.add(n);
              }
            }
            puzzles = puzzles.map((puzzle, index) => ({
              ...puzzle,
              isLocked: !enabledSet.has(index + 1) // 1-based
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

  /**
   * Checks whether the move played by the user satisfies the solution step.
   * Each solution step may contain comma-separated alternatives (e.g. "Ba3#,Ba4#").
   * For the final step of any mate-in-N category, any move that results in
   * checkmate is also accepted automatically.
   */
  const isMoveCorrect = (
    expectedStep: string,
    move: { san: string; from: string; to: string },
    gameAfterMove: Chess,
    isLastStep: boolean,
    isMateCategory: boolean
  ): boolean => {
    // Accept any checkmate move on the final step of a mate puzzle
    if (isLastStep && isMateCategory && gameAfterMove.isCheckmate()) {
      return true;
    }
    // Parse comma-separated alternatives and compare case-insensitively
    const alternatives = expectedStep.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const moveSanLower = move.san.toLowerCase();
    const fromTo = (move.from + move.to).toLowerCase();
    const toLower = move.to.toLowerCase();
    return alternatives.some(
      alt => moveSanLower === alt || fromTo === alt || toLower === alt
    );
  };

  // ── Tree traversal helpers ────────────────────────────────────────────────
  /** Get direct children of nodeId in tree */
  const treeChildren = (tree: MoveNode[], nodeId: string | null) =>
    tree.filter(n => n.parentId === nodeId);

  /** Check whether a played move matches a tree node (SAN or from+to) */
  const nodeMatchesMove = (
    nodeMove: string,
    move: { san: string; from: string; to: string }
  ): boolean => {
    const alts = nodeMove.split(',').map(s => s.trim().toLowerCase());
    const sanLower = move.san.toLowerCase();
    const fromTo = (move.from + move.to).toLowerCase();
    return alts.some(alt => sanLower === alt || fromTo === alt || move.to.toLowerCase() === alt);
  };

  /**
   * Puzzle Move Handler - supports both tree-based and legacy flat-array solutions.
   */
  const handleMove = useCallback(
    (from: Square, to: Square): boolean => {
      if (solved || !currentPuzzle) return false;

      const gameCopy = new Chess(game.fen());
      
      const moveVerbose = gameCopy.moves({ square: from, verbose: true }).find(m => m.to === to);
      if (moveVerbose && moveVerbose.promotion) {
        setPendingPromotion({ from, to, gameCopy });
        setShowPromotion(true);
        return false;
      }

      const move = gameCopy.move({ from, to });
      if (!move) return false;

      setGame(gameCopy);
      setLastMove({ from, to });

      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      const categoryId = selectedCategory || '';
      const isMateCategory = (currentPuzzle.category || '').startsWith('mate-in-');
      const isLastFlatStep = currentMoveIndex + 1 >= currentPuzzle.solution.length;

      // ── TREE-BASED SOLVING ────────────────────────────────────────────────
      if (currentPuzzle.moveTree && currentPuzzle.moveTree.length > 0) {
        const tree = currentPuzzle.moveTree;
        const validPlayerMoves = treeChildren(tree, currentNodeId);
        const matchedNode = validPlayerMoves.find(n => nodeMatchesMove(n.move, move));

        if (!matchedNode) {
          // Wrong move
          playSound('illegal');
          toast.error('Wrong move, try again', { description: 'Think carefully about the correct move.' });
          trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'failed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
          setTimeout(() => { setGame(new Chess(game.fen())); setLastMove(null); }, 300);
          return true;
        }

        // Correct move — advance tree pointer
        setCurrentNodeId(matchedNode.id);
        const opponentCandidates = treeChildren(tree, matchedNode.id);

        if (opponentCandidates.length === 0) {
          // No opponent reply → puzzle solved!
          setSolved(true);
          playSound('checkmate');
          toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔', { description: 'You solved the puzzle!' });
          trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
        } else {
          // Auto-play opponent's reply (first child of matched node)
          playSound('move');
          const opponentNode = opponentCandidates[0];
          setTimeout(() => {
            const updatedGame = new Chess(gameCopy.fen());
            try {
              const oppMove = updatedGame.move(opponentNode.move.split(',')[0].trim());
              if (oppMove) {
                setGame(updatedGame);
                setLastMove({ from: oppMove.from as Square, to: oppMove.to as Square });
                setCurrentNodeId(opponentNode.id);
                playSound('move');
                // Check if puzzle ends after opponent's reply
                const afterOpponent = treeChildren(tree, opponentNode.id);
                if (afterOpponent.length === 0) {
                  setSolved(true);
                  playSound('checkmate');
                  toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔', { description: 'You solved the puzzle!' });
                  trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
                }
              }
            } catch (err) { console.error('Error playing opponent move:', err); }
          }, 500);
        }
        return true;
      }

      // ── LEGACY FLAT-ARRAY SOLVING (backward compat) ───────────────────────
      const expectedMove = currentPuzzle.solution[currentMoveIndex];
      const moveMatches = isMoveCorrect(expectedMove, move, gameCopy, isLastFlatStep, isMateCategory);

      if (!moveMatches) {
        playSound('illegal');
        toast.error('Wrong move, try again', { description: 'Think carefully about the correct move.' });
        trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'failed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
        setTimeout(() => { setGame(new Chess(game.fen())); setLastMove(null); }, 300);
        return true;
      }

      setCurrentMoveIndex(currentMoveIndex + 1);

      if (currentMoveIndex + 1 >= currentPuzzle.solution.length) {
        setSolved(true);
        playSound('checkmate');
        toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔', { description: 'You solved the puzzle!' });
        trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
      } else {
        playSound('move');
        setTimeout(() => {
          const nextMoveRaw = currentPuzzle.solution[currentMoveIndex + 1];
          const nextMove = nextMoveRaw ? nextMoveRaw.split(',')[0].trim() : null;
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
                  toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔', { description: 'You solved the puzzle!' });
                  trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
                }
              }
            } catch (err) { console.error('Error playing opponent move:', err); }
          }
        }, 500);
      }

      return true;
    },
    [game, solved, playSound, currentPuzzle, attempts, selectedCategory, puzzleCategories, trackPuzzleAttempt, currentMoveIndex, currentNodeId]
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

      setGame(gameCopy);
      setLastMove({ from, to });
      setPendingPromotion(null);
      setShowPromotion(false);

      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      const categoryId = selectedCategory || '';
      const isMateCategory = (currentPuzzle.category || '').startsWith('mate-in-');

      // ── TREE-BASED SOLVING ────────────────────────────────────────────────
      if (currentPuzzle.moveTree && currentPuzzle.moveTree.length > 0) {
        const tree = currentPuzzle.moveTree;
        const validPlayerMoves = treeChildren(tree, currentNodeId);
        const matchedNode = validPlayerMoves.find(n => nodeMatchesMove(n.move, mv));

        if (!matchedNode) {
          playSound('illegal');
          toast.error('Wrong move, try again');
          trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'failed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
          setTimeout(() => { setGame(new Chess(game.fen())); setLastMove(null); }, 300);
          return;
        }

        setCurrentNodeId(matchedNode.id);
        const opponentCandidates = treeChildren(tree, matchedNode.id);

        if (opponentCandidates.length === 0) {
          setSolved(true);
          playSound('checkmate');
          toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔');
          trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
        } else {
          playSound('move');
          const opponentNode = opponentCandidates[0];
          setTimeout(() => {
            const updatedGame = new Chess(gameCopy.fen());
            try {
              const oppMove = updatedGame.move(opponentNode.move.split(',')[0].trim());
              if (oppMove) {
                setGame(updatedGame);
                setLastMove({ from: oppMove.from as Square, to: oppMove.to as Square });
                setCurrentNodeId(opponentNode.id);
                playSound('move');
                if (treeChildren(tree, opponentNode.id).length === 0) {
                  setSolved(true);
                  playSound('checkmate');
                  toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔');
                  trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
                }
              }
            } catch (err) { console.error('Error playing opponent move:', err); }
          }, 500);
        }
        return;
      }

      // ── LEGACY FLAT-ARRAY SOLVING (backward compat) ───────────────────────
      const isLastStep = currentMoveIndex + 1 >= currentPuzzle.solution.length;
      const expectedMove = currentPuzzle.solution[currentMoveIndex];
      const moveMatches = isMoveCorrect(expectedMove, mv, gameCopy, isLastStep, isMateCategory);

      if (!moveMatches) {
        playSound('illegal');
        toast.error('Wrong move, try again');
        trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'failed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
        setTimeout(() => { setGame(new Chess(game.fen())); setLastMove(null); }, 300);
        return;
      }

      setCurrentMoveIndex(currentMoveIndex + 1);
      if (currentMoveIndex + 1 >= currentPuzzle.solution.length) {
        setSolved(true);
        playSound('checkmate');
        toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔');
        trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
      } else {
        playSound('move');
        setTimeout(() => {
          const nextMoveRaw = currentPuzzle.solution[currentMoveIndex + 1];
          const nextMove = nextMoveRaw ? nextMoveRaw.split(',')[0].trim() : null;
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
                  toast.success(currentPuzzle.successMessage || 'Checkmate! Brilliant move! ♔');
                  trackPuzzleAttempt(currentPuzzle._id, currentPuzzle.name, categoryId, 'passed', newAttempts, currentPuzzle.originalIndex || currentPuzzleIndex + 1);
                }
              }
            } catch (err) { console.error('Error playing opponent move:', err); }
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
    setCurrentNodeId(null); // Reset tree traversal pointer
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
            <div className="flex gap-2">
              {!isReorderMode ? (
                <Button size="sm" variant="outline" onClick={enterReorderMode}>
                  <GripVertical className="w-4 h-4 mr-1" />
                  Reorder
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={cancelReorderMode} disabled={savingOrder}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => saveCategoryOrder(reorderList)} disabled={savingOrder}>
                    <Save className="w-4 h-4 mr-1" />
                    {savingOrder ? 'Saving...' : 'Save Order'}
                  </Button>
                </>
              )}
              {!isReorderMode && (
                <Button size="sm" onClick={() => navigate('/puzzle-manager')}>
                  <Plus className="w-4 h-4 mr-1" />
                  Create
                </Button>
              )}
            </div>
          )}
        </div>

        {!selectedCategory ? (
          /* Category Grid */
          <div className="pb-4">
            {isInitializing ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card-premium p-5 animate-pulse">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 bg-muted rounded-md" />
                      <div className="w-5 h-5 bg-muted rounded" />
                    </div>
                    <div className="h-5 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-3 bg-muted rounded w-full mb-1" />
                    <div className="h-3 bg-muted rounded w-4/5 mb-4" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : isReorderMode ? (
              /* Admin Reorder Mode - Bubble/Pill style, live drag like puzzle rearrange */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Drag categories or tap to select and use arrow keys to move.
                  This sets the default display order for all users.
                </p>
                <div className="flex flex-wrap gap-3 p-4 bg-muted/30 rounded-lg min-h-[120px]">
                  {reorderList.map((category, index) => {
                    const isDragging = dragIndex === index;
                    const isSelected = selectedReorderIndex === index;
                    return (
                      <div
                        key={category.id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedReorderIndex(isSelected ? null : index)}
                        title={`${category.name} — click to select, then use arrow keys to move`}
                        className={`
                          px-4 py-2.5 rounded-full cursor-move
                          flex items-center gap-2
                          transition-all duration-200 ease-in-out
                          hover:scale-105 hover:shadow-lg
                          border-2
                          ${isDragging ? 'opacity-40 scale-90 shadow-2xl' : 'opacity-100'}
                          ${isSelected
                            ? 'ring-4 ring-primary ring-offset-2 scale-105 border-primary bg-primary text-primary-foreground'
                            : 'bg-card border-border text-foreground hover:border-primary/60'
                          }
                        `}
                        style={{ transform: isDragging ? 'rotate(2deg)' : 'rotate(0deg)' }}
                      >
                        <GripVertical className="w-4 h-4 opacity-50 flex-shrink-0" />
                        <span className="text-lg flex-shrink-0">{category.icon}</span>
                        <span className="font-medium text-sm whitespace-nowrap">{category.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          <PuzzleIcon className="w-3 h-3 inline mr-0.5" />
                          {category.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...puzzleCategories].sort((a, b) => {
              // Hybrid sorting for students: unlocked first, locked second
              // Within each group, preserve admin-defined order (order_index)
              if (isAdmin) return 0; // admins: preserve admin-defined order as-is
              const aLocked = !hasAccessToCategory(a.id) || (a.count === 0);
              const bLocked = !hasAccessToCategory(b.id) || (b.count === 0);
              if (aLocked !== bLocked) return aLocked ? 1 : -1; // unlocked first
              // Within same lock group, preserve admin order
              return (a.order_index ?? 999) - (b.order_index ?? 999);
            }).map((category) => {
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
                        const cfgHasRange = accessCfg?.rangeStart && accessCfg?.rangeEnd && accessCfg.rangeEnd >= accessCfg.rangeStart;
                        const cfgHasSpecific = accessCfg?.specificPuzzles && accessCfg.specificPuzzles.length > 0;
                        if (cfgHasRange || cfgHasSpecific) {
                          const numSet = new Set<number>();
                          if (cfgHasRange) {
                            for (let i = accessCfg!.rangeStart!; i <= accessCfg!.rangeEnd!; i++) numSet.add(i);
                          }
                          if (cfgHasSpecific) {
                            for (const n of accessCfg!.specificPuzzles!) numSet.add(n);
                          }
                          const combined = Array.from(numSet).sort((a, b) => a - b);
                          return (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-full text-xs">
                              <ShieldOff className="w-3 h-3" />
                              #{combined.join(', #')} unlocked
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
            )}
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
