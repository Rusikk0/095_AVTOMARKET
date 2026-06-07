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
    var kbe = localStorage.getItem('ap_store_kbe') || '';
    var contractText = (doc.meta && doc.meta.contract) ? doc.meta.contract : 'Без договора';
    var amountWords = amountToWords(doc.total);

    // override with per-document store info when present
    var storeInfo = (doc && doc.meta && doc.meta.storeInfo) || {};
    storeName = storeInfo.storeName || storeName;
    bin = storeInfo.bin || bin;
    logo = storeInfo.logo || logo;
    bankName = storeInfo.bankName || bankName;
    beneficiary = storeInfo.beneficiary || beneficiary;
    iik = storeInfo.iik || iik;
    bik = storeInfo.bik || bik;
    paymentCode = storeInfo.paymentCode || paymentCode;
    kbe = storeInfo.kbe || kbe;

    var html = '<div style="font-family:\'Times New Roman\',Times,serif;color:#111;max-width:980px;margin:0 auto;padding:20px">';
    html += '<div style="font-size:12px;line-height:1.5;padding:12px 14px;border:1px solid #222;background:#f8f8f8;margin-bottom:18px">' +
      'Внимание! Оплата данного счета означает согласие с условиями поставки товара. Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и документов, удостоверяющих личность.' +
      '</div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;font-size:12px;line-height:1.2">' +
      '<div>Приложение 26<br>к приказу Министра финансов<br>Республики Казахстан<br>от 20 декабря 2012 года № 562</div>' +
      '<div style="font-size:16px;font-weight:700">Форма 3-2</div>' +
      '</div>';
    html += '<div style="text-align:center;margin-bottom:18px"><div style="font-weight:700;font-size:22px;letter-spacing:1px;color:#000">Счет на оплату № ' + escapeHtml(doc.docNumber || '') + '</div>' +
      '<div style="margin-top:6px;font-size:13px;color:#000">от ' + fmtDate(doc.documentDate) + '</div></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;font-size:13px">';
    html += '<div style="border:1px solid #000;padding:12px;color:#000"><strong>Поставщик:</strong><br>' + escapeHtml(storeName) + '<br><strong>БИН/ИИН:</strong> ' + escapeHtml(bin) + '</div>';
    var customerIIN = storeInfo.customerIIN || '';
    var customerAddress = storeInfo.customerAddress || '';
    html += '<div style="border:1px solid #000;padding:12px;color:#000"><strong>Покупатель:</strong><br>' + escapeHtml(doc.customerName || '—') +
      (customerIIN ? '<br><strong>БИН/ИИН:</strong> ' + escapeHtml(customerIIN) : '') +
      (doc.customerPhone ? '<br>Тел: ' + escapeHtml(doc.customerPhone) : '') +
      (customerAddress ? '<br>' + escapeHtml(customerAddress) : '') + '</div>';
    html += '</div>';

    html += '<div style="margin-bottom:16px;font-size:13px"><strong>Договор:</strong> ' + escapeHtml(contractText) + '</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">';
    html += '<thead><tr>' +
      '<th style="padding:10px;border:1px solid #000;text-align:center;width:40px">№</th>' +
      '<th style="padding:10px;border:1px solid #000;text-align:left">Наименование</th>' +
      '<th style="padding:10px;border:1px solid #000;text-align:center;width:70px">Кол-во</th>' +
      '<th style="padding:10px;border:1px solid #000;text-align:center;width:60px">Ед.</th>' +
      '<th style="padding:10px;border:1px solid #000;text-align:right;width:110px">Цена</th>' +
      '<th style="padding:10px;border:1px solid #000;text-align:right;width:130px">Сумма</th>' +
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
      '<div style="font-size:16px;font-weight:700;color:#000">Итого: ' + fmt(doc.total) + ' KZT</div>' +
      '</div>';
    html += '</div>';

    html += '<div style="margin-bottom:14px;font-size:13px;border:1px solid #000;padding:12px;color:#000">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;border-bottom:1px solid #ccc;padding-bottom:8px;margin-bottom:8px">' +
      '<div><strong>Бенефициар:</strong><br>' + escapeHtml(beneficiary) + '</div>' +
      '<div><strong>ИИК:</strong><br>' + escapeHtml(iik) + '</div>' +
      '<div><strong>КБЕ:</strong><br>' + escapeHtml(kbe || '—') + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<div><strong>Банк бенефициара:</strong><br>' + escapeHtml(bankName) + '</div>' +
      '<div><strong>БИК:</strong><br>' + escapeHtml(bik) + (paymentCode ? ' &nbsp; <strong>Код назн.:</strong> ' + escapeHtml(paymentCode) : '') + '</div>' +
      '</div>' +
      '</div>';

    html += '<div style="display:flex;justify-content:space-between;font-size:13px">';
    html += '<div style="text-align:center;width:280px;border-top:1px solid #000;padding-top:12px">Исполнитель<br><span style="display:inline-block;margin-top:24px">(подпись)</span></div>';
    html += '<div style="text-align:center;width:280px;border-top:1px solid #000;padding-top:12px">Директор<br><span style="display:inline-block;margin-top:24px">(расшифровка подписи)</span></div>';
    html += '<div style="text-align:center;width:280px;border-top:1px solid #000;padding-top:12px">Получил<br><span style="display:inline-block;margin-top:24px">(подпись)</span></div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function buildZ2HTML(doc) {
    var store = getCurrentStore();
    var storeName = store ? store.storeName : 'Магазин';
    var bin = localStorage.getItem('ap_store_bin') || '—';
    var storeInfo = (doc && doc.meta && doc.meta.storeInfo) || {};
    storeName = storeInfo.storeName || storeName;
    bin = storeInfo.bin || bin;
    var html = '<div style="font-family:\'Times New Roman\',Times,serif;color:#111;max-width:980px;margin:0 auto;padding:20px;font-size:13px;line-height:1.4">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
      '<div style="font-size:12px;line-height:1.4">Приложение 26<br>к приказу Министра финансов<br>Республики Казахстан<br>от 20 декабря 2012 года № 562</div>' +
      '<div style="font-size:16px;font-weight:700">Форма 3-2</div>' +
      '</div>';
    html += '<div style="text-align:center;font-size:18px;font-weight:700;margin-bottom:14px">НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ</div>';
    html += '<div style="margin-bottom:14px;font-size:13px">' +
      '<strong>Организация (индивидуальный предприниматель) - отправитель:</strong> ' + escapeHtml(storeName) + '<br>' +
      '<strong>БИН/ИИН:</strong> ' + escapeHtml(bin) + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;font-size:13px">';
    var senderBIN = bin;
    var recipientIIN = storeInfo.customerIIN || '';
    var recipientAddress = storeInfo.customerAddress || '';
    html += '<div><strong>Организация (ИП) - получатель:</strong><br>' + escapeHtml(doc.customerName || '—') +
      (recipientIIN ? '<br><strong>БИН/ИИН:</strong> ' + escapeHtml(recipientIIN) : '') +
      (recipientAddress ? '<br>' + escapeHtml(recipientAddress) : '') + '</div>';
    html += '<div><strong>Номер документа:</strong> ' + escapeHtml(doc.docNumber || '') + '<br><strong>Дата составления:</strong> ' + fmtDate(doc.documentDate) + '</div>';
    html += '</div>';
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

  function updateDocument(doc) {
    if (!doc || !doc.id) throw new Error('Неверный документ');
    var docs = getDocuments();
    var idx = docs.findIndex(function (d) { return d.id === doc.id; });
    if (idx === -1) throw new Error('Документ не найден');
    // Replace main document
    docs[idx] = Object.assign({}, docs[idx], doc);
    setDocuments(docs);

    // Update document items
    var docItems = getDocumentItems().filter(function (di) { return di.documentId !== doc.id; });
    (doc.items || []).forEach(function (item) {
      docItems.push({
        id: item.id || uuid(),
        documentId: doc.id,
        storeId: doc.storeId || null,
        productId: item.productId || null,
        productCode: item.productCode || item.productCode || '',
        productName: item.productName || '',
        unit: item.unit || 'шт',
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || 0
      });
    });
    setDocumentItems(docItems);
    return docs[idx];
  }

  // ─── Экспорт в Excel ───

  function exportDocumentExcel(doc) {
    if (typeof XLSX === 'undefined') {
      console.warn('[ApDocuments] XLSX not available');
      if (global.toast) global.toast('Ошибка: не удалось загрузить библиотеку Excel', 'err');
      return;
    }

    if (!doc || !doc.items || !doc.items.length) {
      if (global.toast) global.toast('Нет данных для экспорта', 'err');
      return;
    }

    var store = getCurrentStore();
    var storeName = store ? store.storeName : 'Магазин';
    var bin = localStorage.getItem('ap_store_bin') || '';
    var bankName = localStorage.getItem('ap_store_bank_name') || '';
    var beneficiary = localStorage.getItem('ap_store_beneficiary') || storeName;
    var iik = localStorage.getItem('ap_store_iik') || '';
    var bik = localStorage.getItem('ap_store_bik') || '';
    var kbe = localStorage.getItem('ap_store_kbe') || '';
    var paymentCode = localStorage.getItem('ap_store_payment_code') || '';

    var storeInfo = (doc.meta && doc.meta.storeInfo) || {};
    storeName = storeInfo.storeName || storeName;
    bin = storeInfo.bin || bin;
    bankName = storeInfo.bankName || bankName;
    beneficiary = storeInfo.beneficiary || beneficiary;
    iik = storeInfo.iik || iik;
    bik = storeInfo.bik || bik;

    var rows, cols, safeName;

    if (doc.docType === 'invoice') {
      rows = [
        ['', '', '', '', '', ''],
        ['Счет на оплату № ' + doc.docNumber + ' от ' + fmtDate(doc.documentDate), '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['Поставщик:', storeName, '', 'БИН/ИИН:', bin, ''],
        ['Покупатель:', doc.customerName || '—', '', 'Тел:', doc.customerPhone || '—', ''],
        ['Договор:', (doc.meta && doc.meta.contract) || 'Без договора', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['№', 'Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма']
      ];
      doc.items.forEach(function (it, i) {
        rows.push([String(i + 1), it.productName || '', Number(it.quantity) || 0, it.unit || 'шт', Number(it.unitPrice) || 0, Number(it.total) || 0]);
      });
      rows.push(['', '', '', '', '', '']);
      rows.push(['', '', '', 'Итого:', '', doc.total || 0]);
      rows.push(['Всего наименований ' + doc.items.length + ', на сумму ' + fmt(doc.total) + ' KZT', '', '', '', '', '']);
      rows.push(['', '', '', '', '', '']);
      rows.push(['Бенефициар:', beneficiary, 'ИИК:', iik, 'КБЕ:', kbe || '—']);
      rows.push(['Банк:', bankName, 'БИК:', bik, '', '']);
      rows.push([paymentCode ? 'Код назн.: ' + paymentCode : '', '', '', '', '', '']);
      safeName = 'Schet_' + doc.docNumber + '.xlsx';
      cols = [{ wch: 5 }, { wch: 40 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 16 }];
    } else {
      rows = [
        ['', '', '', '', '', ''],
        ['Накладная на отпуск запасов на сторону', '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['Организация (ИП) - отправитель:', storeName, '', 'БИН/ИИН:', bin, ''],
        ['Организация (ИП) - получатель:', doc.customerName || '—', '', '', '', ''],
        ['Номер документа:', doc.docNumber, '', 'Дата:', fmtDate(doc.documentDate), ''],
        ['', '', '', '', '', ''],
        ['№ п/п', 'Номенклатурный номер', 'Наименование, характеристика', 'Ед.изм.', 'Количество', 'Сумма с НДС']
      ];
      doc.items.forEach(function (it, i) {
        rows.push([String(i + 1), it.productCode || '', it.productName || '', it.unit || 'шт', Number(it.quantity) || 0, Number(it.total) || 0]);
      });
      rows.push(['', '', '', '', '', '']);
      rows.push(['Итого наименований: ' + doc.items.length, '', '', 'Всего количество:', doc.items.reduce(function (s, it) { return s + (Number(it.quantity) || 0); }, 0), 'Сумма: ' + fmt(doc.total)]);
      safeName = 'Nakladnaya_Z2_' + doc.docNumber + '.xlsx';
      cols = [{ wch: 8 }, { wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 16 }];
    }

    try {
      var ws = XLSX.utils.aoa_to_sheet(rows);
      if (cols) ws['!cols'] = cols;
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Document');
      XLSX.writeFile(wb, safeName);
    } catch (e) {
      if (global.toast) global.toast('Ошибка сохранения Excel: ' + (e.message || e), 'err');
    }
  }

  // Публичный API
  global.ApDocuments = {
    createDocument: createDocument,
    createDocumentFromDeferred: createDocumentFromDeferred,
    updateDocument: updateDocument,
    getDocument: getDocument,
    getDocuments: getDocuments,
    updateDocumentStatus: updateDocumentStatus,
    buildInvoiceHTML: buildInvoiceHTML,
    buildZ2HTML: buildZ2HTML,
    exportDocumentExcel: exportDocumentExcel
  };

})(typeof window !== 'undefined' ? window : globalThis);
