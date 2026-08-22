import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './src/authRouter.js';
import { adminRouter } from './src/adminRouter.js';
import { examAnalyticsRouter } from './src/examAnalyticsRouter.js';
import { conditionsRouter } from './src/conditionsRouter.js';
import { templateRouter } from './src/templateRouter.js';
import { marksEntryRouter } from './src/marksEntryRouter.js';
import { newsBoardRouter } from './src/newsBoardRouter.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static web files (Landing, Login, App Shell)
app.use(express.static(path.join(__dirname, 'public')));

// Auth, Admin & Analytics API routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/analytics/exam', examAnalyticsRouter);
app.use('/api/conditions', conditionsRouter);
app.use('/api/template', templateRouter);
app.use('/api/marks-entry', marksEntryRouter);
app.use('/api/news-board', newsBoardRouter);

// Fallback route to Landing Page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 ZetaPlus SaaS Platform running on http://localhost:${PORT}`);
});
