/**
 * Экраны: вход, регистрация, выбор магазина, создание магазина, приглашение кассира
 */
(function (global) {
  'use strict';

  var SCREENS = ['auth-site-gate', 'auth-login', 'auth-register', 'auth-stores', 'auth-create-store'];

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

  function masterCode() {
    return (global.AP_CONFIG && global.AP_CONFIG.ADMIN_MASTER_CODE || '').trim();
  }

  async function renderStoreList() {
    var list = document.getElementById('store-list');
    if (!list) return;
    list.innerHTML = '<div class="empty">Загрузка...</div>';
    try {
      var stores = await global.ApAuth.fetchMyStores();
      if (!stores.length) {
        list.innerHTML = '<div class="empty" style="text-align:center;padding:24px 16px">' +
          '<div style="font-size:32px;margin-bottom:12px">🏪</div>' +
          '<div style="color:var(--muted);font-size:14px;line-height:1.7">' +
          'У вас пока нет магазинов.<br>' +
          'Нажмите «Создать магазин» и введите мастер-код.' +
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

    // Registration form — open signup with optional master code
    var regForm = document.getElementById('auth-register-form');
    if (regForm) {
      regForm.onsubmit = async function (e) {
        e.preventDefault();
        var inviteIn = (document.getElementById('reg-invite-code') && document.getElementById('reg-invite-code').value) || '';
        if (global.ApAccess && !global.ApAccess.checkRegistrationInvite(inviteIn)) {
          toastErr({ message: 'Неверный код приглашения' });
          return;
        }
        var name = document.getElementById('reg-name').value.trim();
        var email = document.getElementById('reg-email').value.trim();
        var pass = document.getElementById('reg-password').value;
        var pass2 = document.getElementById('reg-password2').value;
        var mc = (document.getElementById('reg-master-code') && document.getElementById('reg-master-code').value) || '';
        if (pass !== pass2) { toastErr({ message: 'Пароли не совпадают' }); return; }
        if (pass.length < 6) { toastErr({ message: 'Пароль минимум 6 символов' }); return; }

        // Validate master code if provided
        var hasAdminCode = mc.trim() && mc.trim() === masterCode();

        try {
          var data = await global.ApAuth.signUp(email, pass, name, hasAdminCode);
          if (data.session) {
            if (hasAdminCode) {
              toastOk('Аккаунт администратора создан. Создайте магазин.');
            } else {
              toastOk('Аккаунт создан. Теперь вас могут пригласить в магазин как кассира.');
            }
            showScreen('auth-stores');
            await renderStoreList();
            return;
          }
          toastOk(
            'На почту ' + email + ' отправлено письмо. Откройте ссылку «Подтвердить» в письме, затем нажмите «Войти».',
            'ok'
          );
          showScreen('auth-login');
        } catch (err) {
          var msg = (err && err.message) ? err.message : String(err);
          if (/already registered|already been registered/i.test(msg)) {
            toastErr({ message: 'Этот email уже зарегистрирован. Нажмите «Войти».' });
          } else {
            toastErr(err);
          }
        }
      };
    }

    // Create store form — requires master code
    var createForm = document.getElementById('auth-create-store-form');
    if (createForm) {
      createForm.onsubmit = async function (e) {
        e.preventDefault();
        var name = document.getElementById('new-store-name-auth').value.trim();
        var mc = (document.getElementById('create-store-master-code') && document.getElementById('create-store-master-code').value) || '';
        if (!name) return;

        // Check master code
        if (!mc.trim() || mc.trim() !== masterCode()) {
          toastErr({ message: 'Неверный мастер-код. Создание магазина невозможно.' });
          return;
        }

        try {
          await global.ApAuth.createStore(name);
          toastOk('Магазин создан');
          showScreen('auth-stores');
          await renderStoreList();
        } catch (err) {
          toastErr(err);
        }
      };
    }

    document.getElementById('btn-show-register') && (document.getElementById('btn-show-register').onclick = function () {
      showScreen('auth-register');
    });
    document.getElementById('btn-show-login') && (document.getElementById('btn-show-login').onclick = function () {
      showScreen('auth-login');
    });
    document.getElementById('btn-goto-create-store') && (document.getElementById('btn-goto-create-store').onclick = function () {
      showScreen('auth-create-store');
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
        var roleEl = document.getElementById('invite-role');
        var role = roleEl ? roleEl.value : 'cashier';
        var email = document.getElementById('invite-email').value.trim();
        var pass = document.getElementById('invite-password').value;
        var name = document.getElementById('invite-name').value.trim();
        if (pass.length < 6) { toastErr({ message: 'Пароль минимум 6 символов' }); return; }
        try {
          await global.ApAuth.inviteCashier(store.storeId, email, pass, name, role);
          await global.ApDb.refresh();
          var roleLabel = role === 'admin' ? 'Администратор' : 'Кассир';
          toastOk(roleLabel + ' приглашён: ' + (email || name));
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
