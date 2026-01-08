import React from 'react'
import { Analytics } from "@vercel/analytics/react";
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { DataProvider } from './contexts/DataContext.jsx'
import { UIProvider } from './contexts/UIContext.jsx'
import { TutorialProvider } from './contexts/TutorialContext.jsx'

import { PeopleProvider } from './contexts/PeopleContext.jsx'
import { ScheduleProvider } from './contexts/ScheduleContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)