import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Set MONGODB_URI before running the column migration.');

const legacyTypes = [
  { source: 'openings', type: 'opening', title: 'Openings', icon: 'BookOpen', accessKey: 'openingAccess', idsKey: 'allowedOpenings' },
  { source: 'bestgames', type: 'bestGame', title: 'Best Games', icon: 'Trophy', accessKey: 'bestGamesAccess', idsKey: 'allowedGames' },
  { source: 'famousmates', type: 'famousMate', title: 'Famous Mates', icon: 'Crown', accessKey: 'famousMatesAccess', idsKey: 'allowedMates' }
];
const sourceDocuments = new Map();
const columnsByOwnerType = new Map();
const contentById = new Map();

function stableColumnId(adminId, type) {
  return crypto.createHash('sha256').update(`${adminId}:legacy:${type}`).digest('hex').slice(0, 24);
}

function keyFor(adminId, type) {
  return `${String(adminId)}:${type}`;
}

async function insertColumnContent(db, oldDocument, column, legacyType) {
  if (!oldDocument.adminId) {
    throw new Error(`Cannot migrate ${legacyType.source} document ${oldDocument._id}: missing adminId`);
  }
  const document = {
    ...oldDocument,
    columnId: column._id,
    adminId: oldDocument.adminId,
    contentType: legacyType.type
  };
  const collection = db.collection('columncontents');
  const existing = await collection.findOne({ _id: oldDocument._id });
  if (existing) {
    if (String(existing.columnId) !== String(column._id) ||
        String(existing.adminId) !== String(oldDocument.adminId) ||
        existing.contentType !== legacyType.type) {
      throw new Error(`Content id ${oldDocument._id} already belongs to a different column or admin`);
    }
  } else {
    await collection.insertOne(document);
  }
  contentById.set(`${legacyType.type}:${String(oldDocument._id)}`, {
    _id: oldDocument._id,
    adminId: oldDocument.adminId,
    columnId: column._id,
    isEnabled: oldDocument.isEnabled !== false
  });
}

