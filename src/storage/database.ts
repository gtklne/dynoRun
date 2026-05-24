export type SqlParam = string | number | null | Uint8Array;
export type Row = Record<string, SqlParam>;

export interface Database {
  execute(sql: string, params?: SqlParam[]): Promise<void>;
  query<T extends Row = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
