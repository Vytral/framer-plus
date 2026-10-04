/** References are adapter/editor scoped; Framer IDs are not globally permanent. */
export interface NodeRef {
  id: string
  sessionId?: string
}
export type NodeType =
  | "page"
  | "frame"
  | "stack"
  | "text"
  | "image"
  | "svg"
  | "component"
  | "component-instance"
  | "unknown"
export interface DimensionValue {
  mode:
    | "fixed"
    | "percentage"
    | "fill"
    | "fit-content"
    | "fit-image"
    | "viewport"
    | "unknown"
  raw: string | null
  value?: number
  unit?: "px" | "%" | "fr" | "vh"
}
export interface LayoutSnapshot {
  kind?: "stack" | "grid" | "none"
  positioning?: "flow" | "absolute" | "fixed" | "sticky"
  width?: DimensionValue
  height?: DimensionValue
  minWidth?: DimensionValue
  maxWidth?: DimensionValue
  minHeight?: DimensionValue
  maxHeight?: DimensionValue
  gap?: string | null
  padding?: string | null
  direction?: "horizontal" | "vertical" | null
  alignment?: "start" | "center" | "end" | null
  distribution?: string | null
  overflow?: string
}
export type ColorValue =
  | { kind: "literal"; value: string }
  | {
      kind: "style"
      id: string
      name: string
      light: string
      dark: string | null
    }
  | { kind: "none" }
export interface VisualSnapshot {
  opacity?: number
  visible?: boolean
  background?: ColorValue
  image?: { id: string; url: string }
}
export interface TextSnapshot {
  content: string | null
  truncated: boolean
  style?: {
    id: string
    name: string
    fontSize: string
    minWidth: number
    breakpoints: Array<{ minWidth: number; fontSize: string }>
  }
}
export interface NodeCapabilities {
  read: boolean
  treeRead: boolean
  writableProperties: string[]
  breakpointWritableProperties: string[]
  clearBreakpointOverride: false
}
export interface DesignNode {
  ref: NodeRef
  type: NodeType
  name?: string | null
  parent?: NodeRef | null
  children?: NodeRef[]
  childrenTruncated?: boolean
  layout?: LayoutSnapshot
  visual?: VisualSnapshot
  text?: TextSnapshot
  capabilities: NodeCapabilities
  metadata: {
    framerType: string
    isReplica: boolean
    originalId: string | null
    locked?: boolean
    isVariant?: boolean
    isBreakpoint?: boolean
    isPrimaryBreakpoint?: boolean
    path?: string | null
  }
  revision: string
  warnings: string[]
}
export interface Breakpoint {
  ref: NodeRef
  name: string | null
  width: DimensionValue
  primary: boolean
  inheritsFrom: NodeRef | null
}
export type ResponsiveProperty = {
  effective: string | number | boolean | null
  source: { kind: "base" | "unknown" }
  overrideStatus: "unknown" | "not_applicable"
}
