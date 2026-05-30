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
    members: []
  };

  var storeId = null;
  var syncing = false;
  var syncQueue = Promise.resolve();

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
      info: r.info || ''
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
      c.from('loyalty_cards').select('*').eq('store_id', id)
    ]);

    q.forEach(function (r) { if (r.error) throw r.error; });

    cache.products = (q[0].data || []).map(productFromRow);
    cache.categories = (q[1].data || []).map(categoryFromRow);
    cache.customers = (q[2].data || []).map(customerFromRow);
    cache.shifts = (q[3].data || []).map(shiftFromRow);
    cache.expenses = (q[4].data || []).map(expenseFromRow);
    cache.sales = flattenSales(q[5].data, q[6].data);
    cache.loyaltyCards = q[8].data || [];

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
        customers: cache.customers
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
        status: first.status || 'completed',
        sale_date: first.date || new Date().toISOString()
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
    var c = sb();
    var id = sid();
    if (!c || !id) throw new Error('Нет подключения');

    var receiptId = payload.receiptId;
    var header = {
      id: receiptId,
      store_id: id,
      shift_id: payload.shiftId,
      customer_id: payload.customerId,
      user_id: payload.userId,
      user_name: payload.userName,
      payment: payload.payment,
      total: payload.total,
      discount_amount: payload.discountAmount || 0,
      bonus_spend: payload.bonusSpend || 0,
      earned_bonus: payload.earnedBonus || 0,
      status: 'completed',
      sale_date: payload.date
    };
    var h = await c.from('sales').insert(header).select().single();
    if (h.error) throw h.error;

    var items = payload.items.map(function (it) {
      return {
        store_id: id,
        sale_id: receiptId,
        product_id: it.productId,
        product_code: it.productCode,
        product_name: it.productName,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        purchase_price: it.purchasePrice,
        line_total: it.lineTotal
      };
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

    await loadAll();
    return receiptId;
  }

  /** CRUD товара: один upsert */
  async function upsertProduct(product) {
    var c = sb();
    var sId = sid();
    var row = productToRow(product, sId);
    var res = await c.from('products').upsert(row, { onConflict: 'id' }).select().single();
    if (res.error) throw res.error;
    var mapped = productFromRow(res.data);
    var idx = cache.products.findIndex(function (p) { return p.id === mapped.id; });
    if (idx >= 0) cache.products[idx] = mapped;
    else cache.products.push(mapped);
    persistCacheToLocal();
    return mapped;
  }

  async function deleteProduct(productId) {
    var c = sb();
    var res = await c.from('products').delete().eq('id', productId);
    if (res.error) throw res.error;
    cache.products = cache.products.filter(function (p) { return p.id !== productId; });
    persistCacheToLocal();
  }

  async function refresh() {
    if (syncing) return;
    syncing = true;
    try {
      await loadAll();
    } finally {
      syncing = false;
    }
  }

  async function initForStore() {
    loadCacheFromLocal();
    await loadAll();
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
    setProducts: setProducts,
    setCategories: setCategories,
    setSales: setSales,
    setExpenses: setExpenses,
    setShifts: setShifts,
    setCustomers: setCustomers,
    upsertProduct: upsertProduct,
    deleteProduct: deleteProduct,
    createSaleTransaction: createSaleTransaction,
    enqueue: enqueue
  };
})(typeof window !== 'undefined' ? window : globalThis);
