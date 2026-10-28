import 'dotenv/config';
import mongoose from 'mongoose';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('Missing required environment variable: MONGODB_URI');

const applyChanges = process.argv.includes('--apply');
const collections = [
  { name: 'puzzleprogress', fields: ['userId'] },
  { name: 'contentaccess', fields: ['userId'] },
  { name: 'useractivities', fields: ['userId', 'adminId'] },
  { name: 'groups', fields: ['adminId'] },
  { name: 'puzzles', fields: ['adminId'] },
  { name: 'openings', fields: ['adminId'] },
  { name: 'famousmates', fields: ['adminId'] },
  { name: 'bestgames', fields: ['adminId'] },
  { name: 'columns', fields: ['adminId'] },
  { name: 'columncontents', fields: ['adminId'] },
  { name: 'puzzlecategories', fields: ['adminId'] },
  { name: 'puzzlecategoryorder', fields: ['adminId'] },
  { name: 'adminpuzzleaccess', fields: ['adminId', 'grantedBy'] }
];

async function cleanupOrphanedRecords(database) {
  const summary = [];

  for (const { name, fields } of collections) {
    const collection = database.collection(name);
    const seenIds = new Set();
    let orphanCount = 0;

    for (const field of fields) {
      const cursor = collection.aggregate([
        { $match: { [field]: { $type: 'objectId' } } },
        {
          $lookup: {
            from: 'login',
            localField: field,
            foreignField: '_id',
            as: 'referencedUser'
          }
        },
        { $match: { referencedUser: { $size: 0 } } },
        { $project: { _id: 1 } }
      ], { allowDiskUse: true });

      let batch = [];
      for await (const document of cursor) {
        const id = String(document._id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        batch.push(document._id);
        if (batch.length === 500) {
          orphanCount += await processBatch(collection, batch);
          batch = [];
        }
      }
      if (batch.length > 0) orphanCount += await processBatch(collection, batch);
    }

    summary.push({ collection: name, orphanedRecords: orphanCount });
  }

  return summary;
}

async function processBatch(collection, ids) {
  if (!applyChanges) return ids.length;
  const result = await collection.deleteMany({ _id: { $in: ids } });
  return result.deletedCount;
}

async function main() {
  await mongoose.connect(mongoUri);
  const summary = await cleanupOrphanedRecords(mongoose.connection.db);
  console.log(`${applyChanges ? 'APPLY' : 'DRY RUN'} orphaned user-data cleanup`);
  for (const item of summary) {
    console.log(`${item.collection}: ${item.orphanedRecords} orphaned record(s)${applyChanges ? ' removed' : ' found'}`);
  }
  console.log(applyChanges
    ? 'Orphaned user-data cleanup completed.'
    : 'No database changes made. Re-run with --apply to remove these records.');
}

main()
  .catch(error => {
    console.error('Orphaned user-data cleanup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
