import { treaty } from '@elysiajs/eden'
import type { App } from '@/app/api/[[...slugs]]/route'

// Dynamic URL: uses localhost in dev, Vercel URL in production
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // Browser: use current origin
    return window.location.origin
  }
  // Server: use VERCEL_URL or localhost
  return process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000'
}

export const client = treaty<App>(getBaseUrl()).api
