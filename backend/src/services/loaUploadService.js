import LoaLetter from '../models/LoaLetter.js';
import { parseLoaHtml } from '../utils/loaParser.js';
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
