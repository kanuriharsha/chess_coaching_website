import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPuzzleProgress,
  buildPuzzleProgressAttemptUpdate,
  reconstructPuzzleProgress
} from '../puzzleProgress.js';
import PuzzleProgress from '../puzzleProgressModel.js';

test('compact records drive category completion and attempt totals', () => {
  const result = buildPuzzleProgress([
    { _id: 'puzzle-1', name: 'Puzzle One', category: 'mate-in-1' },
    { _id: 'puzzle-2', name: 'Puzzle Two', category: 'forks' }
  ], [
    { puzzleId: 'puzzle-1', a: 4, completed: true }
  ]);

  assert.equal(result[0].category, 'mate-in-1');
  assert.equal(result[0].solvedPuzzles, 1);
  assert.deepEqual(result[0].puzzleDetails[0], {
    puzzleId: 'puzzle-1',
    puzzleName: 'Puzzle One',
    solved: true,
    attempts: 4,
    solvedAt: null
  });
  assert.equal(result[1].category, 'forks');
  assert.equal(result[1].puzzleDetails[0].attempts, 0);
  assert.equal(result[1].puzzleDetails[0].solved, false);
});

test('progress is isolated by both user id and puzzle id', () => {
  const progress = reconstructPuzzleProgress([
    { _id: '1', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-01T00:00:00Z', details: { puzzleId: 'puzzle-a' } },
    { _id: '2', userId: 'user-a', type: 'puzzle_solved', timestamp: '2026-01-02T00:00:00Z', details: { puzzleId: 'puzzle-b' } },
    { _id: '3', userId: 'user-b', type: 'puzzle_failed', timestamp: '2026-01-03T00:00:00Z', details: { puzzleId: 'puzzle-a' } }
  ]);

  assert.deepEqual(progress, [
    { userId: 'user-a', puzzleId: 'puzzle-a', a: 1, completed: false },
    { userId: 'user-a', puzzleId: 'puzzle-b', a: 1, completed: true },
    { userId: 'user-b', puzzleId: 'puzzle-a', a: 1, completed: false }
  ]);
});

test('migration counts failures, includes the successful attempt and preserves first success', () => {
  const progress = reconstructPuzzleProgress([
    { _id: '1', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-01T00:00:00Z', details: { puzzleId: 'done', attempts: 1, result: 'failed' } },
    { _id: '2', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-02T00:00:00Z', details: { puzzleId: 'done', attempts: 2, result: 'failed' } },
    { _id: '3', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-03T00:00:00Z', details: { puzzleId: 'done', attempts: 3, result: 'failed' } },
    { _id: '4', userId: 'user-a', type: 'puzzle_solved', timestamp: '2026-01-04T00:00:00Z', details: { puzzleId: 'done', attempts: 4, result: 'passed' } },
    { _id: '5', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-05T00:00:00Z', details: { puzzleId: 'done', attempts: 1, result: 'failed' } },
    { _id: '6', userId: 'user-a', type: 'puzzle_solved', timestamp: '2026-01-06T00:00:00Z', details: { puzzleId: 'done', attempts: 2, result: 'passed' } },
    { _id: '7', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-07T00:00:00Z', details: { puzzleId: 'failed-only', attempts: 1, result: 'failed' } },
    { _id: '8', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-08T00:00:00Z', details: { puzzleId: 'failed-only', attempts: 1, result: 'failed' } }
  ]);

  assert.deepEqual(progress, [
    { userId: 'user-a', puzzleId: 'done', a: 4, completed: true },
    { userId: 'user-a', puzzleId: 'failed-only', a: 2, completed: false }
  ]);
});

test('migration orders same-time attempts by legacy ordinal and rejects contradictory results', () => {
  const progress = reconstructPuzzleProgress([
    { _id: '2', userId: 'user-a', type: 'puzzle_solved', timestamp: '2026-01-01T00:00:00Z', details: { puzzleId: 'puzzle', attempts: 2, result: 'passed' } },
    { _id: '1', userId: 'user-a', type: 'puzzle_failed', timestamp: '2026-01-01T00:00:00Z', details: { puzzleId: 'puzzle', attempts: 1, result: 'failed' } }
  ]);
  assert.deepEqual(progress, [
    { userId: 'user-a', puzzleId: 'puzzle', a: 2, completed: true }
  ]);

  assert.throws(() => reconstructPuzzleProgress([
    { _id: 'bad', userId: 'user-a', type: 'puzzle_solved', timestamp: '2026-01-01T00:00:00Z', details: { puzzleId: 'puzzle', result: 'failed' } }
  ]), /result\/type mismatch/);
  assert.throws(() => reconstructPuzzleProgress([
    { _id: 'missing-time', userId: 'user-a', type: 'puzzle_failed', details: { puzzleId: 'puzzle' } }
  ]), /Invalid timestamp/);
});

test('atomic progress update increments failures, completes once, and freezes after completion', () => {
  const failureUpdate = buildPuzzleProgressAttemptUpdate(false);
  const successUpdate = buildPuzzleProgressAttemptUpdate(true);

  assert.deepEqual(failureUpdate[0].$set.a.$cond[1], { $ifNull: ['$a', 0] });
  assert.deepEqual(failureUpdate[0].$set.a.$cond[2], {
    $add: [{ $ifNull: ['$a', 0] }, 1]
  });
  assert.deepEqual(failureUpdate[0].$set.completed.$cond, [
    { $eq: ['$completed', true] },
    true,
    false
  ]);
  assert.deepEqual(successUpdate[0].$set.completed.$cond, [
    { $eq: ['$completed', true] },
    true,
    true
  ]);
});

test('progress schema declares the required unique user/puzzle compound index', () => {
  const compoundIndex = PuzzleProgress.schema.indexes().find(([keys]) =>
    keys.userId === 1 && keys.puzzleId === 1
  );

  assert.ok(compoundIndex);
  assert.equal(compoundIndex[1].unique, true);
});
