import { useEffect, useCallback, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UserState } from "@/lib/engine";
import GamePage from "@/pages/GamePage";
import OnboardingPage from "@/pages/OnboardingPage";
import AuthPage from "@/pages/AuthPage";
import "@/bank.css";

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
        setOnboarding(true);
        setLoading(false);
        return;
      }
      const userState: UserState = {
        balances: data.balances!,
        game: { ...data.game!, xpHistory: data.game!.xpHistory ?? [], tutorialDone: data.game!.tutorialDone ?? true },
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

  if (!user) return (
    <div className="bank-app">
      <AuthPage />
    </div>
  );
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
