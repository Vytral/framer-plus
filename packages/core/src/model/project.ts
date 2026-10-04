import type { NodeRef } from "./design.js"
export type ScalarValue = string | number | boolean
export interface ComponentIdentity {
  identifier: string
  definition: NodeRef | null
  resolution: "resolved" | "external_or_unavailable" | "ambiguous"
}
export interface ComponentControl {
  value: ScalarValue | null
  available: boolean
  writable: boolean
  override: "unknown"
}
export interface ProjectBranch {
  id: string
  title: string
  baseId: string | null
  joined: boolean
}
export interface CollectionInfo {
  id: string
  name: string
  managedBy: "user" | "thisPlugin" | "anotherPlugin"
  writable: boolean
}
export interface ReferencedImage {
  id: string
  url: string
  nodes: NodeRef[]
}
export type ChangePlanStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executing"
  | "completed"
  | "partial"
  | "failed"
  | "expired"
