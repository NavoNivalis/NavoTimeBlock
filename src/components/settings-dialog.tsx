import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const KEYS = {
  baseUrl: "ai.base_url",
  apiKey: "ai.api_key",
  model: "ai.model",
}

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("deepseek-flash")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    window.electronAPI.loadSettings().then((settings) => {
      setBaseUrl(settings[KEYS.baseUrl] ?? "")
      setApiKey(settings[KEYS.apiKey] ?? "")
      setModel(settings[KEYS.model] ?? "deepseek-flash")
    })
  }, [open])

  const handleSave = async () => {
    setLoading(true)
    try {
      await Promise.all([
        window.electronAPI.saveSetting(KEYS.baseUrl, baseUrl.trim()),
        window.electronAPI.saveSetting(KEYS.apiKey, apiKey.trim()),
        window.electronAPI.saveSetting(KEYS.model, model.trim() || "deepseek-flash"),
      ])
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">API 地址（base_url）</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="留空则用 DeepSeek 默认 https://api.deepseek.com/v1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">模型</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-flash"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={loading}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
