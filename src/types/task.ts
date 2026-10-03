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
