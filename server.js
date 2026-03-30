// ─────────────────────────────────────────────
//  EXAM SERVER  —  server.js
//  Answers live only here (loaded from .env)
//  The frontend NEVER receives correct answers
// ─────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting (prevents brute-force answer guessing) ──
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // max 5 submissions per IP per window
  message: { error: 'Too many submissions. Please wait.' }
});

// ── Load questions from .env (strip answers out) ──
function loadQuestions(includeAnswers = false) {
  const questions = [];
  let i = 1;
  while (process.env[`QUESTION_${i}`]) {
    const q = {
      id: i,
      text: process.env[`QUESTION_${i}`],
      options: process.env[`OPTIONS_${i}`].split('|'),
    };
    if (includeAnswers) {
      q.answer = parseInt(process.env[`ANSWER_${i}`], 10);
    }
    questions.push(q);
    i++;
  }
  return questions;
}

// ── Exam config (safe to expose) ──
function getExamConfig() {
  return {
    title:           process.env.EXAM_TITLE || 'Exam',
    durationMinutes: parseInt(process.env.EXAM_DURATION_MINUTES, 10) || 30,
    totalMarks:      parseInt(process.env.EXAM_TOTAL_MARKS, 10) || 100,
    passMark:        parseInt(process.env.EXAM_PASS_MARK, 10) || 40,
  };
}

// ─────────────────────────────────────────────
//  API ROUTES
// ─────────────────────────────────────────────

// GET /api/exam  —  returns config + questions WITHOUT answers
app.get('/api/exam', (req, res) => {
  const questions = loadQuestions(false); // ← answers excluded
  res.json({
    config: getExamConfig(),
    questions,
  });
});

// POST /api/submit  —  grades on server, never exposes answers
app.post('/api/submit', submitLimiter, (req, res) => {
  const { studentName, studentId, answers } = req.body;

  if (!studentName || !studentId || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Invalid submission payload.' });
  }

  const questions = loadQuestions(true); // ← answers loaded server-side only

  if (answers.length !== questions.length) {
    return res.status(400).json({ error: 'Answer count mismatch.' });
  }

  let correct = 0, wrong = 0, skipped = 0;
  const review = questions.map((q, idx) => {
    const userAns = answers[idx]; // null = skipped
    const isSkip  = userAns === null || userAns === undefined;
    const isRight = !isSkip && userAns === q.answer;

    if (isSkip)       skipped++;
    else if (isRight) correct++;
    else              wrong++;

    return {
      id:            q.id,
      questionText:  q.text,
      yourAnswer:    isSkip ? null : q.options[userAns],
      correctAnswer: q.options[q.answer],   // revealed only in result
      isCorrect:     isRight,
      isSkipped:     isSkip,
    };
  });

  const config  = getExamConfig();
  const score   = Math.round((correct / questions.length) * config.totalMarks);
  const percent = Math.round((correct / questions.length) * 100);
  const passed  = score >= config.passMark;

  console.log(`[SUBMISSION] ${studentId} | ${studentName} | ${correct}/${questions.length} | ${percent}%`);

  res.json({
    studentName,
    studentId,
    correct,
    wrong,
    skipped,
    score,
    totalMarks: config.totalMarks,
    percent,
    passed,
    review,
  });
});

// ── Start server ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Exam server running on http://localhost:${PORT}`);
  console.log(`   Questions loaded: ${loadQuestions().length}`);
  console.log(`   Answers: server-side only (not exposed to client)\n`);
});
