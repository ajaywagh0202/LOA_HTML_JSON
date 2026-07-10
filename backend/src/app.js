import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import loaRoutes from './routes/loaRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isPrivateDevOrigin = (origin) => {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const { hostname, port, protocol } = new URL(origin);
    const isViteDevPort = port === '5173';
    const isHttp = protocol === 'http:';
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isPrivateLan =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    return isHttp && isViteDevPort && (isLocalHost || isPrivateLan);
  } catch {
    return false;
  }
};

const corsOptions = {
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin) || isPrivateDevOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'LOA parser API is running.'
  });
});

app.use('/api/loa', loaRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
