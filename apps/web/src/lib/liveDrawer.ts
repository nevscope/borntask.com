type LiveDrawerGuard = {
  taskKey: string;
  actorId?: string;
  isDirty: () => boolean;
  onRemoteChange: () => void;
};

let guard: LiveDrawerGuard | null = null;

export function setLiveDrawerGuard(next: LiveDrawerGuard | null) {
  guard = next;
}

export function liveDrawerGuard() {
  return guard;
}
