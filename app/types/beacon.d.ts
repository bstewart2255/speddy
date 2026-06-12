declare global {
  interface Window {
    Beacon?: (method: string, options?: unknown, data?: unknown) => void;
  }
}

export {};
