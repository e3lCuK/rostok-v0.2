import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { DEFAULT_CAPITAL, formatCapital } from "@/lib/engine";

interface Props {
  onComplete: (capital: number) => Promise<void>;
}

export default function OnboardingPage({ onComplete }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = useRef(false);

  const dailyAct = DEFAULT_CAPITAL * 0.15 / 365;
  const isSelected = selected === DEFAULT_CAPITAL;

  async function handleStart() {
    if (selected === null) return;
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
      <div className="onboarding-center">
        <div className="onboarding-header">
          <span className="onboarding-icon">🌳</span>
          <div>
            <h1 className="onboarding-title">Открыть демо-счёт</h1>
            <p className="onboarding-tagline">Растите капитал играючи</p>
          </div>
        </div>

        <p className="onboarding-info-text">
          Вкладывать ничего не нужно — это демо-счёт. Играйте в мини-игры каждые 8 часов, чтобы получать доход и растить дерево.
        </p>

        <span className="onboarding-rate-badge">Активный вклад до <strong>15%</strong> годовых</span>

        <div className="onboarding-options">
          <motion.button
            className={`capital-option${isSelected ? " capital-option-selected" : ""}`}
            onClick={() => setSelected(DEFAULT_CAPITAL)}
            whileTap={{ scale: 0.97 }}
          >
            <div className="capital-option-header">
              <p className="capital-option-amount">{formatCapital(DEFAULT_CAPITAL)}</p>
              <div className={`capital-option-radio${isSelected ? " capital-option-radio-active" : ""}`} />
            </div>
            <p className="capital-option-inline-stat">В день &nbsp;<span className="capital-stat-value">до {dailyAct.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽</span></p>
          </motion.button>
        </div>

        {error && <p style={{ color: "red", textAlign: "center", fontSize: 14 }}>{error}</p>}

        <motion.button
          className={`onboarding-start-btn${selected === null ? " onboarding-start-btn-disabled" : ""}`}
          onClick={handleStart}
          disabled={selected === null || loading}
          whileTap={selected !== null ? { scale: 0.97 } : {}}
        >
          {loading ? "Создание счёта..." : "Открыть счёт"}
        </motion.button>
      </div>
    </div>
  );
}
