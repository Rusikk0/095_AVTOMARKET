/**
 * Скопируйте как js/config.js
 */
window.AP_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_...',

  // Код на экране входа (кто знает ссылку — без кода не войдёт). Пусто = без кода.
  SITE_ACCESS_CODE: 'ваш-секретный-код',

  // false = нет кнопки «Регистрация»; новых людей добавляет только админ («Пригласить кассира»)
  ALLOW_PUBLIC_SIGNUP: false,

  // false = нельзя создать новый магазин с сайта (только существующие)
  ALLOW_PUBLIC_STORE_CREATE: false,

  // Если ALLOW_PUBLIC_SIGNUP true — можно требовать код при регистрации
  REGISTRATION_INVITE_CODE: ''
};
