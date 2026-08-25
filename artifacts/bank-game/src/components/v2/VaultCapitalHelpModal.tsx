/**
 * Help modal: capital → energy wait table + where capital sits.
 * Same shell / row style as «Стадии роста дерева».
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { formatVaultAmount } from "@/components/VaultWidget";
import {
  formatEnergyWaitMinutes,
  VAULT_CAPITAL_CURVE_MARKS,
} from "@/lib/vaultCapitalCurve";

type TabId = "time" | "elements";

type Props = {
  onClose: () => void;
  /** Capital still in the vault (safe). */
  vaultBalance?: number;
  /** Capital already on the tree chest. */
  treeCapital?: number;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "time", label: "Время" },
  { id: "elements", label: "Элементы" },
];

function VaultMiniIcon() {
  return (
    <svg width="44" height="36" viewBox="7.5 11.5 41 33.3" fill="none" aria-hidden="true">
      <path
        d="M14 12H42Q48 12 48 18V40Q48 44 46.2 44.2H9.8Q8 44 8 40V18Q8 12 14 12Z"
        fill="rgba(255,248,236,0.92)"
      />
      <rect
        x="12"
        y="16"
        width="32"
        height="26"
        rx="4"
        fill="rgba(201,146,10,0.42)"
        stroke="#c9920a"
        strokeWidth="1.05"
      />
      <circle
        cx="28"
        cy="29"
        r="7.5"
        fill="rgba(255,248,236,0.92)"
        stroke="#c9920a"
        strokeWidth="1.05"
      />
      <circle cx="28" cy="29" r="2.2" fill="#c9920a" />
    </svg>
  );
}

function TreeChestMiniIcon() {
  return (
    <svg width="36" height="40" viewBox="0 0 80 90" fill="none" aria-hidden="true">
      <path
        d="M6 5 C2 5 2 22 8 42 C14 58 28 66 33 70 C28 74 14 82 8 98 C2 118 2 135 6 135 L74 135 C78 135 78 118 72 98 C66 82 52 74 47 70 C52 66 66 58 72 42 C78 22 78 5 74 5 Z"
        fill="#fff8ec"
        stroke="#c9920a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function VaultCapitalHelpModal({
  onClose,
  vaultBalance = 0,
  treeCapital = 0,
}: Props) {
  const [tab, setTab] = useState<TabId>("time");
  const vault = Math.max(0, Number(vaultBalance) || 0);
  const tree = Math.max(0, Number(treeCapital) || 0);

  return (
    <motion.div
      className="help-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      data-vault-capital-help="true"
    >
      <motion.div
        className="help-modal vault-capital-help-modal"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-capital-help-title"
      >
        <div className="help-modal-header">
          <h3 className="help-modal-title" id="vault-capital-help-title">
            Сейф
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

        <div
          className="vault-capital-help-tabs"
          role="tablist"
          aria-label="Разделы справки"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`vault-capital-help-tab-${t.id}`}
              aria-controls={`vault-capital-help-panel-${t.id}`}
              aria-selected={tab === t.id}
              className={`vault-capital-help-tab${
                tab === t.id ? " vault-capital-help-tab--active" : ""
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="vault-capital-help-panels">
          <div
            role="tabpanel"
            id="vault-capital-help-panel-time"
            aria-labelledby="vault-capital-help-tab-time"
            aria-hidden={tab !== "time"}
            className={`vault-capital-help-panel${
              tab !== "time" ? " vault-capital-help-panel--inactive" : ""
            }`}
          >
            <div className="tree-stages-list">
              {VAULT_CAPITAL_CURVE_MARKS.map((m) => (
                <div key={m.capital} className="tree-stage-row">
                  <div className="tree-stage-info">
                    <p className="tree-stage-name">{m.label}</p>
                    <p className="tree-stage-range">{"Капитал в\u00A0элементе"}</p>
                  </div>
                  <span className="tree-stage-badge">
                    {formatEnergyWaitMinutes(m.capital)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            role="tabpanel"
            id="vault-capital-help-panel-elements"
            aria-labelledby="vault-capital-help-tab-elements"
            aria-hidden={tab !== "elements"}
            className={`vault-capital-help-panel${
              tab !== "elements" ? " vault-capital-help-panel--inactive" : ""
            }`}
          >
            <p className="flask-help-lead">
              {"Капитал, лежащий в\u00A0элементах, значительно ускоряет получение энергии."}
            </p>
            <div className="tree-stages-list flask-help-list">
              <div className="tree-stage-row flask-help-row">
                <span className="vault-capital-help-art" aria-hidden="true">
                  <VaultMiniIcon />
                </span>
                <div className="tree-stage-info flask-help-copy">
                  <div className="flask-help-head">
                    <p className="tree-stage-name">Сейф</p>
                    <span className="tree-stage-badge">
                      {formatVaultAmount(vault)}
                    </span>
                  </div>
                  <p className="tree-stage-range flask-help-body">
                    {"Капитал ещё не\u00A0в\u00A0игре — энергия копится базовым временем."}
                  </p>
                </div>
              </div>
              <div
                className={`tree-stage-row flask-help-row${
                  tree > 0 ? " tree-stage-row-current" : ""
                }`}
              >
                <span className="vault-capital-help-art" aria-hidden="true">
                  <TreeChestMiniIcon />
                </span>
                <div className="tree-stage-info flask-help-copy">
                  <div className="flask-help-head">
                    <p className="tree-stage-name">Сундук дерева</p>
                    <span className="tree-stage-badge">
                      {formatVaultAmount(tree)}
                    </span>
                  </div>
                  <p className="tree-stage-range flask-help-body">
                    {"Капитал в\u00A0элементе — ускоряет колбу и\u00A0доход."}
                  </p>
                </div>
              </div>
              <div className="tree-stage-row flask-help-row tree-stage-row-done">
                <span className="vault-capital-help-art vault-capital-help-art--soon" aria-hidden="true">
                  ···
                </span>
                <div className="tree-stage-info flask-help-copy">
                  <div className="flask-help-head">
                    <p className="tree-stage-name">Новые элементы</p>
                    <span className="tree-stage-badge tree-stage-badge-done">
                      скоро
                    </span>
                  </div>
                  <p className="tree-stage-range flask-help-body">
                    Скоро появятся другие места, куда можно вложить капитал.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
