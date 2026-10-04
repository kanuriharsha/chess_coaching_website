import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReadUserContentAccess,
  filterVisibleItems,
  filterVisiblePuzzles,
  getUserContentAccessStatus
} from '../contentAccess.js';

test('content-access records are readable only by their owner or an admin', () => {
  assert.equal(canReadUserContentAccess({ _id: 'student-a', role: 'student' }, 'student-a'), true);
  assert.equal(canReadUserContentAccess({ _id: 'student-a', role: 'student' }, 'student-b'), false);
  assert.equal(canReadUserContentAccess({ _id: 'coach', role: 'admin' }, 'student-b'), true);
  assert.equal(getUserContentAccessStatus(null, 'student-a'), 401);
  assert.equal(getUserContentAccessStatus({ _id: 'student-a', role: 'student' }, 'student-a'), 200);
  assert.equal(getUserContentAccessStatus({ _id: 'student-a', role: 'student' }, 'student-b'), 403);
  assert.equal(getUserContentAccessStatus({ _id: 'coach', role: 'admin' }, 'student-b'), 200);
});

test('opening, famous-mate, and best-game entitlements require enabled access and filter IDs', () => {
  const items = [
    { _id: 'open-1', name: 'Opening one', moves: [{ san: 'e4' }], startFen: 'secret-fen' },
    { _id: 'open-2', name: 'Opening two', moves: [{ san: 'd4' }], startFen: 'other-fen' },
    { _id: 'disabled', isEnabled: false }
  ];

  const noAccessItems = filterVisibleItems(items, null, 'openingAccess', 'allowedOpenings');
  assert.deepEqual(noAccessItems.map(item => ({ _id: item._id, name: item.name, isLocked: item.isLocked })), [
    { _id: 'open-1', name: 'Opening one', isLocked: true },
    { _id: 'open-2', name: 'Opening two', isLocked: true }
  ]);
  assert.equal('moves' in noAccessItems[0], false);
  assert.equal('startFen' in noAccessItems[0], false);

  const selectedAccessItems = filterVisibleItems(items, {
      openingAccess: { enabled: true, allowedOpenings: ['open-2'] }
    }, 'openingAccess', 'allowedOpenings');
  assert.equal(selectedAccessItems.length, 2);
  assert.equal(selectedAccessItems[0].isLocked, true);
  assert.equal('moves' in selectedAccessItems[0], false);
  assert.equal(selectedAccessItems[1].isLocked, undefined);
  assert.deepEqual(selectedAccessItems[1].moves, [{ san: 'd4' }]);

  assert.deepEqual(
    filterVisibleItems(items, {
      openingAccess: { enabled: true, allowedOpenings: [] }
    }, 'openingAccess', 'allowedOpenings'),
    items.slice(0, 2)
  );
  const disabledLocked = filterVisibleItems(
    [{ _id: 'disabled', name: 'Disabled record', isEnabled: false, moves: ['private'] }],
    { famousMatesAccess: { enabled: true, allowedMates: ['disabled'] } },
    'famousMatesAccess',
    'allowedMates',
    true
  );
  assert.deepEqual(disabledLocked, [{ _id: 'disabled', name: 'Disabled record', isEnabled: false, isLocked: true }]);

  for (const [section, allowedIdsField] of [
    ['openingAccess', 'allowedOpenings'],
    ['famousMatesAccess', 'allowedMates'],
    ['bestGamesAccess', 'allowedGames']
  ]) {
    const [visible, restricted] = filterVisibleItems(
      [
        { _id: 'allowed', name: 'Allowed', moves: [{ san: 'e4' }] },
        { _id: 'locked', name: 'Locked', moves: [{ san: 'd4' }], startFen: 'private' }
      ],
      { [section]: { enabled: true, [allowedIdsField]: ['allowed'] } },
      section,
      allowedIdsField
    );
    assert.equal(visible.isLocked, undefined);
    assert.deepEqual(visible.moves, [{ san: 'e4' }]);
    assert.equal(restricted.isLocked, true);
    assert.equal(restricted.name, 'Locked');
    assert.equal('moves' in restricted, false);
    assert.equal('startFen' in restricted, false);
  }
});

test('puzzle permissions retain locked card metadata while enforcing category, group, range, specific grants, and limits', () => {
  const puzzles = [1, 2, 3, 4, 5].map(position => ({
    _id: `p${position}`,
    category: 'mate-in-1',
    name: `Puzzle ${position}`,
    isEnabled: true,
    fen: 'protected-fen',
    solution: ['protected-move'],
    hint: 'protected-hint'
  }));
  const viewer = { _id: 'student', role: 'student', groupId: 'group-a' };
  const categorySettings = [{
    categoryId: 'mate-in-1',
    isEnabled: true,
    groupsConfigured: true,
    allowedGroups: ['group-a']
  }];
  const accessFor = puzzleAccess => ({ puzzleAccess: { 'mate-in-1': puzzleAccess } });

  const rangedPuzzles = filterVisiblePuzzles(
    puzzles,
    accessFor({ enabled: true, rangeStart: 2, rangeEnd: 3, specificPuzzles: [5] }),
    categorySettings,
    viewer
  );
  assert.deepEqual(rangedPuzzles.map(puzzle => puzzle.originalIndex), [1, 2, 3, 4, 5]);
  assert.deepEqual(rangedPuzzles.map(puzzle => puzzle.isLocked), [true, false, false, true, false]);
  assert.equal(rangedPuzzles[0].name, 'Puzzle 1');
  assert.equal('fen' in rangedPuzzles[0], false);
  assert.equal('solution' in rangedPuzzles[0], false);
  assert.equal('hint' in rangedPuzzles[0], false);
  assert.equal(rangedPuzzles[1].fen, 'protected-fen');

  assert.deepEqual(
    filterVisiblePuzzles(puzzles, accessFor({ enabled: true, limit: 2 }), categorySettings, viewer)
      .map(puzzle => puzzle.isLocked),
    [false, false, true, true, true]
  );
  assert.deepEqual(
    filterVisiblePuzzles(puzzles, accessFor({ enabled: false }), categorySettings, viewer)
      .map(puzzle => puzzle.isLocked),
    [true, true, true, true, true]
  );
  assert.deepEqual(
    filterVisiblePuzzles(puzzles, accessFor({ enabled: true }), [{
      ...categorySettings[0],
      allowedGroups: ['group-b']
    }], viewer),
    []
  );
  assert.deepEqual(
    filterVisiblePuzzles(puzzles, accessFor({ enabled: true }), [{
      ...categorySettings[0],
      isEnabled: false
    }], viewer),
    []
  );
});

test('admins retain all puzzle access regardless of student visibility settings', () => {
  const puzzles = [{ _id: 'p1', category: 'mate-in-1', isEnabled: false }];
  assert.deepEqual(
    filterVisiblePuzzles(puzzles, null, [], { _id: 'admin', role: 'admin' }),
    puzzles
  );
});
