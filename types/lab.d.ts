import { Flags } from 'lab';

declare module 'lab' {
  interface Flags {
    mustCall?: <T extends (...args: any[]) => any>(fn: T, count?: number) => (...args: Parameters<T>) => ReturnType<T>;
  }
}
