import { Tree, type NodeRendererProps, type TreeApi } from "react-arborist"
import type { Task } from "@/types/task"
import type { CreateHandler, DeleteHandler, MoveHandler, RenameHandler } from "react-arborist"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { PlusIcon, TrashIcon, CaretDownIcon, CaretRightIcon, PencilSimpleIcon, SparkleIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useRef, useEffect, useState, useCallback } from "react"
import { CreateTaskDialog } from "@/components/create-task-dialog"

interface TaskTreeProps {
  tasks: readonly Task[]
  handlers: {
    onMove: MoveHandler<Task>
    onRename: RenameHandler<Task>
    onCreate: CreateHandler<Task>
    onDelete: DeleteHandler<Task>
  }
  treeRef?: React.MutableRefObject<TreeApi<Task> | null>
  /** 行右侧的次要信息（任务已投入时长 / 打卡天数等） */
  badgeText?: (taskId: string) => string | null
  /** 是否显示「今天 / 全部」筛选，默认显示 */
  showFilter?: boolean
  taskFilter?: "today" | "all"
  onTaskFilterChange?: (filter: "today" | "all") => void
  onRequestCreateInAll?: () => void
  autoCreate?: boolean
  onAutoCreateHandled?: () => void
  /** 勾选框受控模式：勾选状态与切换动作由外部提供 */
  checkState?: {
    checked: (taskId: string) => boolean
    onToggle: (taskId: string) => void
  }
  /** 未提供 checkState 时的勾选回调（一次性「完成」语义） */
  onComplete?: (taskId: string) => void
  onSoftDelete?: (taskId: string) => void
  onCreateTask: (name: string) => void
  /** 点击选中某个任务（用于打卡页右侧详情联动） */
  onSelect?: (taskId: string) => void
  /** 右键某个任务（用于编辑任务属性） */
  onContextMenu?: (taskId: string) => void
  /** AI 生成任务（仅任务页传入时显示按钮） */
  onAICreate?: () => void
}

function NodeEdit({ node }: { node: NodeRendererProps<Task>["node"] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <Input
      ref={inputRef}
      className="h-6 flex-1 rounded px-1 py-0 text-sm"
      defaultValue={node.data.name}
      onBlur={() => node.submit(inputRef.current?.value || node.data.name)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); node.reset() }
        if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); node.submit(inputRef.current?.value || node.data.name) }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

export function TaskTree({ tasks, handlers, treeRef, badgeText, showFilter = true, taskFilter, onTaskFilterChange, onRequestCreateInAll, autoCreate, onAutoCreateHandled, checkState, onComplete, onSoftDelete, onCreateTask, onSelect, onContextMenu, onAICreate }: TaskTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [treeHeight, setTreeHeight] = useState(400)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setTreeHeight(el.clientHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Auto-create flag is now handled by dialog
  // When switching to "all" from "today", also open the dialog
  useEffect(() => {
    if (autoCreate) {
      setCreateDialogOpen(true)
      onAutoCreateHandled?.()
    }
  }, [autoCreate])

  const handleAddClick = () => {
    if (showFilter && taskFilter === "today") {
      onRequestCreateInAll?.()
    } else {
      setCreateDialogOpen(true)
    }
  }

  const handleCreateSubmit = (name: string) => {
    onCreateTask(name)
    setCreateDialogOpen(false)
  }

  const onCreate = useCallback(() => {
    return handlers.onCreate({ parentId: null, parentNode: null, index: tasks.length, type: "leaf" })
  }, [handlers.onCreate, tasks.length])

  function Node({ node, style, dragHandle }: NodeRendererProps<Task>) {
    const [done, setDone] = useState(false)
    const checked = checkState ? checkState.checked(node.data.id) : done
    const handleCheck = useCallback(() => {
      if (checkState) {
        checkState.onToggle(node.data.id)
        return
      }
      setDone(true)
      onComplete?.(node.data.id)
    }, [node.data.id, checkState])

    return (
      <div
        ref={dragHandle}
        style={style}
        data-task-id={node.data.id}
        data-task-name={node.data.name}
        className="py-1 text-sm"
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(node.data.id) }}
      >
        <div
          className={cn(
            "group flex items-start gap-1 rounded-md px-1",
            "hover:bg-accent/70"
          )}
          onClick={() => onSelect?.(node.data.id)}
        >
          {/* Toggle Arrow */}
          {node.data.children?.length ? (
            <button
              className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent"
              onClick={(e) => { e.stopPropagation(); node.toggle() }}
            >
              {node.isOpen ? <CaretDownIcon className="size-3.5" /> : <CaretRightIcon className="size-3.5" />}
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}

          {/* 勾选框：任务页=完成；打卡页=今日打卡 */}
          <Checkbox
            className="size-4 shrink-0"
            checked={checked}
            onCheckedChange={handleCheck}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Name or Edit Input */}
          {node.isEditing ? (
            <NodeEdit node={node} />
          ) : (
            <span
              className="flex-1 min-w-0 whitespace-normal break-words leading-tight"
              style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              onDoubleClick={() => node.edit()}
            >
              {node.data.name}
              {badgeText?.(node.data.id) && (
                <span className="ml-1 text-[11px] text-muted-foreground/60">
                  {badgeText(node.data.id)}
                </span>
              )}
            </span>
          )}

          {/* 编辑 + 删除按钮 */}
          <div className="flex shrink-0 items-center gap-1 pt-px">
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={(e) => { e.stopPropagation(); node.tree.select(node.id); node.edit() }}
          >
            <PencilSimpleIcon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={(e) => { e.stopPropagation(); node.tree.select(node.id); onSoftDelete?.(node.data.id) }}
          >
            <TrashIcon className="size-3" />
          </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Header: 过滤 + 新增按钮 */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="text-xs font-medium text-muted-foreground">任务</span>
        {showFilter && (
          <div className="flex items-center gap-0.5">
            <Button
              variant={taskFilter === "today" ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onTaskFilterChange?.("today")}
            >
              今天
            </Button>
            <Button
              variant={taskFilter === "all" ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onTaskFilterChange?.("all")}
            >
              全部
            </Button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {onAICreate && (
            <Button variant="ghost" size="icon" className="size-6" onClick={onAICreate}>
              <SparkleIcon className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-6" onClick={handleAddClick}>
            <PlusIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto px-2">
        <Tree<Task>
          ref={treeRef}
          data={tasks}
          onMove={handlers.onMove}
          onRename={handlers.onRename}
          onCreate={onCreate}
          onDelete={handlers.onDelete}
          width="100%"
          height={treeHeight}
          indent={24}
          rowHeight={32}
          childrenAccessor={(d) => d.children ?? []}
          idAccessor={(d) => d.id}
        >
          {Node}
        </Tree>
      </div>

      <CreateTaskDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={handleCreateSubmit}
      />
    </div>
  )
}
