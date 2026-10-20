import { useState } from "react"
import type { TaskAttributes, Project } from "@/types/task"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export const ATTRIBUTE_FIELDS: { key: keyof TaskAttributes; label: string }[] = [
  { key: "goal", label: "根本目标" },
  { key: "startAction", label: "不可能失败的启动动作" },
  { key: "plan", label: "最终敲定的方案" },
  { key: "deliverable", label: "可交付的东西" },
  { key: "resources", label: "分配的资源和时间" },
  { key: "startDate", label: "开始时间" },
  { key: "deadline", label: "截止时间" },
  { key: "difficulties", label: "可能遇到的困难" },
  { key: "failureCriteria", label: "什么情况算失败" },
]

export function TaskAttributeView({
  taskName,
  attributes,
  projectNames,
  onClose,
}: {
  taskName: string
  attributes: TaskAttributes
  projectNames: string[]
  onClose: () => void
}) {
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{taskName}</SheetTitle>
          <SheetDescription>任务属性</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {projectNames.length > 0 && (
            <div className="mb-4">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">所属项目</div>
              <div className="flex flex-wrap gap-1">
                {projectNames.map((name) => (
                  <span key={name} className="border border-border bg-muted px-2 py-0.5 text-xs">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {ATTRIBUTE_FIELDS.map((f) => {
              const value = attributes[f.key]
              return (
                <div key={f.key}>
                  <div className="mb-0.5 text-xs font-medium text-muted-foreground">{f.label}</div>
                  <div className="whitespace-pre-wrap text-xs">{value || "—"}</div>
                </div>
              )
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function TaskAttributeEdit({
  taskName,
  attributes,
  projectIds,
  projects,
  onSave,
  onClose,
  onCreateProject,
}: {
  taskName: string
  attributes: TaskAttributes
  projectIds: string[]
  projects: Project[]
  onSave: (attrs: TaskAttributes, projectIds: string[]) => void
  onClose: () => void
  onCreateProject: (name: string) => Promise<Project>
}) {
  const [attrs, setAttrs] = useState<TaskAttributes>(attributes)
  const [selected, setSelected] = useState<string[]>(projectIds)
  const [newProjectName, setNewProjectName] = useState("")

  const toggleProject = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleAddProject = async () => {
    const name = newProjectName.trim()
    if (!name) return
    const project = await onCreateProject(name)
    setSelected((prev) => [...prev, project.id])
    setNewProjectName("")
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑属性 — {taskName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {ATTRIBUTE_FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <Textarea
                rows={2}
                value={attrs[f.key] ?? ""}
                onChange={(e) => setAttrs((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">所属项目（标签）</label>
            {projects.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无项目，可在下方新建</div>
            ) : (
              <div className="flex flex-col gap-1">
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggleProject(p.id)} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="新建项目名称"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddProject() } }}
              />
              <Button variant="outline" size="sm" onClick={handleAddProject}>添加</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(attrs, selected)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
