import LoaLetter from '../models/LoaLetter.js';
import { parseLoaHtml } from '../utils/loaParser.js';
import { saveLoaHtmlFile } from './loaHtmlFileService.js';
import { syncLoaToPostgres } from './postgresLoaSync.js';

const createUploadError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const processLoaHtmlFile = async (file) => {
  const html = file.buffer.toString('utf8');
  const parsed = parseLoaHtml(html, { sourceFileName: file.originalname });

  if (!parsed.loa_no) {
    throw createUploadError('Unable to extract LOA number from the uploaded HTML file.', 422);
  }

  const htmlFileName = await saveLoaHtmlFile({
    buffer: file.buffer,
    loaNo: parsed.loa_no,
    tenderNo: parsed.tender_no
  });

  const payload = {
    loa_no: parsed.loa_no,
    letter_no_full: parsed.letter_no_full,
    tender_no: parsed.tender_no,
    bid_id: parsed.bid_id,
    contractor_name: parsed.contractor_name,
    letter_date: parsed.letter_date,
    contract_value: parsed.contract_value,
    json_data: parsed.json_data,
    original_file_name: file.originalname,
    html_file_name: htmlFileName,
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

  return {
    action,
    mongoId: String(record._id),
    postgresSync,
    record
  };
};

export const processSingleLoaHtmlFile = async (file, loaRestricted, location, unit) => {
  const restriction = typeof loaRestricted === 'string' ? loaRestricted.trim().toUpperCase() : '';
  if (!['Y', 'N', 'YES', 'NO'].includes(restriction)) {
    throw createUploadError('whether_loa_restricted must be Y or N.', 400);
  }
  if (typeof location !== 'string' || !location.trim()) {
    throw createUploadError('section_location is required.', 400);
  }
  if (typeof unit !== 'string' || !unit.trim()) {
    throw createUploadError('divcode is required.', 400);
  }

  const html = file.buffer.toString('utf8');
  const parsed = parseLoaHtml(html, { sourceFileName: file.originalname });

  if (!parsed.loa_no) {
    throw createUploadError('Unable to extract LOA number from the uploaded HTML file.', 422);
  }

  const htmlFileName = await saveLoaHtmlFile({
    buffer: file.buffer,
    loaNo: parsed.loa_no,
    tenderNo: parsed.tender_no
  });

  const loaRestrictedValue = ['Y', 'YES'].includes(restriction) ? 'Y' : 'N';

  const payload = {
    loa_no: parsed.loa_no,
    letter_no_full: parsed.letter_no_full,
    tender_no: parsed.tender_no,
    bid_id: parsed.bid_id,
    contractor_name: parsed.contractor_name,
    letter_date: parsed.letter_date,
    contract_value: parsed.contract_value,
    whether_loa_restricted: loaRestrictedValue,
    section_location: location.trim(),
    divcode: unit.trim(),
    json_data: parsed.json_data,
    original_file_name: file.originalname,
    html_file_name: htmlFileName,
    uploaded_at: new Date()
  };

  let record = await LoaLetter.findOne({ loa_no: parsed.loa_no });
  const action = record ? 'updated' : 'created';

  if (record) {
    record.set(payload);
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

  return {
    action,
    mongoId: String(record._id),
    postgresSync,
    record
  };
};
