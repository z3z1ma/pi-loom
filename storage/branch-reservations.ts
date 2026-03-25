import type {
  LoomBranchReservationRecord,
  LoomBranchReservationStatus,
  LoomCanonicalStorage,
  LoomEntityKind,
  LoomId,
} from "./contract.js";
import { createBranchReservationId } from "./ids.js";

export interface BranchReservationOwner {
  ownerKey: string;
  ownerEntityId?: LoomId | null;
  ownerEntityKind?: LoomEntityKind | null;
}

export interface ReserveBranchFamilyInput extends BranchReservationOwner {
  repositoryId: LoomId;
  branchFamily: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  status?: LoomBranchReservationStatus;
}

export interface UpdateBranchReservationStatusInput {
  reservationId: LoomId;
  status: LoomBranchReservationStatus;
  timestamp: string;
}

function requireTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be blank`);
  }
  return trimmed;
}

export function formatBranchReservationName(branchFamily: string, familySequence: number): string {
  if (familySequence < 0) {
    throw new Error(`familySequence must be non-negative; received ${familySequence}`);
  }
  return familySequence === 0 ? branchFamily : `${branchFamily}-${familySequence}`;
}

export function sortBranchReservations(reservations: LoomBranchReservationRecord[]): LoomBranchReservationRecord[] {
  return [...reservations].sort((left, right) => {
    if (left.repositoryId !== right.repositoryId) {
      return left.repositoryId.localeCompare(right.repositoryId);
    }
    if (left.branchFamily !== right.branchFamily) {
      return left.branchFamily.localeCompare(right.branchFamily);
    }
    if (left.familySequence !== right.familySequence) {
      return left.familySequence - right.familySequence;
    }
    return left.id.localeCompare(right.id);
  });
}

export async function listBranchFamilyReservations(
  storage: LoomCanonicalStorage,
  repositoryId: LoomId,
  branchFamily: string,
): Promise<LoomBranchReservationRecord[]> {
  const normalizedFamily = requireTrimmed(branchFamily, "branchFamily");
  const reservations = await storage.listBranchReservations(repositoryId);
  return sortBranchReservations(reservations.filter((reservation) => reservation.branchFamily === normalizedFamily));
}

export async function findBranchReservationByOwner(
  storage: LoomCanonicalStorage,
  repositoryId: LoomId,
  ownerKey: string,
): Promise<LoomBranchReservationRecord | null> {
  const normalizedOwnerKey = requireTrimmed(ownerKey, "ownerKey");
  const reservations = await storage.listBranchReservations(repositoryId);
  return reservations.find((reservation) => reservation.ownerKey === normalizedOwnerKey) ?? null;
}

export async function reserveBranchFamilyName(
  storage: LoomCanonicalStorage,
  input: ReserveBranchFamilyInput,
): Promise<LoomBranchReservationRecord> {
  const repositoryId = requireTrimmed(input.repositoryId, "repositoryId");
  const branchFamily = requireTrimmed(input.branchFamily, "branchFamily");
  const ownerKey = requireTrimmed(input.ownerKey, "ownerKey");
  const ownerEntityId = input.ownerEntityId ?? null;
  const ownerEntityKind = input.ownerEntityKind ?? null;
  const status = input.status ?? "reserved";
  const metadata = input.metadata ?? {};

  return storage.transact(async (tx) => {
    const reservations = sortBranchReservations(await tx.listBranchReservations(repositoryId));
    const existingForOwner = reservations.find((reservation) => reservation.ownerKey === ownerKey) ?? null;
    if (existingForOwner) {
      if (existingForOwner.branchFamily !== branchFamily) {
        throw new Error(
          `Owner ${ownerKey} already reserves ${existingForOwner.branchName} in family ${existingForOwner.branchFamily}; cannot rebind to ${branchFamily}`,
        );
      }
      if (ownerEntityId && existingForOwner.ownerEntityId && existingForOwner.ownerEntityId !== ownerEntityId) {
        throw new Error(
          `Owner ${ownerKey} already binds reservation ${existingForOwner.branchName} to entity ${existingForOwner.ownerEntityId}`,
        );
      }
      if (ownerEntityKind && existingForOwner.ownerEntityKind && existingForOwner.ownerEntityKind !== ownerEntityKind) {
        throw new Error(
          `Owner ${ownerKey} already binds reservation ${existingForOwner.branchName} to entity kind ${existingForOwner.ownerEntityKind}`,
        );
      }
      return existingForOwner;
    }

    const familyReservations = reservations.filter((reservation) => reservation.branchFamily === branchFamily);
    const nextSequence =
      familyReservations.reduce((maxSequence, reservation) => Math.max(maxSequence, reservation.familySequence), -1) +
      1;
    const branchName = formatBranchReservationName(branchFamily, nextSequence);
    const record: LoomBranchReservationRecord = {
      id: createBranchReservationId(repositoryId, ownerKey),
      repositoryId,
      branchFamily,
      familySequence: nextSequence,
      branchName,
      status,
      ownerKey,
      ownerEntityId,
      ownerEntityKind,
      metadata,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    };
    await tx.upsertBranchReservation(record);
    return record;
  });
}

export async function updateBranchReservationStatus(
  storage: LoomCanonicalStorage,
  input: UpdateBranchReservationStatusInput,
): Promise<LoomBranchReservationRecord> {
  return storage.transact(async (tx) => {
    const current = await tx.getBranchReservation(input.reservationId);
    if (!current) {
      throw new Error(`Unknown branch reservation ${input.reservationId}`);
    }
    const updated: LoomBranchReservationRecord = {
      ...current,
      status: input.status,
      updatedAt: input.timestamp,
    };
    await tx.upsertBranchReservation(updated);
    return updated;
  });
}
