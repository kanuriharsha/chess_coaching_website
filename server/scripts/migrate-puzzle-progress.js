import 'dotenv/config';
import mongoose from 'mongoose';
import { reconstructPuzzleProgress } from '../puzzleProgress.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('Missing required environment variable: MONGODB_URI');

const applyChanges = process.argv.includes('--apply');
const sourceCollectionName = 'useractivities';
const targetCollectionName = 'puzzleprogress';

async function findDuplicateKeys(collection) {
  return collection.aggregate([
    {
      $group: {
        _id: { userId: '$userId', puzzleId: '$puzzleId' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 }
  ]).toArray();
}

function compareLegacyAndReconstructedProgress(activities, progress) {
  const legacyByKey = new Map();
  for (const activity of activities) {
    const puzzleId = activity.details?.puzzleId;
    if (!activity.userId || typeof puzzleId !== 'string' || !puzzleId) continue;

    const key = `${String(activity.userId)}:${puzzleId}`;
    const legacy = legacyByKey.get(key) || {
      userId: activity.userId,
      puzzleId,
      attempts: 0,
      completed: false
    };
    legacy.attempts += 1;
    legacy.completed = legacy.completed || activity.type === 'puzzle_solved';
    legacyByKey.set(key, legacy);
  }

  const reconstructedByKey = new Map(progress.map(record => [
    `${String(record.userId)}:${record.puzzleId}`,
    record
  ]));
  const differences = [];
  for (const [key, legacy] of legacyByKey) {
    const reconstructed = reconstructedByKey.get(key);
    if (
      !reconstructed ||
      legacy.attempts !== reconstructed.a ||
      legacy.completed !== reconstructed.completed
    ) {
      differences.push({ legacy, reconstructed: reconstructed || null });
    }
  }
  return differences;
}

async function main() {
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  const source = database.collection(sourceCollectionName);
  const target = database.collection(targetCollectionName);
  const sourceActivities = await source.find({
    type: { $in: ['puzzle_solved', 'puzzle_failed'] }
  }, {
    projection: {
      _id: 1,
      userId: 1,
      type: 1,
      timestamp: 1,
      'details.puzzleId': 1,
      'details.attempts': 1,
      'details.result': 1
    }
  }).toArray();
  const expectedProgress = reconstructPuzzleProgress(sourceActivities);
  const comparisonDifferences = compareLegacyAndReconstructedProgress(
    sourceActivities,
    expectedProgress
  );
  const duplicateKeys = await findDuplicateKeys(target);

  if (duplicateKeys.length > 0) {
    throw new Error(
      `Target already contains duplicate userId/puzzleId keys: ${JSON.stringify(duplicateKeys)}`
    );
  }

  console.log(`${applyChanges ? 'APPLY' : 'DRY RUN'} puzzle-progress migration`);
  console.log(`Source puzzle activity records: ${sourceActivities.length}`);
  console.log(`Reconstructed progress records: ${expectedProgress.length}`);
  console.log(`Differences from current activity-count logic: ${comparisonDifferences.length}`);
  console.log('Progress comparison preview:', JSON.stringify(comparisonDifferences.slice(0, 20), null, 2));
  console.log(`Target records before migration: ${await target.countDocuments()}`);
  console.log('Preview:', JSON.stringify(expectedProgress.slice(0, 20), null, 2));

  if (!applyChanges) {
    console.log('No database changes made. Re-run with --apply to migrate.');
    return;
  }

  await target.createIndex({ userId: 1, puzzleId: 1 }, { unique: true });
  if (expectedProgress.length > 0) {
    await target.bulkWrite(expectedProgress.map(progress => ({
      updateOne: {
        filter: { userId: progress.userId, puzzleId: progress.puzzleId },
        update: [{
          $set: {
            userId: progress.userId,
            puzzleId: progress.puzzleId,
            a: {
              $cond: [
                { $eq: ['$completed', true] },
                '$a',
                { $max: [{ $ifNull: ['$a', 0] }, progress.a] }
              ]
            },
            completed: {
              $cond: ['$completed', true, progress.completed]
            }
          }
        }],
        upsert: true
      }
    })), { ordered: true });
  }

  const migratedProgress = await target.find({}).toArray();
  const migratedByKey = new Map(migratedProgress.map(progress => [
    `${String(progress.userId)}:${String(progress.puzzleId)}`,
    progress
  ]));
  const mismatches = expectedProgress.filter(expected => {
    const actual = migratedByKey.get(`${String(expected.userId)}:${expected.puzzleId}`);
    return !actual || actual.a !== expected.a || actual.completed !== expected.completed;
  });
  const extraRecords = migratedProgress.filter(progress =>
    !expectedProgress.some(expected =>
      String(expected.userId) === String(progress.userId) &&
      expected.puzzleId === String(progress.puzzleId)
    )
  );
  const index = (await target.indexes()).find(candidate =>
    candidate.key?.userId === 1 && candidate.key?.puzzleId === 1
  );

  console.log(`Target records after migration: ${migratedProgress.length}`);
  console.log(`Verification mismatches: ${mismatches.length}`);
  console.log(`Target records without source activity: ${extraRecords.length}`);
  console.log(`Unique compound index present: ${Boolean(index?.unique)}`);
  if (mismatches.length > 0 || extraRecords.length > 0 || !index?.unique) {
    throw new Error('Puzzle-progress migration verification failed');
  }
  console.log('Puzzle-progress migration verified.');
}

main()
  .catch(error => {
    console.error('Puzzle-progress migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
