import mongoose from 'mongoose';
import LoaLetter from '../models/LoaLetter.js';
import { processLoaHtmlFile } from '../services/loaUploadService.js';
import { getPostgresLoaDetails, listPostgresLoas } from '../services/postgresLoaRead.js';
import { syncLoaToPostgres } from '../services/postgresLoaSync.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parsePagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const requestedLimit = Number.parseInt(query.limit, 10) || 10;
  const limit = Math.min(Math.max(requestedLimit, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildSearchFilter = (search) => {
  if (!search) {
    return {};
  }

  const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  return {
    $or: [{ loa_no: regex }, { tender_no: regex }, { contractor_name: regex }]
  };
};

const buildLoaListFilter = (search, syncStatus) => {
  const filter = buildSearchFilter(search);

  if (syncStatus === 'synced') {
    filter.postgres_synced = true;
  }

  if (syncStatus === 'unsynced') {
    filter.postgres_synced = { $ne: true };
  }

  return filter;
};

export const uploadLoa = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createError('HTML file is required.', 400);
  }

  const { action, mongoId, postgresSync, record } = await processLoaHtmlFile(req.file);

  res.status(action === 'created' ? 201 : 200).json({
    success: true,
    action,
    mongoId,
    postgresSync,
    data: record
  });
});

const processWithConcurrency = async (files, concurrency, handler) => {
  const results = new Array(files.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < files.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await handler(files[currentIndex]);
    }
  };

  const workerCount = Math.min(concurrency, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};

export const uploadLoaBulk = asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    throw createError('At least one HTML file is required.', 400);
  }

  const results = await processWithConcurrency(files, 5, async (file) => {
    try {
      const uploadResult = await processLoaHtmlFile(file);

      if (uploadResult.postgresSync.error) {
        console.error(
          `[loa-bulk] PostgreSQL sync failed file=${file.originalname} loa_no=${uploadResult.record.loa_no}`,
          uploadResult.postgresSync.error
        );
        return {
          fileName: file.originalname,
          status: 'failed',
          loa_no: uploadResult.record.loa_no,
          error: 'Unable to sync this LOA to PostgreSQL.'
        };
      }

      return {
        fileName: file.originalname,
        status: 'success',
        loa_no: uploadResult.record.loa_no
      };
    } catch (error) {
      console.error(`[loa-bulk] Upload failed file=${file.originalname}`, error);
      return {
        fileName: file.originalname,
        status: 'failed',
        error: error.statusCode ? error.message : 'Unable to process this file.'
      };
    }
  });

  const successCount = results.filter((result) => result.status === 'success').length;

  res.json({
    totalFiles: files.length,
    successCount,
    failedCount: files.length - successCount,
    results
  });
});

export const getLoaLetters = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = buildLoaListFilter(req.query.search, req.query.syncStatus);

  const [records, total] = await Promise.all([
    LoaLetter.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    LoaLetter.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: records,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

export const getLoaById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw createError('Invalid MongoDB id.', 400);
  }

  const record = await LoaLetter.findById(req.params.id).lean();
  if (!record) {
    throw createError('LOA record not found.', 404);
  }

  res.json({
    success: true,
    data: record
  });
});

export const getLoaByNumber = asyncHandler(async (req, res) => {
  const loaNo = String(
    req.params.loa_no || req.body?.loa_no || req.body?.loaNo || req.query?.loa_no || req.query?.loaNo || ''
  ).trim();

  if (!loaNo) {
    throw createError('loa_no is required.', 400);
  }

  const record = await LoaLetter.findOne({ loa_no: loaNo }).lean();
  if (!record) {
    throw createError('LOA record not found.', 404);
  }

  res.json({
    success: true,
    data: record
  });
});

export const getLoaByNumberPost = getLoaByNumber;

export const getViewLoaList = asyncHandler(async (req, res) => {
  try {
    const records = await listPostgresLoas();
    res.json(records);
  } catch (error) {
    console.error('[loa-view] Failed to load PostgreSQL LOA list', error);
    throw createError('Unable to load LOA list.', 500);
  }
});

export const getViewLoa = asyncHandler(async (req, res) => {
  const loaNo = String(req.params.loaNo || '').trim();

  if (!loaNo) {
    throw createError('LOA number is required.', 400);
  }

  if (loaNo.length > 100 || !/^[a-zA-Z0-9]+$/.test(loaNo)) {
    throw createError('Invalid LOA number. Use 1 to 100 alphanumeric characters.', 400);
  }

  let details;
  try {
    details = await getPostgresLoaDetails(loaNo);
  } catch (error) {
    console.error(`[loa-view] Failed to load PostgreSQL LOA loa_no=${loaNo}`, error);
    throw createError('Unable to load LOA details.', 500);
  }

  if (!details.contract) {
    throw createError(`LOA ${loaNo} was not found.`, 404);
  }

  res.json(details);
});

export const syncLoaByMongoId = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.mongoId)) {
    throw createError('Invalid MongoDB id.', 400);
  }

  const record = await LoaLetter.findById(req.params.mongoId);
  if (!record) {
    throw createError('LOA record not found.', 404);
  }

  try {
    const postgresSync = await syncLoaToPostgres(record);

    if (postgresSync.synced) {
      record.postgres_synced = true;
      record.postgres_synced_at = new Date();
      await record.save();
    }

    res.json({
      success: true,
      synced: Boolean(postgresSync.synced),
      alreadyExists: Boolean(postgresSync.alreadyExists),
      message: postgresSync.alreadyExists ? 'Already synced to PostgreSQL' : 'Synced successfully',
      tablesWritten: postgresSync.tablesWritten || [],
      postgresSync
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      synced: false,
      error: error.message
    });
  }
});

export const updateLoa = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw createError('Invalid MongoDB id.', 400);
  }

  if (req.body.loa_no !== undefined && !String(req.body.loa_no).trim()) {
    throw createError('loa_no cannot be empty.', 400);
  }

  const allowedFields = [
    'loa_no',
    'letter_no_full',
    'tender_no',
    'bid_id',
    'contractor_name',
    'letter_date',
    'contract_value',
    'json_data',
    'original_file_name'
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field];
    }
  }

  const record = await LoaLetter.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true
  });

  if (!record) {
    throw createError('LOA record not found.', 404);
  }

  res.json({
    success: true,
    data: record
  });
});

export const deleteLoa = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw createError('Invalid MongoDB id.', 400);
  }

  const record = await LoaLetter.findByIdAndDelete(req.params.id);
  if (!record) {
    throw createError('LOA record not found.', 404);
  }

  res.json({
    success: true,
    message: 'LOA record deleted.'
  });
});
