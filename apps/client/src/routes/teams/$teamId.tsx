import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/teams/$teamId')({
  component: TeamLayout
})

function TeamLayout() {
  return <Outlet />
}
