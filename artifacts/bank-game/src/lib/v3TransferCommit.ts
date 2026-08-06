/**
 * Idempotent commit of a pending manual v3 transfer snapshot.
 * Used after flight completes or when the root system unmounts mid-flight.
 */

import type { EconomyV3RootKind, EconomyV3RootsState } from "@/lib/api";

export type V3PendingTransferCommit = {
  kind: EconomyV3RootKind;
  pendingSnapshot: EconomyV3RootsState;
};

export function v3TransferCommitKey(
  pending: V3PendingTransferCommit,
): string {
  const r = pending.pendingSnapshot.reserves?.[pending.kind];
  const g = pending.pendingSnapshot.generation;
  return [
    pending.kind,
    String(r?.seconds ?? ""),
    String(g?.frozenAt ?? ""),
    String(g?.firstTransferredRoot ?? ""),
    String(pending.pendingSnapshot.roots?.[pending.kind]?.transferred ?? ""),
  ].join("|");
}

/**
 * Apply pending at most once per key. Returns true when onTransferred ran.
 */
export function commitV3TransferPendingOnce(input: {
  pending: V3PendingTransferCommit | null | undefined;
  committedKey: string | null;
  onTransferred?: (snapshot: EconomyV3RootsState) => void;
  onPulse?: (kind: EconomyV3RootKind) => void;
}): { committed: boolean; nextKey: string | null } {
  const pending = input.pending;
  if (!pending) return { committed: false, nextKey: input.committedKey };
  const key = v3TransferCommitKey(pending);
  if (input.committedKey === key) {
    return { committed: false, nextKey: input.committedKey };
  }
  input.onPulse?.(pending.kind);
  input.onTransferred?.(pending.pendingSnapshot);
  return { committed: true, nextKey: key };
}
