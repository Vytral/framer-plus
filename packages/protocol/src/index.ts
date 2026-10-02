import { z } from "zod"

export const bridgeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    version: z.string(),
  }),
  z.object({
    type: z.literal("selection.changed"),
    nodeIds: z.array(z.string()),
  }),
])

export type BridgeMessage = z.infer<typeof bridgeMessageSchema>
