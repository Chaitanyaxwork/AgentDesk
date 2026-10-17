import type { WidgetConfig } from '@/lib/types';

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  primary_color: '#2563eb',
  text_color: '#ffffff',
  welcome_message: 'Hello! How can I help you today?',
  bot_name: 'Support Bot',
  bot_avatar_url: null,
  position: 'bottom-right',
  show_branding: true,
  auto_open_delay_ms: null,
  placeholder_text: 'Type a message...',
  offline_message: 'We are unavailable. Please contact this business directly.',
};

const COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3}|[0-9a-f]{5})?$/i;

function boundedString(value: unknown, key: string, fallback: string, max: number): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`${key} must be text.`);
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!normalized || normalized.length > max) throw new Error(`${key} must contain 1 to ${max} characters.`);
  return normalized;
}

export function normalizeWidgetConfig(input: unknown, base: WidgetConfig = DEFAULT_WIDGET_CONFIG): WidgetConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Widget configuration must be an object.');
  const value = input as Record<string, unknown>;
  const color = (key: 'primary_color' | 'text_color', fallback: string) => {
    const candidate = value[key] === undefined ? fallback : value[key];
    if (typeof candidate !== 'string' || !COLOR_RE.test(candidate)) throw new Error(`${key} must be a hex color.`);
    return candidate.toLowerCase();
  };

  const avatarValue = value.bot_avatar_url === undefined ? base.bot_avatar_url : value.bot_avatar_url;
  let avatar: string | null;
  if (avatarValue === null || avatarValue === '') avatar = null;
  else if (typeof avatarValue === 'string') avatar = avatarValue;
  else throw new Error('bot_avatar_url must be a secure HTTPS URL.');
  if (avatar !== null && avatar !== '') {
    if (typeof avatar !== 'string' || avatar.length > 2048) throw new Error('bot_avatar_url must be a secure HTTPS URL.');
    let url: URL;
    try { url = new URL(avatar); } catch { throw new Error('bot_avatar_url must be a secure HTTPS URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('bot_avatar_url must be a secure HTTPS URL.');
    avatar = url.toString();
  } else avatar = null;

  const position = value.position === undefined ? base.position : value.position;
  if (position !== 'bottom-left' && position !== 'bottom-right') throw new Error('position is invalid.');
  const delay = value.auto_open_delay_ms === undefined ? base.auto_open_delay_ms : value.auto_open_delay_ms;
  if (delay !== null && (typeof delay !== 'number' || !Number.isInteger(delay) || delay < 0 || delay > 30_000)) {
    throw new Error('auto_open_delay_ms must be between 0 and 30000 milliseconds.');
  }
  const showBranding = value.show_branding === undefined ? base.show_branding : value.show_branding;
  if (typeof showBranding !== 'boolean') throw new Error('show_branding must be a boolean.');

  return {
    primary_color: color('primary_color', base.primary_color),
    text_color: color('text_color', base.text_color),
    welcome_message: boundedString(value.welcome_message, 'welcome_message', base.welcome_message, 500),
    bot_name: boundedString(value.bot_name, 'bot_name', base.bot_name, 60),
    bot_avatar_url: avatar,
    position,
    show_branding: showBranding,
    auto_open_delay_ms: delay,
    placeholder_text: boundedString(value.placeholder_text, 'placeholder_text', base.placeholder_text, 80),
    offline_message: boundedString(value.offline_message, 'offline_message', base.offline_message, 300),
  };
}
