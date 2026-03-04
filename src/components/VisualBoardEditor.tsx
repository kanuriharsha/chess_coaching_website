import React, { useState, useCallback } from 'react';
import { Chess, Square } from 'chess.js';
import { getPossibleSquares, isCapture, isPromotionMove } from '@/lib/chess';
import PromotionDialog from './PromotionDialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { RotateCcw, Trash2, Play, Save, ArrowRight, Upload, Plus, X, GitBranch } from 'lucide-react';
import { toast } from 'sonner';

// ─── Move Tree Types ──────────────────────────────────────────────────────
export interface MoveNode {
  id: string;
  move: string;          // SAN notation
  parentId: string | null; // null = root level
}

const genId = () => Math.random().toString(36).substr(2, 9);

/** Replay moves from root to nodeId and return the resulting FEN */
function computeFenAtNode(
  tree: MoveNode[],
  nodeId: string | null,
  startFen: string
): string {
  if (!nodeId) return startFen;
  const path: string[] = [];
  let cur: string | null = nodeId;
  while (cur !== null) {
    path.unshift(cur);
    const n = tree.find(x => x.id === cur);
    cur = n?.parentId ?? null;
  }
  const game = new Chess(startFen);
  for (const id of path) {
    const n = tree.find(x => x.id === id);
    if (n) { try { game.move(n.move); } catch { break; } }
  }
  return game.fen();
}

/** Return main-line moves (follow the first child at each level) */
function getMainLine(tree: MoveNode[]): string[] {
  const moves: string[] = [];
  let cur: string | null = null;
  while (true) {
    const children = tree.filter(n => n.parentId === cur);
    if (children.length === 0) break;
    moves.push(children[0].move);
    cur = children[0].id;
  }
  return moves;
}

/** Convert a flat solution array to a linear tree chain */
function flatToTree(solution: string[]): MoveNode[] {
  const nodes: MoveNode[] = [];
  let parentId: string | null = null;
  for (const move of solution) {
    const id = genId();
    nodes.push({ id, move, parentId });
    parentId = id;
  }
  return nodes;
}

// ─── Column-based tree display ───────────────────────────────────────────────

/** Get the depth of a node from the root (root children = depth 0) */
function getNodeDepth(tree: MoveNode[], nodeId: string): number {
  let depth = 0;
  let cur: string | null = nodeId;
  while (cur !== null) {
    const n = tree.find(x => x.id === cur);
    cur = n?.parentId ?? null;
    if (cur !== null) depth++;
  }
  return depth;
}

/**
 * Build a list of columns for display.
 * Column 0 = main line (always first child), Column N = Nth variation.
 * Each column is an ordered array of MoveNodes.
 */
function buildColumns(tree: MoveNode[]): MoveNode[][] {
  if (tree.length === 0) return [];
  const columns: MoveNode[][] = [];

  function dfs(parentId: string | null, col: MoveNode[]) {
    const children = tree.filter(n => n.parentId === parentId);
    if (children.length === 0) {
      if (col.length > 0) columns.push(col);
      return;
    }
    // first child continues the current column
    dfs(children[0].id, [...col, children[0]]);
    // extra children each start a brand-new column
    for (let i = 1; i < children.length; i++) {
      dfs(children[i].id, [children[i]]);
    }
  }

  dfs(null, []);
  return columns;
}

interface ColumnTreeDisplayProps {
  tree: MoveNode[];
  currentParentId: string | null;
  /** isSolverMove(depth) – true when the solver (not the opponent) moves */
  isSolverMove: (depth: number) => boolean;
  onBranch: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onNavigate: (nodeId: string) => void;
}

