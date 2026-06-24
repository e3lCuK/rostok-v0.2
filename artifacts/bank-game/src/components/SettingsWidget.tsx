import { useState } from "react";
import { Mail, Lock, Check, X, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

type SettingsPanel = "email" | "password" | null;

export default function SettingsWidget({ onClose }: { onClose: () => void }) {
  const { logout, updateEmail, changePassword } = useAuth();
  const [panel, setPanel] = useState<SettingsPanel>(null);

  const [emailVal, setEmailVal] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [emailOk, setEmailOk] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const [newPw, setNewPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwOk, setPwOk] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  function close() {
    setPanel(null);
    setEmailVal(""); setEmailErr(""); setEmailOk(false);
    setNewPw(""); setPwErr(""); setPwOk(false);
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
    if (pwBusy || !newPw) return;
    setPwBusy(true); setPwErr(""); setPwOk(false);
    try {
      await changePassword("", newPw);
      setPwOk(true);
      setNewPw("");
    } catch (e: any) { setPwErr(e.message ?? "Ошибка"); }
    finally { setPwBusy(false); }
  }

  if (panel === "email") {
    return (
      <div className="settings-widget">
        <div className="settings-icon-row">
          <input
            className="settings-input"
            type="email"
            value={emailVal}
            onChange={e => { setEmailVal(e.target.value); setEmailErr(""); setEmailOk(false); }}
            placeholder="email@example.com"
            autoFocus
            onKeyDown={e => e.key === "Enter" && saveEmail()}
          />
          <button className="settings-save-sm" onClick={saveEmail} disabled={emailBusy} title="Сохранить">
            {emailBusy ? "…" : <Check size={12} />}
          </button>
          <button className="settings-save-sm settings-close-sm" onClick={close} title="Закрыть">
            <X size={12} />
          </button>
        </div>
        {emailErr && <p className="settings-err">{emailErr}</p>}
        {emailOk && <p className="settings-ok">Сохранено ✓</p>}
      </div>
    );
  }

  if (panel === "password") {
    return (
      <div className="settings-widget">
        <div className="settings-icon-row">
          <input
            className="settings-input"
            type="password"
            value={newPw}
            onChange={e => { setNewPw(e.target.value); setPwErr(""); setPwOk(false); }}
            placeholder="Новый пароль"
            autoFocus
            onKeyDown={e => e.key === "Enter" && savePw()}
          />
          <button className="settings-save-sm" onClick={savePw} disabled={pwBusy} title="Сохранить">
            {pwBusy ? "…" : <Check size={12} />}
          </button>
          <button className="settings-save-sm settings-close-sm" onClick={close} title="Закрыть">
            <X size={12} />
          </button>
        </div>
        {pwErr && <p className="settings-err">{pwErr}</p>}
        {pwOk && <p className="settings-ok">Сохранено ✓</p>}
      </div>
    );
  }

  return (
    <div className="settings-widget">
      <div className="settings-icon-row">
        <button className="settings-action-btn" onClick={() => setPanel("email")} title="Почта">
          <Mail size={14} />
        </button>
        <button className="settings-action-btn" onClick={() => setPanel("password")} title="Пароль">
          <Lock size={14} />
        </button>
        <button className="settings-action-btn settings-action-logout" onClick={() => logout()} title="Выйти">
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
