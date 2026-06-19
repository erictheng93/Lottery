export interface D1RunResultLike {
  meta: {
    changes?: number;
  };
}

export interface D1ResultLike<T> {
  results: T[];
}

export interface D1BoundStatementLike {
  run<T = unknown>(): Promise<D1RunResultLike & { results?: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1ResultLike<T>>;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1BoundStatementLike;
  run<T = unknown>(): Promise<D1RunResultLike & { results?: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1ResultLike<T>>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface AppEnv {
  DB: D1DatabaseLike;
  INGEST_SECRET?: string;
}
