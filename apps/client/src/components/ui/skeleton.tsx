import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gradient-to-r from-emerald-200/80 via-emerald-100/80 to-emerald-200/80',
        className
      )}
    />
  )
}
