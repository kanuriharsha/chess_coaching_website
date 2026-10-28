export async function cleanupStudentAccountData(userIds, { PuzzleProgress, ContentAccess, database }) {
  if (userIds.length === 0) return;

  await PuzzleProgress.deleteMany({ userId: { $in: userIds } });
  await ContentAccess.deleteMany({ userId: { $in: userIds } });
  await database.collection('useractivities').deleteMany({ userId: { $in: userIds } });
}

export async function cleanupAdminAccountData(adminId, {
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
}) {
  const students = await User.find({ adminId, role: 'student' }).select('_id').lean();
  const studentIds = students.map(student => student._id);
  const userIds = [adminId, ...studentIds];
  const groups = await Group.find({ adminId }).select('_id').lean();
  const groupIds = groups.map(group => group._id);
  const puzzles = await Puzzle.find({ adminId }).select('_id').lean();
  const puzzleIds = puzzles.map(puzzle => puzzle._id);

  await cleanupStudentAccountData(userIds, { PuzzleProgress, ContentAccess, database });

  if (groupIds.length > 0) {
    await Puzzle.updateMany(
      { allowedGroups: { $in: groupIds } },
      { $pull: { allowedGroups: { $in: groupIds } } }
    );
    await PuzzleCategoryOrder.updateMany(
      { allowedGroups: { $in: groupIds } },
      { $pull: { allowedGroups: { $in: groupIds } } }
    );
  }
  if (puzzleIds.length > 0) {
    await AdminPuzzleAccess.updateMany(
      { puzzleIds: { $in: puzzleIds } },
      { $pull: { puzzleIds: { $in: puzzleIds } } }
    );
  }

  await ColumnContent.deleteMany({ adminId });
  await Puzzle.deleteMany({ adminId });
  await Opening.deleteMany({ adminId });
  await FamousMate.deleteMany({ adminId });
  await BestGame.deleteMany({ adminId });
  await Column.deleteMany({ adminId });
  await PuzzleCategory.deleteMany({ adminId });
  await PuzzleCategoryOrder.deleteMany({ adminId });
  await Group.deleteMany({ adminId });
  await AdminPuzzleAccess.deleteMany({
    $or: [{ adminId }, { grantedBy: adminId }]
  });
  await database.collection('useractivities').deleteMany({
    $or: [{ userId: { $in: userIds } }, { adminId }]
  });
  await User.deleteMany({ _id: { $in: studentIds }, adminId, role: 'student' });
}
