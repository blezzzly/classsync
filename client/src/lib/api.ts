import type {
  Activity,
  ActivityFormInput,
  AnswerInput,
  DashboardData,
  JoinActivityResponse,
  LoginInput,
  ProgressEntry,
  AuthSession,
  Submission,
  SubmitRequest,
  SubmitResponse,
} from '@shared/types';

export type ApiErrorKind = 'network' | 'offline' | 'http';

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly details?: unknown;

  constructor(message: string, options: { status: number; kind: ApiErrorKind; details?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.kind = options.kind;
    this.details = options.details;
  }
}

let offlineSimulation = false;

export function setOfflineSimulation(enabled: boolean): void {
  offlineSimulation = enabled;
}

export function isOfflineSimulation(): boolean {
  return offlineSimulation;
}

let authToken: string | undefined;

export function setAuthToken(token: string | undefined): void {
  authToken = token;
}

function authHeaders(): Record<string, string> {
  return authToken ? { authorization: `Bearer ${authToken}` } : {};
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) return body.message;
  } catch {
    // Ignore body parse errors and fall through to the generic message.
  }
  if (response.status === 401) return 'Please sign in to continue';
  if (response.status >= 500) return 'The server had a problem. Please try again.';
  return 'Something went wrong. Please try again.';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (offlineSimulation) {
    throw new ApiError('You are offline', { status: 0, kind: 'offline' });
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...authHeaders(),
        ...((init.headers as Record<string, string>) ?? {}),
      },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', {
      status: 0,
      kind: 'network',
    });
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(message, { status: response.status, kind: 'http' });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const api = {
  login(input: LoginInput): Promise<{ session: AuthSession }> {
    return request('/auth/login', { method: 'POST', body: JSON.stringify(input) });
  },

  health(): Promise<{ status: string }> {
    return request('/health');
  },

  dashboard(): Promise<{ dashboard: DashboardData }> {
    return request('/dashboard');
  },

  listActivities(): Promise<{ activities: Activity[] }> {
    return request('/activities');
  },

  createActivity(input: ActivityFormInput): Promise<{ activity: Activity }> {
    return request('/activities', { method: 'POST', body: JSON.stringify(input) });
  },

  getActivity(id: string): Promise<{ activity: Activity }> {
    return request(`/activities/${encodeURIComponent(id)}`);
  },

  updateActivity(id: string, input: ActivityFormInput): Promise<{ activity: Activity }> {
    return request(`/activities/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteActivity(id: string): Promise<void> {
    return request(`/activities/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  publishActivity(id: string): Promise<{ activity: Activity }> {
    return request(`/activities/${encodeURIComponent(id)}/publish`, { method: 'POST', body: '{}' });
  },

  progress(id: string): Promise<{ roster: ProgressEntry[] }> {
    return request(`/activities/${encodeURIComponent(id)}/progress`);
  },

  startActivity(id: string): Promise<void> {
    return request(`/activities/${encodeURIComponent(id)}/start`, { method: 'POST', body: '{}' });
  },

  join(code: string): Promise<JoinActivityResponse> {
    return request(`/join/${encodeURIComponent(code)}`);
  },

  submit(input: SubmitRequest): Promise<SubmitResponse & { duplicate?: boolean }> {
    return request('/submissions', { method: 'POST', body: JSON.stringify(input) });
  },

  listSubmissions(): Promise<{ submissions: Submission[] }> {
    return request('/submissions');
  },

  getSubmission(id: string): Promise<{ submission: Submission }> {
    return request(`/submissions/${encodeURIComponent(id)}`);
  },

  sync(submissions: SubmitRequest[]): Promise<{
    results: Array<{ clientSubmissionId: string; submission: Submission; duplicate: boolean }>;
  }> {
    return request('/sync', { method: 'POST', body: JSON.stringify({ submissions }) });
  },
};

export type { AnswerInput };
