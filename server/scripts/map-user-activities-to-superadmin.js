import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('Missing required environment variable: MONGODB_URI');
}

const superAdminId = new mongoose.Types.ObjectId('6950bc7b6beae457a17971b0');

try {
  await mongoose.connect(mongoUri, {
    connectTimeoutMS: 120000,
    serverSelectionTimeoutMS: 120000
  });
  const database = mongoose.connection.db;
  const superAdmin = await database.collection('login').findOne({
    _id: superAdminId,
    role: 'superadmin'
  }, { projection: { _id: 1 } });

  if (!superAdmin) {
    throw new Error('The specified account is not an existing Super Admin; no activities were changed.');
  }

  const activities = database.collection('useractivities');
  const existingCount = await activities.countDocuments();
  const result = await activities.updateMany(
    {},
    { $set: { adminId: superAdminId } }
  );
  const mappedCount = await activities.countDocuments({ adminId: superAdminId });

  console.log(`Matched ${result.matchedCount} existing UserActivity records.`);
  console.log(`Set adminId on ${result.modifiedCount} UserActivity records.`);
  console.log(`Verified ${mappedCount} of ${existingCount} records belong to the specified Super Admin.`);

  if (mappedCount !== existingCount) {
    throw new Error('UserActivity ownership verification failed.');
  }
} catch (error) {
  console.error('UserActivity ownership migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
