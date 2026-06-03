/**
 * Ограничение доступа: код сайта, регистрация, создание магазина
 */
(function (global) {
  'use strict';

  function cfg() {
    return global.AP_CONFIG || {};
  }

  function siteAccessRequired() {
    var code = (cfg().SITE_ACCESS_CODE || '').trim();
    return code.length > 0;
  }

  function isSiteAccessGranted() {
    if (!siteAccessRequired()) return true;
    try {
      var saved = sessionStorage.getItem('ap_site_access_ok');
      var code = (cfg().SITE_ACCESS_CODE || '').trim();
      return saved === code;
    } catch (e) {
      return false;
    }
  }

  function grantSiteAccess(input) {
    var code = (cfg().SITE_ACCESS_CODE || '').trim();
    if (input === code) {
      try { sessionStorage.setItem('ap_site_access_ok', code); } catch (e) {}
      return true;
    }
    return false;
  }

  function allowPublicSignup() {
    return cfg().ALLOW_PUBLIC_SIGNUP === true;
  }

  function allowPublicStoreCreate() {
    return cfg().ALLOW_PUBLIC_STORE_CREATE === true;
  }

  function registrationInviteRequired() {
    return !!(cfg().REGISTRATION_INVITE_CODE || '').trim();
  }

  function checkRegistrationInvite(input) {
    var need = (cfg().REGISTRATION_INVITE_CODE || '').trim();
    if (!need) return true;
    return (input || '').trim() === need;
  }

  function applyAuthUI() {
    var regLink = document.getElementById('auth-register-link-wrap');
    var regPanel = document.getElementById('auth-register');
    var createBtn = document.getElementById('btn-goto-create-store');
    var gate = document.getElementById('auth-site-gate');
    var loginPanel = document.getElementById('auth-login');

    if (!allowPublicSignup()) {
      if (regLink) regLink.style.display = 'none';
    } else if (regLink) {
      regLink.style.display = '';
    }

    if (!allowPublicStoreCreate() && createBtn) {
      createBtn.style.display = 'none';
    } else if (createBtn) {
      createBtn.style.display = '';
    }

    var inviteField = document.getElementById('reg-invite-code-wrap');
    if (inviteField) {
      inviteField.style.display = (allowPublicSignup() && registrationInviteRequired()) ? 'block' : 'none';
    }

    if (siteAccessRequired() && !isSiteAccessGranted()) {
      if (gate) gate.style.display = 'block';
      if (loginPanel) loginPanel.style.display = 'none';
      if (regPanel) regPanel.style.display = 'none';
      document.querySelectorAll('.auth-panel').forEach(function (p) {
        if (p.id !== 'auth-site-gate') p.style.display = 'none';
      });
      if (gate) gate.style.display = 'block';
    } else {
      if (gate) gate.style.display = 'none';
    }
  }

  global.ApAccess = {
    siteAccessRequired: siteAccessRequired,
    isSiteAccessGranted: isSiteAccessGranted,
    grantSiteAccess: grantSiteAccess,
    allowPublicSignup: allowPublicSignup,
    allowPublicStoreCreate: allowPublicStoreCreate,
    checkRegistrationInvite: checkRegistrationInvite,
    registrationInviteRequired: registrationInviteRequired,
    applyAuthUI: applyAuthUI
  };
})(typeof window !== 'undefined' ? window : globalThis);
