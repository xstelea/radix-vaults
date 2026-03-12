import { useState, useCallback } from 'react'
import { useAtom } from '@effect-atom/atom-react'
import type { ProposalId, VaultAddress } from '@radix-vaults/shared'
import { Exit } from 'effect'
import { previewProposal } from '@/atom/proposals'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

interface PreviewResult {
  receipt: Record<string, unknown> | null
  logs: Array<{ level: string; message: string }>
}

export function TransactionPreviewCard({
  vaultAddress,
  proposalId
}: {
  vaultAddress: VaultAddress
  proposalId: ProposalId
}) {
  const [, dispatch] = useAtom(previewProposal, { mode: 'promiseExit' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PreviewResult | null>(null)

  const handlePreview = useCallback(async () => {
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const exit = await dispatch({ vaultAddress, proposalId })
      Exit.match(exit, {
        onSuccess: (r) => setResult(r as PreviewResult),
        onFailure: (cause) => setError(String(cause))
      })
    } finally {
      setLoading(false)
    }
  }, [vaultAddress, proposalId, dispatch])

  const receipt = result?.receipt as Record<string, unknown> | null | undefined
  // RET receipt uses `kind`, gateway receipt uses `status`
  const status = String(receipt?.kind ?? receipt?.status ?? '')
  const isSuccess = status === 'CommitSuccess' || status === 'Succeeded'
  // RET receipt uses `reason`, gateway receipt uses `error_message`
  const errorMessage =
    receipt?.reason || receipt?.error_message
      ? String(receipt?.reason ?? receipt?.error_message)
      : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Transaction Preview</CardTitle>
          <p className="text-sm text-muted-foreground">
            Simulate execution to estimate fees and check for errors.
          </p>
        </div>
        <Button
          onClick={handlePreview}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? 'Previewing...' : 'Run Preview'}
        </Button>
      </CardHeader>

      {error && (
        <CardContent>
          <div className="rounded-md border border-red-900/20 bg-red-50/80 p-4">
            <p className="text-sm font-medium text-red-900">Preview failed</p>
            <p className="mt-1 text-sm text-red-900/80 break-all">{error}</p>
          </div>
        </CardContent>
      )}

      {result && (
        <CardContent className="space-y-4">
          {/* Status banner */}
          <div
            className={`rounded-md border p-4 ${
              isSuccess
                ? 'border-green-200 bg-green-50/80'
                : 'border-red-900/20 bg-red-50/80'
            }`}
          >
            <p
              className={`text-sm font-medium ${isSuccess ? 'text-green-900' : 'text-red-900'}`}
            >
              {isSuccess ? 'Simulation Succeeded' : `Simulation: ${status}`}
            </p>
            {errorMessage && (
              <p
                className={`mt-1 text-sm ${isSuccess ? 'text-green-900/80' : 'text-red-900/80'}`}
              >
                {errorMessage}
              </p>
            )}
          </div>

          {/* Fee summary */}
          {receipt?.fee_summary != null && (
            <FeeSummary
              feeSummary={receipt.fee_summary as Record<string, string>}
            />
          )}

          {/* Logs */}
          {result.logs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Logs
              </h3>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">
                {result.logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      [{log.level}]
                    </span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function FeeSummary({ feeSummary }: { feeSummary: Record<string, string> }) {
  const fields = [
    ['Execution Cost (XRD)', feeSummary.xrd_total_execution_cost],
    ['Finalization Cost (XRD)', feeSummary.xrd_total_finalization_cost],
    ['Storage Cost (XRD)', feeSummary.xrd_total_storage_cost],
    ['Royalty Cost (XRD)', feeSummary.xrd_total_royalty_cost],
    ['Tipping Cost (XRD)', feeSummary.xrd_total_tipping_cost]
  ].filter(([, v]) => v != null) as [string, string][]

  if (fields.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Fee Estimate
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fee Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell className="text-sm">{label}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
