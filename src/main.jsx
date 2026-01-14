import React from "react";
import { Analytics } from "@vercel/analytics/react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { AppConfigProvider } from "./contexts/AppConfigContext.jsx";
import { DataProvider } from "./contexts/DataContext.jsx";
import { UIProvider } from "./contexts/UIContext.jsx";
import { TutorialProvider } from "./contexts/TutorialContext.jsx";

import { PeopleProvider } from "./contexts/PeopleContext.jsx";
import { ScheduleProvider } from "./contexts/ScheduleContext.jsx";
import { PostHogProvider } from "posthog-js/react";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host:
          import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        defaults: "2025-05-24",
        capture_pageview: "history_change",
        capture_exceptions: true,
        persistence: "localStorage+cookie",
        debug: import.meta.env.MODE === "development",
        loaded: (posthog) => {
          posthog.register({ environment: import.meta.env.MODE });
        },
      }}
    >
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AppConfigProvider>
            <UIProvider>
              <TutorialProvider>
                <PeopleProvider>
                  <ScheduleProvider>
                    <DataProvider>
                      <App />
                      <Analytics />
                    </DataProvider>
                  </ScheduleProvider>
                </PeopleProvider>
              </TutorialProvider>
            </UIProvider>
          </AppConfigProvider>
        </AuthProvider>
      </BrowserRouter>
    </PostHogProvider>
  </React.StrictMode>,
);
