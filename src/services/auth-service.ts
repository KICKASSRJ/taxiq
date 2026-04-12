/**
 * Auth service — handles login, registration, and token management.
 */

const TOKEN_KEY = 'cams_auth_token';
const USER_KEY = 'cams_auth_user';

export interface AuthUser {
  username: string;
  displayName: string;
}

export interface UserActivity {
  id: string;
  type: string;
  summary: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface UserProfile {
  username: string;
  displayName: string;
  createdAt: string;
  activity: UserActivity[];
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function register(username: string, password: string, displayName?: string): Promise<AuthUser> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  setAuth(data.token, data.user);
  return data.user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setAuth(data.token, data.user);
  return data.user;
}

export function logout() {
  clearAuth();
}

export async function fetchProfile(): Promise<UserProfile> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch('/api/profile', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) { clearAuth(); throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch profile');
  return data;
}

export async function saveActivity(type: string, summary: string, details: Record<string, unknown> = {}): Promise<void> {
  const token = getToken();
  if (!token) return; // silently skip if not logged in
  await fetch('/api/activity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ type, summary, details }),
  });
}
