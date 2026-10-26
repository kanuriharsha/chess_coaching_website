import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Chess } from 'chess.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  canManageStudent,
  filterVisibleColumnContents,
  filterColumnsForAdmin,
  areColumnsCompatible,
  getGrantedColumnContentIds,
  filterVisibleItems,
  filterVisiblePuzzles,
  getContentOwnerId,
  getUserContentAccessStatus,
  isAdminRole
} from './contentAccess.js';
import { registerLiveGameValidationHandlers } from './liveGameHandlers.js';
import {
  buildPuzzleProgress,
  buildPuzzleProgressAttemptUpdate
} from './puzzleProgress.js';
import {
  buildAdminContentQuery,
  buildAdminPuzzleGrant,
  migrateLegacyAdminPuzzleAccess
} from './adminPuzzleAccess.js';
import PuzzleProgress from './puzzleProgressModel.js';

const app = express();
const httpServer = createServer(app);

// CORS configuration - Allow local Vite development and configured production URLs
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.CORS_ORIGIN || null
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return /^https?:\/\/localhost:\d+$/.test(origin) || /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
};

const io = new Server(httpServer, {
  cors: corsOptions
});

const PORT = process.env.PORT || 5000;

// MongoDB Connection String (use environment variable in production)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://harsha:harsha@cluster0.gwmwpwl.mongodb.net/harshachess?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET?.trim()) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

// Helper to create a loose regex that ignores spaces and case between characters
function makeLooseRegex(input) {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.replace(/\s+/g, '');
  // escape regex special chars
  const escaped = cleaned.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  // allow any amount of whitespace between characters and match full string
  const parts = escaped.split('');
  return new RegExp('^' + parts.map(c => c + '\\s*').join('') + '$', 'i');
}

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB - harshachess database'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Group Schema - for grouping students
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
groupSchema.index({ adminId: 1, name: 1 }, { unique: true });
const Group = mongoose.model('Group', groupSchema, 'groups');

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'superadmin', 'student'], default: 'student' },
  verificationStatus: { type: String, enum: ['under_review', 'verified', 'rejected'], default: undefined },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isEnabled: { type: Boolean, default: true },
  onboardingComplete: { type: Boolean, default: false },
  joiningDate: { type: Date },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  attendance: [{
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent'], required: true },
    note: { type: String }
  }],
  achievements: [{
    title: { type: String, required: true },
    description: { type: String },
    date: { type: Date, default: Date.now },
    icon: { type: String, default: '🏆' }
  }],
  profile: {
    fullName: String,
    classDesignation: String,
    phone: String,
    gender: String,
    dateOfBirth: String,
    fatherName: String,
    motherName: String,
    email: String,
    village: String,
    state: String,
    country: String,
    schoolName: String,
    chessTitle: String,
    fideId: String
  },
  // Fees records for monthly payments
  fees: [{
    month: { type: Number, required: true }, // 1-12
    year: { type: Number, required: true },
    paid: { type: Boolean, default: false },
    secretNote: { type: String, default: '' }, // Admin-only secret note
    secretVisible: { type: Boolean, default: false }, // Whether secret note is visible to admin
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  commonNote: { type: String, default: '' }, // Admin-only common note for all fees
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'superadmin' } });
const User = mongoose.model('User', userSchema, 'login');

async function getAuthenticatedUser(req, fields = '_id role') {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) return null;
    throw error;
  }

  if (!decoded || typeof decoded !== 'object' || !decoded.id) return null;
  return User.findById(decoded.id).select(fields);
}

function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req, '_id role adminId isEnabled');
      if (!user || user.isEnabled === false) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      if (!roles.includes(user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      req.authUser = user;
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(401).json({ message: 'Invalid token' });
    }
  };
}

app.use('/api', async (req, res, next) => {
  if (!req.headers.authorization) return next();
  try {
    const user = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!user || user.isEnabled === false) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.authUser = user;
    next();
  } catch (error) {
    console.error('API authentication error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

app.use('/api/users/:id', async (req, res, next) => {
  try {
    const requestingUser = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!requestingUser || requestingUser.isEnabled === false) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const targetUser = await User.findById(req.params.id).select('_id role adminId');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const isSelf = requestingUser._id.equals(targetUser._id);
    const ownsStudent = canManageStudent(requestingUser, targetUser);
    if (!isSelf && !ownsStudent) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.authUser = requestingUser;
    req.targetUser = targetUser;
    next();
  } catch (error) {
    console.error('User ownership check error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Puzzle Schema
const puzzleSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String },
  fen: { type: String, required: true },
  solution: [{ type: String }],
  hint: { type: String },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  icon: { type: String, default: '♔' },
  isEnabled: { type: Boolean, default: true },
  allowedGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  preloadedMove: { type: String }, // Optional move to execute automatically before student plays
  successMessage: { type: String, default: 'Checkmate! Brilliant move!' }, // Custom success message when puzzle is solved
  order: { type: Number, default: 0 }, // Order for manual arrangement
  // Branching move tree – flat list of nodes with parent references
  // Each node: { id: string, move: string (SAN), parentId: string|null }
  // parentId === null means root-level (first moves of any variation line)
  moveTree: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Puzzle = mongoose.model('Puzzle', puzzleSchema, 'puzzles');

function validatePuzzlePayload(payload) {
  if (!payload || typeof payload.fen !== 'string' || !payload.fen.trim()) {
    return 'A valid FEN string is required';
  }

  let initialGame;
  try {
    initialGame = new Chess(payload.fen);
  } catch {
    return 'Invalid puzzle FEN';
  }

  let solutionStart = initialGame;
  if (payload.preloadedMove !== undefined && payload.preloadedMove !== null && payload.preloadedMove !== '') {
    if (typeof payload.preloadedMove !== 'string' || !payload.preloadedMove.trim()) {
      return 'Invalid preloaded move';
    }

    try {
      const preloadedFen = initialGame.fen().split(' ');
      preloadedFen[1] = preloadedFen[1] === 'w' ? 'b' : 'w';
      solutionStart = new Chess(preloadedFen.join(' '));
      if (!solutionStart.move(payload.preloadedMove.trim())) {
        return 'Invalid preloaded move';
      }
    } catch {
      return 'Invalid preloaded move';
    }
  }

  if (payload.solution !== undefined && !Array.isArray(payload.solution)) {
    return 'Puzzle solution must be an array of moves';
  }

  let solutionGame = new Chess(solutionStart.fen());
  for (const [index, step] of (payload.solution || []).entries()) {
    if (typeof step !== 'string' || !step.trim()) {
      return `Invalid solution move at step ${index + 1}`;
    }

    const alternatives = step.split(',').map(move => move.trim()).filter(Boolean);
    if (alternatives.length === 0) {
      return `Invalid solution move at step ${index + 1}`;
    }

    let primaryResult = null;
    for (const [alternativeIndex, move] of alternatives.entries()) {
      const candidate = new Chess(solutionGame.fen());
      try {
        if (!candidate.move(move)) {
          return `Illegal solution move at step ${index + 1}`;
        }
      } catch {
        return `Illegal solution move at step ${index + 1}`;
      }
      if (alternativeIndex === 0) primaryResult = candidate;
    }
    solutionGame = primaryResult;
  }

  if (payload.moveTree !== undefined && payload.moveTree !== null) {
    if (!Array.isArray(payload.moveTree)) {
      return 'Puzzle moveTree must be an array';
    }

    const nodes = new Map();
    for (const node of payload.moveTree) {
      if (
        !node ||
        typeof node.id !== 'string' ||
        !node.id ||
        typeof node.move !== 'string' ||
        !node.move.trim() ||
        (node.parentId !== null && typeof node.parentId !== 'string')
      ) {
        return 'Invalid puzzle moveTree node';
      }
      if (nodes.has(node.id)) return 'Duplicate puzzle moveTree node id';
      nodes.set(node.id, node);
    }

    const children = new Map();
    for (const node of nodes.values()) {
      if (node.parentId !== null && !nodes.has(node.parentId)) {
        return 'Puzzle moveTree references a missing parent';
      }
      const siblings = children.get(node.parentId) || [];
      siblings.push(node);
      children.set(node.parentId, siblings);
    }

    const visited = new Set();
    const visiting = new Set();
    const visitNode = (node, parentGame) => {
      if (visiting.has(node.id)) return 'Puzzle moveTree contains a cycle';
      if (visited.has(node.id)) return null;
      visiting.add(node.id);

      const alternatives = node.move.split(',').map(move => move.trim()).filter(Boolean);
      if (alternatives.length === 0) {
        return `Invalid puzzle moveTree move at node ${node.id}`;
      }

      let primaryResult = null;
      for (const [alternativeIndex, move] of alternatives.entries()) {
        const candidate = new Chess(parentGame.fen());
        try {
          if (!candidate.move(move)) {
            return `Illegal puzzle moveTree move at node ${node.id}`;
          }
        } catch {
          return `Illegal puzzle moveTree move at node ${node.id}`;
        }
        if (alternativeIndex === 0) primaryResult = candidate;
      }

      for (const child of children.get(node.id) || []) {
        const error = visitNode(child, primaryResult);
        if (error) return error;
      }

      visiting.delete(node.id);
      visited.add(node.id);
      return null;
    };

    for (const root of children.get(null) || []) {
      const error = visitNode(root, solutionStart);
      if (error) return error;
    }
    if (visited.size !== nodes.size) return 'Puzzle moveTree contains an unreachable node or cycle';
  }

  return null;
}

// Opening Schema
const openingSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String, required: true },
  startFen: { type: String }, // Optional: custom starting position
  moves: [{
    san: { type: String, required: true },
    comment: { type: String },
    evaluation: { type: String, enum: ['best', 'brilliant', 'good', 'inaccuracy'] }
  }],
  isEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Opening = mongoose.model('Opening', openingSchema, 'openings');

// Famous Mates Schema
const famousMateSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String, required: true, default: 'Famous Mates' },
  startFen: { type: String }, // Optional: custom starting position
  moves: [{
    san: { type: String, required: true },
    comment: { type: String },
    evaluation: { type: String, enum: ['best', 'brilliant', 'good', 'inaccuracy'] }
  }],
  isEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const FamousMate = mongoose.model('FamousMate', famousMateSchema, 'famousmates');

// Best Game Schema
const bestGameSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  players: { type: String, required: true },
  description: { type: String },
  category: { type: String, enum: ['brilliant', 'best', 'blunder'], default: 'best' },
  startFen: { type: String }, // Optional: custom starting position
  moves: [{ type: String }],
  highlights: [{ type: Number }],
  isEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const BestGame = mongoose.model('BestGame', bestGameSchema, 'bestgames');

const columnSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  icon: { type: String, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contentType: { type: String, enum: ['opening', 'bestGame', 'famousMate', 'generic'], default: 'generic' },
  isEnabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'columns' });
columnSchema.index({ adminId: 1, order: 1 });
const Column = mongoose.model('Column', columnSchema);

const columnContentSchema = new mongoose.Schema({
  columnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Column', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contentType: { type: String, enum: ['opening', 'bestGame', 'famousMate', 'generic'], default: 'generic' },
  isEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'columncontents', strict: false });
columnContentSchema.index({ columnId: 1, adminId: 1, createdAt: -1 });
const ColumnContent = mongoose.model('ColumnContent', columnContentSchema);

// Puzzle Category Schema - stores custom puzzle categories server-side
const puzzleCategorySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  categoryId: { type: String, required: true }, // slug e.g. 'gain-a-queen'
  name: { type: String, required: true },
  description: { type: String, default: 'Custom puzzle category' },
  icon: { type: String, default: '\u265F' },
  order_index: { type: Number, default: 999 }, // Admin-defined display order
  createdAt: { type: Date, default: Date.now }
});
puzzleCategorySchema.index({ adminId: 1, categoryId: 1 }, { unique: true });
const PuzzleCategory = mongoose.model('PuzzleCategory', puzzleCategorySchema, 'puzzlecategories');

// Puzzle Category Order Schema - stores display order for ALL categories (default + custom)
const puzzleCategoryOrderSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  categoryId: { type: String, required: true },
  order_index: { type: Number, required: true, default: 0 },
  isEnabled: { type: Boolean, default: true },
  allowedGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  groupsConfigured: { type: Boolean, default: false }
});
puzzleCategoryOrderSchema.index({ adminId: 1, categoryId: 1 }, { unique: true });
const PuzzleCategoryOrder = mongoose.model('PuzzleCategoryOrder', puzzleCategoryOrderSchema, 'puzzlecategoryorder');

// Content Access Schema - Controls what content users can access
// puzzleAccess uses Mixed type so any custom category can be stored without being dropped
const contentAccessSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Puzzle access by category - Mixed allows any category key (including custom ones)
  puzzleAccess: { type: mongoose.Schema.Types.Mixed, default: {} },
  practiceWithAiAccess: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Retained for migrating students who previously received the legacy feature toggle.
  practiceWithAiEnabled: { type: Boolean, default: false },
  // Opening access
  openingAccess: {
    enabled: { type: Boolean, default: false },
    allowedOpenings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Opening' }]
  },
  // Famous Mates access
  famousMatesAccess: {
    enabled: { type: Boolean, default: false },
    allowedMates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FamousMate' }]
  },
  // Best games access
  bestGamesAccess: {
    enabled: { type: Boolean, default: false },
    allowedGames: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BestGame' }]
  },
  columnAccess: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ContentAccess = mongoose.model('ContentAccess', contentAccessSchema, 'contentaccess');

const adminPuzzleAccessSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Read only for migration of old records; new grants store category settings instead.
  puzzleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Puzzle' }],
  puzzleAccess: { type: mongoose.Schema.Types.Mixed, default: {} },
  openingAccess: {
    enabled: { type: Boolean, default: false },
    allowedOpenings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Opening' }]
  },
  famousMatesAccess: {
    enabled: { type: Boolean, default: false },
    allowedMates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FamousMate' }]
  },
  bestGamesAccess: {
    enabled: { type: Boolean, default: false },
    allowedGames: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BestGame' }]
  },
  columnAccess: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'adminpuzzleaccess' });
const AdminPuzzleAccess = mongoose.model('AdminPuzzleAccess', adminPuzzleAccessSchema);

async function getContentAccessForUser(userId) {
  return ContentAccess.findOne({ userId }).lean();
}

