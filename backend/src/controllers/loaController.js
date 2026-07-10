import mongoose from 'mongoose';
import LoaLetter from '../models/LoaLetter.js';
import { syncLoaToPostgres } from '../services/postgresLoaSync.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseLoaHtml } from '../utils/loaParser.js';

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

export const uploadLoa = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createError('HTML file is required.', 400);
  }

  const html = req.file.buffer.toString('utf8');
  const parsed = parseLoaHtml(html, { sourceFileName: req.file.originalname });

  if (!parsed.loa_no) {
    throw createError('Unable to extract LOA number from the uploaded HTML file.', 422);
  }

  const payload = {
    loa_no: parsed.loa_no,
    letter_no_full: parsed.letter_no_full,
    tender_no: parsed.tender_no,
    bid_id: parsed.bid_id,
    contractor_name: parsed.contractor_name,
    letter_date: parsed.letter_date,
    contract_value: parsed.contract_value,
    json_data: parsed.json_data,
    original_file_name: req.file.originalname,
    uploaded_at: new Date()
  };

  let record = await LoaLetter.findOne({ loa_no: parsed.loa_no });
  const action = record ? 'updated' : 'created';

  if (record) {
    Object.assign(record, payload);
    await record.save();
  } else {
    record = await LoaLetter.create(payload);
  }

  let postgresSync = {
    synced: false,
    skipped: false,
    loa_no: parsed.loa_no
  };

  try {
    postgresSync = await syncLoaToPostgres(record);

    if (postgresSync.synced) {
      record.postgres_synced = true;
      record.postgres_synced_at = new Date();
      await record.save();
    }
  } catch (error) {
    postgresSync = {
      synced: false,
      skipped: false,
      loa_no: parsed.loa_no,
      mongoId: String(record._id),
      error: error.message
    };
  }

  res.status(action === 'created' ? 201 : 200).json({
    success: true,
    action,
    mongoId: String(record._id),
    postgresSync,
    data: record
  });
});

export const getLoaLetters = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = buildSearchFilter(req.query.search);

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
