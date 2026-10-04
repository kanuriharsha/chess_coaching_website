export function canReadUserContentAccess(requester, requestedUserId) {
  if (requester?.role === 'admin') return true;
  return Boolean(requester?._id && requestedUserId &&
    String(requester._id) === String(requestedUserId));
}

export function getUserContentAccessStatus(requester, requestedUserId) {
  if (!requester) return 401;
  return canReadUserContentAccess(requester, requestedUserId) ? 200 : 403;
}

export function filterVisibleItems(items, access, section, allowedIdsField) {
  const settings = access?.[section];
  const allowedIds = (settings?.[allowedIdsField] || []).map(String);
  return items.filter(item => item.isEnabled !== false).map(item => {
    const isLocked = settings?.enabled !== true ||
      (allowedIds.length > 0 && !allowedIds.includes(String(item._id ?? item.id)));
    if (!isLocked) return item;

    const safeItem = typeof item.toObject === 'function' ? item.toObject() : { ...item };
    delete safeItem.moves;
    delete safeItem.startFen;
    delete safeItem.solution;
    delete safeItem.moveTree;
    delete safeItem.preloadedMove;
    delete safeItem.hint;
    delete safeItem.highlights;
    return { ...safeItem, isLocked: true };
  });
}

function isPuzzleCategoryVisible(categorySettings, viewer) {
  if (categorySettings?.isEnabled === false) return false;
  if (!categorySettings?.groupsConfigured) return true;
  const groupId = viewer.groupId ? String(viewer.groupId) : '';
  return !!groupId && (categorySettings.allowedGroups || []).some(id => String(id) === groupId);
}

function isPuzzleAllowedByAccess(access, category, position) {
  const settings = access?.puzzleAccess?.[category];
  if (settings?.enabled !== true) return false;

  const rangeStart = Number(settings.rangeStart);
  const rangeEnd = Number(settings.rangeEnd);
  const hasRange = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) &&
    rangeStart > 0 && rangeEnd >= rangeStart;
  const specificPuzzles = Array.isArray(settings.specificPuzzles)
    ? settings.specificPuzzles.map(Number).filter(Number.isFinite)
    : [];

  if (hasRange || specificPuzzles.length > 0) {
    return (hasRange && position >= rangeStart && position <= rangeEnd) ||
      specificPuzzles.includes(position);
  }

  const limit = Number(settings.limit) || 0;
  return limit <= 0 || position <= limit;
}

export function filterVisiblePuzzles(puzzles, access, categorySettings, viewer) {
  if (viewer.role === 'admin') return puzzles;

  const settingsByCategory = new Map(categorySettings.map(settings => [settings.categoryId, settings]));
  const positionsByCategory = new Map();
  return puzzles.reduce((visible, puzzle) => {
    const puzzleCategory = puzzle.category;
    const categoryPosition = (positionsByCategory.get(puzzleCategory) || 0) + 1;
    positionsByCategory.set(puzzleCategory, categoryPosition);

    const categorySettingsForPuzzle = settingsByCategory.get(puzzleCategory);
    if (!isPuzzleCategoryVisible(categorySettingsForPuzzle, viewer)) return visible;
    const isLocked = !isPuzzleAllowedByAccess(access, puzzleCategory, categoryPosition);

    const puzzleData = typeof puzzle.toObject === 'function' ? puzzle.toObject() : puzzle;
    if (isLocked) {
      const safePuzzle = { ...puzzleData };
      delete safePuzzle.fen;
      delete safePuzzle.solution;
      delete safePuzzle.moveTree;
      delete safePuzzle.preloadedMove;
      delete safePuzzle.hint;
      delete safePuzzle.successMessage;
      visible.push({ ...safePuzzle, originalIndex: categoryPosition, isLocked: true });
    } else {
      visible.push({ ...puzzleData, originalIndex: categoryPosition, isLocked: false });
    }
    return visible;
  }, []);
}
