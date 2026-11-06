'use strict';
const $ = (selector) => document.querySelector(selector);
const money = (centavos) => new Intl.NumberFormat('en-PH', {style: 'currency', currency: 'PHP'}).format(centavos / 100);
function cents(value) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a peso amount with at most two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount > 100000000) throw new Error('Amount exceeds the allowed limit.');
  return amount;
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function api(path, body) {
  const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST',
    headers: {'Content-Type': 'application/json', 'X-CSRF-Token': $('meta[name=csrf-token]').content},
    body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json().catch(() => ({error: 'Unexpected server response. Keep the saved checkout and retry.'}));
  if (!response.ok) { const error = new Error(data.error || 'Request failed.'); error.status = response.status; throw error; }
  return data;
}
function notice(message, success = false) {
  const target = $('#notice') || $('#receipt-notice');
  if (!target) return;
  target.textContent = message; target.hidden = false; target.classList.toggle('success', success);
}
function handle(action) { return async (event) => { event?.preventDefault(); try { await action(event); } catch (error) { notice(error.message); } }; }

if ($('#print')) $('#print').onclick = () => window.print();
if ($('#action-form')) $('#action-form').onsubmit = handle(async () => {
  const kind = $('#action-kind').value;
  if (!window.confirm(`Record ${kind} for this sale? This action is permanent.`)) return;
  await api(`/api/sales/${$('.receipt').dataset.saleId}/action`, {kind, reason: $('#action-reason').value, reference: $('#action-reference').value});
  location.reload();
});