function getPracticeWithAiAccess(access) {
  const puzzleAccess = access?.puzzleAccess && typeof access.puzzleAccess === 'object' &&
    !Array.isArray(access.puzzleAccess)
    ? access.puzzleAccess
    : {};
  const practiceAccess = access?.practiceWithAiAccess;
  return {
    ...puzzleAccess,
    ...(practiceAccess && typeof practiceAccess === 'object' && !Array.isArray(practiceAccess)
      ? practiceAccess
      : {})
  };
}

async function getResolvedAdminPuzzleAccess(adminId) {
  const access = await AdminPuzzleAccess.findOne({ adminId })
    .select('grantedBy puzzleAccess puzzleIds openingAccess famousMatesAccess bestGamesAccess columnAccess')
    .lean();
  if (!access?.grantedBy) return { grantedBy: null, puzzleAccess: {}, puzzleIds: [] };

  const puzzles = await Puzzle.find({ adminId: access.grantedBy, isEnabled: true })
    .select('_id category order createdAt')
    .sort({ category: 1, order: 1, createdAt: 1 })
    .lean();
  const savedSettings = access.puzzleAccess && typeof access.puzzleAccess === 'object'
    ? access.puzzleAccess
    : {};
  const migratedSettings = migrateLegacyAdminPuzzleAccess(
    puzzles,
    savedSettings,
    access.puzzleIds || []
  );
  const availableCategories = new Set(puzzles.map(puzzle => puzzle.category));
  const puzzleAccess = Object.fromEntries(
    Object.entries(migratedSettings).filter(([category]) => availableCategories.has(category))
  );
  const grant = buildAdminPuzzleGrant(puzzles, puzzleAccess);
  if (grant.error) throw new Error(`Invalid saved admin puzzle access: ${grant.error}`);

  const hasLegacyPuzzleIds = Array.isArray(access.puzzleIds);
  const needsSettingsMigration =
    Object.keys(savedSettings).length === 0 &&
    Object.keys(puzzleAccess).length > 0;
  if (hasLegacyPuzzleIds || needsSettingsMigration) {
    const update = { $unset: { puzzleIds: '' } };
    if (needsSettingsMigration) update.$set = { puzzleAccess, updatedAt: new Date() };
    await AdminPuzzleAccess.updateOne({ _id: access._id }, update);
  }

  return {
    grantedBy: access.grantedBy,
    puzzleAccess,
    puzzleIds: grant.puzzleIds,
    openingAccess: {
      enabled: access.openingAccess?.enabled === true,
      allowedOpenings: (access.openingAccess?.allowedOpenings || []).map(String)
    },
    famousMatesAccess: {
      enabled: access.famousMatesAccess?.enabled === true,
      allowedMates: (access.famousMatesAccess?.allowedMates || []).map(String)
    },
    bestGamesAccess: {
      enabled: access.bestGamesAccess?.enabled === true,
      allowedGames: (access.bestGamesAccess?.allowedGames || []).map(String)
    },
    columnAccess: access.columnAccess && typeof access.columnAccess === 'object'
      ? access.columnAccess
      : {}
  };
}

async function getAdminPuzzleQuery(adminId) {
  const access = await getResolvedAdminPuzzleAccess(adminId);
  const grantedPuzzleIds = access.puzzleIds;
  return {
    $or: [
      { adminId },
      ...(grantedPuzzleIds.length > 0
        ? [{ _id: { $in: grantedPuzzleIds }, isEnabled: true }]
        : [])
    ]
  };
}

async function getAdminContentQuery(adminId, accessKey, allowedIdsKey) {
  const access = await AdminPuzzleAccess.findOne({ adminId })
    .select(`grantedBy ${accessKey}`)
    .lean();
  const settings = access?.[accessKey];
  return buildAdminContentQuery(adminId, access?.grantedBy, settings, allowedIdsKey);
}

const SUPPORTED_COLUMN_ICONS = new Set([
  'BookOpen', 'Trophy', 'Crown', 'Puzzle', 'Star', 'Target', 'Lightbulb', 'Swords'
]);
const PRESET_COLUMN_TYPES = {
  opening: { title: 'Openings', icon: 'BookOpen' },
  famousMate: { title: 'Famous Mates', icon: 'Crown' },
  bestGame: { title: 'Best Games', icon: 'Trophy' }
};

async function getColumnsVisibleTo(viewer) {
  const ownerId = getContentOwnerId(viewer);
  if (!ownerId) return [];
  const ownColumns = await Column.find({ adminId: ownerId }).sort({ order: 1, createdAt: 1 }).lean();
  const adminGrant = await getResolvedAdminPuzzleAccess(ownerId);
  if (!adminGrant.grantedBy) return ownColumns;
  const grantedColumns = await Column.find({ adminId: adminGrant.grantedBy, isEnabled: true })
    .sort({ order: 1, createdAt: 1 })
    .lean();
  const eligibleGrantedColumns = filterColumnsForAdmin(grantedColumns, ownColumns);
  const sourceColumnsByAdminColumn = new Map();
  for (const adminColumn of ownColumns) {
    sourceColumnsByAdminColumn.set(String(adminColumn._id), eligibleGrantedColumns
      .filter(sourceColumn => filterColumnsForAdmin([sourceColumn], [adminColumn]).length > 0)
      .filter(sourceColumn => getGrantedColumnContentIds(adminGrant, sourceColumn).length > 0)
      .map(sourceColumn => String(sourceColumn._id)));
  }
  return ownColumns
    .map(column => ({
      ...column,
      sharedColumnIds: sourceColumnsByAdminColumn.get(String(column._id)) || []
    }))
    .sort((a, b) => a.order - b.order);
}

async function getColumnContentsVisibleTo(viewer, column) {
  const ownerId = getContentOwnerId(viewer);
  const ownContents = await ColumnContent.find({
    columnId: column._id,
    adminId: column.adminId
  }).sort({ order: 1, createdAt: -1 }).lean();
  let sharedContents = [];
  if (viewer.role !== 'superadmin' && String(column.adminId) === String(ownerId) && column.sharedColumnIds?.length) {
    const adminGrant = await getResolvedAdminPuzzleAccess(ownerId);
    const sources = await Column.find({
      _id: { $in: column.sharedColumnIds },
      adminId: adminGrant.grantedBy,
      isEnabled: true
    }).lean();
    sharedContents = (await Promise.all(sources.map(async sourceColumn => {
      const allowedIds = getGrantedColumnContentIds(adminGrant, sourceColumn);
      if (!allowedIds.length) return [];
      return ColumnContent.find({
        columnId: sourceColumn._id,
        adminId: sourceColumn.adminId,
        _id: { $in: allowedIds },
        isEnabled: { $ne: false }
      }).sort({ order: 1, createdAt: -1 }).lean().then(items =>
        items.map(item => ({ ...item, isShared: true, sourceColumnId: String(sourceColumn._id) }))
      );
    }))).flat();
  }
  const contents = [...ownContents, ...sharedContents];
  if (viewer.role === 'admin' || viewer.role === 'superadmin') return contents;
  const access = await getContentAccessForUser(viewer._id);
  return filterVisibleColumnContents(
    contents,
    access,
    column,
    viewer
  );
}

function normalizeColumnContentPayload(body, contentType) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const title = typeof body.title === 'string' ? body.title.trim()
    : typeof body.name === 'string' ? body.name.trim()
      : '';
  if (!title) return null;
  if (
    contentType === 'bestGame' &&
    (typeof body.players !== 'string' || !body.players.trim() ||
      !['brilliant', 'best', 'blunder'].includes(body.category))
  ) return null;
  const moves = body.moves;
  if (moves !== undefined && (!Array.isArray(moves) || moves.some(move =>
    typeof move !== 'string' &&
    (!move || typeof move !== 'object' || typeof move.san !== 'string')
  ))) return null;
  if (Array.isArray(moves) && moves.some(move =>
    typeof move === 'object' && move !== null && (
      (move.comment !== undefined && typeof move.comment !== 'string') ||
      (move.evaluation !== undefined &&
        !['best', 'brilliant', 'good', 'inaccuracy'].includes(move.evaluation))
    )
  )) return null;
  const startFen = typeof body.startFen === 'string' && body.startFen ? body.startFen : undefined;
  try {
    const chessGame = new Chess(startFen);
    for (const move of moves || []) {
      const san = typeof move === 'string' ? move : move.san;
      if (!chessGame.move(san)) return null;
    }
  } catch {
    return null;
  }

  const result = {
    title,
    name: title,
    contentType,
    description: typeof body.description === 'string' ? body.description : '',
    category: typeof body.category === 'string' ? body.category : contentType === 'bestGame' ? 'best' : 'General',
    startFen,
    moves: moves || [],
    isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : true
  };
  if (typeof body.players === 'string') result.players = body.players;
  if (Array.isArray(body.highlights) && body.highlights.every(Number.isSafeInteger)) {
    result.highlights = body.highlights;
  } else if (body.highlights !== undefined) {
    return null;
  }
  if (Number.isSafeInteger(body.order)) result.order = body.order;
  return result;
}

async function belongToAdminGroups(groupIds, adminId) {
  if (!Array.isArray(groupIds) || groupIds.some(id => !mongoose.isValidObjectId(id))) return false;
  const uniqueIds = [...new Set(groupIds.map(String))];
  const ownedGroups = await Group.countDocuments({ _id: { $in: uniqueIds }, adminId });
  return ownedGroups === uniqueIds.length;
}

async function getVisiblePuzzles(viewer, category, accessKey = 'puzzleAccess') {
  const adminId = getContentOwnerId(viewer);
  const ownershipQuery = viewer.role === 'superadmin'
    ? { adminId }
    : await getAdminPuzzleQuery(adminId);
  const query = { ...ownershipQuery };
  if (category) query.category = category;
  if (!isAdminRole(viewer)) query.isEnabled = true;

  const [puzzles, access, categorySettings] = await Promise.all([
    Puzzle.find(query).sort({ order: 1, createdAt: 1 }),
    isAdminRole(viewer) ? null : getContentAccessForUser(viewer._id),
    isAdminRole(viewer) ? [] : PuzzleCategoryOrder.find(
      category ? { adminId, categoryId: category } : { adminId }
    ).lean()
  ]);

  if (isAdminRole(viewer)) {
    return puzzles.map(puzzle => ({
      ...puzzle.toObject(),
      isOwned: String(puzzle.adminId) === String(viewer._id)
    }));
  }
  const effectiveAccess = accessKey === 'practiceWithAiAccess'
    ? { ...access, practiceWithAiAccess: getPracticeWithAiAccess(access) }
    : access;
  return filterVisiblePuzzles(puzzles, effectiveAccess, categorySettings, viewer, accessKey);
}

