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

  // ─── Вспомогательные функции для текста суммы прописью ───

  function numberToWords(number, feminine) {
    number = Number(number) || 0;
    if (number === 0) return 'ноль';

    var units = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
    var tens = ['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
    var hundreds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
    var femaleUnits = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];

    function underThousand(value, useFeminine) {
      var parts = [];
      var h = Math.floor(value / 100);
      var rest = value % 100;
      if (h) parts.push(hundreds[h]);
      if (rest < 20) {
        if (rest) parts.push(useFeminine ? femaleUnits[rest] || units[rest] : units[rest]);
      } else {
        var t = Math.floor(rest / 10);
        var u = rest % 10;
        if (t) parts.push(tens[t]);
        if (u) parts.push(useFeminine ? femaleUnits[u] || units[u] : units[u]);
      }
      return parts.join(' ').trim();
    }

    var parts = [];
    var thousands = Math.floor(number / 1000);
    var remainder = number % 1000;
    if (thousands) {
      parts.push(underThousand(thousands, true));
      var rem100 = thousands % 100;
      var form = 'тысяч';
      if (rem100 % 10 === 1 && rem100 !== 11) form = 'тысяча';
      else if ([2,3,4].indexOf(rem100 % 10) !== -1 && !(rem100 >= 12 && rem100 <= 14)) form = 'тысячи';
      parts.push(form);
    }
    if (remainder) {
      parts.push(underThousand(remainder, false));
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function amountToWords(amount) {
    var value = Number(amount) || 0;
    var whole = Math.floor(value);
    var cents = Math.round((value - whole) * 100);
    if (cents < 0) cents = 0;
    var words = numberToWords(whole, false) + ' тенге';
    words += ' ' + (cents < 10 ? '0' + cents : cents) + ' тыйын';
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  // ─── Генерация HTML для документов ───

  function buildInvoiceHTML(doc) {
    var store = getCurrentStore();
    var storeName = store ? store.storeName : 'Магазин';
    var bin = localStorage.getItem('ap_store_bin') || '—';
    var logo = localStorage.getItem('ap_store_logo') || '';
    var bankName = localStorage.getItem('ap_store_bank_name') || 'АО "Банк ЦентрКредит"';
    var beneficiary = localStorage.getItem('ap_store_beneficiary') || storeName;
    var iik = localStorage.getItem('ap_store_iik') || 'KZ308562204126830393';
    var bik = localStorage.getItem('ap_store_bik') || 'KCJBKZKX';
    var paymentCode = localStorage.getItem('ap_store_payment_code') || '19';
    var contractText = (doc.meta && doc.meta.contract) ? doc.meta.contract : 'Без договора';
    var amountWords = amountToWords(doc.total);

    var html = '<div style="font-family:\'Times New Roman\',Times,serif;color:#111;max-width:980px;margin:0 auto;padding:20px">';
    html += '<div style="font-size:12px;line-height:1.5;padding:12px 14px;border:1px solid #222;background:#f8f8f8;margin-bottom:18px">' +
      'Внимание! Оплата данного счета означает согласие с условиями поставки товара. Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и документов, удостоверяющих личность.' +
      '</div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;font-size:12px;line-height:1.2">' +
      '<div>Приложение 26<br>к приказу Министра финансов<br>Республики Казахстан<br>от 20 декабря 2012 года № 562</div>' +
      '<div style="font-size:16px;font-weight:700">Форма 3-2</div>' +
      '</div>';
    html += '<div style="text-align:center;margin-bottom:18px"><div style="font-weight:700;font-size:22px;letter-spacing:1px">Счет на оплату № ' + escapeHtml(doc.docNumber || '') + '</div>' +
      '<div style="margin-top:6px;font-size:13px">от ' + fmtDate(doc.documentDate) + '</div></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;font-size:13px">';
    html += '<div style="border:1px solid #222;padding:12px"><strong>Поставщик:</strong><br>' + escapeHtml(storeName) + '<br>БИН/ИИН: ' + escapeHtml(bin) + '</div>';
    html += '<div style="border:1px solid #222;padding:12px"><strong>Покупатель:</strong><br>' + escapeHtml(doc.customerName || '—') + '<br>' + (doc.customerPhone ? 'Телефон: ' + escapeHtml(doc.customerPhone) : '') + '</div>';
    html += '</div>';

    html += '<div style="margin-bottom:16px;font-size:13px"><strong>Договор:</strong> ' + escapeHtml(contractText) + '</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">';
    html += '<thead><tr>' +
      '<th style="padding:10px;border:1px solid #222;text-align:center;width:40px">№</th>' +
      '<th style="padding:10px;border:1px solid #222;text-align:left">Наименование</th>' +
      '<th style="padding:10px;border:1px solid #222;text-align:center;width:70px">Кол-во</th>' +
      '<th style="padding:10px;border:1px solid #222;text-align:center;width:60px">Ед.</th>' +
      '<th style="padding:10px;border:1px solid #222;text-align:right;width:110px">Цена</th>' +
      '<th style="padding:10px;border:1px solid #222;text-align:right;width:130px">Сумма</th>' +
      '</tr></thead><tbody>';
    doc.items.forEach(function (item, idx) {
      html += '<tr>' +
        '<td style="padding:10px;border:1px solid #222;text-align:center">' + (idx + 1) + '</td>' +
        '<td style="padding:10px;border:1px solid #222">' + escapeHtml(item.productName || item.productCode || '') + '</td>' +
        '<td style="padding:10px;border:1px solid #222;text-align:center">' + (item.quantity || 0) + '</td>' +
        '<td style="padding:10px;border:1px solid #222;text-align:center">' + escapeHtml(item.unit || 'шт') + '</td>' +
        '<td style="padding:10px;border:1px solid #222;text-align:right">' + fmt(item.unitPrice) + '</td>' +
        '<td style="padding:10px;border:1px solid #222;text-align:right">' + fmt(item.total) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';

    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:13px;margin-bottom:20px">';
    html += '<div style="max-width:58%"><strong>Всего к оплате:</strong><br>' + escapeHtml(amountWords) + '</div>';
    html += '<div style="text-align:right;min-width:220px">' +
      '<div style="font-size:16px;font-weight:700">Итого: ' + fmt(doc.total) + ' KZT</div>' +
      '</div>';
    html += '</div>';

    html += '<div style="margin-bottom:14px;font-size:13px;border:1px solid #222;padding:12px">' +
      '<div><strong>Бенефициар:</strong> ' + escapeHtml(beneficiary) + '</div>' +
      '<div><strong>ИИК:</strong> ' + escapeHtml(iik) + ' | <strong>БИК:</strong> ' + escapeHtml(bik) + '</div>' +
      '<div><strong>Код назначения платежа:</strong> ' + escapeHtml(paymentCode) + '</div>' +
      '<div><strong>Банк бенефициара:</strong> ' + escapeHtml(bankName) + '</div>' +
      '</div>';

    html += '<div style="display:flex;justify-content:space-between;font-size:13px">';
    html += '<div style="text-align:center;width:280px;border-top:1px solid #222;padding-top:12px">Исполнитель<br><span style="display:inline-block;margin-top:24px">(подпись)</span></div>';
    html += '<div style="text-align:center;width:280px;border-top:1px solid #222;padding-top:12px">Директор<br><span style="display:inline-block;margin-top:24px">(расшифровка подписи)</span></div>';
    html += '<div style="text-align:center;width:280px;border-top:1px solid #222;padding-top:12px">Получил<br><span style="display:inline-block;margin-top:24px">(подпись)</span></div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function buildZ2HTML(doc) {
    var store = getCurrentStore();
    var storeName = store ? store.storeName : 'Магазин';
    var bin = localStorage.getItem('ap_store_bin') || '—';
    var html = '<div style="font-family:\'Times New Roman\',Times,serif;color:#111;max-width:980px;margin:0 auto;padding:20px;font-size:13px;line-height:1.4">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
      '<div style="font-size:12px;line-height:1.4">Приложение 26<br>к приказу Министра финансов<br>Республики Казахстан<br>от 20 декабря 2012 года № 562</div>' +
      '<div style="font-size:16px;font-weight:700">Форма 3-2</div>' +
      '</div>';
    html += '<div style="text-align:center;font-size:18px;font-weight:700;margin-bottom:14px">НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ</div>';
    html += '<div style="margin-bottom:14px;font-size:13px">' +
      '<strong>Организация (индивидуальный предприниматель) - отправитель:</strong> ' + escapeHtml(storeName) + '<br>' +
      '<strong>БИН/ИИН:</strong> ' + escapeHtml(bin) + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;font-size:13px">' +
      '<div><strong>Организация (индивидуальный предприниматель) - получатель:</strong> ' + escapeHtml(doc.customerName || '—') + '</div>' +
      '<div><strong>Номер документа:</strong> ' + escapeHtml(doc.docNumber || '') + '<br><strong>Дата составления:</strong> ' + fmtDate(doc.documentDate) + '</div>' +
      '</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px">';
    html += '<thead><tr>' +
      '<th style="padding:8px;border:1px solid #000;text-align:center;width:40px">№ п/п</th>' +
      '<th style="padding:8px;border:1px solid #000;text-align:center;width:110px">Номенклатурный номер</th>' +
      '<th style="padding:8px;border:1px solid #000;text-align:left">Наименование, характеристика</th>' +
      '<th style="padding:8px;border:1px solid #000;text-align:center;width:60px">Ед.изм.</th>' +
      '<th style="padding:8px;border:1px solid #000;text-align:right;width:80px">Количество</th>' +
      '<th style="padding:8px;border:1px solid #000;text-align:right;width:100px">Цена за единицу, KZT</th>' +
      '<th style="padding:8px;border:1px solid #000;text-align:right;width:120px">Сумма с НДС, KZT</th>' +
      '</tr></thead><tbody>';
    var totalQty = 0;
    doc.items.forEach(function (item, idx) {
      var qty = item.quantity || 0;
      totalQty += Number(qty);
      html += '<tr>' +
        '<td style="padding:8px;border:1px solid #000;text-align:center">' + (idx + 1) + '</td>' +
        '<td style="padding:8px;border:1px solid #000;text-align:center">' + escapeHtml(item.productCode || '') + '</td>' +
        '<td style="padding:8px;border:1px solid #000;text-align:left">' + escapeHtml(item.productName || '') + '</td>' +
        '<td style="padding:8px;border:1px solid #000;text-align:center">' + escapeHtml(item.unit || 'шт') + '</td>' +
        '<td style="padding:8px;border:1px solid #000;text-align:right">' + qty + '</td>' +
        '<td style="padding:8px;border:1px solid #000;text-align:right">' + fmt(item.unitPrice) + '</td>' +
        '<td style="padding:8px;border:1px solid #000;text-align:right">' + fmt(item.total) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:18px;font-size:13px">' +
      '<div><strong>Итого наименований:</strong> ' + doc.items.length + ', <strong>на сумму:</strong> ' + fmt(doc.total) + ' KZT</div>' +
      '<div><strong>Всего отпущено количество:</strong> ' + totalQty + '</div>' +
      '</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:13px;gap:14px">' +
      '<div style="flex:1;border:1px solid #000;padding:12px;min-width:260px">' +
      '<div style="margin-bottom:14px"><strong>Отпустил:</strong></div>' +
      '<div style="border-bottom:1px solid #000;height:30px;margin-bottom:8px"></div>' +
      '<div style="font-size:11px">подпись</div>' +
      '<div style="border-bottom:1px solid #000;height:30px;margin-top:12px"></div>' +
      '<div style="font-size:11px">расшифровка подписи</div>' +
      '</div>' +
      '<div style="flex:1;border:1px solid #000;padding:12px;min-width:260px">' +
      '<div style="margin-bottom:14px"><strong>Получил:</strong></div>' +
      '<div style="border-bottom:1px solid #000;height:30px;margin-bottom:8px"></div>' +
      '<div style="font-size:11px">подпись</div>' +
      '<div style="border-bottom:1px solid #000;height:30px;margin-top:12px"></div>' +
      '<div style="font-size:11px">расшифровка подписи</div>' +
      '</div>' +
      '</div>';
    html += '</div>';
    return html;
  }

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
