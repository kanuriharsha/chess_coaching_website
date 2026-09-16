import { Chess, Square, Move, PieceSymbol, Color } from 'chess.js';

// Chess piece Unicode symbols
export const PIECE_SYMBOLS: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    k: '♔',
    q: '♕',
    r: '♖',
    b: '♗',
    n: '♘',
    p: '♙',
  },
  b: {
    k: '♚',
    q: '♛',
    r: '♜',
    b: '♝',
    n: '♞',
    p: '♟',
  },
};

// Get legal moves for a piece at a square
export function getLegalMoves(game: Chess, square: Square): Move[] {
  return game.moves({ square, verbose: true });
}

// Check if a move is a capture
export function isCapture(game: Chess, from: Square, to: Square): boolean {
  const moves = getLegalMoves(game, from);
  const move = moves.find((m) => m.to === to);
  return move?.captured !== undefined;
}

// Convert square notation to coordinates
export function squareToCoords(square: Square): { row: number; col: number } {
  const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = 8 - parseInt(square[1]);
  return { row, col };
}

// Convert coordinates to square notation
export function coordsToSquare(row: number, col: number): Square {
  const file = String.fromCharCode('a'.charCodeAt(0) + col);
  const rank = (8 - row).toString();
  return (file + rank) as Square;
}

// Get square color
export function getSquareColor(row: number, col: number): 'light' | 'dark' {
  return (row + col) % 2 === 0 ? 'light' : 'dark';
}

// Parse FEN to get piece at position
export function getPieceAtSquare(
  game: Chess,
  square: Square
): { type: PieceSymbol; color: Color } | null {
  return game.get(square);
}

// Create a new game instance
export function createGame(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess();
}

// Validate a move
export function validateMove(
  game: Chess,
  from: Square,
  to: Square
): Move | null {
  try {
    // Look up legal moves from the square and match target
    const moves = game.moves({ square: from, verbose: true });
    const m = moves.find((mv) => mv.to === to);
    return m || null;
  } catch {
    return null;
  }
}

// Make a move on the board
export function makeMove(
  game: Chess,
  from: Square,
  to: Square,
  promotion?: PieceSymbol
): Move | null {
  try {
    // Check if the move is one of the legal moves and whether it requires promotion
    const moves = game.moves({ square: from, verbose: true });
    const target = moves.find((mv) => mv.to === to);
    if (!target) return null;
    if (target.promotion && !promotion) {
      // Promotion required but not provided
      return null;
    }
    const mv = game.move({ from, to, promotion: promotion });
    return mv;
  } catch {
    return null;
  }
}

// Get all possible target squares for a piece
export function getPossibleSquares(game: Chess, square: Square): Square[] {
  const moves = getLegalMoves(game, square);
  return moves.map((m) => m.to);
}

// Return true if a move from->to would require promotion
export function isPromotionMove(game: Chess, from: Square, to: Square): boolean {
  const moves = game.moves({ square: from, verbose: true });
  const mv = moves.find(m => m.to === to);
  return !!(mv && mv.promotion);
}

// Check game status
export function getGameStatus(game: Chess): {
  isOver: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  turn: Color;
} {
  return {
    isOver: game.isGameOver(),
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isDraw: game.isDraw(),
    turn: game.turn(),
  };
}

// Puzzle starting positions (sample)
export const PUZZLE_POSITIONS = {
  mateIn1: [
    { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['Qxf7'] },
    { fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', solution: ['Re8'] },
    { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['Qxf7'] },
  ],
  mateIn2: [
    { fen: '2r3k1/p4ppp/8/8/8/1B6/P4PPP/6K1 w - - 0 1', solution: ['Bd5+', 'Kf8', 'Bxc8'] },
  ],
  pins: [
    { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', solution: ['Bb5'] },
  ],
  forks: [
    { fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', solution: ['Nxe4'] },
  ],
};
