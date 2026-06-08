/**
 * Резервное копирование данных магазина (JSON)
 */
(function (global) {
  'use strict';

  function downloadJson(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function safeName(s) {
    return String(s || 'store').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 40);
  }

  function buildPayload() {
    var store = global.ApAuth && global.ApAuth.getCurrentStore();
    var db = global.ApDb;
    if (!db || !store) throw new Error('Магазин не выбран');
    return {
      format: 'autozapchasti-backup-v1',
      exportedAt: new Date().toISOString(),
      storeId: store.storeId,
      storeName: store.storeName,
      data: {
        products: db.getProducts(),
        categories: db.getCategories(),
        sales: db.getSales(),
        expenses: db.getExpenses(),
        shifts: db.getShifts(),
        customers: db.getCustomers(),
        debtors: db.getDebtors(),
        debts: db.getDebts(),
        deferred: db.getDeferred(),
        documents: typeof db.getDocuments === 'function' ? db.getDocuments() : [],
        documentItems: typeof db.getDocumentItems === 'function' ? db.getDocumentItems() : []
      }
    };
  }

  async function exportBackup() {
    await global.ApDb.refresh();
    var payload = buildPayload();
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var fname = 'backup_' + safeName(payload.storeName) + '_' + date + '.json';
    downloadJson(fname, payload);
    if (global.toast) global.toast('Резервная копия сохранена: ' + fname, 'ok');
    return payload;
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsText(file, 'UTF-8');
    });
  }

  async function importBackup(file, replace) {
    if (!global.isAdmin || !global.isAdmin()) throw new Error('Только администратор');
    var raw = await readFileAsText(file);
    var payload = JSON.parse(raw);
    if (!payload || payload.format !== 'autozapchasti-backup-v1' || !payload.data) {
      throw new Error('Неверный файл резервной копии');
    }
    var store = global.ApAuth.getCurrentStore();
    if (payload.storeId && store && payload.storeId !== store.storeId && !replace) {
      throw new Error('Копия от другого магазина. Включите «Заменить всё» для принудительного восстановления.');
    }

    var d = payload.data;
    if (replace) {
      global.ApDb.setProducts(d.products || []);
      global.ApDb.setCategories(d.categories || []);
      global.ApDb.setSales(d.sales || []);
      global.ApDb.setExpenses(d.expenses || []);
      global.ApDb.setShifts(d.shifts || []);
      global.ApDb.setCustomers(d.customers || []);
      global.ApDb.setDebtors(d.debtors || []);
      global.ApDb.setDebts(d.debts || []);
      global.ApDb.setDeferred(d.deferred || []);      if (typeof global.ApDb.setDocuments === 'function') global.ApDb.setDocuments(d.documents || []);
      if (typeof global.ApDb.setDocumentItems === 'function') global.ApDb.setDocumentItems(d.documentItems || []);    } else {
      global.ApDb.setProducts((d.products || []).concat(global.ApDb.getProducts()));
    }

    await global.ApDb.refresh();
    if (typeof global.refreshAll === 'function') global.refreshAll();
    if (global.toast) global.toast('Данные восстановлены из копии', 'ok');
  }

  global.ApBackup = {
    exportBackup: exportBackup,
    importBackup: importBackup
  };
})(typeof window !== 'undefined' ? window : globalThis);
