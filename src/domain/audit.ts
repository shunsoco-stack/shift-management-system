import type { AuditLogEntry } from "./types";

function auditIdPart(value: string | number): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createAuditLogEntry(
  entry: Omit<AuditLogEntry, "id">,
): AuditLogEntry {
  const revisionPart = entry.revision === undefined ? "none" : entry.revision;
  return {
    id: [
      "audit",
      auditIdPart(entry.action),
      auditIdPart(entry.entityId),
      auditIdPart(revisionPart),
      auditIdPart(entry.occurredAt),
    ].join("-"),
    ...entry,
  };
}

