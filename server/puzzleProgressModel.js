import mongoose from 'mongoose';

const dailyMetricSchema = new mongoose.Schema({
  date: { type: String, required: true },
  attempts: { type: Number, min: 0, required: true },
  correct: { type: Number, min: 0, required: true },
  timeSpentSeconds: { type: Number, min: 0, required: true }
}, { _id: false });

const puzzleProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  puzzleId: { type: String, required: true },
  a: { type: Number, required: true, min: 1 },
  completed: { type: Boolean, required: true, default: false },
  attemptCount: { type: Number, min: 0, default: 0 },
  correctCount: { type: Number, min: 0, default: 0 },
  timeSpentSeconds: { type: Number, min: 0, default: 0 },
  lastAttemptAt: { type: Date },
  lastResult: { type: String, enum: ['passed', 'failed'] },
  dailyMetrics: [dailyMetricSchema]
}, { collection: 'puzzleprogress' });

puzzleProgressSchema.index({ userId: 1, puzzleId: 1 }, { unique: true });

const PuzzleProgress = mongoose.models.PuzzleProgress ||
  mongoose.model('PuzzleProgress', puzzleProgressSchema);

export default PuzzleProgress;
