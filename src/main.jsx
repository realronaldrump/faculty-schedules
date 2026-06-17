import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import Login from "./components/Login.jsx";
import "./index.css";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import { AppConfigProvider } from "./contexts/AppConfigContext.jsx";
import { DataProvider } from "./contexts/DataContext.jsx";
import { UIProvider } from "./contexts/UIContext.jsx";
import { TutorialProvider } from "./contexts/TutorialContext.jsx";

import { PeopleProvider } from "./contexts/PeopleContext.jsx";
import { ScheduleProvider } from "./contexts/ScheduleContext.jsx";

const STALE_ASSET_RELOAD_KEY = "faculty-schedules:stale-asset-reload-at";
const STALE_ASSET_RELOAD_INTERVAL_MS = 30 * 1000;

const getLastStaleAssetReloadAt = () => {
  try {
    return Number(window.sessionStorage.getItem(STALE_ASSET_RELOAD_KEY) || 0);
  } catch {
    return 0;
  }
};

const markStaleAssetReload = () => {
  try {
    window.sessionStorage.setItem(STALE_ASSET_RELOAD_KEY, String(Date.now()));
  } catch {
    // If sessionStorage is unavailable, still reload once for the fresh assets.
  }
};

const clearStaleAssetReload = () => {
  try {
    window.sessionStorage.removeItem(STALE_ASSET_RELOAD_KEY);
  } catch {
    // Ignore storage failures.
  }
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();

  const lastReloadAt = getLastStaleAssetReloadAt();
  if (
    !Number.isFinite(lastReloadAt) ||
    Date.now() - lastReloadAt > STALE_ASSET_RELOAD_INTERVAL_MS
  ) {
    markStaleAssetReload();
    window.location.reload();
    return;
  }

  console.error("Failed to load updated application assets.", event.payload);
});

window.addEventListener("load", clearStaleAssetReload, { once: true });

const AuthLoadingState = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="loading-shimmer w-16 h-16 rounded-full mx-auto mb-4" />
      <p className="text-gray-600">Loading account...</p>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoadingState />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <AppConfigProvider>
      <UIProvider>
        <TutorialProvider>
          <PeopleProvider>
            <ScheduleProvider>
              <DataProvider>
                <App />
              </DataProvider>
            </ScheduleProvider>
          </PeopleProvider>
        </TutorialProvider>
      </UIProvider>
    </AppConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
