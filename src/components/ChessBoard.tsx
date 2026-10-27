import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
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
  suppressIllegalSound?: boolean;
  annotationsEnabled?: boolean;
  pieceDraggingEnabled?: boolean;
  selectableColor?: 'w' | 'b';
  annotationKey?: string;
  pieceSelectionEnabled?: boolean;
  onSquareTap?: (square: Square) => boolean;
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
  suppressIllegalSound = false,
  annotationsEnabled = false,
  pieceDraggingEnabled = true,
  selectableColor,
  annotationKey,
  pieceSelectionEnabled = true,
  onSquareTap,
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
  const annotationStart = useRef<Square | null>(null);
  const [annotations, setAnnotations] = useState<Array<{ from: Square; to: Square | null }>>([]);
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

  useLayoutEffect(() => {
    setAnnotations([]);
    setInternalSelectedSquare(null);
    setPossibleMoves([]);
    setDragState(null);
  }, [game, annotationKey, annotationsEnabled]);

  const canSelectPiece = useCallback((square: Square) => {
    const piece = game.get(square);
    return !!piece && piece.color === game.turn() &&
      (selectableColor === undefined || piece.color === selectableColor);
  }, [game, selectableColor]);

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!interactive) return;

      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }

      if (onSquareTap?.(square)) return;
      if (!pieceSelectionEnabled) return;

      // If external onSquareClick is provided, use it instead
      if (onSquareClick) {
        onSquareClick(square);
        return;
      }

      const piece = game.get(square);

      if (selectedSquare && !canSelectPiece(selectedSquare as Square)) {
        setInternalSelectedSquare(null);
        setPossibleMoves([]);
      }

      if (selectedSquare === square) {
        setInternalSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }

      // If we have a selected piece and click on a possible move
      if (selectedSquare && canSelectPiece(selectedSquare as Square)) {
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
        if (canSelectPiece(square)) {
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
      if (canSelectPiece(square)) {
        setInternalSelectedSquare(square);
        setPossibleMoves(getLegalMoves(game, square));
      }
    },
    [game, interactive, pieceSelectionEnabled, selectedSquare, possibleMoves, onMove, onSquareClick, onSquareTap, canSelectPiece]
  );

  const handlePointerDown = useCallback((event: React.PointerEvent, square: Square) => {
    if (!pieceDraggingEnabled || annotationsEnabled) return;
    if (!interactive || !pieceSelectionEnabled || !onMove || event.button !== 0) return;

    if (!canSelectPiece(square)) return;

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
  }, [annotationsEnabled, canSelectPiece, game, interactive, onMove, pieceDraggingEnabled, pieceSelectionEnabled]);

  const toggleAnnotation = useCallback((from: Square, to: Square | null) => {
    setAnnotations(current => {
      const index = current.findIndex(annotation => annotation.from === from && annotation.to === to);
      if (index >= 0) return current.filter((_, annotationIndex) => annotationIndex !== index);
      return [...current, { from, to }];
    });
  }, []);

  const handleAnnotationMouseDown = (event: React.MouseEvent<HTMLDivElement>, square: Square) => {
    if (!annotationsEnabled || event.button !== 0) return;
    annotationStart.current = square;
  };

  const handleAnnotationMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!annotationsEnabled || event.button !== 0 || !annotationStart.current) return;
    const from = annotationStart.current;
    annotationStart.current = null;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-chess-square]')?.dataset.chessSquare as Square | undefined
      : undefined;
    if (!target || target === from) return;
    suppressNextClick.current = true;
    window.setTimeout(() => {
      suppressNextClick.current = false;
    }, 0);
    toggleAnnotation(from, target);
  };

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
      window.setTimeout(() => {
        suppressNextClick.current = false;
      }, 0);
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const targetSquare = target?.closest<HTMLElement>('[data-chess-square]')?.dataset.chessSquare as Square | undefined;
      const isLegalTarget = targetSquare && possibleMoves.some(move => move.to === targetSquare);
      const moveSucceeded = isLegalTarget
        ? onMove?.(dragState.from, targetSquare)
        : false;

      if (!isLegalTarget && !suppressIllegalSound) {
        playSound('illegal');
      }

      if (moveSucceeded) {
        setInternalSelectedSquare(null);
        setPossibleMoves([]);
      }
    }

    setDragState(null);
    event.preventDefault();
  }, [dragState, onMove, playSound, possibleMoves, suppressIllegalSound]);

  const handlePointerCancel = useCallback((event: React.PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    setDragState(null);
  }, [dragState]);

  // If an external selected square is provided, compute its possible moves
  useEffect(() => {
    if (selectedSquare && canSelectPiece(selectedSquare as Square)) {
      setPossibleMoves(getLegalMoves(game, selectedSquare as Square));
    } else {
      setPossibleMoves([]);
      if (externalSelectedSquare === undefined) {
        setInternalSelectedSquare(null);
      }
    }
  }, [game, selectedSquare, canSelectPiece, externalSelectedSquare]);

  const isSelected = (square: Square) => selectedSquare === square;
  const isLastMove = (square: Square) =>
    lastMove && (lastMove.from === square || lastMove.to === square);
  const isPossibleMove = (square: Square) =>
    pieceSelectionEnabled && !!selectedSquare && possibleMoves.some((m) => m.to === square);
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
          onMouseUp={handleAnnotationMouseUp}
          onDragStart={annotationsEnabled ? event => event.preventDefault() : undefined}
          onContextMenu={annotationsEnabled ? event => event.preventDefault() : undefined}
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
                  onDoubleClick={(event) => {
                    if (!annotationsEnabled || event.button !== 0) return;
                    event.preventDefault();
                    toggleAnnotation(square, null);
                  }}
                  onMouseDown={(event) => handleAnnotationMouseDown(event, square)}
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
        {annotations.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            viewBox="0 0 8 8"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker id="puzzle-annotation-arrowhead" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto">
                <path d="M0,0 L4,2 L0,4 Z" fill="#16a34a" />
              </marker>
            </defs>
            {annotations.map(({ from, to }, index) => {
              const fromFile = orientation === 'white' ? from.charCodeAt(0) - 97 : 7 - (from.charCodeAt(0) - 97);
              const fromRank = orientation === 'white' ? 8 - Number(from[1]) : Number(from[1]) - 1;
              if (!to) {
                return (
                  <circle
                    key={`puzzle-annotation-circle-${from}-${index}`}
                    cx={fromFile + 0.5}
                    cy={fromRank + 0.5}
                    r="0.39"
                    fill="none"
                    stroke="#16a34a"
                    strokeOpacity="0.8"
                    strokeWidth="0.08"
                  />
                );
              }
              const toFile = orientation === 'white' ? to.charCodeAt(0) - 97 : 7 - (to.charCodeAt(0) - 97);
              const toRank = orientation === 'white' ? 8 - Number(to[1]) : Number(to[1]) - 1;
              return (
                <line
                  key={`puzzle-annotation-arrow-${from}-${to}-${index}`}
                  x1={fromFile + 0.5}
                  y1={fromRank + 0.5}
                  x2={toFile + 0.5}
                  y2={toRank + 0.5}
                  stroke="#16a34a"
                  strokeWidth="0.12"
                  strokeLinecap="round"
                  markerEnd="url(#puzzle-annotation-arrowhead)"
                />
              );
            })}
          </svg>
        )}
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
