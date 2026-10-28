import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupAdminAccountData, cleanupStudentAccountData } from '../accountCleanup.js';

function createModel(findResult = []) {
  const calls = [];
  return {
    calls,
    find: (filter) => ({
      select: () => ({
        lean: async () => {
          calls.push(['find', filter]);
          return findResult;
        }
      })
    }),
    deleteMany: async (filter) => {
      calls.push(['deleteMany', filter]);
    },
    updateMany: async (filter, update) => {
      calls.push(['updateMany', filter, update]);
    }
  };
}

function createDatabase() {
  const calls = [];
  return {
    calls,
    collection: (name) => ({
      deleteMany: async (filter) => calls.push([name, filter])
    })
  };
}

test('student account cleanup removes all direct puzzle and activity data by user id', async () => {
  const PuzzleProgress = createModel();
  const ContentAccess = createModel();
  const database = createDatabase();
  const studentId = 'student-id';

  await cleanupStudentAccountData([studentId], { PuzzleProgress, ContentAccess, database });

  assert.deepEqual(PuzzleProgress.calls, [
    ['deleteMany', { userId: { $in: [studentId] } }]
  ]);
  assert.deepEqual(ContentAccess.calls, [
    ['deleteMany', { userId: { $in: [studentId] } }]
  ]);
  assert.deepEqual(database.calls, [
    ['useractivities', { userId: { $in: [studentId] } }]
  ]);
});

test('admin cleanup removes owned records, student records, and cross-tenant references', async () => {
  const students = [{ _id: 'student-id' }];
  const groups = [{ _id: 'group-id' }];
  const puzzles = [{ _id: 'puzzle-id' }];
  const User = createModel(students);
  const Group = createModel(groups);
  const Puzzle = createModel(puzzles);
  const Opening = createModel();
  const FamousMate = createModel();
  const BestGame = createModel();
  const Column = createModel();
  const ColumnContent = createModel();
  const PuzzleCategory = createModel();
  const PuzzleCategoryOrder = createModel();
  const ContentAccess = createModel();
  const AdminPuzzleAccess = createModel();
  const PuzzleProgress = createModel();
  const database = createDatabase();

  await cleanupAdminAccountData('admin-id', {
    User,
    Group,
    Puzzle,
    Opening,
    FamousMate,
    BestGame,
    Column,
    ColumnContent,
    PuzzleCategory,
    PuzzleCategoryOrder,
    ContentAccess,
    AdminPuzzleAccess,
    PuzzleProgress,
    database
  });

  assert.ok(PuzzleProgress.calls.some(([, filter]) =>
    filter.userId.$in.includes('admin-id') && filter.userId.$in.includes('student-id')
  ));
  assert.ok(ContentAccess.calls.some(([, filter]) => filter.userId.$in.includes('student-id')));
  assert.ok(Puzzle.calls.some(([operation, filter]) =>
    operation === 'updateMany' && filter.allowedGroups.$in.includes('group-id')
  ));
  assert.ok(AdminPuzzleAccess.calls.some(([operation, filter]) =>
    operation === 'deleteMany' && filter.$or.some(condition => condition.grantedBy === 'admin-id')
  ));
  assert.ok(User.calls.some(([operation, filter]) =>
    operation === 'deleteMany' && filter._id.$in.includes('student-id')
  ));
});
