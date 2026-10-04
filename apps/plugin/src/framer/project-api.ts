import type { framer } from "@framer/plugin"
import { type EditorNode, wrapNativeNode } from "./api.js"
export type NativeProjectApi = Pick<
  typeof framer,
  | "getNode"
  | "getNodesWithType"
  | "getNodesWithAttributeSet"
  | "getColorStyles"
  | "getColorStyle"
  | "getTextStyles"
  | "getTextStyle"
  | "getCollections"
  | "getCollection"
  | "getActiveBranch"
  | "isAllowedTo"
>
export interface CmsField {
  id: string
  name: string
  type: string
  required: boolean
  basedOn: string | null
}
export interface CmsItem {
  id: string
  slug: string
  draft: boolean
  fields: Record<string, { type: string; value: unknown }>
  setFields(
    fields: Record<
      string,
      | { type: "string"; value: string }
      | { type: "number"; value: number }
      | { type: "boolean"; value: boolean }
    >,
  ): Promise<boolean>
}
export interface CmsCollection {
  id: string
  name: string
  managedBy: "user" | "thisPlugin" | "anotherPlugin"
  getFields(): Promise<CmsField[]>
  getItems(): Promise<CmsItem[]>
}
export interface ProjectApi {
  getPages(kind: "web" | "design" | "all"): Promise<EditorNode[]>
  getDefinitions(): Promise<EditorNode[]>
  getSvgs(): Promise<Array<{ id: string; nodeId: string; byteLength: number }>>
  getImages(): Promise<Array<{ id: string; url: string; nodeId: string }>>
  getColorStyles(): Promise<
    Array<{ id: string; name: string; light: string; dark: string | null }>
  >
  getTextStyles(): Promise<
    Array<{
      id: string
      name: string
      fontSize: string
      minWidth: number
      breakpoints: Array<{ minWidth: number; fontSize: string }>
      truncated: boolean
    }>
  >
  getCollections(): Promise<CmsCollection[]>
  getCollection(id: string): Promise<CmsCollection | null>
  getBranch(): Promise<{
    id: string
    title: string
    baseId: string | null
    joined: boolean
  }>
  canSetCms(): boolean
  bindStyle(
    nodeId: string,
    kind: "color" | "text",
    styleId: string,
  ): Promise<boolean>
}
export function createProjectApi(native: NativeProjectApi): ProjectApi {
  function collection(
    raw: Awaited<ReturnType<NativeProjectApi["getCollection"]>> & {},
  ): CmsCollection {
    return {
      id: raw.id,
      name: raw.name,
      managedBy: raw.managedBy,
      getFields: async () =>
        (await raw.getFields()).map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          required: "required" in f && f.required === true,
          basedOn: "basedOn" in f ? f.basedOn : null,
        })),
      getItems: async () =>
        (await raw.getItems()).map((item) => ({
          id: item.id,
          slug: item.slug,
          draft: item.draft,
          fields: item.fieldData,
          setFields: async (fields) =>
            (await item.setAttributes({ fieldData: fields })) !== null,
        })),
    }
  }
  return {
    getPages: async (kind) => {
      const nodes = []
      if (kind !== "design")
        nodes.push(...(await native.getNodesWithType("WebPageNode")))
      if (kind !== "web")
        nodes.push(...(await native.getNodesWithType("DesignPageNode")))
      return nodes.map(wrapNativeNode)
    },
    getDefinitions: async () => {
      const nodes = await native.getNodesWithType("ComponentNode")
      return nodes.map(wrapNativeNode)
    },
    getSvgs: async () =>
      (await native.getNodesWithType("SVGNode")).map((n) => ({
        id: n.id,
        nodeId: n.id,
        byteLength: new TextEncoder().encode(n.svg).byteLength,
      })),
    getImages: async () =>
      (await native.getNodesWithAttributeSet("backgroundImage")).flatMap((n) =>
        n.backgroundImage
          ? [
              {
                id: n.backgroundImage.id,
                url: n.backgroundImage.url,
                nodeId: n.id,
              },
            ]
          : [],
      ),
    getColorStyles: async () =>
      (await native.getColorStyles()).map((s) => ({
        id: s.id,
        name: s.name,
        light: s.light,
        dark: s.dark,
      })),
    getTextStyles: async () =>
      (await native.getTextStyles()).map((s) => ({
        id: s.id,
        name: s.name,
        fontSize: s.fontSize,
        minWidth: s.minWidth,
        breakpoints: s.breakpoints
          .slice(0, 32)
          .map((b) => ({ minWidth: b.minWidth, fontSize: b.fontSize })),
        truncated: s.breakpoints.length > 32,
      })),
    getCollections: async () => (await native.getCollections()).map(collection),
    getCollection: async (id) => {
      const raw = await native.getCollection(id)
      return raw ? collection(raw) : null
    },
    getBranch: async () => {
      const b = await native.getActiveBranch()
      return {
        id: b.id,
        title: b.title,
        baseId: b.baseId ?? null,
        joined: b.hasJoined,
      }
    },
    canSetCms: () => native.isAllowedTo("CollectionItem.setAttributes"),
    bindStyle: async (nodeId, kind, styleId) => {
      const node = await native.getNode(nodeId)
      if (!node || !native.isAllowedTo("Node.setAttributes")) return false
      if (kind === "color") {
        if (node.__class !== "FrameNode") return false
        const style = await native.getColorStyle(styleId)
        return Boolean(
          style && (await node.setAttributes({ backgroundColor: style })),
        )
      }
      if (node.__class !== "TextNode") return false
      const style = await native.getTextStyle(styleId)
      return Boolean(
        style && (await node.setAttributes({ inlineTextStyle: style })),
      )
    },
  }
}
