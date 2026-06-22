// First-paint skeletons for the News tab while `useNews` is loading. Pure
// presentational - no props, no state, no inputs.

export function SkeletonPodcast() {
  return (
    <div className="mx-4 mt-3 glass rounded-2xl overflow-hidden animate-pulse">
      <div className="flex">
        <div className="w-24 h-28 shrink-0 bg-white/5" />
        <div className="flex-1 p-3.5 space-y-2">
          <div className="h-2.5 w-16 bg-white/5 rounded" />
          <div className="h-3 w-5/6 bg-white/8 rounded" />
          <div className="h-2 w-3/4 bg-white/5 rounded" />
          <div className="flex gap-2 mt-2">
            <div className="h-5 w-16 bg-white/5 rounded-full" />
            <div className="h-5 w-16 bg-white/5 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonHeadlines() {
  return (
    <div className="animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="p-3 flex items-start gap-3 border-b border-white/5 last:border-b-0">
          <div className="w-20 h-20 rounded-xl bg-white/5 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 w-24 bg-white/5 rounded" />
            <div className="h-3 w-11/12 bg-white/8 rounded" />
            <div className="h-3 w-4/5 bg-white/8 rounded" />
            <div className="h-2 w-3/4 bg-white/5 rounded mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
