import {
  type DesignIR,
  type DesignSnapshot,
  snapshotSchema,
  toDesignIR,
} from "@framer-plus/design"
import {
  BridgeError,
  type Method,
  type MethodInput,
  type MethodResult,
} from "@framer-plus/protocol"
export interface DesignReader {
  request<M extends Method>(
    method: M,
    params: MethodInput<M>,
  ): Promise<MethodResult<M>>
}
export async function captureDesign(
  reader: DesignReader,
  sessionId?: string,
  maxNodes = 200,
  roles: Record<string, string> = {},
): Promise<{ snapshot: DesignSnapshot; ir: DesignIR }> {
  const deadline = Date.now() + 30000
  const guard = () => {
    if (Date.now() >= deadline)
      throw new BridgeError(
        "BRIDGE_TIMEOUT",
        "Design capture exceeded its 30-second budget; choose a smaller canvas",
        false,
      )
  }
  async function request<M extends Method>(
    method: M,
    params: MethodInput<M>,
  ): Promise<MethodResult<M>> {
    guard()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        reader.request(method, params),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new BridgeError(
                  "BRIDGE_TIMEOUT",
                  "Design capture exceeded its 30-second budget; no snapshot was saved",
                  false,
                ),
              ),
            Math.max(1, deadline - Date.now()),
          )
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  const project = await request("get_project", { sessionId })
  const targetSession = project.sessionId
  const branch = await request("get_branch", {
    sessionId: targetSession,
  })
  const root = await request("get_node", {
    sessionId: targetSession,
    node: project.canvasRoot,
  })
  const bps =
    root.metadata.framerType === "WebPageNode"
      ? await request("get_breakpoints", {
          sessionId: targetSession,
          page: project.canvasRoot,
        })
      : { breakpoints: [], truncated: false }
  const nodes: import("@framer-plus/core").DesignNode[] = []
  const queue = [root.ref]
  const seen = new Set<string>()
  const reasons = new Set<string>()
  if (bps.truncated) reasons.add("breakpoints_truncated")
  while (queue.length && nodes.length < maxNodes) {
    guard()
    const ref = queue.shift()
    if (!ref || seen.has(ref.id)) continue
    seen.add(ref.id)
    const node =
      ref.id === root.ref.id
        ? root
        : await request("get_node", {
            sessionId: targetSession,
            node: ref,
          })
    nodes.push(node)
    if (node.childrenTruncated) reasons.add("children_truncated")
    if (node.text?.truncated) reasons.add("text_truncated")
    if (!node.capabilities.treeRead) reasons.add("unsupported_traversal")
    for (const child of node.children ?? []) {
      if (!seen.has(child.id)) queue.push(child)
      if (queue.length > 2000)
        throw new BridgeError(
          "TREE_LIMIT_REACHED",
          "Capture frontier exceeds its limit",
          false,
        )
    }
  }
  if (queue.length) reasons.add("node_limit")
  for (const node of nodes) {
    guard()
    const fresh = await request("get_node", {
      sessionId: targetSession,
      node: node.ref,
    })
    if (fresh.revision !== node.revision)
      throw new BridgeError(
        "PRECONDITION_FAILED",
        "Design changed during capture; no snapshot was saved",
        false,
      )
  }
  const after = await request("get_project", {
    sessionId: targetSession,
  })
  const afterBranch = await request("get_branch", {
    sessionId: targetSession,
  })
  if (
    after.id !== project.id ||
    after.canvasRoot.id !== project.canvasRoot.id ||
    afterBranch.active.id !== branch.active.id
  )
    throw new BridgeError(
      "PRECONDITION_FAILED",
      "Project, canvas or branch changed during capture",
      false,
    )
  const snapshot = snapshotSchema.parse({
    schemaVersion: 1,
    adapter: "framer-plugin",
    project: { id: project.id, name: project.name, branchId: branch.active.id },
    rootId: root.ref.id,
    nodes,
    breakpoints: bps.breakpoints,
    capture: {
      atomic: false,
      complete: reasons.size === 0,
      verified: true,
      reasons: [...reasons].sort(),
    },
  })
  return { snapshot, ir: toDesignIR(snapshot, { roles }) }
}
