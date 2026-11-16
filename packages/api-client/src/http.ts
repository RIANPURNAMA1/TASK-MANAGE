import type { ApiErrorBody, AuthResponse, ErrorCode } from '@nexus/shared';
import { SOCKET_ID_HEADER } from '@nexus/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HttpClientOptions {
  /** e.g. `/api/v1` (web, same-origin) or `https://api.example.com/api/v1` (desktop). */
  baseUrl: string;
  /** Lets the server avoid echoing real-time events back to the tab that caused them. */
  getSocketId?: () => string | undefined;
  /** Called when the session can no longer be refreshed. */
  onSessionExpired?: () => void;
  /** Called whenever a fresh access token is obtained. */
  onAuthenticated?: (auth: AuthResponse) => void;
  /** Sent with every request (desktop: `x-desktop-device`). */
  clientHeaders?: Record<string, string>;
  /**
   * Desktop only: where the refresh token lives (OS keychain). When set, the token is sent
   * in the body of `/auth/refresh` + `/auth/logout` and every newly issued one is saved.
   * Web leaves this unset and relies on the httpOnly cookie.
   */
  refreshTokenStore?: RefreshTokenStore;
}

export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Skip the Authorization header and the 401 → refresh → retry cycle. */
  anonymous?: boolean;
}

/**
 * Thin fetch wrapper that owns the in-memory access token (PRD §8: never persisted)
 * and transparently refreshes it once on a 401. Concurrent 401s share one refresh call.
 */
export class HttpClient {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<AuthResponse | null> | null = null;

  constructor(private readonly options: HttpClientOptions) {}

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, { query });
  }
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>): Promise<T> {
    return this.request<T>('POST', path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body });
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }
  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /** Exchanges the refresh cookie (web) or stored token (desktop) for a new access token. Returns null when logged out. */
  refresh(): Promise<AuthResponse | null> {
    this.refreshInFlight ??= this.refreshBody()
      .then((body) =>
        body === null
          ? Promise.reject(new ApiError(401, 'UNAUTHENTICATED', 'Belum masuk'))
          : this.request<AuthResponse>('POST', '/auth/refresh', { anonymous: true, body }),
      )
      .then((auth) => {
        this.accessToken = auth.accessToken;
        this.options.onAuthenticated?.(auth);
        return auth;
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          this.accessToken = null;
          void this.options.refreshTokenStore?.set(null);
          return null;
        }
        throw error;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  /** Ends the session server-side and forgets the stored refresh token (desktop). */
  async logout(): Promise<void> {
    const body = await this.refreshBody();
    try {
      await this.request<void>('POST', '/auth/logout', { anonymous: true, body: body ?? undefined });
    } finally {
      this.accessToken = null;
      await this.options.refreshTokenStore?.set(null);
    }
  }

  /** `undefined` → cookie mode (web); `null` → desktop without a stored token. */
  private async refreshBody(): Promise<{ refreshToken: string } | undefined | null> {
    const store = this.options.refreshTokenStore;
    if (!store) return undefined;
    const token = await store.get();
    return token ? { refreshToken: token } : null;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await this.send(method, path, opts);

    if (response.status === 401 && !opts.anonymous) {
      const auth = await this.refresh();
      if (!auth) {
        this.options.onSessionExpired?.();
        throw await toApiError(response);
      }
      return this.parse<T>(await this.send(method, path, opts));
    }

    return this.parse<T>(response);
  }

  private send(method: string, path: string, opts: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...this.options.clientHeaders };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!opts.anonymous && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    const socketId = this.options.getSocketId?.();
    if (socketId) headers[SOCKET_ID_HEADER] = socketId;

    return fetch(this.options.baseUrl + path + toQueryString(opts.query), {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    const data = (await response.json()) as T;
    await this.captureRefreshToken(data);
    return data;
  }

  /** Login, setup, invitation, SSO exchange and refresh all return a rotated token on desktop. */
  private async captureRefreshToken(data: unknown): Promise<void> {
    const store = this.options.refreshTokenStore;
    if (!store || typeof data !== 'object' || data === null) return;
    const auth = 'auth' in data && typeof data.auth === 'object' && data.auth !== null ? data.auth : data;
    if ('refreshToken' in auth && typeof auth.refreshToken === 'string') await store.set(auth.refreshToken);
  }
}

function toQueryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.clone().json()) as ApiErrorBody;
    return new ApiError(response.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(response.status, 'INTERNAL_ERROR', response.statusText || 'Request failed');
  }
}