const ColumnTreeDisplay: React.FC<ColumnTreeDisplayProps> = ({
  tree, currentParentId, isSolverMove, onBranch, onDelete, onNavigate,
}) => {
  const columns = buildColumns(tree);
  if (columns.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="flex-shrink-0 min-w-[90px]">
          {/* Column header */}
          <div className="text-[10px] font-bold mb-1 px-1 text-gray-400 uppercase tracking-wide">
            {colIdx === 0 ? 'Main' : `Var ${colIdx}`}
          </div>
          {col.map((node) => {
            const depth = getNodeDepth(tree, node.id);
            const isCurrentEnd = currentParentId === node.id;
            const solverTurn = isSolverMove(depth);
            const moveNum = Math.floor(depth / 2) + 1;
            const isBlackMove = depth % 2 === 1;
            return (
              <div
                key={node.id}
                onClick={() => onNavigate(node.id)}
                className={`flex items-center gap-1 py-0.5 px-1 rounded text-sm group cursor-pointer ${
                  isCurrentEnd ? 'bg-green-100 ring-1 ring-green-400' : 'hover:bg-gray-100'
                }`}
              >
                <span className="text-gray-400 text-xs font-medium w-6 flex-shrink-0">
                  {isBlackMove ? '…' : `${moveNum}.`}
                </span>
                <span className={`font-semibold flex-1 truncate ${
                  isCurrentEnd ? 'text-green-700' : 'text-gray-800'
                }`}>
                  {node.move}
                </span>
                {/* + only on solver's moves */}
                {solverTurn && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onBranch(node.id); }}
                    className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 transition-all flex-shrink-0"
                    title={`Add alternative to ${node.move}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all flex-shrink-0"
                  title={`Delete ${node.move}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────
interface VisualBoardEditorProps {
  onPositionSave: (
    fen: string,
    solution: string[],
    preloadedMove?: string,
    moveTree?: MoveNode[]
  ) => void;
  initialFen?: string;
  initialSolution?: string[];
  initialMode?: 'setup' | 'solution';
  initialPreloadedMove?: string;
  initialMoveTree?: MoveNode[];
}

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

// Chess.com style piece images (using lichess cburnett set which is similar)
const PIECE_IMAGES: { [key in PieceType]: string } = {
  'K': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wk.png',
  'Q': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wq.png',
  'R': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wr.png',
  'B': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wb.png',
  'N': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wn.png',
  'P': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wp.png',
  'k': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bk.png',
  'q': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bq.png',
  'r': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/br.png',
  'b': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bb.png',
  'n': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bn.png',
  'p': 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bp.png',
};

const WHITE_PIECES: PieceType[] = ['K', 'Q', 'R', 'B', 'N', 'P'];
const BLACK_PIECES: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

// Chess.com board colors
const LIGHT_SQUARE = '#ebecd0';
const DARK_SQUARE = '#779556';
const SELECTED_LIGHT = '#f7f769';
const SELECTED_DARK = '#bbcc44';

const VisualBoardEditor: React.FC<VisualBoardEditorProps> = ({
  onPositionSave,
  initialFen,
  initialSolution,
  initialMode,
  initialPreloadedMove,
  initialMoveTree,
}) => {
  // Board state
  const [board, setBoard] = useState<(PieceType | null)[][]>(() =>
    Array(8).fill(null).map(() => Array(8).fill(null))
  );

  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>(null);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const [castleWhiteK, setCastleWhiteK] = useState(false);
  const [castleWhiteQ, setCastleWhiteQ] = useState(false);
  const [castleBlackK, setCastleBlackK] = useState(false);
  const [castleBlackQ, setCastleBlackQ] = useState(false);
  const [enPassantTarget, setEnPassantTarget] = useState<string>('-');

  // Solution recording state
  const [mode, setMode] = useState<'setup' | 'preloadedMove' | 'solution'>('setup');
  const [setupFen, setSetupFen] = useState<string>('');
  const [solutionGame, setSolutionGame] = useState<Chess | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleTargets, setPossibleTargets] = useState<string[]>([]);
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<null | { from: string; to: string; gameCopy: Chess }>(null);

  // Move tree state
  const [moveTree, setMoveTree] = useState<MoveNode[]>([]);
  // currentParentId: the node ID the NEXT recorded move will be a child of (null = root)
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  // branchingFromNodeId: the node we're creating an alternative TO (set when admin clicks "+")
  const [branchingFromNodeId, setBranchingFromNodeId] = useState<string | null>(null);

  // FEN input state
  const [fenInput, setFenInput] = useState('');

  // Preloaded move state
  const [enablePreloadedMove, setEnablePreloadedMove] = useState(false);
  const [preloadedMove, setPreloadedMove] = useState<string>('');
  const [preloadedMoveFen, setPreloadedMoveFen] = useState<string>('');

  // Load initial FEN and solution if provided (for editing existing puzzles)
  React.useEffect(() => {
    if (!initialFen) return;
    try {
      const startGame = new Chess(initialFen);
      const newBoard: (PieceType | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
      for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
          const square = `${FILES[file]}${RANKS[rank]}` as Square;
          const piece = startGame.get(square);
          if (piece) {
            const pchar = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
            newBoard[rank][file] = pchar as PieceType;
          }
        }
      }
      setBoard(newBoard);
      setTurn(startGame.turn());

      const fenParts = initialFen.split(' ');
      const castling = fenParts[2] || '-';
      setCastleWhiteK(castling.includes('K'));
      setCastleWhiteQ(castling.includes('Q'));
      setCastleBlackK(castling.includes('k'));
      setCastleBlackQ(castling.includes('q'));
      setEnPassantTarget(fenParts[3] || '-');
      setSetupFen(initialFen);

      // Compute the correct base FEN for solution playback.
      // If there's a preloaded move, the solution tree was recorded from AFTER it,
      // so we need to flip the turn and apply the preloaded move to get that base FEN.
      let baseFen = initialFen;
      if (initialPreloadedMove?.trim()) {
        setEnablePreloadedMove(true);
        setPreloadedMove(initialPreloadedMove);
        try {
          const parts = initialFen.split(' ');
          // The preloaded move is the opponent's move, so flip the turn before applying
          parts[1] = parts[1] === 'w' ? 'b' : 'w';
          const flipped = new Chess(parts.join(' '));
          flipped.move(initialPreloadedMove);
          baseFen = flipped.fen();
          setPreloadedMoveFen(baseFen);
        } catch {
          // fall back to initialFen if the move can't be applied
          baseFen = initialFen;
        }
      }

      // Build the initial tree
      let tree: MoveNode[] = [];
      if (initialMoveTree && initialMoveTree.length > 0) {
        tree = initialMoveTree;
      } else if (initialSolution && initialSolution.length > 0) {
        tree = flatToTree(initialSolution);
      }

      if (tree.length > 0) {
        setMoveTree(tree);
        // Set currentParentId to the last node of the main line
        const mainLine = getMainLine(tree);
        let lastId: string | null = null;
        let curSearch: string | null = null;
        for (const mv of mainLine) {
          const child = tree.filter(n => n.parentId === curSearch).find(n => n.move === mv);
          if (child) { lastId = child.id; curSearch = child.id; } else break;
        }
        setCurrentParentId(lastId);

        // Replay solution moves from baseFen (position after preloaded move, if any)
        const g = new Chess(baseFen);
        for (const mv of mainLine) { try { g.move(mv); } catch { break; } }
        setSolutionGame(new Chess(g.fen()));
        if (initialMode === 'solution' || mainLine.length > 0) setMode('solution');
      } else if (initialPreloadedMove?.trim() && baseFen !== initialFen) {
        // Has a preloaded move but no solution moves yet — show position after preloaded move
        setSolutionGame(new Chess(baseFen));
        setMode('solution');
      }
    } catch (e) {
      // ignore invalid FEN
    }
  }, [initialFen, initialSolution, initialMode, initialPreloadedMove, initialMoveTree]);

  // Convert board array to FEN
  const boardToFen = useCallback((): string => {
    let fen = '';
    for (let rank = 0; rank < 8; rank++) {
      let emptyCount = 0;
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece) {
          if (emptyCount > 0) {
            fen += emptyCount;
            emptyCount = 0;
          }
          fen += piece;
        } else {
          emptyCount++;
        }
      }
      if (emptyCount > 0) {
        fen += emptyCount;
      }
      if (rank < 7) fen += '/';
    }
    // Build castling rights string from state
    let castling = '';
    if (castleWhiteK) castling += 'K';
    if (castleWhiteQ) castling += 'Q';
    if (castleBlackK) castling += 'k';
    if (castleBlackQ) castling += 'q';
    if (castling === '') castling = '-';

    // enPassantTarget is either '-' or a valid square like 'e3'
    const ep = enPassantTarget || '-';

    // Add turn, castling rights, en passant target, halfmove, fullmove
    fen += ` ${turn} ${castling} ${ep} 0 1`;
    return fen;
  }, [board, turn, castleWhiteK, castleWhiteQ, castleBlackK, castleBlackQ, enPassantTarget]);

  // ── Record a move to the tree ─────────────────────────────────────────────
  const recordMoveToTree = useCallback((san: string, gameAfterMove: Chess) => {
    const newId = genId();
    setMoveTree(prev => [...prev, { id: newId, move: san, parentId: currentParentId }]);
    setCurrentParentId(newId);
    setSolutionGame(new Chess(gameAfterMove.fen()));
    toast.success(`Move recorded: ${san}`);
    if (gameAfterMove.isCheckmate()) toast.success('Checkmate! Great puzzle!');
  }, [currentParentId]);

  // ── Branch from a node (adds alternative TO that move, not after it) ────────
  const branchFromNode = useCallback((nodeId: string) => {
    const node = moveTree.find(n => n.id === nodeId);
    if (!node) return;
    const parentId = node.parentId; // go back to BEFORE this move
    const baseFen = preloadedMoveFen || setupFen;
    if (!baseFen) { toast.error('Save the position first'); return; }
    const fen = computeFenAtNode(moveTree, parentId, baseFen);
    setSolutionGame(new Chess(fen));
    setCurrentParentId(parentId);
    setBranchingFromNodeId(nodeId);
    setSelectedSquare(null);
    setPossibleTargets([]);
    toast.info(`Play an alternative move to "${node.move}".`);
  }, [moveTree, preloadedMoveFen, setupFen]);

  // ── Navigate to a node (just show position, no variation mode) ───────────────
  const navigateToNode = useCallback((nodeId: string) => {
    const baseFen = preloadedMoveFen || setupFen;
    if (!baseFen) return;
    const fen = computeFenAtNode(moveTree, nodeId, baseFen);
    setSolutionGame(new Chess(fen));
    setCurrentParentId(nodeId);
    setSelectedSquare(null);
    setPossibleTargets([]);
  }, [moveTree, preloadedMoveFen, setupFen]);

  // ── Delete a node and its entire subtree ─────────────────────────────────
  const deleteNodeSubtree = useCallback((nodeId: string) => {
    setMoveTree(prev => {
      const toDelete = new Set<string>();
      const queue = [nodeId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        toDelete.add(cur);
        prev.filter(n => n.parentId === cur).forEach(n => queue.push(n.id));
      }
      return prev.filter(n => !toDelete.has(n.id));
    });
    // Reset currentParentId if it falls within the deleted subtree
    setCurrentParentId(prev => {
      let cur: string | null = prev;
      while (cur !== null) {
        if (cur === nodeId) {
          const node = moveTree.find(n => n.id === nodeId);
          return node?.parentId ?? null;
        }
        const n = moveTree.find(x => x.id === cur);
        cur = n?.parentId ?? null;
      }
      return prev;
    });
    if (branchingFromNodeId === nodeId) setBranchingFromNodeId(null);
    toast.info('Variation deleted');
  }, [moveTree, branchingFromNodeId]);

  // ── Undo the last recorded move ───────────────────────────────────────────
  const undoLastMove = () => {
    if (!currentParentId) return;
    const lastNode = moveTree.find(n => n.id === currentParentId);
    if (!lastNode) return;
    const newTree = moveTree.filter(n => n.id !== lastNode.id);
    setMoveTree(newTree);
    const newParentId = lastNode.parentId;
    setCurrentParentId(newParentId);
    const baseFen = preloadedMoveFen || setupFen;
    setSolutionGame(new Chess(computeFenAtNode(newTree, newParentId, baseFen)));
    setSelectedSquare(null);
    setPossibleTargets([]);
    if (branchingFromNodeId === lastNode.id) setBranchingFromNodeId(null);
  };

  // Handle clicking on a square in setup mode
  const handleSquareClick = (rank: number, file: number) => {
    if (mode === 'setup') {
      if (isEraseMode) {
        // Erase piece
        const newBoard = board.map(r => [...r]);
        newBoard[rank][file] = null;
        setBoard(newBoard);
      } else if (selectedPiece) {
        const newBoard = board.map(r => [...r]);
        const currentPiece = board[rank][file];
        
        // If clicking on same piece, remove it (toggle off)
        if (currentPiece === selectedPiece) {
          newBoard[rank][file] = null;
        } else {
          // Place or replace with selected piece
          newBoard[rank][file] = selectedPiece;
        }
        setBoard(newBoard);
      }
    } else if (mode === 'preloadedMove' && solutionGame) {
      // Handle preloaded move - only ONE move allowed
      const square = `${FILES[file]}${RANKS[rank]}` as Square;
      
      if (selectedSquare) {
        // Try to make the preloaded move
        try {
          const gameCopy = new Chess(solutionGame.fen());
          const moveVerbose = gameCopy.moves({ square: selectedSquare as Square, verbose: true }).find(m => m.to === square);
          if (moveVerbose && moveVerbose.promotion) {
            setPendingPromotion({ from: selectedSquare as string, to: square, gameCopy });
            setShowPromotionDialog(true);
          } else {
            const move = solutionGame.move({ from: selectedSquare as Square, to: square });
            if (move) {
              setPreloadedMove(move.san);
              setPreloadedMoveFen(solutionGame.fen());
              setSolutionGame(new Chess(solutionGame.fen()));
              toast.success(`Preloaded move recorded: ${move.san}`, {
                description: 'Now proceeding to solution recording...'
              });
              // Automatically advance to solution mode after recording preloaded move
              setTimeout(() => {
                setMode('solution');
                setMoveTree([]);
                setCurrentParentId(null);
              }, 600);
            }
          }
        } catch (e) {
          toast.error('Invalid move');
        }
        setSelectedSquare(null);
        setPossibleTargets([]);
      } else {
        // Select square if it has a piece of current turn
        const piece = solutionGame.get(square);
        if (piece && piece.color === solutionGame.turn()) {
          setSelectedSquare(square);
          setPossibleTargets(getPossibleSquares(solutionGame, square));
        }
      }
    } else if (mode === 'solution' && solutionGame) {
      // Handle move in solution mode - tree-based recording
      const square = `${FILES[file]}${RANKS[rank]}` as Square;
      
      if (selectedSquare) {
        try {
          const gameCopy = new Chess(solutionGame.fen());
          const moveVerbose = gameCopy.moves({ square: selectedSquare as Square, verbose: true }).find(m => m.to === square);
          if (moveVerbose && moveVerbose.promotion) {
            setPendingPromotion({ from: selectedSquare as string, to: square, gameCopy });
            setShowPromotionDialog(true);
          } else {
            const move = gameCopy.move({ from: selectedSquare as Square, to: square });
            if (move) {
              recordMoveToTree(move.san, gameCopy);
              setBranchingFromNodeId(null);
            }
          }
        } catch (e) {
          toast.error('Invalid move');
        }
        setSelectedSquare(null);
        setPossibleTargets([]);
      } else {
        // Select square if it has a piece of current turn
        const piece = solutionGame.get(square);
        if (piece && piece.color === solutionGame.turn()) {
          setSelectedSquare(square);
          setPossibleTargets(getPossibleSquares(solutionGame, square));
        }
      }
    }
  };

  const handlePromotionSelect = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion || !solutionGame) return;
    const { from, to, gameCopy } = pendingPromotion;
    try {
      const mv = gameCopy.move({ from: from as Square, to: to as Square, promotion: piece });
      if (mv) {
        if (mode === 'preloadedMove') {
          // Recording preloaded move with promotion
          setPreloadedMove(mv.san);
          setPreloadedMoveFen(gameCopy.fen());
          setSolutionGame(new Chess(gameCopy.fen()));
          toast.success(`Preloaded move recorded: ${mv.san}`, {
            description: 'Now proceeding to solution recording...'
          });
          setTimeout(() => {
            setMode('solution');
            setMoveTree([]);
            setCurrentParentId(null);
          }, 500);
        } else {
          // Recording solution move (tree)
          recordMoveToTree(mv.san, gameCopy);
          setBranchingFromNodeId(null);
        }
      }
    } catch (err) {
      toast.error('Invalid promotion move');
    }
    setPendingPromotion(null);
    setShowPromotionDialog(false);
  };

  // Clear the board
  const clearBoard = () => {
    setBoard(Array(8).fill(null).map(() => Array(8).fill(null)));
    setMode('setup');
    setMoveTree([]);
    setCurrentParentId(null);
    setBranchingFromNodeId(null);
    setSolutionGame(null);
    setSetupFen('');
    setSelectedSquare(null);
    setEnablePreloadedMove(false);
    setPreloadedMove('');
    setPreloadedMoveFen('');
  };

  // Load position from FEN string (parses only the board layout, ignores other fields)
  const loadFromFen = () => {
    const trimmed = fenInput.trim();
    if (!trimmed) {
      toast.error('Please enter a FEN string');
      return;
    }

    // Extract only the board layout (first field before any space)
    const boardPart = trimmed.split(' ')[0];
    const ranks = boardPart.split('/');

    if (ranks.length !== 8) {
      toast.error('Invalid FEN: must have exactly 8 ranks separated by "/"');
      return;
    }

    const validPieces = new Set(['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p']);
    const newBoard: (PieceType | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));

    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      let fileIdx = 0;
      for (const ch of ranks[rankIdx]) {
        if (fileIdx > 7) {
          toast.error(`Invalid FEN: rank ${8 - rankIdx} has too many squares`);
          return;
        }
        if (ch >= '1' && ch <= '8') {
          // Skip empty squares
          fileIdx += parseInt(ch, 10);
        } else if (validPieces.has(ch)) {
          newBoard[rankIdx][fileIdx] = ch as PieceType;
          fileIdx++;
        } else {
          toast.error(`Invalid FEN: unexpected character '${ch}' in rank ${8 - rankIdx}`);
          return;
        }
      }
      if (fileIdx !== 8) {
        toast.error(`Invalid FEN: rank ${8 - rankIdx} has ${fileIdx} squares instead of 8`);
        return;
      }
    }

    setBoard(newBoard);
    // Reset solution state since we're loading a new position
    setMode('setup');
    setMoveTree([]);
    setCurrentParentId(null);
    setBranchingFromNodeId(null);
    setSolutionGame(null);
    setSetupFen('');
    setSelectedSquare(null);
    setPreloadedMove('');
    setPreloadedMoveFen('');
    toast.success('Position loaded from FEN! Set turn, castling rights, and en passant manually, then proceed.');
  };

  // Set up starting position
  const setupStartingPosition = () => {
    const starting: (PieceType | null)[][] = [
      ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
      ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
      ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
    ];
    setBoard(starting);
  };

  // Start recording solution (or preloaded move if enabled)
  const startRecordingSolution = () => {
    const fen = boardToFen();
    try {
      const game = new Chess(fen);
      setSetupFen(fen);
      
      if (enablePreloadedMove) {
        // Go to preloaded move mode first
        const preloadedTurn = turn === 'w' ? 'b' : 'w';
        const fenParts = fen.split(' ');
        fenParts[1] = preloadedTurn;
        const preloadedFen = fenParts.join(' ');
        const preloadedGame = new Chess(preloadedFen);
        setSolutionGame(preloadedGame);
        setMode('preloadedMove');
        setSelectedSquare(null);
        toast.info(`Make the opponent's move (${preloadedTurn === 'w' ? 'White' : 'Black'} to move)`, {
          description: 'This move will execute automatically for students'
        });
      } else {
        // Go directly to solution mode
        setSolutionGame(game);
        setMoveTree([]);
        setCurrentParentId(null);
        setBranchingFromNodeId(null);
        setMode('solution');
        setSelectedSquare(null);
        setPreloadedMove('');
        setPreloadedMoveFen('');
        toast.success('Position saved! Now make the correct move(s) to record the solution.');
      }
    } catch (e) {
      toast.error('Invalid position. Make sure both kings are on the board.');
    }
  };

  // Back to setup mode
  const backToSetup = () => {
    setMode('setup');
    setSolutionGame(null);
    setSelectedSquare(null);
    setPossibleTargets([]);
    setPreloadedMove('');
    setPreloadedMoveFen('');
  };

  // Save puzzle
  const savePuzzle = () => {
    if (moveTree.length === 0) {
      toast.error('Please record at least one solution move');
      return;
    }
    const mainLine = getMainLine(moveTree);
    onPositionSave(setupFen, mainLine, preloadedMove || undefined, moveTree);
    toast.success('Puzzle position and solution saved!');
  };

  // Get current board for display (either setup board or solution game board)
  const getCurrentBoard = (): (PieceType | null)[][] => {
    if ((mode === 'solution' || mode === 'preloadedMove') && solutionGame) {
      const gameBoard: (PieceType | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
      for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
          const square = `${FILES[file]}${RANKS[rank]}` as Square;
          const piece = solutionGame.get(square);
          if (piece) {
            const pieceChar = piece.color === 'w' 
              ? piece.type.toUpperCase() 
              : piece.type.toLowerCase();
            gameBoard[rank][file] = pieceChar as PieceType;
          }
        }
      }
      return gameBoard;
    }
    return board;
  };

  // Determine board orientation - flip if black to move (in all modes)
  const shouldFlipBoard = turn === 'b';

  // Get display board with proper orientation
  const getOrientedBoard = (): (PieceType | null)[][] => {
    const currentBoard = getCurrentBoard();
    if (shouldFlipBoard) {
      // Flip the board for black's perspective
      return currentBoard.map(row => [...row].reverse()).reverse();
    }
    return currentBoard;
  };

  const displayBoard = getOrientedBoard();

  return (
    <div className="space-y-4">
      {/* Mode indicator */}
      <div className="flex items-center justify-between">
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          mode === 'setup' 
            ? 'bg-primary/20 text-primary' 
            : mode === 'preloadedMove'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-green-100 text-green-700'
        }`}>
          {mode === 'setup' ? '1. Setup Position' : mode === 'preloadedMove' ? '2. Preloaded Move' : `${enablePreloadedMove ? '3' : '2'}. Record Solution`}
        </div>
        {(mode === 'solution' || mode === 'preloadedMove') && (
          <Button variant="outline" size="sm" onClick={backToSetup}>
            ← Back to Setup
          </Button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left side: Board and Pieces */}
        <div className="flex-1">
          {/* Chess board - Chess.com style */}
          <div className="flex justify-center">
            <div className="inline-block rounded-md overflow-hidden shadow-lg" style={{ border: '3px solid #3d3d3d' }}>
              {displayBoard.map((row, rank) => (
                <div key={rank} className="flex">
                  {row.map((piece, file) => {
                    // Calculate actual board position based on orientation
                    const actualRank = shouldFlipBoard ? 7 - rank : rank;
                    const actualFile = shouldFlipBoard ? 7 - file : file;
                    const isLight = (actualRank + actualFile) % 2 === 0;
                    const square = `${FILES[actualFile]}${RANKS[actualRank]}`;
                    const isSelected = selectedSquare === square;
                    
                    // Chess.com colors
                    let bgColor = isLight ? LIGHT_SQUARE : DARK_SQUARE;
                    if (isSelected) {
                      bgColor = isLight ? SELECTED_LIGHT : SELECTED_DARK;
                    }
                    
                    return (
                      <button
                        key={`${rank}-${file}`}
                        onClick={() => handleSquareClick(actualRank, actualFile)}
                        className="w-9 h-9 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center relative transition-all hover:brightness-110"
                        style={{ backgroundColor: bgColor }}
                      >
                        {piece && (
                          <img 
                            src={PIECE_IMAGES[piece]} 
                            alt={piece} 
                            className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 object-contain pointer-events-none"
                            draggable={false}
                          />
                        )}
                        {/* Move indicator dot (solution and preloaded move modes) */}
                        {(mode === 'solution' || mode === 'preloadedMove') && possibleTargets.includes(square) && !piece && (
                          <span className="absolute w-3 h-3 rounded-full bg-black/70" style={{ opacity: 0.9 }} />
                        )}

                        {/* Capture indicator ring */}
                        {(mode === 'solution' || mode === 'preloadedMove') && possibleTargets.includes(square) && piece && selectedSquare && solutionGame && isCapture(solutionGame, selectedSquare as Square, square as Square) && (
                          <span className="absolute w-8 h-8 rounded-full border-2 border-red-500/80" style={{ boxSizing: 'border-box' }} />
                        )}
                        {/* Coordinate labels */}
                        {actualFile === 0 && (
                          <span 
                            className="absolute top-0.5 left-0.5 text-[10px] font-bold"
                            style={{ color: isLight ? DARK_SQUARE : LIGHT_SQUARE }}
                          >
                            {RANKS[actualRank]}
                          </span>
                        )}
                        {actualRank === 7 && (
                          <span 
                            className="absolute bottom-0 right-0.5 text-[10px] font-bold"
                            style={{ color: isLight ? DARK_SQUARE : LIGHT_SQUARE }}
                          >
                            {FILES[actualFile]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Piece palette - below board, only in setup mode */}
          {mode === 'setup' && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
              
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500 w-14">White:</span>
                <div className="flex gap-1 flex-wrap">
                  {WHITE_PIECES.map(piece => (
                    <button
                      key={piece}
                      onClick={() => { setSelectedPiece(piece); setIsEraseMode(false); }}
                      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg border-2 transition-all flex items-center justify-center ${
                        selectedPiece === piece && !isEraseMode
                          ? 'border-[#81b64c] bg-[#81b64c]/30 scale-110'
                          : 'border-gray-300 hover:border-[#81b64c]/50 bg-white'
                      }`}
                    >
                      <img src={PIECE_IMAGES[piece]} alt={piece} className="w-7 h-7 sm:w-9 sm:h-9 object-contain" />
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Black pieces row */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500 w-14">Black:</span>
                <div className="flex gap-1 flex-wrap">
                  {BLACK_PIECES.map(piece => (
                    <button
                      key={piece}
                      onClick={() => { setSelectedPiece(piece); setIsEraseMode(false); }}
                      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg border-2 transition-all flex items-center justify-center ${
                        selectedPiece === piece && !isEraseMode
                          ? 'border-[#81b64c] bg-[#81b64c]/30 scale-110'
                          : 'border-gray-300 hover:border-[#81b64c]/50 bg-white'
                      }`}
                    >
                      <img src={PIECE_IMAGES[piece]} alt={piece} className="w-7 h-7 sm:w-9 sm:h-9 object-contain" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Eraser and controls */}
              <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                <button
                  onClick={() => { setIsEraseMode(true); setSelectedPiece(null); }}
                  className={`px-3 py-2 rounded-lg border-2 transition-all flex items-center gap-1 text-sm ${
                    isEraseMode
                      ? 'border-red-500 bg-red-500/20 text-red-600'
                      : 'border-gray-300 hover:border-red-400 bg-white text-gray-600'
                  }`}
                >
                  <Trash2 className="w-4 h-4" /> Eraser
                </button>
                <Button variant="outline" size="sm" onClick={clearBoard}>
                  Clear Board
                </Button>
                <Button variant="outline" size="sm" onClick={setupStartingPosition}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Start Position
                </Button>
              </div>

              {/* FEN input for quick position loading */}
              <div className="mt-3 pt-3 border-t">
                <div className="text-xs font-medium text-gray-500 mb-1.5">Load position from FEN</div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Paste FEN string here, e.g. r1br4/1p1n2bk/..."
                    value={fenInput}
                    onChange={(e) => setFenInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') loadFromFen(); }}
                    className="flex-1 text-sm h-9"
                  />
                  <Button variant="secondary" size="sm" onClick={loadFromFen} className="shrink-0">
                    <Upload className="w-4 h-4 mr-1" /> Load FEN
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Only the board layout is loaded. Set turn, castling, and en passant below.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right side: Solution moves panel - show in solution or preloaded move modes */}
        {(mode === 'solution' || mode === 'preloadedMove') && (
          <div className="w-full lg:w-52 space-y-2">
            {mode === 'preloadedMove' ? (
              <>
                <div className="text-sm font-medium text-blue-700">Preloaded Move</div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg min-h-[150px]">
                  {!preloadedMove ? (
                    <p className="text-sm text-blue-600">
                      Make the opponent's move on the board. This will execute automatically for students.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm bg-white px-2 py-1 rounded border-2 border-blue-500">
                        <span className="text-blue-500 font-bold">➤</span>
                        <span className="font-semibold text-gray-800">{preloadedMove}</span>
                      </div>
                      <p className="text-xs text-blue-600 mt-2">
                        ✓ Proceeding to solution recording...
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-700">Solution Tree</div>
                  {branchingFromNodeId && (
                    <button
                      onClick={() => setBranchingFromNodeId(null)}
                      className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Exit branch
                    </button>
                  )}
                </div>

                {/* Branch mode banner */}
                {branchingFromNodeId && (
                  <div className="p-2 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <GitBranch className="w-3 h-3 flex-shrink-0" />
                    <span>
                      Recording alternative to <strong>{moveTree.find(n => n.id === branchingFromNodeId)?.move}</strong>.
                      Play the alternative move on the board.
                    </span>
                  </div>
                )}

                {preloadedMove && (
                  <div
                    onClick={() => {
                      const baseFen = preloadedMoveFen || setupFen;
                      if (!baseFen) return;
                      setSolutionGame(new Chess(baseFen));
                      setCurrentParentId(null);
                      setSelectedSquare(null);
                      setPossibleTargets([]);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                    title="Click to view the position after the preloaded move"
                  >
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide w-6">Pre</span>
                    <span className="text-sm font-semibold text-blue-700 flex-1">{preloadedMove}</span>
                    <span className="text-[10px] text-blue-400 italic">Starting position ↵</span>
                  </div>
                )}

                {/* Move tree display – columns layout */}
                <div className="p-2 bg-gray-50 rounded-lg border min-h-[150px] max-h-72 overflow-auto">
                  {moveTree.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Click on a piece, then click where to move it.
                    </p>
                  ) : (
                    <ColumnTreeDisplay
                      tree={moveTree}
                      currentParentId={currentParentId}
                      isSolverMove={(depth) => depth % 2 === 0}
                      onBranch={branchFromNode}
                      onDelete={deleteNodeSubtree}
                      onNavigate={navigateToNode}
                    />
                  )}
                </div>

                <div className="text-xs text-muted-foreground px-1">
                  Click a move to view that position. Hover a solver move → click <Plus className="w-3 h-3 inline text-blue-500" /> to add an alternative.
                </div>

                {moveTree.length > 0 && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={undoLastMove} className="flex-1">
                      <RotateCcw className="w-4 h-4 mr-1" /> Undo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('Clear all solution moves?')) {
                          setMoveTree([]);
                          setCurrentParentId(null);
                          setBranchingFromNodeId(null);
                          const baseFen = preloadedMoveFen || setupFen;
                          setSolutionGame(new Chess(baseFen));
                        }
                      }}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 pt-3 border-t">
        {mode === 'setup' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Turn:</span>
              <select
                value={turn}
                onChange={(e) => setTurn(e.target.value as 'w' | 'b')}
                className="px-3 py-1.5 text-sm border rounded-lg bg-white"
              >
                <option value="w">White to move</option>
                <option value="b">Black to move</option>
              </select>
            </div>
            
            {/* Preloaded Move Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <Switch 
                id="preloaded-move"
                checked={enablePreloadedMove}
                onCheckedChange={setEnablePreloadedMove}
              />
              <Label htmlFor="preloaded-move" className="text-sm text-blue-700 cursor-pointer">
                Enable Preloaded Move
              </Label>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm text-gray-600">Castling:</div>
              <label className="text-sm">
                <input type="checkbox" checked={castleWhiteK} onChange={(e) => setCastleWhiteK(e.target.checked)} className="mr-1" />K
              </label>
              <label className="text-sm">
                <input type="checkbox" checked={castleWhiteQ} onChange={(e) => setCastleWhiteQ(e.target.checked)} className="mr-1" />Q
              </label>
              <label className="text-sm">
                <input type="checkbox" checked={castleBlackK} onChange={(e) => setCastleBlackK(e.target.checked)} className="mr-1" />k
              </label>
              <label className="text-sm">
                <input type="checkbox" checked={castleBlackQ} onChange={(e) => setCastleBlackQ(e.target.checked)} className="mr-1" />q
              </label>
              <div className="ml-2 text-sm text-gray-600">En-passant:</div>
              <select value={enPassantTarget} onChange={(e) => setEnPassantTarget(e.target.value)} className="px-2 py-1 text-sm border rounded-lg bg-white">
                <option value="-">-</option>
                {['3','6'].flatMap(rank => FILES.map(f => `${f}${rank}`)).map(sq => (
                  <option key={sq} value={sq}>{sq}</option>
                ))}
              </select>
            </div>
            <Button onClick={startRecordingSolution} className="self-end sm:ml-auto">
              <ArrowRight className="w-4 h-4 mr-1" /> 
              {enablePreloadedMove ? 'Next: Preloaded Move' : 'Next: Record Solution'}
            </Button>
          </>
        ) : mode === 'preloadedMove' ? (
          <>
            <div className="text-sm text-blue-700 font-medium">
              Make the opponent's move that will execute automatically
            </div>
            {preloadedMove && (
              <Button
                onClick={() => { setMode('solution'); setMoveTree([]); setCurrentParentId(null); }}
                className="self-end sm:ml-auto"
              >
                <ArrowRight className="w-4 h-4 mr-1" /> Next: Record Solution
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="text-sm text-gray-600">
              Make the correct move(s) on the board
            </div>
            <Button onClick={savePuzzle} className="self-end sm:ml-auto" disabled={moveTree.length === 0}>
              <Save className="w-4 h-4 mr-1" /> Save Position & Solution
            </Button>
          </>
        )}
      </div>
      <PromotionDialog 
        open={showPromotionDialog} 
        onOpenChange={setShowPromotionDialog} 
        onSelect={handlePromotionSelect}
        color={(pendingPromotion && solutionGame?.get(pendingPromotion.from as Square)?.color) as 'w' | 'b' | undefined}
      />
    </div>
  );
};

export default VisualBoardEditor;
