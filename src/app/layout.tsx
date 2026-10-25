import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BuilderBoss',
  description: 'BuilderBoss proof-of-concept construction project management',
  applicationName: 'BuilderBoss',
  icons: { icon: [{ url: '/icon-192.png', type: 'image/png', sizes: '192x192' }], apple: [{ url: '/icon-180.png', sizes: '180x180', type: 'image/png' }] },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'BuilderBoss' },
};
export const viewport: Viewport = { themeColor: '#143651', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
