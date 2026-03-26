// src/pyodide.d.ts
// TypeScript declarations for Pyodide

declare global {
  /**
   * Load Pyodide WASM runtime
   * Available globally after loading pyodide.js from CDN
   */
  function loadPyodide(config?: {
    indexURL?: string;
    fullStdLib?: boolean;
    stdin?: () => string;
    stdout?: (msg: string) => void;
    stderr?: (msg: string) => void;
  }): Promise<PyodideInterface>;

  interface PyodideInterface {
    runPython(code: string): any;
    runPythonAsync(code: string): Promise<any>;
    loadPackage(packages: string | string[]): Promise<void>;
    globals: PyodideGlobals;
    FS: any;
    PATH: any;
    ERRNO_CODES: any;
  }

  interface PyodideGlobals {
    get(name: string): any;
    set(name: string, value: any): void;
    delete(name: string): void;
    has(name: string): boolean;
    toJs(options?: { depth?: number }): any;
  }
}

export {};
