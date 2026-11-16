// Modals context — lets any screen open the global modals (New Customer, Renew,
// Record Payment, Edit Customer) without prop-drilling.
import React, { createContext, useContext, useMemo, useState } from 'react';
import { NewCustomerModal, RenewModal, RecordPaymentModal, EditCustomerModal } from './modals';

const Ctx = createContext(null);

export function ModalsProvider({ children }) {
  const [state, setState] = useState({ type: null, payload: {} });
  const value = useMemo(() => ({
    openNewCustomer: () => setState({ type: 'newCustomer', payload: {} }),
    openRenew: (customerId, subscriptionId) => setState({ type: 'renew', payload: { customerId, subscriptionId } }),
    openPayment: (customerId, subscriptionId) => setState({ type: 'payment', payload: { customerId, subscriptionId } }),
    openEditCustomer: (customerId) => setState({ type: 'editCustomer', payload: { customerId } }),
  }), []);
  const close = () => setState({ type: null, payload: {} });
  const p = state.payload;
  return (
    <Ctx.Provider value={value}>
      {children}
      <NewCustomerModal open={state.type === 'newCustomer'} onClose={close} />
      <RenewModal open={state.type === 'renew'} onClose={close} customerId={p.customerId} subscriptionId={p.subscriptionId} />
      <RecordPaymentModal open={state.type === 'payment'} onClose={close} customerId={p.customerId} subscriptionId={p.subscriptionId} />
      <EditCustomerModal open={state.type === 'editCustomer'} onClose={close} customerId={p.customerId} />
    </Ctx.Provider>
  );
}

export function useModals() { return useContext(Ctx); }
