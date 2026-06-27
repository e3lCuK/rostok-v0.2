import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { api } from "@/lib/api";

export const SHOP_ITEMS = [
  { id: "sunflower", name: "Подсолнух", emoji: "🌻", desc: "Вырастет у левого куста", price: 30 },
  { id: "mushroom",  name: "Гриб",      emoji: "🍄", desc: "Поселится у правого куста", price: 50 },
  { id: "hedgehog",  name: "Ёжик",      emoji: "🦔", desc: "Пробежит к корням дерева",  price: 60 },
  { id: "rainbow",   name: "Радуга",    emoji: "🌈", desc: "Засияет в небе над деревом", price: 80 },
  { id: "fireflies", name: "Светлячки", emoji: "✨", desc: "Заиграют вокруг дерева",     price: 120 },
] as const;

export type ShopItemId = typeof SHOP_ITEMS[number]["id"];

interface Props {
  onClose: () => void;
  totalApples: number;
  purchasedItems: string[];
  onPurchase: (itemId: ShopItemId, newApples: number, newItems: string[]) => void;
}

export default function ShopModal({ onClose, totalApples, purchasedItems, onPurchase }: Props) {
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  async function handleBuy(itemId: ShopItemId, price: number) {
    if (buying || totalApples < price) return;
    setBuying(itemId);
    setError(null);
    try {
      const result = await api.buyShopItem(itemId);
      onPurchase(itemId, result.totalApples, result.purchasedItems);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка покупки");
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="help-overlay" onClick={onClose}>
      <motion.div
        className="help-modal ach-modal"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="help-modal-header">
          <h3 className="help-modal-title">🛒 Магазин</h3>
          <button className="help-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="ach-header-divider" />

        <div className="shop-balance-row">
          <span className="shop-balance-icon">🍎</span>
          <span className="shop-balance-count">{totalApples}</span>
          <span className="shop-balance-label">яблок</span>
        </div>

        {error && <p className="shop-error">{error}</p>}

        <div className="shop-items-list">
          {SHOP_ITEMS.map(item => {
            const owned  = purchasedItems.includes(item.id);
            const canBuy = !owned && totalApples >= item.price;
            return (
              <div key={item.id} className={`shop-item${owned ? " shop-item-owned" : ""}`}>
                <span className="shop-item-emoji">{item.emoji}</span>
                <div className="shop-item-info">
                  <span className="shop-item-name">{item.name}</span>
                  <span className="shop-item-desc">{item.desc}</span>
                </div>
                <div className="shop-item-action">
                  {owned ? (
                    <span className="shop-item-owned-label">В саду</span>
                  ) : (
                    <button
                      className="shop-buy-btn"
                      disabled={!canBuy || buying === item.id}
                      onClick={() => handleBuy(item.id, item.price)}
                    >
                      {buying === item.id ? "…" : `${item.price} 🍎`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