// Get compact puzzle progress and recommendations for the admin access modal.
app.get('/api/users/:id/puzzle-recommendations', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id).select('_id role');
    if (!requestingUser || !isAdminRole(requestingUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const userId = new mongoose.Types.ObjectId(req.params.id);
    const student = await User.findOne({
      _id: userId,
      role: 'student',
      adminId: requestingUser._id
    }).select('_id');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const adminPuzzleQuery = await getAdminPuzzleQuery(requestingUser._id);
    const [studentPuzzles, solvedGroups] = await Promise.all([
      Puzzle.find({ $and: [adminPuzzleQuery, { isEnabled: true }] })
        .select('_id category order createdAt')
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      PuzzleProgress.find({ userId, completed: true }).select('puzzleId').lean()
    ]);
    const solvedPuzzleIds = new Set(solvedGroups.map(item => String(item.puzzleId)));

    const solvedByCategory = {};
    const solvedNumbersByCategory = {};
    const categoryTotalsById = new Map();
    const categoryPositions = new Map();
    studentPuzzles.forEach(puzzle => {
      categoryTotalsById.set(
        puzzle.category,
        (categoryTotalsById.get(puzzle.category) || 0) + 1
      );
      const position = (categoryPositions.get(puzzle.category) || 0) + 1;
      categoryPositions.set(puzzle.category, position);
      if (solvedPuzzleIds.has(String(puzzle._id))) {
        solvedByCategory[puzzle.category] = (solvedByCategory[puzzle.category] || 0) + 1;
        if (!solvedNumbersByCategory[puzzle.category]) solvedNumbersByCategory[puzzle.category] = [];
        solvedNumbersByCategory[puzzle.category].push(position);
      }
    });

    const categories = Array.from(categoryTotalsById, ([category, total]) => {
      const completed = solvedByCategory[category] || 0;
      const progress = total > 0 ? (completed / total) * 100 : 0;
      return {
        category,
        completed,
        total,
        remaining: Math.max(0, total - completed),
        progress: Number(progress.toFixed(1)),
        solvedPuzzleNumbers: (solvedNumbersByCategory[category] || []).filter(number => number > 0)
      };
    });

    const averageProgress = categories.length > 0
      ? categories.reduce((sum, category) => sum + (category.completed / category.total) * 100, 0) / categories.length
      : 0;
    const roundedAverage = Number(averageProgress.toFixed(1));

    const recommendations = categories.map(category => {
      const targetPuzzle = Math.min(category.total, Math.ceil(category.total * averageProgress / 100));
      const isBehindAverage = (category.completed / category.total) * 100 < averageProgress;
      const recommendedStart = category.completed < category.total ? category.completed + 1 : null;
      const recommendedEnd = isBehindAverage
        ? Math.max(category.completed, targetPuzzle)
        : category.total;

      return {
        ...category,
        averageProgress: roundedAverage,
        recommendationType: isBehindAverage ? 'catch_up' : 'continue',
        recommendedStart,
        recommendedEnd
      };
    });

    const totalRemaining = recommendations.reduce((sum, category) => sum + category.remaining, 0);
    res.json({ averageProgress: roundedAverage, totalRemaining, categories: recommendations });
  } catch (error) {
    console.error('Get puzzle recommendations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register new user
app.post('/api/auth/register', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });

    const user = await User.create({
      username: username.trim(),
      password: password.trim(),
      role: 'student',
      adminId: req.authUser._id,
      isEnabled: true,
      onboardingComplete: false
    });

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        isEnabled: user.isEnabled,
        onboardingComplete: user.onboardingComplete
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    // Find user by username allowing spaces and case-insensitive variations
    const usernameRegex = makeLooseRegex(username);
    let foundUser = null;
    if (usernameRegex) {
      foundUser = await User.findOne({ username: { $regex: usernameRegex } });
    } else {
      foundUser = await User.findOne({ username });
    }

    if (!foundUser) {
      return res.status(401).json({ message: 'Invalid credentials, please try with correct credentials' });
    }

    // Compare passwords ignoring spaces and case
    const normalize = (s) => (s || '').toString().replace(/\s+/g, '').toLowerCase();
    if (normalize(foundUser.password) !== normalize(password)) {
      return res.status(401).json({ message: 'Invalid credentials, please try with correct credentials' });
    }

    if (foundUser.role === 'admin' && foundUser.verificationStatus === 'under_review') {
      return res.status(403).json({
        message: "Your profile is under review. We'll notify you once verified. This usually takes 15-20 minutes",
        verificationStatus: 'under_review',
        username: foundUser.username
      });
    }

    if (foundUser.role === 'admin' && foundUser.verificationStatus === 'rejected') {
      return res.status(403).json({
        message: 'Your admin profile registration was rejected. Please contact administrator.',
        verificationStatus: 'rejected',
        username: foundUser.username
      });
    }

    if (!foundUser.isEnabled) {
      return res.status(403).json({ message: 'Account disabled' });
    }

    const token = jwt.sign({ id: foundUser._id.toString(), role: foundUser.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: foundUser._id,
        username: foundUser.username,
        role: foundUser.role,
        verificationStatus: foundUser.verificationStatus || (foundUser.role === 'admin' ? 'verified' : undefined),
        isEnabled: foundUser.isEnabled,
        onboardingComplete: foundUser.onboardingComplete,
        profile: foundUser.profile,
        groupId: foundUser.groupId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user._id,
      username: user.username,
      role: user.role,
      verificationStatus: user.verificationStatus || (user.role === 'admin' ? 'verified' : undefined),
      isEnabled: user.isEnabled,
      onboardingComplete: user.onboardingComplete,
      profile: user.profile,
      groupId: user.groupId
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Complete onboarding
app.put('/api/auth/onboarding', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const { profile } = req.body;

    const user = await User.findByIdAndUpdate(
      decoded.id,
      {
        onboardingComplete: true,
        profile,
        updatedAt: new Date()
      },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        isEnabled: user.isEnabled,
        onboardingComplete: user.onboardingComplete,
        profile: user.profile
      }
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin Onboarding public submission
app.post('/api/auth/admin-onboarding', async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      gender,
      dateOfBirth,
      chessTitle,
      fideId,
      village,
      state,
      country,
      username,
      password
    } = req.body || {};

    if (!fullName?.trim() || !email?.trim() || !phone?.trim() || !gender?.trim() || !dateOfBirth?.trim()) {
      return res.status(400).json({ message: 'Personal Information is incomplete. All marked fields (*) are required.' });
    }

    if (!village?.trim() || !state?.trim() || !country?.trim()) {
      return res.status(400).json({ message: 'Chess & Location Information is incomplete. Village, State, and Country are required.' });
    }

    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const trimmedUsername = username.trim();
    const usernameRegex = makeLooseRegex(trimmedUsername);
    const existing = usernameRegex 
      ? await User.findOne({ username: { $regex: usernameRegex } })
      : await User.findOne({ username: trimmedUsername });

    if (existing) {
      return res.status(400).json({ message: 'Username is already taken. Please choose another username.' });
    }

    const newAdmin = await User.create({
      username: trimmedUsername,
      password: password.trim(),
      role: 'admin',
      verificationStatus: 'under_review',
      adminId: null, // superadmin who accepts will be assigned
      isEnabled: true,
      onboardingComplete: true,
      profile: {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        gender: gender.trim(),
        dateOfBirth: dateOfBirth.trim(),
        chessTitle: chessTitle ? chessTitle.trim() : '',
        fideId: fideId ? fideId.trim() : '',
        village: village.trim(),
        state: state.trim(),
        country: country.trim()
      }
    });

    res.status(201).json({
      success: true,
      message: 'Submitted for verification!',
      username: newAdmin.username,
      verificationStatus: 'under_review'
    });
  } catch (error) {
    console.error('Admin onboarding error:', error);
    res.status(500).json({ message: 'Failed to submit admin registration. Please try again.' });
  }
});

// Check Admin Status (used on page refresh or poll)
app.get('/api/auth/admin-status/:username', async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).json({ message: 'Username required' });

    const usernameRegex = makeLooseRegex(username);
    const user = usernameRegex
      ? await User.findOne({ username: { $regex: usernameRegex }, role: 'admin' }).select('-password')
      : await User.findOne({ username, role: 'admin' }).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'Admin request not found' });
    }

    res.json({
      username: user.username,
      role: user.role,
      verificationStatus: user.verificationStatus || 'verified',
      profile: user.profile,
      adminId: user.adminId,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Admin status check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users (admin only)
app.get('/api/users', async (req, res) => {
  try {
    const requestingUser = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!requestingUser || requestingUser.isEnabled === false) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const users = await User.find({ role: 'student', adminId: requestingUser._id })
      .select('-password')
      .populate('groupId', 'name');
    res.json(users.map(user => ({
      id: user._id,
      username: user.username,
      role: user.role,
      adminId: user.adminId,
      isEnabled: user.isEnabled,
      onboardingComplete: user.onboardingComplete,
      joiningDate: user.joiningDate,
      attendance: user.attendance || [],
      achievements: user.achievements || [],
      profile: user.profile,
      commonNote: user.commonNote || '',
      groupId: user.groupId?._id || user.groupId || null,
      groupName: user.groupId?.name || null,
      createdAt: user.createdAt
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Return only the current user's coach account.
app.get('/api/coaches', async (req, res) => {
  try {
    const requestingUser = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!requestingUser || requestingUser.isEnabled === false) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const coachId = isAdminRole(requestingUser) ? requestingUser._id : requestingUser.adminId;
    if (!coachId) return res.json([]);

    const coach = await User.findOne({ _id: coachId, role: { $in: ['admin', 'superadmin'] }, isEnabled: true })
      .select('_id username role isEnabled');
    res.json(coach ? [{
      _id: coach._id.toString(),
      username: coach.username,
      role: coach.role,
      isEnabled: coach.isEnabled
    }] : []);
  } catch (error) {
    console.error('Get coaches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/superadmin/admins', requireRole('superadmin'), async (req, res) => {
  try {
    const admins = await User.find({
      role: 'admin',
      adminId: req.authUser._id,
      verificationStatus: { $ne: 'under_review' }
    })
      .select('-password')
      .populate('adminId', 'username profile.fullName')
      .sort({ createdAt: -1 });

    res.json(admins.map(admin => ({
      id: admin._id,
      username: admin.username,
      role: admin.role,
      isEnabled: admin.isEnabled,
      verificationStatus: admin.verificationStatus || 'verified',
      adminId: admin.adminId?._id || admin.adminId || null,
      adminName: admin.adminId?.profile?.fullName || admin.adminId?.username || null,
      profile: admin.profile,
      createdAt: admin.createdAt
    })));
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/superadmin/admins/:id/puzzle-access', requireRole('superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid admin id' });
    }

    const admin = await User.findOne({
      _id: req.params.id,
      role: 'admin',
      adminId: req.authUser._id
    }).select('_id');
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const [
      puzzles,
      openings,
      famousMates,
      bestGames,
      superAdminColumns,
      adminColumns,
      customCategories,
      categoryOrders,
      resolvedAccess
    ] = await Promise.all([
      Puzzle.find({ adminId: req.authUser._id, isEnabled: true })
        .select('_id name category difficulty order')
        .sort({ category: 1, order: 1, createdAt: 1 })
        .lean(),
      Opening.find({ adminId: req.authUser._id, isEnabled: true })
        .select('_id name')
        .sort({ createdAt: -1 })
        .lean(),
      FamousMate.find({ adminId: req.authUser._id, isEnabled: true })
        .select('_id name')
        .sort({ createdAt: -1 })
        .lean(),
      BestGame.find({ adminId: req.authUser._id, isEnabled: true })
        .select('_id title')
        .sort({ createdAt: -1 })
        .lean(),
      Column.find({ adminId: req.authUser._id, isEnabled: true })
        .select('_id title icon contentType order')
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      Column.find({ adminId: admin._id, isEnabled: true })
        .select('title contentType')
        .lean(),
      PuzzleCategory.find({ adminId: req.authUser._id })
        .select('categoryId name icon order_index')
        .sort({ order_index: 1, createdAt: 1 })
        .lean(),
      PuzzleCategoryOrder.find({ adminId: req.authUser._id })
        .select('categoryId order_index')
        .sort({ order_index: 1 })
        .lean(),
      getResolvedAdminPuzzleAccess(admin._id)
    ]);

    const categoriesById = new Map();
    puzzles.forEach(puzzle => {
      const category = categoriesById.get(puzzle.category) || { category: puzzle.category, total: 0 };
      category.total += 1;
      categoriesById.set(puzzle.category, category);
    });

    const defaultCategoryOrder = [
      'mate-in-1',
      'mate-in-2',
      'mate-in-3',
      'pins',
      'forks',
      'traps'
    ];
    const categoryMetadata = new Map(customCategories.map(category => [
      category.categoryId,
      { name: category.name, icon: category.icon }
    ]));
    const orderedCategories = [
      ...defaultCategoryOrder
        .filter(category => categoriesById.has(category))
        .map(category => categoriesById.get(category)),
      ...customCategories
        .filter(category => categoriesById.has(category.categoryId) && !defaultCategoryOrder.includes(category.categoryId))
        .map(category => categoriesById.get(category.categoryId)),
      ...Array.from(categoriesById.values()).filter(category =>
        !defaultCategoryOrder.includes(category.category) &&
        !categoryMetadata.has(category.category)
      )
    ];
    const categoryOrderMap = new Map(categoryOrders.map(order => [order.categoryId, order.order_index]));
    if (categoryOrders.length > 0) {
      orderedCategories.sort((a, b) =>
        (categoryOrderMap.get(a.category) ?? 999) -
        (categoryOrderMap.get(b.category) ?? 999)
      );
    }

    const grantableColumns = filterColumnsForAdmin(superAdminColumns, adminColumns);
    const grantableColumnAccess = { ...resolvedAccess.columnAccess };
    for (const column of grantableColumns) {
      if (Object.prototype.hasOwnProperty.call(grantableColumnAccess, String(column._id))) continue;
      const allowedContentIds = getGrantedColumnContentIds(resolvedAccess, column);
      if (allowedContentIds.length) {
        grantableColumnAccess[String(column._id)] = { enabled: true, allowedContentIds };
      }
    }

    res.json({
      categories: orderedCategories.map(category => ({
        ...category,
        ...categoryMetadata.get(category.category)
      })),
      puzzleAccess: resolvedAccess.puzzleAccess,
      openings,
      famousMates,
      bestGames,
      columns: (await Promise.all(grantableColumns.map(async column => ({
        ...column,
        contents: (await ColumnContent.find({
          columnId: column._id,
          adminId: req.authUser._id,
          isEnabled: { $ne: false }
        }).select('_id title name').sort({ order: 1, createdAt: -1 }).lean())
          .map(content => ({ ...content, title: content.title || content.name }))
      })))).filter(column => column.contents.length > 0),
      openingAccess: resolvedAccess.openingAccess,
      famousMatesAccess: resolvedAccess.famousMatesAccess,
      bestGamesAccess: resolvedAccess.bestGamesAccess,
      columnAccess: grantableColumnAccess
    });
  } catch (error) {
    console.error('Load admin puzzle access error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/superadmin/admins/:id/puzzle-access', requireRole('superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid admin id' });
    }
    const admin = await User.findOne({
      _id: req.params.id,
      role: 'admin',
      adminId: req.authUser._id
    }).select('_id');
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const puzzles = await Puzzle.find({ adminId: req.authUser._id, isEnabled: true })
      .select('_id category order createdAt')
      .sort({ category: 1, order: 1, createdAt: 1 })
      .lean();
    const grant = buildAdminPuzzleGrant(puzzles, req.body?.puzzleAccess);
    if (grant.error) return res.status(400).json({ message: grant.error });

    const contentAccessSettings = [
      {
        bodyKey: 'openingAccess',
        idsKey: 'allowedOpenings',
        Model: Opening,
        databaseKey: 'openingAccess'
      },
      {
        bodyKey: 'famousMatesAccess',
        idsKey: 'allowedMates',
        Model: FamousMate,
        databaseKey: 'famousMatesAccess'
      },
      {
        bodyKey: 'bestGamesAccess',
        idsKey: 'allowedGames',
        Model: BestGame,
        databaseKey: 'bestGamesAccess'
      }
    ];
    const normalizedContentAccess = {};
    for (const { bodyKey, idsKey, Model, databaseKey } of contentAccessSettings) {
      const settings = req.body?.[bodyKey] || { enabled: false, [idsKey]: [] };
      if (
        typeof settings.enabled !== 'boolean' ||
        !Array.isArray(settings[idsKey]) ||
        settings[idsKey].some(id => !mongoose.isValidObjectId(id))
      ) {
        return res.status(400).json({ message: `Invalid ${bodyKey} settings` });
      }
      const allowedIds = [...new Set(settings[idsKey].map(String))];
      if (allowedIds.length > 0) {
        const matchingItems = await Model.countDocuments({
          _id: { $in: allowedIds },
          adminId: req.authUser._id,
          isEnabled: true
        });
        if (matchingItems !== allowedIds.length) {
          return res.status(400).json({ message: `${bodyKey} contains unavailable content` });
        }
      }
      normalizedContentAccess[databaseKey] = {
        enabled: settings.enabled,
        [idsKey]: allowedIds
      };
    }

    let normalizedColumnAccess;
    if (req.body?.columnAccess !== undefined) {
      if (!req.body.columnAccess || typeof req.body.columnAccess !== 'object' || Array.isArray(req.body.columnAccess)) {
        return res.status(400).json({ message: 'Invalid column access settings' });
      }
      normalizedColumnAccess = {};
      for (const [columnId, settings] of Object.entries(req.body.columnAccess)) {
        if (
          !mongoose.isValidObjectId(columnId) ||
          !settings || typeof settings !== 'object' || Array.isArray(settings) ||
          typeof settings.enabled !== 'boolean' ||
          !Array.isArray(settings.allowedContentIds) ||
          settings.allowedContentIds.some(id => !mongoose.isValidObjectId(id))
        ) {
          return res.status(400).json({ message: 'Invalid column access settings' });
        }
        const column = await Column.findOne({
          _id: columnId,
          adminId: req.authUser._id,
          isEnabled: true
        }).select('_id contentType title');
        if (!column) return res.status(400).json({ message: 'Column access contains unavailable columns' });
        const adminColumnsOfType = await Column.find({
          adminId: admin._id,
          contentType: column.contentType,
          isEnabled: true
        }).select('title').lean();
        const adminHasColumnType = adminColumnsOfType.some(adminColumn =>
          areColumnsCompatible(column, adminColumn)
        );
        if (!adminHasColumnType) {
          return res.status(400).json({ message: 'The admin must add the matching standard column before content can be shared' });
        }
        const allowedContentIds = [...new Set(settings.allowedContentIds.map(String))];
        if (allowedContentIds.length) {
          const count = await ColumnContent.countDocuments({
            _id: { $in: allowedContentIds },
            columnId,
            adminId: req.authUser._id,
            isEnabled: { $ne: false }
          });
          if (count !== allowedContentIds.length) {
            return res.status(400).json({ message: 'Column access contains unavailable content' });
          }
        }
        normalizedColumnAccess[columnId] = {
          enabled: settings.enabled,
          allowedContentIds
        };
      }
    }

    await AdminPuzzleAccess.findOneAndUpdate(
      { adminId: admin._id },
      {
        $set: {
          grantedBy: req.authUser._id,
          puzzleAccess: grant.puzzleAccess,
          ...normalizedContentAccess,
          ...(normalizedColumnAccess !== undefined ? { columnAccess: normalizedColumnAccess } : {}),
          updatedAt: new Date()
        },
        $unset: { puzzleIds: '' }
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({
      success: true,
      puzzleAccess: grant.puzzleAccess,
      ...normalizedContentAccess,
      ...(normalizedColumnAccess !== undefined ? { columnAccess: normalizedColumnAccess } : {})
    });
  } catch (error) {
    console.error('Update admin puzzle access error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending admin requests (superadmin only)
app.get('/api/superadmin/admin-requests', requireRole('superadmin'), async (req, res) => {
  try {
    const requests = await User.find({ role: 'admin', verificationStatus: 'under_review' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(requests.map(reqAdmin => ({
      id: reqAdmin._id,
      username: reqAdmin.username,
      role: reqAdmin.role,
      isEnabled: reqAdmin.isEnabled,
      verificationStatus: reqAdmin.verificationStatus,
      adminId: reqAdmin.adminId,
      profile: reqAdmin.profile,
      createdAt: reqAdmin.createdAt
    })));
  } catch (error) {
    console.error('Get admin requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Superadmin approve/reject admin request
app.put('/api/superadmin/admin-requests/:id/action', requireRole('superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const { action } = req.body || {};
    if (!['approve', 'accept', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) {
      return res.status(404).json({ message: 'Admin request not found' });
    }

    if (action === 'approve' || action === 'accept') {
      admin.verificationStatus = 'verified';
      admin.adminId = req.authUser._id; // Superadmin who accepted the request
      admin.isEnabled = true;
      admin.onboardingComplete = true;
      admin.updatedAt = new Date();
      await admin.save();
      return res.json({
        success: true,
        message: 'Admin request accepted successfully',
        admin: {
          id: admin._id,
          username: admin.username,
          role: admin.role,
          verificationStatus: admin.verificationStatus,
          adminId: admin.adminId,
          isEnabled: admin.isEnabled,
          profile: admin.profile,
          createdAt: admin.createdAt
        }
      });
    } else {
      admin.verificationStatus = 'rejected';
      admin.adminId = req.authUser._id;
      admin.isEnabled = false;
      admin.updatedAt = new Date();
      await admin.save();
      return res.json({
        success: true,
        message: 'Admin request rejected',
        admin: {
          id: admin._id,
          username: admin.username,
          role: admin.role,
          verificationStatus: admin.verificationStatus,
          adminId: admin.adminId,
          isEnabled: admin.isEnabled,
          profile: admin.profile,
          createdAt: admin.createdAt
        }
      });
    }
  } catch (error) {
    console.error('Admin request action error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/superadmin/admins', requireRole('superadmin'), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    if (await User.exists({ username: username.trim() })) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const admin = await User.create({
      username: username.trim(),
      password: password.trim(),
      role: 'admin',
      verificationStatus: 'verified',
      adminId: req.authUser._id,
      isEnabled: true,
      onboardingComplete: true
    });
    res.status(201).json({
      id: admin._id,
      username: admin.username,
      role: admin.role,
      isEnabled: admin.isEnabled,
      verificationStatus: admin.verificationStatus,
      createdAt: admin.createdAt
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/superadmin/admins/:id', requireRole('superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid admin id' });
    }
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const { username, password, isEnabled } = req.body || {};
    if (typeof username === 'string') {
      if (!username.trim()) return res.status(400).json({ message: 'Username cannot be empty' });
      const existing = await User.findOne({ username: username.trim(), _id: { $ne: admin._id } });
      if (existing) return res.status(409).json({ message: 'Username already exists' });
      admin.username = username.trim();
    }
    if (typeof password === 'string' && password.trim()) admin.password = password.trim();
    if (typeof isEnabled === 'boolean') admin.isEnabled = isEnabled;
    admin.updatedAt = new Date();
    await admin.save();

    res.json({
      id: admin._id,
      username: admin.username,
      role: admin.role,
      isEnabled: admin.isEnabled,
      verificationStatus: admin.verificationStatus || 'verified',
      createdAt: admin.createdAt
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/superadmin/admins/:id', requireRole('superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid admin id' });
    }
    const deletedAdmin = await User.findOneAndDelete({ _id: req.params.id, role: 'admin' });
    if (!deletedAdmin) return res.status(404).json({ message: 'Admin not found' });
    res.json({ success: true, message: 'Admin deleted' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user (admin only)
app.put('/api/users/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    if (!isAdminRole(requestingUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { username, password, isEnabled, joiningDate, profile, achievements, commonNote } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'student' && !user._id.equals(requestingUser._id)) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (username) user.username = username;
    if (typeof isEnabled === 'boolean') user.isEnabled = isEnabled;
    if (password && password.trim().length > 0) user.password = password;
    if (joiningDate) user.joiningDate = new Date(joiningDate);
    if (profile) user.profile = { ...((user.profile || {})), ...profile };
    if (achievements) user.achievements = achievements;
    if (typeof commonNote === 'string') user.commonNote = commonNote;

    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        isEnabled: user.isEnabled,
        onboardingComplete: user.onboardingComplete,
        joiningDate: user.joiningDate,
        attendance: user.attendance || [],
        achievements: user.achievements || [],
        profile: user.profile,
        commonNote: user.commonNote || ''
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    if (!isAdminRole(requestingUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findOne({ _id: req.params.id, role: 'student', adminId: requestingUser._id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.deleteOne();
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add/Update attendance for a user (admin only)
app.post('/api/users/:id/attendance', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    if (!isAdminRole(requestingUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { date, status, note } = req.body;
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if attendance for this date already exists
    const existingIndex = user.attendance?.findIndex(a => {
      const existingDate = new Date(a.date);
      existingDate.setHours(0, 0, 0, 0);
      return existingDate.getTime() === attendanceDate.getTime();
    });

    if (existingIndex >= 0) {
      // Update existing attendance
      user.attendance[existingIndex] = { date: attendanceDate, status, note };
    } else {
      // Add new attendance
      if (!user.attendance) user.attendance = [];
      user.attendance.push({ date: attendanceDate, status, note });
    }

    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      attendance: user.attendance
    });
  } catch (error) {
    console.error('Add attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get attendance for a user
app.get('/api/users/:id/attendance', async (req, res) => {
  try {
    const requestingUser = await getAuthenticatedUser(req);
    if (!requestingUser) {
      return res.status(401).json({ message: 'Invalid or missing token' });
    }

    if (!isAdminRole(requestingUser) && requestingUser._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.params.id).select('attendance');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.attendance || []);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete attendance for a user by date or by daysBefore (admin only)
app.delete('/api/users/:id/attendance', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    // Allow admins or the user themself to delete attendance
    if (decoded.id !== req.params.id && !isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { date, daysBefore } = req.query;
    let targetDate = null;
    if (date) {
      targetDate = new Date(date);
    } else if (typeof daysBefore !== 'undefined') {
      const days = parseInt(daysBefore.toString(), 10) || 0;
      targetDate = new Date();
      targetDate.setHours(0, 0, 0, 0);
      targetDate.setDate(targetDate.getDate() - days);
    } else {
      return res.status(400).json({ message: 'Provide date or daysBefore query parameter' });
    }

    targetDate.setHours(0, 0, 0, 0);

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!Array.isArray(user.attendance) || user.attendance.length === 0) {
      return res.status(404).json({ message: 'No attendance records' });
    }

    const beforeCount = user.attendance.length;
    user.attendance = user.attendance.filter(a => {
      const aDate = new Date(a.date);
      aDate.setHours(0, 0, 0, 0);
      return aDate.getTime() !== targetDate.getTime();
    });

    if (user.attendance.length === beforeCount) {
      return res.status(404).json({ message: 'No attendance found for that date' });
    }

    user.updatedAt = new Date();
    await user.save();

    res.json({ success: true, attendance: user.attendance });
  } catch (error) {
    console.error('Delete attendance error:', error && (error.stack || error.message || error));
    res.status(500).json({ message: error?.message || 'Server error' });
  }
});

// ============ FEES ROUTES ============

// Get fees for a user
app.get('/api/users/:id/fees', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    // Only the user themselves or admin can view fees
    if (decoded.id !== req.params.id && !isAdminRole(requestingUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.params.id).select('fees');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user.fees || []);
  } catch (error) {
    console.error('Get fees error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a fee record for a user (admin only)
app.post('/api/users/:id/fees', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { month, year, paid = false } = req.body;
    if (!month || !year) return res.status(400).json({ message: 'month and year are required' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.fees) user.fees = [];
    user.fees.push({ month, year, paid, createdAt: new Date(), updatedAt: new Date() });
    user.updatedAt = new Date();
    await user.save();

    res.status(201).json({ success: true, fees: user.fees });
  } catch (error) {
    console.error('Create fee error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a fee record (toggle paid, update secret note, or toggle visibility) (admin only)
app.put('/api/users/:id/fees/:feeId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { paid, secretNote, secretVisible } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const fee = user.fees.id(req.params.feeId);
    if (!fee) return res.status(404).json({ message: 'Fee record not found' });

    // Update fields if provided
    if (typeof paid === 'boolean') fee.paid = paid;
    if (typeof secretNote === 'string') fee.secretNote = secretNote;
    if (typeof secretVisible === 'boolean') fee.secretVisible = secretVisible;
    if (typeof req.body.month === 'number') fee.month = req.body.month;
    if (typeof req.body.year === 'number') fee.year = req.body.year;

    fee.updatedAt = new Date();
    user.updatedAt = new Date();
    await user.save();

    res.json({ success: true, fee });
  } catch (error) {
    console.error('Update fee error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a fee record (admin only)
app.delete('/api/users/:id/fees/:feeId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Ensure fees is an array
    if (!Array.isArray(user.fees)) user.fees = [];

    const originalLength = user.fees.length;
    user.fees = user.fees.filter(f => (f._id ? f._id.toString() : '') !== req.params.feeId);

    if (user.fees.length === originalLength) {
      return res.status(404).json({ message: 'Fee record not found' });
    }

    user.updatedAt = new Date();
    await user.save();

    res.json({ success: true, fees: user.fees });
  } catch (error) {
    console.error('Delete fee error:', error && (error.stack || error.message || error));
    res.status(500).json({ message: error?.message || 'Server error' });
  }
});

// Bulk mark attendance for multiple users (admin only)
app.post('/api/attendance/bulk', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    if (!isAdminRole(requestingUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { date, attendanceRecords } = req.body; // attendanceRecords: [{userId, status, note}]
    if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0 ||
        attendanceRecords.some(record => !mongoose.isValidObjectId(record.userId))) {
      return res.status(400).json({ message: 'Valid attendance records are required' });
    }
    const studentIds = [...new Set(attendanceRecords.map(record => String(record.userId)))];
    const students = await User.find({
      _id: { $in: studentIds },
      role: 'student',
      adminId: requestingUser._id
    });
    if (students.length !== studentIds.length) {
      return res.status(404).json({ message: 'One or more students were not found' });
    }
    const studentById = new Map(students.map(student => [student._id.toString(), student]));
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    for (const record of attendanceRecords) {
      const user = studentById.get(String(record.userId));
      const existingIndex = user.attendance?.findIndex(a => {
        const existingDate = new Date(a.date);
        existingDate.setHours(0, 0, 0, 0);
        return existingDate.getTime() === attendanceDate.getTime();
      });

      if (existingIndex >= 0) {
        user.attendance[existingIndex] = { date: attendanceDate, status: record.status, note: record.note };
      } else {
        if (!user.attendance) user.attendance = [];
        user.attendance.push({ date: attendanceDate, status: record.status, note: record.note });
      }
      user.updatedAt = new Date();
      await user.save();
    }

    res.json({ success: true, message: 'Attendance updated for all users' });
  } catch (error) {
    console.error('Bulk attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ GROUPS ROUTES ============

// Get all groups (admin only)
app.get('/api/groups', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const groups = await Group.find({ adminId: requestingUser._id }).sort({ createdAt: 1 });
    // Attach member counts
    const memberCounts = await User.aggregate([
      { $match: { groupId: { $ne: null }, role: 'student', adminId: requestingUser._id } },
      { $group: { _id: '$groupId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    memberCounts.forEach(mc => { countMap[mc._id.toString()] = mc.count; });

    res.json(groups.map(g => ({
      _id: g._id,
      name: g.name,
      description: g.description,
      memberCount: countMap[g._id.toString()] || 0,
      createdAt: g.createdAt
    })));
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a group (admin only)
app.post('/api/groups', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Group name is required' });

    const existing = await Group.findOne({ name: name.trim(), adminId: requestingUser._id });
    if (existing) return res.status(400).json({ message: 'A group with this name already exists' });

    const group = await Group.create({
      name: name.trim(),
      description: description || '',
      adminId: requestingUser._id
    });
    res.status(201).json({ success: true, group: { _id: group._id, name: group.name, description: group.description, memberCount: 0, createdAt: group.createdAt } });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a group (admin only)
app.put('/api/groups/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { name, description } = req.body;
    const group = await Group.findOne({ _id: req.params.id, adminId: requestingUser._id });
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (name && name.trim()) group.name = name.trim();
    if (typeof description === 'string') group.description = description;
    await group.save();

    res.json({ success: true, group });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a group (admin only) — unassigns all members
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const group = await Group.findOneAndDelete({ _id: req.params.id, adminId: requestingUser._id });
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Unassign all members of this group
    await User.updateMany(
      { groupId: req.params.id, role: 'student', adminId: requestingUser._id },
      { $set: { groupId: null } }
    );

    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Assign or unassign a student to a group (admin only)
app.put('/api/users/:id/group', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { groupId } = req.body; // null to unassign
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'student' || !user.adminId?.equals(requestingUser._id)) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (groupId) {
      const group = await Group.findOne({ _id: groupId, adminId: requestingUser._id });
      if (!group) return res.status(404).json({ message: 'Group not found' });
      user.groupId = groupId;
    } else {
      user.groupId = null;
    }
    user.updatedAt = new Date();
    await user.save();

    await user.populate('groupId', 'name');
    res.json({
      success: true,
      groupId: user.groupId?._id || null,
      groupName: user.groupId?.name || null
    });
  } catch (error) {
    console.error('Assign group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ PUZZLE PROGRESS ROUTES ============

// Record puzzle attempts directly in the per-user puzzle progress collection.
app.post('/api/users/:id/puzzle-attempt', async (req, res) => {
  try {
    const { type, details } = req.body;
    const puzzleId = details?.puzzleId;
    const result = details?.result;
    const requestingUser = req.authUser;
    const targetUser = req.targetUser;
    if (!requestingUser || !targetUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!requestingUser._id.equals(targetUser._id) && !canManageStudent(requestingUser, targetUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (targetUser.role !== 'student' || !requestingUser._id.equals(targetUser._id)) {
      return res.status(403).json({ message: 'Puzzle attempts must be recorded by the student' });
    }
    if (
      !mongoose.isValidObjectId(puzzleId) ||
      !['puzzle_solved', 'puzzle_failed'].includes(type) ||
      !['passed', 'failed'].includes(result) ||
      ((type === 'puzzle_solved') !== (result === 'passed'))
    ) {
      return res.status(400).json({ message: 'A valid puzzle id and result are required' });
    }

    const adminPuzzleQuery = await getAdminPuzzleQuery(targetUser.adminId);
    const puzzle = await Puzzle.findOne({
      $and: [adminPuzzleQuery, { _id: puzzleId, isEnabled: true }]
    });
    if (!puzzle) return res.status(404).json({ message: 'Puzzle not found' });

    const puzzleAccessViewer = await User.findById(targetUser._id)
      .select('_id role groupId adminId');
    if (!puzzleAccessViewer) return res.status(404).json({ message: 'Student not found' });
    const accessKey = details.practiceMode === true
      ? 'practiceWithAiAccess'
      : 'puzzleAccess';
    const visiblePuzzles = await getVisiblePuzzles(puzzleAccessViewer, puzzle.category, accessKey);
    const canAccessPuzzle = visiblePuzzles.some(item =>
      String(item._id) === String(puzzle._id) && !item.isLocked
    );
    if (!canAccessPuzzle) return res.status(403).json({ message: 'Puzzle access denied' });

    const progress = await PuzzleProgress.findOneAndUpdate(
      { userId: targetUser._id, puzzleId: String(puzzle._id) },
      buildPuzzleProgressAttemptUpdate(result === 'passed'),
      { new: true, upsert: true }
    );
    res.status(200).json(progress);
  } catch (error) {
    console.error('Record puzzle progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user activities (for admin dashboard)
app.get('/api/users/:id/activity', async (req, res) => {
  if (!req.authUser) return res.status(401).json({ message: 'Unauthorized' });
  res.json([]);
});

// Activity history is no longer retained; keep the endpoint response shape for existing clients.
app.get('/api/users/:id/activity/summary', async (req, res) => {
  if (!req.authUser) return res.status(401).json({ message: 'Unauthorized' });
  res.json({ summary: [], puzzleStats: [] });
});

// Get user puzzle progress from the compact per-user/per-puzzle collection.
app.get('/api/users/:id/puzzle-progress', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id).select('_id role');

    if (decoded.id !== req.params.id && !isAdminRole(requestingUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('_id adminId');
    if (!student || (isAdminRole(requestingUser) && !student.adminId?.equals(requestingUser._id))) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const adminPuzzleQuery = await getAdminPuzzleQuery(student.adminId);
    const [progressRecords, allPuzzles] = await Promise.all([
      PuzzleProgress.find({ userId: student._id }).lean(),
      Puzzle.find({ $and: [adminPuzzleQuery, { isEnabled: true }] })
        .sort({ order: 1, createdAt: 1 })
    ]);

    res.json(buildPuzzleProgress(allPuzzles, progressRecords));
  } catch (error) {
    console.error('Get puzzle progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ PUZZLE ROUTES ============

// Get all puzzles
app.get('/api/puzzles', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role groupId adminId');
    if (!viewer) return res.status(401).json({ message: 'Unauthorized' });

    const accessKey = req.query.access === 'practice' ? 'practiceWithAiAccess' : 'puzzleAccess';
    const puzzles = await getVisiblePuzzles(viewer, undefined, accessKey);
    res.json(puzzles);
  } catch (error) {
    console.error('Get puzzles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get puzzles by category
app.get('/api/puzzles/category/:category', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role groupId adminId');
    if (!viewer) return res.status(401).json({ message: 'Unauthorized' });

    const accessKey = req.query.access === 'practice' ? 'practiceWithAiAccess' : 'puzzleAccess';
    const puzzles = await getVisiblePuzzles(viewer, req.params.category, accessKey);
    res.json(puzzles);
  } catch (error) {
    console.error('Get puzzles by category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create puzzle (admin only)
app.post('/api/puzzles', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const validationError = validatePuzzlePayload(req.body);
    if (validationError) return res.status(400).json({ message: validationError });

    // Find the maximum order value in this category
    const maxOrderPuzzle = await Puzzle.findOne({
      category: req.body.category,
      adminId: requestingUser._id
    })
      .sort({ order: -1 })
      .select('order');

    const newOrder = maxOrderPuzzle ? (maxOrderPuzzle.order + 1) : 1;
    const allowedGroups = Array.isArray(req.body.allowedGroups)
      ? req.body.allowedGroups
      : await Group.distinct('_id', { adminId: requestingUser._id });
    if (!await belongToAdminGroups(allowedGroups, requestingUser._id)) {
      return res.status(400).json({ message: 'Puzzle groups must belong to your admin account' });
    }

    // Create puzzle with the new order value
    const puzzle = await Puzzle.create({
      ...req.body,
      adminId: requestingUser._id,
      allowedGroups,
      order: newOrder
    });

    res.status(201).json({ success: true, puzzle });
  } catch (error) {
    console.error('Create puzzle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update puzzle (admin only)
app.put('/api/puzzles/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const existingPuzzle = await Puzzle.findOne({ _id: req.params.id, adminId: requestingUser._id });
    if (!existingPuzzle) return res.status(404).json({ message: 'Puzzle not found' });

    const validationError = validatePuzzlePayload({
      ...existingPuzzle.toObject(),
      ...req.body
    });
    if (validationError) return res.status(400).json({ message: validationError });
    if (req.body.allowedGroups !== undefined &&
        !await belongToAdminGroups(req.body.allowedGroups, requestingUser._id)) {
      return res.status(400).json({ message: 'Puzzle groups must belong to your admin account' });
    }

    const puzzle = await Puzzle.findOneAndUpdate(
      { _id: req.params.id, adminId: requestingUser._id },
      { ...req.body, adminId: requestingUser._id, updatedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, puzzle });
  } catch (error) {
    console.error('Update puzzle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete puzzle (admin only)
app.delete('/api/puzzles/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const deletedPuzzle = await Puzzle.findOneAndDelete({ _id: req.params.id, adminId: requestingUser._id });
    if (!deletedPuzzle) return res.status(404).json({ message: 'Puzzle not found' });
    res.json({ success: true, message: 'Puzzle deleted' });
  } catch (error) {
    console.error('Delete puzzle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder puzzles (admin only)
app.post('/api/puzzles/reorder', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { puzzleOrders } = req.body; // Array of { id, order }
    if (!Array.isArray(puzzleOrders) || puzzleOrders.some(item => !mongoose.isValidObjectId(item.id))) {
      return res.status(400).json({ message: 'Valid puzzle orders are required' });
    }
    const puzzleIds = [...new Set(puzzleOrders.map(item => String(item.id)))];
    const ownedPuzzles = await Puzzle.find({
      _id: { $in: puzzleIds },
      adminId: requestingUser._id
    }).select('_id');
    if (ownedPuzzles.length !== puzzleIds.length) {
      return res.status(404).json({ message: 'One or more puzzles were not found' });
    }

    // Update each puzzle's order
    const updatePromises = puzzleOrders.map(({ id, order }) =>
      Puzzle.updateOne({ _id: id, adminId: requestingUser._id }, { order, updatedAt: new Date() })
    );

    await Promise.all(updatePromises);
    res.json({ success: true, message: 'Puzzle order updated' });
  } catch (error) {
    console.error('Reorder puzzles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ OPENING ROUTES ============

// Get all openings
app.get('/api/openings', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role adminId');
    if (!viewer) return res.status(401).json({ message: 'Unauthorized' });

    const contentOwnerId = getContentOwnerId(viewer);
    const openings = await Opening.find(
      await getAdminContentQuery(contentOwnerId, 'openingAccess', 'allowedOpenings')
    ).sort({ createdAt: -1 });
    const visibleOpenings = isAdminRole(viewer) ? openings : filterVisibleItems(
        openings,
        await getContentAccessForUser(viewer._id),
        'openingAccess',
        'allowedOpenings'
      );
    res.json(visibleOpenings);
  } catch (error) {
    console.error('Get openings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create opening (admin only)
app.post('/api/openings', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const opening = await Opening.create({ ...req.body, adminId: requestingUser._id });
    res.status(201).json({ success: true, opening });
  } catch (error) {
    console.error('Create opening error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update opening (admin only)
app.put('/api/openings/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const opening = await Opening.findOneAndUpdate(
      { _id: req.params.id, adminId: requestingUser._id },
      { ...req.body, adminId: requestingUser._id, updatedAt: new Date() },
      { new: true }
    );
    if (!opening) return res.status(404).json({ message: 'Opening not found' });
    res.json({ success: true, opening });
  } catch (error) {
    console.error('Update opening error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete opening (admin only)
app.delete('/api/openings/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const deletedOpening = await Opening.findOneAndDelete({ _id: req.params.id, adminId: requestingUser._id });
    if (!deletedOpening) return res.status(404).json({ message: 'Opening not found' });
    res.json({ success: true, message: 'Opening deleted' });
  } catch (error) {
    console.error('Delete opening error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ FAMOUS MATES ROUTES ============

// Get all famous mates
app.get('/api/famous-mates', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role adminId');
    if (!viewer) return res.status(401).json({ message: 'Unauthorized' });

    const contentOwnerId = getContentOwnerId(viewer);
    const famousMates = await FamousMate.find(
      await getAdminContentQuery(contentOwnerId, 'famousMatesAccess', 'allowedMates')
    ).sort({ createdAt: -1 });
    const visibleMates = isAdminRole(viewer)
      ? famousMates
      : filterVisibleItems(
        famousMates,
        await getContentAccessForUser(viewer._id),
        'famousMatesAccess',
        'allowedMates'
      );
    res.json(visibleMates);
  } catch (error) {
    console.error('Get famous mates error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single famous mate by ID
app.get('/api/famous-mates/:id', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role adminId');
    if (!viewer) return res.status(401).json({ message: 'Unauthorized' });

    const famousMate = await FamousMate.findOne({
      $and: [
        await getAdminContentQuery(getContentOwnerId(viewer), 'famousMatesAccess', 'allowedMates'),
        { _id: req.params.id }
      ]
    });
    if (!famousMate) return res.status(404).json({ message: 'Famous mate not found' });
    if (!isAdminRole(viewer)) {
      const access = await getContentAccessForUser(viewer._id);
      if (!filterVisibleItems(
        [famousMate],
        access,
        'famousMatesAccess',
        'allowedMates'
      ).length) {
        return res.status(404).json({ message: 'Famous mate not found' });
      }
    }
    res.json(famousMate);
  } catch (error) {
    console.error('Get famous mate error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create famous mate (admin only)
app.post('/api/famous-mates', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const famousMate = await FamousMate.create({ ...req.body, adminId: requestingUser._id });
    res.status(201).json({ success: true, famousMate });
  } catch (error) {
    console.error('Create famous mate error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update famous mate (admin only)
app.put('/api/famous-mates/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const famousMate = await FamousMate.findOneAndUpdate(
      { _id: req.params.id, adminId: requestingUser._id },
      { ...req.body, adminId: requestingUser._id, updatedAt: new Date() },
      { new: true }
    );
    if (!famousMate) return res.status(404).json({ message: 'Famous mate not found' });
    res.json({ success: true, famousMate });
  } catch (error) {
    console.error('Update famous mate error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete famous mate (admin only)
app.delete('/api/famous-mates/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const deletedMate = await FamousMate.findOneAndDelete({ _id: req.params.id, adminId: requestingUser._id });
    if (!deletedMate) return res.status(404).json({ message: 'Famous mate not found' });
    res.json({ success: true, message: 'Famous mate deleted' });
  } catch (error) {
    console.error('Delete famous mate error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ BEST GAME ROUTES ============

// Get all best games
app.get('/api/bestgames', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role adminId');
    if (!viewer) return res.status(401).json({ message: 'Unauthorized' });

    const contentOwnerId = getContentOwnerId(viewer);
    const games = await BestGame.find(
      await getAdminContentQuery(contentOwnerId, 'bestGamesAccess', 'allowedGames')
    ).sort({ createdAt: -1 });
    const visibleGames = isAdminRole(viewer)
      ? games
      : filterVisibleItems(
        games,
        await getContentAccessForUser(viewer._id),
        'bestGamesAccess',
        'allowedGames'
      );
    res.json(visibleGames);
  } catch (error) {
    console.error('Get best games error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create best game (admin only)
app.post('/api/bestgames', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const game = await BestGame.create({ ...req.body, adminId: requestingUser._id });
    res.status(201).json({ success: true, game });
  } catch (error) {
    console.error('Create best game error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update best game (admin only)
app.put('/api/bestgames/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const game = await BestGame.findOneAndUpdate(
      { _id: req.params.id, adminId: requestingUser._id },
      { ...req.body, adminId: requestingUser._id, updatedAt: new Date() },
      { new: true }
    );
    if (!game) return res.status(404).json({ message: 'Best game not found' });
    res.json({ success: true, game });
  } catch (error) {
    console.error('Update best game error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete best game (admin only)
app.delete('/api/bestgames/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const deletedGame = await BestGame.findOneAndDelete({ _id: req.params.id, adminId: requestingUser._id });
    if (!deletedGame) return res.status(404).json({ message: 'Best game not found' });
    res.json({ success: true, message: 'Best game deleted' });
  } catch (error) {
    console.error('Delete best game error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ DYNAMIC COLUMN ROUTES ============

app.get('/api/columns', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!viewer || viewer.isEnabled === false) return res.status(401).json({ message: 'Unauthorized' });
    const columns = await getColumnsVisibleTo(viewer);
    if (isAdminRole(viewer)) return res.json(columns);

    const visibleColumns = [];
    for (const column of columns) {
      if (column.isEnabled === false) continue;
      const contents = await getColumnContentsVisibleTo(viewer, column);
      if (contents.length) visibleColumns.push(column);
    }
    res.json(visibleColumns);
  } catch (error) {
    console.error('Get columns error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/columns', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { title, icon, contentType = 'generic' } = req.body || {};
    if (!['opening', 'bestGame', 'famousMate', 'generic'].includes(contentType)) {
      return res.status(400).json({ message: 'Select a supported column type' });
    }
    const preset = PRESET_COLUMN_TYPES[contentType];
    if (preset) {
      const existing = await Column.findOne({ adminId: req.authUser._id, contentType }).select('_id');
      if (existing) return res.status(409).json({ message: `${preset.title} column already exists` });
    } else if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) {
      return res.status(400).json({ message: 'A custom column title between 1 and 80 characters is required' });
    }
    const columnTitle = preset?.title || title.trim();
    const columnIcon = preset?.icon || icon;
    if (typeof columnIcon !== 'string' || !SUPPORTED_COLUMN_ICONS.has(columnIcon)) {
      return res.status(400).json({ message: 'Select a supported column icon' });
    }
    const lastColumn = await Column.findOne({ adminId: req.authUser._id }).sort({ order: -1 }).select('order');
    const column = await Column.create({
      title: columnTitle,
      icon: columnIcon,
      adminId: req.authUser._id,
      contentType,
      order: lastColumn ? lastColumn.order + 1 : 0
    });
    res.status(201).json(column);
  } catch (error) {
    console.error('Create column error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/columns/:id', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid column id' });
    if (req.body.title !== undefined || req.body.icon !== undefined) {
      const existingColumn = await Column.findOne({
        _id: req.params.id,
        adminId: req.authUser._id
      }).select('contentType');
      if (!existingColumn) return res.status(404).json({ message: 'Column not found' });
      if (existingColumn.contentType !== 'generic') {
        return res.status(400).json({ message: 'Standard column titles and icons cannot be changed' });
      }
    }
    const updates = {};
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.trim().length > 80) {
        return res.status(400).json({ message: 'A column title between 1 and 80 characters is required' });
      }
      updates.title = req.body.title.trim();
    }
    if (req.body.icon !== undefined) {
      if (typeof req.body.icon !== 'string' || !SUPPORTED_COLUMN_ICONS.has(req.body.icon)) {
        return res.status(400).json({ message: 'Select a supported column icon' });
      }
      updates.icon = req.body.icon;
    }
    if (req.body.isEnabled !== undefined) {
      if (typeof req.body.isEnabled !== 'boolean') return res.status(400).json({ message: 'isEnabled must be a boolean' });
      updates.isEnabled = req.body.isEnabled;
    }
    if (req.body.order !== undefined) {
      if (!Number.isSafeInteger(req.body.order) || req.body.order < 0) {
        return res.status(400).json({ message: 'order must be a non-negative integer' });
      }
      updates.order = req.body.order;
    }
    updates.updatedAt = new Date();
    const column = await Column.findOneAndUpdate(
      { _id: req.params.id, adminId: req.authUser._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!column) return res.status(404).json({ message: 'Column not found' });
    res.json(column);
  } catch (error) {
    console.error('Update column error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/columns/:id', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid column id' });
    const column = await Column.findOneAndDelete({ _id: req.params.id, adminId: req.authUser._id });
    if (!column) return res.status(404).json({ message: 'Column not found' });
    await ColumnContent.deleteMany({ columnId: column._id, adminId: req.authUser._id });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete column error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/columns/:id/contents', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid column id' });
    const viewer = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!viewer || viewer.isEnabled === false) return res.status(401).json({ message: 'Unauthorized' });
    const columns = await getColumnsVisibleTo(viewer);
    const column = columns.find(item => String(item._id) === req.params.id);
    if (!column) return res.status(404).json({ message: 'Column not found' });
    res.json(await getColumnContentsVisibleTo(viewer, column));
  } catch (error) {
    console.error('Get column contents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/columns/:id/contents', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid column id' });
    const column = await Column.findOne({ _id: req.params.id, adminId: req.authUser._id });
    if (!column) return res.status(404).json({ message: 'Column not found' });
    const content = normalizeColumnContentPayload(req.body, column.contentType);
    if (!content) return res.status(400).json({ message: 'Content title and valid moves are required' });
    const newContent = await ColumnContent.create({
      ...content,
      columnId: column._id,
      adminId: req.authUser._id
    });
    res.status(201).json(newContent);
  } catch (error) {
    console.error('Create column content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/columns/:id/contents/:contentId', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.contentId)) {
      return res.status(400).json({ message: 'Invalid column or content id' });
    }
    const column = await Column.findOne({ _id: req.params.id, adminId: req.authUser._id });
    if (!column) return res.status(404).json({ message: 'Column not found' });
    const content = normalizeColumnContentPayload(req.body, column.contentType);
    if (!content) return res.status(400).json({ message: 'Content title and valid moves are required' });
    const updated = await ColumnContent.findOneAndUpdate(
      { _id: req.params.contentId, columnId: column._id, adminId: req.authUser._id },
      { $set: { ...content, updatedAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Content not found' });
    res.json(updated);
  } catch (error) {
    console.error('Update column content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/columns/:id/contents/:contentId', requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.contentId)) {
      return res.status(400).json({ message: 'Invalid column or content id' });
    }
    const deleted = await ColumnContent.findOneAndDelete({
      _id: req.params.contentId,
      columnId: req.params.id,
      adminId: req.authUser._id
    });
    if (!deleted) return res.status(404).json({ message: 'Content not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete column content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ STATS ROUTE ============

// Get dashboard stats (admin only)
app.get('/api/stats', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const totalStudents = await User.countDocuments({ role: 'student', adminId: requestingUser._id });
    const activeStudents = await User.countDocuments({ role: 'student', adminId: requestingUser._id, isEnabled: true });
    const adminPuzzleQuery = await getAdminPuzzleQuery(requestingUser._id);
    const totalPuzzles = await Puzzle.countDocuments(adminPuzzleQuery);
    const totalOpenings = await Opening.countDocuments({ adminId: requestingUser._id });
    const totalFamousMates = await FamousMate.countDocuments({ adminId: requestingUser._id });
    const totalBestGames = await BestGame.countDocuments({ adminId: requestingUser._id });

    res.json({
      totalStudents,
      activeStudents,
      totalPuzzles,
      totalOpenings,
      totalFamousMates,
      totalBestGames
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ CONTENT ACCESS ROUTES ============

// Get content access for a user
app.get('/api/content-access/:userId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const requestingUser = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!requestingUser || requestingUser.isEnabled === false) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const targetStudent = await User.findOne({ _id: req.params.userId, role: 'student' }).select('_id role adminId');
    const ownsTarget = canManageStudent(requestingUser, targetStudent);
    const isSelf = requestingUser._id.equals(req.params.userId);
    if (!targetStudent || (!ownsTarget && !isSelf)) {
      return res.status(404).json({ message: 'User not found' });
    }
    const accessStatus = getUserContentAccessStatus(requestingUser, req.params.userId, targetStudent);
    if (accessStatus !== 200) {
      return res.status(accessStatus).json({ message: accessStatus === 401 ? 'Unauthorized' : 'Access denied' });
    }

    let access = await ContentAccess.findOne({ userId: req.params.userId });

    // Create default access if not exists
    if (!access) {
      access = await ContentAccess.create({
        userId: req.params.userId,
        practiceWithAiEnabled: false,
        puzzleAccess: {
          'mate-in-1': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'mate-in-2': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'mate-in-3': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'pins': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'forks': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'traps': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] }
        },
        openingAccess: { enabled: false, allowedOpenings: [] },
        bestGamesAccess: { enabled: false, allowedGames: [] }
      });
    }

    const accessData = access.toObject();
    accessData.practiceWithAiAccess = getPracticeWithAiAccess(accessData);
    res.json(accessData);
  } catch (error) {
    console.error('Get content access error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user's content access
app.get('/api/my-content-access', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);

    let access = await ContentAccess.findOne({ userId: decoded.id });

    // Create default access if not exists
    if (!access) {
      access = await ContentAccess.create({
        userId: decoded.id,
        practiceWithAiEnabled: false,
        puzzleAccess: {
          'mate-in-1': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'mate-in-2': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'mate-in-3': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'pins': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'forks': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] },
          'traps': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null, specificPuzzles: [] }
        },
        openingAccess: { enabled: false, allowedOpenings: [] },
        bestGamesAccess: { enabled: false, allowedGames: [] }
      });
    }

    const accessData = access.toObject();
    accessData.practiceWithAiAccess = getPracticeWithAiAccess(accessData);
    res.json(accessData);
  } catch (error) {
    console.error('Get my content access error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update content access for a user (admin only)
app.put('/api/content-access/:userId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });
    const targetStudent = await User.findOne({
      _id: req.params.userId,
      role: 'student',
      adminId: requestingUser._id
    }).select('_id');
    if (!targetStudent) return res.status(404).json({ message: 'User not found' });

    const {
      practiceWithAiEnabled,
      practiceWithAiAccess,
      puzzleAccess,
      openingAccess,
      famousMatesAccess,
      bestGamesAccess,
      columnAccess
    } = req.body;
    if (practiceWithAiEnabled !== undefined && typeof practiceWithAiEnabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid Puzzles with AI access setting' });
    }
    if (
      practiceWithAiAccess !== undefined &&
      (!practiceWithAiAccess || typeof practiceWithAiAccess !== 'object' || Array.isArray(practiceWithAiAccess))
    ) {
      return res.status(400).json({ message: 'Invalid Puzzles with AI puzzle access settings' });
    }
    if (columnAccess !== undefined) {
      if (!columnAccess || typeof columnAccess !== 'object' || Array.isArray(columnAccess)) {
        return res.status(400).json({ message: 'Invalid column access settings' });
      }
      const accessEntries = Object.entries(columnAccess);
      for (const [columnId, settings] of accessEntries) {
        if (
          !mongoose.isValidObjectId(columnId) ||
          !settings || typeof settings !== 'object' || Array.isArray(settings) ||
          typeof settings.enabled !== 'boolean' ||
          !Array.isArray(settings.allowedContentIds) ||
          settings.allowedContentIds.some(id => !mongoose.isValidObjectId(id))
        ) {
          return res.status(400).json({ message: 'Invalid column access settings' });
        }
      }
      const adminGrant = await getResolvedAdminPuzzleAccess(requestingUser._id);
      const accessibleColumns = await Column.find({
        _id: { $in: accessEntries.map(([id]) => id) },
        $or: [
          { adminId: requestingUser._id },
          ...(adminGrant.grantedBy ? [{ adminId: adminGrant.grantedBy }] : [])
        ]
      }).select('_id adminId contentType title').lean();
      if (accessibleColumns.length !== accessEntries.length) {
        return res.status(400).json({ message: 'Column access contains unavailable columns' });
      }
      for (const column of accessibleColumns) {
        const settings = columnAccess[String(column._id)];
        const allowedContentIds = [...new Set(settings.allowedContentIds.map(String))];
        let matchingContentCount = 0;
        if (String(column.adminId) !== String(requestingUser._id)) {
          const grantedIds = new Set(getGrantedColumnContentIds(adminGrant, column));
          if (allowedContentIds.some(id => !grantedIds.has(id))) {
            return res.status(400).json({ message: 'Column access includes content not granted to your admin' });
          }
          matchingContentCount = await ColumnContent.countDocuments({
            _id: { $in: allowedContentIds },
            columnId: column._id,
            adminId: column.adminId
          });
        } else {
          const ownContentIds = new Set((await ColumnContent.find({
            _id: { $in: allowedContentIds },
            columnId: column._id,
            adminId: requestingUser._id
          }).distinct('_id')).map(String));
          const sourceColumns = adminGrant.grantedBy
            ? await Column.find({ adminId: adminGrant.grantedBy, isEnabled: true }).select('_id contentType title').lean()
            : [];
          const compatibleSources = filterColumnsForAdmin(sourceColumns, [column]);
          const sharedIds = new Set();
          for (const sourceColumn of compatibleSources) {
            const grantedIds = getGrantedColumnContentIds(adminGrant, sourceColumn);
            grantedIds.forEach(id => sharedIds.add(id));
          }
          if (allowedContentIds.some(id => !ownContentIds.has(id) && !sharedIds.has(id))) {
            return res.status(400).json({ message: 'Column access includes content not granted to your admin' });
          }
          const sharedContentCount = compatibleSources.length
            ? await ColumnContent.countDocuments({
              _id: { $in: allowedContentIds.filter(id => !ownContentIds.has(id)) },
              columnId: { $in: compatibleSources.map(source => source._id) },
              adminId: adminGrant.grantedBy,
              isEnabled: { $ne: false }
            })
            : 0;
          matchingContentCount = ownContentIds.size + sharedContentCount;
        }
        if (matchingContentCount !== allowedContentIds.length) {
          return res.status(400).json({ message: 'Column access contains unavailable content' });
        }
        settings.allowedContentIds = allowedContentIds;
      }
    }

    let access = await ContentAccess.findOne({ userId: req.params.userId });

    if (!access) {
      access = await ContentAccess.create({
        userId: req.params.userId,
        practiceWithAiEnabled: practiceWithAiEnabled === true,
        practiceWithAiAccess: practiceWithAiAccess || (practiceWithAiEnabled ? puzzleAccess || {} : {}),
        puzzleAccess: puzzleAccess || {},
        openingAccess: openingAccess || { enabled: false, allowedOpenings: [] },
        famousMatesAccess: famousMatesAccess || { enabled: false, allowedMates: [] },
        bestGamesAccess: bestGamesAccess || { enabled: false, allowedGames: [] },
        columnAccess: columnAccess || {}
      });
    } else {
      if (practiceWithAiEnabled !== undefined) {
        access.practiceWithAiEnabled = practiceWithAiEnabled;
      }
      if (practiceWithAiAccess !== undefined) {
        access.practiceWithAiAccess = practiceWithAiAccess;
        access.markModified('practiceWithAiAccess');
        access.practiceWithAiEnabled = false;
      }
      if (puzzleAccess) {
        access.puzzleAccess = puzzleAccess;
        access.markModified('puzzleAccess'); // Required for Mixed type fields
      }
      if (openingAccess) access.openingAccess = openingAccess;
      if (famousMatesAccess) access.famousMatesAccess = famousMatesAccess;
      if (bestGamesAccess) access.bestGamesAccess = bestGamesAccess;
      if (columnAccess !== undefined) {
        access.columnAccess = columnAccess;
        access.markModified('columnAccess');
      }
      access.updatedAt = new Date();
      await access.save();
    }

    res.json({ success: true, access });
  } catch (error) {
    console.error('Update content access error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== PUZZLE CATEGORIES API =====
// Get custom puzzle categories owned by the current user's admin.
app.get('/api/puzzle-categories', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!viewer || viewer.isEnabled === false) return res.status(401).json({ message: 'Unauthorized' });
    const adminId = getContentOwnerId(viewer);
    if (!adminId) return res.json([]);
    const categories = await PuzzleCategory.find({ adminId }).sort({ order_index: 1, createdAt: 1 });
    const adminPuzzleAccess = await getResolvedAdminPuzzleAccess(adminId);
    const grantedCategories = adminPuzzleAccess.puzzleIds.length
      ? await Puzzle.distinct('category', {
          _id: { $in: adminPuzzleAccess.puzzleIds },
          adminId: adminPuzzleAccess.grantedBy,
          isEnabled: true
        })
      : [];
    const grantedCustomCategories = grantedCategories.length > 0
      ? await PuzzleCategory.find({
          adminId: adminPuzzleAccess.grantedBy,
          categoryId: { $in: grantedCategories }
        }).sort({ order_index: 1, createdAt: 1 })
      : [];
    const existingCategoryIds = new Set(categories.map(category => category.categoryId));
    res.json([
      ...categories,
      ...grantedCustomCategories.filter(category => !existingCategoryIds.has(category.categoryId))
    ]);
  } catch (error) {
    console.error('Get puzzle categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get display order for categories owned by the current user's admin.
app.get('/api/puzzle-category-order', async (req, res) => {
  try {
    const viewer = await getAuthenticatedUser(req, '_id role adminId isEnabled');
    if (!viewer || viewer.isEnabled === false) return res.status(401).json({ message: 'Unauthorized' });
    const adminId = getContentOwnerId(viewer);
    if (!adminId) return res.json([]);
    const orders = await PuzzleCategoryOrder.find({ adminId }).sort({ order_index: 1 });
    res.json(orders);
  } catch (error) {
    console.error('Get puzzle category order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Set display order for ALL categories (admin only)
app.put('/api/puzzle-category-order', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { order } = req.body; // Array of { categoryId, order_index, isEnabled, allowedGroups }
    if (!Array.isArray(order)) return res.status(400).json({ message: 'order must be an array' });
    if (order.some(item => !item || typeof item.categoryId !== 'string' ||
        (item.allowedGroups !== undefined && !Array.isArray(item.allowedGroups)))) {
      return res.status(400).json({ message: 'Invalid category order entry' });
    }
    const groupLists = order.filter(item => Array.isArray(item.allowedGroups)).map(item => item.allowedGroups);
    for (const allowedGroups of groupLists) {
      if (!await belongToAdminGroups(allowedGroups, requestingUser._id)) {
        return res.status(400).json({ message: 'Category groups must belong to your admin account' });
      }
    }

    // Upsert each category order
    const bulkOps = order.map(item => ({
      updateOne: {
        filter: { categoryId: item.categoryId, adminId: requestingUser._id },
        update: { $set: {
          categoryId: item.categoryId,
          adminId: requestingUser._id,
          order_index: item.order_index,
          ...(typeof item.isEnabled === 'boolean' ? { isEnabled: item.isEnabled } : {}),
          ...(Array.isArray(item.allowedGroups) ? { allowedGroups: item.allowedGroups } : {})
          ,...(Array.isArray(item.allowedGroups) ? { groupsConfigured: true } : {})
        } },
        upsert: true
      }
    }));
    await PuzzleCategoryOrder.bulkWrite(bulkOps);

    // Also update order_index on custom PuzzleCategory docs (for backward compat)
    for (const item of order) {
      await PuzzleCategory.updateOne(
        { categoryId: item.categoryId, adminId: requestingUser._id },
        { $set: { order_index: item.order_index } }
      );
    }

    const updated = await PuzzleCategoryOrder.find({ adminId: requestingUser._id }).sort({ order_index: 1 });
    res.json(updated);
  } catch (error) {
    console.error('Set puzzle category order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update category visibility and group access (admin only)
app.put('/api/puzzle-category-visibility/:categoryId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { isEnabled, allowedGroups } = req.body;
    const update = {};
    if (typeof isEnabled === 'boolean') update.isEnabled = isEnabled;
    if (Array.isArray(allowedGroups)) {
      if (!await belongToAdminGroups(allowedGroups, requestingUser._id)) {
        return res.status(400).json({ message: 'Category groups must belong to your admin account' });
      }
      update.allowedGroups = allowedGroups;
      update.groupsConfigured = true;
    }
    const settings = await PuzzleCategoryOrder.findOneAndUpdate(
      { categoryId: req.params.categoryId, adminId: requestingUser._id },
      {
        $set: update,
        $setOnInsert: { categoryId: req.params.categoryId, adminId: requestingUser._id, order_index: 999 }
      },
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (error) {
    console.error('Update puzzle category visibility error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a custom puzzle category (admin only)
app.post('/api/puzzle-categories', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const { categoryId, name, description, icon } = req.body;
    if (!categoryId || !name) return res.status(400).json({ message: 'categoryId and name are required' });

    const existing = await PuzzleCategory.findOne({ categoryId, adminId: requestingUser._id });
    if (existing) return res.status(409).json({ message: 'Category already exists' });

    const category = await PuzzleCategory.create({
      categoryId,
      name,
      description,
      icon,
      adminId: requestingUser._id
    });
    res.json(category);
  } catch (error) {
    console.error('Create puzzle category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a custom puzzle category (admin only)
app.delete('/api/puzzle-categories/:categoryId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!isAdminRole(requestingUser)) return res.status(403).json({ message: 'Access denied' });

    const category = await PuzzleCategory.findOne({
      categoryId: req.params.categoryId,
      adminId: requestingUser._id
    });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    await Puzzle.deleteMany({ category: req.params.categoryId, adminId: requestingUser._id });
    await PuzzleCategoryOrder.deleteOne({ categoryId: req.params.categoryId, adminId: requestingUser._id });
    await category.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete puzzle category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// In-memory storage for active games and requests
const activeGames = new Map(); // gameId -> gameData
const gameRequests = new Map(); // requestId -> requestData
const userSockets = new Map(); // userId -> socketIds[]
const socketUsers = new Map(); // socketId -> userId

// Helper: serialize current game state for resume/rejoin events
const getGameStatePayload = (game) => ({
  id: game.id,
  fen: game.fen,
  moves: game.moves,
  turn: game.turn,
  whiteTime: game.whiteTime,
  blackTime: game.blackTime,
  white: game.white,
  black: game.black,
  status: game.status,
  mode: game.mode,
  startedAt: game.startedAt,
  lastMoveAt: game.lastMoveAt
});

// Simple per-game promise queue to process moves sequentially and avoid race conditions
const enqueueGameWork = (gameId, work) => {
  const game = activeGames.get(gameId);
  if (!game) return Promise.resolve();
  game._lock = (game._lock || Promise.resolve()).then(() => work(game)).catch((err) => {
    console.error(`💥 Error in queued game work for ${gameId}:`, err);
  });
  return game._lock;
};

// Helper: check if a user (admin or student) is already in an active game
function isUserInActiveGame(userId) {
  for (const game of activeGames.values()) {
    if (game.status === 'active' && (String(game.white.id) === String(userId) || String(game.black.id) === String(userId))) {
      return true;
    }
  }
  return false;
}
// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user || user.isEnabled === false) {
      return next(new Error('Authentication error: User not found or disabled'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userId = socket.user._id.toString();
  console.log(`🔌 User connected: ${socket.user.username} (role: ${socket.user.role}) (socket: ${socket.id})`);

  // Store socket mapping
  if (!userSockets.has(userId)) userSockets.set(userId, []);
  userSockets.get(userId).push(socket.id);
  socketUsers.set(socket.id, userId);

  // Log all connected users
  console.log(`   📊 Total connected users: ${userSockets.size}`);
  console.log(`   👥 Connected user IDs:`, Array.from(userSockets.keys()));
  console.log(`   🔌 Socket mappings:`, Array.from(userSockets.entries()));

  // Notify admins about online students
  if (socket.user.role === 'student') {
    const ownerSockets = userSockets.get(socket.user.adminId?.toString());
    ownerSockets?.forEach(socketId => {
      io.to(socketId).emit('user:online', { userId, username: socket.user.username });
    });
  }

  // If this user has an active game, immediately reattach and send the latest state
  activeGames.forEach((game) => {
    if (game.status === 'active' && (String(game.white.id) === userId || String(game.black.id) === userId)) {
      const isWhite = String(game.white.id) === userId;
      // Mark player as back online
      if (game.offline) {
        game.offline[isWhite ? 'white' : 'black'] = false;
      }

      // Send full game snapshot to the reconnecting socket
      socket.emit('game:resume', getGameStatePayload(game));

      // Notify opponent about player coming back online
      const opponentId = isWhite ? game.black.id : game.white.id;
      const opponentSockets = userSockets.get(opponentId);
      if (opponentSockets && opponentSockets.length > 0) {
        opponentSockets.forEach((sid) => {
          io.to(sid).emit('game:player-status', {
            gameId: game.id,
            player: isWhite ? 'white' : 'black',
            online: true
          });
        });
      }
    }
  });

  // ---- GAME REQUEST EVENTS ----

  // Student sends game request to coach
  socket.on('game:request-send', async (data) => {
    console.log(`📤 Received game request from ${socket.user.username}, mode: ${data.mode}, targetAdmin: ${data.targetAdminId}`);

    const requestId = generateId();
    if (socket.user.role === 'student') {
      const ownerAdminId = socket.user.adminId?.toString();
      if (!ownerAdminId || (data.targetAdminId && String(data.targetAdminId) !== ownerAdminId)) {
        socket.emit('game:request-sent', { requestId, status: 'no_admin_found' });
        return;
      }
      const ownerAdmin = await User.findOne({
        _id: ownerAdminId,
        role: { $in: ['admin', 'superadmin'] },
        isEnabled: true
      }).select('_id');
      if (!ownerAdmin) {
        socket.emit('game:request-sent', { requestId, status: 'no_admin_found' });
        return;
      }
      data.targetAdminId = ownerAdminId;
    }
    const request = {
      id: requestId,
      from: {
        id: userId,
        username: socket.user.username
      },
      mode: data.mode || 'normal',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // If target admin specified, add to request
    if (data.targetAdminId) {
      const targetAdmin = await User.findById(data.targetAdminId).select('_id username role isEnabled');
      if (targetAdmin && isAdminRole(targetAdmin) && targetAdmin.isEnabled !== false) {
        request.to = {
          id: targetAdmin._id.toString(),
          username: targetAdmin.username
        };
      }
    }

    gameRequests.set(requestId, request);

    // Send to target admin or all connected admins (only admins not already in an active game)
    let adminUsers = [];
    if (data.targetAdminId && request.to) {
      // If target admin is busy or offline, inform student
      const targetId = String(data.targetAdminId);
      const targetAdmin = await User.findById(targetId).select('_id username');
      const targetSockets = userSockets.get(targetId);
      if (!targetAdmin) {
        socket.emit('game:request-sent', { requestId, ...request, status: 'no_admin_found' });
        console.log(`⚠️ Target admin not found: ${data.targetAdminId}`);
        return;
      }
      if (!targetSockets || targetSockets.length === 0 || isUserInActiveGame(targetId)) {
        socket.emit('game:request-sent', { requestId, ...request, status: 'admin_unavailable' });
        console.log(`⚠️ Target admin unavailable or busy: ${targetAdmin.username}`);
        return;
      }
      adminUsers = [targetAdmin];
      console.log(`🎯 Sending request to specific admin: ${request.to.username}`);
    } else {
      const allAdmins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isEnabled: true }).select('_id username');
      console.log(`👥 Found ${allAdmins.length} admin users in database`);
      // Filter to only connected admins who are not currently in an active game
      adminUsers = allAdmins.filter(a => {
        const id = a._id.toString();
        const sockets = userSockets.get(id);
        return sockets && sockets.length > 0 && !isUserInActiveGame(id);
      });
      console.log(`👥 Notifying ${adminUsers.length} available admins`);
    }

    let notifiedCount = 0;
    adminUsers.forEach(admin => {
      const adminSockets = userSockets.get(admin._id.toString());
      console.log(`   Admin ${admin.username} (${admin._id}): sockets = ${adminSockets || 'NOT CONNECTED'}`);
      if (adminSockets && adminSockets.length > 0) {
        adminSockets.forEach(socketId => {
          io.to(socketId).emit('game:request', { ...request, id: requestId });
        });
        notifiedCount++;
        console.log(`   ✅ Sent game:request to admin ${admin.username}`);
      }
    });

    console.log(`📬 Notified ${notifiedCount}/${adminUsers.length} admins about game request`);

    // Confirm to sender
    socket.emit('game:request-sent', { requestId, ...request });
    console.log(`📩 Game request from ${socket.user.username}: ${requestId}`);
  });

  // Cancel game request
  socket.on('game:request-cancel', (data) => {
    const request = gameRequests.get(data.requestId);
    if (request && request.from.id === userId) {
      gameRequests.delete(data.requestId);
      if (request.to) {
        const targetSockets = userSockets.get(request.to.id);
        targetSockets?.forEach(socketId => {
          io.to(socketId).emit('game:request-cancelled', { requestId: data.requestId });
        });
      }
      console.log(`❌ Game request cancelled: ${data.requestId}`);
    }
  });

  // Admin accepts game request
  socket.on('game:request-accept', async (data) => {
    if (!isAdminRole(socket.user)) {
      socket.emit('error', { message: 'Only admins can accept game requests' });
      return;
    }

    const request = gameRequests.get(data.requestId);
    if (!request) {
      socket.emit('error', { message: 'Game request not found' });
      return;
    }

    // Check if this admin is the target (if specified)
    if (request.to && request.to.id !== userId) {
      socket.emit('error', { message: 'This request is not for you' });
      return;
    }

    console.log(`🎮 Admin ${socket.user.username} accepting game request`);
    console.log(`   Request from: ${request.from.username} (ID: ${request.from.id})`);
    console.log(`   Admin user ID: ${userId} (from socket.user._id)`);
    console.log(`   Admin socket.user._id type: ${typeof socket.user._id}`);
    console.log(`   Request.from.id type: ${typeof request.from.id}`);

    // Normalize IDs (strings) first
    const studentId = String(request.from.id);
    const adminId = String(userId);

    // Prevent multiple simultaneous games per user/admin
    if (isUserInActiveGame(adminId)) {
      socket.emit('error', { message: 'You are already in an active game' });
      console.log(`⚠️ Admin ${socket.user.username} attempted to accept while busy`);
      return;
    }

    if (isUserInActiveGame(studentId)) {
      socket.emit('error', { message: 'Student is already in an active game' });
      console.log(`⚠️ Student ${request.from.username} is already in an active game`);
      return;
    }

    const gameId = generateId();
    const timeControl = data.timeControl || { initial: 600, increment: 0 }; // Default 10 min

    // Create the game - student gets random color
    const studentIsWhite = Math.random() > 0.5;

    console.log(`   Normalized student ID: ${studentId}`);
    console.log(`   Normalized admin ID: ${adminId}`);

    const game = {
      id: gameId,
      white: studentIsWhite
        ? { id: studentId, username: request.from.username }
        : { id: adminId, username: socket.user.username },
      black: studentIsWhite
        ? { id: adminId, username: socket.user.username }
        : { id: studentId, username: request.from.username },
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: [],
      mode: request.mode,
      timeControl,
      whiteTime: timeControl.initial,
      blackTime: timeControl.initial,
      turn: 'w',
      status: 'active',
      startedAt: new Date().toISOString(),
      lastMoveAt: new Date().toISOString(),
      offline: { white: false, black: false },
      _lock: Promise.resolve()
    };

    activeGames.set(gameId, game);
    gameRequests.delete(data.requestId);

    // Notify the student
    const studentSockets = userSockets.get(request.from.id);
    if (studentSockets && studentSockets.length > 0) {
      studentSockets.forEach(socketId => {
        io.to(socketId).emit('game:request-response', {
          requestId: data.requestId,
          status: 'accepted',
          game
        });
        io.to(socketId).emit('game:started', game);
      });
    }

    // Notify the admin (coach)
    socket.emit('game:started', game);

    // Start the game timer
    startGameTimer(gameId);

    console.log(`🎮 Game started: ${gameId}`);
    console.log(`   White: ${game.white.username} (ID: ${game.white.id})`);
    console.log(`   Black: ${game.black.username} (ID: ${game.black.id})`);
    console.log(`   Connected sockets:`, Array.from(userSockets.entries()));
  });

  // Admin declines game request
  socket.on('game:request-decline', (data) => {
    if (!isAdminRole(socket.user)) return;

    const request = gameRequests.get(data.requestId);
    if (request?.to && request.to.id !== userId) return;
    if (request) {
      gameRequests.delete(data.requestId);

      // Notify the student
      const studentSockets = userSockets.get(request.from.id);
      if (studentSockets && studentSockets.length > 0) {
        studentSockets.forEach(socketId => {
          io.to(socketId).emit('game:request-response', {
            requestId: data.requestId,
            status: 'declined'
          });
        });
      }

      console.log(`❌ Game request declined: ${data.requestId}`);
    }
  });

  // ---- GAME EVENTS ----
  registerLiveGameValidationHandlers(socket, { userId, activeGames, userSockets, io, endGame });

  // Resign
  socket.on('game:resign', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.status !== 'active') return;

    const isWhite = game.white.id === userId;
    const result = isWhite ? 'black' : 'white';

    endGame(data.gameId, result, 'resignation');
  });

  // Offer draw
  socket.on('game:offer-draw', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.status !== 'active') return;

    const isWhite = game.white.id === userId;
    const opponentId = isWhite ? game.black.id : game.white.id;
    const opponentSockets = userSockets.get(opponentId);
    if (opponentSockets && opponentSockets.length > 0) {
      opponentSockets.forEach(sid => {
        io.to(sid).emit('game:draw-offered', {
          gameId: game.id,
          from: socket.user.username
        });
      });
    }
  });

  // Accept draw
  socket.on('game:accept-draw', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.status !== 'active') return;

    endGame(data.gameId, 'draw', 'agreement');
  });

  // Leave game
  socket.on('game:leave', (data) => {
    const game = activeGames.get(data.gameId);
    if (game && game.status === 'finished') {
      // Clean up if both players left
      const isWhite = game.white.id === userId;
      const opponentId = isWhite ? game.black.id : game.white.id;
      const opponentSockets = userSockets.get(opponentId);
      const opponentConnected = opponentSockets && opponentSockets.some(sid => io.sockets.sockets.get(sid));

      if (!opponentConnected) {
        activeGames.delete(data.gameId);
        console.log(`🗑️ Game ${data.gameId} cleaned up`);
      }
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.user.username}`);
    const sockets = userSockets.get(userId);
    if (sockets) {
      const idx = sockets.indexOf(socket.id);
      if (idx >= 0) sockets.splice(idx, 1);
      if (sockets.length === 0) userSockets.delete(userId);
    }
    socketUsers.delete(socket.id);

    // Notify about offline status
    if (socket.user.role === 'student') {
      const ownerSockets = userSockets.get(socket.user.adminId?.toString());
      ownerSockets?.forEach(socketId => {
        io.to(socketId).emit('user:offline', { userId, username: socket.user.username });
      });
    }

    // Handle active games: mark player offline but do NOT end the game. Clocks keep running server-side.
    activeGames.forEach((game) => {
      if ((String(game.white.id) === userId || String(game.black.id) === userId) && game.status === 'active') {
        const isWhite = String(game.white.id) === userId;
        if (game.offline) {
          game.offline[isWhite ? 'white' : 'black'] = true;
        }
        const opponentId = isWhite ? game.black.id : game.white.id;
        const opponentSockets = userSockets.get(opponentId);
        if (opponentSockets && opponentSockets.length > 0) {
          opponentSockets.forEach((sid) => {
            io.to(sid).emit('game:player-status', {
              gameId: game.id,
              player: isWhite ? 'white' : 'black',
              online: false
            });
          });
        }
      }
    });
  });
});

// Game timer function
function startGameTimer(gameId) {
  console.log(`⏱️ Starting game timer for game ${gameId}`);

  let lastLoggedTime = 0;
  const timerInterval = setInterval(() => {
    const game = activeGames.get(gameId);
    if (!game || game.status !== 'active') {
      clearInterval(timerInterval);
      console.log(`⏹️ Timer stopped for game ${gameId}`);
      return;
    }

    // ✅ CHESS RULE: Only ONE timer decrements at a time
    // Decrement time ONLY for the player whose turn it is
    if (game.turn === 'w') {
      game.whiteTime = Math.max(0, game.whiteTime - 1);
      // Only log every 10 seconds to reduce spam
      if (game.whiteTime % 10 === 0 && game.whiteTime !== lastLoggedTime) {
        console.log(`⏰ WHITE's turn | White: ${game.whiteTime}s | Black: ${game.blackTime}s`);
        lastLoggedTime = game.whiteTime;
      }

      if (game.whiteTime === 0) {
        clearInterval(timerInterval);
        console.log('⏰ WHITE ran out of time - BLACK wins!');
        endGame(gameId, 'black', 'timeout');
        return;
      }
    } else {
      game.blackTime = Math.max(0, game.blackTime - 1);
      // Only log every 10 seconds to reduce spam
      if (game.blackTime % 10 === 0 && game.blackTime !== lastLoggedTime) {
        console.log(`⏰ BLACK's turn | White: ${game.whiteTime}s | Black: ${game.blackTime}s`);
        lastLoggedTime = game.blackTime;
      }

      if (game.blackTime === 0) {
        clearInterval(timerInterval);
        console.log('⏰ BLACK ran out of time - WHITE wins!');
        endGame(gameId, 'white', 'timeout');
        return;
      }
    }

    // Send time updates to both players every second
    const whiteSockets = userSockets.get(game.white.id);
    const blackSockets = userSockets.get(game.black.id);

    const timeUpdate = {
      gameId,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      turn: game.turn
    };

    // Send to all white player's sockets
    if (whiteSockets && whiteSockets.length > 0) {
      whiteSockets.forEach(socketId => {
        io.to(socketId).emit('game:time-update', timeUpdate);
      });
    }

    // Send to all black player's sockets
    if (blackSockets && blackSockets.length > 0) {
      blackSockets.forEach(socketId => {
        io.to(socketId).emit('game:time-update', timeUpdate);
      });
    }
  }, 1000);

  // Store timer reference for cleanup
  const game = activeGames.get(gameId);
  if (game) {
    game.timerInterval = timerInterval;
  }
}

// End game function
function endGame(gameId, result, reason) {
  const game = activeGames.get(gameId);
  if (!game) return;

  // Clear timer
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
  }

  game.status = 'finished';
  game.result = result;
  game.resultReason = reason;

  // Create a clear winner message
  let winnerMessage = '';
  if (result === 'white') {
    winnerMessage = `WHITE WINS by ${reason}! 🎉`;
  } else if (result === 'black') {
    winnerMessage = `BLACK WINS by ${reason}! 🎉`;
  } else if (result === 'draw') {
    winnerMessage = `Game DRAWN by ${reason}`;
  }

  console.log(`🏁 Game ended: ${gameId} | ${winnerMessage}`);

  // Notify both players
  const endData = { gameId, result, reason };

  const whiteSockets = userSockets.get(game.white.id);
  const blackSockets = userSockets.get(game.black.id);

  if (whiteSockets && whiteSockets.length > 0) {
    whiteSockets.forEach(sid => io.to(sid).emit('game:ended', endData));
  }
  if (blackSockets && blackSockets.length > 0) {
    blackSockets.forEach(sid => io.to(sid).emit('game:ended', endData));
  }

  console.log(`   👤 ${game.white.username} (White) vs ${game.black.username} (Black)`);
  console.log(`   ⏱️ Final times - White: ${game.whiteTime}s | Black: ${game.blackTime}s`);

  // Keep game in memory for a while for review, then delete
  setTimeout(() => {
    activeGames.delete(gameId);
  }, 300000); // 5 minutes
}

// API endpoint to get pending game requests (for admin dashboard polling fallback)
app.get('/api/game-requests', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!isAdminRole(user)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const requests = Array.from(gameRequests.values());
    res.json(requests);
  } catch (error) {
    console.error('Get game requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// One-time migration to fix puzzle order values
async function migratePuzzleOrders() {
  try {
    // Keep puzzle order independent for each admin and category.
    const allPuzzles = await Puzzle.find().sort({ createdAt: 1 });
    const puzzlesByOwnerAndCategory = new Map();
    allPuzzles.forEach(puzzle => {
      const key = `${puzzle.adminId?.toString() || 'unowned'}:${puzzle.category}`;
      if (!puzzlesByOwnerAndCategory.has(key)) {
        puzzlesByOwnerAndCategory.set(key, []);
      }
      puzzlesByOwnerAndCategory.get(key).push(puzzle);
    });

    let totalUpdated = 0;

    // For each category, reassign sequential order values
    for (const categoryPuzzles of puzzlesByOwnerAndCategory.values()) {

      // Sort by existing order (ascending) then by createdAt
      categoryPuzzles.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      // Reassign sequential order values starting from 1
      for (let i = 0; i < categoryPuzzles.length; i++) {
        const puzzle = categoryPuzzles[i];
        const newOrder = i + 1;

        if (puzzle.order !== newOrder) {
          await Puzzle.findByIdAndUpdate(puzzle._id, {
            order: newOrder,
            updatedAt: new Date()
          });
          totalUpdated++;
        }
      }
    }

    if (totalUpdated > 0) {
      console.log(`✅ Migration completed: Updated order for ${totalUpdated} puzzles across ${puzzlesByOwnerAndCategory.size} admin/category groups`);
    } else {
      console.log('✅ Migration check: All puzzle orders are already correct');
    }
  } catch (err) {
    console.error('Error during puzzle order migration:', err);
  }
}

// Start server
httpServer.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.IO enabled for real-time games`);
  await migratePuzzleOrders();
});
