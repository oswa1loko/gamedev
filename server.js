const path = require("path");
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const jwtSecret = process.env.JWT_SECRET || "change-this-secret";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number.parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "history_hunt_ph",
  waitForConnections: true,
  connectionLimit: 10
});

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    validateCredentials(username, password);

    const [existingRows] = await pool.execute(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username.trim()]
    );

    if (existingRows.length > 0) {
      return res.status(409).json({ error: "That username already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users
        (username, password_hash, score, coins, solved, streak, best_score, best_solved, best_streak)
       VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`,
      [username.trim(), passwordHash]
    );

    const user = await findUserById(result.insertId);
    return res.json({
      token: signToken(user.id),
      user: serializeUser(user)
    });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    validateCredentials(username, password);

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username.trim()]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }

    return res.json({
      token: signToken(user.id),
      user: serializeUser(user)
    });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  return res.json({ user: serializeUser(req.user) });
});

app.put("/api/profile", authenticate, async (req, res) => {
  try {
    const { gameName, gender, avatar } = req.body || {};

    if (!gameName || String(gameName).trim().length < 3) {
      return res.status(400).json({ error: "Game name must be at least 3 characters." });
    }

    if (!gender || !String(gender).trim()) {
      return res.status(400).json({ error: "Gender is required." });
    }

    if (!avatar || !String(avatar).startsWith("data:image/")) {
      return res.status(400).json({ error: "A profile image is required." });
    }

    await pool.execute(
      `UPDATE users
       SET game_name = ?, gender = ?, avatar = ?, updated_at = NOW()
       WHERE id = ?`,
      [String(gameName).trim(), String(gender).trim(), avatar, req.user.id]
    );

    const user = await findUserById(req.user.id);
    return res.json({ user: serializeUser(user) });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.post("/api/game/progress", authenticate, async (req, res) => {
  try {
    const score = toNonNegativeNumber(req.body?.score);
    const coins = toNonNegativeNumber(req.body?.coins);
    const solved = toNonNegativeNumber(req.body?.solved);
    const streak = toNonNegativeNumber(req.body?.streak);

    await pool.execute(
      `UPDATE users
       SET score = ?,
           coins = ?,
           solved = ?,
           streak = ?,
           best_score = GREATEST(best_score, ?),
           best_solved = GREATEST(best_solved, ?),
           best_streak = GREATEST(best_streak, ?),
           updated_at = NOW()
       WHERE id = ?`,
      [score, coins, solved, streak, score, solved, streak, req.user.id]
    );

    const user = await findUserById(req.user.id);
    return res.json({ user: serializeUser(user) });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.get("/api/leaderboard", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT username, game_name, gender, avatar, best_score, best_solved, best_streak
       FROM users
       WHERE game_name IS NOT NULL AND game_name <> '' AND gender IS NOT NULL AND gender <> '' AND avatar IS NOT NULL AND avatar <> ''
       ORDER BY best_score DESC, best_solved DESC, best_streak DESC, updated_at ASC
       LIMIT 50`
    );

    return res.json({
      players: rows.map((row) => ({
        username: row.username,
        gameName: row.game_name,
        gender: row.gender,
        avatar: row.avatar,
        bestScore: row.best_score,
        bestSolved: row.best_solved,
        bestStreak: row.best_streak
      }))
    });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`History Hunt PH server running at http://localhost:${port}`);
});

function signToken(userId) {
  return jwt.sign({ userId }, jwtSecret, { expiresIn: "7d" });
}

async function authenticate(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization || "";
    const token = authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const payload = jwt.verify(token, jwtSecret);
    const user = await findUserById(payload.userId);

    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Authentication required." });
  }
}

async function findUserById(id) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    gameName: user.game_name || "",
    gender: user.gender || "",
    avatar: user.avatar || "",
    score: user.score || 0,
    coins: user.coins || 0,
    solved: user.solved || 0,
    streak: user.streak || 0,
    bestScore: user.best_score || 0,
    bestSolved: user.best_solved || 0,
    bestStreak: user.best_streak || 0
  };
}

function validateCredentials(username, password) {
  if (!username || !password) {
    const error = new Error("Enter both username and password.");
    error.statusCode = 400;
    throw error;
  }

  if (!/^[a-zA-Z0-9_ ]{3,18}$/.test(String(username).trim())) {
    const error = new Error("Username must be 3 to 18 characters using letters, numbers, spaces, or underscores.");
    error.statusCode = 400;
    throw error;
  }

  if (String(password).length < 6) {
    const error = new Error("Password must be at least 6 characters.");
    error.statusCode = 400;
    throw error;
  }
}

function toNonNegativeNumber(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function handleServerError(res, error) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: "Internal server error." });
}
