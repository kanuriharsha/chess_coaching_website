import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('Missing required environment variable: MONGODB_URI');
}

try {
  await mongoose.connect(mongoUri);
  const users = mongoose.connection.collection('login');
  const superAdmins = await users.find({ role: 'superadmin' }).project({ _id: 1 }).toArray();

  if (superAdmins.length !== 1) {
    throw new Error(`Expected exactly one Super Admin; found ${superAdmins.length}. No students were changed.`);
  }

  const superAdminId = superAdmins[0]._id;
  const studentResult = await users.updateMany(
    { role: 'student' },
    { $set: { adminId: superAdminId, updatedAt: new Date() } }
  );
  const mappedCount = await users.countDocuments({ role: 'student', adminId: superAdminId });

  console.log(`Matched ${studentResult.matchedCount} existing students.`);
  console.log(`Updated ${studentResult.modifiedCount} student ownership records.`);
  console.log(`Verified ${mappedCount} students are mapped to the Super Admin.`);

  const contentCollections = [
    { name: 'groups', legacyUniqueField: 'name', compoundIndex: { adminId: 1, name: 1 } },
    { name: 'puzzles' },
    { name: 'openings' },
    { name: 'famousmates' },
    { name: 'bestgames' },
    { name: 'puzzlecategories', legacyUniqueField: 'categoryId', compoundIndex: { adminId: 1, categoryId: 1 } },
    { name: 'puzzlecategoryorder', legacyUniqueField: 'categoryId', compoundIndex: { adminId: 1, categoryId: 1 } }
  ];

  for (const config of contentCollections) {
    const collection = mongoose.connection.collection(config.name);
    const collectionsExist = await mongoose.connection.db.listCollections({ name: config.name }).hasNext();
    if (!collectionsExist) continue;

    const result = await collection.updateMany(
      {},
      { $set: { adminId: superAdminId } }
    );
    console.log(`${config.name}: assigned ${result.modifiedCount} existing records to the Super Admin.`);

    if (!config.legacyUniqueField) continue;
    const indexes = await collection.indexes();
    for (const index of indexes) {
      const keys = Object.keys(index.key || {});
      if (index.unique && keys.length === 1 && keys[0] === config.legacyUniqueField) {
        await collection.dropIndex(index.name);
      }
    }
    await collection.createIndex(config.compoundIndex, { unique: true });
  }

  console.log('Existing content ownership migration completed.');
} catch (error) {
  console.error('Student ownership migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
