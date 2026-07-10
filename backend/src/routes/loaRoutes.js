import { Router } from 'express';
import {
  deleteLoa,
  getLoaById,
  getLoaByNumber,
  getLoaByNumberPost,
  getLoaLetters,
  syncLoaByMongoId,
  updateLoa,
  uploadLoa
} from '../controllers/loaController.js';
import { uploadLoaHtml } from '../middleware/upload.js';

const router = Router();

router.post('/upload', uploadLoaHtml.single('file'), uploadLoa);
router.post('/by-number', getLoaByNumberPost);
router.post('/sync/:mongoId', syncLoaByMongoId);
router.get('/', getLoaLetters);
router.get('/by-number', getLoaByNumber);
router.get('/by-number/:loa_no', getLoaByNumber);
router.get('/:id', getLoaById);
router.put('/:id', updateLoa);
router.delete('/:id', deleteLoa);

export default router;
