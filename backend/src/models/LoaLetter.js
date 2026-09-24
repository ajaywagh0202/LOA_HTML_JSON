import mongoose from 'mongoose';

const LoaLetterSchema = new mongoose.Schema(
  {
    loa_no: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    letter_no_full: {
      type: String,
      trim: true
    },
    tender_no: {
      type: String,
      trim: true,
      index: true
    },
    bid_id: {
      type: String,
      trim: true
    },
    contractor_name: {
      type: String,
      trim: true,
      index: true
    },
    letter_date: {
      type: String,
      trim: true
    },
    contract_value: {
      type: Number
    },
    whether_loa_restricted: { type: String, enum: ['Y', 'N'] },
    section_location: { type: String, trim: true },
    divcode: { type: String, trim: true },
    restriction_sync_pending: { type: Boolean, default: false },
    json_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    original_file_name: {
      type: String,
      trim: true
    },
    html_file_name: {
      type: String,
      trim: true
    },
    uploaded_at: {
      type: Date,
      default: Date.now
    },
    postgres_synced: {
      type: Boolean,
      default: false,
      index: true
    },
    postgres_synced_at: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

LoaLetterSchema.index({
  loa_no: 'text',
  tender_no: 'text',
  contractor_name: 'text'
});

export default mongoose.model('LoaLetter', LoaLetterSchema);
