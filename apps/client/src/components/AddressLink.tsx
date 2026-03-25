/**
 * Truncates a Radix address and links to the Radix Dashboard.
 *
 * account_tdx_2_12ym...942 → account_...wma942
 * resource_tdx_2_1t4x...6vn → resource_...cqr6vn
 */
export function AddressLink({
  address,
  className
}: {
  address: string
  className?: string
}) {
  const isStokenet = address.includes('_tdx_2_')
  const prefix = address.startsWith('account_') ? 'account' : 'resource'
  const dashboardBase = isStokenet
    ? 'https://stokenet-dashboard.radixdlt.com'
    : 'https://dashboard.radixdlt.com'
  const suffix = prefix === 'resource' ? '/summary' : ''
  const href = `${dashboardBase}/${prefix}/${address}${suffix}`
  const truncated = `${prefix}_...${address.slice(-6)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        'font-mono text-xs text-muted-foreground underline decoration-muted-foreground/40 hover:decoration-foreground hover:text-foreground transition-colors'
      }
      title={address}
    >
      {truncated}
    </a>
  )
}
