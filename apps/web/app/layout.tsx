import type { ReactNode } from 'react';
import { AuthProvider } from '../lib/auth';
import './globals.css';

export const metadata = { title: 'CogniCare — แพลตฟอร์มฝึกสมองและติดตามอาการ' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* same font link as the HTML prototype */}
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div id="app">
          <AuthProvider>{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}
