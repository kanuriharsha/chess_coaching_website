import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Chess, Square, Move } from 'chess.js';
import {
  getSquareColor,
  coordsToSquare,
  getLegalMoves,
  isCapture,
} from '@/lib/chess';

// Chess.com style piece images
const PIECE_IMAGES: { [color: string]: { [piece: string]: string } } = {
  w: {
    k: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wk.png',
    q: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wq.png',
    r: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wr.png',
    b: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wb.png',
    n: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wn.png',
    p: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wp.png',
  },
  b: {
    k: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bk.png',
    q: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bq.png',
    r: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/br.png',
    b: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bb.png',
    n: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bn.png',
    p: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bp.png',
  },
};

interface ChessBoardProps {
  game: Chess;
  onMove?: (from: Square, to: Square) => boolean;
  orientation?: 'white' | 'black';
  interactive?: boolean;
  lastMove?: { from: Square; to: Square } | null;
  highlightSquares?: Square[];
  onSquareClick?: (square: string) => void;
  selectedSquare?: string | null;
}

const ChessBoard: React.FC<ChessBoardProps> = ({
  game,
  onMove,
  orientation = 'white',
  interactive = true,
  lastMove = null,
  highlightSquares = [],
  onSquareClick,
  selectedSquare: externalSelectedSquare,
}) => {
  const [internalSelectedSquare, setInternalSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Move[]>([]);

  // Use external selected square if provided, otherwise use internal state
  const selectedSquare = externalSelectedSquare !== undefined ? externalSelectedSquare : internalSelectedSquare;

  const board = useMemo(() => {
    const rows = [];
    for (let row = 0; row < 8; row++) {
      const cols = [];
      for (let col = 0; col < 8; col++) {
        const actualRow = orientation === 'white' ? row : 7 - row;
        const actualCol = orientation === 'white' ? col : 7 - col;
        const square = coordsToSquare(actualRow, actualCol);
        const piece = game.get(square);
        cols.push({ square, piece, row: actualRow, col: actualCol });
      }
      rows.push(cols);
    }
    return rows;
  }, [game, orientation]);

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!interactive) return;

      // If external onSquareClick is provided, use it instead
      if (onSquareClick) {
        onSquareClick(square);
        return;
      }

      const piece = game.get(square);

      // If we have a selected piece and click on a possible move
      if (selectedSquare) {
        const isValidMove = possibleMoves.some((m) => m.to === square);

        if (isValidMove && onMove) {
          const success = onMove(selectedSquare as Square, square);
          if (success) {
            setInternalSelectedSquare(null);
            setPossibleMoves([]);
            return;
          }
        }

        // Clicking on own piece - select it instead
        if (piece && piece.color === game.turn()) {
          setInternalSelectedSquare(square);
          setPossibleMoves(getLegalMoves(game, square));
          return;
        }

        // Clicking elsewhere - deselect
        setInternalSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }

      // Select a piece
      if (piece && piece.color === game.turn()) {
        setInternalSelectedSquare(square);
        setPossibleMoves(getLegalMoves(game, square));
      }
    },
    [game, interactive, selectedSquare, possibleMoves, onMove, onSquareClick]
  );

  // If an external selected square is provided, compute its possible moves
  useEffect(() => {
    if (selectedSquare) {
      setPossibleMoves(getLegalMoves(game, selectedSquare as Square));
    } else {
      setPossibleMoves([]);
    }
  }, [game, selectedSquare]);

  const isSelected = (square: Square) => selectedSquare === square;
  const isLastMove = (square: Square) =>
    lastMove && (lastMove.from === square || lastMove.to === square);
  const isPossibleMove = (square: Square) =>
    possibleMoves.some((m) => m.to === square);
  const isPossibleCapture = (square: Square) => {
    if (!selectedSquare) return false;
    return (
      isPossibleMove(square) && isCapture(game, selectedSquare as Square, square)
    );
  };
  const isHighlighted = (square: Square) => highlightSquares.includes(square);

  return (
    <div className="chess-board-container">
      <div className="flex items-center gap-3">
        {/* Black label on left (top for white, bottom for black) */}
        <div className="text-sm font-bold text-gray-600 writing-mode-vertical-rl rotate-180">
          {orientation === 'white' ? 'Black' : 'White'}
        </div>
        
        <div className="relative aspect-square w-full max-w-[min(100vw-2rem,500px)] mx-auto">
          {board.map((row, rowIndex) => (
          <div key={rowIndex} className="flex">
            {row.map(({ square, piece, row: actualRow, col: actualCol }) => {
              const squareColorClass =
                getSquareColor(actualRow, actualCol) === 'light'
                  ? 'chess-square-light'
                  : 'chess-square-dark';

              let additionalClass = '';
              if (isSelected(square)) {
                additionalClass = 'chess-square-selected';
              } else if (isLastMove(square)) {
                additionalClass = 'chess-square-last-move';
              } else if (isHighlighted(square)) {
                additionalClass = 'chess-square-highlight';
              }

              return (
                <div
                  key={square}
                  className={`
                    relative flex items-center justify-center
                    w-[12.5%] aspect-square cursor-pointer
                    ${squareColorClass} ${additionalClass}
                    transition-colors duration-100
                  `}
                  onClick={() => handleSquareClick(square)}
                >
                  {/* Piece */}
                  {piece && (
                    <img
                      src={PIECE_IMAGES[piece.color][piece.type]}
                      alt={`${piece.color}${piece.type}`}
                      className={`
                        w-[80%] h-[80%] object-contain select-none pointer-events-none
                        ${selectedSquare === square ? 'animate-piece-move' : ''}
                      `}
                      style={{
                        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
                      }}
                      draggable={false}
                    />
                  )}

                  {/* Move indicator dot */}
                  {isPossibleMove(square) && !piece && !isPossibleCapture(square) && (
                    <div className="move-dot" />
                  )}

                  {/* Capture indicator ring */}
                  {isPossibleCapture(square) && (
                    <div className="capture-ring" />
                  )}

                  {/* Rank labels (left side) */}
                  {actualCol === 0 && (
                    <span
                      className={`
                        absolute top-1 left-1 text-[0.65rem] font-medium
                        ${getSquareColor(actualRow, actualCol) === 'light' ? 'text-board-dark' : 'text-board-light'}
                        opacity-70
                      `}
                    >
                      {8 - actualRow}
                    </span>
                  )}

                  {/* File labels (bottom) */}
                  {actualRow === 7 && (
                    <span
                      className={`
                        absolute bottom-0.5 right-1 text-[0.65rem] font-medium
                        ${getSquareColor(actualRow, actualCol) === 'light' ? 'text-board-dark' : 'text-board-light'}
                        opacity-70
                      `}
                    >
                      {String.fromCharCode('a'.charCodeAt(0) + actualCol)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        </div>
        
        {/* White label on right (bottom for white, top for black) */}
        <div className="text-sm font-bold text-gray-600 writing-mode-vertical-rl">
          {orientation === 'white' ? 'White' : 'Black'}
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;
