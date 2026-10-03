import { useState, useEffect, useRef, useCallback } from "react"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PlusCircleIcon, TrashIcon } from "@phosphor-icons/react"
import type { Task, TimeBlock } from "@/types/task"

const SCALES = [1, 5, 10, 15, 30, 60]
const MINUTES_PER_DAY = 24 * 60
const PX_PER_MINUTE_BASE = 4

const COLORS = [
  "bg-emerald-400/50",
  "bg-sky-400/50",
  "bg-violet-400/50",
  "bg-amber-400/50",
  "bg-rose-400/50",
  "bg-cyan-400/50",
]

function getPxPerMinute(scale: number) {
  return PX_PER_MINUTE_BASE * (5 / scale)
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function getCurrentMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function minutesFromTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number)
  return h * 60 + m
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDateLabel(dateStr: string): string {
  const today = todayStr()
  if (dateStr === today) return "今天"
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`
  if (dateStr === tomorrowStr) return "明天"
  const [_, m, d] = dateStr.split("-")
  return `${parseInt(m)}.${parseInt(d)}`
}

function flattenTasks(tasks: readonly Task[]): Task[] {
  const result: Task[] = []
  for (const t of tasks) {
    result.push(t)
    if (t.children) result.push(...flattenTasks(t.children))
  }
  return result
}

function getTaskColor(taskId: string): string {
  let hash = 0
  for (let i = 0; i < taskId.length; i++) {
    hash = ((hash << 5) - hash) + taskId.charCodeAt(i)
    hash |= 0
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

type BlockLayout = { column: number; totalColumns: number }

const MIN_BLOCK_HEIGHT = 14

function computeTimeBlockLayout(blocks: TimeBlock[], pxPerMinute: number): Map<string, BlockLayout> {
  const sorted = [...blocks].sort((a, b) => a.startMinutes - b.startMinutes)
  const result = new Map<string, BlockLayout>()

  // --- Timeline click: add form ---
  const visualEnd = (b: TimeBlock) =>
    b.startMinutes + Math.max(b.endMinutes - b.startMinutes, MIN_BLOCK_HEIGHT / pxPerMinute)

  const groups: TimeBlock[][] = []
  let currentGroup: TimeBlock[] = []
  let groupMaxEnd = -1
  for (const block of sorted) {
    if (block.startMinutes < groupMaxEnd) {
      currentGroup.push(block)
      groupMaxEnd = Math.max(groupMaxEnd, visualEnd(block))
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup)
      currentGroup = [block]
      groupMaxEnd = visualEnd(block)
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup)

  for (const group of groups) {
    const columns: number[] = []
    const assignments: { blockId: string; column: number }[] = []
    for (const block of group) {
      let assignedCol = -1
      for (let c = 0; c < columns.length; c++) {
        if (columns[c] <= block.startMinutes) {
          assignedCol = c
          columns[c] = visualEnd(block)
          break
        }
      }
      if (assignedCol === -1) {
        assignedCol = columns.length
        columns.push(visualEnd(block))
      }
      assignments.push({ blockId: block.id, column: assignedCol })
    }
    const totalColumns = columns.length
    for (const { blockId, column } of assignments) {
      result.set(blockId, { column, totalColumns })
    }
  }

  return result
}

interface TimelineProps {
  tasks: readonly Task[]
  timeBlocks: TimeBlock[]
  selectedDate: string
  dateList: string[]
  onDateChange: (date: string) => void
  onAddTimeBlock: (block: TimeBlock) => void
  onDeleteTimeBlock: (id: string) => void
  onClearAllTimeBlocks: () => void
  drag?: { taskId: string; taskName: string; x: number; y: number } | null
  onTimelineDrop?: (taskId: string, taskName: string, startMinutes: number, endMinutes: number) => void
}

export function Timeline({ tasks, timeBlocks, selectedDate, dateList, onDateChange, onAddTimeBlock, onDeleteTimeBlock, onClearAllTimeBlocks, drag, onTimelineDrop }: TimelineProps) {
  const [scale, setScale] = useState(5)
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes())
  const [showForm, setShowForm] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(getCurrentMinutes()), 60000)
    return () => clearInterval(timer)
  }, [])

  // --- Drag-drop on timeline: poll to detect drag end ---
  const dragRef = useRef(drag)
  dragRef.current = drag
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const onTimelineDropRef = useRef(onTimelineDrop)
  onTimelineDropRef.current = onTimelineDrop

  useEffect(() => {
    let dragoverCount = 0
    let lastTimelineDragTime = 0
    let lastTimelineY = 0

    const onDragOver = (e: DragEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        dragoverCount++
        if (dragoverCount % 30 === 1) console.log('[Timeline] dragover capture #' + dragoverCount)
        lastTimelineDragTime = Date.now()
        lastTimelineY = e.clientY
        e.preventDefault()
      }
    }

    window.addEventListener("dragover", onDragOver, true)

    // Poll: after 200ms of no dragover, consider drag ended
    const interval = setInterval(() => {
      if (lastTimelineDragTime === 0) return
      if (Date.now() - lastTimelineDragTime < 200) return

      const d = dragRef.current
      if (!d) { lastTimelineDragTime = 0; return }

      const el = containerRef.current
      if (!el || !innerRef.current) { lastTimelineDragTime = 0; return }

      const s = scaleRef.current
      const pxPerMinute = getPxPerMinute(s)
      const mouseYInContent = lastTimelineY - el.getBoundingClientRect().top + el.scrollTop
      const minutes = mouseYInContent / pxPerMinute
      const snapped = Math.round(minutes / s) * s
      const startMinutes = Math.max(0, Math.min(snapped, MINUTES_PER_DAY - 20))
      const endMinutes = Math.min(startMinutes + 20, MINUTES_PER_DAY)

      console.log('[Timeline] poll → drag ended, creating block:', d.taskName, startMinutes, endMinutes)
      onTimelineDropRef.current?.(d.taskId, d.taskName, startMinutes, endMinutes)
      lastTimelineDragTime = 0
    }, 150)

    return () => {
      window.removeEventListener("dragover", onDragOver, true)
      clearInterval(interval)
    }
  }, [])

  const pxPerMinute = getPxPerMinute(scale)
  const totalHeight = MINUTES_PER_DAY * pxPerMinute
  const nowYPx = nowMinutes * pxPerMinute
  const markers = Math.floor(MINUTES_PER_DAY / scale)
  const scaleIndex = SCALES.indexOf(scale)

  const flatTasks = flattenTasks(tasks)
  const isToday = selectedDate === todayStr()

  const scrollToNow = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const viewHeight = container.clientHeight
    container.scrollTop = nowYPx - viewHeight / 2
  }, [nowYPx])

  useEffect(() => {
    scrollToNow()
  }, [scrollToNow])

  const handleAddBlock = () => {
    if (!selectedTaskId || !startTime || !endTime) return
    const start = minutesFromTime(startTime)
    const end = minutesFromTime(endTime)
    if (end <= start) return
    onAddTimeBlock({
      id: `tb-${Date.now()}`,
      taskId: selectedTaskId,
      date: selectedDate,
      startMinutes: start,
      endMinutes: end,
    })
    setShowForm(false)
    setSelectedTaskId("")
    setStartTime("")
    setEndTime("")
  }

  const findTaskName = (taskId: string) =>
    flatTasks.find(t => t.id === taskId)?.name ?? taskId

  // --- Mouse drag-drop placement logic ---

  // is mouse inside timeline?
  const isDragOver = (() => {
    if (!drag || !containerRef.current) return false
    const rect = containerRef.current.getBoundingClientRect()
    return drag.x >= rect.left && drag.x <= rect.right &&
           drag.y >= rect.top && drag.y <= rect.bottom
  })()

  // mouse minute position
  const dragOverMinutes = (() => {
    if (!drag || !innerRef.current || !containerRef.current) return 0
    const containerRect = containerRef.current.getBoundingClientRect()
    const mouseYInContent = drag.y - containerRect.top + containerRef.current.scrollTop
    const minutes = mouseYInContent / pxPerMinute
    const snapped = Math.round(minutes / scale) * scale
    return Math.max(0, Math.min(snapped, MINUTES_PER_DAY - scale))
  })()

  return (
    <div className="flex h-full flex-col">
      {/* Date selector */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Select value={selectedDate} onValueChange={(v) => v && onDateChange(v)}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dateList.map((d) => (
              <SelectItem key={d} value={d} className="text-xs">{formatDateLabel(d)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <div
        ref={containerRef}
        data-timeline-container
        className={`relative flex-1 overflow-auto ${isDragOver ? "ring-2 ring-emerald-400 ring-inset" : ""}`}
      >
        <div ref={innerRef} data-timeline-inner data-px-per-minute={pxPerMinute} data-scale={scale} className="relative" style={{ height: totalHeight }}>
          {/* Tick marks */}
          {Array.from({ length: markers + 1 }, (_, i) => {
            const minutes = i * scale
            const y = minutes * pxPerMinute
            const isHour = minutes % 60 === 0

            return (
              <div
                key={i}
                className="absolute left-0 right-0 flex items-center"
                style={{ top: y }}
              >
                <span className="w-14 shrink-0 pr-2 text-right text-xs tabular-nums text-muted-foreground">
                  {formatTime(minutes)}
                </span>
                <div
                  className="h-px flex-1"
                  style={{ backgroundColor: isHour ? "var(--border)" : "var(--border) / 50%" }}
                />
              </div>
            )
          })}

          {/* Past-time overlay */}
          {isToday && (
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 bg-neutral-400/15"
              style={{ height: nowYPx }}
            />
          )}

          {/* Drop indicator line */}
          {isDragOver && (
            <div
              className="pointer-events-none absolute left-14 right-0 z-30 flex items-center"
              style={{ top: dragOverMinutes * pxPerMinute }}
            >
              <div className="h-0.5 w-full border-t-2 border-dashed border-emerald-400" />
              <div className="absolute -left-1 size-2 rounded-full bg-emerald-400" />
            </div>
          )}

          {/* Time blocks */}
          {(() => {
            const layout = computeTimeBlockLayout(timeBlocks, pxPerMinute)
            const contentWidth = "100% - 3.5rem"
            return timeBlocks.map(block => {
              const y = block.startMinutes * pxPerMinute
              const h = (block.endMinutes - block.startMinutes) * pxPerMinute
              const l = layout.get(block.id) ?? { column: 0, totalColumns: 1 }
              const colWidth = `(${contentWidth}) / ${l.totalColumns}`
              const left = `calc(3.5rem + ${l.column} * ${colWidth})`
              const width = `calc(${colWidth} - 0.5rem)`
              const isPassed = isToday && block.endMinutes < nowMinutes

              if (isPassed) {
                return (
                  <div
                    key={block.id}
                    className="absolute z-10 flex items-center justify-center gap-1 rounded border border-red-400/50 bg-red-500/20 px-2 text-xs text-red-600"
                    style={{ top: y, height: Math.max(h, 14), left, width, animation: "passedBlockBreath 5s ease-in-out infinite" }}
                    title={`${findTaskName(block.taskId)} ${formatTime(block.startMinutes)}-${formatTime(block.endMinutes)}`}
                  >
                    <span className="truncate">{findTaskName(block.taskId)}</span>
                  </div>
                )
              }

              return (
                <div
                  key={block.id}
                  className={`absolute z-10 flex items-center gap-1 rounded px-2 text-xs text-white ${getTaskColor(block.taskId)}`}
                  style={{ top: y, height: Math.max(h, 14), left, width }}
                  title={`${findTaskName(block.taskId)} ${formatTime(block.startMinutes)}-${formatTime(block.endMinutes)}`}
                >
                  <span className="truncate">{findTaskName(block.taskId)}</span>
                  <button
                    className="ml-auto shrink-0 opacity-60 hover:opacity-100"
                    onClick={() => onDeleteTimeBlock(block.id)}
                  >
                    &times;
                  </button>
                </div>
              )
            })
          })()}

          {/* Now line */}
          {isToday && (
            <div
              className="pointer-events-none absolute left-3 right-0 z-20 flex items-center"
              style={{ top: nowYPx, animation: "nowLinePulse 2s ease-in-out infinite" }}
            >
              <div className="h-0.5 w-full bg-red-500" />
              <div className="absolute -left-3 size-2 rounded-full bg-red-500" />
            </div>
          )}
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="flex items-center gap-2 border-t px-4 py-2">
          <Select value={selectedTaskId} onValueChange={(v) => v && setSelectedTaskId(v)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="选择任务" />
            </SelectTrigger>
            <SelectContent>
              {flatTasks.map(t => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="h-8 w-28 text-xs"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <Input
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            className="h-8 w-28 text-xs"
          />
          <Button size="sm" className="h-8 text-xs" onClick={handleAddBlock}>
            添加
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowForm(false)}>
            取消
          </Button>
        </div>
      )}

      {/* Zoom bar + Time Block button */}
      <div className="flex items-center gap-3 border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">缩放</span>
        <Slider
          value={scaleIndex}
          onValueChange={(v) => { const n = Array.isArray(v) ? v[0] : v; setScale(SCALES[n]) }}
          min={0}
          max={SCALES.length - 1}
          step={1}
          className="w-40"
        />
        <span className="text-xs tabular-nums text-muted-foreground">{scale} 分钟/格</span>
          {timeBlocks.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={() => setShowClearConfirm(true)}
            >
              <TrashIcon className="size-3.5" />
            </Button>
          )}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setShowForm(!showForm)}
          >
            <PlusCircleIcon className="size-3.5" />
            时间块
          </Button>
        </div>
      </div>

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>清空所有时间块</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            这将从时间线移除全部 {timeBlocks.length} 个时间块。此操作无法撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onClearAllTimeBlocks()
                setShowClearConfirm(false)
              }}
            >
              全部清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
