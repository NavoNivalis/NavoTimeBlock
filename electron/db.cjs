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

  // 任务属性 9 字段（文本）
  try { db.run("ALTER TABLE tasks ADD COLUMN goal TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN start_action TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN plan TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN deliverable TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN resources TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN start_date TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN deadline TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN difficulties TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN failure_criteria TEXT") } catch (e) { /* 已存在 */ }
  try { db.run("ALTER TABLE tasks ADD COLUMN created_at TEXT") } catch (e) { /* 已存在 */ }
  db.run("UPDATE tasks SET created_at = updated_at WHERE created_at IS NULL")

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

  // 项目（标签）与任务-项目关联、AI 设置键值表
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS task_projects (
      task_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      PRIMARY KEY (task_id, project_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS project_analyses (
      project_id TEXT PRIMARY KEY,
      analysis_json TEXT NOT NULL,
      analyzed_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

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
    "SELECT id, name, parent_id, sort_order, status, completed_at, deleted_at, invested_minutes, created_at FROM tasks ORDER BY sort_order"
  )
  const tasks = taskRows.length > 0 ? rowsToObjects(taskRows[0]) : []

  const blockRows = db.exec("SELECT id, task_id, start_minutes, end_minutes, date FROM time_blocks ORDER BY start_minutes")
  const timeBlocks = blockRows.length > 0 ? rowsToObjects(blockRows[0]) : []

  const attrRows = db.exec(
    "SELECT id AS task_id, goal, start_action, plan, deliverable, resources, start_date, deadline, difficulties, failure_criteria FROM tasks"
  )
  const taskAttributes = attrRows.length > 0 ? rowsToObjects(attrRows[0]) : []

  const tpRows = db.exec("SELECT task_id, project_id FROM task_projects")
  const taskProjects = tpRows.length > 0 ? rowsToObjects(tpRows[0]) : []

  return { tasks, timeBlocks, taskAttributes, taskProjects }
}

function saveTasks(taskList) {
  // 保留已有任务的状态信息与属性字段
  const existing = {}
  const oldRows = db.exec(
    "SELECT id, status, completed_at, deleted_at, invested_minutes, goal, start_action, plan, deliverable, resources, start_date, deadline, difficulties, failure_criteria, created_at FROM tasks"
  )
  if (oldRows.length > 0) {
    for (const row of oldRows[0].values) {
      existing[row[0]] = {
        status: row[1],
        completed_at: row[2],
        deleted_at: row[3],
        invested_minutes: row[4],
        goal: row[5],
        start_action: row[6],
        plan: row[7],
        deliverable: row[8],
        resources: row[9],
        start_date: row[10],
        deadline: row[11],
        difficulties: row[12],
        failure_criteria: row[13],
        created_at: row[14],
      }
    }
  }

  // 只删除活跃任务，保留已完成/已删除的行
  db.run("DELETE FROM tasks WHERE status = 'active'")

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO tasks (id, name, parent_id, sort_order, status, completed_at, deleted_at, invested_minutes, goal, start_action, plan, deliverable, resources, start_date, deadline, difficulties, failure_criteria, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))"
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
      prev.goal || null,
      prev.start_action || null,
      prev.plan || null,
      prev.deliverable || null,
      prev.resources || null,
      prev.start_date || null,
      prev.deadline || null,
      prev.difficulties || null,
      prev.failure_criteria || null,
      prev.created_at || null,
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

function saveTaskAttributes(taskId, attrs, projectIds) {
  // 若任务尚未持久化（如 AI 创建时 saveTasks 尚未执行），先占位插入，
  // 保证下方 UPDATE 能命中；后续 saveTasks 会用正确名称重建
  db.run("INSERT OR IGNORE INTO tasks (id, name) VALUES (?, ?)", [taskId, ""])
  db.run(
    `UPDATE tasks SET
      goal = ?, start_action = ?, plan = ?, deliverable = ?, resources = ?,
      start_date = ?, deadline = ?, difficulties = ?, failure_criteria = ?
    WHERE id = ?`,
    [
      attrs.goal ?? null,
      attrs.startAction ?? null,
      attrs.plan ?? null,
      attrs.deliverable ?? null,
      attrs.resources ?? null,
      attrs.startDate ?? null,
      attrs.deadline ?? null,
      attrs.difficulties ?? null,
      attrs.failureCriteria ?? null,
      taskId,
    ]
  )

  db.run("DELETE FROM task_projects WHERE task_id = ?", [taskId])
  const stmt = db.prepare("INSERT INTO task_projects (task_id, project_id) VALUES (?, ?)")
  for (const pid of projectIds || []) {
    stmt.run([taskId, pid])
  }
  stmt.free()
  saveToDisk()
}

function loadProjects() {
  const rows = db.exec("SELECT id, name FROM projects ORDER BY created_at")
  return rows.length > 0 ? rowsToObjects(rows[0]) : []
}

function createProject(name) {
  const crypto = require("crypto")
  const id = crypto.randomUUID()
  db.run("INSERT INTO projects (id, name) VALUES (?, ?)", [id, name])
  saveToDisk()
  return { id, name }
}

function deleteProject(id) {
  db.run("DELETE FROM projects WHERE id = ?", [id])
  db.run("DELETE FROM project_analyses WHERE project_id = ?", [id])
  saveToDisk()
}

function saveSetting(key, value) {
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value])
  saveToDisk()
}

function loadSettings() {
  const rows = db.exec("SELECT key, value FROM settings")
  if (rows.length === 0) return {}
  const obj = {}
  for (const row of rows[0].values) {
    obj[row[0]] = row[1]
  }
  return obj
}

function saveProjectAnalysis(projectId, analysis) {
  db.run(
    "INSERT OR REPLACE INTO project_analyses (project_id, analysis_json, analyzed_at) VALUES (?, ?, datetime('now', 'localtime'))",
    [projectId, JSON.stringify(analysis)]
  )
  saveToDisk()
}

function loadProjectAnalysis(projectId) {
  const stmt = db.prepare("SELECT analysis_json, analyzed_at FROM project_analyses WHERE project_id = ?")
  stmt.bind([projectId])
  let result = null
  if (stmt.step()) {
    const row = stmt.getAsObject()
    result = { analysis: JSON.parse(row.analysis_json), analyzedAt: row.analyzed_at }
  }
  stmt.free()
  return result
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
  saveTaskAttributes,
  loadProjects,
  createProject,
  deleteProject,
  saveSetting,
  loadSettings,
  saveProjectAnalysis,
  loadProjectAnalysis,
}
