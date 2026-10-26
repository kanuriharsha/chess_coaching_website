import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageStudent,
  canReadUserContentAccess,
  areColumnsCompatible,
  getGrantedColumnContentIds,
  filterColumnsForAdmin,
  filterVisibleColumnContents,
  filterVisibleItems,
  filterVisiblePuzzles,
  getUserContentAccessStatus,
  getContentOwnerId
} from '../contentAccess.js';

test('admins can receive standard and matching custom superadmin columns they added', () => {
  const superAdminColumns = [
    { _id: 'opening-source', contentType: 'opening' },
    { _id: 'mate-source', contentType: 'famousMate' },
    { _id: 'game-source', contentType: 'bestGame' },
    { _id: 'custom-source', contentType: 'generic', title: 'Endgame Studies' },
    { _id: 'other-custom-source', contentType: 'generic', title: 'Tactics' }
  ];
  assert.deepEqual(
    filterColumnsForAdmin(superAdminColumns, [
      { contentType: 'opening' },
      { contentType: 'bestGame' },
      { contentType: 'generic', title: ' endgame studies ' }
    ])
      .map(column => column._id),
    ['opening-source', 'game-source', 'custom-source']
  );
  assert.deepEqual(filterColumnsForAdmin(superAdminColumns, []).map(column => column._id), []);
  assert.equal(
    areColumnsCompatible(
      { contentType: 'generic', title: 'Endgame Studies' },
      { contentType: 'generic', title: 'Tactics' }
    ),
    false
  );
});

test('legacy opening grants feed the migrated standard column unless an explicit column grant overrides them', () => {
  const sourceColumn = { _id: 'source-openings', contentType: 'opening' };
  const legacyGrant = {
    openingAccess: { enabled: true, allowedOpenings: ['opening-6', 'opening-2', 'opening-6'] }
  };
  assert.deepEqual(getGrantedColumnContentIds(legacyGrant, sourceColumn), ['opening-6', 'opening-2']);
  assert.deepEqual(getGrantedColumnContentIds({
    ...legacyGrant,
    columnAccess: { 'source-openings': { enabled: false, allowedContentIds: [] } }
  }, sourceColumn), []);
  assert.deepEqual(getGrantedColumnContentIds({
    ...legacyGrant,
    columnAccess: { 'source-openings': { enabled: true, allowedContentIds: ['new-1'] } }
  }, sourceColumn), ['new-1']);
});

test('content-access records are readable only by their owner or an admin', () => {
  const student = { _id: 'student-b', role: 'student', adminId: 'coach' };
  assert.equal(canReadUserContentAccess({ _id: 'student-a', role: 'student' }, 'student-a'), true);
  assert.equal(canReadUserContentAccess({ _id: 'student-a', role: 'student' }, 'student-b', student), false);
  assert.equal(canReadUserContentAccess({ _id: 'coach', role: 'admin' }, 'student-b', student), true);
  assert.equal(canReadUserContentAccess({ _id: 'other-coach', role: 'admin' }, 'student-b', student), false);
  assert.equal(getUserContentAccessStatus(null, 'student-a'), 401);
  assert.equal(getUserContentAccessStatus({ _id: 'student-a', role: 'student' }, 'student-a'), 200);
  assert.equal(getUserContentAccessStatus({ _id: 'student-a', role: 'student' }, 'student-b'), 403);
  assert.equal(getUserContentAccessStatus({ _id: 'coach', role: 'admin' }, 'student-b', student), 200);
  assert.equal(getUserContentAccessStatus({ _id: 'other-coach', role: 'admin' }, 'student-b', student), 403);
});

test('admin ownership is enforced for students, including superadmins', () => {
  const student = { _id: 'student-a', role: 'student', adminId: 'admin-a' };
  assert.equal(canManageStudent({ _id: 'admin-a', role: 'admin' }, student), true);
  assert.equal(canManageStudent({ _id: 'admin-a', role: 'superadmin' }, student), true);
  assert.equal(canManageStudent({ _id: 'admin-b', role: 'admin' }, student), false);
  assert.equal(canManageStudent({ _id: 'admin-b', role: 'superadmin' }, student), false);
  assert.equal(canManageStudent({ _id: 'student-a', role: 'student' }, student), false);
});

test('content owner resolution uses the student’s admin and each admin’s own id', () => {
  assert.equal(getContentOwnerId({ _id: 'coach-a', role: 'admin' }), 'coach-a');
  assert.equal(getContentOwnerId({ _id: 'owner', role: 'superadmin' }), 'owner');
  assert.equal(getContentOwnerId({ _id: 'student-a', role: 'student', adminId: 'coach-a' }), 'coach-a');
  assert.equal(getContentOwnerId({ _id: 'student-b', role: 'student' }), undefined);
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
  const hiddenDisabledItem = filterVisibleItems(
    [{ _id: 'disabled', name: 'Disabled record', isEnabled: false, moves: ['private'] }],
    { famousMatesAccess: { enabled: true, allowedMates: ['disabled'] } },
    'famousMatesAccess',
    'allowedMates',
  );
  assert.deepEqual(hiddenDisabledItem, []);

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

test('student columns require enabled columns, enabled content, and both student and admin grants', () => {
  const column = { _id: 'column-1', isEnabled: true };
  const contents = [
    { _id: 'c1', isEnabled: true },
    { _id: 'c2', isEnabled: true },
    { _id: 'c3', isEnabled: false }
  ];
  const viewer = { _id: 'student-1', role: 'student' };
  const access = { columnAccess: { 'column-1': { enabled: true, allowedContentIds: [] } } };

  assert.deepEqual(
    filterVisibleColumnContents(contents, access, column, viewer, ['c1', 'c3']),
    [contents[0]]
  );
  assert.deepEqual(
    filterVisibleColumnContents(contents, {
      columnAccess: { 'column-1': { enabled: true, allowedContentIds: ['c2'] } }
    }, column, viewer, ['c1', 'c2']),
    [contents[1]]
  );
  assert.deepEqual(
    filterVisibleColumnContents(contents, {
      columnAccess: { 'column-1': { enabled: false, allowedContentIds: [] } }
    }, column, viewer),
    []
  );
  assert.deepEqual(
    filterVisibleColumnContents(contents, access, { ...column, isEnabled: false }, viewer),
    []
  );
  assert.deepEqual(
    filterVisibleColumnContents(contents, null, column, { role: 'admin' }),
    contents
  );
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

test('Practice with AI puzzle assignments are independent from Puzzles assignments', () => {
  const puzzles = [1, 2, 3].map(position => ({
    _id: `p${position}`,
    category: 'forks',
    name: `Puzzle ${position}`,
    isEnabled: true,
    fen: 'protected-fen'
  }));
  const access = {
    puzzleAccess: { forks: { enabled: true, limit: 1 } },
    practiceWithAiAccess: { forks: { enabled: true, limit: 2 } }
  };
  const viewer = { _id: 'student', role: 'student' };

  assert.deepEqual(
    filterVisiblePuzzles(puzzles, access, [], viewer).map(puzzle => puzzle.isLocked),
    [false, true, true]
  );
  assert.deepEqual(
    filterVisiblePuzzles(puzzles, access, [], viewer, 'practiceWithAiAccess')
      .map(puzzle => puzzle.isLocked),
    [false, false, true]
  );
  assert.deepEqual(
    filterVisiblePuzzles(
      puzzles,
      { ...access, practiceWithAiAccess: { forks: { enabled: true, hidden: true } } },
      [],
      viewer,
      'practiceWithAiAccess'
    ),
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
