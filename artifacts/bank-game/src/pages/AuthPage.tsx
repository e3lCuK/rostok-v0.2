import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

type Mode = "login" | "register" | "forgot" | "reset";

function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>(() => getTokenFromUrl() ? "reset" : "login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [resetToken] = useState<string>(() => getTokenFromUrl() ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resetToken) setMode("reset");
  }, [resetToken]);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "register" && password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    if (mode === "reset" && newPw !== newPwConfirm) {
      setError("Пароли не совпадают");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else if (mode === "register") {
        await register(username.trim(), nickname.trim(), password);
      } else if (mode === "forgot") {
        await api.forgotPassword(forgotEmail.trim());
        setSuccess("Если этот email зарегистрирован, письмо уже в пути. Проверьте почту.");
      } else if (mode === "reset") {
        await api.resetPassword(resetToken, newPw);
        setSuccess("Пароль изменён! Теперь можно войти.");
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-logo">
          <span style={{ fontSize: "2.8rem", lineHeight: 1 }}>🌳</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
            <span className="auth-logo-text">Росток</span>
            <span style={{ fontSize: "0.72rem", color: "#5a7a40", fontWeight: 500 }}>Копи. Играй. Расти.</span>
          </div>
        </div>

        {mode !== "forgot" && mode !== "reset" && (
          <div className="auth-tabs">
            <button
              className={`auth-tab${mode === "login" ? " auth-tab-active" : ""}`}
              onClick={() => switchMode("login")}
              type="button"
            >
              Войти
            </button>
            <button
              className={`auth-tab${mode === "register" ? " auth-tab-active" : ""}`}
              onClick={() => switchMode("register")}
              type="button"
            >
              Зарегистрироваться
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div className="auth-mode-title">Восстановление пароля</div>
        )}
        {mode === "reset" && (
          <div className="auth-mode-title">Новый пароль</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">
          {(mode === "login" || mode === "register") && (
            <div className="auth-field">
              <label className="auth-label">Логин</label>
              <input
                className="auth-input"
                type="text"
                placeholder="Латиница, цифры"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label">Ник</label>
              <input
                className="auth-input"
                type="text"
                placeholder="Ваше отображаемое имя"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
              />
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="auth-field">
              <label className="auth-label">Пароль</label>
              <input
                className="auth-input"
                type="password"
                placeholder={mode === "register" ? "Не менее 6 символов" : "Введите ваш пароль"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label">Повторить пароль</label>
              <input
                className="auth-input"
                type="password"
                placeholder="Повторите введённый пароль"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          )}

          {mode === "forgot" && (
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="auth-input"
                type="email"
                placeholder="email@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          {mode === "reset" && (
            <>
              <div className="auth-field">
                <label className="auth-label">Новый пароль</label>
                <input
                  className="auth-input"
                  type="password"
                  placeholder="Не менее 6 символов"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Повторите пароль</label>
                <input
                  className="auth-input"
                  type="password"
                  placeholder="Повторите новый пароль"
                  value={newPwConfirm}
                  onChange={(e) => setNewPwConfirm(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {error && <p className="auth-error">{error}</p>}
          {success && <p className="auth-success">{success}</p>}

          {!(mode === "forgot" && success) && !(mode === "reset" && success) && (
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "..." :
                mode === "login" ? "Войти" :
                mode === "register" ? "Зарегистрироваться" :
                mode === "forgot" ? "Отправить письмо" :
                "Сохранить пароль"}
            </button>
          )}
        </form>

        {mode === "login" && (
          <button className="auth-forgot-link" type="button" onClick={() => switchMode("forgot")}>
            Забыли пароль?
          </button>
        )}

        {(mode === "forgot" || mode === "reset") && (
          <button className="auth-forgot-link" type="button" onClick={() => switchMode("login")}>
            ← Войти
          </button>
        )}

        {mode === "reset" && success && (
          <button className="auth-submit" style={{ marginTop: 8 }} type="button" onClick={() => switchMode("login")}>
            Войти
          </button>
        )}
      </div>
    </div>
  );
}
