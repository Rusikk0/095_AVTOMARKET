/**
 * Supabase Auth: регистрация, вход, выход, выбор магазина
 */
(function (global) {
  'use strict';

  var sb = null;
  var currentMembership = null;

  function client() {
    if (!sb) sb = global.ApSupabase && global.ApSupabase.createClient();
    return sb;
  }

  function mapMemberRow(row, store) {
    return {
      storeId: row.store_id,
      storeName: store ? store.name : '',
      role: row.role,
      displayName: row.display_name || '',
      active: row.active !== false,
      memberId: row.id
    };
  }

  async function fetchMyStores() {
    var c = client();
    if (!c) return [];
    var uid = (await c.auth.getUser()).data.user;
    if (!uid) return [];

    var members = await c.from('store_members')
      .select('id, store_id, role, display_name, active, stores(id, name, owner_id)')
      .eq('user_id', uid.id)
      .eq('active', true);

    if (members.error) throw members.error;
    return (members.data || []).map(function (row) {
      return mapMemberRow(row, row.stores);
    });
  }

  function authRedirectUrl() {
    var origin = global.location.origin;
    var path = global.location.pathname || '/';
    if (path.endsWith('/')) return origin + path;
    var last = path.lastIndexOf('/');
    return origin + (last >= 0 ? path.slice(0, last + 1) : '/');
  }

  async function signUp(email, password, displayName, hasAdminCode) {
    var c = client();
    if (!c) throw new Error('Supabase не настроен');
    var meta = { display_name: displayName || email.split('@')[0] };
    if (hasAdminCode) meta.is_admin_creator = true;
    var res = await c.auth.signUp({
      email: email.trim().toLowerCase(),
      password: password,
      options: {
        data: meta,
        emailRedirectTo: authRedirectUrl()
      }
    });
    if (res.error) throw res.error;
    return res.data;
  }

  async function signIn(email, password) {
    var c = client();
    if (!c) throw new Error('Supabase не настроен');
    var res = await c.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    });
    if (res.error) throw res.error;
    return res.data;
  }

  async function signOut() {
    var c = client();
    if (c) await c.auth.signOut();
    currentMembership = null;
    try { localStorage.removeItem('ap_current_store_id'); } catch (e) {}
  }

  async function getSession() {
    var c = client();
    if (!c) return null;
    var res = await c.auth.getSession();
    return res.data.session;
  }

  async function getCurrentUser() {
    var c = client();
    if (!c) return null;
    var res = await c.auth.getUser();
    return res.data.user;
  }

  async function createStore(name) {
    var c = client();
    if (!c) throw new Error('Supabase не настроен');
    var res = await c.rpc('create_store', { p_name: name.trim() });
    if (res.error) throw res.error;
    return res.data;
  }

  async function inviteCashier(storeId, email, password, displayName, role) {
    var ep = global.ApSupabase.createEphemeralClient();
    if (!ep) throw new Error('Supabase не настроен');

    var emailToUse = email.trim().toLowerCase();
    if (!emailToUse) {
      emailToUse = displayName.trim().replace(/\s+/g, '_').toLowerCase() + '_' + Date.now().toString(36) + '@sanaq.app';
    }

    var signUp = await ep.auth.signUp({
      email: emailToUse,
      password: password,
      options: { data: { display_name: displayName } }
    });
    if (signUp.error) throw signUp.error;
    if (!signUp.data.user) throw new Error('Не удалось создать пользователя');

    var c = client();
    var added = await c.rpc('add_store_member', {
      p_store_id: storeId,
      p_user_id: signUp.data.user.id,
      p_role: role || 'cashier',
      p_display_name: displayName
    });
    if (added.error) throw added.error;
    return signUp.data.user;
  }

  function setCurrentStore(membership) {
    currentMembership = membership;
    try {
      if (membership) localStorage.setItem('ap_current_store_id', membership.storeId);
      else localStorage.removeItem('ap_current_store_id');
    } catch (e) {}
  }

  function getCurrentStore() {
    return currentMembership;
  }

  async function restoreStoreFromStorage() {
    var stores = await fetchMyStores();
    if (!stores.length) return null;
    var saved = null;
    try { saved = localStorage.getItem('ap_current_store_id'); } catch (e) {}
    var pick = saved ? stores.find(function (s) { return s.storeId === saved; }) : null;
    currentMembership = pick || stores[0];
    return currentMembership;
  }

  async function updateProfile(displayName) {
    var c = client();
    var user = await getCurrentUser();
    if (!user) throw new Error('Не авторизован');
    await c.from('profiles').update({ display_name: displayName, updated_at: new Date().toISOString() }).eq('id', user.id);
    await c.auth.updateUser({ data: { display_name: displayName } });
  }

  async function updatePassword(newPassword) {
    var c = client();
    var res = await c.auth.updateUser({ password: newPassword });
    if (res.error) throw res.error;
  }

  global.ApAuth = {
    client: client,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getCurrentUser: getCurrentUser,
    fetchMyStores: fetchMyStores,
    createStore: createStore,
    inviteCashier: inviteCashier,
    setCurrentStore: setCurrentStore,
    getCurrentStore: getCurrentStore,
    restoreStoreFromStorage: restoreStoreFromStorage,
    updateProfile: updateProfile,
    updatePassword: updatePassword
  };
})(typeof window !== 'undefined' ? window : globalThis);
