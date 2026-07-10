import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';

dotenv.config();

const port = process.env.PORT || 5000;
const host = process.env.HOST || '0.0.0.0';

await connectDB();

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
