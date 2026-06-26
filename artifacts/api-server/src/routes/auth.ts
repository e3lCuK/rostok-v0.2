import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Resend } from "resend";
import { pool } from "@workspace/db";

const resend = new Resend(process.env["RESEND_API_KEY"]);

const router = Router();

// POST /api/auth/register
router.post("/auth/register", async (req: any, res: any) => {
  const { username, nickname, password } = req.body ?? {};

  if (!username || !nickname || !password) {
    return res.status(400).json({ error: "Все поля обязательны" });
  }
  const u = String(username).trim();
  const n = String(nickname).trim();
  const p = String(password);

  if (u.length < 3 || u.length > 30) {
    return res.status(400).json({ error: "Логин: от 3 до 30 символов" });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(u)) {
    return res.status(400).json({ error: "Логин: только латиница, цифры и _" });
  }
  if (n.length < 1 || n.length > 50) {
    return res.status(400).json({ error: "Ник: от 1 до 50 символов" });
  }
  if (p.length < 6) {
    return res.status(400).json({ error: "Пароль: минимум 6 символов" });
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [u.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Логин уже занят" });
    }

    const hash = await bcrypt.hash(p, 10);
    const result = await pool.query(
      "INSERT INTO users (username, nickname, password_hash) VALUES ($1, $2, $3) RETURNING id, username, nickname",
      [u.toLowerCase(), n, hash],
    );
    const user = result.rows[0];
    req.session.userId = user.id;
    req.log.info({ username: user.username }, "User registered");
    return res.json({ id: user.id, username: user.username, nickname: user.nickname });
  } catch (err) {
    req.log.error({ err }, "Register error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req: any, res: any) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: "Введите логин и пароль" });
  }

  try {
    const result = await pool.query(
      "SELECT id, username, nickname, password_hash FROM users WHERE username = $1",
      [String(username).toLowerCase()],
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    req.session.userId = user.id;
    req.log.info({ username: user.username }, "User logged in");
    return res.json({ id: user.id, username: user.username, nickname: user.nickname });
  } catch (err) {
    req.log.error({ err }, "Login error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", (req: any, res: any) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ success: true });
  });
});

// PATCH /api/auth/nickname
router.patch("/auth/nickname", async (req: any, res: any) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { nickname } = req.body ?? {};
  const n = String(nickname ?? "").trim();
  if (n.length < 1 || n.length > 50) {
    return res.status(400).json({ error: "Ник: от 1 до 50 символов" });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET nickname = $1 WHERE id = $2 RETURNING id, username, nickname",
      [n, userId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const user = result.rows[0];
    return res.json({ id: user.id, username: user.username, nickname: user.nickname });
  } catch (err) {
    req.log.error({ err }, "Nickname update error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// PATCH /api/auth/email
router.patch("/auth/email", async (req: any, res: any) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { email } = req.body ?? {};
  const e = String(email ?? "").trim();
  if (e.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return res.status(400).json({ error: "Некорректный email" });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, username, nickname, email",
      [e || null, userId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const u = result.rows[0];
    return res.json({ id: u.id, username: u.username, nickname: u.nickname, email: u.email });
  } catch (err) {
    req.log.error({ err }, "Email update error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// PATCH /api/auth/password
router.patch("/auth/password", async (req: any, res: any) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Все поля обязательны" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "Пароль: минимум 6 символов" });
  }
  try {
    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const ok = await bcrypt.compare(String(currentPassword), result.rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: "Неверный текущий пароль" });
    const newHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, userId]);
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Password change error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// POST /api/auth/forgot-password
router.post("/auth/forgot-password", async (req: any, res: any) => {
  const { email } = req.body ?? {};
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return res.status(400).json({ error: "Некорректный email" });
  }
  try {
    const result = await pool.query(
      "SELECT id, nickname FROM users WHERE LOWER(email) = $1",
      [e],
    );
    // Always return success to not leak user existence
    if (result.rows.length === 0) {
      return res.json({ success: true });
    }
    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, token, expires],
    );
    const domains = process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "localhost";
    const resetUrl = `https://${domains}/bank/reset-password?token=${token}`;
    await resend.emails.send({
      from: "Росток <onboarding@resend.dev>",
      to: e,
      subject: "Сброс пароля — Росток",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;color:#365314;">🌳 Росток</h2>
          <p style="color:#4b5563;">Привет, <strong>${user.nickname}</strong>!</p>
          <p style="color:#4b5563;">Мы получили запрос на сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует <strong>1 час</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#4d7c0f;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Сбросить пароль</a>
          <p style="color:#9ca3af;font-size:0.8rem;">Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#d1d5db;font-size:0.75rem;">Росток · Гейсификация личных финансов</p>
        </div>
      `,
    });
    req.log.info({ userId: user.id }, "Password reset email sent");
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Forgot password error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// POST /api/auth/reset-password
router.post("/auth/reset-password", async (req: any, res: any) => {
  const { token, newPassword } = req.body ?? {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Все поля обязательны" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "Пароль: минимум 6 символов" });
  }
  try {
    const result = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [String(token)],
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Ссылка недействительна или истекла" });
    }
    const { id: tokenId, user_id: userId } = result.rows[0];
    const newHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, userId]);
    await pool.query("UPDATE password_reset_tokens SET used = TRUE WHERE id = $1", [tokenId]);
    req.log.info({ userId }, "Password reset completed");
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reset password error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// GET /api/auth/me
router.get("/auth/me", async (req: any, res: any) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await pool.query(
      "SELECT id, username, nickname, email FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0) return res.status(401).json({ error: "Not found" });
    const user = result.rows[0];
    return res.json({ id: user.id, username: user.username, nickname: user.nickname, email: user.email });
  } catch (err) {
    req.log.error({ err }, "Me error");
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

export default router;
