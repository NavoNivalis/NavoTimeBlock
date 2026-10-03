const path = require("path")
const fs = require("fs")
const initSqlJs = require("sql.js")

const DB_FILENAME = "timedone.db"

let db = null
let dbPath = null

function columnExists(table, column) {
  const r = db.exec(`PRAGMA table_info(${table})`)
  if (r.length === 0 || r[0].values.length === 0) return false
  return r[0].values.some((row) => row[1] === column)
}

async function init(userDataPath) {
  const SQL = await initSqlJs()
  dbPath = path.join(userDataPath, DB_FILENAME)

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA foreign_keys = ON")

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 迁移：为已有数据库添加新字段
  try { db.run("ALTER TABLE tasks ADD COLUMN status TEXT DEFAULT 'active'") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN completed_at TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN deleted_at TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN invested_minutes INTEGER DEFAULT 0") } catch (e) { /* 已存在 */ }

  // 确保旧数据 status 不为空
  db.run("UPDATE tasks SET status = 'active' WHERE status IS NULL")

  db.run(`
    CREATE TABLE IF NOT EXISTS time_blocks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      start_minutes INTEGER NOT NULL,
      end_minutes INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `)

  // 迁移：为已有数据库添加 date 字段
  try { db.run("ALTER TABLE time_blocks ADD COLUMN date TEXT") } catch (e) { /* 已存在 */ }
  db.run("UPDATE time_blocks SET date = date('now') WHERE date IS NULL")

  // 旧版 habits 表（缺 status 列）作废重建，打卡从空开始
  if (columnExists("habits", "id") && !columnExists("habits", "status")) {
    db.run("DROP TABLE IF EXISTS habit_checkins")
    db.run("DROP TABLE IF EXISTS habits")
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      deleted_at TEXT
    )
  `)

  db.run("UPDATE habits SET status = 'active' WHERE status IS NULL")

  db.run(`
    CREATE TABLE IF NOT EXISTS habit_checkins (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      UNIQUE(habit_id, date)
    )
  `)

  // 清理已废弃的表（先删子表再删父表）
  db.run("DROP TABLE IF EXISTS task_checkins")
  db.run("DROP TABLE IF EXISTS task_feedbacks")
  db.run("DROP TABLE IF EXISTS task_plans")
  db.run("DROP TABLE IF EXISTS reports")
  db.run("DROP TABLE IF EXISTS analysis_results")

  saveToDisk()
}

function saveToDisk() {
  if (!db || !dbPath) return
  try {
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  } catch (e) {
    console.error("Failed to save database:", e.message)
  }
}

function loadAll() {
  const taskRows = db.exec(
    "SELECT id, name, parent_id, sort_order, status, completed_at, deleted_at, invested_minutes FROM tasks ORDER BY sort_order"
  )
  const tasks = taskRows.length > 0 ? rowsToObjects(taskRows[0]) : []

  const blockRows = db.exec("SELECT id, task_id, start_minutes, end_minutes, date FROM time_blocks ORDER BY start_minutes")
  const timeBlocks = blockRows.length > 0 ? rowsToObjects(blockRows[0]) : []

  return { tasks, timeBlocks }
}

function saveTasks(taskList) {
  // 保留已有任务的状态信息
  const existing = {}
  const oldRows = db.exec("SELECT id, status, completed_at, deleted_at, invested_minutes FROM tasks")
  if (oldRows.length > 0) {
    for (const row of oldRows[0].values) {
      existing[row[0]] = { status: row[1], completed_at: row[2], deleted_at: row[3], invested_minutes: row[4] }
    }
  }

  // 只删除活跃任务，保留已完成/已删除的行
  db.run("DELETE FROM tasks WHERE status = 'active'")

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO tasks (id, name, parent_id, sort_order, status, completed_at, deleted_at, invested_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
  const seen = new Set()
  saveTaskNodes(taskList, null, 0, stmt, existing, seen)
  stmt.free()
  saveToDisk()
}

function saveTaskNodes(nodes, parentId, startIndex, stmt, existing, seen) {
  nodes.forEach((node, i) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    const prev = existing[node.id] || {}
    stmt.run([
      node.id,
      node.name,
      parentId,
      startIndex + i,
      prev.status || "active",
      prev.completed_at || null,
      prev.deleted_at || null,
      prev.invested_minutes || 0,
    ])
    if (node.children && node.children.length > 0) {
      saveTaskNodes(node.children, node.id, 0, stmt, existing, seen)
    }
  })
}

function saveTimeBlocks(blocks) {
  db.run("DELETE FROM time_blocks")
  const stmt = db.prepare("INSERT INTO time_blocks (id, task_id, start_minutes, end_minutes, date) VALUES (?, ?, ?, ?, ?)")
  blocks.forEach((b) => {
    stmt.run([b.id, b.taskId, b.startMinutes, b.endMinutes, b.date || new Date().toISOString().slice(0, 10)])
  })
  stmt.free()
  saveToDisk()
}

function renameTask(id, name) {
  db.run("UPDATE tasks SET name = ? WHERE id = ?", [name, id])
  saveToDisk()
}

function completeTask(id) {
  const ids = collectDescendantIds(id)
  ids.push(id)
  for (const tid of ids) {
    db.run("UPDATE tasks SET status = 'completed', completed_at = datetime('now'), deleted_at = NULL WHERE id = ?", [tid])
  }
  saveToDisk()
}

function deleteTask(id) {
  const ids = collectDescendantIds(id)
  ids.push(id)
  for (const tid of ids) {
    db.run("UPDATE tasks SET status = 'deleted', deleted_at = datetime('now'), completed_at = NULL WHERE id = ?", [tid])
  }
  saveToDisk()
}

function restoreTask(id) {
  const ids = collectDescendantIds(id)
  ids.push(id)
  for (const tid of ids) {
    db.run("UPDATE tasks SET status = 'active', completed_at = NULL, deleted_at = NULL WHERE id = ?", [tid])
  }
  saveToDisk()
}

function collectDescendantIds(parentId) {
  const ids = []
  const queue = [parentId]
  while (queue.length > 0) {
    const current = queue.shift()
    const rows = db.exec("SELECT id FROM tasks WHERE parent_id = ? AND status = 'active'", [current])
    if (rows.length > 0) {
      for (const row of rows[0].values) {
        ids.push(row[0])
        queue.push(row[0])
      }
    }
  }
  return ids
}

function cleanupDeletedTasks() {
  db.run("DELETE FROM tasks WHERE status = 'deleted' AND deleted_at < datetime('now', '-30 days')")
  saveToDisk()
}

function permanentlyDeleteAllDeleted() {
  const rows = db.exec("SELECT id FROM tasks WHERE status = 'deleted'")
  if (rows.length === 0 || rows[0].values.length === 0) return 0

  const ids = rows[0].values.map(r => r[0])
  const placeholders = ids.map(() => '?').join(',')

  db.run(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids)
  saveToDisk()
  return ids.length
}

function permanentlyDeleteTask(taskId) {
  db.run("DELETE FROM tasks WHERE id = ?", [taskId])
  saveToDisk()
}

function accumulateTime(taskId, minutes) {
  db.run("UPDATE tasks SET invested_minutes = invested_minutes + ? WHERE id = ?", [minutes, taskId])
  const rows = db.exec("SELECT invested_minutes FROM tasks WHERE id = ?", [taskId])
  saveToDisk()
  return rows.length > 0 && rows[0].values.length > 0 ? rows[0].values[0][0] : 0
}

function loadHabits() {
  const rows = db.exec("SELECT id, name, parent_id, sort_order, status, deleted_at FROM habits ORDER BY sort_order")
  return rows.length > 0 ? rowsToObjects(rows[0]) : []
}

function saveHabits(habitList) {
  const existing = {}
  const oldRows = db.exec("SELECT id, status, deleted_at FROM habits")
  if (oldRows.length > 0) {
    for (const row of oldRows[0].values) {
      existing[row[0]] = { status: row[1], deleted_at: row[2] }
    }
  }

  db.run("DELETE FROM habits WHERE status = 'active'")

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO habits (id, name, parent_id, sort_order, status, deleted_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
  const seen = new Set()
  saveHabitNodes(habitList, null, 0, stmt, existing, seen)
  stmt.free()
  saveToDisk()
}

function saveHabitNodes(nodes, parentId, startIndex, stmt, existing, seen) {
  nodes.forEach((node, i) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    const prev = existing[node.id] || {}
    stmt.run([
      node.id,
      node.name,
      parentId,
      startIndex + i,
      prev.status || "active",
      prev.deleted_at || null,
    ])
    if (node.children && node.children.length > 0) {
      saveHabitNodes(node.children, node.id, 0, stmt, existing, seen)
    }
  })
}

function collectHabitDescendantIds(parentId) {
  const ids = []
  const queue = [parentId]
  while (queue.length > 0) {
    const current = queue.shift()
    const rows = db.exec("SELECT id FROM habits WHERE parent_id = ?", [current])
    if (rows.length > 0) {
      for (const row of rows[0].values) {
        ids.push(row[0])
        queue.push(row[0])
      }
    }
  }
  return ids
}

function deleteHabit(id) {
  const ids = collectHabitDescendantIds(id)
  ids.push(id)
  for (const hid of ids) {
    db.run("UPDATE habits SET status = 'deleted', deleted_at = datetime('now') WHERE id = ?", [hid])
  }
  saveToDisk()
}

function restoreHabit(id) {
  const ids = collectHabitDescendantIds(id)
  ids.push(id)
  for (const hid of ids) {
    db.run("UPDATE habits SET status = 'active', deleted_at = NULL WHERE id = ?", [hid])
  }
  saveToDisk()
}

function permanentlyDeleteHabit(habitId) {
  db.run("DELETE FROM habit_checkins WHERE habit_id = ?", [habitId])
  db.run("DELETE FROM habits WHERE id = ?", [habitId])
  saveToDisk()
}

function permanentlyDeleteAllDeletedHabits() {
  const rows = db.exec("SELECT id FROM habits WHERE status = 'deleted'")
  if (rows.length === 0 || rows[0].values.length === 0) return 0

  const ids = rows[0].values.map(r => r[0])
  const placeholders = ids.map(() => '?').join(',')

  db.run(`DELETE FROM habit_checkins WHERE habit_id IN (${placeholders})`, ids)
  db.run(`DELETE FROM habits WHERE id IN (${placeholders})`, ids)
  saveToDisk()
  return ids.length
}

function loadHabitCheckins() {
  const rows = db.exec("SELECT habit_id, date FROM habit_checkins ORDER BY date")
  return rows.length > 0 ? rowsToObjects(rows[0]) : []
}

function toggleHabitCheckin(habitId, date) {
  const existing = db.exec("SELECT id FROM habit_checkins WHERE habit_id = ? AND date = ?", [habitId, date])
  const found = existing.length > 0 && existing[0].values.length > 0

  if (found) {
    db.run("DELETE FROM habit_checkins WHERE habit_id = ? AND date = ?", [habitId, date])
    saveToDisk()
    return { checked: false }
  }

  const crypto = require("crypto")
  db.run("INSERT INTO habit_checkins (id, habit_id, date) VALUES (?, ?, ?)", [crypto.randomUUID(), habitId, date])
  saveToDisk()
  return { checked: true }
}

function rowsToObjects(result) {
  const cols = result.columns
  return result.values.map((row) => {
    const obj = {}
    cols.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}

module.exports = {
  init,
  loadAll,
  saveTasks,
  saveTimeBlocks,
  renameTask,
  completeTask,
  deleteTask,
  restoreTask,
  cleanupDeletedTasks,
  permanentlyDeleteAllDeleted,
  permanentlyDeleteTask,
  accumulateTime,
  loadHabits,
  saveHabits,
  deleteHabit,
  restoreHabit,
  permanentlyDeleteHabit,
  permanentlyDeleteAllDeletedHabits,
  loadHabitCheckins,
  toggleHabitCheckin,
}
