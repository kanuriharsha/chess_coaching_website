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
    if (req.path === '/activity/beacon') return next();

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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ContentAccess = mongoose.model('ContentAccess', contentAccessSchema, 'contentaccess');

async function getContentAccessForUser(userId) {
  return ContentAccess.findOne({ userId }).lean();
}

async function belongToAdminGroups(groupIds, adminId) {
  if (!Array.isArray(groupIds) || groupIds.some(id => !mongoose.isValidObjectId(id))) return false;
  const uniqueIds = [...new Set(groupIds.map(String))];
  const ownedGroups = await Group.countDocuments({ _id: { $in: uniqueIds }, adminId });
  return ownedGroups === uniqueIds.length;
}

async function getVisiblePuzzles(viewer, category) {
  const adminId = getContentOwnerId(viewer);
  const query = { adminId };
  if (category) query.category = category;
  if (!isAdminRole(viewer)) query.isEnabled = true;

  const [puzzles, access, categorySettings] = await Promise.all([
    Puzzle.find(query).sort({ order: 1, createdAt: 1 }),
    isAdminRole(viewer) ? null : getContentAccessForUser(viewer._id),
    isAdminRole(viewer) ? [] : PuzzleCategoryOrder.find(
      category ? { adminId, categoryId: category } : { adminId }
    ).lean()
  ]);

  if (isAdminRole(viewer)) return puzzles;
  return filterVisiblePuzzles(puzzles, access, categorySettings, viewer);
}

// User Activity Schema - Tracks all user activity with timestamps
const userActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['puzzle_attempt', 'puzzle_solved', 'puzzle_failed', 'login', 'logout'],
    required: true
  },
  description: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  duration: { type: Number }, // in seconds
  details: {
    page: { type: String },
    puzzleId: { type: String },
    attemptId: { type: String },
    puzzleName: { type: String },
    category: { type: String },
    attempts: { type: Number },
    result: { type: String, enum: ['passed', 'failed'] },
    timeSpent: { type: Number }
  }
});

// Index for efficient querying
userActivitySchema.index({ userId: 1, timestamp: -1 });
userActivitySchema.index({ userId: 1, type: 1 });
userActivitySchema.index({ userId: 1, type: 1, 'details.puzzleId': 1 });
userActivitySchema.index({ adminId: 1, userId: 1, timestamp: -1 });
userActivitySchema.index(
  { userId: 1, 'details.attemptId': 1 },
  {
    unique: true,
    partialFilterExpression: { 'details.attemptId': { $type: 'string' } }
  }
);

const UserActivity = mongoose.model('UserActivity', userActivitySchema, 'useractivities');

