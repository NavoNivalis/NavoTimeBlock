const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  loadAll: () => ipcRenderer.invoke("db:loadAll"),
  saveTasks: (tasks) => ipcRenderer.invoke("db:saveTasks", tasks),
  saveTimeBlocks: (blocks) => ipcRenderer.invoke("db:saveTimeBlocks", blocks),
  completeTask: (id) => ipcRenderer.invoke("db:completeTask", id),
  renameTask: (id, name) => ipcRenderer.invoke("db:renameTask", id, name),
  deleteTask: (id) => ipcRenderer.invoke("db:deleteTask", id),
  restoreTask: (id) => ipcRenderer.invoke("db:restoreTask", id),
  accumulateTime: (taskId, minutes) => ipcRenderer.invoke("db:accumulateTime", taskId, minutes),
  showNotification: (title, body) => ipcRenderer.invoke("show-notification", title, body),
  permanentlyDeleteAllDeleted: () => ipcRenderer.invoke("db:permanentlyDeleteAllDeleted"),
  permanentlyDeleteTask: (taskId) => ipcRenderer.invoke("db:permanentlyDeleteTask", taskId),
  loadHabits: () => ipcRenderer.invoke("db:loadHabits"),
  saveHabits: (habits) => ipcRenderer.invoke("db:saveHabits", habits),
  deleteHabit: (id) => ipcRenderer.invoke("db:deleteHabit", id),
  restoreHabit: (id) => ipcRenderer.invoke("db:restoreHabit", id),
  permanentlyDeleteHabit: (habitId) => ipcRenderer.invoke("db:permanentlyDeleteHabit", habitId),
  permanentlyDeleteAllDeletedHabits: () => ipcRenderer.invoke("db:permanentlyDeleteAllDeletedHabits"),
  loadHabitCheckins: () => ipcRenderer.invoke("db:loadHabitCheckins"),
  toggleHabitCheckin: (habitId, date) => ipcRenderer.invoke("db:toggleHabitCheckin", habitId, date),
})
