import { EditorAdapter } from "../../src/framer/adapter.js"
import type {
  CmsCollection,
  CmsField,
  CmsItem,
  ProjectApi,
} from "../../src/framer/project-api.js"
import { editorFixture, TEST_SESSION } from "./editor.js"
export function projectFixture() {
  const f = editorFixture()
  f.add("button-definition", null, "ComponentNode", {
    component: { identifier: "button-module", name: "Button", controls: {} },
  })
  f.add("default-variant", "button-definition", "FrameNode", {
    isVariant: true,
    variant: { primary: true, gesture: null },
  })
  f.add("hover-variant", "button-definition", "FrameNode", {
    isVariant: true,
    variant: { primary: false, gesture: "hover" },
    inheritsFromId: "default-variant",
  })
  f.add("button", "hero", "ComponentInstanceNode", {
    component: {
      identifier: "button-module",
      name: "Button",
      controls: {
        label: "Buy",
        radius: 8,
        enabled: true,
        binding: { id: "variable" },
      },
    },
  })
  f.add("other-button", "hero", "ComponentInstanceNode", {
    component: {
      identifier: "button-module",
      name: "Button",
      controls: { label: "Buy", radius: 8 },
    },
  })
  const records = [
    {
      id: "item",
      slug: "article",
      draft: true,
      fields: {
        title: { type: "string", value: "Before" },
        count: { type: "number", value: 1 },
        active: { type: "boolean", value: false },
        rich: { type: "formattedText", value: { html: "rich" } },
      },
    },
  ]
  const fields: CmsField[] = [
    {
      id: "title",
      name: "Title",
      type: "string",
      required: true,
      basedOn: null,
    },
    {
      id: "count",
      name: "Count",
      type: "number",
      required: false,
      basedOn: null,
    },
    {
      id: "active",
      name: "Active",
      type: "boolean",
      required: false,
      basedOn: null,
    },
    {
      id: "rich",
      name: "Rich",
      type: "formattedText",
      required: false,
      basedOn: null,
    },
  ]
  const projectWrites: Array<{ kind: string; id: string; value: unknown }> = []
  const settings = {
    cmsPermission: true,
    managedBy: "user" as CmsCollection["managedBy"],
    branchId: "main",
    projectId: "hashed-project-id",
    failAfterWrite: false,
    failBinding: false,
  }
  const rawGet = f.api.getNode
  f.api.getNode = async (id) => {
    const node = await rawGet(id)
    if (node?.component && node.framerType === "ComponentInstanceNode")
      node.setControls = async (controls) => {
        projectWrites.push({ kind: "controls", id, value: controls })
        const stored = f.state.get(id)?.node.component
        if (!stored) return false
        Object.assign(stored.controls, controls)
        if (settings.failAfterWrite) throw Error("After native write")
        return true
      }
    return node
  }
  f.api.getProjectInfo = async () => ({
    id: settings.projectId,
    name: "Fixture",
  })
  const collection: CmsCollection = {
    id: "articles",
    name: "Articles",
    get managedBy() {
      return settings.managedBy
    },
    getFields: async () => structuredClone(fields),
    getItems: async () =>
      records.map(
        (record) =>
          ({
            ...structuredClone(record),
            setFields: async (patch) => {
              projectWrites.push({ kind: "cms", id: record.id, value: patch })
              Object.assign(record.fields, patch)
              if (settings.failAfterWrite) throw Error("After write")
              return true
            },
          }) as CmsItem,
      ),
  }
  const colors = [
    { id: "brand", name: "Brand", light: "rgba(1,2,3,1)", dark: null },
  ]
  const textStyles = [
    {
      id: "heading",
      name: "Heading",
      fontSize: "24px",
      minWidth: 0,
      breakpoints: [],
      truncated: false,
    },
  ]
  const api: ProjectApi = {
    openPage: async (id) => f.setCanvas(id),
    getPages: async (kind) =>
      [...f.state.values()]
        .filter((s) =>
          kind === "all"
            ? ["WebPageNode", "DesignPageNode"].includes(s.node.framerType)
            : s.node.framerType ===
              (kind === "web" ? "WebPageNode" : "DesignPageNode"),
        )
        .map((s) => f.api.getNode(s.node.id))
        .reduce(
          async (pending, node) => {
            const result = await pending
            const value = await node
            if (value) result.push(value)
            return result
          },
          Promise.resolve([] as import("../../src/framer/api.js").EditorNode[]),
        ),
    getDefinitions: async () =>
      [await f.api.getNode("button-definition")].filter((n) => n !== null),
    getSvgs: async () => [{ id: "svg", nodeId: "svg", byteLength: 120 }],
    getImages: async () => [
      { id: "image", url: "https://example.com/image.png", nodeId: "hero" },
      {
        id: "image",
        url: "https://example.com/image.png",
        nodeId: "other-button",
      },
    ],
    getColorStyles: async () => colors,
    getTextStyles: async () => textStyles,
    getCollections: async () => [collection],
    getCollection: async (id) => (id === collection.id ? collection : null),
    getBranch: async () => ({
      id: settings.branchId,
      title: settings.branchId,
      baseId: null,
      joined: true,
    }),
    canSetCms: () => settings.cmsPermission,
    bindStyle: async (id, kind, styleId) => {
      projectWrites.push({ kind: "binding", id, value: styleId })
      const n = f.state.get(id)?.node
      if (!n) return false
      if (settings.failBinding) return true
      if (kind === "color") {
        n.visual ??= {}
        n.visual.background = {
          kind: "style",
          ...{ id: "brand", name: "Brand", light: "rgba(1,2,3,1)", dark: null },
          id: styleId,
        }
      } else
        n.textStyle = {
          id: styleId,
          name: "Heading",
          fontSize: "24px",
          minWidth: 0,
          breakpoints: [],
        }
      if (settings.failAfterWrite) throw Error("After binding")
      return true
    },
  }
  f.api.project = api
  return {
    ...f,
    adapter: new EditorAdapter(f.api, TEST_SESSION),
    projectWrites,
    settings,
    records,
    fields,
    colors,
    textStyles,
    collection,
  }
}
