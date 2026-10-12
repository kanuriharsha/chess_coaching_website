export function buildAdminPuzzleGrant(puzzles, puzzleAccess) {
  if (!puzzleAccess || typeof puzzleAccess !== 'object' || Array.isArray(puzzleAccess)) {
    return { error: 'Puzzle access settings are required' };
  }

  const puzzlesByCategory = new Map();
  for (const puzzle of puzzles) {
    const categoryPuzzles = puzzlesByCategory.get(puzzle.category) || [];
    categoryPuzzles.push(puzzle);
    puzzlesByCategory.set(puzzle.category, categoryPuzzles);
  }

  const normalizedPuzzleAccess = {};
  const grantedPuzzleIds = new Set();
  for (const [category, settings] of Object.entries(puzzleAccess)) {
    const categoryPuzzles = puzzlesByCategory.get(category);
    if (!categoryPuzzles || !settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return { error: `Invalid puzzle category: ${category}` };
    }

    const {
      enabled,
      limit = 0,
      rangeStart = null,
      rangeEnd = null,
      specificPuzzles = []
    } = settings;
    const hasRange = rangeStart !== null || rangeEnd !== null;
    if (
      typeof enabled !== 'boolean' ||
      !Number.isSafeInteger(limit) || limit < 0 ||
      (hasRange && (
        !Number.isSafeInteger(rangeStart) ||
        !Number.isSafeInteger(rangeEnd) ||
        rangeStart < 1 ||
        rangeEnd < rangeStart ||
        rangeEnd > categoryPuzzles.length
      )) ||
      !Array.isArray(specificPuzzles) ||
      specificPuzzles.some(number =>
        !Number.isSafeInteger(number) || number < 1 || number > categoryPuzzles.length
      )
    ) {
      return { error: `Invalid puzzle access settings for ${category}` };
    }

    const uniqueSpecificPuzzles = [...new Set(specificPuzzles)];
    normalizedPuzzleAccess[category] = {
      enabled,
      limit,
      rangeStart: hasRange ? rangeStart : null,
      rangeEnd: hasRange ? rangeEnd : null,
      specificPuzzles: uniqueSpecificPuzzles
    };
    if (!enabled) continue;

    categoryPuzzles.forEach((puzzle, index) => {
      const position = index + 1;
      const allowed = hasRange || uniqueSpecificPuzzles.length > 0
        ? (hasRange && position >= rangeStart && position <= rangeEnd) ||
          uniqueSpecificPuzzles.includes(position)
        : limit <= 0 || position <= limit;
      if (allowed) grantedPuzzleIds.add(String(puzzle._id));
    });
  }

  return {
    puzzleAccess: normalizedPuzzleAccess,
    puzzleIds: Array.from(grantedPuzzleIds)
  };
}
