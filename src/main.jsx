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
