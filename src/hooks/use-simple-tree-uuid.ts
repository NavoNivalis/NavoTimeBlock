import { useMemo, useState, useCallback } from "react"
import { SimpleTree } from "react-arborist"
import type { MoveHandler, RenameHandler, CreateHandler, DeleteHandler } from "react-arborist"

/**
 * useSimpleTree UUID version, uses crypto.randomUUID() for unique task IDs,
 * avoiding cross-session ID conflicts that cause task replacement/empty name bugs.
 *
 * Also directly creates name: "新任务", eliminating the intermediate state
 * of the original create+rename two-step operation.
 */
export function useSimpleTreeUUID<T extends { id: string; name: string; children?: T[] }>(
  initialData: readonly T[],
) {
  const [data, setData] = useState(initialData)

  const tree = useMemo(
    () => new SimpleTree(data as T[]),
    [data],
  )

  const commit = useCallback(() => {
    const next = tree.data
    setData(next)
  }, [tree])

  const onMove: MoveHandler<T> = useCallback(
    (args) => {
      for (const id of args.dragIds) {
        tree.move({ id, parentId: args.parentId, index: args.index })
      }
      commit()
    },
    [tree, commit],
  )

  const onRename: RenameHandler<T> = useCallback(
    ({ name, id }) => {
      tree.update({ id, changes: { name } as Partial<T> })
      commit()
    },
    [tree, commit],
  )

  const onCreate: CreateHandler<T> = useCallback(
    ({ parentId, index, type }) => {
      const id = crypto.randomUUID()
      const nodeData: any = { id, name: "新任务" }
      if (type === "internal") nodeData.children = []
      tree.create({ parentId, index, data: nodeData })
      commit()
      return nodeData
    },
    [tree, commit],
  )

  const onDelete: DeleteHandler<T> = useCallback(
    (args) => {
      for (const id of args.ids) {
        tree.drop({ id })
      }
      commit()
    },
    [tree, commit],
  )

  const createWithName = useCallback(
    (name: string): string => {
      const id = crypto.randomUUID()
      const nodeData: any = { id, name }
      tree.create({ parentId: null, index: tree.data.length, data: nodeData })
      commit()
      return id
    },
    [tree, commit],
  )

  const controller = useMemo(
    () => ({ onMove, onRename, onCreate, onDelete, createWithName }),
    [onMove, onRename, onCreate, onDelete, createWithName],
  )

  return [data, controller] as const
}
