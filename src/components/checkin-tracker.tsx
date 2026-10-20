import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react"
import { zhCN } from "react-day-picker/locale"
import {
  format,
  subDays,
  parseISO,
  differenceInCalendarDays,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from "date-fns"
import type { Task } from "@/types/task"
import { useSimpleTreeUUID } from "@/hooks/use-simple-tree-uuid"
import { TaskTree } from "@/components/task-tree"
import { Calendar } from "@/components/ui/calendar"
import {
  CalendarHeatmap,
  CalendarHeatmapBody,
  CalendarHeatmapBlock,
  CalendarHeatmapFooter,
  CalendarHeatmapLegend,
  CalendarHeatmapStat,
} from "@/components/heatmap/calendar-heatmap"

const DAY_KEY = "yyyy-MM-dd"

function dateKey(d: Date): string {
  return format(d, DAY_KEY)
}

function findTask(tasks: readonly Task[], id: string | null): Task | null {
  if (!id) return null
  for (const t of tasks) {
    if (t.id === id) return t
    if (t.children) {
      const found = findTask(t.children, id)
      if (found) return found
    }
  }
  return null
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

interface CheckinTrackerProps {
  habits: Task[]
  onHabitsChanged?: (habits: Task[]) => void
  onSoftDeleteHabit: (habitId: string) => void
}

export function CheckinTracker({ habits, onHabitsChanged, onSoftDeleteHabit }: CheckinTrackerProps) {
  const [tree, handlers] = useSimpleTreeUUID(habits)
  const [checkins, setCheckins] = useState<Record<string, Set<string>>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const todayKey = dateKey(new Date())

  // ---- 习惯树的增 / 改 / 拖拽持久化 ----
  const treeMounted = useRef(false)
  useEffect(() => {
    if (!treeMounted.current) {
      treeMounted.current = true
      return
    }
    window.electronAPI.saveHabits([...tree])
    onHabitsChanged?.([...tree])
  }, [tree, onHabitsChanged])

  useEffect(() => {
    window.electronAPI.loadHabitCheckins().then((rows) => {
      const map: Record<string, Set<string>> = {}
      for (const r of rows) {
        if (!map[r.habit_id]) map[r.habit_id] = new Set()
        map[r.habit_id].add(r.date)
      }
      setCheckins(map)
      setLoaded(true)
    })
  }, [])

  const toggleToday = useCallback(
    async (taskId: string) => {
      const res = await window.electronAPI.toggleHabitCheckin(taskId, todayKey)
      setCheckins((prev) => {
        const set = new Set(prev[taskId] ?? [])
        if (res.checked) set.add(todayKey)
        else set.delete(todayKey)
        return { ...prev, [taskId]: set }
      })
    },
    [todayKey]
  )

  const checkState = useMemo(
    () => ({
      checked: (taskId: string) => checkins[taskId]?.has(todayKey) ?? false,
      onToggle: toggleToday,
    }),
    [checkins, todayKey, toggleToday]
  )

  const createTask = useCallback(
    (name: string) => {
      handlers.createWithName(name)
    },
    [handlers]
  )

  const selectedTask = useMemo(() => findTask(tree, selectedId), [tree, selectedId])
  useEffect(() => {
    if (!selectedTask) setSelectedId(tree[0]?.id ?? null)
  }, [tree, selectedTask])

  const days = useMemo(
    () => (selectedId ? checkins[selectedId] ?? new Set<string>() : new Set<string>()),
    [checkins, selectedId]
  )

  const heatmapData = useMemo(() => {
    const today = new Date()
    const out: { date: string; value: number }[] = []
    for (let i = 364; i >= 0; i--) {
      const key = dateKey(subDays(today, i))
      out.push({ date: key, value: days.has(key) ? 1 : 0 })
    }
    return out
  }, [days])

  const checkedDates = useMemo(() => Array.from(days).map((k) => parseISO(k)), [days])

  const stats = useMemo(() => {
    const keys = Array.from(days).sort()
    const total = keys.length

    let current = 0
    let cursor = new Date()
    if (!days.has(dateKey(cursor))) cursor = subDays(cursor, 1)
    while (days.has(dateKey(cursor))) {
      current++
      cursor = subDays(cursor, 1)
    }

    let longest = 0
    let run = 0
    let prev: Date | null = null
    for (const k of keys) {
      const d = parseISO(k)
      run = prev && differenceInCalendarDays(d, prev) === 1 ? run + 1 : 1
      longest = Math.max(longest, run)
      prev = d
    }

    const monthStart = startOfMonth(new Date())
    const thisMonth = keys.filter((k) => parseISO(k) >= monthStart).length

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
    const thisWeek = keys.filter((k) =>
      isWithinInterval(parseISO(k), { start: weekStart, end: weekEnd })
    ).length

    const first = keys[0] ? parseISO(keys[0]) : null
    const span = first ? Math.max(1, differenceInCalendarDays(new Date(), first) + 1) : 0
    const rate = span > 0 ? Math.round((total / span) * 100) : 0

    return { total, current, longest, thisMonth, thisWeek, rate }
  }, [days])

  const records = useMemo(() => Array.from(days).sort().reverse(), [days])

  const statItems: { label: string; value: string }[] = [
    { label: "累计打卡", value: `${stats.total} 天` },
    { label: "当前连续", value: `${stats.current} 天` },
    { label: "最长连续", value: `${stats.longest} 天` },
    { label: "本月打卡", value: `${stats.thisMonth} 天` },
    { label: "本周打卡", value: `${stats.thisWeek} 天` },
    { label: "打卡率", value: `${stats.rate}%` },
  ]

  return (
    <div className="flex h-full">
      {/* 左：复用任务列表（可增删改），勾选 = 今日打卡 */}
      <div className="w-72 shrink-0 border-r">
        <TaskTree
          tasks={tree}
          handlers={handlers}
          showFilter={false}
          badgeText={(id) => {
            const n = checkins[id]?.size ?? 0
            return n > 0 ? `${n} 天` : null
          }}
          checkState={checkState}
          onSoftDelete={onSoftDeleteHabit}
          onCreateTask={createTask}
          onSelect={(id) => setSelectedId(id)}
        />
      </div>

      {/* 右：选中任务的详情 */}
      <div className="flex-1 overflow-y-auto">
        {!selectedTask ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {loaded ? "选择左侧任务" : "加载中..."}
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-4">
            <h2 className="text-base font-medium">{selectedTask.name}</h2>

            <Section title="热力图（近一年）">
              <CalendarHeatmap
                data={heatmapData}
                weekStart={1}
                locale={zhCN}
                blockSize={10}
                blockMargin={3}
                colors={{ scale: "var(--primary)", empty: "var(--muted)" }}
                labels={{
                  stat: "{{year}} 年共 {{value}} 次",
                  cellLabel: "{{date}}：{{value}} 次",
                  heatmapLabel: "{{year}} 年打卡热力图",
                  legendLabel: "打卡强度",
                  legendLevelLabel: "{{level}} 级",
                }}
              >
                <CalendarHeatmapBody>
                  {({ activity, dayIndex, weekIndex }) => (
                    <CalendarHeatmapBlock
                      activity={activity}
                      dayIndex={dayIndex}
                      weekIndex={weekIndex}
                    />
                  )}
                </CalendarHeatmapBody>
                <CalendarHeatmapFooter>
                  <CalendarHeatmapStat />
                  <CalendarHeatmapLegend labels={{ less: "少", more: "多" }} />
                </CalendarHeatmapFooter>
              </CalendarHeatmap>
            </Section>

            <Section title="打卡日历">
              <Calendar
                mode="multiple"
                locale={zhCN}
                selected={checkedDates}
                className="w-fit rounded-md border"
              />
            </Section>

            <Section title="统计">
              <div className="grid w-fit grid-cols-3 gap-2">
                {statItems.map((s) => (
                  <div key={s.label} className="rounded-md border px-3 py-2">
                    <div className="text-base font-medium leading-tight tabular-nums">
                      {s.value}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="记录">
              {records.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无打卡记录</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {records.map((k) => (
                    <span
                      key={k}
                      className="rounded border px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}
