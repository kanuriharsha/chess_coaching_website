import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminPuzzleGrant } from '../adminPuzzleAccess.js';

const puzzles = [
  { _id: 'mate-1', category: 'mate-in-1' },
  { _id: 'mate-2', category: 'mate-in-1' },
  { _id: 'mate-3', category: 'mate-in-1' },
  { _id: 'fork-1', category: 'forks' },
  { _id: 'fork-2', category: 'forks' }
];

test('category ranges and specific puzzle numbers are granted as a union', () => {
  const grant = buildAdminPuzzleGrant(puzzles, {
    'mate-in-1': {
      enabled: true,
      limit: 0,
      rangeStart: 2,
      rangeEnd: 3,
      specificPuzzles: [1, 3]
    },
    forks: {
      enabled: true,
      limit: 1,
      rangeStart: null,
      rangeEnd: null,
      specificPuzzles: []
    }
  });

  assert.deepEqual(grant.puzzleIds, ['mate-1', 'mate-2', 'mate-3', 'fork-1']);
});

test('disabled categories grant no puzzles and a zero limit grants all when no range is set', () => {
  const grant = buildAdminPuzzleGrant(puzzles, {
    'mate-in-1': {
      enabled: false,
      limit: 0,
      rangeStart: null,
      rangeEnd: null,
      specificPuzzles: []
    },
    forks: {
      enabled: true,
      limit: 0,
      rangeStart: null,
      rangeEnd: null,
      specificPuzzles: []
    }
  });

  assert.deepEqual(grant.puzzleIds, ['fork-1', 'fork-2']);
});

test('invalid categories, incomplete ranges, and out-of-range numbers are rejected', () => {
  assert.match(
    buildAdminPuzzleGrant(puzzles, { unknown: { enabled: true } }).error,
    /Invalid puzzle category/
  );
  assert.match(
    buildAdminPuzzleGrant(puzzles, {
      'mate-in-1': { enabled: true, limit: 0, rangeStart: 2, rangeEnd: null, specificPuzzles: [] }
    }).error,
    /Invalid puzzle access settings/
  );
  assert.match(
    buildAdminPuzzleGrant(puzzles, {
      forks: { enabled: true, limit: 0, specificPuzzles: [3] }
    }).error,
    /Invalid puzzle access settings/
  );
});
