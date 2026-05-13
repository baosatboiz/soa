const express = require('express');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const rateLimit = require('express-rate-limit');
const fs = require('fs/promises');
const path = require('path');

dotenv.config();

const app = express();
const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bankquestion';
const USERS_FILE = path.join(ROOT_DIR, 'users.json');
const QUESTIONS_FILE = path.join(ROOT_DIR, 'bank_questions.json');

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI environment variable.');
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.static(ROOT_DIR));

// Rate limiting tổng quát cho API: 100 requests / 15 phút
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting nghiêm ngặt cho Login: 10 requests / 15 phút
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Áp dụng limiter
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);

let db;

async function connectToDatabase() {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  await ensureDatabaseSeeded();
  return db;
}


function cleanText(value) {
  return String(value || '').trim();
}

function asObjectIdSafe(value) {
  return cleanText(value);
}

async function readJsonArray(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array in ${path.basename(filePath)}`);
  }
  return parsed;
}

async function syncCollectionWithFile(collection, filePath, matchField, enrichFn) {
  try {
    const rows = await readJsonArray(filePath);
    const operations = rows.map((row, index) => {
      const doc = enrichFn ? enrichFn(row, index) : row;
      return {
        updateOne: {
          filter: { [matchField]: doc[matchField] },
          update: { $set: doc },
          upsert: true
        }
      };
    });

    if (operations.length > 0) {
      const result = await collection.bulkWrite(operations, { ordered: false });
      if (result.upsertedCount > 0 || result.modifiedCount > 0) {
        console.log(`Synced ${path.basename(filePath)}: ${result.upsertedCount} new, ${result.modifiedCount} updated.`);
      }
    }
  } catch (err) {
    console.error(`Failed to sync ${path.basename(filePath)}:`, err.message);
  }
}

async function ensureDatabaseSeeded() {
  const users = db.collection('users');
  const questions = db.collection('questions');
  const attempts = db.collection('attempts');
  const drafts = db.collection('drafts');

  await Promise.all([
    users.createIndex({ username: 1 }, { unique: true }),
    users.createIndex({ userId: 1 }, { unique: true }),
    questions.createIndex({ questionId: 1 }, { unique: true }),
    questions.createIndex({ seedOrder: 1 }),
    attempts.createIndex({ userId: 1, submittedAt: -1 }),
    drafts.createIndex({ userId: 1, setId: 1 }, { unique: true }),
    // TTL Index cho logs: Tự động xóa sau 7 ngày (7 * 24 * 60 * 60 giây)
    db.collection('logs').createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 }),
  ]);

  await syncCollectionWithFile(users, USERS_FILE, 'userId', (row, index) => ({
    userId: cleanText(row.userId),
    username: cleanText(row.username),
    password: cleanText(row.password),
    seedOrder: index,
  }));

  await syncCollectionWithFile(questions, QUESTIONS_FILE, 'questionId', (row, index) => ({
    ...row,
    seedOrder: index,
  }));
}

async function createLog(type, details, req = null) {
  try {
    const logEntry = {
      type,
      details,
      ip: req ? (req.headers['x-forwarded-for'] || req.ip) : 'system',
      userAgent: req ? req.headers['user-agent'] : null,
      createdAt: new Date()
    };
    await db.collection('logs').insertOne(logEntry);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

async function loginUser(username, password) {
  const user = await db.collection('users').findOne({
    username: cleanText(username),
    password: cleanText(password),
  });

  if (!user) {
    return null;
  }

  return {
    userId: user.userId,
    username: user.username,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!cleanText(username) || !cleanText(password)) {
      return res.status(400).json({ message: 'Missing username or password.' });
    }

    const user = await loginUser(username, password);
    if (!user) {
      await createLog('LOGIN_FAILED', { username }, req);
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    await createLog('LOGIN_SUCCESS', { userId: user.userId, username: user.username }, req);
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/questions', async (_req, res) => {
  try {
    const questions = await db.collection('questions')
      .find({}, { projection: { _id: 0 } })
      .sort({ seedOrder: 1 })
      .toArray();

    // Cache danh sách câu hỏi trong 5 phút (300 giây)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/users/:userId/attempts', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    const attempts = await db.collection('attempts')
      .find({ userId }, { projection: { _id: 0 } })
      .sort({ submittedAt: 1, startedAt: 1 })
      .toArray();

    res.json({ userId, attempts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/users/:userId/attempts', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    const body = req.body || {};
    if (!cleanText(body.setId)) {
      return res.status(400).json({ message: 'Missing setId.' });
    }

    const attempt = {
      userId,
      setId: cleanText(body.setId),
      startedAt: cleanText(body.startedAt),
      submittedAt: cleanText(body.submittedAt),
      total: Number(body.total) || 0,
      answeredCount: Number(body.answeredCount) || 0,
      correctCount: Number(body.correctCount) || 0,
      wrongCount: Number(body.wrongCount) || 0,
      score100: Number(body.score100) || 0,
      details: Array.isArray(body.details) ? body.details : [],
    };

    await db.collection('attempts').insertOne(attempt);
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/users/:userId/attempts', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    await db.collection('attempts').deleteMany({ userId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/users/:userId/drafts/:setId', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    const setId = cleanText(req.params.setId);
    const draft = await db.collection('drafts').findOne(
      { userId, setId },
      { projection: { _id: 0 } }
    );

    res.json({ draft: draft || null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/users/:userId/drafts', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    const drafts = await db.collection('drafts')
      .find({ userId }, { projection: { _id: 0 } })
      .sort({ savedAt: -1 })
      .toArray();

    res.json({ userId, drafts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/users/:userId/drafts/:setId', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    const setId = cleanText(req.params.setId);
    const body = req.body || {};

    const draft = {
      userId,
      setId,
      startedAt: cleanText(body.startedAt),
      currentIndex: Number(body.currentIndex) || 0,
      answers: body.answers && typeof body.answers === 'object' ? body.answers : {},
      savedAt: cleanText(body.savedAt) || new Date().toISOString(),
    };

    await db.collection('drafts').updateOne(
      { userId, setId },
      { $set: draft },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/users/:userId/drafts/:setId', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    const setId = cleanText(req.params.setId);
    await db.collection('drafts').deleteOne({ userId, setId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/users/:userId/drafts', async (req, res) => {
  try {
    const userId = asObjectIdSafe(req.params.userId);
    await db.collection('drafts').deleteMany({ userId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const leaderboard = await db.collection('attempts').aggregate([
      {
        $group: {
          _id: '$userId',
          totalQuestions: { $sum: { $ifNull: ['$answeredCount', '$total'] } },
          correctAnswers: { $sum: '$correctCount' },
          attemptCount: { $sum: 1 },
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'userId',
          as: 'userInfo'
        }
      },
      {
        $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          username: { $ifNull: ['$userInfo.username', '$_id'] },
          correctAnswers: 1,
          attemptCount: 1,
        }
      },
      { $sort: { correctAnswers: -1, attemptCount: -1 } },
      { $limit: 100 }
    ]).toArray();

    // Cache kết quả trên Vercel Edge trong 60 giây
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    res.json(leaderboard);
  } catch (error) {
    await createLog('ERROR', { path: '/api/leaderboard', message: error.message });
    res.status(500).json({ message: error.message });
  }
});

// Middleware xử lý lỗi tập trung
app.use(async (err, req, res, next) => {
  console.error(err.stack);
  await createLog('SERVER_ERROR', { 
    message: err.message, 
    path: req.path,
    stack: err.stack 
  }, req);
  res.status(500).json({ message: 'Đã có lỗi xảy ra trên server.' });
});

async function bootstrap() {
  const _db = await connectToDatabase();

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}


if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { app, connectToDatabase };
