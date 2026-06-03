/**
 * Экраны: вход, регистрация, выбор магазина, создание магазина, приглашение кассира
 */
(function (global) {
  'use strict';

  var SCREENS = ['auth-site-gate', 'auth-login', 'auth-register', 'auth-stores'];

  function showScreen(id) {
    SCREENS.forEach(function (sid) {
      var el = document.getElementById(sid);
      if (el) el.style.display = sid === id ? 'block' : 'none';
    });
    var wrap = document.getElementById('auth-screen');
    if (wrap) wrap.style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('active');
  }

  function hideAuth() {
    var wrap = document.getElementById('auth-screen');
    if (wrap) wrap.style.display = 'none';
  }

  function showLoginLegacyHidden() {
    hideAuth();
    document.getElementById('login-screen').style.display = 'none';
  }

  async function renderStoreList() {
    var list = document.getElementById('store-list');
    if (!list) return;
    list.innerHTML = '<div class="empty">Загрузка...</div>';
    try {
      var stores = await global.ApAuth.fetchMyStores();
      if (!stores.length) {
        list.innerHTML = '<div class="empty" style="text-align:center;padding:24px 16px">' +
          '<div style="font-size:32px;margin-bottom:12px">🔒</div>' +
          '<div style="color:var(--muted);font-size:14px;line-height:1.7">' +
          'У вас пока нет доступа ни к одному магазину.<br>' +
          'Обратитесь к администратору магазина,<br>чтобы получить приглашение.' +
          '</div></div>';
        return;
      }
      list.innerHTML = stores.map(function (s) {
        return '<button type="button" class="btn btn-secondary" style="width:100%;margin-bottom:8px;text-align:left" ' +
          'data-store-id="' + s.storeId + '" data-role="' + s.role + '" data-name="' + escapeAttr(s.displayName) + '">' +
          '<strong>' + escapeHtml(s.storeName) + '</strong><br>' +
          '<span style="font-size:12px;color:var(--muted)">' + (s.role === 'admin' ? 'Администратор' : 'Кассир') + '</span></button>';
      }).join('');
      list.querySelectorAll('button[data-store-id]').forEach(function (btn) {
        btn.onclick = function () {
          enterStore({
            storeId: btn.getAttribute('data-store-id'),
            storeName: btn.querySelector('strong').textContent,
            role: btn.getAttribute('data-role'),
            displayName: btn.getAttribute('data-name')
          });
        };
      });
    } catch (err) {
      list.innerHTML = '<div class="empty" style="color:var(--err)">' + escapeHtml(err.message) + '</div>';
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;');
  }

  async function enterStore(membership) {
    global.ApAuth.setCurrentStore(membership);
    global.ApDb.setStoreId(membership.storeId);
    await global.ApDb.initForStore();

    var user = await global.ApAuth.getCurrentUser();
    var cu = {
      id: user.id,
      username: user.email || '',
      role: membership.role,
      name: membership.displayName || user.user_metadata?.display_name || membership.storeName
    };
    global.currentStoreId = membership.storeId;
    global.currentUser = cu;

    showLoginLegacyHidden();
    if (typeof global.showApp === 'function') global.showApp();
  }

  function bindForms() {
    var loginForm = document.getElementById('auth-login-form');
    if (loginForm) {
      loginForm.onsubmit = async function (e) {
        e.preventDefault();
        var email = document.getElementById('auth-email').value.trim();
        var pass = document.getElementById('auth-password').value;
        try {
          await global.ApAuth.signIn(email, pass);
          showScreen('auth-stores');
          await renderStoreList();
        } catch (err) {
          var msg = (err && err.message) ? err.message : String(err);
          if (/email not confirmed|not confirmed/i.test(msg)) {
            toastErr({ message: 'Подтвердите email по ссылке из письма, затем снова нажмите «Войти».' });
          } else {
            toastErr(err);
          }
        }
      };
    }

    var gateBtn = document.getElementById('btn-site-access-ok');
    if (gateBtn) {
      gateBtn.onclick = function () {
        var input = (document.getElementById('site-access-code-input').value || '').trim();
        if (global.ApAccess && global.ApAccess.grantSiteAccess(input)) {
          global.ApAccess.applyAuthUI();
          showScreen('auth-login');
          toastOk('Доступ разрешён. Войдите в аккаунт.');
        } else {
          toastErr({ message: 'Неверный код доступа' });
        }
      };
    }

    // Registration form disabled — only admin can invite cashiers
    var regForm = document.getElementById('auth-register-form');
    if (regForm) {
      regForm.onsubmit = function (e) {
        e.preventDefault();
        toastErr({ message: 'Самостоятельная регистрация отключена. Обратитесь к администратору.' });
      };
    }

    // Create store form disabled — only admin can create stores via invitation
    var createForm = document.getElementById('auth-create-store-form');
    if (createForm) {
      createForm.onsubmit = function (e) {
        e.preventDefault();
        toastErr({ message: 'Создание магазина отключено. Обратитесь к администратору.' });
      };
    }

    document.getElementById('btn-show-register') && (document.getElementById('btn-show-register').onclick = function () {
      toastErr({ message: 'Регистрация только через администратора магазина' });
    });
    document.getElementById('btn-show-login') && (document.getElementById('btn-show-login').onclick = function () {
      showScreen('auth-login');
    });
    document.getElementById('btn-goto-create-store') && (document.getElementById('btn-goto-create-store').onclick = function () {
      toastErr({ message: 'Создание магазина отключено. Обратитесь к администратору.' });
    });
    document.getElementById('btn-auth-logout') && (document.getElementById('btn-auth-logout').onclick = async function () {
      await global.ApAuth.signOut();
      showScreen('auth-login');
    });

    var inviteForm = document.getElementById('invite-cashier-form');
    if (inviteForm) {
      inviteForm.onsubmit = async function (e) {
        e.preventDefault();
        if (!global.isAdmin || !global.isAdmin()) {
          toastErr({ message: 'Только администратор' });
          return;
        }
        var store = global.ApAuth.getCurrentStore();
        var email = document.getElementById('invite-email').value.trim();
        var pass = document.getElementById('invite-password').value;
        var name = document.getElementById('invite-name').value.trim();
        if (pass.length < 6) { toastErr({ message: 'Пароль минимум 6 символов' }); return; }
        try {
          await global.ApAuth.inviteCashier(store.storeId, email, pass, name);
          await global.ApDb.refresh();
          toastOk('Кассир приглашён: ' + email);
          global.closeModal && global.closeModal('modal-invite-cashier');
          inviteForm.reset();
          if (typeof global.renderCashiersPage === 'function') global.renderCashiersPage();
        } catch (err) {
          toastErr(err);
        }
      };
    }
  }

  function toastErr(err) {
    var msg = (err && err.message) ? err.message : String(err);
    if (global.toast) global.toast(msg, 'err');
    else alert(msg);
  }

  function toastOk(msg) {
    if (global.toast) global.toast(msg, 'ok');
  }

  async function afterAuthSession() {
    var restored = await global.ApAuth.restoreStoreFromStorage();
    if (restored) {
      await enterStore(restored);
      return;
    }
    showScreen('auth-stores');
    await renderStoreList();
    toastOk('Вход выполнен. Выберите магазин.');
  }

  async function bootstrap() {
    if (!global.ApSupabase.getConfig()) {
      document.getElementById('auth-config-warn').style.display = 'block';
    }
    var fileWarn = document.getElementById('auth-file-warn');
    if (fileWarn && global.location.protocol === 'file:') {
      fileWarn.style.display = 'block';
    }
    bindForms();
    if (global.ApAccess) global.ApAccess.applyAuthUI();

    if (global.ApAccess && global.ApAccess.siteAccessRequired() && !global.ApAccess.isSiteAccessGranted()) {
      showScreen('auth-site-gate');
      return;
    }

    var c = global.ApAuth.client();
    if (c) {
      c.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_IN' && session && !global.currentUser) {
          afterAuthSession();
        }
      });
    }

    var hash = global.location.hash || '';
    if (hash.indexOf('access_token') >= 0 || hash.indexOf('type=signup') >= 0 || hash.indexOf('type=email') >= 0) {
      await new Promise(function (r) { setTimeout(r, 500); });
      if (global.history && global.history.replaceState) {
        global.history.replaceState(null, '', global.location.pathname + global.location.search);
      }
    }

    var session = await global.ApAuth.getSession();
    if (session) {
      await afterAuthSession();
    } else {
      showScreen('auth-login');
    }
  }

  global.ApScreens = {
    bootstrap: bootstrap,
    showScreen: showScreen,
    renderStoreList: renderStoreList,
    enterStore: enterStore
  };
})(typeof window !== 'undefined' ? window : globalThis);
