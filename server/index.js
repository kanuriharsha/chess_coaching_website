import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

// CORS configuration - Allow localhost and production Vercel URLs
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.CORS_ORIGIN || null
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// MongoDB Connection String (use environment variable in production)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://harsha:harsha@cluster0.gwmwpwl.mongodb.net/harshachess?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'harshachess_jwt_secret_key_2024';

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
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB - harshachess database'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'student'], default: 'student' },
  isEnabled: { type: Boolean, default: true },
  onboardingComplete: { type: Boolean, default: false },
  joiningDate: { type: Date },
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
    schoolName: String
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema, 'login');

// Puzzle Schema
const puzzleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String },
  fen: { type: String, required: true },
  solution: [{ type: String }],
  hint: { type: String },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  icon: { type: String, default: '♔' },
  isEnabled: { type: Boolean, default: true },
  preloadedMove: { type: String }, // Optional move to execute automatically before student plays
  successMessage: { type: String, default: 'Checkmate! Brilliant move!' }, // Custom success message when puzzle is solved
  order: { type: Number, default: 0 }, // Order for manual arrangement
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Puzzle = mongoose.model('Puzzle', puzzleSchema, 'puzzles');

// Opening Schema
const openingSchema = new mongoose.Schema({
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
  categoryId: { type: String, required: true, unique: true }, // slug e.g. 'gain-a-queen'
  name: { type: String, required: true },
  description: { type: String, default: 'Custom puzzle category' },
  icon: { type: String, default: '\u265F' },
  createdAt: { type: Date, default: Date.now }
});
const PuzzleCategory = mongoose.model('PuzzleCategory', puzzleCategorySchema, 'puzzlecategories');

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

