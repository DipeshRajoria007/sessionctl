declare module 'better-sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(pragma: string): any;
    transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
    close(): void;
  }

  interface Statement {
    run(...params: any[]): { changes: number; lastInsertRowid: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  interface DatabaseConstructor {
    new (filename: string, options?: any): Database;
    (filename: string, options?: any): Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}

declare module 'uuid' {
  export function v4(): string;
}

declare module 'ws' {
  import { Server as HttpServer } from 'http';
  import { EventEmitter } from 'events';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    readyState: number;
    send(data: string | Buffer): void;
    close(): void;
    terminate(): void;
    ping(): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>;
    constructor(options: { server?: HttpServer; path?: string });
    close(): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}
