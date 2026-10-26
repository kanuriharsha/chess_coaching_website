export function isAdminRole(user) {
  return user?.role === 'admin' || user?.role === 'superadmin';
}

export function getContentOwnerId(user) {
  return user?.role === 'student' ? user.adminId : user?._id;
}

export function canManageStudent(requester, student) {
  return Boolean(
    isAdminRole(requester) &&
    student?.role === 'student' &&
    requester?._id &&
    student?.adminId &&
    String(requester._id) === String(student.adminId)
  );
}

export function canReadUserContentAccess(requester, requestedUserId, targetStudent) {
  if (requester?._id && requestedUserId && String(requester._id) === String(requestedUserId)) {
    return true;
  }
  return canManageStudent(requester, targetStudent);
}

export function getUserContentAccessStatus(requester, requestedUserId, targetStudent) {
  if (!requester) return 401;
  return canReadUserContentAccess(requester, requestedUserId, targetStudent) ? 200 : 403;
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

export function filterVisibleColumnContents(items, access, column, viewer, grantedContentIds = null) {
  if (viewer?.role === 'admin' || viewer?.role === 'superadmin') return items;
  if (viewer?.role !== 'student' || column?.isEnabled === false) return [];

  const settings = access?.columnAccess?.[String(column._id)];
  if (settings?.enabled !== true) return [];
  const allowedIds = Array.isArray(settings.allowedContentIds)
    ? new Set(settings.allowedContentIds.map(String))
    : new Set();
  const grantIds = grantedContentIds ? new Set(grantedContentIds.map(String)) : null;
  return items.filter(item =>
    item.isEnabled !== false &&
    (allowedIds.size === 0 || allowedIds.has(String(item._id ?? item.id))) &&
    (!grantIds || grantIds.has(String(item._id ?? item.id)))
  );
}

export function areColumnsCompatible(sourceColumn, adminColumn) {
  if (sourceColumn.contentType !== adminColumn.contentType) return false;
  if (sourceColumn.contentType !== 'generic') return true;
  return String(sourceColumn.title || '').trim().toLowerCase() ===
    String(adminColumn.title || '').trim().toLowerCase();
}

export function getGrantedColumnContentIds(access, column) {
  const settings = access?.columnAccess?.[String(column._id)];
  if (settings) {
    return settings.enabled === true && Array.isArray(settings.allowedContentIds)
      ? [...new Set(settings.allowedContentIds.map(String))]
      : [];
  }
  const legacyGrants = {
    opening: ['openingAccess', 'allowedOpenings'],
    famousMate: ['famousMatesAccess', 'allowedMates'],
    bestGame: ['bestGamesAccess', 'allowedGames']
  };
  const [accessKey, idsKey] = legacyGrants[column.contentType] || [];
  if (accessKey && access?.[accessKey]?.enabled === true) {
    return [...new Set((access[accessKey][idsKey] || []).map(String))];
  }
  return [];
}

export function filterColumnsForAdmin(columns, adminColumns) {
  return columns.filter(sourceColumn =>
    adminColumns.some(adminColumn => areColumnsCompatible(sourceColumn, adminColumn))
  );
}

function isPuzzleCategoryVisible(categorySettings, viewer) {
  if (categorySettings?.isEnabled === false) return false;
  if (!categorySettings?.groupsConfigured) return true;
  const groupId = viewer.groupId ? String(viewer.groupId) : '';
  return !!groupId && (categorySettings.allowedGroups || []).some(id => String(id) === groupId);
}

function isPuzzleAllowedByAccess(access, category, position, accessKey = 'puzzleAccess') {
  const settings = access?.[accessKey]?.[category];
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

export function filterVisiblePuzzles(puzzles, access, categorySettings, viewer, accessKey = 'puzzleAccess') {
  if (viewer.role === 'admin' || viewer.role === 'superadmin') return puzzles;

  const settingsByCategory = new Map(categorySettings.map(settings => [settings.categoryId, settings]));
  const positionsByCategory = new Map();
  return puzzles.reduce((visible, puzzle) => {
    const puzzleCategory = puzzle.category;
    const categoryPosition = (positionsByCategory.get(puzzleCategory) || 0) + 1;
    positionsByCategory.set(puzzleCategory, categoryPosition);

    if (
      accessKey === 'practiceWithAiAccess' &&
      access?.practiceWithAiAccess?.[puzzleCategory]?.hidden === true
    ) return visible;

    const categorySettingsForPuzzle = settingsByCategory.get(puzzleCategory);
    if (!isPuzzleCategoryVisible(categorySettingsForPuzzle, viewer)) return visible;
    const isLocked = !isPuzzleAllowedByAccess(access, puzzleCategory, categoryPosition, accessKey);

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
