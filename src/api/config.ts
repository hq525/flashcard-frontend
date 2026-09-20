export interface ApiConfig { baseUrl: string }
export function getApiConfig(): ApiConfig {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  try {
    const url = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(import.meta.env.DEV && local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { throw new Error('API configuration is missing or invalid.'); }
  return { baseUrl };
}
