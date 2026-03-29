const STORAGE_KEY = 'nexus_jquants_api_key';
const WORKER_URL_KEY = 'nexus_worker_url';

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getWorkerUrl(): string {
  return localStorage.getItem(WORKER_URL_KEY) || '';
}

export function setWorkerUrl(url: string): void {
  localStorage.setItem(WORKER_URL_KEY, url.replace(/\/+$/, ''));
}