async function migrateLegacyContent(db) {
  for (const legacyType of legacyTypes) {
    const documents = await db.collection(legacyType.source).find({}).toArray();
    sourceDocuments.set(legacyType.type, documents);
    const owners = new Map();
    for (const document of documents) {
      if (!document.adminId) {
        throw new Error(`Cannot migrate ${legacyType.source} document ${document._id}: missing adminId`);
      }
      owners.set(String(document.adminId), document.adminId);
    }

    for (const [ownerKey, ownerId] of owners) {
      const columnId = new mongoose.Types.ObjectId(stableColumnId(ownerKey, legacyType.type));
      const column = {
        _id: columnId,
        title: legacyType.title,
        icon: legacyType.icon,
        adminId: ownerId,
        contentType: legacyType.type,
        isEnabled: true,
        order: legacyTypes.findIndex(item => item.type === legacyType.type),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const existingColumn = await db.collection('columns').findOne({ _id: columnId });
      if (existingColumn && (
        String(existingColumn.adminId) !== ownerKey ||
        existingColumn.contentType !== legacyType.type
      )) {
        throw new Error(`Stable column id ${columnId} is already used by unrelated column data`);
      }
      await db.collection('columns').updateOne(
        { _id: columnId },
        { $setOnInsert: column },
        { upsert: true }
      );
      columnsByOwnerType.set(keyFor(ownerId, legacyType.type), column);
      for (const document of documents.filter(item => String(item.adminId) === ownerKey)) {
        await insertColumnContent(db, document, column, legacyType);
      }
    }
  }
}

function getLegacySettings(record, legacyType) {
  return record?.[legacyType.accessKey];
}

function mappedStudentAccess(record, adminGrantByAdminId) {
  const nextAccess = {};
  const studentAdminId = record.studentAdminId;
  const adminGrant = adminGrantByAdminId.get(String(studentAdminId));
  for (const legacyType of legacyTypes) {
    const legacySettings = getLegacySettings(record.access, legacyType);
    if (!legacySettings || typeof legacySettings.enabled !== 'boolean') continue;
    const studentAllowedIds = Array.isArray(legacySettings[legacyType.idsKey])
      ? new Set(legacySettings[legacyType.idsKey].map(String))
      : new Set();
    const relevantColumns = [columnsByOwnerType.get(keyFor(studentAdminId, legacyType.type))].filter(Boolean);
    const grantedSettings = getLegacySettings(adminGrant, legacyType);
    if (adminGrant?.grantedBy && grantedSettings?.enabled === true) {
      const grantedIds = Array.isArray(grantedSettings[legacyType.idsKey])
        ? new Set(grantedSettings[legacyType.idsKey].map(String))
        : new Set();
      for (const document of sourceDocuments.get(legacyType.type) || []) {
        if (String(document.adminId) === String(adminGrant.grantedBy) &&
            (grantedIds.size > 0 && grantedIds.has(String(document._id)))) {
          const column = columnsByOwnerType.get(keyFor(document.adminId, legacyType.type));
          if (column && !relevantColumns.some(item => String(item._id) === String(column._id))) {
            relevantColumns.push(column);
          }
        }
      }
    }

    for (const column of relevantColumns) {
      const columnOwnerContents = (sourceDocuments.get(legacyType.type) || [])
        .filter(document => String(document.adminId) === String(column.adminId));
      let allowedContentIds = [];
      if (studentAllowedIds.size > 0) {
        allowedContentIds = columnOwnerContents
          .filter(document => studentAllowedIds.has(String(document._id)))
          .map(document => String(document._id));
        if (!allowedContentIds.length) continue;
      } else if (String(column.adminId) !== String(studentAdminId)) {
        const grantedIds = new Set(Array.isArray(grantedSettings?.[legacyType.idsKey])
          ? grantedSettings[legacyType.idsKey].map(String)
          : []);
        allowedContentIds = columnOwnerContents
          .filter(document => grantedIds.has(String(document._id)))
          .map(document => String(document._id));
        if (!allowedContentIds.length) continue;
      }
      nextAccess[String(column._id)] = {
        enabled: legacySettings.enabled,
        allowedContentIds
      };
    }
  }
  return nextAccess;
}

async function migratePermissionRecords(db) {
  const adminGrantRecords = await db.collection('adminpuzzleaccess').find({}).toArray();
  const adminGrantByAdminId = new Map(adminGrantRecords.map(record => [String(record.adminId), record]));

  for (const record of adminGrantRecords) {
    if (!record.grantedBy) continue;
    const columnAccess = { ...(record.columnAccess || {}) };
    for (const legacyType of legacyTypes) {
      const settings = getLegacySettings(record, legacyType);
      const ids = Array.isArray(settings?.[legacyType.idsKey])
        ? [...new Set(settings[legacyType.idsKey].map(String))]
        : [];
      if (settings?.enabled !== true || !ids.length) continue;
      const byColumn = new Map();
      for (const id of ids) {
        const content = contentById.get(`${legacyType.type}:${id}`);
        if (!content || String(content.adminId) !== String(record.grantedBy)) continue;
        const columnId = String(content.columnId);
        const list = byColumn.get(columnId) || [];
        list.push(id);
        byColumn.set(columnId, list);
      }
      for (const [columnId, allowedContentIds] of byColumn) {
        if (!(columnId in columnAccess)) {
          columnAccess[columnId] = { enabled: true, allowedContentIds };
        }
      }
    }
    if (Object.keys(columnAccess).length > 0) {
      await db.collection('adminpuzzleaccess').updateOne(
        { _id: record._id },
        { $set: { columnAccess, updatedAt: new Date() } }
      );
    }
  }

  const accessRecords = await db.collection('contentaccess').find({}).toArray();
  for (const access of accessRecords) {
    const student = await db.collection('login').findOne(
      { _id: access.userId, role: 'student' },
      { projection: { adminId: 1 } }
    );
    if (!student?.adminId) {
      console.warn(`Skipping column permission mapping for orphan content access record ${access._id}`);
      continue;
    }
    const mapped = mappedStudentAccess({ access, studentAdminId: student.adminId }, adminGrantByAdminId);
    const existing = access.columnAccess && typeof access.columnAccess === 'object' ? access.columnAccess : {};
    const merged = { ...mapped, ...existing };
    await db.collection('contentaccess').updateOne(
      { _id: access._id },
      { $set: { columnAccess: merged, updatedAt: new Date() } }
    );
  }
}

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  await migrateLegacyContent(db);
  await migratePermissionRecords(db);
  console.log(`Column migration complete: ${contentById.size} content records mapped.`);
}

run()
  .catch(error => {
    console.error('Column migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
