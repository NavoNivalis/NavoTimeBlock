const { app, BrowserWindow, ipcMain, Notification, Menu } = require("electron")
const path = require("path")
const db = require("./db.cjs")

const isDev = !app.isPackaged
app.commandLine.appendSwitch("disable-gpu")

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "TimeDone",
    icon: path.join(__dirname, isDev ? "../public/TimeDone.png" : "../TimeDone.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on("console-message", (_event, _level, message) => {
    console.log("[Renderer]", message)
  })

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("[Renderer Load Error]", errorCode, errorDescription)
  })

  if (isDev) {
    const devUrl = process.argv[2] || "http://localhost:5173"
    win.loadURL(devUrl)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"))
  }
}

app.whenReady().then(async () => {
  await db.init(app.getPath("userData"))

  ipcMain.handle("db:loadAll", () => {
    return db.loadAll()
  })

  ipcMain.handle("db:saveTasks", (_event, tasks) => {
    db.saveTasks(tasks)
  })

  ipcMain.handle("db:saveTimeBlocks", (_event, blocks) => {
    db.saveTimeBlocks(blocks)
  })

  ipcMain.handle("db:completeTask", (_event, id) => {
    db.completeTask(id)
  })

  ipcMain.handle("db:renameTask", (_event, id, name) => {
    db.renameTask(id, name)
  })

  ipcMain.handle("db:deleteTask", (_event, id) => {
    db.deleteTask(id)
  })

  ipcMain.handle("db:restoreTask", (_event, id) => {
    db.restoreTask(id)
  })

  ipcMain.handle("db:accumulateTime", (_event, taskId, minutes) => {
    const total = db.accumulateTime(taskId, minutes)
    return { taskId, investedMinutes: total }
  })

  ipcMain.handle("show-notification", (_event, title, body) => {
    new Notification({ title, body }).show()
  })

  ipcMain.handle("db:permanentlyDeleteAllDeleted", () => {
    return db.permanentlyDeleteAllDeleted()
  })

  ipcMain.handle("db:permanentlyDeleteTask", (_event, taskId) => {
    db.permanentlyDeleteTask(taskId)
  })

  ipcMain.handle("db:loadHabits", () => {
    return db.loadHabits()
  })

  ipcMain.handle("db:saveHabits", (_event, habits) => {
    db.saveHabits(habits)
  })

  ipcMain.handle("db:deleteHabit", (_event, id) => {
    db.deleteHabit(id)
  })

  ipcMain.handle("db:restoreHabit", (_event, id) => {
    db.restoreHabit(id)
  })

  ipcMain.handle("db:permanentlyDeleteHabit", (_event, habitId) => {
    db.permanentlyDeleteHabit(habitId)
  })

  ipcMain.handle("db:permanentlyDeleteAllDeletedHabits", () => {
    return db.permanentlyDeleteAllDeletedHabits()
  })

  ipcMain.handle("db:loadHabitCheckins", () => {
    return db.loadHabitCheckins()
  })

  ipcMain.handle("db:toggleHabitCheckin", (_event, habitId, date) => {
    return db.toggleHabitCheckin(habitId, date)
  })

  // 启动时清理超过30天的已删除任务
  db.cleanupDeletedTasks()

  Menu.setApplicationMenu(null)
  createWindow()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