async function recordPuzzleAttempt(activityData) {
  const { userId, puzzleId, attemptId, type } = activityData;
  const progressUpdate = buildPuzzleProgressAttemptUpdate(type === 'puzzle_solved');

  for (let retry = 0; retry < 3; retry += 1) {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const existingActivity = await UserActivity.findOne({
          userId,
          'details.attemptId': attemptId
        }).session(session);

        if (existingActivity) {
          if (
            existingActivity.details?.puzzleId !== puzzleId ||
            existingActivity.type !== type
          ) {
            const error = new Error('Attempt id was already used for another puzzle result');
            error.status = 409;
            throw error;
          }
          const progress = await PuzzleProgress.findOne({ userId, puzzleId })
            .session(session)
            .lean();
          result = { activity: existingActivity, progress, duplicate: true };
          return;
        }

        const progress = await PuzzleProgress.findOneAndUpdate(
          { userId, puzzleId },
          progressUpdate,
          { new: true, upsert: retry === 0, session }
        );
        if (!progress) throw new Error('Puzzle progress record was not found');

        const { puzzleName, puzzleNumber, category } = activityData.details;
        const puzzleLabel = puzzleNumber ? `Puzzle ${puzzleNumber}` : puzzleName;
        const description = type === 'puzzle_solved'
          ? `✅ Completed ${puzzleLabel}${puzzleName !== puzzleLabel ? ` (${puzzleName})` : ''} in ${category}`
          : `❌ Failed ${puzzleLabel}${puzzleName !== puzzleLabel ? ` (${puzzleName})` : ''} in ${category} (Attempt ${progress.a})`;
        const activity = new UserActivity({
          ...activityData,
          description,
          details: { ...activityData.details, attempts: progress.a }
        });
        await activity.save({ session });
        result = { activity, progress, duplicate: false };
      });
      return result;
    } catch (error) {
      if (error.code === 11000) {
        const existingActivity = await UserActivity.findOne({
          userId,
          'details.attemptId': attemptId
        }).lean();
        if (existingActivity) {
          if (
            existingActivity.details?.puzzleId !== puzzleId ||
            existingActivity.type !== type
          ) {
            const conflict = new Error('Attempt id was already used for another puzzle result');
            conflict.status = 409;
            throw conflict;
          }
          const progress = await PuzzleProgress.findOne({ userId, puzzleId }).lean();
          return { activity: existingActivity, progress, duplicate: true };
        }
        if (retry === 2) throw error;
      } else {
        throw error;
      }
    } finally {
      await session.endSession();
    }
  }

  throw new Error('Unable to record puzzle attempt');
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
    const [categoryTotals, solvedGroups] = await Promise.all([
      Puzzle.aggregate([
        { $match: { isEnabled: true, adminId: requestingUser._id } },
        { $group: { _id: '$category', total: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      PuzzleProgress.find({ userId, completed: true }).select('puzzleId').lean()
    ]);

    const solvedObjectIds = solvedGroups
      .map(item => item.puzzleId)
      .filter(id => mongoose.isValidObjectId(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const solvedPuzzles = solvedObjectIds.length > 0
      ? await Puzzle.find({ _id: { $in: solvedObjectIds }, isEnabled: true, adminId: requestingUser._id })
          .select('_id category order')
          .lean()
      : [];

    const solvedByCategory = {};
    const solvedNumbersByCategory = {};
    solvedPuzzles.forEach(puzzle => {
      solvedByCategory[puzzle.category] = (solvedByCategory[puzzle.category] || 0) + 1;
      if (!solvedNumbersByCategory[puzzle.category]) solvedNumbersByCategory[puzzle.category] = [];
      solvedNumbersByCategory[puzzle.category].push(puzzle.order || 0);
    });

    const categories = categoryTotals.map(({ _id: category, total }) => {
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
    const admins = await User.find({ role: 'admin', verificationStatus: { $ne: 'under_review' } })
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

// ============ USER ACTIVITY TRACKING ROUTES ============

// Record user activity
app.post('/api/users/:id/activity', async (req, res) => {
  try {
    const { type, description, duration, details } = req.body;
    if (type === 'page_visit' || type === 'opening_viewed' || type === 'game_viewed') {
      return res.status(204).send();
    }
    const requestingUser = req.authUser;
    const targetUser = req.targetUser;
    if (!requestingUser || !targetUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!requestingUser._id.equals(targetUser._id) && !canManageStudent(requestingUser, targetUser)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const adminId = targetUser.role === 'student' ? targetUser.adminId : targetUser._id;
    if (!adminId) return res.status(400).json({ message: 'Activity owner is not available' });

    if (type === 'puzzle_solved' || type === 'puzzle_failed') {
      if (targetUser.role !== 'student' || !requestingUser._id.equals(targetUser._id)) {
        return res.status(403).json({ message: 'Puzzle attempts must be recorded by the student' });
      }
      if (
        !mongoose.isValidObjectId(details?.puzzleId) ||
        typeof details?.attemptId !== 'string' ||
        !details.attemptId.trim() ||
        details.attemptId.length > 128
      ) {
        return res.status(400).json({ message: 'A valid puzzle id and attempt id are required' });
      }
      if (
        details.result &&
        ((type === 'puzzle_solved') !== (details.result === 'passed'))
      ) {
        return res.status(400).json({ message: 'Puzzle result does not match activity type' });
      }

      const puzzle = await Puzzle.findOne({
        _id: details.puzzleId,
        adminId,
        isEnabled: true
      });
      if (!puzzle) return res.status(404).json({ message: 'Puzzle not found' });

      const puzzleAccessViewer = await User.findById(targetUser._id)
        .select('_id role groupId adminId');
      if (!puzzleAccessViewer) return res.status(404).json({ message: 'Student not found' });
      const visiblePuzzles = await getVisiblePuzzles(puzzleAccessViewer, puzzle.category);
      const canAccessPuzzle = visiblePuzzles.some(item =>
        String(item._id) === String(puzzle._id) && !item.isLocked
      );
      if (!canAccessPuzzle) return res.status(403).json({ message: 'Puzzle access denied' });

      const result = type === 'puzzle_solved' ? 'passed' : 'failed';
      const attempt = await recordPuzzleAttempt({
        userId: targetUser._id,
        adminId,
        type,
        description,
        duration: duration || 0,
        details: {
          ...details,
          puzzleId: String(puzzle._id),
          attemptId: details.attemptId,
          puzzleName: puzzle.name,
          category: puzzle.category,
          result
        },
        timestamp: new Date()
      });
      return res.status(attempt.duplicate ? 200 : 201).json(attempt.activity);
    }

    const activity = new UserActivity({
      userId: targetUser._id,
      adminId,
      type,
      description,
      duration: duration || 0,
      details: details || {},
      timestamp: new Date()
    });

    await activity.save();
    res.status(201).json(activity);
  } catch (error) {
    console.error('Record activity error:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error' });
  }
});

// Beacon endpoint for page unload tracking (token in body since headers not supported)
app.post('/api/users/:id/activity/beacon', async (req, res) => {
  try {
    const { type, description, duration, details, _token } = req.body;

    if (type === 'page_visit' || type === 'opening_viewed' || type === 'game_viewed') {
      return res.status(204).send();
    }

    if (!_token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(_token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id).select('_id isEnabled role adminId');
    if (!requestingUser || requestingUser.isEnabled === false) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Users can only record their own activity
    if (!requestingUser._id.equals(req.params.id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const adminId = requestingUser.role === 'student' ? requestingUser.adminId : requestingUser._id;
    if (!adminId) return res.status(400).json({ message: 'Activity owner is not available' });

    const activity = new UserActivity({
      userId: requestingUser._id,
      adminId,
      type,
      description,
      duration: duration || 0,
      details: details || {},
      timestamp: new Date()
    });

    await activity.save();
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Beacon activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user activities (for admin dashboard)
app.get('/api/users/:id/activity', async (req, res) => {
  try {
    const requestingUser = req.authUser;
    if (!requestingUser) return res.status(401).json({ message: 'Unauthorized' });

    const { limit = 50, startDate, endDate, type } = req.query;

    const query = { userId: req.params.id };
    if (requestingUser.role === 'admin') query.adminId = requestingUser._id;

    // Filter by date range if provided
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Filter by activity type if provided
    if (type) {
      query.type = type;
    }

    const activities = await UserActivity.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(activities);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user activity summary (aggregated stats)
app.get('/api/users/:id/activity/summary', async (req, res) => {
  try {
    const requestingUser = req.authUser;
    if (!requestingUser) return res.status(401).json({ message: 'Unauthorized' });

    const { startDate, endDate } = req.query;

    const matchQuery = { userId: new mongoose.Types.ObjectId(req.params.id) };
    if (requestingUser.role === 'admin') matchQuery.adminId = requestingUser._id;

    if (startDate || endDate) {
      matchQuery.timestamp = {};
      if (startDate) matchQuery.timestamp.$gte = new Date(startDate);
      if (endDate) matchQuery.timestamp.$lte = new Date(endDate);
    }

    const summary = await UserActivity.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          lastActivity: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get puzzle-specific stats
    const puzzleStats = await UserActivity.aggregate([
      {
        $match: {
          ...matchQuery,
          type: { $in: ['puzzle_solved', 'puzzle_failed'] }
        }
      },
      {
        $group: {
          _id: '$details.category',
          solved: {
            $sum: { $cond: [{ $eq: ['$type', 'puzzle_solved'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$type', 'puzzle_failed'] }, 1, 0] }
          },
          totalAttempts: { $sum: 1 },
          totalTime: { $sum: '$details.timeSpent' }
        }
      }
    ]);

    res.json({ summary, puzzleStats });
  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete old activities (cleanup - admin only)
app.delete('/api/activity/cleanup', async (req, res) => {
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

    const { daysOld = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));

    const query = { timestamp: { $lt: cutoffDate } };
    if (requestingUser.role === 'admin') query.adminId = requestingUser._id;
    const result = await UserActivity.deleteMany(query);

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} activities older than ${daysOld} days`
    });
  } catch (error) {
    console.error('Cleanup activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
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

    const [progressRecords, allPuzzles] = await Promise.all([
      PuzzleProgress.find({ userId: student._id }).lean(),
      Puzzle.find({ isEnabled: true, adminId: student.adminId })
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

    const puzzles = await getVisiblePuzzles(viewer);
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

    const puzzles = await getVisiblePuzzles(viewer, req.params.category);
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

    const openings = await Opening.find({ adminId: getContentOwnerId(viewer) }).sort({ createdAt: -1 });
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

    const famousMates = await FamousMate.find({ adminId: getContentOwnerId(viewer) }).sort({ createdAt: -1 });
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

    const famousMate = await FamousMate.findOne({ _id: req.params.id, adminId: getContentOwnerId(viewer) });
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

    const games = await BestGame.find({ adminId: getContentOwnerId(viewer) }).sort({ createdAt: -1 });
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
    const totalPuzzles = await Puzzle.countDocuments({ adminId: requestingUser._id });
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

    res.json(access);
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

    res.json(access);
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

    const { puzzleAccess, openingAccess, famousMatesAccess, bestGamesAccess } = req.body;

    let access = await ContentAccess.findOne({ userId: req.params.userId });

    if (!access) {
      access = await ContentAccess.create({
        userId: req.params.userId,
        puzzleAccess: puzzleAccess || {},
        openingAccess: openingAccess || { enabled: false, allowedOpenings: [] },
        famousMatesAccess: famousMatesAccess || { enabled: false, allowedMates: [] },
        bestGamesAccess: bestGamesAccess || { enabled: false, allowedGames: [] }
      });
    } else {
      if (puzzleAccess) {
        access.puzzleAccess = puzzleAccess;
        access.markModified('puzzleAccess'); // Required for Mixed type fields
      }
      if (openingAccess) access.openingAccess = openingAccess;
      if (famousMatesAccess) access.famousMatesAccess = famousMatesAccess;
      if (bestGamesAccess) access.bestGamesAccess = bestGamesAccess;
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
    res.json(categories);
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
