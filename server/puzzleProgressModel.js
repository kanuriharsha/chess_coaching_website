import mongoose from 'mongoose';

const puzzleProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  puzzleId: { type: String, required: true },
  a: { type: Number, required: true, min: 1 },
  completed: { type: Boolean, required: true, default: false }
}, { collection: 'puzzleprogress' });

puzzleProgressSchema.index({ userId: 1, puzzleId: 1 }, { unique: true });

const PuzzleProgress = mongoose.models.PuzzleProgress ||
  mongoose.model('PuzzleProgress', puzzleProgressSchema);

export default PuzzleProgress;
