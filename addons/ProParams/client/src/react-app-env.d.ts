/// <reference types="vite/client" />

// styled-jsx TS support for: <style jsx>{`...`}</style>
declare module 'react' {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}

declare global {
  interface Window {
    adsk?: {
      fusionSendData: (action: string, data: string) => Promise<string> | string;
    };

    fusionJavaScriptHandler?: {
      handle: (action: string, messageString: string) => string;
    };
  }
}

export {};


