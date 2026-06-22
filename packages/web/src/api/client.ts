export class ApiError extends Error {
  retryMs?: number;
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const hasBody = options?.body !== undefined && options.body !== null;
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    let code = "error.unknown";
    let message = res.statusText;
    let retryMs: number | undefined;
    try {
      const body = await res.json() as { error?: { code: string; message: string; retryMs?: number } };
      if (body.error) { code = body.error.code; message = body.error.message; retryMs = body.error.retryMs; }
    } catch { /* ignore */ }
    const err = new ApiError(code, message, res.status);
    err.retryMs = retryMs;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
