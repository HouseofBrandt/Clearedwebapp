import { prisma } from '@/lib/db'

export interface GraphNode {
  id: string
  citationString: string
  authorityTier: string
  authorityStatus: string
}

export interface GraphEdge {
  fromId: string
  toId: string
  relationship: string
  confidence: number
}

/**
 * Get all authorities related to a given citation.
 * Traverses edges up to `depth` levels (default 2).
 */
export async function getRelatedAuthorities(
  citationString: string,
  depth: number = 2
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  // Find the root authority by citation string
  const rootAuthority = await prisma.canonicalAuthority.findUnique({
    where: { citationString },
  })

  if (!rootAuthority) {
    return { nodes: [], edges: [] }
  }

  const visitedIds = new Set<string>()
  const allNodes: GraphNode[] = []
  const allEdges: GraphEdge[] = []

  // BFS traversal
  let currentLevel: string[] = [rootAuthority.id]

  // Add root node
  visitedIds.add(rootAuthority.id)
  allNodes.push({
    id: rootAuthority.id,
    citationString: rootAuthority.citationString,
    authorityTier: rootAuthority.authorityTier,
    authorityStatus: rootAuthority.authorityStatus,
  })

  for (let d = 0; d < depth && currentLevel.length > 0; d++) {
    const nextLevel: string[] = []

    // Find all edges connected to nodes in the current level
    const outgoing = await prisma.authorityEdge.findMany({
      where: { fromId: { in: currentLevel } },
      include: {
        to: {
          select: {
            id: true,
            citationString: true,
            authorityTier: true,
            authorityStatus: true,
          },
        },
      },
    })

    const incoming = await prisma.authorityEdge.findMany({
      where: { toId: { in: currentLevel } },
      include: {
        from: {
          select: {
            id: true,
            citationString: true,
            authorityTier: true,
            authorityStatus: true,
          },
        },
      },
    })

    for (const edge of outgoing) {
      allEdges.push({
        fromId: edge.fromId,
        toId: edge.toId,
        relationship: edge.relationship,
        confidence: edge.confidence,
      })

      if (!visitedIds.has(edge.to.id)) {
        visitedIds.add(edge.to.id)
        allNodes.push(edge.to)
        nextLevel.push(edge.to.id)
      }
    }

    for (const edge of incoming) {
      allEdges.push({
        fromId: edge.fromId,
        toId: edge.toId,
        relationship: edge.relationship,
        confidence: edge.confidence,
      })

      if (!visitedIds.has(edge.from.id)) {
        visitedIds.add(edge.from.id)
        allNodes.push(edge.from)
        nextLevel.push(edge.from.id)
      }
    }

    currentLevel = nextLevel
  }

  return { nodes: allNodes, edges: deduplicateEdges(allEdges) }
}

/**
 * Find authorities that cite a given authority.
 * Returns nodes where an edge points TO the given authority.
 */
export async function getCitingAuthorities(
  authorityId: string
): Promise<GraphNode[]> {
  const edges = await prisma.authorityEdge.findMany({
    where: { toId: authorityId },
    include: {
      from: {
        select: {
          id: true,
          citationString: true,
          authorityTier: true,
          authorityStatus: true,
        },
      },
    },
  })

  return edges.map((edge) => edge.from)
}

/**
 * Find authorities cited by a given authority.
 * Returns nodes where an edge points FROM the given authority.
 */
export async function getCitedAuthorities(
  authorityId: string
): Promise<GraphNode[]> {
  const edges = await prisma.authorityEdge.findMany({
    where: { fromId: authorityId },
    include: {
      to: {
        select: {
          id: true,
          citationString: true,
          authorityTier: true,
          authorityStatus: true,
        },
      },
    },
  })

  return edges.map((edge) => edge.to)
}

/**
 * Remove duplicate edges from the result set.
 */
function deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = `${edge.fromId}|${edge.toId}|${edge.relationship}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
