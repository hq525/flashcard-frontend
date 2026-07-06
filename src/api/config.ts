export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

export function getApiConfig(): ApiConfig {
  return {
    baseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
    apiKey: import.meta.env.VITE_API_KEY ?? '',
  };
}