if ($('#cashier-app')) {
  const user = document.body.dataset.user;
  const key = `rose-sale:${document.body.dataset.installation}:${user}`;
  let products = [], cart = [], shift = null, pending = null, category = 'All', busy = false, storageReady = true;
  let device = '';
  function save() {
    try { localStorage.setItem(key, JSON.stringify({cart, pending, device})); }
    catch { storageReady = false; throw new Error('Browser storage is unavailable. Checkout is blocked to protect retry recovery. Enable local storage first.'); }
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // LAN HTTP may lack randomUUID; getRandomValues remains available.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '{}');
    cart = stored.cart || []; pending = stored.pending || null;
    device = stored.device || `Desk-${uuid().slice(0, 8)}`;
    save();
  } catch (error) { storageReady = false; notice(`Recovery storage needs attention: ${error.message}. Do not clear browser data if a sale may be awaiting retry.`); }
  if (pending) {
    const option = document.querySelector(`input[name=method][value="${pending.method === 'gcash' ? 'gcash' : 'cash'}"]`);
    option.checked = true;
    $('#received').value = (pending.received / 100).toFixed(2);
  }
  let localLock = false;
  // A second tab for the same cashier must not overwrite an uncertain submission.
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(key) : null;
  if (channel) {
    channel.onmessage = event => { if (event.data === 'changed') { localLock = true; notice('This cashier is active in another tab. Reload this tab before continuing.'); renderCart(); } };
  }
  function storeChange() { save(); channel?.postMessage('changed'); }
  function total() { return cart.reduce((sum, item) => sum + item.price * item.quantity, 0); }
  function method() { return $('input[name=method]:checked').value; }
  function renderCatalog() {
    const categories = ['All', ...new Set(products.filter(p => p.active).map(p => p.category))];
    $('#categories').replaceChildren(...categories.map(name => {
      const button = el('button', name, name === category ? 'selected' : '');
      button.setAttribute('aria-pressed', String(name === category));
      button.onclick = () => { category = name; renderCatalog(); }; return button;
    }));
    const query = $('#search').value.toLowerCase();
    const matches = products.filter(p => p.active && (category === 'All' || p.category === category) && `${p.name} ${p.sku}`.toLowerCase().includes(query));
    $('#products').replaceChildren(...matches.map(product => {
      const button = el('button', undefined, 'product'); button.dataset.category = product.category;
      button.setAttribute('aria-label', `Add ${product.name}, ${money(product.price)}`);
      button.append(el('span', product.sku, 'sku'), el('strong', product.name), el('span', money(product.price), 'price'));
      button.disabled = Boolean(pending || busy || localLock);
      button.onclick = handle(async () => {
        const line = cart.find(item => item.id === product.id);
        if (line && line.revision !== product.revision) throw new Error('This cart has an older price. Clear the cart and review current prices.');
        if (line) { if (line.quantity >= 999) throw new Error('Maximum 999 per item.'); line.quantity++; }
        else cart.push({...product, quantity: 1});
        $('#notice').hidden = true;
        storeChange(); renderCart();
      }); return button;
    }));
    if (!matches.length) $('#products').append(el('p', 'No matching products. Try another search or ask an administrator to add products.', 'muted'));
    if ($('#admin-products')) renderAdmin();
  }
  function renderCart() {
    const locked = Boolean(pending || busy || localLock);
    $('#cart').replaceChildren(...cart.map(item => {
      const line = el('div', undefined, 'cart-line');
      const heading = el('div', undefined, 'cart-line-heading');
      heading.append(el('strong', item.name), el('span', money(item.price * item.quantity)));
      const controls = el('div', undefined, 'quantity');
      for (const [label, delta] of [['−', -1], ['+', 1]]) {
        const button = el('button', label); button.disabled = locked;
        button.setAttribute('aria-label', `${delta < 0 ? 'Decrease' : 'Increase'} ${item.name}`);
        button.onclick = handle(async () => { item.quantity = Math.max(1, Math.min(999, item.quantity + delta)); storeChange(); renderCart(); });
        controls.append(button);
        if (delta < 0) {
          const input = el('input'); input.type = 'number'; input.min = 1; input.max = 999; input.value = item.quantity; input.disabled = locked; input.setAttribute('aria-label', `Quantity of ${item.name}`);
          input.onchange = handle(async () => { const qty = Number(input.value); if (!Number.isInteger(qty) || qty < 1 || qty > 999) { input.value = item.quantity; throw new Error('Quantity must be 1 to 999.'); } item.quantity = qty; storeChange(); renderCart(); });
          controls.append(input);
        }
      }
      const remove = el('button', 'Remove', 'remove subtle'); remove.disabled = locked;
      remove.setAttribute('aria-label', `Remove ${item.name}`);
      remove.onclick = handle(async () => { cart = cart.filter(p => p.id !== item.id); storeChange(); renderCart(); });
      controls.append(remove); line.append(heading, controls); return line;
    }));
    if (!cart.length) $('#cart').append(el('p', 'Your cart is ready.\nChoose a product to start a sale.', 'empty'));
    $('#total').textContent = money(total());
    let received = 0; try { received = cents($('#received').value || '0'); } catch { /* Label remains useful during entry. */ }
    $('#change').textContent = received >= total() ? money(received - total()) : `Short ${money(total() - received)}`;
    $('#cash-fields').hidden = method() !== 'cash'; $('#gcash-note').hidden = method() !== 'gcash';
    $('#clear').disabled = locked; $('#exact').disabled = locked; $('#received').disabled = locked;
    $('#payment-options').disabled = locked;
    $('#checkout').disabled = busy || localLock || !storageReady || (!pending && (!cart.length || !shift));
    $('#checkout').textContent = busy ? 'Saving sale…' : pending ? 'Retry saved checkout' : 'Complete sale';
    $('#checkout-note').textContent = pending ? `Awaiting confirmation: ${pending.transaction_id}. Keep this browser data and retry. Editing is locked.` : 'Receipt is issued after the server saves the sale.';
    $('#shift-indicator').textContent = shift ? `Student ID ${document.body.dataset.studentId}` : 'Open a shift in the Shift tab to begin.';
    document.querySelectorAll('.product').forEach(button => { button.disabled = locked; });
  }
  async function load() {
    [products, shift] = await Promise.all([api('/api/catalog'), api('/api/shift')]);
    $('#connection').textContent = 'Server connected'; renderCatalog(); renderCart(); await renderShift();
  }
  $('#search').oninput = renderCatalog;
  document.querySelectorAll('input[name=method]').forEach(input => { input.onchange = renderCart; });
  $('#received').oninput = renderCart;
  $('#exact').onclick = () => { $('#received').value = (total() / 100).toFixed(2); renderCart(); };
  $('#clear').onclick = handle(async () => { if (cart.length && confirm('Clear all items from this cart?')) { cart = []; storeChange(); renderCart(); } });
  $('#checkout').onclick = handle(async () => {
    if (busy || localLock) return;
    if (!pending) {
      if (!shift || !cart.length) throw new Error('Open a shift and add a product.');
      const received = method() === 'cash' ? cents($('#received').value) : 0;
      if (method() === 'cash' && received < total()) throw new Error('Cash received is less than the total.');
      pending = {transaction_id: uuid(), device: shift.device, shift_id: shift.id, client_at: new Date().toISOString(),
        items: cart.map(item => ({product_id: item.id, revision: item.revision, quantity: item.quantity})), method: method(), received};
      storeChange(); // Persist UUID and exact payload before the first network request.
    }
    busy = true; renderCart();
    try {
      const result = await api('/api/sales', pending);
      pending = null; cart = []; storeChange();
      $('#received').value = ''; $('#notice').hidden = true; $('#discard').hidden = true;
      $('#success-text').textContent = `${result.receipt} · ${money(result.total)} · ${result.payment.status.replaceAll('_', ' ')}${result.payment.method === 'cash' ? ` · Change ${money(result.payment.change_due)}` : ''}`;
      $('#receipt-link').href = `/receipt/${result.id}`; $('#success-dialog').showModal();
    } catch (error) {
      notice(`${error.message} Your submitted checkout is saved in this browser.`);
      // Only a definitive rejection can be discarded through the UI.
      $('#discard').hidden = ![400, 409].includes(error.status);
      $('#connection').textContent = error.status ? 'Checkout needs attention' : 'Server unreachable · retry saved checkout';
    } finally { busy = false; renderCart(); }
  });
  $('#discard').onclick = handle(async () => {
    const matches = await api(`/api/sales?q=${encodeURIComponent(pending.transaction_id)}`);
    if (matches.length) { window.open(`/receipt/${matches[0].id}`, '_blank', 'noopener'); throw new Error('A sale with this UUID exists. Use its receipt and retry the original saved checkout.'); }
    if (!confirm('The server rejected this checkout and no matching sale was found. Release the rejected checkout and reload current prices? Your cart will be cleared.')) return;
    pending = null; cart = []; storeChange(); $('#discard').hidden = true; await load(); notice('Rejected checkout released. Review products and start again.');
  });
  $('#next-sale').onclick = () => { $('#success-dialog').close(); $('#search').focus(); };
  document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = handle(async () => {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b === button));
    for (const name of ['sale', 'history', 'shift', 'admin']) { const target = $(`#${name}-tab`); if (target) target.hidden = name !== button.dataset.tab; }
    if (button.dataset.tab === 'history') await history();
    if (button.dataset.tab === 'shift') await renderShift();
    if (button.dataset.tab === 'admin') { products = await api('/api/catalog'); renderAdmin(); }
  }); });
  async function history() {
    const rows = await api(`/api/sales?q=${encodeURIComponent($('#history-query').value)}`);
    $('#history-rows').replaceChildren(...rows.map(sale => {
      const row = el('tr'); const cell = el('td'); const link = el('a', sale.receipt); link.href = `/receipt/${sale.id}`; link.target = '_blank'; link.rel = 'noopener'; cell.append(link); row.append(cell);
      for (const value of [new Date(sale.created_at).toLocaleString(), sale.cashier, money(sale.total), `${sale.method} · ${sale.payment_status.replaceAll('_', ' ')}`, sale.status]) row.append(el('td', value));
      return row;
    }));
    if (!rows.length) { const row = el('tr'); const cell = el('td', 'No matching transactions.'); cell.colSpan = 6; row.append(cell); $('#history-rows').append(row); }
  }
  $('#history-search').onsubmit = handle(history);
  async function renderShift() {
    $('#open-shift').hidden = Boolean(shift); $('#close-shift').hidden = !shift;
    $('#close-shift button').disabled = Boolean(pending || busy || localLock);
    if (!shift) return;
    const result = await api(`/api/shifts/${shift.id}`);
    const grid = el('div', undefined, 'summary-grid');
    const labels = {cash: 'Cash sales (net)', gcash: 'Verified GCash (net)', pending: 'Pending GCash', refunds: 'Full refunds', voids: 'Voided sales', expected_cash: 'Expected drawer cash'};
    for (const [key, label] of Object.entries(labels)) { const cell = el('div', label); cell.append(el('strong', money(result.totals[key]))); grid.append(cell); }
    $('#shift-summary').replaceChildren(el('p', `Shift ${shift.id} opened ${new Date(shift.opened_at).toLocaleString()}`), grid);
  }
  $('#open-shift').onsubmit = handle(async () => {
    if (pending || localLock) throw new Error('Resolve the saved checkout first.');
    storeChange(); await api('/api/shifts', {device}); await load(); notice('Shift opened. Ready for sales.', true);
  });
  $('#close-shift').onsubmit = handle(async () => {
    if (pending || busy || localLock) throw new Error('Resolve the saved checkout before closing.');
    if (!confirm('Close this shift after counting the drawer?')) return;
    const result = await api(`/api/shifts/${shift.id}/close`, {closing_cash: cents($('#closing-cash').value)});
    shift = null; renderCart(); $('#open-shift').hidden = false; $('#close-shift').hidden = true;
    notice(`Shift ${result.shift.id} closed. Expected ${money(result.totals.expected_cash)}; counted ${money(result.shift.closing_cash)}.`, true);
  });
  function renderAdmin() {
    $('#admin-products').replaceChildren(...products.map(product => {
      const row = el('tr'); for (const value of [product.sku, product.name, product.category, money(product.price), product.active ? 'Active' : 'Inactive']) row.append(el('td', value));
      const cell = el('td'); const button = el('button', 'Edit'); button.setAttribute('aria-label', `Edit ${product.name}`);
      button.onclick = () => { $('#product-id').value = product.id; $('#product-sku').value = product.sku; $('#product-name').value = product.name; $('#product-category').value = product.category; $('#product-price').value = (product.price / 100).toFixed(2); $('#product-active').checked = Boolean(product.active); $('#product-name').focus(); };
      cell.append(button); row.append(cell); return row;
    }));
  }
  if ($('#product-form')) {
    $('#product-form').onsubmit = handle(async () => {
      await api('/api/products', {id: $('#product-id').value ? Number($('#product-id').value) : null, sku: $('#product-sku').value, name: $('#product-name').value, category: $('#product-category').value, price: cents($('#product-price').value), active: $('#product-active').checked});
      $('#product-form').reset(); $('#product-id').value = ''; await load(); notice('Product saved. Current prices are available for new checkouts.', true);
    });
    $('#reset-product').onclick = () => { $('#product-form').reset(); $('#product-id').value = ''; };
  }
  window.addEventListener('offline', () => { $('#connection').textContent = 'Network offline · keep this tab open'; });
  window.addEventListener('online', () => { $('#connection').textContent = 'Network restored · retry saved checkout'; });
  window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
  handle(load)();
}