import {
  EconomicError,
  freezeDeep,
  ParticipantCategory,
  requireIdentifier,
  requireNonnegative,
} from "./shared";

export type RewardUnitState = "PENDING" | "VALIDATED" | "REJECTED" | "CONSUMED" | "REVERSED";
export interface RewardUnitRecord {
  readonly id: string;
  readonly userId: string;
  readonly activityId: string;
  readonly category: ParticipantCategory;
  readonly amountMicros: bigint;
  readonly state: RewardUnitState;
  readonly ruleVersion: string;
  readonly distributionId?: string;
}
export interface RewardUnitTransition {
  readonly unitId: string;
  readonly previousState: RewardUnitState;
  readonly nextState: RewardUnitState;
  readonly reason: string;
  readonly distributionId?: string;
}
const TRANSITIONS: Readonly<Record<RewardUnitState, readonly RewardUnitState[]>> = {
  PENDING: ["VALIDATED", "REJECTED", "REVERSED"],
  VALIDATED: ["CONSUMED", "REVERSED"],
  REJECTED: [],
  CONSUMED: [],
  REVERSED: [],
};

/** Returns an audit event; never overwrites or deletes the origin record. */
export function transitionRewardUnit(
  record: RewardUnitRecord,
  state: RewardUnitState,
  reason: string,
  distributionId?: string,
): Readonly<RewardUnitTransition> {
  requireIdentifier(record.id, "reward unit");
  requireIdentifier(reason, "transition reason");
  requireNonnegative(record.amountMicros, "reward units");
  if (!TRANSITIONS[record.state]?.includes(state))
    throw new EconomicError("INVALID_RU_TRANSITION", `${record.state} -> ${state}`);
  if (state === "CONSUMED") requireIdentifier(distributionId ?? "", "finalized distribution");
  else if (distributionId) throw new EconomicError("UNEXPECTED_DISTRIBUTION_REFERENCE");
  return freezeDeep({
    unitId: record.id,
    previousState: record.state,
    nextState: state,
    reason,
    ...(distributionId ? { distributionId } : {}),
  });
}

/** Settled payouts/distributions need a reviewed compensating operation, never history edits. */
export function reverseRewardUnit(
  record: RewardUnitRecord,
  reason: string,
): Readonly<
  | { kind: "REVERSE"; transition: Readonly<RewardUnitTransition> }
  | {
      kind: "POST_FINALIZATION_REVIEW";
      unitId: string;
      distributionId: string;
      reason: string;
      economicHoldRequired: true;
    }
> {
  requireIdentifier(reason, "reversal reason");
  if (record.state === "CONSUMED") {
    requireIdentifier(record.distributionId ?? "", "finalized distribution");
    return freezeDeep({
      kind: "POST_FINALIZATION_REVIEW",
      unitId: record.id,
      distributionId: record.distributionId!,
      reason,
      economicHoldRequired: true,
    });
  }
  return freezeDeep({
    kind: "REVERSE",
    transition: transitionRewardUnit(record, "REVERSED", reason),
  });
}
