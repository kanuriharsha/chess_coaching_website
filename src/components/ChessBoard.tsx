import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Chess, Square, Move } from 'chess.js';
import {
  getSquareColor,
  coordsToSquare,
  getLegalMoves,
  isCapture,
} from '@/lib/chess';
import { useChessSound } from '@/hooks/useChessSound';

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
  const [dragState, setDragState] = useState<{
    pointerId: number;
    from: Square;
    x: number;
    y: number;
    hasMoved: boolean;
  } | null>(null);
  const suppressNextClick = useRef(false);
  const { playSound } = useChessSound();

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

      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }

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

  const handlePointerDown = useCallback((event: React.PointerEvent, square: Square) => {
    if (!interactive || !onMove || event.button !== 0) return;

    const piece = game.get(square);
    if (!piece || piece.color !== game.turn()) return;

    setInternalSelectedSquare(square);
    setPossibleMoves(getLegalMoves(game, square));
    setDragState({
      pointerId: event.pointerId,
      from: square,
      x: event.clientX,
      y: event.clientY,
      hasMoved: false,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [game, interactive, onMove]);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const moved = dragState.hasMoved ||
      Math.hypot(event.clientX - dragState.x, event.clientY - dragState.y) >= 4;

    setDragState({
      ...dragState,
      x: event.clientX,
      y: event.clientY,
      hasMoved: moved,
    });
    event.preventDefault();
  }, [dragState]);

  const finishPointerDrag = useCallback((event: React.PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    if (dragState.hasMoved) {
      suppressNextClick.current = true;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const targetSquare = target?.closest<HTMLElement>('[data-chess-square]')?.dataset.chessSquare as Square | undefined;
      const isLegalTarget = targetSquare && possibleMoves.some(move => move.to === targetSquare);
      const moveSucceeded = isLegalTarget
        ? onMove?.(dragState.from, targetSquare)
        : false;

      if (!isLegalTarget) {
        playSound('illegal');
      }

      if (moveSucceeded) {
        setInternalSelectedSquare(null);
        setPossibleMoves([]);
      }
    }

    setDragState(null);
    event.preventDefault();
  }, [dragState, onMove, playSound, possibleMoves]);

  const handlePointerCancel = useCallback((event: React.PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    setDragState(null);
  }, [dragState]);

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
      <div className="flex flex-col items-center gap-1">
        {/* Top label - subtle and small */}
        <div className="text-[0.65rem] font-normal text-muted-foreground opacity-50">
          {orientation === 'white' ? 'Black' : 'White'}
        </div>
        
        <div
          className="relative aspect-square w-full max-w-[min(100vw-2rem,500px)] mx-auto select-none"
          style={{ touchAction: interactive && onMove ? 'none' : undefined }}
        >
          {board.map((row, rowIndex) => (
          <div key={rowIndex} className="flex" style={{ touchAction: interactive && onMove ? 'none' : undefined }}>
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
                  data-chess-square={square}
                  className={`
                    relative flex items-center justify-center
                    w-[12.5%] aspect-square cursor-pointer
                    ${squareColorClass} ${additionalClass}
                    transition-colors duration-100
                  `}
                  onClick={() => handleSquareClick(square)}
                  onPointerDown={(event) => handlePointerDown(event, square)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishPointerDrag}
                  onPointerCancel={handlePointerCancel}
                >
                  {/* Piece */}
                  {piece && (
                    <img
                      src={PIECE_IMAGES[piece.color][piece.type]}
                      alt={`${piece.color}${piece.type}`}
                      className={`
                        w-[80%] h-[80%] object-contain select-none pointer-events-none
                        ${selectedSquare === square && !dragState ? 'animate-piece-move' : ''}
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

        {dragState?.hasMoved && game.get(dragState.from) && (
          <img
            src={PIECE_IMAGES[game.get(dragState.from)!.color][game.get(dragState.from)!.type]}
            alt=""
            aria-hidden="true"
            className="pointer-events-none fixed z-50 h-[clamp(2.5rem,10vw,5rem)] w-[clamp(2.5rem,10vw,5rem)] -translate-x-1/2 -translate-y-1/2 object-contain select-none"
            style={{ left: dragState.x, top: dragState.y }}
          />
        )}
        
        {/* Bottom label - subtle and small */}
        <div className="text-[0.65rem] font-normal text-muted-foreground opacity-50">
          {orientation === 'white' ? 'White' : 'Black'}
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;
