import { useState, useMemo } from "react"
import type { Project, TaskAttributes, ProjectAnalysis } from "@/types/task"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { TrashIcon, FolderIcon, PlusIcon, SparkleIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

interface ProjectsViewProps {
  projects: Project[]
  /** taskId → projectId[] */
  taskProjects: Record<string, string[]>
  /** taskId → name */
  taskNames: Record<string, string>
  /** taskId → 属性 */
  taskAttributes: Record<string, TaskAttributes>
  /** taskId → 创建时间 */
  taskCreatedAt: Record<string, string>
  onCreateProject: (name: string) => Promise<Project>
  onDeleteProject: (id: string) => void
}

const ANALYSIS_FIELDS: { key: keyof Omit<ProjectAnalysis, "verdict">; label: string }[] = [
  { key: "outcome", label: "成果/产出" },
  { key: "efficiency", label: "效率" },
  { key: "resources", label: "资源消耗" },
  { key: "timeline", label: "交付时间" },
  { key: "failureNode", label: "失败止损节点" },
  { key: "relationships", label: "任务关系与变化" },
]

export function ProjectsView({ projects, taskProjects, taskNames, taskAttributes, taskCreatedAt, onCreateProject, onDeleteProject }: ProjectsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // projectId → taskId[]
  const projectTaskIds = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const [taskId, projectIds] of Object.entries(taskProjects)) {
      for (const pid of projectIds) {
        const list = map[pid] || []
        list.push(taskId)
        map[pid] = list
      }
    }
    return map
  }, [taskProjects])

  const selectedProject = selectedId ? projects.find((p) => p.id === selectedId) : undefined
  const selectedTasks = selectedId ? (projectTaskIds[selectedId] ?? []) : []

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    await onCreateProject(name)
    setNewName("")
  }

  const handleAnalyze = async (project: Project, force = false) => {
    setAnalysisOpen(true)
    setAnalysisError(null)

    const taskIds = projectTaskIds[project.id] ?? []
    if (taskIds.length === 0) {
      setAnalyzing(false)
      setAnalysis(null)
      setAnalyzedAt(null)
      setAnalysisError("该项目下暂无任务，无法分析")
      return
    }

    // 非强制时优先读缓存
    if (!force) {
      try {
        const cached = await window.electronAPI.loadProjectAnalysis(project.id)
        if (cached) {
          setAnalysis(cached.analysis)
          setAnalyzedAt(cached.analyzedAt)
          return
        }
      } catch {
        // 缓存读取失败则走实时分析
      }
    }

    setAnalyzing(true)
    setAnalysis(null)
    setAnalyzedAt(null)

    try {
      const tasks = taskIds.map((tid) => ({
        name: taskNames[tid] ?? "未知任务",
        ...(taskAttributes[tid] ?? {}),
        createdAt: taskCreatedAt[tid],
      }))
      const result = await window.electronAPI.analyzeProject(project.name, tasks)
      setAnalysis(result)
      setAnalyzedAt(new Date().toLocaleString())
      await window.electronAPI.saveProjectAnalysis(project.id, result)
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左栏：项目列表 */}
      <div className="flex w-72 shrink-0 flex-col border-r">
        <div className="flex gap-2 border-b p-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新建项目名称"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd() } }}
          />
          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={handleAdd}>
            <PlusIcon className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {projects.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">暂无项目，先在上方新建</p>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  selectedId === p.id ? "bg-accent" : "hover:bg-accent/70"
                )}
                onClick={() => setSelectedId(p.id)}
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[11px] text-muted-foreground/60">{projectTaskIds[p.id]?.length ?? 0}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(p) }}
                >
                  <TrashIcon className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右栏：选中项目的任务 */}
      <div className="flex-1 overflow-hidden">
        {!selectedProject ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            选择左侧项目查看任务
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center border-b px-4 py-2 text-sm font-medium">
              <span>{selectedProject.name}</span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">{selectedTasks.length} 个任务</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 gap-1.5"
                onClick={() => handleAnalyze(selectedProject)}
                disabled={analyzing}
              >
                <SparkleIcon className="size-3.5" />
                AI 分析
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {selectedTasks.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  该项目下暂无任务，右键任务可添加标签
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {selectedTasks.map((tid) => (
                    <div key={tid} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="truncate">{taskNames[tid] ?? "（未知任务）"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 删除确认 */}
      {pendingDelete && (
        <Dialog open onOpenChange={(o) => { if (!o) setPendingDelete(null) }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>删除项目</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              确定删除项目「{pendingDelete.name}」吗？任务不会被删除，只会解除关联。
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
              <Button variant="destructive" onClick={() => { onDeleteProject(pendingDelete.id); setPendingDelete(null) }}>删除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* AI 分析看板 */}
      {analysisOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) setAnalysisOpen(false) }}>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>AI 分析 — {selectedProject?.name}</DialogTitle>
            </DialogHeader>
            {analyzing ? (
              <div className="py-10 text-center text-sm text-muted-foreground">分析中…</div>
            ) : analysisError ? (
              <div className="py-6 text-sm text-destructive">{analysisError}</div>
            ) : analysis ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-md bg-accent/50 p-3">
                  <div className="mb-1 text-xs text-muted-foreground">总评</div>
                  <div className="text-sm font-medium">{analysis.verdict}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {ANALYSIS_FIELDS.map((item) => (
                    <div key={item.key} className="rounded-md border p-3">
                      <div className="mb-1 text-xs text-muted-foreground">{item.label}</div>
                      <div className="whitespace-pre-wrap text-sm">{analysis[item.key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {analysis && !analyzing && (
              <DialogFooter className="items-center">
                <span className="text-xs text-muted-foreground">
                  {analyzedAt ? `分析于 ${analyzedAt}` : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 gap-1.5"
                  onClick={() => selectedProject && handleAnalyze(selectedProject, true)}
                >
                  <SparkleIcon className="size-3.5" />
                  重新分析
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
