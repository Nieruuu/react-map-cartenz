// src/lib/api/auth.ts
import { post, setAccessToken, setTokenType, setTokenExpireAt, clearAccessToken } from './client';
import { DEFAULT_USER, DEFAULT_PASS } from '../config';

export type AuthResponse = { data: { tokenType: string; accessToken: string; expireAt: number } };

export async function login(userIdentifier?: string, password?: string): Promise<AuthResponse> {
  const res = await post<AuthResponse>('/auth/request-token', {
    userIdentifier: userIdentifier ?? DEFAULT_USER,
    password: password ?? DEFAULT_PASS
  });
  const { tokenType, accessToken, expireAt } = res.data;
  setTokenType(tokenType || 'jws');
  setAccessToken(accessToken);
  setTokenExpireAt(expireAt || 0);
  return res;
}

export function logout() { clearAccessToken(); }
