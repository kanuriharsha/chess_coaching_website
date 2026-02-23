import React, { useState, useCallback } from 'react';
import { Chess, Square } from 'chess.js';
import { getPossibleSquares, isCapture, isPromotionMove } from '@/lib/chess';
import PromotionDialog from './PromotionDialog';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { RotateCcw, Trash2, Play, Save, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface VisualBoardEditorProps {
  onPositionSave: (fen: string, solution: string[], preloadedMove?: string) => void;
  initialFen?: string;
  initialSolution?: string[];
  initialMode?: 'setup' | 'solution';
  initialPreloadedMove?: string;
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

const VisualBoardEditor: React.FC<VisualBoardEditorProps> = ({ onPositionSave, initialFen, initialSolution, initialMode, initialPreloadedMove }) => {
  // Board state: 8x8 array of pieces (null = empty)
  const [board, setBoard] = useState<(PieceType | null)[][]>(() => {
    const emptyBoard: (PieceType | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
    return emptyBoard;
  });
  
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>(null);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  // Castling rights and en passant target for FEN
  const [castleWhiteK, setCastleWhiteK] = useState(false);
  const [castleWhiteQ, setCastleWhiteQ] = useState(false);
  const [castleBlackK, setCastleBlackK] = useState(false);
  const [castleBlackQ, setCastleBlackQ] = useState(false);
  const [enPassantTarget, setEnPassantTarget] = useState<string>('-');
  
  // Solution recording state
  const [mode, setMode] = useState<'setup' | 'preloadedMove' | 'solution'>('setup');
  const [setupFen, setSetupFen] = useState<string>('');
  const [solutionGame, setSolutionGame] = useState<Chess | null>(null);
  const [solutionMoves, setSolutionMoves] = useState<string[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleTargets, setPossibleTargets] = useState<string[]>([]);
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<null | { from: string; to: string; gameCopy: Chess }>(null);
  
  // Preloaded move state
  const [enablePreloadedMove, setEnablePreloadedMove] = useState(false);
  const [preloadedMove, setPreloadedMove] = useState<string>('');
  const [preloadedMoveFen, setPreloadedMoveFen] = useState<string>(''); // FEN after preloaded move

  // Load initial FEN and solution if provided (for editing existing puzzles)
  React.useEffect(() => {
    if (initialFen) {
      try {
        const startGame = new Chess(initialFen);
        // populate board array from FEN
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

        // castling rights from FEN
        const fenParts = initialFen.split(' ');
        const castling = fenParts[2] || '-';
        setCastleWhiteK(castling.includes('K'));
        setCastleWhiteQ(castling.includes('Q'));
        setCastleBlackK(castling.includes('k'));
        setCastleBlackQ(castling.includes('q'));

        const ep = fenParts[3] || '-';
        setEnPassantTarget(ep);

        setSetupFen(initialFen);

        // Check if initial preloaded move is provided
        if (initialPreloadedMove && initialPreloadedMove.trim()) {
          setEnablePreloadedMove(true);
          setPreloadedMove(initialPreloadedMove);
        }

        // If an initial solution is provided, apply it
        if (initialSolution && initialSolution.length > 0) {
          const g = new Chess(initialFen);
          const moves: string[] = [];
          for (const san of initialSolution) {
            try {
              const mv = g.move(san);
              if (mv) moves.push(mv.san);
            } catch (e) {
              // ignore invalid SAN while loading
            }
          }
          setSolutionMoves(moves);
          setSolutionGame(new Chess(g.fen()));
          if (initialMode === 'solution' || moves.length > 0) setMode('solution');
        }
      } catch (e) {
        // ignore invalid fen
      }
    }
  }, [initialFen, initialSolution, initialMode, initialPreloadedMove]);

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
                setSolutionMoves([]); // Reset solution moves for the new position
              }, 500);
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
      // Handle move in solution mode
      const square = `${FILES[file]}${RANKS[rank]}` as Square;
      
      if (selectedSquare) {
        // Try to make move
        try {
          const gameCopy = new Chess(solutionGame.fen());
          const moveVerbose = gameCopy.moves({ square: selectedSquare as Square, verbose: true }).find(m => m.to === square);
          if (moveVerbose && moveVerbose.promotion) {
            setPendingPromotion({ from: selectedSquare as string, to: square, gameCopy });
            setShowPromotionDialog(true);
          } else {
            const move = solutionGame.move({ from: selectedSquare as Square, to: square });
            if (move) {
              setSolutionMoves(prev => [...prev, move.san]);
              setSolutionGame(new Chess(solutionGame.fen()));
              toast.success(`Move recorded: ${move.san}`);
              if (solutionGame.isCheckmate()) {
                toast.success('Checkmate! Great puzzle!');
              }
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
            setSolutionMoves([]);
          }, 500);
        } else {
          // Recording solution move
          setSolutionMoves(prev => [...prev, mv.san]);
          setSolutionGame(new Chess(gameCopy.fen()));
          toast.success(`Move recorded: ${mv.san}`);
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
    setSolutionMoves([]);
    setSolutionGame(null);
    setSetupFen('');
    setSelectedSquare(null);
    setEnablePreloadedMove(false);
    setPreloadedMove('');
    setPreloadedMoveFen('');
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
        // The preloaded move should be made by the OPPOSITE color of who's solving
        // If puzzle is "White to move", preloaded move is Black's move
        // So we need to flip the turn temporarily
        const preloadedTurn = turn === 'w' ? 'b' : 'w';
        
        // Create FEN with flipped turn for preloaded move
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
        // Go directly to solution mode (no preloaded move)
        setSolutionGame(game);
        setSolutionMoves([]);
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

  // Undo last solution move
  const undoSolutionMove = () => {
    if (solutionGame && solutionMoves.length > 0) {
      solutionGame.undo();
      setSolutionGame(new Chess(solutionGame.fen()));
      setSolutionMoves(prev => prev.slice(0, -1));
      setSelectedSquare(null);
      setPossibleTargets([]);
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
    if (solutionMoves.length === 0) {
      toast.error('Please record at least one solution move');
      return;
    }
    // Pass preloaded move (if any) to the callback
    onPositionSave(setupFen, solutionMoves, preloadedMove || undefined);
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
                        className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center relative transition-all hover:brightness-110"
                        style={{ backgroundColor: bgColor }}
                      >
                        {piece && (
                          <img 
                            src={PIECE_IMAGES[piece]} 
                            alt={piece} 
                            className="w-10 h-10 sm:w-12 sm:h-12 object-contain pointer-events-none"
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
                      className={`w-11 h-11 rounded-lg border-2 transition-all flex items-center justify-center ${
                        selectedPiece === piece && !isEraseMode
                          ? 'border-[#81b64c] bg-[#81b64c]/30 scale-110'
                          : 'border-gray-300 hover:border-[#81b64c]/50 bg-white'
                      }`}
                    >
                      <img src={PIECE_IMAGES[piece]} alt={piece} className="w-9 h-9 object-contain" />
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
                      className={`w-11 h-11 rounded-lg border-2 transition-all flex items-center justify-center ${
                        selectedPiece === piece && !isEraseMode
                          ? 'border-[#81b64c] bg-[#81b64c]/30 scale-110'
                          : 'border-gray-300 hover:border-[#81b64c]/50 bg-white'
                      }`}
                    >
                      <img src={PIECE_IMAGES[piece]} alt={piece} className="w-9 h-9 object-contain" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Eraser and controls */}
              <div className="flex items-center gap-2 pt-2 border-t">
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
            </div>
          )}
        </div>

        {/* Right side: Solution moves panel - show in solution or preloaded move modes */}
        {(mode === 'solution' || mode === 'preloadedMove') && (
          <div className="w-full lg:w-48 space-y-2">
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
                <div className="text-sm font-medium text-gray-700">Solution Moves</div>
                <div className="p-3 bg-gray-50 rounded-lg border min-h-[150px]">
                  {preloadedMove && (
                    <div className="mb-2 pb-2 border-b border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Preloaded:</div>
                      <div className="flex items-center gap-2 text-sm bg-blue-50 px-2 py-1 rounded">
                        <span className="text-blue-500 font-bold">0.</span>
                        <span className="font-semibold text-blue-700">{preloadedMove}</span>
                      </div>
                    </div>
                  )}
                  {solutionMoves.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Click on a piece, then click where to move it.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {solutionMoves.map((move, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-white px-2 py-1 rounded">
                          <span className="text-gray-400 font-medium">{i + 1}.</span>
                          <span className="font-semibold text-gray-800">{move}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {solutionMoves.length > 0 && (
                  <Button variant="outline" size="sm" onClick={undoSolutionMove} className="w-full">
                    <RotateCcw className="w-4 h-4 mr-1" /> Undo Last Move
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center gap-2 pt-3 border-t flex-wrap">
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
            
            <div className="flex items-center gap-3">
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
            <Button onClick={startRecordingSolution} className="ml-auto">
              <ArrowRight className="w-4 h-4 mr-1" /> 
              {enablePreloadedMove ? 'Next: Record Preloaded Move' : 'Next: Record Solution'}
            </Button>
          </>
        ) : mode === 'preloadedMove' ? (
          <>
            <div className="text-sm text-blue-700 font-medium">
              Make the opponent's move that will execute automatically
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-gray-600">
              Make the correct move(s) on the board
            </div>
            <Button onClick={savePuzzle} className="ml-auto" disabled={solutionMoves.length === 0}>
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
