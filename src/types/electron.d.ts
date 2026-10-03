import type { Task, TimeBlock } from "./task"

interface DBTimeBlockRow {
  id: string
  task_id: string
  date?: string
  start_minutes: number
  end_minutes: number
}

interface DBTaskRow {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  status: string
  completed_at: string | null
  deleted_at: string | null
  invested_minutes: number
}

interface DBHabitRow {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  status: string
  deleted_at: string | null
}

interface DBHabitCheckinRow {
  habit_id: string
  date: string
}

interface ElectronAPI {
  platform: string
  loadAll: () => Promise<{
    tasks: DBTaskRow[]
    timeBlocks: DBTimeBlockRow[]
  }>
  saveTasks: (tasks: Task[]) => Promise<void>
  saveTimeBlocks: (blocks: TimeBlock[]) => Promise<void>
  completeTask: (id: string) => Promise<void>
  renameTask: (id: string, name: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  restoreTask: (id: string) => Promise<void>
  accumulateTime: (taskId: string, minutes: number) => Promise<{
    taskId: string
    investedMinutes: number
  }>
  showNotification: (title: string, body: string) => Promise<void>
  permanentlyDeleteAllDeleted: () => Promise<number>
  permanentlyDeleteTask: (taskId: string) => Promise<void>
  loadHabits: () => Promise<DBHabitRow[]>
  saveHabits: (habits: Task[]) => Promise<void>
  deleteHabit: (id: string) => Promise<void>
  restoreHabit: (id: string) => Promise<void>
  permanentlyDeleteHabit: (habitId: string) => Promise<void>
  permanentlyDeleteAllDeletedHabits: () => Promise<number>
  loadHabitCheckins: () => Promise<DBHabitCheckinRow[]>
  toggleHabitCheckin: (habitId: string, date: string) => Promise<{ checked: boolean }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
