import path from 'path';
import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.html', '.htm'];

  if (!allowedExtensions.includes(extension)) {
    callback(new Error('Only .html and .htm files are allowed.'));
    return;
  }

  callback(null, true);
};

export const uploadLoaHtml = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

