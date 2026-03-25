import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import { Exit } from 'effect'
import { useState } from 'react'
import { createTeam, teamsListAtom } from '@/atom/teams'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const Route = createFileRoute('/teams/create')({
  component: CreateTeamPage
})

function CreateTeamPage() {
  const navigate = useNavigate()
  const refreshTeams = useAtomRefresh(teamsListAtom)
  const [, dispatch] = useAtom(createTeam, { mode: 'promiseExit' })
  const [name, setName] = useState('')
  const [virtualBadge, setVirtualBadge] = useState('')
  const [memberName, setMemberName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const exit = await dispatch({
      name: name.trim(),
      virtualBadge: virtualBadge.trim(),
      memberName: memberName.trim()
    })

    setSubmitting(false)

    Exit.match(exit, {
      onFailure: (cause) => {
        const msg = String(cause)
        if (msg.includes('CreateTeamFailedError')) {
          const match = msg.match(/message":\s*"([^"]+)"/)
          setError(match?.[1] ?? 'Team creation failed. Please try again.')
        } else {
          setError(`Create team failed: ${msg}`)
        }
      },
      onSuccess: (result) => {
        refreshTeams()
        navigate({
          to: '/teams/$teamId/team/add-member',
          params: { teamId: result.teamId }
        })
      }
    })
  }

  return (
    <main className="max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground sm:min-h-10 flex items-center flex-wrap">
        <Link to="/" className="hover:text-foreground">
          My Teams
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">Create Team</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create Team</CardTitle>
          <CardDescription>
            Create a new team with an on-chain badge resource. You will be the
            first member of the team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Team Name
              </label>
              <input
                id="name"
                type="text"
                required
                placeholder="My Team"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="virtualBadge" className="text-sm font-medium">
                Virtual Badge
              </label>
              <input
                id="virtualBadge"
                type="text"
                required
                placeholder="resource_tdx_2_...:..."
                value={virtualBadge}
                onChange={(e) => setVirtualBadge(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Your virtual signature badge NonFungibleGlobalId (e.g.
                resource_tdx_2_...[hex]).
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="memberName" className="text-sm font-medium">
                Your Name
              </label>
              <input
                id="memberName"
                type="text"
                required
                placeholder="Alice"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                maxLength={100}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Display name stored in the NFT badge metadata.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Team'}
              </Button>
              <Link to="/">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
