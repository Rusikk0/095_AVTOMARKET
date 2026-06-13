/**
 * Слой данных: кэш в памяти + синхронизация с Supabase
 */
(function (global) {
  'use strict';

  var cache = {
    products: [],
    categories: [],
    sales: [],
    expenses: [],
    shifts: [],
    customers: [],
    loyaltyCards: [],
    members: [],
    writeOffs: [],
    audits: [],
    returns: [],
    debts: [],
    debtors: [],
    deferred: [],
    documents: [],
    documentItems: []
  };

  var storeId = null;
  var syncing = false;
  var syncQueue = Promise.resolve();
  var DAILY_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

  // ─── Оффлайн-очередь ───
  var offlineQueue = [];
  var isOnline = true;

  function loadOfflineQueue() {
    var id = sid();
    if (!id) return;
    try {
      var raw = localStorage.getItem('ap_offline_queue_' + id);
      if (raw) offlineQueue = JSON.parse(raw);
    } catch (e) { offlineQueue = []; }
  }

  function saveOfflineQueue() {
    var id = sid();
    if (!id) return;
    try {
      if (offlineQueue.length) {
        localStorage.setItem('ap_offline_queue_' + id, JSON.stringify(offlineQueue));
      } else {
        localStorage.removeItem('ap_offline_queue_' + id);
      }
    } catch (e) {}
  }

  function pushToQueue(op) {
    offlineQueue.push({ ts: Date.now(), op: op });
    saveOfflineQueue();
    updateOnlineUI();
  }

  function lastSyncKey() {
    var id = sid();
    return id ? 'ap_last_sync_' + id : null;
  }

  function backupStorageKey() {
    var id = sid();
    return id ? 'ap_daily_backup_' + id : null;
  }

  function deletedDocumentsKey() {
    var id = sid();
    return id ? 'ap_deleted_documents_' + id : null;
  }

  function getDeletedDocumentIds() {
    var key = deletedDocumentsKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function rememberDeletedDocument(docId) {
    var key = deletedDocumentsKey();
    if (!key || !docId) return;
    var ids = getDeletedDocumentIds();
    if (ids.indexOf(docId) === -1) ids.push(docId);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
  }

  function forgetDeletedDocument(docId) {
    var key = deletedDocumentsKey();
    if (!key || !docId) return;
    var ids = getDeletedDocumentIds().filter(function (id) { return id !== docId; });
    try {
      if (ids.length) localStorage.setItem(key, JSON.stringify(ids));
      else localStorage.removeItem(key);
    } catch (e) {}
  }

  function isDocumentDeleted(docId) {
    return getDeletedDocumentIds().indexOf(docId) !== -1;
  }

  function deletedDeferredKey() {
    var s = sid();
    return s ? 'ap_deleted_deferred_' + s : null;
  }

  function getDeletedDeferredIds() {
    var key = deletedDeferredKey();
    if (!key) return [];
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }

  function rememberDeletedDeferred(id) {
    var key = deletedDeferredKey();
    if (!key || !id) return;
    var ids = getDeletedDeferredIds();
    if (ids.indexOf(id) === -1) ids.push(id);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
  }

  function isDeferredDeleted(id) {
    return getDeletedDeferredIds().indexOf(id) !== -1;
  }

  function deletedDebtsKey() {
    var s = sid(); return s ? 'ap_deleted_debts_' + s : null;
  }
  function getDeletedDebtIds() {
    var key = deletedDebtsKey(); if (!key) return [];
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function rememberDeletedDebt(id) {
    var key = deletedDebtsKey(); if (!key || !id) return;
    var ids = getDeletedDebtIds();
    if (ids.indexOf(id) === -1) ids.push(id);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
  }
  function isDebtDeleted(id) { return getDeletedDebtIds().indexOf(id) !== -1; }

  function deletedDebtorsKey() {
    var s = sid(); return s ? 'ap_deleted_debtors_' + s : null;
  }
  function getDeletedDebtorIds() {
    var key = deletedDebtorsKey(); if (!key) return [];
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function rememberDeletedDebtor(id) {
    var key = deletedDebtorsKey(); if (!key || !id) return;
    var ids = getDeletedDebtorIds();
    if (ids.indexOf(id) === -1) ids.push(id);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
  }
  function isDebtorDeleted(id) { return getDeletedDebtorIds().indexOf(id) !== -1; }

  function saveLastSync(ts) {
    var key = lastSyncKey();
    if (!key) return;
    try { localStorage.setItem(key, String(ts)); } catch (e) {}
  }

  function loadLastSync() {
    var key = lastSyncKey();
    if (!key) return null;
    try {
      var raw = localStorage.getItem(key);
      return raw ? Number(raw) || null : null;
    } catch (e) { return null; }
  }

  function saveDailyBackup(payload) {
    var key = backupStorageKey();
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
  }

  function getDailyBackup() {
    var key = backupStorageKey();
    if (!key) return null;
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function buildDailyBackupPayload() {
    var store = global.ApAuth && global.ApAuth.getCurrentStore();
    if (!store) return null;
    return {
      format: 'autozapchasti-backup-v1',
      exportedAt: new Date().toISOString(),
      storeId: store.storeId,
      storeName: store.storeName,
      data: {
        products: cache.products,
        categories: cache.categories,
        sales: cache.sales,
        expenses: cache.expenses,
        shifts: cache.shifts,
        customers: cache.customers,
        debtors: cache.debtors,
        debts: cache.debts,
        deferred: cache.deferred,
        documents: cache.documents,
        documentItems: cache.documentItems
      }
    };
  }

  function maybeSaveDailyBackup() {
    var payload = buildDailyBackupPayload();
    if (!payload) return;
    var current = getDailyBackup();
    if (current && current.exportedAt) {
      var last = new Date(current.exportedAt).getTime();
      if (Date.now() - last < DAILY_SYNC_INTERVAL_MS) return;
    }
    saveDailyBackup(payload);
  }

  async function maybeDailyRefresh() {
    if (!isOnline) return;
    var last = loadLastSync();
    if (!last || Date.now() - last >= DAILY_SYNC_INTERVAL_MS) {
      try {
        await refresh();
      } catch (e) {
        console.warn('[ApDb] daily refresh failed:', e.message || e);
      }
    }
  }

  function scheduleDailySync() {
    if (typeof window === 'undefined') return;
    if (window._apDailySyncTimer) clearInterval(window._apDailySyncTimer);
    window._apDailySyncTimer = setInterval(function () {
      if (!isOnline) return;
      processOfflineQueue();
      maybeDailyRefresh();
    }, DAILY_SYNC_INTERVAL_MS);
  }

  function updateOnlineUI() {
    var el = document.getElementById('online-status');
    if (!el) return;
    var pending = offlineQueue.length;
    if (!isOnline) {
      el.className = 'online-status offline';
      el.innerHTML = '🔴 Оффлайн' + (pending ? ' (' + pending + ')' : '');
    } else if (pending > 0) {
      el.className = 'online-status syncing';
      el.innerHTML = '🔄 Синхронизация (' + pending + ')';
    } else {
      el.className = 'online-status online';
      el.innerHTML = '🟢 Онлайн';
    }
    // Also update offline banner
    if (global.updateOfflineBanner) global.updateOfflineBanner();
  }

  async function processOfflineQueue() {
    if (!isOnline || !offlineQueue.length || syncing) return;
    syncing = true;
    updateOnlineUI();
    var c = sb();
    var id = sid();
    if (!c || !id) { syncing = false; return; }

    var succeeded = [];
    for (var i = 0; i < offlineQueue.length; i++) {
      var item = offlineQueue[i];
      try {
        await replayOp(c, id, item.op);
        succeeded.push(i);
      } catch (err) {
        console.error('[ApDb] Queue replay error:', err);
        break;
      }
    }

    for (var j = succeeded.length - 1; j >= 0; j--) {
      offlineQueue.splice(succeeded[j], 1);
    }
    saveOfflineQueue();
    syncing = false;
    updateOnlineUI();

    if (!offlineQueue.length) {
      try { await loadAll(); } catch (e) {}
    }
  }

  async function replayOp(c, storeId, op) {
    switch (op.type) {
      case 'createSale': await replayCreateSale(c, storeId, op.payload); break;
      case 'upsertProduct': await replayUpsertProduct(c, storeId, op.payload); break;
      case 'deleteProduct': await c.from('products').delete().eq('id', op.payload.id); break;
      case 'createWriteOff': await replayCreateWriteOff(c, storeId, op.payload); break;
      case 'createAudit': await replayCreateAudit(c, storeId, op.payload); break;
      case 'createReturn': await replayCreateReturn(c, storeId, op.payload); break;
      case 'deleteDeferred': await c.from('deferred_items').delete().eq('id', op.payload.id); break;
      case 'deleteDebt': await c.from('debts').delete().eq('id', op.payload.id); break;
      case 'deleteDebtor': await c.from('debtors').delete().eq('id', op.payload.id); break;
      case 'deleteDocument':
        var itemDel = await c.from('document_items').delete().eq('document_id', op.payload.id);
        if (itemDel.error) throw itemDel.error;
        var docDel = await c.from('documents').delete().eq('id', op.payload.id);
        if (docDel.error) throw docDel.error;
        break;
    }
  }

  async function replayCreateSale(c, storeId, payload) {
    var header = {
      id: payload.receiptId, store_id: storeId, shift_id: payload.shiftId,
      customer_id: payload.customerId || null, user_id: payload.userId || null,
      user_name: payload.userName || '', payment: payload.payment,
      total: payload.total, cash_amount: payload.cashAmount || 0,
      kaspi_amount: payload.kaspiAmount || 0, transfer_amount: payload.transferAmount || 0, discount_amount: payload.discountAmount || 0,
      bonus_spend: payload.bonusSpend || 0, earned_bonus: payload.earnedBonus || 0,
      status: 'completed', sale_date: payload.date
    };
    var h = await c.from('sales').upsert(header, { onConflict: 'id' });
    if (h.error) throw h.error;
    var items = payload.items.map(function (it) {
      return { id: it.id, store_id: storeId, sale_id: payload.receiptId,
        product_id: it.productId, product_code: it.productCode, product_name: it.productName,
        quantity: it.quantity, unit_price: it.unitPrice, purchase_price: it.purchasePrice, line_total: it.lineTotal };
    });
    var ins = await c.from('sale_items').upsert(items, { onConflict: 'id' });
    if (ins.error) throw ins.error;
    for (var p = 0; p < payload.productUpdates.length; p++) {
      var pu = payload.productUpdates[p];
      await c.from('products').update({ quantity: pu.quantity, updated_at: new Date().toISOString() }).eq('id', pu.id);
    }
    if (payload.customerUpdate) {
      await c.from('customers').upsert(customerToRow(payload.customerUpdate, storeId), { onConflict: 'id' });
    }
  }

  async function replayUpsertProduct(c, storeId, product) {
    var row = productToRow(product, storeId);
    var res = await c.from('products').upsert(row, { onConflict: 'id' });
    if (res.error) throw res.error;
  }

  async function replayCreateWriteOff(c, storeId, payload) {
    var row = { store_id: storeId, product_id: payload.productId || null,
      product_code: payload.productCode, product_name: payload.productName,
      quantity: payload.quantity, reason: payload.reason, note: payload.note || '', user_name: payload.userName };
    var res = await c.from('write_offs').insert(row);
    if (res.error) throw res.error;
    if (payload.productId) {
      var p = cache.products.find(function (x) { return x.id === payload.productId; });
      if (p) {
        var newQty = Math.max(0, p.quantity - payload.quantity);
        await c.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', p.id);
      }
    }
  }

  async function replayCreateAudit(c, storeId, payload) {
    var row = { store_id: storeId, user_name: payload.userName, items: payload.items };
    var res = await c.from('audits').insert(row);
    if (res.error) throw res.error;
    for (var i = 0; i < payload.items.length; i++) {
      var item = payload.items[i];
      if (item.productId) {
        await c.from('products').update({ quantity: item.qtyFact, updated_at: new Date().toISOString() }).eq('id', item.productId);
      }
    }
  }

  async function replayCreateReturn(c, storeId, payload) {
    for (var i = 0; i < payload.items.length; i++) {
      var it = payload.items[i];
      var retRow = { store_id: storeId, sale_id: payload.saleId, product_id: it.productId,
        product_code: it.productCode, product_name: it.productName,
        quantity: it.quantity, refund_amount: it.refundAmount, user_name: payload.userName };
      var rIns = await c.from('returns').insert(retRow);
      if (rIns.error) throw rIns.error;
      if (it.productId) {
        var p = cache.products.find(function (x) { return x.id === it.productId; });
        if (p) {
          var newQty = p.quantity + it.quantity;
          await c.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', it.productId);
        }
      }
    }
    if (payload.customerId && payload.totalRefund > 0) {
      var cust = cache.customers.find(function (x) { return x.id === payload.customerId; });
      if (cust) {
        var newSpent = Math.max(0, (Number(cust.spent) || 0) - payload.totalRefund);
        var newBonus = Math.max(0, (Number(cust.bonusBalance) || 0) - Math.round(payload.totalRefund * 0.01));
        await c.from('customers').update({ spent: newSpent, bonus_balance: newBonus, updated_at: new Date().toISOString() }).eq('id', payload.customerId);
      }
    }
    var expRow = { store_id: storeId, category: 'Возврат', amount: payload.totalRefund,
      note: 'Возврат по чеку № ' + payload.saleId.slice(-6), user_name: payload.userName,
      expense_date: new Date().toISOString(), status: 'active' };
    await c.from('expenses').insert(expRow);
  }

  // ─── Online/Offline detection ───
  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () {
      isOnline = true;
      updateOnlineUI();
      if (global.toast) global.toast('Интернет восстановлен. Синхронизация...', 'ok');
      if (global.updateOfflineBanner) global.updateOfflineBanner();
      processOfflineQueue();
    });
    window.addEventListener('offline', function () {
      isOnline = false;
      updateOnlineUI();
      if (global.toast) global.toast('Нет интернета. Данные сохраняются локально.', 'err');
      if (global.updateOfflineBanner) global.updateOfflineBanner();
    });
    isOnline = navigator.onLine !== false;
  }

  function sb() {
    return global.ApAuth && global.ApAuth.client();
  }

  function sid() {
    var m = global.ApAuth && global.ApAuth.getCurrentStore();
    return m ? m.storeId : storeId;
  }

  function setStoreId(id) {
    storeId = id;
  }

  // ─── Маппинг DB ↔ приложение ───

  function productFromRow(r) {
    return {
      id: r.id,
      code: r.code,
      barcode: r.barcode || '',
      name: r.name,
      category: r.category_id || '',
      quantity: Number(r.quantity) || 0,
      purchasePrice: Number(r.purchase_price) || 0,
      price: Number(r.price) || 0,
      minStock: Number(r.min_stock) || 5,
      info: r.info || '',
      compatibility: r.compatibility || ''
    };
  }

  function productToRow(p, sId) {
    return {
      id: p.id || undefined,
      store_id: sId,
      code: p.code,
      barcode: p.barcode || '',
      name: p.name,
      category_id: p.category || null,
      quantity: p.quantity,
      purchase_price: p.purchasePrice || 0,
      price: p.price,
      min_stock: p.minStock || 5,
      info: p.info || '',
      compatibility: p.compatibility || '',
      updated_at: new Date().toISOString()
    };
  }

  function categoryFromRow(r) {
    return { id: r.id, name: r.name };
  }

  function customerFromRow(r) {
    return {
      id: r.id,
      phone: r.phone,
      name: r.name,
      spent: Number(r.spent) || 0,
      bonusBalance: Number(r.bonus_balance) || 0
    };
  }

  function customerToRow(c, sId) {
    return {
      id: c.id || undefined,
      store_id: sId,
      phone: c.phone,
      name: c.name,
      spent: c.spent || 0,
      bonus_balance: c.bonusBalance || 0,
      updated_at: new Date().toISOString()
    };
  }

  function shiftFromRow(r) {
    return {
      id: r.id,
      cashierId: r.cashier_user_id,
      cashierUsername: r.cashier_email || '',
      cashierName: r.cashier_name,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      status: r.status,
      openedBy: r.opened_by_name,
      closedBy: r.closed_by_name,
      totals: r.totals
    };
  }

  function expenseFromRow(r) {
    return {
      id: r.id,
      category: r.category,
      amount: Number(r.amount),
      note: r.note || '',
      userName: r.user_name,
      date: r.expense_date,
      status: r.status,
      cancelledAt: r.cancelled_at,
      cancelledBy: r.cancelled_by
    };
  }

  /** Плоский формат строк продажи (как в legacy localStorage) */
  function flattenSales(salesRows, itemsRows) {
    var out = [];
    (itemsRows || []).forEach(function (it) {
      var header = (salesRows || []).find(function (s) { return s.id === it.sale_id; });
      if (!header) return;
      out.push({
        id: it.id,
        receiptId: header.id,
        shiftId: header.shift_id,
        productId: it.product_id,
        productCode: it.product_code,
        productName: it.product_name,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        purchasePrice: Number(it.purchase_price),
        total: Number(it.line_total),
        payment: header.payment,
        cashAmount: Number(header.cash_amount) || 0,
        kaspiAmount: Number(header.kaspi_amount) || 0,
        transferAmount: Number(header.transfer_amount) || 0,
        customerId: header.customer_id,
        userName: header.user_name,
        username: '',
        date: header.sale_date,
        status: header.status,
        cancelledAt: header.cancelled_at,
        cancelledBy: header.cancelled_by
      });
    });
    return out;
  }

  function memberToUser(m, profile) {
    return {
      id: m.user_id,
      username: (profile && profile.email) ? profile.email.split('@')[0] : m.user_id.slice(0, 8),
      email: profile && profile.email,
      name: m.display_name || (profile && profile.display_name) || 'Сотрудник',
      role: m.role,
      active: m.active !== false,
      memberId: m.id
    };
  }

  function writeOffFromRow(r) {
    return {
      id: r.id,
      productId: r.product_id,
      productCode: r.product_code,
      productName: r.product_name,
      quantity: Number(r.quantity) || 0,
      reason: r.reason || '',
      note: r.note || '',
      userName: r.user_name || '',
      date: r.created_at
    };
  }

  function auditFromRow(r) {
    return {
      id: r.id,
      userName: r.user_name || '',
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
      date: r.created_at
    };
  }

  function returnFromRow(r) {
    return {
      id: r.id,
      saleId: r.sale_id,
      productId: r.product_id,
      productCode: r.product_code,
      productName: r.product_name,
      quantity: Number(r.quantity) || 0,
      refundAmount: Number(r.refund_amount) || 0,
      userName: r.user_name || '',
      date: r.created_at
    };
  }

  function debtorFromRow(r) {
    return { id: r.id, name: r.name, phone: r.phone || '', rating: r.rating || 'good' };
  }

  function debtorToRow(d, sId) {
    return { id: d.id || undefined, store_id: sId, name: d.name, phone: d.phone || '', rating: d.rating || 'good', updated_at: new Date().toISOString() };
  }

  function debtFromRow(r) {
    return {
      id: r.id, debtorId: r.debtor_id, debtorName: '',
      productCode: r.product_code || '', productName: r.product_name,
      quantity: Number(r.quantity) || 1, amount: Number(r.amount) || 0,
      cashierName: r.cashier_name || '', dueDate: r.due_date || null,
      status: r.status || 'open', note: r.note || '', date: r.created_at
    };
  }

  function debtToRow(d, sId) {
    return {
      id: d.id || undefined, store_id: sId, debtor_id: d.debtorId,
      product_code: d.productCode || '', product_name: d.productName,
      quantity: d.quantity || 1, amount: d.amount,
      cashier_name: d.cashierName || '', due_date: d.dueDate || null,
      status: d.status || 'open', note: d.note || '', updated_at: new Date().toISOString()
    };
  }

  function deferredFromRow(r) {
    var item = {
      productId: r.product_id || null, productCode: r.product_code || '',
      productName: r.product_name || '', quantity: Number(r.quantity) || 1,
      unitPrice: Number(r.unit_price) || 0, total: Number(r.total) || 0
    };
    return {
      id: r.id, customerName: r.customer_name || '', customerPhone: r.customer_phone || '',
      items: [item], total: Number(r.total) || 0, quantity: Number(r.quantity) || 1,
      cashierName: r.cashier_name || '', status: r.status || 'pending',
      note: r.note || '', date: r.created_at, completedAt: r.completed_at || null
    };
  }

  function deferredToRow(d, sId) {
    var items = d.items || [{ productId: d.productId, productCode: d.productCode, productName: d.productName, quantity: d.quantity, unitPrice: d.unitPrice, total: d.total }];
    return items.map(function (item, idx) {
      return {
        id: item.id || (d.id + '_' + idx) || undefined, store_id: sId,
        customer_name: d.customerName || '', customer_phone: d.customerPhone || '',
        product_id: item.productId || null, product_code: item.productCode || '',
        product_name: item.productName || '', quantity: item.quantity || 1,
        unit_price: item.unitPrice || 0, total: item.total || 0,
        cashier_name: d.cashierName || '', status: d.status || 'pending',
        note: d.note || '', updated_at: new Date().toISOString(),
        completed_at: d.completedAt || null
      };
    });
  }

  function documentFromRow(r) {
    return {
      id: r.id,
      storeId: r.store_id,
      docType: r.doc_type,
      type: r.doc_type,
      docNumber: r.doc_number,
      status: r.status,
      customerName: r.customer_name || '',
      customerPhone: r.customer_phone || '',
      total: Number(r.total) || 0,
      createdBy: r.created_by || null,
      createdByName: r.created_by_name || '',
      documentDate: r.document_date,
      meta: r.meta || {},
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      items: []
    };
  }

  function documentToRow(doc, sId) {
    return {
      id: doc.id || undefined, store_id: sId,
      doc_type: doc.docType || doc.type || '',
      doc_number: doc.docNumber || undefined,
      status: doc.status || 'pending',
      customer_name: doc.customerName || '',
      customer_phone: doc.customerPhone || '',
      total: doc.total || 0,
      created_by: doc.createdBy || null,
      created_by_name: doc.createdByName || '',
      document_date: doc.documentDate || new Date().toISOString(),
      meta: doc.meta || {},
      updated_at: new Date().toISOString()
    };
  }

  function documentItemFromRow(r) {
    return {
      id: r.id,
      documentId: r.document_id,
      storeId: r.store_id,
      productId: r.product_id || null,
      productCode: r.product_code || '',
      productName: r.product_name || '',
      unit: r.unit || 'шт',
      quantity: Number(r.quantity) || 1,
      unitPrice: Number(r.unit_price) || 0,
      total: Number(r.total) || 0,
      createdAt: r.created_at
    };
  }

  function documentItemToRow(item, sId) {
    return {
      id: item.id || undefined,
      store_id: sId,
      document_id: item.documentId,
      product_id: item.productId || null,
      product_code: item.productCode || '',
      product_name: item.productName || '',
      unit: item.unit || 'шт',
      quantity: item.quantity || 1,
      unit_price: item.unitPrice || 0,
      total: item.total || 0,
      created_at: new Date().toISOString()
    };
  }

  // ─── Загрузка из Supabase ───

  async function loadAll() {
    var c = sb();
    var id = sid();
    if (!c || !id) return;

    var q = await Promise.all([
      c.from('products').select('*').eq('store_id', id),
      c.from('categories').select('*').eq('store_id', id).order('name'),
      c.from('customers').select('*').eq('store_id', id),
      c.from('shifts').select('*').eq('store_id', id).order('opened_at', { ascending: false }),
      c.from('expenses').select('*').eq('store_id', id).order('expense_date', { ascending: false }),
      c.from('sales').select('*').eq('store_id', id).order('sale_date', { ascending: false }),
      c.from('sale_items').select('*').eq('store_id', id),
      c.from('store_members').select('id, user_id, role, display_name, active').eq('store_id', id),
      c.from('loyalty_cards').select('*').eq('store_id', id),
      c.from('write_offs').select('*').eq('store_id', id).order('created_at', { ascending: false }),
      c.from('audits').select('*').eq('store_id', id).order('created_at', { ascending: false }),
      c.from('returns').select('*').eq('store_id', id).order('created_at', { ascending: false }),
      c.from('debtors').select('*').eq('store_id', id),
      c.from('debts').select('*').eq('store_id', id).order('created_at', { ascending: false }),
      c.from('deferred_items').select('*').eq('store_id', id).order('created_at', { ascending: false }),
      c.from('documents').select('*').eq('store_id', id).order('document_date', { ascending: false }),
      c.from('document_items').select('*').eq('store_id', id)
    ]);

    q.forEach(function (r) { if (r.error) throw r.error; });

    // Сохраняем локальные товары, которых ещё нет на сервере
    var localProducts = cache.products || [];
    cache.products = (q[0].data || []).map(productFromRow);
    var serverProdIds = new Set(cache.products.map(function (p) { return p.id; }));
    localProducts.forEach(function (lp) {
      if (!serverProdIds.has(lp.id)) cache.products.push(lp);
    });
    cache.categories = (q[1].data || []).map(categoryFromRow);
    cache.customers = (q[2].data || []).map(customerFromRow);
    cache.shifts = (q[3].data || []).map(shiftFromRow);
    cache.expenses = (q[4].data || []).map(expenseFromRow);
    // Сохраняем локальные продажи, которых ещё нет на сервере
    var localSales = cache.sales || [];
    var serverIds = new Set((q[5].data || []).map(function (s) { return s.id; }));
    cache.sales = flattenSales(q[5].data, q[6].data);
    localSales.forEach(function (ls) {
      var rid = ls.receiptId || ls.id;
      if (!serverIds.has(rid)) cache.sales.push(ls);
    });
    cache.loyaltyCards = q[8].data || [];
    cache.writeOffs = (q[9].data || []).map(writeOffFromRow);
    cache.audits = (q[10].data || []).map(auditFromRow);
    cache.returns = (q[11].data || []).map(returnFromRow);
    var deletedDebtorIds = getDeletedDebtorIds();
    var localDebtors = (cache.debtors || []).filter(function(d) { return deletedDebtorIds.indexOf(d.id) === -1; });
    var serverDebtorIds = new Set((q[12].data || []).map(function (d) { return d.id; }));
    cache.debtors = (q[12].data || [])
      .filter(function(d) { return deletedDebtorIds.indexOf(d.id) === -1; })
      .map(debtorFromRow);
    localDebtors.forEach(function (ld) { if (!serverDebtorIds.has(ld.id) && deletedDebtorIds.indexOf(ld.id) === -1) cache.debtors.push(ld); });

    var deletedDebtIds = getDeletedDebtIds();
    var localDebts = (cache.debts || []).filter(function(d) { return deletedDebtIds.indexOf(d.id) === -1; });
    var serverDebtIds = new Set((q[13].data || []).map(function (d) { return d.id; }));
    cache.debts = (q[13].data || [])
      .filter(function(d) { return deletedDebtIds.indexOf(d.id) === -1; })
      .map(debtFromRow);
    localDebts.forEach(function (ld) { if (!serverDebtIds.has(ld.id) && deletedDebtIds.indexOf(ld.id) === -1) cache.debts.push(ld); });

    var deletedDefIds = getDeletedDeferredIds();
    var localDeferred = (cache.deferred || []).filter(function (d) { return deletedDefIds.indexOf(d.id) === -1; });
    var serverDefIds = new Set((q[14].data || []).map(function (d) { return d.id; }));
    cache.deferred = (q[14].data || [])
      .filter(function (d) { return deletedDefIds.indexOf(d.id) === -1; })
      .map(deferredFromRow);
    localDeferred.forEach(function (ld) { if (!serverDefIds.has(ld.id) && deletedDefIds.indexOf(ld.id) === -1) cache.deferred.push(ld); });

    var deletedDocIds = getDeletedDocumentIds();
    var localDocs = (cache.documents || []).filter(function (d) { return deletedDocIds.indexOf(d.id) === -1; });
    cache.documents = (q[15].data || [])
      .filter(function (d) { return deletedDocIds.indexOf(d.id) === -1 && d.status !== 'deleted'; })
      .map(documentFromRow);
    var serverDocIds = new Set(cache.documents.map(function (d) { return d.id; }));
    localDocs.forEach(function (ld) { if (!serverDocIds.has(ld.id) && deletedDocIds.indexOf(ld.id) === -1) cache.documents.push(ld); });

    var activeDocIds = new Set(cache.documents.map(function (d) { return d.id; }));
    var localDocItems = (cache.documentItems || []).filter(function (li) {
      return deletedDocIds.indexOf(li.documentId) === -1 && activeDocIds.has(li.documentId);
    });
    cache.documentItems = (q[16].data || [])
      .filter(function (di) { return deletedDocIds.indexOf(di.document_id) === -1 && activeDocIds.has(di.document_id); })
      .map(documentItemFromRow);
    var serverDocItemIds = new Set(cache.documentItems.map(function (d) { return d.id; }));
    localDocItems.forEach(function (li) { if (!serverDocItemIds.has(li.id)) cache.documentItems.push(li); });

    var documentItemsByDocument = {};
    cache.documentItems.forEach(function (item) {
      if (!documentItemsByDocument[item.documentId]) documentItemsByDocument[item.documentId] = [];
      documentItemsByDocument[item.documentId].push(item);
    });
    cache.documents.forEach(function (doc) {
      doc.items = documentItemsByDocument[doc.id] || [];
    });

    // Enrich debts with debtor names
    cache.debts.forEach(function (d) {
      var debtor = cache.debtors.find(function (x) { return x.id === d.debtorId; });
      if (debtor) d.debtorName = debtor.name;
    });

    var members = q[7].data || [];
    var profiles = {};
    if (members.length) {
      var ids = members.map(function (m) { return m.user_id; });
      var pr = await c.from('profiles').select('id, email, display_name').in('id', ids);
      if (!pr.error) {
        (pr.data || []).forEach(function (p) { profiles[p.id] = p; });
      }
    }
    cache.members = members.map(function (m) { return memberToUser(m, profiles[m.user_id]); });

    persistCacheToLocal();
  }

  function persistCacheToLocal() {
    var id = sid();
    if (!id) return;
    try {
      localStorage.setItem('ap_cache_' + id, JSON.stringify({
        ts: Date.now(),
        products: cache.products,
        categories: cache.categories,
        sales: cache.sales,
        expenses: cache.expenses,
        shifts: cache.shifts,
        customers: cache.customers,
        writeOffs: cache.writeOffs,
        audits: cache.audits,
        returns: cache.returns,
        debtors: cache.debtors,
        debts: cache.debts,
        deferred: cache.deferred,
        documents: cache.documents,
        documentItems: cache.documentItems
      }));
    } catch (e) {}
  }

  function loadCacheFromLocal() {
    var id = sid();
    if (!id) return false;
    try {
      var raw = localStorage.getItem('ap_cache_' + id);
      if (!raw) return false;
      var data = JSON.parse(raw);
      cache.products = data.products || [];
      cache.categories = data.categories || [];
      cache.sales = data.sales || [];
      cache.expenses = data.expenses || [];
      cache.shifts = data.shifts || [];
      cache.customers = data.customers || [];
      cache.writeOffs = data.writeOffs || [];
      cache.audits = data.audits || [];
      cache.returns = data.returns || [];
      cache.debtors = data.debtors || [];
      cache.debts = data.debts || [];
      cache.deferred = data.deferred || [];
      cache.documents = data.documents || [];
      cache.documentItems = data.documentItems || [];
      return true;
    } catch (e) {
      return false;
    }
  }

  function enqueue(fn) {
    syncQueue = syncQueue.then(fn).catch(function (err) {
      console.error('[ApDb]', err);
      if (global.toast) global.toast(err.message || String(err), 'err');
    });
    return syncQueue;
  }

  // ─── Debts & Deferred Sync ───

  function getDebtors() { return cache.debtors.slice(); }
  function getDebts() { return cache.debts.slice(); }
  function getDeferred() { return cache.deferred.slice(); }
  function getDocuments() { return cache.documents ? cache.documents.slice() : []; }
  function getDocumentItems() { return cache.documentItems ? cache.documentItems.slice() : []; }

  function setDebtors(arr) {
    cache.debtors = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncDebtors(arr); });
  }

  function setDebts(arr) {
    cache.debts = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncDebts(arr); });
  }

  function setDeferred(arr) {
    cache.deferred = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncDeferred(arr); });
  }

  function setDocuments(arr) {
    cache.documents = arr.filter(function (d) { return !isDocumentDeleted(d.id); }).slice();
    persistCacheToLocal();
    enqueue(function () { return syncDocuments(cache.documents); });
  }

  function setDocumentItems(arr) {
    cache.documentItems = arr.filter(function (d) { return !isDocumentDeleted(d.documentId); }).slice();
    persistCacheToLocal();
    enqueue(function () { return syncDocumentItems(cache.documentItems); });
  }

  async function syncDebtors(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var rows = arr.map(function (d) { return debtorToRow(d, id); });
    if (rows.length) {
      var ups = await c.from('debtors').upsert(rows, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  async function syncDebts(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var rows = arr.map(function (d) { return debtToRow(d, id); });
    if (rows.length) {
      var ups = await c.from('debts').upsert(rows, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  async function syncDeferred(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var rows = [];
    arr.forEach(function (d) { rows = rows.concat(deferredToRow(d, id)); });
    if (rows.length) {
      var ups = await c.from('deferred_items').upsert(rows, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  async function syncDocuments(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var rows = arr.filter(function (d) { return !isDocumentDeleted(d.id); }).map(function (d) { return documentToRow(d, id); });
    if (rows.length) {
      var ups = await c.from('documents').upsert(rows, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  async function syncDocumentItems(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var rows = arr.filter(function (d) { return !isDocumentDeleted(d.documentId); }).map(function (d) { return documentItemToRow(d, id); });
    if (rows.length) {
      var ups = await c.from('document_items').upsert(rows, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  // ─── Публичный API (совместимость с legacy get/set) ───

  function getProducts() { return cache.products.slice(); }
  function getCategories() { return cache.categories.slice(); }
  function getSales() { return cache.sales.slice(); }
  function getExpenses() { return cache.expenses.slice(); }
  function getShifts() { return cache.shifts.slice(); }
  function getCustomers() { return cache.customers.slice(); }
  function getUsers() { return cache.members.slice(); }

  function setProducts(arr) {
    cache.products = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncProducts(arr); });
  }

  async function syncProducts(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var existing = await c.from('products').select('id').eq('store_id', id);
    if (existing.error) throw existing.error;
    var existingIds = (existing.data || []).map(function (r) { return r.id; });
    var newIds = arr.map(function (p) { return p.id; });
    var toDelete = existingIds.filter(function (eid) { return newIds.indexOf(eid) < 0; });
    if (toDelete.length) {
      var del = await c.from('products').delete().in('id', toDelete);
      if (del.error) throw del.error;
    }
    if (arr.length) {
      var rows = arr.map(function (p) { return productToRow(p, id); });
      var ups = await c.from('products').upsert(rows, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  function setCategories(arr) {
    cache.categories = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncCategories(arr); });
  }

  async function syncCategories(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var existing = await c.from('categories').select('id').eq('store_id', id);
    if (existing.error) throw existing.error;
    var keep = arr.map(function (x) { return x.id; });
    var toDel = (existing.data || []).filter(function (r) { return keep.indexOf(r.id) < 0; }).map(function (r) { return r.id; });
    if (toDel.length) await c.from('categories').delete().in('id', toDel);
    if (arr.length) {
      var rows = arr.map(function (cat) {
        return { id: cat.id.length > 20 ? cat.id : undefined, store_id: id, name: cat.name };
      });
      var ups = await c.from('categories').upsert(rows.filter(function (r) { return r.name; }), { onConflict: 'id' });
      if (ups.error) throw ups.error;
      var reload = await c.from('categories').select('*').eq('store_id', id);
      if (!reload.error) cache.categories = (reload.data || []).map(categoryFromRow);
    }
  }

  function setCustomers(arr) {
    cache.customers = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncCustomers(arr); });
  }

  async function syncCustomers(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var rows = arr.map(function (cust) { return customerToRow(cust, id); });
    if (rows.length) {
      var ups = await c.from('customers').upsert(rows, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  function setShifts(arr) {
    cache.shifts = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncShifts(arr); });
  }

  async function syncShifts(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      var row = {
        id: s.id,
        store_id: id,
        cashier_user_id: s.cashierId,
        cashier_name: s.cashierName,
        cashier_email: s.cashierUsername || '',
        opened_at: s.openedAt,
        closed_at: s.closedAt,
        status: s.status,
        opened_by_name: s.openedBy || '',
        closed_by_name: s.closedBy || null,
        totals: s.totals || null
      };
      var ups = await c.from('shifts').upsert(row, { onConflict: 'id' });
      if (ups.error) throw ups.error;
    }
  }

  function setExpenses(arr) {
    cache.expenses = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncExpenses(arr); });
  }

  async function syncExpenses(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var last = arr[arr.length - 1];
    if (!last || !last.id) return;
    var row = {
      id: last.id,
      store_id: id,
      category: last.category,
      amount: last.amount,
      note: last.note || '',
      user_name: last.userName,
      expense_date: last.date,
      status: last.status || 'active',
      cancelled_at: last.cancelledAt || null,
      cancelled_by: last.cancelledBy || null
    };
    var ups = await c.from('expenses').upsert(row, { onConflict: 'id' });
    if (ups.error) throw ups.error;
    var cancelled = arr.filter(function (e) { return e.status === 'cancelled'; });
    for (var j = 0; j < cancelled.length; j++) {
      await c.from('expenses').update({
        status: 'cancelled',
        cancelled_at: cancelled[j].cancelledAt,
        cancelled_by: cancelled[j].cancelledBy
      }).eq('id', cancelled[j].id);
    }
  }

  function setSales(arr) {
    cache.sales = arr.slice();
    persistCacheToLocal();
    enqueue(function () { return syncSalesDelta(arr); });
  }

  async function syncSalesDelta(arr) {
    var c = sb();
    var id = sid();
    if (!c || !id) return;
    var prevIds = new Set();
    try {
      var old = JSON.parse(localStorage.getItem('ap_sales_synced_' + id) || '[]');
      old.forEach(function (x) { prevIds.add(x); });
    } catch (e) {}

    var receipts = {};
    arr.forEach(function (line) {
      var rid = line.receiptId || line.id;
      if (!receipts[rid]) receipts[rid] = { header: null, items: [] };
      receipts[rid].items.push(line);
    });

    var synced = [];
    for (var rid in receipts) {
      if (!Object.prototype.hasOwnProperty.call(receipts, rid)) continue;
      var group = receipts[rid];
      var first = group.items[0];
      if (prevIds.has(rid)) {
        if (first.status === 'cancelled') {
          await c.from('sales').update({
            status: 'cancelled',
            cancelled_at: first.cancelledAt || new Date().toISOString(),
            cancelled_by: first.cancelledBy || ''
          }).eq('id', rid);
        }
        synced.push(rid);
        continue;
      }

      var total = group.items.reduce(function (s, it) { return s + (Number(it.total) || 0); }, 0);
      var headerRow = {
        id: rid,
        store_id: id,
        shift_id: first.shiftId || null,
        customer_id: first.customerId || null,
        user_id: (global.currentUser && global.currentUser.id) || null,
        user_name: first.userName || '',
        payment: first.payment || 'cash',
        total: total,
        cash_amount: first.cashAmount || 0,
        kaspi_amount: first.kaspiAmount || 0,
        transfer_amount: first.transferAmount || 0,
        status: first.status || 'completed',
        sale_date: first.date || new Date().toISOString(),
        debt_phone: first.debtPhone || '',
        debt_return_date: first.debtReturnDate || null,
        debtor_name: first.debtorName || ''
      };
      var hUps = await c.from('sales').upsert(headerRow, { onConflict: 'id' });
      if (hUps.error) throw hUps.error;

      var itemRows = group.items.map(function (it) {
        return {
          id: it.id,
          store_id: id,
          sale_id: rid,
          product_id: it.productId,
          product_code: it.productCode,
          product_name: it.productName,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          purchase_price: it.purchasePrice,
          line_total: it.total
        };
      });
      var iUps = await c.from('sale_items').upsert(itemRows, { onConflict: 'id' });
      if (iUps.error) throw iUps.error;
      synced.push(rid);
    }

    try { localStorage.setItem('ap_sales_synced_' + id, JSON.stringify(synced)); } catch (e) {}
    await syncProducts(cache.products);
  }

  /** Оформить продажу атомарно (пример CRUD) */
  async function createSaleTransaction(payload) {
    // Update cache immediately (works offline)
    var receiptId = payload.receiptId;

    // Update product quantities in cache
    for (var p = 0; p < payload.productUpdates.length; p++) {
      var pu = payload.productUpdates[p];
      var cached = cache.products.find(function (x) { return x.id === pu.id; });
      if (cached) cached.quantity = pu.quantity;
    }
    // Add sale items to cache
    var saleItems = payload.items.map(function (it) {
      return {
        id: it.id, receiptId: receiptId, shiftId: payload.shiftId,
        productId: it.productId, productCode: it.productCode, productName: it.productName,
        quantity: it.quantity, unitPrice: it.unitPrice, purchasePrice: it.purchasePrice,
        total: it.lineTotal, payment: payload.payment, cashAmount: payload.cashAmount || 0,
        kaspiAmount: payload.kaspiAmount || 0, transferAmount: payload.transferAmount || 0, customerId: payload.customerId,
        userName: payload.userName, date: payload.date, status: 'completed'
      };
    });
    cache.sales = cache.sales.concat(saleItems);
    if (payload.customerUpdate) {
      var ci = cache.customers.findIndex(function (x) { return x.id === payload.customerUpdate.id; });
      if (ci >= 0) cache.customers[ci] = payload.customerUpdate;
      else cache.customers.push(payload.customerUpdate);
    }
    persistCacheToLocal();

    // Try online first
    var c = sb();
    var id = sid();
    if (c && id && isOnline) {
      try {
        var header = {
          id: receiptId, store_id: id, shift_id: payload.shiftId,
          customer_id: payload.customerId || null, user_id: payload.userId || null,
          user_name: payload.userName || '', payment: payload.payment,
          total: payload.total, cash_amount: payload.cashAmount || 0,
          kaspi_amount: payload.kaspiAmount || 0, transfer_amount: payload.transferAmount || 0, discount_amount: payload.discountAmount || 0,
          bonus_spend: payload.bonusSpend || 0, earned_bonus: payload.earnedBonus || 0,
          status: 'completed', sale_date: payload.date
        };
        var h = await c.from('sales').insert(header).select().single();
        if (h.error) throw h.error;
        var items = payload.items.map(function (it) {
          return { store_id: id, sale_id: receiptId, product_id: it.productId,
            product_code: it.productCode, product_name: it.productName,
            quantity: it.quantity, unit_price: it.unitPrice, purchase_price: it.purchasePrice, line_total: it.lineTotal };
        });
        var i = await c.from('sale_items').insert(items);
        if (i.error) throw i.error;
        for (var p = 0; p < payload.productUpdates.length; p++) {
          var pu = payload.productUpdates[p];
          await c.from('products').update({ quantity: pu.quantity, updated_at: new Date().toISOString() }).eq('id', pu.id);
        }
        if (payload.customerUpdate) {
          await c.from('customers').upsert(customerToRow(payload.customerUpdate, id), { onConflict: 'id' });
        }
        return receiptId;
      } catch (err) {
        console.warn('[ApDb] Sale online failed, queuing:', err.message);
      }
    }

    // Queue for later sync
    pushToQueue({ type: 'createSale', payload: payload });
    return receiptId;
  }

  function getWriteOffs() { return cache.writeOffs.slice(); }
  function getAudits() { return cache.audits.slice(); }
  function getReturns() { return cache.returns.slice(); }

  async function createWriteOff(payload) {
    // Update cache immediately
    var localWo = {
      id: 'wo_' + Date.now(),
      productId: payload.productId || null,
      productCode: payload.productCode,
      productName: payload.productName,
      quantity: payload.quantity,
      reason: payload.reason,
      note: payload.note || '',
      userName: payload.userName,
      date: new Date().toISOString()
    };
    cache.writeOffs.unshift(localWo);
    if (payload.productId) {
      var p = cache.products.find(function (x) { return x.id === payload.productId; });
      if (p) p.quantity = Math.max(0, p.quantity - payload.quantity);
    }
    persistCacheToLocal();

    var c = sb();
    var id = sid();
    if (c && id && isOnline) {
      try {
        var row = { store_id: id, product_id: payload.productId || null,
          product_code: payload.productCode, product_name: payload.productName,
          quantity: payload.quantity, reason: payload.reason, note: payload.note || '', user_name: payload.userName };
        var res = await c.from('write_offs').insert(row).select().single();
        if (res.error) throw res.error;
        if (payload.productId) {
          var p2 = cache.products.find(function (x) { return x.id === payload.productId; });
          if (p2) {
            var newQty = Math.max(0, p2.quantity - payload.quantity);
            await c.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', p2.id);
          }
        }
        await loadAll();
        return res.data.id;
      } catch (err) {
        console.warn('[ApDb] WriteOff online failed, queuing:', err.message);
      }
    }
    pushToQueue({ type: 'createWriteOff', payload: payload });
    return localWo.id;
  }

  async function createAudit(payload) {
    // Update cache immediately
    var localAudit = {
      id: 'aud_' + Date.now(),
      userName: payload.userName,
      items: payload.items,
      date: new Date().toISOString()
    };
    cache.audits.unshift(localAudit);
    for (var i = 0; i < payload.items.length; i++) {
      var item = payload.items[i];
      if (item.productId) {
        var p = cache.products.find(function (x) { return x.id === item.productId; });
        if (p) p.quantity = item.qtyFact;
      }
    }
    persistCacheToLocal();

    var c = sb();
    var id = sid();
    if (c && id && isOnline) {
      try {
        var row = { store_id: id, user_name: payload.userName, items: payload.items };
        var res = await c.from('audits').insert(row).select().single();
        if (res.error) throw res.error;
        for (var i = 0; i < payload.items.length; i++) {
          var item = payload.items[i];
          if (item.productId) {
            await c.from('products').update({ quantity: item.qtyFact, updated_at: new Date().toISOString() }).eq('id', item.productId);
          }
        }
        await loadAll();
        return res.data.id;
      } catch (err) {
        console.warn('[ApDb] Audit online failed, queuing:', err.message);
      }
    }
    pushToQueue({ type: 'createAudit', payload: payload });
    return localAudit.id;
  }

  async function createReturnTransaction(payload) {
    // Update cache immediately
    for (var i = 0; i < payload.items.length; i++) {
      var it = payload.items[i];
      if (it.productId) {
        var p = cache.products.find(function (x) { return x.id === it.productId; });
        if (p) p.quantity += it.quantity;
      }
    }
    if (payload.customerId && payload.totalRefund > 0) {
      var cust = cache.customers.find(function (x) { return x.id === payload.customerId; });
      if (cust) {
        cust.spent = Math.max(0, (Number(cust.spent) || 0) - payload.totalRefund);
        cust.bonusBalance = Math.max(0, (Number(cust.bonusBalance) || 0) - Math.round(payload.totalRefund * 0.01));
      }
    }
    var expLocal = {
      id: 'exp_' + Date.now(), category: 'Возврат', amount: payload.totalRefund,
      note: 'Возврат по чеку № ' + payload.saleId.slice(-6), userName: payload.userName,
      date: new Date().toISOString(), status: 'active'
    };
    cache.expenses.unshift(expenseFromRow ? expLocal : expLocal);
    persistCacheToLocal();

    var c = sb();
    var id = sid();
    if (c && id && isOnline) {
      try {
        for (var i = 0; i < payload.items.length; i++) {
          var it = payload.items[i];
          var retRow = { store_id: id, sale_id: payload.saleId, product_id: it.productId,
            product_code: it.productCode, product_name: it.productName,
            quantity: it.quantity, refund_amount: it.refundAmount, user_name: payload.userName };
          var rIns = await c.from('returns').insert(retRow);
          if (rIns.error) throw rIns.error;
          if (it.productId) {
            var p2 = cache.products.find(function (x) { return x.id === it.productId; });
            if (p2) {
              var newQty = p2.quantity + it.quantity;
              await c.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', it.productId);
            }
          }
        }
        var sale = await c.from('sales').select('*').eq('id', payload.saleId).single();
        if (!sale.error && sale.data) {
          var refundTotal = payload.items.reduce(function (sum, x) { return sum + x.refundAmount; }, 0);
          var newSaleTotal = Math.max(0, Number(sale.data.total) - refundTotal);
          await c.from('sales').update({ total: newSaleTotal }).eq('id', payload.saleId);
        }
        if (payload.customerId && payload.totalRefund > 0) {
          var cust2 = cache.customers.find(function (x) { return x.id === payload.customerId; });
          if (cust2) {
            var newSpent = Math.max(0, (Number(cust2.spent) || 0) - payload.totalRefund);
            var newBonus = Math.max(0, (Number(cust2.bonusBalance) || 0) - Math.round(payload.totalRefund * 0.01));
            await c.from('customers').update({ spent: newSpent, bonus_balance: newBonus, updated_at: new Date().toISOString() }).eq('id', payload.customerId);
          }
        }
        var expRow = { store_id: id, category: 'Возврат', amount: payload.totalRefund,
          note: 'Возврат по чеку № ' + payload.saleId.slice(-6), user_name: payload.userName,
          expense_date: new Date().toISOString(), status: 'active' };
        await c.from('expenses').insert(expRow);
        await loadAll();
        return true;
      } catch (err) {
        console.warn('[ApDb] Return online failed, queuing:', err.message);
      }
    }
    pushToQueue({ type: 'createReturn', payload: payload });
    return true;
  }

  /** CRUD товара: один upsert */
  async function upsertProduct(product) {
    // Update cache immediately
    var mapped = product;
    var idx = cache.products.findIndex(function (p) { return p.id === product.id; });
    if (idx >= 0) cache.products[idx] = product;
    else cache.products.push(product);
    persistCacheToLocal();

    var c = sb();
    var sId = sid();
    if (c && sId && isOnline) {
      try {
        var row = productToRow(product, sId);
        var res = await c.from('products').upsert(row, { onConflict: 'id' }).select().single();
        if (res.error) throw res.error;
        mapped = productFromRow(res.data);
        var i2 = cache.products.findIndex(function (p) { return p.id === mapped.id; });
        if (i2 >= 0) cache.products[i2] = mapped;
        else cache.products.push(mapped);
        persistCacheToLocal();
        return mapped;
      } catch (err) {
        console.warn('[ApDb] Upsert product online failed, queuing:', err.message);
      }
    }
    pushToQueue({ type: 'upsertProduct', payload: product });
    return product;
  }

  async function deleteProduct(productId) {
    // Remove from cache immediately
    cache.products = cache.products.filter(function (p) { return p.id !== productId; });
    persistCacheToLocal();

    var c = sb();
    if (c && isOnline) {
      try {
        var res = await c.from('products').delete().eq('id', productId);
        if (res.error) throw res.error;
        return;
      } catch (err) {
        console.warn('[ApDb] Delete product online failed, queuing:', err.message);
      }
    }
    pushToQueue({ type: 'deleteProduct', payload: { id: productId } });
  }

  async function deleteDocument(docId) {
    rememberDeletedDocument(docId);
    cache.documents = cache.documents.filter(function (d) { return d.id !== docId; });
    cache.documentItems = cache.documentItems.filter(function (di) { return di.documentId !== docId; });
    persistCacheToLocal();

    return enqueue(async function () {
      var c = sb();
      if (c && isOnline) {
        try {
          var itemsRes = await c.from('document_items').delete().eq('document_id', docId);
          if (itemsRes.error) throw itemsRes.error;
          var docRes = await c.from('documents').delete().eq('id', docId);
          if (docRes.error) throw docRes.error;
          return;
        } catch (err) {
          console.warn('[ApDb] Delete document online failed, queuing:', err.message);
        }
      }
      pushToQueue({ type: 'deleteDocument', payload: { id: docId } });
    });
  }

  async function deleteDeferred(deferredId) {
    rememberDeletedDeferred(deferredId);
    cache.deferred = cache.deferred.filter(function (d) { return d.id !== deferredId; });
    persistCacheToLocal();

    return enqueue(async function () {
      var c = sb();
      if (c && isOnline) {
        try {
          var res = await c.from('deferred_items').delete().eq('id', deferredId);
          if (res.error) throw res.error;
          return;
        } catch (err) {
          console.warn('[ApDb] Delete deferred online failed, queuing:', err.message);
        }
      }
      pushToQueue({ type: 'deleteDeferred', payload: { id: deferredId } });
    });
  }

  async function deleteDebt(debtId) {
    rememberDeletedDebt(debtId);
    cache.debts = cache.debts.filter(function (d) { return d.id !== debtId; });
    persistCacheToLocal();

    return enqueue(async function () {
      var c = sb();
      if (c && isOnline) {
        try {
          var res = await c.from('debts').delete().eq('id', debtId);
          if (res.error) throw res.error;
          return;
        } catch (err) {
          console.warn('[ApDb] Delete debt online failed, queuing:', err.message);
        }
      }
      pushToQueue({ type: 'deleteDebt', payload: { id: debtId } });
    });
  }

  async function deleteDebtor(debtorId) {
    rememberDeletedDebtor(debtorId);
    cache.debtors = cache.debtors.filter(function (d) { return d.id !== debtorId; });
    
    // Cascading local delete for debts
    var debtsToDelete = cache.debts.filter(function(d) { return d.debtorId === debtorId; });
    debtsToDelete.forEach(function(d) { rememberDeletedDebt(d.id); });
    cache.debts = cache.debts.filter(function (d) { return d.debtorId !== debtorId; });
    
    persistCacheToLocal();

    return enqueue(async function () {
      var c = sb();
      if (c && isOnline) {
        try {
          var res = await c.from('debtors').delete().eq('id', debtorId);
          if (res.error) throw res.error;
          return;
        } catch (err) {
          console.warn('[ApDb] Delete debtor online failed, queuing:', err.message);
        }
      }
      pushToQueue({ type: 'deleteDebtor', payload: { id: debtorId } });
    });
  }

  async function refresh() {
    if (syncing) return;
    if (!isOnline) { updateOnlineUI(); return; }
    syncing = true;
    try {
      await loadAll();
      if (offlineQueue.length) processOfflineQueue();
      saveLastSync(Date.now());
      maybeSaveDailyBackup();
    } catch (e) {
      console.warn('[ApDb] refresh failed:', e.message || e);
    } finally {
      syncing = false;
    }
  }

  async function initForStore() {
    loadCacheFromLocal();
    loadOfflineQueue();
    updateOnlineUI();
    scheduleDailySync();
    try {
      await loadAll();
      // If we loaded from server successfully and have queued items, sync them
      if (offlineQueue.length) processOfflineQueue();
      saveLastSync(Date.now());
      maybeSaveDailyBackup();
    } catch (e) {
      // Offline or error - use cached data, queue will sync later
      console.warn('[ApDb] loadAll failed, using cache:', e.message || e);
    }
    maybeDailyRefresh();
  }

  global.ApDb = {
    setStoreId: setStoreId,
    initForStore: initForStore,
    refresh: refresh,
    loadAll: loadAll,
    getProducts: getProducts,
    getCategories: getCategories,
    getSales: getSales,
    getExpenses: getExpenses,
    getShifts: getShifts,
    getCustomers: getCustomers,
    getUsers: getUsers,
    getWriteOffs: getWriteOffs,
    getAudits: getAudits,
    getReturns: getReturns,
    getDebtors: getDebtors,
    getDebts: getDebts,
    getDeferred: getDeferred,
    getDocuments: getDocuments,
    getDocumentItems: getDocumentItems,
    setDebtors: setDebtors,
    setDebts: setDebts,
    setDeferred: setDeferred,
    setDocuments: setDocuments,
    setDocumentItems: setDocumentItems,
    setProducts: setProducts,
    setCategories: setCategories,
    setSales: setSales,
    setExpenses: setExpenses,
    setShifts: setShifts,
    setCustomers: setCustomers,
    upsertProduct: upsertProduct,
    deleteProduct: deleteProduct,
    deleteDocument: deleteDocument,
    deleteDeferred: deleteDeferred,
    deleteDebt: deleteDebt,
    deleteDebtor: deleteDebtor,
    createSaleTransaction: createSaleTransaction,
    createWriteOff: createWriteOff,
    createAudit: createAudit,
    createReturnTransaction: createReturnTransaction,
    enqueue: enqueue,
    processOfflineQueue: processOfflineQueue,
    getOfflineQueueCount: function () { return offlineQueue.length; },
    isOnline: function () { return isOnline; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
