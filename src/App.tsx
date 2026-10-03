import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { cn } from "@/lib/utils"
import { createPortal } from "react-dom"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { Timeline } from "@/components/timeline"
import { ThemeToggle } from "@/components/theme-toggle"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type TreeApi } from "react-arborist"
import { useSimpleTreeUUID } from "@/hooks/use-simple-tree-uuid"
import { TaskTree } from "@/components/task-tree"
import { CheckinTracker } from "@/components/checkin-tracker"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import { TrashIcon } from "@phosphor-icons/react"
import type { Task, TimeBlock } from "@/types/task"
import { playNotificationSound } from "@/lib/notification-sound"

interface NotificationItem {
  id: string
  taskName: string
  type: string
  minutes: number
  time: string
}

const defaultData: Task[] = [
  { id: "1", name: "工作", children: [
    { id: "1-1", name: "项目 A" },
    { id: "1-2", name: "项目 B" },
  ]},
  { id: "2", name: "学习" },
  { id: "3", name: "生活" },
]

type DBTaskRow = { id: string; name: string; parent_id: string | null; status: string; completed_at: string | null; deleted_at: string | null; invested_minutes: number }
type DBHabitRow = { id: string; name: string; parent_id: string | null; status: string; deleted_at: string | null }

function buildTree(rows: { id: string; name: string; parent_id: string | null; status: string }[], status: string): Task[] {
  const filtered = rows.filter((r) => r.status === status)
  const map = new Map<string, Task>()
  const roots: Task[] = []

  for (const row of filtered) {
    map.set(row.id, { id: row.id, name: row.name })
  }

  for (const row of filtered) {
    const node = map.get(row.id)!
    if (row.parent_id && map.has(row.parent_id)) {
      const parent = map.get(row.parent_id)!
      parent.children = parent.children || []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

type DragState = {
  taskId: string
  taskName: string
  x: number
  y: number
}

type DropPending = {
  taskId: string
  taskName: string
  startMinutes: number
  endMinutes: number
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function minutesFromTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number)
  return h * 60 + m
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${mo}-${day}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getDateList(): string[] {
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)
  }
  return dates
}

function filterTodayTasks(tree: Task[], todayTaskIds: Set<string>): Task[] {
  return tree.reduce<Task[]>((acc, node) => {
    const filteredChildren = node.children ? filterTodayTasks(node.children, todayTaskIds) : []
    if (todayTaskIds.has(node.id) || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children && node.children.length > 0 ? [] : undefined })
    }
    return acc
  }, [])
}

