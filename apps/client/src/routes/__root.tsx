import { useState } from 'react'
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts
} from '@tanstack/react-router'
import { RegistryProvider } from '@effect-atom/atom-react'
import { Toaster } from 'sonner'
import { Sidebar } from '@/components/Sidebar'
import { AppHeader } from '@/components/AppHeader'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Radix Vaults' }
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous'
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap'
      }
    ]
  }),
  shellComponent: RootDocument,
  component: RootComponent
})

function RootComponent() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <RegistryProvider>
      <Toaster />
      <div className="app-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="main-content">
          <AppHeader onMenuClick={() => setSidebarOpen(true)} />
          <div className="p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </RegistryProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
