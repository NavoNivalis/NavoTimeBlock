export interface Task {
  id: string
  name: string
  completed?: boolean
  children?: Task[]
}

export interface TimeBlock {
  id: string
  taskId: string
  date: string       // "YYYY-MM-DD"
  startMinutes: number
  endMinutes: number
}

export interface TaskAttributes {
  goal?: string
  startAction?: string
  plan?: string
  deliverable?: string
  resources?: string
  startDate?: string
  deadline?: string
  difficulties?: string
  failureCriteria?: string
}

export interface Project {
  id: string
  name: string
}

export interface AISuggestedTask extends TaskAttributes {
  name: string
}

export interface ProjectAnalysis {
  verdict: string
  outcome: string
  efficiency: string
  resources: string
  timeline: string
  failureNode: string
  relationships: string
}

export interface ProjectAnalysisTask extends TaskAttributes {
  name: string
  createdAt?: string
}