// User Activity Schema - Tracks all user activity with timestamps
const userActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['page_visit', 'puzzle_attempt', 'puzzle_solved', 'puzzle_failed', 'opening_viewed', 'game_viewed', 'login', 'logout'],
    required: true 
  },
  description: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  duration: { type: Number }, // in seconds
  details: {
    page: { type: String },
    puzzleId: { type: String },
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

const UserActivity = mongoose.model('UserActivity', userActivitySchema, 'useractivities');

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role = 'student' } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Store password as plain text
    const user = await User.create({
      username,
      password: password, // Plain text password
      role,
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
        isEnabled: foundUser.isEnabled,
        onboardingComplete: foundUser.onboardingComplete,
        profile: foundUser.profile
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
      isEnabled: user.isEnabled,
      onboardingComplete: user.onboardingComplete,
      profile: user.profile
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

// Get all users (admin only)
app.get('/api/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    
    if (requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const users = await User.find().select('-password');
    res.json(users.map(user => ({
      id: user._id,
      username: user.username,
      role: user.role,
      isEnabled: user.isEnabled,
      onboardingComplete: user.onboardingComplete,
      joiningDate: user.joiningDate,
      attendance: user.attendance || [],
      achievements: user.achievements || [],
      profile: user.profile,
      createdAt: user.createdAt
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get available coaches (public endpoint for students to see coaches)
app.get('/api/coaches', async (req, res) => {
  try {
    const coaches = await User.find({ role: 'admin', isEnabled: true }).select('_id username');
    res.json(coaches.map(coach => ({
      _id: coach._id.toString(),
      username: coach.username
    })));
  } catch (error) {
    console.error('Get coaches error:', error);
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
    
    if (requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { username, password, role, isEnabled, joiningDate, profile, achievements } = req.body;
    const updateData = { updatedAt: new Date() };

    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (typeof isEnabled === 'boolean') updateData.isEnabled = isEnabled;
    if (password) updateData.password = password; // Plain text password
    if (joiningDate) updateData.joiningDate = new Date(joiningDate);
    if (profile) updateData.profile = profile;
    if (achievements) updateData.achievements = achievements;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
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
        joiningDate: user.joiningDate,
        attendance: user.attendance || [],
        achievements: user.achievements || [],
        profile: user.profile
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
    
    if (requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await User.findByIdAndDelete(req.params.id);
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
    
    if (requestingUser.role !== 'admin') {
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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
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
    if (decoded.id !== req.params.id && requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const { date, daysBefore } = req.query;
    let targetDate = null;
    if (date) {
      targetDate = new Date(date);
    } else if (typeof daysBefore !== 'undefined') {
      const days = parseInt(daysBefore.toString(), 10) || 0;
      targetDate = new Date();
      targetDate.setHours(0,0,0,0);
      targetDate.setDate(targetDate.getDate() - days);
    } else {
      return res.status(400).json({ message: 'Provide date or daysBefore query parameter' });
    }

    targetDate.setHours(0,0,0,0);

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!Array.isArray(user.attendance) || user.attendance.length === 0) {
      return res.status(404).json({ message: 'No attendance records' });
    }

    const beforeCount = user.attendance.length;
    user.attendance = user.attendance.filter(a => {
      const aDate = new Date(a.date);
      aDate.setHours(0,0,0,0);
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
    if (decoded.id !== req.params.id && requestingUser.role !== 'admin') {
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const { paid, secretNote, secretVisible } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const fee = user.fees.id(req.params.feeId);
    if (!fee) return res.status(404).json({ message: 'Fee record not found' });

    // Update fields if provided
    if (typeof paid === 'boolean') fee.paid = paid;
    if (typeof secretNote === 'string') fee.secretNote = secretNote;
    if (typeof secretVisible === 'boolean') fee.secretVisible = secretVisible;
    
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

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
    
    if (requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { date, attendanceRecords } = req.body; // attendanceRecords: [{userId, status, note}]
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    for (const record of attendanceRecords) {
      const user = await User.findById(record.userId);
      if (user) {
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
    }

    res.json({ success: true, message: 'Attendance updated for all users' });
  } catch (error) {
    console.error('Bulk attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ USER ACTIVITY TRACKING ROUTES ============

// Record user activity
app.post('/api/users/:id/activity', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const { type, description, duration, details } = req.body;

    // Users can only record their own activity, or admin can record for anyone
    const requestingUser = await User.findById(decoded.id);
    if (decoded.id !== req.params.id && requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const activity = new UserActivity({
      userId: req.params.id,
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
    res.status(500).json({ message: 'Server error' });
  }
});

// Beacon endpoint for page unload tracking (token in body since headers not supported)
app.post('/api/users/:id/activity/beacon', async (req, res) => {
  try {
    const { type, description, duration, details, _token } = req.body;
    
    if (!_token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(_token, JWT_SECRET);

    // Users can only record their own activity
    if (decoded.id !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const activity = new UserActivity({
      userId: req.params.id,
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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    // Only the user themselves or admin can view activity
    if (decoded.id !== req.params.id && requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { limit = 50, startDate, endDate, type } = req.query;
    
    const query = { userId: req.params.id };
    
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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    if (decoded.id !== req.params.id && requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate } = req.query;
    
    const matchQuery = { userId: new mongoose.Types.ObjectId(req.params.id) };
    
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

    if (requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { daysOld = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));

    const result = await UserActivity.deleteMany({
      timestamp: { $lt: cutoffDate }
    });

    res.json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} activities older than ${daysOld} days` 
    });
  } catch (error) {
    console.error('Cleanup activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user puzzle progress (derived from activity data)
app.get('/api/users/:id/puzzle-progress', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);

    if (decoded.id !== req.params.id && requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get all puzzle activities for the user
    const puzzleActivities = await UserActivity.find({
      userId: req.params.id,
      type: { $in: ['puzzle_solved', 'puzzle_failed'] }
    }).sort({ timestamp: -1 });

    // Get all puzzles to know total counts
    const allPuzzles = await Puzzle.find({ isEnabled: true });
    
    // Group puzzles by category
    const puzzlesByCategory = {};
    allPuzzles.forEach(puzzle => {
      if (!puzzlesByCategory[puzzle.category]) {
        puzzlesByCategory[puzzle.category] = [];
      }
      puzzlesByCategory[puzzle.category].push({
        puzzleId: puzzle._id.toString(),
        puzzleName: puzzle.name
      });
    });

    // Group activities by category and puzzle
    const progressByCategory = {};
    
    puzzleActivities.forEach(activity => {
      const category = activity.details?.category || 'unknown';
      const puzzleName = activity.details?.puzzleName || 'Unknown';
      const puzzleId = activity.details?.puzzleId || activity._id.toString();
      
      if (!progressByCategory[category]) {
        progressByCategory[category] = {
          puzzles: {}
        };
      }
      
      if (!progressByCategory[category].puzzles[puzzleId]) {
        progressByCategory[category].puzzles[puzzleId] = {
          puzzleId,
          puzzleName,
          solved: false,
          attempts: 0,
          solvedAt: null
        };
      }
      
      progressByCategory[category].puzzles[puzzleId].attempts++;
      if (activity.type === 'puzzle_solved' && !progressByCategory[category].puzzles[puzzleId].solved) {
        progressByCategory[category].puzzles[puzzleId].solved = true;
        progressByCategory[category].puzzles[puzzleId].solvedAt = activity.timestamp;
      }
    });

    // Format the response
    const result = Object.keys(puzzlesByCategory).map(category => {
      const categoryPuzzles = puzzlesByCategory[category];
      const progress = progressByCategory[category]?.puzzles || {};
      
      const puzzleDetails = categoryPuzzles.map(puzzle => {
        const progressData = progress[puzzle.puzzleId] || {
          puzzleId: puzzle.puzzleId,
          puzzleName: puzzle.puzzleName,
          solved: false,
          attempts: 0,
          solvedAt: null
        };
        return progressData;
      });
      
      const solvedCount = puzzleDetails.filter(p => p.solved).length;
      
      return {
        category,
        totalPuzzles: categoryPuzzles.length,
        solvedPuzzles: solvedCount,
        puzzleDetails
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Get puzzle progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ PUZZLE ROUTES ============

// Get all puzzles
app.get('/api/puzzles', async (req, res) => {
  try {
    const puzzles = await Puzzle.find().sort({ order: 1, createdAt: 1 });
    res.json(puzzles);
  } catch (error) {
    console.error('Get puzzles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get puzzles by category
app.get('/api/puzzles/category/:category', async (req, res) => {
  try {
    const puzzles = await Puzzle.find({ category: req.params.category, isEnabled: true }).sort({ order: 1, createdAt: 1 });
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    // Find the maximum order value in this category
    const maxOrderPuzzle = await Puzzle.findOne({ category: req.body.category })
      .sort({ order: -1 })
      .select('order');
    
    const newOrder = maxOrderPuzzle ? (maxOrderPuzzle.order + 1) : 1;
    
    // Create puzzle with the new order value
    const puzzle = await Puzzle.create({
      ...req.body,
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const puzzle = await Puzzle.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    await Puzzle.findByIdAndDelete(req.params.id);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const { puzzleOrders } = req.body; // Array of { id, order }
    
    // Update each puzzle's order
    const updatePromises = puzzleOrders.map(({ id, order }) =>
      Puzzle.findByIdAndUpdate(id, { order, updatedAt: new Date() })
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
    const openings = await Opening.find().sort({ createdAt: -1 });
    res.json(openings);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const opening = await Opening.create(req.body);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const opening = await Opening.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    await Opening.findByIdAndDelete(req.params.id);
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
    const famousMates = await FamousMate.find().sort({ createdAt: -1 });
    res.json(famousMates);
  } catch (error) {
    console.error('Get famous mates error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single famous mate by ID
app.get('/api/famous-mates/:id', async (req, res) => {
  try {
    const famousMate = await FamousMate.findById(req.params.id);
    if (!famousMate) return res.status(404).json({ message: 'Famous mate not found' });
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const famousMate = await FamousMate.create(req.body);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const famousMate = await FamousMate.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    await FamousMate.findByIdAndDelete(req.params.id);
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
    const games = await BestGame.find().sort({ createdAt: -1 });
    res.json(games);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const game = await BestGame.create(req.body);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const game = await BestGame.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    await BestGame.findByIdAndDelete(req.params.id);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const totalStudents = await User.countDocuments({ role: 'student' });
    const activeStudents = await User.countDocuments({ role: 'student', isEnabled: true });
    const totalPuzzles = await Puzzle.countDocuments();
    const totalOpenings = await Opening.countDocuments();
    const totalFamousMates = await FamousMate.countDocuments();
    const totalBestGames = await BestGame.countDocuments();

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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    
    let access = await ContentAccess.findOne({ userId: req.params.userId });
    
    // Create default access if not exists
    if (!access) {
      access = await ContentAccess.create({
        userId: req.params.userId,
        puzzleAccess: {
          'mate-in-1': { enabled: false, limit: 0 },
          'mate-in-2': { enabled: false, limit: 0 },
          'mate-in-3': { enabled: false, limit: 0 },
          'pins': { enabled: false, limit: 0 },
          'forks': { enabled: false, limit: 0 },
          'traps': { enabled: false, limit: 0 }
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
          'mate-in-1': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null },
          'mate-in-2': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null },
          'mate-in-3': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null },
          'pins': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null },
          'forks': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null },
          'traps': { enabled: false, limit: 0, rangeStart: null, rangeEnd: null }
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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

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

// Bulk update content access for all students (admin only)
app.put('/api/content-access-bulk', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const { puzzleAccess, openingAccess, famousMatesAccess, bestGamesAccess, userIds } = req.body;
    
    // Get all students or specific users
    const targetUserIds = userIds || (await User.find({ role: 'student' }).select('_id')).map(u => u._id);
    
    for (const userId of targetUserIds) {
      let access = await ContentAccess.findOne({ userId });
      
      if (!access) {
        await ContentAccess.create({
          userId,
          puzzleAccess: puzzleAccess || {},
          openingAccess: openingAccess || { enabled: false, allowedOpenings: [] },
          famousMatesAccess: famousMatesAccess || { enabled: false, allowedMates: [] },
          bestGamesAccess: bestGamesAccess || { enabled: false, allowedGames: [] }
        });
      } else {
        if (puzzleAccess) {
          access.puzzleAccess = puzzleAccess;
          access.markModified('puzzleAccess');
        }
        if (openingAccess) access.openingAccess = openingAccess;
        if (famousMatesAccess) access.famousMatesAccess = famousMatesAccess;
        if (bestGamesAccess) access.bestGamesAccess = bestGamesAccess;
        access.updatedAt = new Date();
        await access.save();
      }
    }
    
    res.json({ success: true, message: `Updated access for ${targetUserIds.length} users` });
  } catch (error) {
    console.error('Bulk update content access error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== PUZZLE CATEGORIES API =====
// Get all custom puzzle categories (public)
app.get('/api/puzzle-categories', async (req, res) => {
  try {
    const categories = await PuzzleCategory.find().sort({ createdAt: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Get puzzle categories error:', error);
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const { categoryId, name, description, icon } = req.body;
    if (!categoryId || !name) return res.status(400).json({ message: 'categoryId and name are required' });

    const existing = await PuzzleCategory.findOne({ categoryId });
    if (existing) return res.status(409).json({ message: 'Category already exists' });

    const category = await PuzzleCategory.create({ categoryId, name, description, icon });
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
    if (requestingUser.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    // Cascade-delete all puzzles in this category, then delete the category
    await Puzzle.deleteMany({ category: req.params.categoryId });
    await PuzzleCategory.deleteOne({ categoryId: req.params.categoryId });
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
    if (!user) {
      return next(new Error('Authentication error: User not found'));
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
    socket.broadcast.emit('user:online', { userId, username: socket.user.username });
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
      const targetAdmin = await User.findById(data.targetAdminId).select('_id username');
      if (targetAdmin && targetAdmin.role === 'admin') {
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
      const allAdmins = await User.find({ role: 'admin' }).select('_id username');
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
      // Notify all admins
      socket.broadcast.emit('game:request-cancelled', { requestId: data.requestId });
      console.log(`❌ Game request cancelled: ${data.requestId}`);
    }
  });

  // Admin accepts game request
  socket.on('game:request-accept', async (data) => {
    if (socket.user.role !== 'admin') {
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
    if (socket.user.role !== 'admin') return;
    
    const request = gameRequests.get(data.requestId);
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
  
  // Make a move
  socket.on('game:make-move', (data) => {
    console.log(`\n♟️ ========== MOVE: ${data.from}→${data.to} from ${socket.user.username} ==========`);
    
    const game = activeGames.get(data.gameId);
    if (!game || game.status !== 'active') {
      console.log(`❌ Game not found or not active: ${data.gameId}`);
      socket.emit('error', { message: 'Game not found or not active' });
      return;
    }
    
    // Check if it's this player's turn
    const isWhite = game.white.id === userId;
    const isBlack = game.black.id === userId;
    const isPlayerTurn = (game.turn === 'w' && isWhite) || (game.turn === 'b' && isBlack);
    
    console.log(`   Game: ${game.id} | White: ${game.white.username} | Black: ${game.black.username}`);
    console.log(`   Player: ${socket.user.username} (${isWhite ? 'WHITE' : 'BLACK'}) | Turn: ${game.turn === 'w' ? 'WHITE' : 'BLACK'}`);
    
    if (!isPlayerTurn) {
      console.log(`❌ Not player's turn!`);
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    const previousTurn = game.turn;
    
    // Validate and make the move
    const move = `${data.from}${data.to}${data.promotion || ''}`;
    game.moves.push(move);
    game.fen = data.fen || game.fen;
    game.turn = game.turn === 'w' ? 'b' : 'w';
    game.lastMoveAt = new Date().toISOString();
    
    console.log(`   ✅ Move accepted: ${move} | Turn: ${previousTurn} → ${game.turn}`);
    
    // Determine opponent
    const opponentId = isWhite ? game.black.id : game.white.id;
    const opponentSockets = userSockets.get(opponentId);
    
    console.log(`   📡 Opponent ID: ${opponentId}`);
    console.log(`   📡 Opponent sockets: ${JSON.stringify(opponentSockets)}`);
    
    const moveData = {
      gameId: game.id,
      move,
      fen: game.fen,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      turn: game.turn
    };
    
    // Send to current player
    socket.emit('game:move', moveData);
    console.log(`   ✅ Sent to ${socket.user.username}`);
    
    // Send to all opponent sockets
    if (opponentSockets && opponentSockets.length > 0) {
      opponentSockets.forEach(socketId => {
        io.to(socketId).emit('game:move', moveData);
        console.log(`   ✅ Sent to opponent socket: ${socketId}`);
      });
      console.log(`========== MOVE COMPLETE ==========\n`);
    } else {
      console.log(`   ❌ ERROR: No opponent sockets found!`);
      console.log(`   📡 All connected users:`, Array.from(userSockets.entries()));
      console.log(`========== MOVE FAILED ==========\n`);
    }
  });

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

  // Game ended by checkmate/stalemate (client notifies)
  socket.on('game:checkmate', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.status !== 'active') return;
    
    // The winner is whoever's turn it is NOT (they just got checkmated)
    const result = game.turn === 'w' ? 'black' : 'white';
    endGame(data.gameId, result, 'checkmate');
  });

  socket.on('game:stalemate', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.status !== 'active') return;
    
    endGame(data.gameId, 'draw', 'stalemate');
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
      socket.broadcast.emit('user:offline', { userId, username: socket.user.username });
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
    
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const requests = Array.from(gameRequests.values());
    res.json(requests);
  } catch (error) {
    console.error('Get game requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Initialize some default users (if missing) to help local/dev runs
async function initializeDefaultUsers() {
  try {
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      await User.create({ username: 'admin', password: 'admin', role: 'admin', isEnabled: true });
      console.log('✅ Created default admin user: admin');
    }

    const student = await User.findOne({ role: 'student' });
    if (!student) {
      await User.create({ username: 'student', password: 'student', role: 'student', isEnabled: true });
      console.log('✅ Created default student user: student');
    }
  } catch (err) {
    console.error('Error initializing default users:', err);
  }
}

// One-time migration to fix puzzle order values
async function migratePuzzleOrders() {
  try {
    // Get all puzzles grouped by category
    const allPuzzles = await Puzzle.find().sort({ createdAt: 1 });
    
    // Group puzzles by category
    const puzzlesByCategory = {};
    allPuzzles.forEach(puzzle => {
      if (!puzzlesByCategory[puzzle.category]) {
        puzzlesByCategory[puzzle.category] = [];
      }
      puzzlesByCategory[puzzle.category].push(puzzle);
    });
    
    let totalUpdated = 0;
    
    // For each category, reassign sequential order values
    for (const category in puzzlesByCategory) {
      const categoryPuzzles = puzzlesByCategory[category];
      
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
      console.log(`✅ Migration completed: Updated order for ${totalUpdated} puzzles across ${Object.keys(puzzlesByCategory).length} categories`);
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
  await initializeDefaultUsers();
  await migratePuzzleOrders();
});
