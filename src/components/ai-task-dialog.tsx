import { useState } from "react"
import type { AISuggestedTask } from "@/types/task"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ATTRIBUTE_FIELDS } from "@/components/task-attributes"

export function AiTaskDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (suggestion: AISuggestedTask) => void
}) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [suggestion, setSuggestion] = useState<AISuggestedTask | null>(null)

  const handleGenerate = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError("")
    try {
      const result = await window.electronAPI.aiGenerateTask(text.trim())
      setSuggestion(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI 生成任务</DialogTitle>
        </DialogHeader>

        {!suggestion ? (
          <div className="flex flex-col gap-2">
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="描述你此刻的想法或要做的事，AI 会转成任务并填好属性"
            />
            {error && <div className="text-xs text-destructive">{error}</div>}
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">任务名称</label>
              <Input
                value={suggestion.name}
                onChange={(e) => setSuggestion((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              />
            </div>
            {ATTRIBUTE_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{f.label}</label>
                <Textarea
                  rows={2}
                  value={suggestion[f.key] ?? ""}
                  onChange={(e) => setSuggestion((prev) => (prev ? ({ ...prev, [f.key]: e.target.value } as AISuggestedTask) : prev))}
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          {!suggestion ? (
            <Button onClick={handleGenerate} disabled={loading || !text.trim()}>
              {loading ? "生成中…" : "生成"}
            </Button>
          ) : (
            <Button onClick={() => suggestion && onCreate(suggestion)}>创建任务</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
