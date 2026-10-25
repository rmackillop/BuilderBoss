import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'BuilderBoss',
    short_name: 'BuilderBoss',
    description: 'Construction projects, simplified',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8fa',
    theme_color: '#143651',
    icons: [{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'maskable'}],
  };
}
