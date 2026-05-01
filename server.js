const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";
const jwtSecret = process.env.JWT_SECRET || "change-this-secret";
const dataStore = process.env.DATA_STORE === "mysql"
  ? createMysqlStore()
  : createFileStore();
const commonsImageCache = new Map();

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.get("/api/image", async (req, res) => {
  try {
    const imageUrl = new URL(String(req.query.url || ""));

    if (!["http:", "https:"].includes(imageUrl.protocol)) {
      return res.status(400).send("Invalid image URL.");
    }

    return await sendRemoteImage(res, imageUrl.toString());
  } catch (error) {
    return res.status(502).send("Image could not be loaded.");
  }
});

app.get("/api/commons-image", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();

    if (!query || query.length > 80) {
      return res.status(400).send("Invalid image search query.");
    }

    const imageUrl = await findCommonsImageUrl(query);

    if (!imageUrl) {
      return res.status(404).send("No image found.");
    }

    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.redirect(302, imageUrl);
  } catch (error) {
    return res.status(502).send("Image could not be loaded.");
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    validateCredentials(username, password);

    const existingUser = await dataStore.findUserByUsername(username.trim());

    if (existingUser) {
      return res.status(409).json({ error: "That username already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await dataStore.createUser(username.trim(), passwordHash);
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

    const user = await dataStore.findUserByUsername(username.trim());

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

    const user = await dataStore.updateProfile(req.user.id, {
      gameName: String(gameName).trim(),
      gender: String(gender).trim(),
      avatar
    });
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

    const user = await dataStore.updateProgress(req.user.id, {
      score,
      coins,
      solved,
      streak
    });
    return res.json({ user: serializeUser(user) });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.get("/api/leaderboard", async (_req, res) => {
  try {
    const rows = await dataStore.listLeaderboard();
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

app.listen(port, host, () => {
  console.log(`History Hunt PH server running on ${host}:${port}`);
  console.log(`Using ${process.env.DATA_STORE === "mysql" ? "MySQL" : "local file"} data store.`);
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
    const user = await dataStore.findUserById(payload.userId);

    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Authentication required." });
  }
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

async function sendRemoteImage(res, imageUrl) {
  let timeout;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HistoryHuntPH/1.0 image loader"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send("Image could not be loaded.");
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";

    if (!contentType.startsWith("image/")) {
      return res.status(415).send("URL did not return an image.");
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", contentType);
    return res.send(imageBuffer);
  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).send("Image request timed out.");
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function findCommonsImageUrl(query) {
  const cacheKey = query.toLowerCase();

  if (commonsImageCache.has(cacheKey)) {
    return commonsImageCache.get(cacheKey);
  }

  const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
  apiUrl.searchParams.set("action", "query");
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("generator", "search");
  apiUrl.searchParams.set("gsrnamespace", "6");
  apiUrl.searchParams.set("gsrsearch", query);
  apiUrl.searchParams.set("gsrlimit", "8");
  apiUrl.searchParams.set("prop", "imageinfo");
  apiUrl.searchParams.set("iiprop", "url|mime");

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent": "HistoryHuntPH/1.0 image search"
    }
  });

  if (!response.ok) {
    commonsImageCache.set(cacheKey, "");
    return "";
  }

  const payload = await response.json();
  const pages = Object.values(payload.query?.pages || {});
  const imagePage = pages.find((page) => {
    const imageInfo = page.imageinfo?.[0];
    return imageInfo?.url && imageInfo?.mime?.startsWith("image/");
  });
  const imageUrl = imagePage?.imageinfo?.[0]?.url || "";
  commonsImageCache.set(cacheKey, imageUrl);
  return imageUrl;
}

function createMysqlStore() {
  const useSsl = String(process.env.DB_SSL || "").toLowerCase() === "true";
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number.parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "history_hunt_ph",
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 10
  });

  return {
    async findUserById(id) {
      const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
      return rows[0] || null;
    },

    async findUserByUsername(username) {
      const [rows] = await pool.execute("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
      return rows[0] || null;
    },

    async createUser(username, passwordHash) {
      const [result] = await pool.execute(
        `INSERT INTO users
          (username, password_hash, score, coins, solved, streak, best_score, best_solved, best_streak)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`,
        [username, passwordHash]
      );
      return this.findUserById(result.insertId);
    },

    async updateProfile(id, profile) {
      await pool.execute(
        `UPDATE users
         SET game_name = ?, gender = ?, avatar = ?, updated_at = NOW()
         WHERE id = ?`,
        [profile.gameName, profile.gender, profile.avatar, id]
      );
      return this.findUserById(id);
    },

    async updateProgress(id, progress) {
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
        [
          progress.score,
          progress.coins,
          progress.solved,
          progress.streak,
          progress.score,
          progress.solved,
          progress.streak,
          id
        ]
      );
      return this.findUserById(id);
    },

    async listLeaderboard() {
      const [rows] = await pool.execute(
        `SELECT username, game_name, gender, avatar, best_score, best_solved, best_streak
         FROM users
         WHERE username <> 'guest'
           AND password_hash IS NOT NULL
           AND password_hash <> ''
         ORDER BY best_score DESC, best_solved DESC, best_streak DESC, updated_at ASC
         LIMIT 50`
      );
      return rows;
    }
  };
}

function createFileStore() {
  const dataDirectory = path.join(__dirname, ".data");
  const dataFile = path.join(dataDirectory, "users.json");

  async function readUsers() {
    try {
      const raw = await fs.readFile(dataFile, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeUsers(users) {
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(users, null, 2));
  }

  return {
    async findUserById(id) {
      const users = await readUsers();
      return users.find((user) => user.id === Number(id)) || null;
    },

    async findUserByUsername(username) {
      const users = await readUsers();
      const normalizedUsername = username.trim().toLowerCase();
      return users.find((user) => user.username.toLowerCase() === normalizedUsername) || null;
    },

    async createUser(username, passwordHash) {
      const users = await readUsers();
      const now = new Date().toISOString();
      const nextId = users.reduce((maxId, user) => Math.max(maxId, user.id || 0), 0) + 1;
      const user = {
        id: nextId,
        username,
        password_hash: passwordHash,
        game_name: "",
        gender: "",
        avatar: "",
        score: 0,
        coins: 0,
        solved: 0,
        streak: 0,
        best_score: 0,
        best_solved: 0,
        best_streak: 0,
        created_at: now,
        updated_at: now
      };

      users.push(user);
      await writeUsers(users);
      return user;
    },

    async updateProfile(id, profile) {
      const users = await readUsers();
      const user = users.find((entry) => entry.id === Number(id));

      if (!user) {
        return null;
      }

      user.game_name = profile.gameName;
      user.gender = profile.gender;
      user.avatar = profile.avatar;
      user.updated_at = new Date().toISOString();
      await writeUsers(users);
      return user;
    },

    async updateProgress(id, progress) {
      const users = await readUsers();
      const user = users.find((entry) => entry.id === Number(id));

      if (!user) {
        return null;
      }

      user.score = progress.score;
      user.coins = progress.coins;
      user.solved = progress.solved;
      user.streak = progress.streak;
      user.best_score = Math.max(user.best_score || 0, progress.score);
      user.best_solved = Math.max(user.best_solved || 0, progress.solved);
      user.best_streak = Math.max(user.best_streak || 0, progress.streak);
      user.updated_at = new Date().toISOString();
      await writeUsers(users);
      return user;
    },

    async listLeaderboard() {
      const users = await readUsers();
      return users
        .filter((user) => isLeaderboardAccount(user))
        .sort((a, b) => {
          if ((b.best_score || 0) !== (a.best_score || 0)) {
            return (b.best_score || 0) - (a.best_score || 0);
          }

          if ((b.best_solved || 0) !== (a.best_solved || 0)) {
            return (b.best_solved || 0) - (a.best_solved || 0);
          }

          if ((b.best_streak || 0) !== (a.best_streak || 0)) {
            return (b.best_streak || 0) - (a.best_streak || 0);
          }

          return String(a.updated_at || "").localeCompare(String(b.updated_at || ""));
        })
        .slice(0, 50);
    }
  };
}

function isLeaderboardAccount(user) {
  return Boolean(
    user &&
    String(user.username || "").trim().toLowerCase() !== "guest" &&
    user.password_hash
  );
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
