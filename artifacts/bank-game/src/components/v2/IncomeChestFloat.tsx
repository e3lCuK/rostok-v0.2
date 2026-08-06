import { useEffect, useRef } from "react";
import {
  formatIncomeChestFloatLabel,
  INCOME_CHEST_FLOAT_MS,
  type IncomeChestFeedback,
} from "@/lib/incomeChestFeedback";

type Props = {
  feedback: IncomeChestFeedback | null;
  onComplete: (id: string) => void;
};

/**
 * One-shot floating "+X,XX₽" above the capital chest.
 * Keyed by feedback.id so re-renders do not restart the animation.
 */
export default function IncomeChestFloat({ feedback, onComplete }: Props) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!feedback) return;
    const id = feedback.id;
    const t = window.setTimeout(
      () => onCompleteRef.current(id),
      INCOME_CHEST_FLOAT_MS,
    );
    return () => window.clearTimeout(t);
  }, [feedback?.id]);

  if (!feedback) return null;

  return (
    <span
      key={feedback.id}
      className="v2-income-chest-float"
      data-income-chest-float="true"
      data-income-chest-float-id={feedback.id}
      aria-hidden="true"
    >
      {formatIncomeChestFloatLabel(feedback.amount)}
    </span>
  );
}
