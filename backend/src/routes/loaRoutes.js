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
  viewLoaHtmlFile
} from '../controllers/loaController.js';
import { uploadLoaHtml } from '../middleware/upload.js';

const router = Router();

router.post('/upload', uploadLoaHtml.single('file'), uploadLoa);
router.post('/upload-bulk', uploadLoaHtml.array('files', 150), uploadLoaBulk);
router.post('/by-number', getLoaByNumberPost);
router.post('/sync/:mongoId', syncLoaByMongoId);
router.get('/', getLoaLetters);
router.get('/list', getViewLoaList);
router.get('/by-number', getLoaByNumber);
router.get('/by-number/:loa_no', getLoaByNumber);
router.get('/file/:loaNo', viewLoaHtmlFile);
router.get('/record/:id', getLoaById);
router.get('/:loaNo', getViewLoa);
router.put('/:id', updateLoa);
router.delete('/:id', deleteLoa);

export default router;
