import { Router } from 'express';
import {
  deleteLoa,
  getLoaById,
  getLoaByNumber,
  getLoaByNumberPost,
  getLoaLetters,
  getViewLoa,
  getViewLoaList,
  syncLoaByMongoId,
  updateLoa,
  uploadLoa,
  uploadLoaBulk,
  viewLoaHtmlFile,
  uploadSingleLoa
} from '../controllers/loaController.js';
import { uploadLoaHtml } from '../middleware/upload.js';
import { postgresPool } from '../config/postgres.js';
import mongoose from 'mongoose';
import LoaLetter from '../models/LoaLetter.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getRestrictionDetails, saveRestrictionDetails } from '../services/loaRestrictionService.js';

const router = Router();

const restrictionRecord = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw Object.assign(new Error('Invalid MongoDB id.'), { statusCode: 400 });
  const record = await LoaLetter.findById(id);
  if (!record) throw Object.assign(new Error('LOA record not found.'), { statusCode: 404 });
  return record;
};
router.get('/record/:id/restrictions', asyncHandler(async (req, res) => {
  res.json(await getRestrictionDetails(await restrictionRecord(req.params.id)));
}));
router.put('/record/:id/restrictions', asyncHandler(async (req, res) => {
  if (!req.body.revision || Number.isNaN(Date.parse(req.body.revision))) {
    return res.status(400).json({ message: 'A valid LOA revision is required. Reload the details.' });
  }
  const record = await saveRestrictionDetails(await restrictionRecord(req.params.id), req.body);
  res.json({ success: true, message: 'Restrictions updated in MongoDB and PostgreSQL.', revision: record.updatedAt });
}));

router.post('/upload', uploadLoaHtml.single('file'), uploadLoa);
router.post('/upload-single', uploadLoaHtml.single('file'), uploadSingleLoa);
router.post('/upload-bulk', uploadLoaHtml.array('files', 150), uploadLoaBulk);
router.post('/by-number', getLoaByNumberPost);
router.post('/sync/:mongoId', syncLoaByMongoId);
router.get('/', getLoaLetters);
router.get('/list', getViewLoaList);
router.get('/by-number', getLoaByNumber);
router.get('/by-number/:loa_no', getLoaByNumber);
router.get('/file/:loaNo', viewLoaHtmlFile);
router.get('/record/:id', getLoaById);
router.put('/:id', updateLoa);
router.delete('/:id', deleteLoa);
router.get('/unit', async (req, res) => {
  
  let client;

  try {
    client = await postgresPool.connect();
    const result = await client.query('select divcode, divname from public.div_m order by divcode asc');
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching units'
    });
  } finally {
    client?.release();
  }
});
router.get('/:loaNo', getViewLoa);
export default router;
