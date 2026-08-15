import { useEffect, useCallback, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UserState } from "@/lib/engine";
import { emptyV2CareState, normalizeV2Care } from "@/lib/economyV2CareClient";
import { emptyV2RootsState, normalizeV2Roots } from "@/lib/v2Roots";
import {
  normalizeEconomyV3AutoTransfer,
  normalizeEconomyV3RootsSnapshot,
} from "@/lib/v3Roots";
import { isEconomyV3GameCycleEnabled } from "@/lib/v3GameCycle";
import { normalizeV2Excess } from "@/components/v2/EconomyV2EnergyDebugControls";
import { clearTutorialWaitClock } from "@/lib/tutorialWaitClock";
import { clearTutorialCompensationClock } from "@/lib/tutorialCompensationClock";
import TreeSVG from "@/components/TreeSVG";
import GamePage from "@/pages/GamePage";
import OnboardingPage from "@/pages/OnboardingPage";
import AuthPage from "@/pages/AuthPage";
import LandingPage from "@/pages/LandingPage";
import "@/bank.css";

// Локальные расширения (файлы исключены из репозитория)
import.meta.glob("/src/local/*.tsx", { eager: true });

// ---- Main app shell (authenticated) ----
function AppShell() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<UserState | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  const loadState = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getState();
      if (!data.exists) {
        // Account wipe / first run — drop F5-persisted wait deadline from the
        // previous life so the new ~12:00 capsule does not resume at 10:xx.
        clearTutorialWaitClock();
        clearTutorialCompensationClock();
        setOnboarding(true);
        setLoading(false);
        return;
      }
      const history = (data.history ?? []) as UserState["history"];
      const v3Roots = normalizeEconomyV3RootsSnapshot(data.game!.v3Roots);
      const useV3 = isEconomyV3GameCycleEnabled(v3Roots);

      const userState: UserState = {
      balances: {
        ...data.balances!,
        vaultBalance: data.balances?.vaultBalance ?? 0,
      },
      game: {
        ...(data.game! as UserState["game"]),
        xpHistory: data.game!.xpHistory ?? [],
        tutorialDone: data.game!.tutorialDone ?? true,
        sproutPlanted:
          data.game!.sproutPlanted === true ||
          data.game!.tutorialDone === true,
        // v3 exclusive: do not hydrate v2 Care / bank / roots into the live cycle.
        v2EnergySeconds: useV3 ? 0 : (data.game!.v2EnergySeconds ?? 0),
        v2EnergyAnchorAt: useV3 ? null : (data.game!.v2EnergyAnchorAt ?? null),
        v2Care: useV3 ? emptyV2CareState() : normalizeV2Care(data.game!.v2Care),
        v2Roots: useV3 ? emptyV2RootsState() : normalizeV2Roots(data.game!.v2Roots),
        v2Excess: normalizeV2Excess(data.game!.v2Excess),
        v3Roots,
        v3AutoTransfer: normalizeEconomyV3AutoTransfer(
          data.game!.v3AutoTransfer,
        ),
      },
      history,
      incomeByPreset: data.incomeByPreset ?? [],
    };
    if (!useV3 && userState.game.v2Care?.inProgress) {
      // v2 Care UI is gated by v2Care.* — do not force v1 sessionInProgress.
      userState.game.water = userState.game.v2Care.completed.water;
      userState.game.sun = userState.game.v2Care.completed.sun;
      userState.game.fertilizer = userState.game.v2Care.completed.fertilizer;
    }
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
      clearTutorialWaitClock();
      clearTutorialCompensationClock();
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
          <span className="bank-loading-icon" aria-hidden="true">
            <TreeSVG stage={0} size={110} />
          </span>
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
      <main className="bank-main bank-main-full">
        <GamePage
          state={state}
          onStateChange={handleStateChange}
          notif={false}
          onClearNotif={() => {}}
          onResetAccount={() => { setState(null); setOnboarding(true); }}
        />
      </main>
    </div>
  );
}

// ---- Root ----
type Screen = "landing" | "login" | "register";

function Root() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>("landing");
  const hasResetToken =
    Boolean(new URLSearchParams(window.location.search).get("token"));

  if (loading) {
    return (
      <div className="bank-app">
        <div className="bank-loading">
          <span className="bank-loading-icon" aria-hidden="true">
            <TreeSVG stage={0} size={110} />
          </span>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (!hasResetToken && screen === "landing") {
      return (
        <LandingPage
          onLogin={() => setScreen("login")}
          onRegister={() => setScreen("register")}
        />
      );
    }
    return (
      <div className="bank-app">
        <AuthPage
          initialMode={screen === "landing" ? "login" : screen}
          onBack={hasResetToken ? undefined : () => setScreen("landing")}
        />
      </div>
    );
  }

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
