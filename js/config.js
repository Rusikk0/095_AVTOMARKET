/**
 * Настройки Supabase
 * URL: Settings → Data API (без /rest/v1/)
 * Ключ: Settings → API Keys → Publishable key
 *
 * РЕЖИМ ДОСТУПА: только по приглашению
 * - Регистрация отключена (ALLOW_PUBLIC_SIGNUP: false)
 * - Самостоятельное создание магазинов отключено (ALLOW_PUBLIC_STORE_CREATE: false)
 * - Новых кассиров добавляет только администратор через «Кассиры → Пригласить кассира»
 */
window.AP_CONFIG = {
  SUPABASE_URL: 'https://lkidrbdxvzqqboeowyfr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_GXu6lH1Nbv1KnObqYp6EQQ_u9yt3hbX',

  // Код доступа к сайту (выдаётся сотрудникам)
  SITE_ACCESS_CODE: '095market',

  // Регистрация и создание магазинов — только по приглашению админа
  ALLOW_PUBLIC_SIGNUP: false,
  ALLOW_PUBLIC_STORE_CREATE: false,
  REGISTRATION_INVITE_CODE: ''
};
