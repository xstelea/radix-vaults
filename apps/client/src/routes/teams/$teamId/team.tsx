import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/teams/$teamId/team')({
  component: () => <Outlet />
})
