import { post, setAccessToken, setTokenType, setTokenExpireAt, clearAccessToken } from './client';
import { DEFAULT_USER, DEFAULT_PASS } from '../config';

export type AuthResponse = { tokenType: string; accessToken: string; expireAt: number };

export async function login(userIdentifier?: string, password?: string, forceType?: string) {
  const res = await post<AuthResponse>('/auth/request-token', { userIdentifier: userIdentifier ?? DEFAULT_USER, password: password ?? DEFAULT_PASS }, undefined, { /* Accept added in client */ });
  const { tokenType, accessToken, expireAt } = res.data;
  setTokenType(forceType || tokenType || 'jws'); // allow overriding to 'Bearer' from the panel if needed
  setAccessToken(accessToken);
  setTokenExpireAt(expireAt || 0);
  return res;
}
export function logout() { clearAccessToken(); }