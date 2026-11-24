// TEMPORARY PLACEHOLDER.
// The real CreatorHub source (src/, contracts/, scripts/, docs/, archive/) was never
// pushed to the repository, so `vite build` had no entry point and every deploy failed.
// This file only exists so the site builds. Replace it by pushing the real src/ folder
// (overwrite or delete this file when you do).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

function Placeholder() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: '#122d45',
        color: '#ffffff',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '32rem' }}>
        <h1
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: '2.5rem',
            margin: '0 0 1rem',
          }}
        >
          CreatorHub
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, opacity: 0.85, margin: 0 }}>
          The marketplace is being updated and will be back shortly.
        </p>
      </div>
    </main>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Placeholder />
    </StrictMode>,
  )
}
