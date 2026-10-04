import type { AnyNode, FrameNode, TextNode } from "@framer/plugin"
import type {
  DimensionValue,
  LayoutSnapshot,
  NodeRef,
  TextSnapshot,
  VisualSnapshot,
} from "@framer-plus/core"

import type { ProjectApi } from "./project-api.js"

type WritableAttribute =
  | "name"
  | "width"
  | "height"
  | "gap"
  | "padding"
  | "stackAlignment"
  | "opacity"
  | "backgroundColor"
export type EditableAttributes = {
  -readonly [K in WritableAttribute]?: FrameNode[K]
}

/** Deliberate SDK boundary. These objects never cross the bridge. */
export interface EditorNode {
  id: string
  framerType: string
  name?: string | null
  isReplica: boolean
  originalId: string | null
  locked?: boolean
  path?: string | null
  isBreakpoint?: boolean
  isPrimaryBreakpoint?: boolean
  isVariant?: boolean
  inheritsFromId?: string | null
  layout?: LayoutSnapshot
  visual?: VisualSnapshot
  textStyle?: TextSnapshot["style"]
  component?: {
    identifier: string
    name: string | null
    controls: Record<string, unknown>
  }
  variant?: { primary: boolean; gesture: string | null }
  setControls?(controls: Record<string, unknown>): Promise<boolean>
  readParent(): Promise<EditorNode | null>
  readChildren(): Promise<EditorNode[]>
  readText?(): Promise<string | null>
  setAttributes(update: EditableAttributes): Promise<boolean>
  setText?(text: string): Promise<void>
}
export interface EditorApi {
  project?: ProjectApi
  getNode(id: string): Promise<EditorNode | null>
  getCanvasRoot(): Promise<EditorNode>
  getSelection(): Promise<EditorNode[]>
  getProjectInfo(): Promise<{ id: string; name: string }>
  canSetAttributes(): boolean
  canSetText(): boolean
}
export function dimension(raw: string | null): DimensionValue {
  if (raw === "fit-content" || raw === "fit-image") return { mode: raw, raw }
  const match = raw?.match(/^(-?\d+(?:\.\d+)?)(px|%|fr|vh)$/)
  if (!match) return { mode: "unknown", raw }
  const value = Number(match[1])
  const unit = match[2] as "px" | "%" | "fr" | "vh"
  const mode = { px: "fixed", "%": "percentage", fr: "fill", vh: "viewport" }[
    unit
  ] as DimensionValue["mode"]
  return { mode, raw, value, unit }
}
export function ref(id: string, sessionId: string): NodeRef {
  return { id, sessionId }
}

export type NativeApi = {
  getNode(id: string): Promise<AnyNode | null>
  getCanvasRoot(): Promise<AnyNode>
  getSelection(): Promise<AnyNode[]>
  getProjectInfo(): Promise<{ id: string; name: string }>
  isAllowedTo(method: "Node.setAttributes" | "TextNode.setText"): boolean
}

/** Uses only fields and methods declared by @framer/plugin 5.1.0. */
export function wrapNativeNode(node: AnyNode): EditorNode {
  const layout: LayoutSnapshot = {}
  const visual: VisualSnapshot = {}
  if ("position" in node)
    layout.positioning = node.position === "relative" ? "flow" : node.position
  for (const key of [
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
  ] as const)
    if (key in node) {
      const value: unknown = Reflect.get(node, key)
      if (value === null || typeof value === "string")
        layout[key] = dimension(value)
    }
  if ("overflow" in node && typeof node.overflow === "string")
    layout.overflow = node.overflow
  if ("opacity" in node) visual.opacity = node.opacity
  if ("visible" in node) visual.visible = node.visible
  if (node.__class === "FrameNode") {
    layout.kind = node.layout ?? "none"
    layout.gap = node.gap
    layout.padding = node.padding
    layout.direction = node.stackDirection
    layout.alignment = node.stackAlignment
    layout.distribution = node.stackDistribution
    const color = node.backgroundColor
    visual.background =
      typeof color === "string"
        ? { kind: "literal", value: color }
        : color
          ? {
              kind: "style",
              id: color.id,
              name: color.name,
              light: color.light,
              dark: color.dark,
            }
          : { kind: "none" }
    if (node.backgroundImage)
      visual.image = {
        id: node.backgroundImage.id,
        url: node.backgroundImage.url,
      }
  }
  const text = node.__class === "TextNode" ? (node as TextNode) : undefined
  const frame = node.__class === "FrameNode" ? (node as FrameNode) : undefined
  const style = text?.inlineTextStyle
  return {
    ...(node.__class === "ComponentNode" ||
    node.__class === "ComponentInstanceNode"
      ? {
          component: {
            identifier: node.componentIdentifier,
            name: node.componentName,
            controls:
              node.__class === "ComponentInstanceNode" ? node.controls : {},
          },
        }
      : {}),
    ...(node.__class === "ComponentInstanceNode"
      ? {
          setControls: async (controls: Record<string, unknown>) =>
            (await node.setAttributes({ controls })) !== null,
        }
      : {}),
    ...(frame?.isVariant && !frame.isBreakpoint
      ? {
          variant: {
            primary: frame.isPrimaryVariant,
            gesture: frame.gesture,
          },
        }
      : {}),
    id: node.id,
    framerType: node.__class,
    isReplica: node.isReplica,
    originalId: node.originalId,
    ...("name" in node ? { name: node.name } : {}),
    ...("path" in node ? { path: node.path } : {}),
    ...("locked" in node ? { locked: node.locked } : {}),
    ...(frame
      ? {
          isBreakpoint: frame.isBreakpoint,
          isPrimaryBreakpoint: frame.isPrimaryBreakpoint,
          isVariant: frame.isVariant,
          inheritsFromId: frame.inheritsFromId,
        }
      : {}),
    ...(Object.keys(layout).length ? { layout } : {}),
    ...(Object.keys(visual).length ? { visual } : {}),
    ...(style
      ? {
          textStyle: {
            id: style.id,
            name: style.name,
            fontSize: style.fontSize,
            minWidth: style.minWidth,
            breakpoints: style.breakpoints.slice(0, 32).map((item) => ({
              minWidth: item.minWidth,
              fontSize: item.fontSize,
            })),
          },
        }
      : {}),
    readParent: async () => {
      const parent = await node.getParent()
      return parent ? wrapNativeNode(parent) : null
    },
    readChildren: async () => (await node.getChildren()).map(wrapNativeNode),
    ...(text
      ? {
          readText: () => text.getText(),
          setText: (content: string) => text.setText(content),
        }
      : {}),
    setAttributes: async (update) =>
      (await node.setAttributes(update)) !== null,
  }
}

export function createEditorApi(native: NativeApi): EditorApi {
  return {
    getNode: async (id) => {
      const node = await native.getNode(id)
      return node ? wrapNativeNode(node) : null
    },
    getCanvasRoot: async () => wrapNativeNode(await native.getCanvasRoot()),
    getSelection: async () => (await native.getSelection()).map(wrapNativeNode),
    getProjectInfo: () => native.getProjectInfo(),
    canSetAttributes: () => native.isAllowedTo("Node.setAttributes"),
    canSetText: () => native.isAllowedTo("TextNode.setText"),
  }
}
