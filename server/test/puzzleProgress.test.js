import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPuzzleProgress } from '../puzzleProgress.js';

test('puzzle completion is matched by puzzle id, not activity category', () => {
  const result = buildPuzzleProgress([
    { _id: 'puzzle-1', name: 'Puzzle One', category: 'mate-in-1' },
    { _id: 'puzzle-2', name: 'Puzzle Two', category: 'forks' }
  ], [
    {
      type: 'puzzle_solved',
      details: { puzzleId: 'puzzle-1', category: 'Mate in 1' },
      timestamp: new Date('2026-01-01T00:00:00.000Z')
    }
  ]);

  assert.equal(result[0].category, 'mate-in-1');
  assert.equal(result[0].solvedPuzzles, 1);
  assert.equal(result[0].puzzleDetails[0].solved, true);
  assert.equal(result[1].category, 'forks');
  assert.equal(result[1].solvedPuzzles, 0);
});

test('duplicate solved activities count a puzzle once and failed attempts do not solve it', () => {
  const result = buildPuzzleProgress([
    { _id: 'puzzle-solved', name: 'Solved Puzzle', category: 'mate-in-1' },
    { _id: 'puzzle-failed', name: 'Failed Puzzle', category: 'mate-in-1' }
  ], [
    { type: 'puzzle_solved', details: { puzzleId: 'puzzle-solved', category: 'old-category' }, timestamp: new Date('2026-01-02T00:00:00.000Z') },
    { type: 'puzzle_solved', details: { puzzleId: 'puzzle-solved', category: 'another-category' }, timestamp: new Date('2026-01-01T00:00:00.000Z') },
    { type: 'puzzle_failed', details: { puzzleId: 'puzzle-failed', category: 'mate-in-1' }, timestamp: new Date('2026-01-03T00:00:00.000Z') }
  ]);

  assert.equal(result[0].totalPuzzles, 2);
  assert.equal(result[0].solvedPuzzles, 1);
  assert.equal(result[0].puzzleDetails[0].attempts, 2);
  assert.equal(result[0].puzzleDetails[1].attempts, 1);
  assert.equal(result[0].puzzleDetails[1].solved, false);
});
