import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning style={{ fontFamily: 'system-ui', margin: 0, padding: 16 }}>
        {children}
      </body>
    </html>
  );
}
