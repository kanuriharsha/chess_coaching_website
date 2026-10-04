import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAuthoritativeMove, getVerifiedGameOutcome } from '../liveGameValidation.js';
import { registerLiveGameValidationHandlers } from '../liveGameHandlers.js';

const createGame = (fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') => ({
  id: 'game-1',
  white: { id: 'white-user' },
  black: { id: 'black-user' },
  fen,
  moves: [],
  turn: 'w',
  whiteTime: 600,
  blackTime: 600,
  status: 'active'
});

function createSocketHarness(game, userId = 'white-user') {
  const handlers = new Map();
  const emitted = [];
  const broadcasts = [];
  const endedGames = [];
  const socket = {
    on: (event, handler) => handlers.set(event, handler),
    emit: (event, data) => emitted.push({ event, data })
  };
  const userSockets = new Map([['black-user', ['black-socket']]]);

  registerLiveGameValidationHandlers(socket, {
    userId,
    activeGames: new Map([[game.id, game]]),
    userSockets,
    io: { to: socketId => ({ emit: (event, data) => broadcasts.push({ socketId, event, data }) }) },
    endGame: (...args) => endedGames.push(args)
  });

  return { handlers, emitted, broadcasts, endedGames };
}

test('accepts a legal move and derives the resulting position on the server', () => {
  const game = createGame();
  const result = applyAuthoritativeMove(game, 'white-user', {
    from: 'e2',
    to: 'e4',
    fen: '8/8/8/8/8/8/8/8 b - - 0 1'
  });

  assert.equal(result.move, 'e2e4');
  assert.equal(result.turn, 'b');
  assert.equal(result.fen, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  assert.equal(game.fen, result.fen);
});

test('rejects illegal moves without changing server state', () => {
  const game = createGame();
  const previousFen = game.fen;
  const result = applyAuthoritativeMove(game, 'white-user', { from: 'e2', to: 'e5' });

  assert.equal(result.error, 'Illegal move');
  assert.equal(game.fen, previousFen);
  assert.deepEqual(game.moves, []);
});

test('rejects a move from the wrong player and an unauthorized socket', () => {
  const game = createGame();
  assert.equal(
    applyAuthoritativeMove(game, 'black-user', { from: 'e7', to: 'e5' }).error,
    'Not your turn'
  );
  assert.equal(
    applyAuthoritativeMove(game, 'intruder', { from: 'e2', to: 'e4' }).error,
    'You are not a player in this game'
  );
});

test('validates and derives checkmate from the authoritative position', () => {
  const beforeFoolsMate = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2';
  const game = createGame(beforeFoolsMate);
  const move = applyAuthoritativeMove(game, 'black-user', { from: 'd8', to: 'h4' });

  assert.equal(move.checkmate, true);
  assert.deepEqual(getVerifiedGameOutcome(game, 'white-user', 'checkmate'), {
    result: 'black',
    reason: 'checkmate'
  });
  assert.equal(getVerifiedGameOutcome(game, 'intruder', 'checkmate').error, 'You are not a player in this game');
});

test('validates stalemate and rejects false terminal claims', () => {
  const stalemate = createGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(getVerifiedGameOutcome(stalemate, 'black-user', 'stalemate'), {
    result: 'draw',
    reason: 'stalemate'
  });

  const ongoing = createGame();
  assert.match(getVerifiedGameOutcome(ongoing, 'white-user', 'checkmate').error, /not checkmate/);
  assert.match(getVerifiedGameOutcome(ongoing, 'white-user', 'stalemate').error, /not stalemate/);
});

test('mocked Socket.IO make-move handler ignores client FEN and broadcasts server state', () => {
  const game = createGame();
  const { handlers, emitted, broadcasts } = createSocketHarness(game);
  handlers.get('game:make-move')({
    gameId: game.id,
    from: 'e2',
    to: 'e4',
    fen: '8/8/8/8/8/8/8/8 b - - 0 1'
  });

  assert.equal(emitted[0].event, 'game:move');
  assert.equal(emitted[0].data.fen, game.fen);
  assert.equal(emitted[0].data.fen, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  assert.equal(broadcasts[0].data.fen, game.fen);
});

test('mocked Socket.IO rejects illegal, wrong-turn, and unauthorized moves', () => {
  const game = createGame();
  const { handlers, emitted } = createSocketHarness(game, 'black-user');
  handlers.get('game:make-move')({ gameId: game.id, from: 'e7', to: 'e5' });
  assert.equal(emitted[0].event, 'error');
  assert.equal(game.moves.length, 0);

  const { handlers: intruderHandlers, emitted: intruderEmitted } = createSocketHarness(game, 'intruder');
  intruderHandlers.get('game:make-move')({ gameId: game.id, from: 'e2', to: 'e4' });
  assert.equal(intruderEmitted[0].event, 'error');
  assert.equal(game.moves.length, 0);

  const { handlers: illegalHandlers, emitted: illegalEmitted } = createSocketHarness(game);
  illegalHandlers.get('game:make-move')({ gameId: game.id, from: 'e2', to: 'e5' });
  assert.equal(illegalEmitted[0].event, 'error');
  assert.equal(game.moves.length, 0);
});

test('mocked Socket.IO rejects false terminal claims and finalizes real checkmate/stalemate', () => {
  const ongoing = createGame();
  const falseClaim = createSocketHarness(ongoing);
  falseClaim.handlers.get('game:checkmate')({ gameId: ongoing.id });
  falseClaim.handlers.get('game:stalemate')({ gameId: ongoing.id });
  assert.equal(falseClaim.endedGames.length, 0);
  assert.equal(falseClaim.emitted.filter(item => item.event === 'error').length, 2);

  const mate = createGame('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2');
  const mateHandler = createSocketHarness(mate, 'black-user');
  mateHandler.handlers.get('game:make-move')({ gameId: mate.id, from: 'd8', to: 'h4' });
  assert.deepEqual(mateHandler.endedGames, [['game-1', 'black', 'checkmate']]);

  const stalemate = createGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const stalemateHandler = createSocketHarness(stalemate, 'black-user');
  stalemateHandler.handlers.get('game:stalemate')({ gameId: stalemate.id });
  assert.deepEqual(stalemateHandler.endedGames, [['game-1', 'draw', 'stalemate']]);
});
