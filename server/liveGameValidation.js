import { Chess } from 'chess.js';

export function applyAuthoritativeMove(game, userId, requestedMove) {
  if (!game || game.status !== 'active') return { error: 'Game not found or not active' };

  const color = String(game.white.id) === String(userId)
    ? 'w'
    : String(game.black.id) === String(userId)
      ? 'b'
      : null;
  if (!color) return { error: 'You are not a player in this game' };

  let chess;
  try {
    chess = new Chess(game.fen);
  } catch {
    return { error: 'Invalid server game position' };
  }
  if (chess.turn() !== color) return { error: 'Not your turn' };

  let move;
  try {
    move = chess.move({
      from: requestedMove?.from,
      to: requestedMove?.to,
      ...(requestedMove?.promotion ? { promotion: requestedMove.promotion } : {})
    });
  } catch {
    return { error: 'Illegal move' };
  }
  if (!move) return { error: 'Illegal move' };

  const coordinateMove = `${move.from}${move.to}${move.promotion || ''}`;
  game.moves.push(coordinateMove);
  game.fen = chess.fen();
  game.turn = chess.turn();
  game.lastMoveAt = new Date().toISOString();

  return {
    move: coordinateMove,
    san: move.san,
    fen: game.fen,
    turn: game.turn,
    checkmate: chess.isCheckmate(),
    stalemate: chess.isStalemate()
  };
}

export function getVerifiedGameOutcome(game, userId, outcomeType) {
  if (!game || game.status !== 'active') return { error: 'Game not found or not active' };
  if (![game.white.id, game.black.id].some(id => String(id) === String(userId))) {
    return { error: 'You are not a player in this game' };
  }

  let chess;
  try {
    chess = new Chess(game.fen);
  } catch {
    return { error: 'Invalid server game position' };
  }

  if (outcomeType === 'checkmate' && chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' };
  }
  if (outcomeType === 'stalemate' && chess.isStalemate()) {
    return { result: 'draw', reason: 'stalemate' };
  }
  return { error: `Position is not ${outcomeType}` };
}
