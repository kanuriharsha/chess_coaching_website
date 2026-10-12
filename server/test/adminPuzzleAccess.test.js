import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdminContentQuery,
  buildAdminPuzzleGrant,
  migrateLegacyAdminPuzzleAccess
} from '../adminPuzzleAccess.js';

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

test('legacy puzzle ID grants migrate to compact specific-number settings', () => {
  assert.deepEqual(
    migrateLegacyAdminPuzzleAccess(puzzles, {}, ['mate-2', 'fork-1']),
    {
      'mate-in-1': {
        enabled: true,
        limit: 0,
        rangeStart: null,
        rangeEnd: null,
        specificPuzzles: [2]
      },
      forks: {
        enabled: true,
        limit: 0,
        rangeStart: null,
        rangeEnd: null,
        specificPuzzles: [1]
      }
    }
  );
});

test('empty asset selections grant no superadmin-owned items', () => {
  assert.deepEqual(
    buildAdminContentQuery('admin-id', 'superadmin-id', {
      enabled: true,
      allowedOpenings: []
    }, 'allowedOpenings'),
    {
      $or: [
        { adminId: 'admin-id' },
        { adminId: 'superadmin-id', _id: { $in: [] } }
      ]
    }
  );
});

test('specific asset selections grant only selected superadmin-owned items', () => {
  assert.deepEqual(
    buildAdminContentQuery('admin-id', 'superadmin-id', {
      enabled: true,
      allowedGames: ['game-1']
    }, 'allowedGames'),
    {
      $or: [
        { adminId: 'admin-id' },
        { adminId: 'superadmin-id', _id: { $in: ['game-1'] } }
      ]
    }
  );
});
