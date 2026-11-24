import { APP_URL } from '../env'

/**
 * Adds the canonical URL and og:url for the deployment's public address.
 * Reads VITE_APP_URL only, so moving to a custom domain needs no code change.
 * Does nothing when VITE_APP_URL is not set.
 */
export function applyDeploymentMeta(): void {
  if (!APP_URL) return

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.rel = 'canonical'
    document.head.appendChild(canonical)
  }
  canonical.href = APP_URL

  let ogUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')
  if (!ogUrl) {
    ogUrl = document.createElement('meta')
    ogUrl.setAttribute('property', 'og:url')
    document.head.appendChild(ogUrl)
  }
  ogUrl.content = APP_URL
}
