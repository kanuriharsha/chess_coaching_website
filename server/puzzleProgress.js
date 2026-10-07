export function buildPuzzleProgress(puzzles, progressRecords) {
  const progressByPuzzleId = new Map(
    progressRecords.map(record => [String(record.puzzleId), record])
  );
  const puzzlesByCategory = new Map();

  for (const puzzle of puzzles) {
    const categoryPuzzles = puzzlesByCategory.get(puzzle.category) || [];
    const puzzleId = puzzle._id.toString();
    const progress = progressByPuzzleId.get(puzzleId);

    categoryPuzzles.push({
      puzzleId,
      puzzleName: puzzle.name,
      solved: progress?.completed === true,
      attempts: progress?.a || 0,
      solvedAt: null
    });
    puzzlesByCategory.set(puzzle.category, categoryPuzzles);
  }

  return Array.from(puzzlesByCategory, ([category, puzzleDetails]) => ({
    category,
    totalPuzzles: puzzleDetails.length,
    solvedPuzzles: puzzleDetails.filter(puzzle => puzzle.solved).length,
    puzzleDetails
  }));
}

function getId(value) {
  return value == null ? '' : String(value);
}

function getTimestamp(value, activityId) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid timestamp in activity ${getId(activityId)}`);
  }
  return timestamp;
}

function getLegacyAttemptOrdinal(activity) {
  const value = activity.details?.attempts;
  if (value == null) return 0;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid attempt ordinal in activity ${getId(activity._id)}`);
  }
  return value;
}

export function reconstructPuzzleProgress(activities) {
  const puzzleActivities = activities.filter(activity =>
    ['puzzle_solved', 'puzzle_failed'].includes(activity.type)
  );
  for (const activity of puzzleActivities) {
    getTimestamp(activity.timestamp, activity._id);
    getLegacyAttemptOrdinal(activity);
  }

  const orderedActivities = puzzleActivities.sort((left, right) => {
    const timestampDifference =
      getTimestamp(left.timestamp, left._id) - getTimestamp(right.timestamp, right._id);
    if (timestampDifference !== 0) return timestampDifference;
    // Legacy attempt ordinals reset between visits, so use them only to break timestamp ties.
    const attemptDifference = getLegacyAttemptOrdinal(left) - getLegacyAttemptOrdinal(right);
    if (attemptDifference !== 0) return attemptDifference;
    return getId(left._id).localeCompare(getId(right._id));
  });
  const progressByKey = new Map();

  for (const activity of orderedActivities) {
    const userId = getId(activity.userId);
    const puzzleId = getId(activity.details?.puzzleId);
    if (!userId || !puzzleId) continue;

    const key = `${userId}:${puzzleId}`;
    const progress = progressByKey.get(key) || {
      userId: activity.userId,
      puzzleId,
      a: 0,
      completed: false
    };
    if (progress.completed) continue;

    const result = activity.details?.result;
    if (result && result !== 'passed' && result !== 'failed') {
      throw new Error(`Invalid puzzle result in activity ${getId(activity._id)}`);
    }
    if (
      result &&
      ((activity.type === 'puzzle_solved') !== (result === 'passed'))
    ) {
      throw new Error(`Puzzle result/type mismatch in activity ${getId(activity._id)}`);
    }

    if (activity.type === 'puzzle_failed') {
      progress.a += 1;
    } else {
      progress.a += 1;
      progress.completed = true;
    }
    progressByKey.set(key, progress);
  }

  return Array.from(progressByKey.values());
}

export function buildPuzzleProgressAttemptUpdate(solved) {
  return [{
    $set: {
      a: {
        $cond: [
          { $eq: ['$completed', true] },
          { $ifNull: ['$a', 0] },
          { $add: [{ $ifNull: ['$a', 0] }, 1] }
        ]
      },
      completed: {
        $cond: [
          { $eq: ['$completed', true] },
          true,
          solved
        ]
      }
    }
  }];
}
