// WhatsApp Click-to-Chat button. Opens a window synchronously (to avoid popup
// blocking), then navigates it to the composed wa.me URL. Records the click
// separately from "manually marked sent". Never sends automatically.
import React, { useState } from 'react';
import { Button } from './ui';
import Icon from './Icon';
import { api } from '../api';

export function WhatsAppButton({ reminderId, customerId, type, label = 'WhatsApp', variant = 'wa', size = 'sm', showIcon = true, onOpened, disabled }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  async function open() {
    setBusy(true);
    // Open a blank window immediately to dodge popup blockers.
    let win = null;
    try { win = window.open('', '_blank'); } catch (e) { win = null; }
    try {
      const res = reminderId
        ? await api.composeReminderWhatsApp(reminderId)
        : await api.composeCustomerWhatsApp(customerId, type);
      if (res && res.url) {
        if (win) win.location = res.url;
        else window.open(res.url, '_blank');
      } else if (win) {
        win.close();
      }
      if (reminderId) {
        try { await api.logReminderClick(reminderId); } catch (e) { /* non-fatal */ }
      }
      setPreview(res);
      if (onOpened) onOpened(res);
    } catch (e) {
      if (win) win.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="wa-btn-wrap">
      <Button variant={variant} size={size} loading={busy} onClick={open} disabled={disabled}
        icon={showIcon ? <Icon name="chat" size={size === 'sm' ? 15 : 16} /> : undefined}>
        {label}
      </Button>
      {preview && preview.message && (
        <span className="wa-preview" title={preview.message}>
          <Icon name="send" size={13} /> — message ready
        </span>
      )}
    </span>
  );
}

export default WhatsAppButton;
