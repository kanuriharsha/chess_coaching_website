export function buildPuzzleProgress(puzzles, activities) {
  const progressByPuzzleId = new Map();

  for (const activity of activities) {
    const puzzleId = activity.details?.puzzleId;
    if (typeof puzzleId !== 'string' || !puzzleId) continue;

    const progress = progressByPuzzleId.get(puzzleId) || {
      solved: false,
      attempts: 0,
      solvedAt: null
    };
    progress.attempts++;
    if (activity.type === 'puzzle_solved' && !progress.solved) {
      progress.solved = true;
      progress.solvedAt = activity.timestamp;
    }
    progressByPuzzleId.set(puzzleId, progress);
  }

  const puzzlesByCategory = new Map();
  for (const puzzle of puzzles) {
    const categoryPuzzles = puzzlesByCategory.get(puzzle.category) || [];
    const puzzleId = puzzle._id.toString();
    const progress = progressByPuzzleId.get(puzzleId);
    categoryPuzzles.push({
      puzzleId,
      puzzleName: puzzle.name,
      solved: progress?.solved || false,
      attempts: progress?.attempts || 0,
      solvedAt: progress?.solvedAt || null
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
