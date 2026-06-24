import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { DEFAULT_CAPITAL, formatCapital, calcStandardDaily } from "@/lib/engine";

interface Props {
  onComplete: (capital: number) => Promise<void>;
}

export default function OnboardingPage({ onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const isSubmitting = useRef(false);

  const half = DEFAULT_CAPITAL / 2;
  const dailyStd = calcStandardDaily(half);
  const dailyAct = half * 0.15 / 365;

  async function handleStart() {
    if (loading) return;
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setError(null);
    setLoading(true);
    try {
      await onComplete(DEFAULT_CAPITAL);
    } catch (e: unknown) {
      console.error("Account creation failed:", e);
      setError("Ошибка создания счёта. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-header">
        <span className="onboarding-icon">🌱</span>
        <h1 className="onboarding-title">Открыть учебный счёт</h1>
        <p className="onboarding-sub">Капитал делится поровну между стандартным и активным вкладами</p>
      </div>

      <div className="onboarding-info">
        <button className="onboarding-info-toggle" onClick={() => setInfoOpen(v => !v)}>
          <span>Как это работает?</span>
          <motion.span
            animate={{ rotate: infoOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: "flex" }}
          >
            <ChevronDown size={16} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {infoOpen && (
            <motion.div
              key="info-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <p className="onboarding-info-text">
                Вкладывать ничего не нужно — это учебный счёт. Дерево растёт вместе с активным доходом.
              </p>
              <div className="onboarding-rates">
                <span className="onboarding-rate-badge">Стандартный вклад — <strong>12%</strong> годовых</span>
                <span className="onboarding-rate-badge">Активный вклад — <strong>15%</strong> годовых</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="onboarding-single-card">
        <div className="onboarding-single-amount">{formatCapital(DEFAULT_CAPITAL)}</div>
        <div className="onboarding-single-split">50 000 ₽ стандартный + 50 000 ₽ активный</div>
        <div className="onboarding-single-stats">
          <div className="capital-stat">
            <p className="capital-stat-label">В день (стан.)</p>
            <p className="capital-stat-value">до {dailyStd.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽</p>
          </div>
          <div className="capital-stat">
            <p className="capital-stat-label">В день (акт.)</p>
            <p className="capital-stat-value">до {dailyAct.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽</p>
          </div>
        </div>
      </div>

      {error && <p style={{ color: "red", textAlign: "center", fontSize: 14, marginBottom: 8 }}>{error}</p>}

      <motion.button
        className="onboarding-start-btn"
        onClick={handleStart}
        disabled={loading}
        whileTap={{ scale: 0.97 }}
      >
        {loading ? "Создание счёта..." : "Открыть счёт"}
      </motion.button>
    </div>
  );
}
