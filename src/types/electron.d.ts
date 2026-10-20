import type { Task, TimeBlock, TaskAttributes, Project, AISuggestedTask, ProjectAnalysis, ProjectAnalysisTask } from "./task"

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
  created_at: string | null
}

interface DBTaskAttributeRow {
  task_id: string
  goal: string | null
  start_action: string | null
  plan: string | null
  deliverable: string | null
  resources: string | null
  start_date: string | null
  deadline: string | null
  difficulties: string | null
  failure_criteria: string | null
}

interface DBTaskProjectRow {
  task_id: string
  project_id: string
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
    taskAttributes: DBTaskAttributeRow[]
    taskProjects: DBTaskProjectRow[]
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
  saveTaskAttributes: (taskId: string, attrs: TaskAttributes, projectIds: string[]) => Promise<void>
  loadProjects: () => Promise<Project[]>
  createProject: (name: string) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  saveSetting: (key: string, value: string) => Promise<void>
  loadSettings: () => Promise<Record<string, string>>
  aiGenerateTask: (text: string) => Promise<AISuggestedTask>
  analyzeProject: (projectName: string, tasks: ProjectAnalysisTask[]) => Promise<ProjectAnalysis>
  saveProjectAnalysis: (projectId: string, analysis: ProjectAnalysis) => Promise<void>
  loadProjectAnalysis: (projectId: string) => Promise<{ analysis: ProjectAnalysis; analyzedAt: string } | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
