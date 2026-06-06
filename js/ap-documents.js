/**
 * Система документов: счета и накладные З-2
 */
(function (global) {
  'use strict';

  function getDocuments() { return window.ApDb ? window.ApDb.getDocuments() : []; }
  function setDocuments(arr) { if (window.ApDb) window.ApDb.setDocuments(arr); }
  function getDocumentItems() { return window.ApDb ? window.ApDb.getDocumentItems() : []; }
  function setDocumentItems(arr) { if (window.ApDb) window.ApDb.setDocumentItems(arr); }

  function getCurrentStore() {
    return window.ApAuth && window.ApAuth.getCurrentStore();
  }

  function getCurrentUser() {
    return window.currentUser;
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ─── Создание документа ───

  function createDocument(docType, items, customerName, customerPhone, meta) {
    var store = getCurrentStore();
    var user = getCurrentUser();
    if (!store) throw new Error('Магазин не выбран');

    var total = items.reduce(function (sum, item) { return sum + (item.total || 0); }, 0);

    var doc = {
      id: uuid(),
      storeId: store.storeId,
      docType: docType,
      docNumber: generateDocNumber(),
      status: 'pending',
      customerName: customerName || '',
      customerPhone: customerPhone || '',
      total: total,
      createdBy: user ? user.id : null,
      createdByName: user ? user.name : 'Неизвестен',
      documentDate: new Date().toISOString(),
      meta: meta || {},
      items: items.slice()
    };

    var docs = getDocuments();
    docs.push(doc);
    setDocuments(docs);

    var docItems = getDocumentItems();
    items.forEach(function (item) {
      docItems.push({
        id: uuid(),
        documentId: doc.id,
        storeId: store.storeId,
        productId: item.productId || null,
        productCode: item.productCode || '',
        productName: item.productName || '',
        unit: item.unit || 'шт',
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        total: item.total || 0
      });
    });
    setDocumentItems(docItems);

    return doc;
  }

  function generateDocNumber() {
    var docs = getDocuments();
    var maxNum = 0;
    docs.forEach(function (d) {
      if (d.docNumber) {
        var num = parseInt(d.docNumber.replace(/\D/g, ''), 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return String(maxNum + 1).padStart(6, '0');
  }

  function getDocument(docId) {
    var docs = getDocuments();
    var doc = docs.find(function (d) { return d.id === docId; });
    if (!doc) return null;

    var docItems = getDocumentItems().filter(function (di) { return di.documentId === docId; });
    doc.items = docItems;
    return doc;
  }

  function updateDocumentStatus(docId, status) {
    var docs = getDocuments();
    var doc = docs.find(function (d) { return d.id === docId; });
    if (!doc) throw new Error('Документ не найден');

    doc.status = status;
    doc.updatedAt = new Date().toISOString();
    setDocuments(docs);
  }

  // ─── Генерация HTML для документов ───

  function buildInvoiceHTML(doc) {
    var store = getCurrentStore();
    var storeName = store ? store.storeName : 'Магазин';
    var bin = localStorage.getItem('ap_store_bin') || '';
    var logo = localStorage.getItem('ap_store_logo') || '';

    var itemsHtml = doc.items.map(function (item) {
      return '<tr>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #ddd">' + (item.productCode || '') + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #ddd">' + (item.productName || '') + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #ddd;text-align:right">' + (item.quantity || 1) + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #ddd;text-align:right">' + fmt(item.unitPrice) + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #ddd;text-align:right"><strong>' + fmt(item.total) + '</strong></td>' +
        '</tr>';
    }).join('');

    var statusLabel = doc.status === 'pending' ? 'Ожидает оплаты' :
      doc.status === 'paid' ? 'Оплачено' :
      doc.status === 'cancelled' ? 'Отменено' : doc.status;

    var html = '<div style="padding:40px;font-family:\'Segoe UI\',Arial,sans-serif;max-width:900px;margin:0 auto;color:#333">';

    // Заголовок
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;border-bottom:3px solid #f44336;padding-bottom:20px">';
    if (logo) html += '<img src="' + logo + '" style="max-height:60px;max-width:200px">';
    html += '<div style="text-align:right">' +
      '<h1 style="margin:0;color:#f44336;font-size:28px">СЧЕТ № ' + (doc.docNumber || '') + '</h1>' +
      '<p style="margin:4px 0;color:#666;font-size:14px">' + fmtDate(doc.documentDate) + '</p>' +
      '</div></div>';

    // Информация о магазине
    html += '<div style="margin-bottom:30px">';
    html += '<h3 style="margin:0 0 8px 0;font-size:14px;color:#666">ОТ:</h3>';
    html += '<div style="font-weight:600;font-size:16px">' + escapeHtml(storeName) + '</div>';
    if (bin) html += '<div style="font-size:13px;color:#666">БИН: ' + escapeHtml(bin) + '</div>';
    html += '</div>';

    // Информация о клиенте
    if (doc.customerName || doc.customerPhone) {
      html += '<div style="margin-bottom:30px;padding:16px;background:#f5f5f5;border-radius:8px">';
      html += '<h3 style="margin:0 0 8px 0;font-size:14px;color:#666">ПОКУПАТЕЛЬ:</h3>';
      if (doc.customerName) html += '<div style="font-weight:600;font-size:15px">' + escapeHtml(doc.customerName) + '</div>';
      if (doc.customerPhone) html += '<div style="font-size:13px;color:#666">Телефон: ' + escapeHtml(doc.customerPhone) + '</div>';
      html += '</div>';
    }

    // Таблица товаров
    html += '<div style="margin-bottom:30px;border:1px solid #ddd;border-radius:8px;overflow:hidden">';
    html += '<table style="width:100%;border-collapse:collapse">';
    html += '<thead style="background:#f5f5f5">' +
      '<tr>' +
      '<th style="padding:12px 8px;text-align:left;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Код</th>' +
      '<th style="padding:12px 8px;text-align:left;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Наименование</th>' +
      '<th style="padding:12px 8px;text-align:right;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Кол-во</th>' +
      '<th style="padding:12px 8px;text-align:right;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Цена</th>' +
      '<th style="padding:12px 8px;text-align:right;font-size:13px;font-weight:600;border-bottom:2px solid #ddd">Сумма</th>' +
      '</tr></thead>' +
      '<tbody>' + itemsHtml + '</tbody>' +
      '</table></div>';

    // Итоги
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:30px">';
    html += '<div style="width:400px">';
    html += '<div style="display:flex;justify-content:space-between;padding:12px;border-bottom:1px solid #ddd;font-size:14px">' +
      '<span>Сумма товаров:</span><span>' + fmt(doc.total) + ' ₸</span>' +
      '</div>';
    html += '<div style="display:flex;justify-content:space-between;padding:16px;background:#f5f5f5;font-size:18px;font-weight:700;border-radius:0 0 8px 8px">' +
      '<span>ИТОГО:</span><span style="color:#f44336">' + fmt(doc.total) + ' ₸</span>' +
      '</div>';
    html += '</div></div>';

    // Статус
    var statusColor = doc.status === 'pending' ? '#ff9800' :
      doc.status === 'paid' ? '#4caf50' :
      doc.status === 'cancelled' ? '#f44336' : '#666';
    html += '<div style="padding:12px 16px;background:' + statusColor + ';color:white;border-radius:8px;text-align:center;margin-bottom:30px;font-weight:600">' +
      statusLabel + '</div>';

    // Подпись
    html += '<div style="margin-top:40px;padding-top:20px;border-top:1px solid #ddd;font-size:12px;color:#666">' +
      '<p style="margin:0;text-align:right">Счет создан: ' + fmtDateTime(doc.documentDate) + '</p>' +
      '</div>';

    html += '</div>';

    return html;
  }

  function buildZ2HTML(doc) {
    var store = getCurrentStore();
    var storeName = store ? store.storeName : 'Магазин';
    var bin = localStorage.getItem('ap_store_bin') || '';
    var logo = localStorage.getItem('ap_store_logo') || '';

    var itemsHtml = doc.items.map(function (item, idx) {
      return '<tr>' +
        '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:center">' + (idx + 1) + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #ddd">' + (item.productCode || '') + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #ddd">' + (item.productName || '') + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:center">' + (item.unit || 'шт') + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">' + (item.quantity || 1) + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right">' + fmt(item.unitPrice) + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right"><strong>' + fmt(item.total) + '</strong></td>' +
        '</tr>';
    }).join('');

    var html = '<div style="padding:30px;font-family:\'Segoe UI\',Arial,sans-serif;max-width:1000px;margin:0 auto;color:#000;font-size:13px">';

    // Заголовок
    html += '<div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:10px">';
    html += '<div style="font-weight:700;font-size:16px">НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ (ФОРМА З-2)</div>';
    if (logo) html += '<img src="' + logo + '" style="max-height:50px;margin:5px 0">';
    html += '<div style="margin-top:8px;font-size:12px">' + escapeHtml(storeName) + (bin ? ' (БИН: ' + escapeHtml(bin) + ')' : '') + '</div>';
    html += '</div>';

    // Основные реквизиты
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px">';
    html += '<div><strong>Номер:</strong> <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;text-align:center">' + (doc.docNumber || '') + '</span></div>';
    html += '<div><strong>Дата:</strong> <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;text-align:center">' + fmtDate(doc.documentDate) + '</span></div>';
    html += '</div>';

    // Таблица товаров
    html += '<div style="margin-bottom:20px;border:1px solid #000">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead>';
    html += '<tr style="border-bottom:1px solid #000">' +
      '<th style="padding:6px;border-right:1px solid #000;text-align:center;width:30px">№ п/п</th>' +
      '<th style="padding:6px;border-right:1px solid #000;text-align:center">Артикул</th>' +
      '<th style="padding:6px;border-right:1px solid #000;text-align:left">Наименование товара</th>' +
      '<th style="padding:6px;border-right:1px solid #000;text-align:center">Ед.изм.</th>' +
      '<th style="padding:6px;border-right:1px solid #000;text-align:right">Количество</th>' +
      '<th style="padding:6px;border-right:1px solid #000;text-align:right">Цена</th>' +
      '<th style="padding:6px;text-align:right">Сумма</th>' +
      '</tr></thead>' +
      '<tbody>' + itemsHtml + '</tbody>' +
      '</table></div>';

    // Итоги
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:20px">';
    html += '<div style="width:350px;border:1px solid #000">';
    html += '<div style="display:flex;border-bottom:1px solid #000;font-size:12px">' +
      '<div style="flex:1;padding:8px;border-right:1px solid #000">ИТОГО:</div>' +
      '<div style="width:120px;padding:8px;text-align:right;font-weight:700">' + fmt(doc.total) + ' ₸</div>' +
      '</div>';
    html += '</div></div>';

    // Отпустил / Получил
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px">';
    html += '<div>' +
      '<div style="margin-bottom:30px"><strong>Отпустил:</strong></div>' +
      '<div style="border-bottom:1px solid #000;height:40px;width:200px;margin-bottom:5px"></div>' +
      '<div style="font-size:11px">Подпись</div>' +
      '<div style="border-bottom:1px solid #000;height:30px;width:200px;margin-top:8px"></div>' +
      '<div style="font-size:11px">Фамилия, инициалы</div>' +
      '</div>';
    html += '<div>' +
      '<div style="margin-bottom:30px"><strong>Получил:</strong></div>' +
      '<div style="border-bottom:1px solid #000;height:40px;width:200px;margin-bottom:5px"></div>' +
      '<div style="font-size:11px">Подпись</div>' +
      '<div style="border-bottom:1px solid #000;height:30px;width:200px;margin-top:8px"></div>' +
      '<div style="font-size:11px">Фамилия, инициалы</div>' +
      '</div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ─── Работа с отложенными товарами ───

  function createDocumentFromDeferred(docType, deferredIds, customerName, customerPhone) {
    var deferred = (window.ApDb && window.ApDb.getDeferred()) || [];
    var selected = deferred.filter(function (d) { return deferredIds.indexOf(d.id) !== -1; });

    if (!selected.length) throw new Error('Не выбраны отложенные товары');

    var items = selected.map(function (d) {
      return {
        productId: d.productId || null,
        productCode: d.productCode || '',
        productName: d.productName || '',
        unit: 'шт',
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        total: d.total
      };
    });

    return createDocument(docType, items, customerName || '', customerPhone || '', {
      deferredIds: deferredIds
    });
  }

  // ─── Экспорт в Excel ───

  function exportDocumentExcel(doc) {
    var store = getCurrentStore();
    var storeName = store ? store.storeName : 'Магазин';

    var rows = [[
      'СЧЕТ / НАКЛАДНАЯ',
      '', '', '', ''
    ]];
    rows.push(['Документ: ' + doc.docType, 'Номер: ' + doc.docNumber, 'Дата: ' + fmtDate(doc.documentDate), '', '']);
    rows.push(['Магазин:', storeName, '', '', '']);
    if (doc.customerName) rows.push(['Клиент:', doc.customerName, 'Телефон: ' + (doc.customerPhone || ''), '', '']);
    rows.push(['', '', '', '', '']);

    rows.push(['Код', 'Наименование', 'Кол-во', 'Цена', 'Сумма']);
    doc.items.forEach(function (item) {
      rows.push([
        item.productCode || '',
        item.productName || '',
        item.quantity || 0,
        item.unitPrice || 0,
        item.total || 0
      ]);
    });

    rows.push(['', '', '', '', '']);
    rows.push(['', '', 'ИТОГО:', 'Сумма:', doc.total || 0]);

    var fileName = 'doc_' + doc.docNumber + '_' + fmtDate(doc.documentDate).replace(/\./g, '') + '.xlsx';

    if (typeof XLSX !== 'undefined') {
      var ws = XLSX.utils.aoa_to_sheet(rows);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Документ');
      XLSX.writeFile(wb, fileName);
    } else {
      console.warn('[ApDocuments] XLSX not available');
      if (global.toast) global.toast('Ошибка: не удалось загрузить библиотеку Excel', 'err');
    }
  }

  // Публичный API
  global.ApDocuments = {
    createDocument: createDocument,
    createDocumentFromDeferred: createDocumentFromDeferred,
    getDocument: getDocument,
    getDocuments: getDocuments,
    updateDocumentStatus: updateDocumentStatus,
    buildInvoiceHTML: buildInvoiceHTML,
    buildZ2HTML: buildZ2HTML,
    exportDocumentExcel: exportDocumentExcel
  };

})(typeof window !== 'undefined' ? window : globalThis);
