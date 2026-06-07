/**
 * Настройки Supabase
 * URL: Settings → Data API (без /rest/v1/)
 * Ключ: Settings → API Keys → Publishable key
 *
 * РЕЖИМ ДОСТУПА:
 * - Регистрация открыта для всех (можно создавать аккаунт кассира)
 * - Создание магазина доступно только с мастер-кодом администратора
 * - ADMIN_MASTER_CODE — секретный код, знает только владелец
 *   Без этого кода магазин создать нельзя
 */
window.AP_CONFIG = {
  SUPABASE_URL: 'https://lkidrbdxvzqqboeowyfr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_GXu6lH1Nbv1KnObqYp6EQQ_u9yt3hbX',

  // Код доступа к сайту (выдаётся сотрудникам)
  SITE_ACCESS_CODE: '095market',

  // Регистрация открыта, создание магазина — только с мастер-кодом
  ALLOW_PUBLIC_SIGNUP: true,
  ALLOW_PUBLIC_STORE_CREATE: true,
  REGISTRATION_INVITE_CODE: '',

  // Секретный мастер-код администратора (измените на свой!)
  // Без этого кода нельзя создать новый магазин
  ADMIN_MASTER_CODE: 'Kulsary2023@rasul006'
};
