/**
 * Help modal: gold flask = main income, grey flask = excess backlog.
 * Same shell as «Стадии роста дерева» (help-modal + row list).
 */

import { motion } from "framer-motion";
import { X } from "lucide-react";
import FlaskHelpMiniArt from "@/components/v2/FlaskHelpMiniArt";

type Props = {
  onClose: () => void;
};

const ROWS = [
  {
    tone: "gold" as const,
    title: "Золотая колба",
    badge: "Основной доход",
    body: "Пока таймер тикает, ваш капитал работает. Это обычный доход дерева — за энергию корней и уход.",
  },
  {
    tone: "grey" as const,
    title: "Серая колба",
    badge: "В запасе",
    body: "Если активности не успеваете отработать вовремя, доход не пропадает: он копится серым — заберите его Метелкой.",
  },
] as const;

export default function FlaskIncomeHelpModal({ onClose }: Props) {
  return (
    <motion.div
      className="help-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      data-flask-income-help="true"
    >
      <motion.div
        className="help-modal"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flask-income-help-title"
      >
        <div className="help-modal-header">
          <h3 className="help-modal-title" id="flask-income-help-title">
            Колба дохода
          </h3>
          <button
            type="button"
            className="help-modal-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <p className="flask-help-lead">
          Два цвета колбы — два вида дохода с вашего капитала.
        </p>

        <div className="tree-stages-list flask-help-list">
          {ROWS.map((row) => (
            <div
              key={row.tone}
              className={`tree-stage-row flask-help-row flask-help-row--${row.tone}`}
            >
              <FlaskHelpMiniArt
                tone={row.tone}
                fill={row.tone === "gold" ? 0.62 : 0.48}
                label={row.tone === "gold" ? "12:00" : "11:40"}
              />
              <div className="tree-stage-info">
                <p className="tree-stage-name">{row.title}</p>
                <p className="tree-stage-range flask-help-body">{row.body}</p>
              </div>
              <span
                className={`tree-stage-badge${
                  row.tone === "grey" ? " flask-help-badge--grey" : ""
                }`}
              >
                {row.badge}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