function formatInvested(mins: number): string {
  if (mins <= 0) return "-"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`
}
function daysLeft(iso: string | null): number {
  if (!iso) return 0
  const deleted = new Date(iso)
  const deadline = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000)
  const now = Date.now()
  return Math.max(0, Math.ceil((deadline.getTime() - now) / (24 * 60 * 60 * 1000)))
}

export default function App() {
  const [initialData, setInitialData] = useState<{
    activeTasks: Task[]
    timeBlocks: TimeBlock[]
    allRows: DBTaskRow[]
    habitRows: DBHabitRow[]
  } | null>(null)

  useEffect(() => {
    Promise.all([
      window.electronAPI.loadAll(),
      window.electronAPI.loadHabits(),
    ]).then(([result, habits]) => {
      const isFirstRun = result.tasks.length === 0
      const allRows: DBTaskRow[] = result.tasks.map((r) => ({
        id: r.id,
        name: r.name,
        parent_id: r.parent_id,
        sort_order: r.sort_order,
        status: r.status || "active",
        completed_at: r.completed_at,
        deleted_at: r.deleted_at,
        invested_minutes: r.invested_minutes || 0,
      }))

      const activeTasks = isFirstRun ? defaultData : buildTree(allRows, "active")

      if (isFirstRun) {
        window.electronAPI.saveTasks(defaultData)
      }

      const timeBlocks: TimeBlock[] = result.timeBlocks.map((b) => ({
        id: b.id,
        taskId: b.task_id,
        startMinutes: b.start_minutes,
        endMinutes: b.end_minutes,
        date: b.date || todayStr(),
      }))

      const habitRows: DBHabitRow[] = habits.map((r) => ({
        id: r.id,
        name: r.name,
        parent_id: r.parent_id,
        status: r.status || "active",
        deleted_at: r.deleted_at,
      }))

      setInitialData({ activeTasks, timeBlocks, allRows, habitRows })
    })
  }, [])

  if (!initialData) {
    return (
      <div className="flex h-svh items-center justify-center text-sm text-muted-foreground"
      >
        加载中...
      </div>
    )
  }

  return (
    <AppContent
      initialActiveTasks={initialData.activeTasks}
      initialBlocks={initialData.timeBlocks}
      initialAllRows={initialData.allRows}
      initialHabitRows={initialData.habitRows}
    />
  )
}

function AppContent({
  initialBlocks,
  initialAllRows,
  initialHabitRows,
}: {
  initialActiveTasks: Task[]
  initialBlocks: TimeBlock[]
  initialAllRows: DBTaskRow[]
  initialHabitRows: DBHabitRow[]
}) {
  const [currentView, setCurrentView] = useState<"tasks" | "habits">("tasks")
  const [activeTaskTab, setActiveTaskTab] = useState<"active" | "completed" | "deleted">("active")
  const [allTaskRows, setAllTaskRows] = useState<DBTaskRow[]>(initialAllRows)
  const [treeKey, setTreeKey] = useState(0)
  const [habitRows, setHabitRows] = useState<DBHabitRow[]>(initialHabitRows)
  const [activeHabitTab, setActiveHabitTab] = useState<"active" | "deleted">("active")
  const [habitTreeKey, setHabitTreeKey] = useState(0)
  const treeRef = useRef<TreeApi<Task> | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [taskFilter, setTaskFilter] = useState<"today" | "all">("today")
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(initialBlocks)

  const dateList = useMemo(() => getDateList(), [])

  const blocksForSelectedDate = useMemo(
    () => timeBlocks.filter((b) => b.date === selectedDate),
    [timeBlocks, selectedDate]
  )

  const todayTaskIds = useMemo(() => {
    const ids = new Set<string>()
    for (const block of blocksForSelectedDate) {
      ids.add(block.taskId)
    }
    return ids
  }, [blocksForSelectedDate])

  const activeTasks = useMemo(() => buildTree(allTaskRows, "active"), [allTaskRows])

  const displayedActiveTasks = useMemo(() => {
    if (taskFilter === "all") return activeTasks
    return filterTodayTasks(activeTasks, todayTaskIds)
  }, [activeTasks, taskFilter, todayTaskIds])
  const completedRows = useMemo(() => allTaskRows.filter((r) => r.status === "completed"), [allTaskRows])
  const deletedRows = useMemo(() => allTaskRows.filter((r) => r.status === "deleted"), [allTaskRows])

  const activeHabits = useMemo(() => buildTree(habitRows, "active"), [habitRows])
  const deletedHabitRows = useMemo(() => habitRows.filter((r) => r.status === "deleted"), [habitRows])

  const investedMinutesMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of allTaskRows) {
      map[row.id] = row.invested_minutes || 0
    }
    return map
  }, [allTaskRows])

  // ---- State change callbacks ----
  const collectDescendants = useCallback(
    (taskId: string): string[] => {
      const result: string[] = []
      const queue = [taskId]
      while (queue.length > 0) {
        const current = queue.shift()!
        const children = allTaskRows.filter((r) => r.parent_id === current && r.status === "active")
        for (const child of children) {
          result.push(child.id)
          queue.push(child.id)
        }
      }
      return result
    },
    [allTaskRows]
  )

  const handleComplete = useCallback(
    async (taskId: string) => {
      const descIds = collectDescendants(taskId)
      const allIds = [taskId, ...descIds]
      await window.electronAPI.completeTask(taskId)
      setAllTaskRows((prev) =>
        prev.map((r) =>
          allIds.includes(r.id)
            ? { ...r, status: "completed", completed_at: new Date().toISOString(), deleted_at: null }
            : r
        )
      )
      setTreeKey((k) => k + 1)
    },
    [collectDescendants]
  )

  const handleSoftDelete = useCallback(
    async (taskId: string) => {
      const descIds = collectDescendants(taskId)
      const allIds = [taskId, ...descIds]
      await window.electronAPI.deleteTask(taskId)
      setAllTaskRows((prev) =>
        prev.map((r) =>
          allIds.includes(r.id)
            ? { ...r, status: "deleted", deleted_at: new Date().toISOString(), completed_at: null }
            : r
        )
      )
      setTreeKey((k) => k + 1)
    },
    [collectDescendants]
  )

  const handleRestore = useCallback(async (taskId: string) => {
    await window.electronAPI.restoreTask(taskId)
    // Recursively find all children that were also restored
    const restoredIds = [taskId]
    const queue = [taskId]
    while (queue.length > 0) {
      const current = queue.shift()!
      const children = allTaskRows.filter(
        (r) => r.parent_id === current && (r.status === "completed" || r.status === "deleted")
      )
      for (const child of children) {
        restoredIds.push(child.id)
        queue.push(child.id)
      }
    }
    setAllTaskRows((prev) =>
      prev.map((r) =>
        restoredIds.includes(r.id)
          ? { ...r, status: "active", completed_at: null, deleted_at: null }
          : r
      )
    )
    setTreeKey((k) => k + 1)
  }, [allTaskRows])

  const handleClearAllDeleted = useCallback(async () => {
    const count = await window.electronAPI.permanentlyDeleteAllDeleted()
    setAllTaskRows((prev) => prev.filter((r) => r.status !== "deleted"))
    return count
  }, [])

  const handlePermanentDelete = useCallback(async (taskId: string) => {
    await window.electronAPI.permanentlyDeleteTask(taskId)
    setAllTaskRows((prev) => prev.filter((r) => r.id !== taskId))
  }, [])

  const handleTasksChanged = useCallback((treeTasks: Task[]) => {
    setAllTaskRows((prev) => {
  // Flatten tree to DBTaskRow, merge non-active rows
      const flatten = (nodes: Task[], parentId: string | null): DBTaskRow[] => {
        const result: DBTaskRow[] = []
        for (const node of nodes) {
          result.push({
            id: node.id,
            name: node.name,
            parent_id: parentId,
            status: "active",
            completed_at: null,
            deleted_at: null,
            invested_minutes: 0,
          })
          if (node.children?.length) {
            result.push(...flatten(node.children, node.id))
          }
        }
        return result
      }
      const activeRows = flatten(treeTasks, null)
      const activeIds = new Set(activeRows.map((r) => r.id))
      const prevMap = new Map(prev.map((r) => [r.id, r]))
      const merged = activeRows.map((r) => ({
        ...r,
        invested_minutes: prevMap.get(r.id)?.invested_minutes || 0,
      }))
      // Keep non-active rows + keep invested_minutes from active rows not in tree
      const nonActive = prev.filter((r) => !activeIds.has(r.id))
      return [...merged, ...nonActive]
    })
  }, [])

  // ---- 习惯（打卡）数据操作 ----
  const collectHabitDescendants = useCallback(
    (habitId: string): string[] => {
      const result: string[] = []
      const queue = [habitId]
      while (queue.length > 0) {
        const current = queue.shift()!
        const children = habitRows.filter((r) => r.parent_id === current && r.status === "active")
        for (const child of children) {
          result.push(child.id)
          queue.push(child.id)
        }
      }
      return result
    },
    [habitRows]
  )

  const handleHabitSoftDelete = useCallback(
    async (habitId: string) => {
      const descIds = collectHabitDescendants(habitId)
      const allIds = [habitId, ...descIds]
      await window.electronAPI.deleteHabit(habitId)
      setHabitRows((prev) =>
        prev.map((r) =>
          allIds.includes(r.id) ? { ...r, status: "deleted", deleted_at: new Date().toISOString() } : r
        )
      )
      setHabitTreeKey((k) => k + 1)
    },
    [collectHabitDescendants]
  )

  const handleHabitRestore = useCallback(
    async (habitId: string) => {
      await window.electronAPI.restoreHabit(habitId)
      const restoredIds = [habitId]
      const queue = [habitId]
      while (queue.length > 0) {
        const current = queue.shift()!
        const children = habitRows.filter(
          (r) => r.parent_id === current && (r.status === "deleted" || r.status === "active")
        )
        for (const child of children) {
          restoredIds.push(child.id)
          queue.push(child.id)
        }
      }
      setHabitRows((prev) =>
        prev.map((r) => (restoredIds.includes(r.id) ? { ...r, status: "active", deleted_at: null } : r))
      )
      setHabitTreeKey((k) => k + 1)
    },
    [habitRows]
  )

  const handleHabitClearAll = useCallback(async () => {
    const count = await window.electronAPI.permanentlyDeleteAllDeletedHabits()
    setHabitRows((prev) => prev.filter((r) => r.status !== "deleted"))
    return count
  }, [])

  const handleHabitPermanentDelete = useCallback(async (habitId: string) => {
    await window.electronAPI.permanentlyDeleteHabit(habitId)
    setHabitRows((prev) => prev.filter((r) => r.id !== habitId))
  }, [])

  const handleHabitsChanged = useCallback((treeHabits: Task[]) => {
    setHabitRows((prev) => {
      const flatten = (nodes: Task[], parentId: string | null): DBHabitRow[] => {
        const result: DBHabitRow[] = []
        for (const node of nodes) {
          result.push({ id: node.id, name: node.name, parent_id: parentId, status: "active", deleted_at: null })
          if (node.children?.length) {
            result.push(...flatten(node.children, node.id))
          }
        }
        return result
      }
      const activeRows = flatten(treeHabits, null)
      const activeIds = new Set(activeRows.map((r) => r.id))
      const nonActive = prev.filter((r) => !activeIds.has(r.id))
      return [...activeRows, ...nonActive]
    })
  }, [])

  // ---- Drag system ----
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragInfoRef = useRef<{ taskId: string; taskName: string; startX: number; startY: number } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement
      const node = target.closest('[data-task-id]')
      if (!node) return
      dragInfoRef.current = {
        taskId: node.getAttribute('data-task-id')!,
        taskName: node.getAttribute('data-task-name') || node.getAttribute('data-task-id')!,
        startX: e.clientX,
        startY: e.clientY,
      }
    }

    let dragoverCount = 0
    const onDragOver = (e: DragEvent) => {
      dragoverCount++
      const sidebar = document.querySelector('[data-panel="tasks"]')
      if (sidebar) {
        const sr = sidebar.getBoundingClientRect()
        if (e.clientX < sr.right) {
          setDrag(null)
          return
        }
      }
      e.preventDefault()
      const info = dragInfoRef.current
      if (info) {
        setDrag({ taskId: info.taskId, taskName: info.taskName, x: e.clientX, y: e.clientY })
      }
    }

    window.addEventListener("dragstart", onDragStart)
    window.addEventListener("dragover", onDragOver)
    return () => {
      window.removeEventListener("dragstart", onDragStart)
      window.removeEventListener("dragover", onDragOver)
    }
  }, [])

  const handleTimelineDrop = useCallback((taskId: string, taskName: string, startMinutes: number, endMinutes: number) => {
    setDrag(null)
    setDropPending({ taskId, taskName, startMinutes, endMinutes })
  }, [])

  const handleClearAllTimeBlocks = useCallback(() => {
    setTimeBlocks((prev) => prev.filter((b) => b.date !== selectedDate))
  }, [selectedDate])

  const [autoCreate, setAutoCreate] = useState(false)

  // --- Drop modal ---
  const [dropPending, setDropPending] = useState<DropPending | null>(null)
  const [dropStartTime, setDropStartTime] = useState("")
  const [dropEndTime, setDropEndTime] = useState("")

  useEffect(() => {
    if (dropPending) {
      setDropStartTime(formatTime(dropPending.startMinutes))
      setDropEndTime(formatTime(dropPending.endMinutes))
    }
  }, [dropPending])

  const handleDropConfirm = () => {
    if (!dropPending) return
    const start = minutesFromTime(dropStartTime)
    const end = minutesFromTime(dropEndTime)
    if (end > start) {
      setTimeBlocks((prev) => [
        ...prev,
        { id: `tb-${Date.now()}`, taskId: dropPending.taskId, date: selectedDate, startMinutes: start, endMinutes: end },
      ])
    }
    setDropPending(null)
  }

  // --- Persistence ---
  const blocksMounted = useRef(false)
  useEffect(() => {
    if (!blocksMounted.current) {
      blocksMounted.current = true
      return
    }
    window.electronAPI.saveTimeBlocks(timeBlocks)
  }, [timeBlocks])

  // --- Time block notification detection: polling + system notification + persistent record ---
  const triggeredEndIds = useRef<Set<string>>(new Set())
  const triggeredUpcomingIds = useRef<Set<string>>(new Set())
  const triggeredStartedIds = useRef<Set<string>>(new Set())
  const triggeredEndingIds = useRef<Set<string>>(new Set())
  const timeBlocksRef = useRef(timeBlocks)
  timeBlocksRef.current = timeBlocks
  const allTaskRowsRef = useRef(allTaskRows)
  allTaskRowsRef.current = allTaskRows

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const today = todayStr()

      for (const block of timeBlocksRef.current) {
        if (block.date !== today) continue
        const blockId = block.id
        const found = allTaskRowsRef.current.find((r) => r.id === block.taskId)
        if (!found) continue
        const taskName = found.name
        const startDiff = block.startMinutes - currentMinutes
        const endDiff = block.endMinutes - currentMinutes

        // 1. 即将开始（开始前 1-5 分钟）
        if (startDiff > 0 && startDiff <= 5 && !triggeredUpcomingIds.current.has(blockId)) {
          triggeredUpcomingIds.current.add(blockId)
          const msg = `${taskName} 将在 ${startDiff} 分钟后开始`
          window.electronAPI.showNotification("即将开始", msg)
          playNotificationSound("upcoming")
          toast(msg)
          setNotifications((prev) => [
            {
              id: blockId + "-upcoming-" + Date.now(),
              taskName,
              type: "即将开始",
              minutes: startDiff,
              time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
            },
            ...prev,
          ])
        }

        // 2. 已开始
        if (startDiff <= 0 && startDiff >= -2 && !triggeredStartedIds.current.has(blockId)) {
          triggeredStartedIds.current.add(blockId)
          const msg = `${taskName} 已开始`
          window.electronAPI.showNotification("已开始", msg)
          playNotificationSound("start")
          toast(msg)
          setNotifications((prev) => [
            {
              id: blockId + "-started-" + Date.now(),
              taskName,
              type: "已开始",
              minutes: 0,
              time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
            },
            ...prev,
          ])
        }

        // 3. 即将结束（结束前 1-5 分钟）
        if (endDiff > 0 && endDiff <= 5 && !triggeredEndingIds.current.has(blockId)) {
          triggeredEndingIds.current.add(blockId)
          const msg = `${taskName} 将在 ${endDiff} 分钟后结束`
          window.electronAPI.showNotification("即将结束", msg)
          playNotificationSound("ending")
          toast(msg)
          setNotifications((prev) => [
            {
              id: blockId + "-ending-" + Date.now(),
              taskName,
              type: "即将结束",
              minutes: endDiff,
              time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
            },
            ...prev,
          ])
        }

        // 4. 已结束
        if (endDiff <= 0 && !triggeredEndIds.current.has(blockId)) {
          triggeredEndIds.current.add(blockId)
          const duration = block.endMinutes - block.startMinutes
          if (duration <= 0) continue

          window.electronAPI.accumulateTime(block.taskId, duration).then((res) => {
            setAllTaskRows((prev) =>
              prev.map((row) =>
                row.id === res.taskId ? { ...row, invested_minutes: res.investedMinutes } : row
              )
            )
          })

          const endMsg = `${taskName} 时间块已结束`
          window.electronAPI.showNotification(endMsg, `共 ${Math.floor(duration / 60)} 分钟`)
          playNotificationSound("end")
          toast(endMsg, {
            description: `共 ${Math.floor(duration / 60)} 分钟`,
          })
          setNotifications((prev) => [
            {
              id: blockId + "-" + Date.now(),
              taskName,
              type: "已结束",
              minutes: duration,
              time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
            },
            ...prev,
          ])
        }
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  // --- Task panel width drag ---
  const [taskPanelWidth, setTaskPanelWidth] = useState(400)
  const taskPanelWidthRef = useRef(400)
  const resizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return
      const delta = e.clientX - resizeStartX.current
      taskPanelWidthRef.current = Math.max(180, Math.min(window.innerWidth - 200, delta + resizeStartWidth.current))
      setTaskPanelWidth(taskPanelWidthRef.current)
    }
    const onMouseUp = () => { resizing.current = false }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [])

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar
        currentView={currentView}
        onNavigate={(v: string) => setCurrentView(v as "tasks" | "habits")}
        notifications={notifications}
      />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">{currentView === "tasks" ? "任务" : "打卡"}</span>
          {currentView === "tasks" && (
            <>
              <Separator orientation="vertical" className="ml-1 h-4" />
              <div className="flex items-center gap-1">
                {(["active", "completed", "deleted"] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTaskTab === tab ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setActiveTaskTab(tab)}
                  >
                    {tab === "active" ? "进行中" : tab === "completed" ? "已完成" : "已删除"}
                  </Button>
                ))}
              </div>
            </>
          )}
          {currentView === "habits" && (
            <>
              <Separator orientation="vertical" className="ml-1 h-4" />
              <div className="flex items-center gap-1">
                {(["active", "deleted"] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={activeHabitTab === tab ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setActiveHabitTab(tab)}
                  >
                    {tab === "active" ? "进行中" : "已删除"}
                  </Button>
                ))}
              </div>
            </>
          )}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {currentView === "tasks" ? (
          <>
            <ActiveTaskPanel
              key={treeKey}
              className={activeTaskTab !== "active" ? "!hidden" : undefined}
              activeTasks={displayedActiveTasks}
              timeBlocks={blocksForSelectedDate}
              selectedDate={selectedDate}
              dateList={dateList}
              taskFilter={taskFilter}
              investedMinutesMap={investedMinutesMap}
              taskPanelWidth={taskPanelWidth}
              treeRef={treeRef}
              taskPanelWidthRef={taskPanelWidthRef}
              resizing={resizing}
              resizeStartX={resizeStartX}
              resizeStartWidth={resizeStartWidth}
              drag={drag}
              onComplete={handleComplete}
              onSoftDelete={handleSoftDelete}
              onTasksChanged={handleTasksChanged}
              onTimelineDrop={handleTimelineDrop}
              addTimeBlock={(block) => setTimeBlocks((prev) => [...prev, block])}
              deleteTimeBlock={(id) => setTimeBlocks((prev) => prev.filter((b) => b.id !== id))}
              onClearAllTimeBlocks={handleClearAllTimeBlocks}
              onDateChange={setSelectedDate}
              onTaskFilterChange={(f) => { setTaskFilter(f); setTreeKey((k) => k + 1) }}
              onRequestCreateInAll={() => { setTaskFilter("all"); setTreeKey((k) => k + 1); setAutoCreate(true) }}
              autoCreate={autoCreate}
              onAutoCreateHandled={() => setAutoCreate(false)}
            />
            {activeTaskTab === "completed" && (
              <CompletedView
                completedRows={completedRows}
                investedMinutesMap={investedMinutesMap}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
              />
            )}
            {activeTaskTab === "deleted" && (
              <DeletedView
                deletedRows={deletedRows}
                investedMinutesMap={investedMinutesMap}
                onRestore={handleRestore}
                onClearAll={handleClearAllDeleted}
                onPermanentDelete={handlePermanentDelete}
              />
            )}
          </>
        ) : (
          <>
            {activeHabitTab === "active" ? (
              <div className="flex-1 overflow-hidden">
                <CheckinTracker
                  key={habitTreeKey}
                  habits={activeHabits}
                  onHabitsChanged={handleHabitsChanged}
                  onSoftDeleteHabit={handleHabitSoftDelete}
                />
              </div>
            ) : (
              <HabitDeletedView
                deletedRows={deletedHabitRows}
                onRestore={handleHabitRestore}
                onClearAll={handleHabitClearAll}
                onPermanentDelete={handleHabitPermanentDelete}
              />
            )}
          </>
        )}
      </SidebarInset>

      {/* Drag overlay */}
      {drag && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] rounded-md bg-sidebar px-3 py-1.5 text-sm shadow-lg ring-1 ring-border"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {drag.taskName}
        </div>,
        document.body
      )}

      {/* Drop modal: choose time */}
      <Dialog open={!!dropPending} onOpenChange={(open) => { if (!open) setDropPending(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>创建时间块 — {dropPending?.taskName}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 py-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">开始</label>
              <Input
                type="time"
                value={dropStartTime}
                onChange={(e) => setDropStartTime(e.target.value)}
                className="w-32"
              />
            </div>
            <span className="mt-5 text-muted-foreground">—</span>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">结束</label>
              <Input
                type="time"
                value={dropEndTime}
                onChange={(e) => setDropEndTime(e.target.value)}
                className="w-32"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropPending(null)}>取消</Button>
            <Button onClick={handleDropConfirm}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="bottom-left" duration={5000} closeButton />
    </SidebarProvider>
  )
}

/* ====== ActiveTaskPanel: wraps useSimpleTreeUUID, re-initialize via key ====== */
interface ActiveTaskPanelProps {
  className?: string
  activeTasks: Task[]
  timeBlocks: TimeBlock[]
  selectedDate: string
  dateList: string[]
  taskFilter: "today" | "all"
  investedMinutesMap: Record<string, number>
  taskPanelWidth: number
  treeRef: React.MutableRefObject<TreeApi<Task> | null>
  taskPanelWidthRef: React.MutableRefObject<number>
  resizing: React.MutableRefObject<boolean>
  resizeStartX: React.MutableRefObject<number>
  resizeStartWidth: React.MutableRefObject<number>
  drag: DragState | null
  onComplete: (taskId: string) => void
  onSoftDelete: (taskId: string) => void
  onTasksChanged?: (tasks: Task[]) => void
  onTimelineDrop: (taskId: string, taskName: string, startMinutes: number, endMinutes: number) => void
  addTimeBlock: (block: TimeBlock) => void
  deleteTimeBlock: (id: string) => void
  onClearAllTimeBlocks: () => void
  onDateChange: (date: string) => void
  onTaskFilterChange: (filter: "today" | "all") => void
  onRequestCreateInAll: () => void
  autoCreate?: boolean
  onAutoCreateHandled?: () => void
}

function ActiveTaskPanel({
  className,
  activeTasks,
  timeBlocks,
  selectedDate,
  dateList,
  taskFilter,
  investedMinutesMap,
  taskPanelWidth,
  treeRef,
  taskPanelWidthRef,
  resizing,
  resizeStartX,
  resizeStartWidth,
  drag,
  onComplete,
  onSoftDelete,
  onTasksChanged,
  onTimelineDrop,
  addTimeBlock,
  deleteTimeBlock,
  onClearAllTimeBlocks,
  onDateChange,
  onTaskFilterChange,
  onRequestCreateInAll,
  autoCreate,
  onAutoCreateHandled,
}: ActiveTaskPanelProps) {
  const [tasks, handlers] = useSimpleTreeUUID(activeTasks)

  // ---- Save tree changes + sync memory ----
  const treeMounted = useRef(false)
  useEffect(() => {
    if (!treeMounted.current) {
      treeMounted.current = true
      return
    }
    window.electronAPI.saveTasks([...tasks])
    onTasksChanged?.([...tasks])
  }, [tasks, onTasksChanged])

  const handleCreateTask = useCallback((name: string) => {
    handlers.createWithName(name)
  }, [handlers])

  return (
    <div className={cn("flex flex-1 overflow-hidden", className)}>
      <div data-panel="tasks" style={{ width: taskPanelWidth }} className="shrink-0 border-r">
        <TaskTree
          tasks={tasks}
          handlers={handlers}
          treeRef={treeRef}
          badgeText={(id) => {
            const mins = investedMinutesMap[id] ?? 0
            return mins > 0 ? formatInvested(mins) : null
          }}
          taskFilter={taskFilter}
          onTaskFilterChange={onTaskFilterChange}
          onRequestCreateInAll={onRequestCreateInAll}
          autoCreate={autoCreate}
          onAutoCreateHandled={onAutoCreateHandled}
          onComplete={onComplete}
          onSoftDelete={onSoftDelete}
          onCreateTask={handleCreateTask}
        />
      </div>
      <div
        className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/60"
        onMouseDown={(e) => {
          e.preventDefault()
          resizing.current = true
          resizeStartX.current = e.clientX
          resizeStartWidth.current = taskPanelWidthRef.current
        }}
      />
      <div className="flex-1 overflow-hidden">
        <Timeline
          tasks={tasks}
          timeBlocks={timeBlocks}
          selectedDate={selectedDate}
          dateList={dateList}
          onDateChange={onDateChange}
          onAddTimeBlock={addTimeBlock}
          onDeleteTimeBlock={deleteTimeBlock}
          onClearAllTimeBlocks={onClearAllTimeBlocks}
          drag={drag}
          onTimelineDrop={onTimelineDrop}
        />
      </div>
    </div>
  )
}

/* ====== CompletedView ====== */
function CompletedView({
  completedRows,
  investedMinutesMap,
  onRestore,
  onPermanentDelete,
}: {
  completedRows: DBTaskRow[]
  investedMinutesMap: Record<string, number>
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
}) {
  const totalInvested = useMemo(
    () => completedRows.reduce((sum, r) => sum + (investedMinutesMap[r.id] || 0), 0),
    [completedRows, investedMinutesMap]
  )

  // Group by completion date
  const grouped = useMemo(() => {
    const map = new Map<string, DBTaskRow[]>()
    for (const row of completedRows) {
      const date = formatDate(row.completed_at) || "未知"
      const list = map.get(date) || []
      list.push(row)
      map.set(date, list)
    }
    return map
  }, [completedRows])

  return (
    <div className="flex h-full flex-col">
      {/* Stats bar */}
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <span className="text-xs text-muted-foreground">
          {completedRows.length} 个已完成
          {totalInvested > 0 && <> · 已投入 {formatInvested(totalInvested)}</>}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {completedRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无已完成任务
          </div>
        ) : (
          <div>
            {[...grouped.entries()].map(([date, rows]) => (
              <div key={date}>
                <div className="sticky top-0 bg-muted/50 px-4 py-1 text-[11px] text-muted-foreground border-b">
                  {date}
                </div>
                <div className="divide-y divide-border">
                  {rows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2 px-4 py-1.5 text-xs hover:bg-accent/40">
                      <span className="flex-1 truncate font-medium">{row.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatInvested(investedMinutesMap[row.id] || 0)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => onRestore(row.id)}
                      >
                        恢复
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground hover:text-destructive"
                        onClick={() => onPermanentDelete(row.id)}
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ====== DeletedView ====== */
function DeletedView({
  deletedRows,
  investedMinutesMap,
  onRestore,
  onClearAll,
  onPermanentDelete,
}: {
  deletedRows: DBTaskRow[]
  investedMinutesMap: Record<string, number>
  onRestore: (id: string) => void
  onClearAll: () => Promise<number>
  onPermanentDelete: (id: string) => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)

  const totalInvested = useMemo(
    () => deletedRows.reduce((sum, r) => sum + (investedMinutesMap[r.id] || 0), 0),
    [deletedRows, investedMinutesMap]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Stats bar */}
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <span className="text-xs text-muted-foreground">
          {deletedRows.length} 个已删除
          {totalInvested > 0 && <> · 已投入 {formatInvested(totalInvested)}</>}
        </span>
        <div className="ml-auto">
          <Button
            variant="destructive"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setShowConfirm(true)}
          >
            全部清空
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {deletedRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无已删除任务
          </div>
        ) : (
          <div className="divide-y divide-border">
            {deletedRows.map((row) => {
              const remaining = daysLeft(row.deleted_at)
              return (
                <div key={row.id} className="flex items-center gap-2 px-4 py-1.5 text-xs hover:bg-accent/40">
                  <span className="flex-1 truncate font-medium">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatInvested(investedMinutesMap[row.id] || 0)}</span>
                  <span className="shrink-0 text-muted-foreground">剩余 {remaining} 天</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => onRestore(row.id)}
                  >
                    恢复
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 text-muted-foreground hover:text-destructive"
                    onClick={() => onPermanentDelete(row.id)}
                  >
                    <TrashIcon className="size-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>永久删除全部</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            这将永久删除全部 {deletedRows.length} 个任务。此操作无法撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await onClearAll()
                setShowConfirm(false)
              }}
            >
              全部删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ====== HabitDeletedView ====== */
function HabitDeletedView({
  deletedRows,
  onRestore,
  onClearAll,
  onPermanentDelete,
}: {
  deletedRows: DBHabitRow[]
  onRestore: (id: string) => void
  onClearAll: () => Promise<number>
  onPermanentDelete: (id: string) => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <span className="text-xs text-muted-foreground">{deletedRows.length} 个已删除</span>
        <div className="ml-auto">
          <Button
            variant="destructive"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setShowConfirm(true)}
          >
            全部清空
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {deletedRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无已删除习惯
          </div>
        ) : (
          <div className="divide-y divide-border">
            {deletedRows.map((row) => {
              const remaining = daysLeft(row.deleted_at)
              return (
                <div key={row.id} className="flex items-center gap-2 px-4 py-1.5 text-xs hover:bg-accent/40">
                  <span className="flex-1 truncate font-medium">{row.name}</span>
                  <span className="shrink-0 text-muted-foreground">剩余 {remaining} 天</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => onRestore(row.id)}
                  >
                    恢复
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 text-muted-foreground hover:text-destructive"
                    onClick={() => onPermanentDelete(row.id)}
                  >
                    <TrashIcon className="size-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>永久删除全部</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            这将永久删除全部 {deletedRows.length} 个习惯。此操作无法撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await onClearAll()
                setShowConfirm(false)
              }}
            >
              全部删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}