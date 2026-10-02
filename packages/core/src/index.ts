export type FramerPlusNodeId = string

export interface FramerPlusProject {
  id?: string
  name?: string
}

export interface FramerPlusNode {
  id: FramerPlusNodeId
  name?: string
  type: string
  children?: FramerPlusNode[]
}
