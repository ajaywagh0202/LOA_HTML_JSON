import multer from 'multer';
import mongoose from 'mongoose';

export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

export const errorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Server error';

  if (error instanceof multer.MulterError) {
    statusCode = 400;
    if (error.code === 'LIMIT_FILE_SIZE') {
      message = 'File is too large. Maximum allowed size is 10 MB.';
    }
  }

  if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = 'Invalid MongoDB id.';
  }

  if (error?.code === 11000) {
    statusCode = 409;
    message = 'A LOA record with this loa_no already exists.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {})
  });
};

