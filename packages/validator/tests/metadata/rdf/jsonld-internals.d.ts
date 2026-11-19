declare module 'jsonld/lib/nodeMap.js' {
  type Node = Record<string, unknown>
  type NodeMap = Record<string, Node>
  const nodeMap: {
    createMergedNodeMap(input: Node[]): NodeMap
    mergeNodeMapGraphs(graphs: Record<string, NodeMap>): NodeMap
    mergeNodeMaps(graphs: Record<string, NodeMap>): NodeMap
  }
  export default nodeMap
}

declare module 'jsonld/lib/util.js' {
  interface AddValueOptions {
    valueIsArray?: boolean
    propertyIsArray?: boolean
    prependValue?: boolean
    allowDuplicate?: boolean
  }
  const util: {addValue(subject: object, property: string, value: unknown, options?: AddValueOptions): void}
  export default util
}
