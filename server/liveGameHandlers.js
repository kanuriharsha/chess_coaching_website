import { applyAuthoritativeMove, getVerifiedGameOutcome } from './liveGameValidation.js';

export function registerLiveGameValidationHandlers(socket, { userId, activeGames, userSockets, io, endGame }) {
  socket.on('game:make-move', data => {
    const game = activeGames.get(data?.gameId);
    const moveResult = applyAuthoritativeMove(game, userId, data);
    if (moveResult.error) {
      socket.emit('error', { message: moveResult.error });
      return;
    }

    const isWhite = String(game.white.id) === String(userId);
    const opponentId = isWhite ? game.black.id : game.white.id;
    const moveData = {
      gameId: game.id,
      move: moveResult.move,
      san: moveResult.san,
      fen: game.fen,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      turn: game.turn
    };

    socket.emit('game:move', moveData);
    const opponentSockets = userSockets.get(opponentId);
    if (opponentSockets) {
      opponentSockets.forEach(socketId => io.to(socketId).emit('game:move', moveData));
    }

    if (moveResult.checkmate) {
      endGame(game.id, game.turn === 'w' ? 'black' : 'white', 'checkmate');
    } else if (moveResult.stalemate) {
      endGame(game.id, 'draw', 'stalemate');
    }
  });

  socket.on('game:checkmate', data => {
    const game = activeGames.get(data?.gameId);
    if (!game || game.status !== 'active') return;
    const outcome = getVerifiedGameOutcome(game, userId, 'checkmate');
    if (outcome.error) {
      socket.emit('error', { message: outcome.error });
      return;
    }
    endGame(game.id, outcome.result, outcome.reason);
  });

  socket.on('game:stalemate', data => {
    const game = activeGames.get(data?.gameId);
    if (!game || game.status !== 'active') return;
    const outcome = getVerifiedGameOutcome(game, userId, 'stalemate');
    if (outcome.error) {
      socket.emit('error', { message: outcome.error });
      return;
    }
    endGame(game.id, outcome.result, outcome.reason);
  });
}
