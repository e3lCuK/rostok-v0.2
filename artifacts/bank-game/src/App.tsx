import { useEffect, useCallback, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QueryClientProvider } from "@tanstack/react-query";
import { Settings, LogOut, Pencil, Mail, Lock, Check, X } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { APP_NAME, APP_VERSION, UserState } from "@/lib/engine";
import GamePage from "@/pages/GamePage";
import OnboardingPage from "@/pages/OnboardingPage";
import AuthPage from "@/pages/AuthPage";
import DebugPanel from "@/components/DebugPanel";
import "@/bank.css";

type SettingsPanel = "nick" | "email" | "password" | null;

// ---- Settings widget ----
function SettingsWidget({ onClose }: { onClose: () => void }) {
  const { user, logout, updateNickname, updateEmail, changePassword } = useAuth();
  const [panel, setPanel] = useState<SettingsPanel>(null);

  const [nickVal, setNickVal] = useState(user?.nickname ?? "");
  const [nickErr, setNickErr] = useState("");
  const [nickOk, setNickOk] = useState(false);
  const [nickBusy, setNickBusy] = useState(false);

  const [emailVal, setEmailVal] = useState(user?.email ?? "");
  const [emailErr, setEmailErr] = useState("");
  const [emailOk, setEmailOk] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwOk, setPwOk] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  function togglePanel(p: SettingsPanel) {
    setPanel(prev => prev === p ? null : p);
    setNickErr(""); setEmailErr(""); setPwErr("");
    setNickOk(false); setEmailOk(false); setPwOk(false);
  }

  async function saveNick() {
    if (nickBusy || !nickVal.trim()) return;
    setNickBusy(true); setNickErr(""); setNickOk(false);
    try {
      await updateNickname(nickVal.trim());
      setNickOk(true);
    } catch (e: any) { setNickErr(e.message ?? "Ошибка"); }
    finally { setNickBusy(false); }
  }

  async function saveEmail() {
    if (emailBusy) return;
    setEmailBusy(true); setEmailErr(""); setEmailOk(false);
    try {
      await updateEmail(emailVal.trim());
      setEmailOk(true);
    } catch (e: any) { setEmailErr(e.message ?? "Ошибка"); }
    finally { setEmailBusy(false); }
  }

  async function savePw() {
    if (pwBusy || !curPw || !newPw) return;
    setPwBusy(true); setPwErr(""); setPwOk(false);
    try {
      await changePassword(curPw, newPw);
      setPwOk(true);
      setCurPw(""); setNewPw("");
    } catch (e: any) { setPwErr(e.message ?? "Ошибка"); }
    finally { setPwBusy(false); }
  }

  return (
    <div className="settings-widget">
      <div className="settings-icon-row">
        <button className={`settings-action-btn${panel === "nick" ? " settings-action-active" : ""}`} onClick={() => togglePanel("nick")} title="Сменить ник">
          <Pencil size={18} />
          <span>Ник</span>
        </button>
        <button className={`settings-action-btn${panel === "email" ? " settings-action-active" : ""}`} onClick={() => togglePanel("email")} title="Почта">
          <Mail size={18} />
          <span>Почта</span>
        </button>
        <button className={`settings-action-btn${panel === "password" ? " settings-action-active" : ""}`} onClick={() => togglePanel("password")} title="Пароль">
          <Lock size={18} />
          <span>Пароль</span>
        </button>
        <button className="settings-action-btn settings-action-logout" onClick={() => logout()} title="Выйти">
          <LogOut size={18} />
          <span>Выход</span>
        </button>
      </div>

      {panel === "nick" && (
        <div className="settings-form">
          <input
            className="settings-input"
            value={nickVal}
            onChange={e => { setNickVal(e.target.value); setNickErr(""); setNickOk(false); }}
            placeholder="Новый ник"
            maxLength={50}
            autoFocus
            onKeyDown={e => e.key === "Enter" && saveNick()}
          />
          {nickErr && <p className="settings-err">{nickErr}</p>}
          {nickOk && <p className="settings-ok">Ник обновлён ✓</p>}
          <div className="settings-form-btns">
            <button className="settings-save-btn" onClick={saveNick} disabled={nickBusy}>
              {nickBusy ? "..." : <><Check size={14} /> Сохранить</>}
            </button>
            <button className="settings-cancel-btn" onClick={() => setPanel(null)}><X size={14} /></button>
          </div>
        </div>
      )}

      {panel === "email" && (
        <div className="settings-form">
          <input
            className="settings-input"
            type="email"
            value={emailVal as string}
            onChange={e => { setEmailVal(e.target.value); setEmailErr(""); setEmailOk(false); }}
            placeholder="email@example.com"
            autoFocus
            onKeyDown={e => e.key === "Enter" && saveEmail()}
          />
          {emailErr && <p className="settings-err">{emailErr}</p>}
          {emailOk && <p className="settings-ok">Почта сохранена ✓</p>}
          <div className="settings-form-btns">
            <button className="settings-save-btn" onClick={saveEmail} disabled={emailBusy}>
              {emailBusy ? "..." : <><Check size={14} /> Сохранить</>}
            </button>
            <button className="settings-cancel-btn" onClick={() => setPanel(null)}><X size={14} /></button>
          </div>
        </div>
      )}

      {panel === "password" && (
        <div className="settings-form">
          <input
            className="settings-input"
            type="password"
            value={curPw}
            onChange={e => { setCurPw(e.target.value); setPwErr(""); setPwOk(false); }}
            placeholder="Текущий пароль"
            autoFocus
          />
          <input
            className="settings-input"
            type="password"
            value={newPw}
            onChange={e => { setNewPw(e.target.value); setPwErr(""); setPwOk(false); }}
            placeholder="Новый пароль (мин. 6)"
            onKeyDown={e => e.key === "Enter" && savePw()}
          />
          {pwErr && <p className="settings-err">{pwErr}</p>}
          {pwOk && <p className="settings-ok">Пароль изменён ✓</p>}
          <div className="settings-form-btns">
            <button className="settings-save-btn" onClick={savePw} disabled={pwBusy}>
              {pwBusy ? "..." : <><Check size={14} /> Сохранить</>}
            </button>
            <button className="settings-cancel-btn" onClick={() => setPanel(null)}><X size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main app shell (authenticated) ----
function AppShell() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<UserState | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings) return;
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettings]);

  const loadState = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getState();
      if (!data.exists) {
        setOnboarding(true);
        setLoading(false);
        return;
      }
      const userState: UserState = {
        balances: data.balances!,
        game: { ...data.game!, xpHistory: data.game!.xpHistory ?? [] },
        history: (data.history ?? []).filter(
          h => h.type === "active" || h.type === "base" || h.type === "bonus"
        ) as UserState["history"],
      };
      setState(userState);
    } catch {
      // silent retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  async function handleOnboardingComplete(capital: number) {
    try {
      await api.initAccount(capital);
    } catch (err: any) {
      if (err?.status === 401) {
        await logout();
        return;
      }
      throw err;
    }
    setOnboarding(false);
    await loadState();
  }

  function handleStateChange(next: UserState) { setState(next); }

  if (loading) {
    return (
      <div className="bank-app">
        <div className="bank-loading">
          <span className="bank-loading-icon">🌳</span>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (onboarding) {
    return (
      <div className="bank-app">
        <OnboardingPage onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="bank-app">
        <div className="bank-loading">
          <p>Ошибка загрузки. Попробуйте обновить страницу.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bank-app">
      <div className="status-bar" />
      <header className="bank-header">
        <div className="bank-header-inner">
          <div className="bank-logo">
            <span className="bank-logo-icon">🌳</span>
            <span className="bank-logo-text">{APP_NAME}</span>
          </div>
          <div className="bank-header-right">
            <div className="bank-header-badge">Бета {APP_VERSION}</div>
            {user && (
              <div className="settings-wrap" ref={settingsRef}>
                <button
                  className={`bank-header-signout${showSettings ? " bank-header-signout-active" : ""}`}
                  onClick={() => setShowSettings(s => !s)}
                  title="Настройки"
                >
                  <Settings size={16} />
                </button>
                <AnimatePresence>
                  {showSettings && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      <SettingsWidget onClose={() => setShowSettings(false)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="bank-main bank-main-full">
        <GamePage
          state={state}
          onStateChange={handleStateChange}
          notif={false}
          onClearNotif={() => {}}
        />
      </main>

      {state && (
        <DebugPanel
          state={state}
          onStateChange={handleStateChange}
          onResetAccount={() => {
            setState(null); setOnboarding(true);
          }}
          onSignOut={logout}
        />
      )}
    </div>
  );
}

// ---- Root ----
function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="bank-app">
        <div className="bank-loading">
          <span className="bank-loading-icon">🌳</span>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;
  return <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  );
}
