/** Reusable skeleton components with pulse animation for loading states. */

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-800 ${className ?? ''}`} />;
}

export function SkeletonLine({ width }: { width?: string }) {
  return <Skeleton className={`h-4 ${width ?? 'w-full'}`} />;
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="mx-auto h-4 w-8" />
        ))}
      </div>
      {/* 5 rows x 7 columns grid */}
      <div className="grid grid-cols-7 gap-px rounded-lg border border-neutral-800 bg-neutral-800">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={`cell-${i}`} className="min-h-[4.5rem] bg-neutral-950 p-2">
            <Skeleton className="mx-auto h-7 w-7 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocumentListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={`doc-${i}`} className="flex items-start gap-3 rounded-lg px-4 py-3">
          <Skeleton className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={`h-4 ${i % 2 === 0 ? 'w-3/4' : 'w-1/2'}`} />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {/* Title bar */}
      <Skeleton className="h-8 w-2/3" />
      {/* Text lines of varying widths */}
      <div className="space-y-3 pt-4">
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-5/6" />
        <SkeletonLine width="w-4/5" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-3/4" />
        <SkeletonLine width="w-2/3" />
        <SkeletonLine width="w-5/6" />
      </div>
    </div>
  );
}

export function TodosSkeleton() {
  return (
    <div className="space-y-6">
      {/* Priority section header */}
      <div>
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`todo-${i}`}
              className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <Skeleton className="mt-0.5 h-5 w-5 flex-shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={`h-4 ${i === 0 ? 'w-3/4' : i === 1 ? 'w-1/2' : 'w-2/3'}`} />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Full-page loading skeleton with sidebar + content area. */
export function AppLoadingSkeleton() {
  return (
    <div className="flex h-screen bg-neutral-950">
      {/* Sidebar skeleton */}
      <div className="flex w-56 flex-col border-r border-neutral-800 bg-neutral-900 p-4">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-5 w-20" />
        </div>
        {/* Nav items */}
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`nav-${i}`} className="flex items-center gap-2 rounded-md px-3 py-2">
              <Skeleton className="h-5 w-5 flex-shrink-0" />
              <Skeleton className={`h-4 ${i % 2 === 0 ? 'w-16' : 'w-20'}`} />
            </div>
          ))}
        </div>
      </div>
      {/* Content area skeleton */}
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-8 w-48" />
        <div className="space-y-3">
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-5/6" />
          <SkeletonLine width="w-4/5" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-2/3" />
        </div>
      </div>
    </div>
  );
}
