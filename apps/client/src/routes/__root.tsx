import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts
} from '@tanstack/react-router'
import { RegistryProvider } from '@effect-atom/atom-react'
import { ClientOnly } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { WalletConnect } from '@/components/WalletConnect'
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
  return (
    <RegistryProvider>
      <Toaster />
      <div className="app-shell">
        <header className="mx-auto flex max-w-4xl items-center justify-end px-4 py-3">
          <ClientOnly>
            <WalletConnect />
          </ClientOnly>
        </header>
        <Outlet />
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
