import {
  UserState,
  formatRub,
  SESSIONS_PER_DAY,
} from "@/lib/engine";
import { Zap, ChevronRight } from "lucide-react";

interface Props {
  state: UserState;
  onTabChange: (tab: "active") => void;
}

export default function SavingsPage({ state, onTabChange }: Props) {
  const { active, activeEarned } = state.balances;

  const activeAnnual = active * 0.15;
  const dailyMax = active * 0.15 / 365;
  const sessionMax = dailyMax / SESSIONS_PER_DAY;

  return (
    <div className="savings-page">
      <h2 className="page-title">Мои вклады</h2>

      <div className="deposit-card deposit-card-green" onClick={() => onTabChange("active")}>
        <div className="deposit-header">
          <div className="deposit-icon-wrap deposit-icon-green">
            <Zap size={20} />
          </div>
          <div>
            <p className="deposit-name">Активный вклад</p>
            <span className="deposit-badge deposit-badge-green">до 15,0% годовых</span>
          </div>
          <ChevronRight size={18} className="deposit-trend" />
        </div>

        <div className="deposit-balance-row">
          <div>
            <p className="deposit-balance-label">Баланс</p>
            <p className="deposit-balance">{formatRub(active)}</p>
          </div>
          <div className="text-right">
            <p className="deposit-balance-label">Заработано</p>
            <p className="deposit-earned deposit-earned-green">+{formatRub(activeEarned)}</p>
          </div>
        </div>

        <div className="deposit-divider" />

        <div className="deposit-stats">
          <div className="deposit-stat">
            <p className="deposit-stat-label">Макс. доход/год</p>
            <p className="deposit-stat-value">{formatRub(activeAnnual)}</p>
          </div>
          <div className="deposit-stat">
            <p className="deposit-stat-label">В день</p>
            <p className="deposit-stat-value">до {formatRub(dailyMax)}</p>
          </div>
          <div className="deposit-stat">
            <p className="deposit-stat-label">За сессию</p>
            <p className="deposit-stat-value">до {formatRub(sessionMax)}</p>
          </div>
        </div>

        <div className="deposit-info-box deposit-info-box-green">
          <p>Доход начисляется за сессии каждые 8 часов. Результат зависит от активности.</p>
        </div>
      </div>
    </div>
  );
}
