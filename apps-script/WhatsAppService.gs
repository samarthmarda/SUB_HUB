/**
 * SUBSCRIPTION HUB — WhatsAppService.gs
 * WhatsApp Click-to-Chat integration. Builds wa.me URLs from editable templates.
 * Never sends automatically — the owner reviews and sends manually, then marks it
 * sent in the app. Clicking a WhatsApp action is recorded separately from "sent".
 */

var DEFAULT_WHATSAPP_TEMPLATES = {
  whatsapp_template_7day:
    'Hi {{customer_name}},\n\nYour subscription for our stock market calls group is due for renewal on {{expiry_date}}.\n\nPlease plan your renewal to continue receiving our market updates.\n\nThank you.',
  whatsapp_template_3day:
    'Hi {{customer_name}},\n\nJust a reminder that your subscription expires on {{expiry_date}}.\n\nPlease complete your renewal to continue receiving our market updates.\n\nThank you.',
  whatsapp_template_expiryday:
    'Hi {{customer_name}},\n\nYour subscription expires today.\n\nPlease renew to continue receiving our market updates.\n\nThank you.',
  whatsapp_template_expired:
    'Hi {{customer_name}},\n\nYour subscription expired on {{expiry_date}}.\n\nPlease contact us for renewal if you would like to continue receiving our updates.\n\nThank you.',
  whatsapp_template_manual:
    'Hi {{customer_name}},\n\nThis is a friendly reminder about your subscription (renews/expires on {{expiry_date}}).\n\nThank you.',
};

var REMINDER_TYPE_TO_SETTING = {
  '7day': 'whatsapp_template_7day',
  '3day': 'whatsapp_template_3day',
  'expiryday': 'whatsapp_template_expiryday',
  'expired': 'whatsapp_template_expired',
  'manual': 'whatsapp_template_manual',
};

/** Pure: render {{variable}} placeholders in a template. */
function renderTemplate_(template, vars) {
  vars = vars || {};
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (_, key) {
    var v = vars[key];
    return (v === undefined || v === null) ? '' : String(v);
  });
}

/** Pure: build a wa.me Click-to-Chat URL (plus sign and non-digits stripped). */
function buildWhatsAppUrl_(phone, message) {
  var digits = phoneForWhatsApp_(phone);
  if (!digits) return '';
  var text = String(message || '');
  return 'https://wa.me/' + digits + (text ? ('?text=' + encodeURIComponent(text)) : '');
}

/** Resolve the template text for a reminder type (settings override, with defaults). */
function getWhatsAppTemplate_(type) {
  var key = REMINDER_TYPE_TO_SETTING[type] || 'whatsapp_template_manual';
  var tpl = getSettingCached_(key);
  if (!tpl) tpl = DEFAULT_WHATSAPP_TEMPLATES[key];
  return tpl || DEFAULT_WHATSAPP_TEMPLATES.whatsapp_template_manual;
}

function composeWhatsAppVars_(customerName, expiryISO, phone) {
  return {
    customer_name: customerName || 'there',
    expiry_date: formatDisplayDate_(expiryISO),
    business_name: getSettingCached_('business_name') || 'SUBSCRIPTION HUB',
    phone: phone || '',
  };
}

/**
 * Compose a Click-to-Chat URL for a reminder. Returns { url, phone, message, type }.
 * Does NOT open or send anything.
 */
function composeReminderWhatsApp_(token, reminderId) {
  requireSession_(token);
  var rem = findById_('ReminderLogs', 'reminder_id', reminderId);
  if (!rem) throw new HubError_('NOT_FOUND', 'Reminder not found.');
  var customer = findById_('Customers', 'customer_id', rem.customer_id);
  if (!customer) throw new HubError_('NOT_FOUND', 'Customer not found.');
  var sub = findById_('Subscriptions', 'subscription_id', rem.subscription_id);
  var expiry = sub ? sub.expiry_date : '';
  var type = String(rem.reminder_type || 'manual');
  var message = renderTemplate_(getWhatsAppTemplate_(type), composeWhatsAppVars_(customer.full_name, expiry, customer.phone_e164));
  return {
    url: buildWhatsAppUrl_(customer.phone_e164, message),
    phone: customer.phone_e164,
    phone_digits: phoneForWhatsApp_(customer.phone_e164),
    message: message,
    type: type,
    reminder_id: reminderId,
  };
}

/**
 * Compose a Click-to-Chat URL for a customer (uses current/latest subscription).
 * If type omitted, chooses a template based on days to expiry.
 */
function composeCustomerWhatsApp_(token, customerId, type) {
  requireSession_(token);
  var customer = findById_('Customers', 'customer_id', customerId);
  if (!customer) throw new HubError_('NOT_FOUND', 'Customer not found.');
  var subs = getSubscriptionsForCustomer_(customerId);
  var current = selectCurrentSubscription_(subs);
  var expiry = current ? current.expiry_date : '';

  if (!type) {
    var days = current ? daysFromToday_(current.expiry_date) : null;
    if (days === null) type = 'manual';
    else if (days < 0) type = 'expired';
    else if (days === 0) type = 'expiryday';
    else if (days <= 3) type = '3day';
    else type = '7day';
  }
  var message = renderTemplate_(getWhatsAppTemplate_(type), composeWhatsAppVars_(customer.full_name, expiry, customer.phone_e164));
  return {
    url: buildWhatsAppUrl_(customer.phone_e164, message),
    phone: customer.phone_e164,
    phone_digits: phoneForWhatsApp_(customer.phone_e164),
    message: message,
    type: type,
    subscription_id: current ? current.subscription_id : '',
  };
}

/** Exposed templates for the Settings editor. */
function getWhatsAppTemplates_(token) {
  requireSession_(token);
  var out = {};
  Object.keys(REMINDER_TYPE_TO_SETTING).forEach(function (t) {
    out[t] = getWhatsAppTemplate_(t);
  });
  return out;
}
