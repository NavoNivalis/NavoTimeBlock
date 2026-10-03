import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CreateTaskDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string) => void
}

export function CreateTaskDialog({ open, onClose, onSubmit }: CreateTaskDialogProps) {
  const [name, setName] = useState("")

  const handleSubmit = () => {
    if (!name.trim()) return
    onSubmit(name.trim())
    setName("")
  }

  const handleClose = () => {
    setName("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent showCloseButton={false} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">任务名称</label>
          <Input
            className="h-8 text-sm"
            placeholder="你想做什么？"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            取消
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!name.trim()}>
            创建任务
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
