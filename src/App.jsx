// Root component: gates on authentication and wires the router + global modals.
import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ModalsProvider } from './components/ModalsContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerProfile from './pages/CustomerProfile';
import Subscriptions from './pages/Subscriptions';
import Plans from './pages/Plans';
import Renewals from './pages/Renewals';
import CalendarPage from './pages/Calendar';
import Reminders from './pages/Reminders';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { UNAUTHORIZED_EVENT, api } from './api';
import { isLoggedIn, clearSession } from './lib/session';
import { invalidateAll } from './swr';

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());

  // Global unauthorized handling (expired/invalid session).
  useEffect(() => {
    function onUnauth() {
      clearSession();
      invalidateAll();
      setAuthed(false);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauth);
  }, []);

  // Validate an existing token on load.
  useEffect(() => {
    if (isLoggedIn()) {
      api.getSession().catch(() => { clearSession(); setAuthed(false); });
    }
  }, []);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <ModalsProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerProfile />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/renewals" element={<Renewals />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ModalsProvider>
  );
}
