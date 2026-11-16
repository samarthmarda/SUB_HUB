// SWR configuration + typed data hooks. SWR is the frontend cache only; Google
// Sheets remains the source of truth. Dashboard / renewals / reminders refresh
// ~every 60s while their screens are active; everything else revalidates on focus
// and reconnect. Caches are cleared on logout (see main.jsx).
import useSWR, { SWRConfig, mutate, useSWRConfig } from 'swr';
import { useCallback, useSyncExternalStore } from 'react';
import { api } from './api';

// --- "last synchronised" store --------------------------------------------
let lastSyncAt = null;
const syncSubs = new Set();
function setLastSync() {
  lastSyncAt = new Date().toISOString();
  syncSubs.forEach((cb) => cb(lastSyncAt));
}
function subscribeSync(cb) { syncSubs.add(cb); return () => syncSubs.delete(cb); }
function getSyncSnapshot() { return lastSyncAt; }
export function useLastSync() {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, () => null);
}

// --- Core resource hook ----------------------------------------------------
export function useResource(key, method, params, opts = {}) {
  const fetcher = useCallback(async () => {
    try {
      const data = await api[method](params);
      setLastSync();
      return data;
    } catch (e) {
      throw e;
    }
  }, [method, JSON.stringify(params)]);
  return useSWR(key, fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 3000,
    keepPreviousData: true,
    ...opts,
  });
}

// --- Typed hooks -----------------------------------------------------------
export function useDashboard(range = '30d') {
  return useResource(['dashboard', range], 'dashboard', range, { refreshInterval: 60000 });
}
export function useCustomers(params) {
  return useResource(['customers', JSON.stringify(params || {})], 'listCustomers', params || {});
}
export function useCustomerProfile(id) {
  return useResource(id ? ['customer', id] : null, 'customerProfile', id);
}
export function useSubscriptions(filters) {
  return useResource(['subscriptions', JSON.stringify(filters || {})], 'listSubscriptions', filters || {});
}
export function useRenewals(view = 'upcoming') {
  return useResource(['renewals', view], 'renewals', view, { refreshInterval: 60000 });
}
export function useCalendar(params) {
  return useResource(['calendar', JSON.stringify(params || {})], 'calendar', params || {});
}
export function useReminders(filters) {
  return useResource(['reminders', JSON.stringify(filters || {})], 'reminderQueue', filters || {}, { refreshInterval: 60000 });
}
export function usePayments(filters) {
  return useResource(['payments', JSON.stringify(filters || {})], 'listPayments', filters || {});
}
export function useSettings() {
  return useResource(['settings'], 'settings', undefined);
}
export function usePlans() {
  return useResource(['plans'], 'listPlans', undefined);
}
export function useReports(range = '30d') {
  return useResource(['reports', range], 'reports', range);
}
export function useTriggerStatus() {
  return useResource(['triggers'], 'triggerStatus', undefined);
}

// --- Cache invalidation after writes --------------------------------------
export function invalidate(...prefixes) {
  return mutate(
    (key) => Array.isArray(key) && prefixes.some((p) => key[0] === p),
    undefined,
    { revalidate: true }
  );
}

export async function invalidateAll() {
  await mutate(() => true, undefined, { revalidate: true });
}

export { SWRConfig, mutate, useSWRConfig };
