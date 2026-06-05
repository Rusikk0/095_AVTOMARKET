/**
 * Инициализация клиента Supabase (CDN: @supabase/supabase-js@2)
 */
(function (global) {
  'use strict';

  function getConfig() {
    var cfg = global.AP_CONFIG || {};
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf('YOUR_PROJECT') >= 0) {
      return null;
    }
    return cfg;
  }

  function createClient() {
    var cfg = getConfig();
    if (!cfg) {
      console.warn('[ApSupabase] Заполните js/config.js (SUPABASE_URL и SUPABASE_ANON_KEY)');
      return null;
    }
    if (!global.supabase || !global.supabase.createClient) {
      console.error('[ApSupabase] Библиотека supabase-js не загружена');
      return null;
    }
    return global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage
      }
    });
  }

  global.ApSupabase = {
    getConfig: getConfig,
    createClient: createClient,
    createEphemeralClient: function () {
      var cfg = getConfig();
      if (!cfg || !global.supabase) return null;
      return global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
