import { useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CommandIcon, TimerIcon, CheckCircleIcon, BellIcon, GearIcon, FolderIcon } from "@phosphor-icons/react"

interface NotificationItem {
  id: string
  taskName: string
  type: string
  minutes: number
  time: string
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentView: string
  onNavigate: (view: string) => void
  notifications: NotificationItem[]
  onOpenSettings: () => void
}

export function AppSidebar({ currentView, onNavigate, notifications, onOpenSettings, ...props }: AppSidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <CommandIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">TimeDone</span>
                <span className="truncate text-xs">TimeDone</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentView === "tasks"}
                tooltip="任务"
                onClick={() => onNavigate("tasks")}
              >
                <TimerIcon className="size-4" />
                <span>任务</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentView === "habits"}
                tooltip="打卡"
                onClick={() => onNavigate("habits")}
              >
                <CheckCircleIcon className="size-4" />
                <span>打卡</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentView === "projects"}
                tooltip="项目"
                onClick={() => onNavigate("projects")}
              >
                <FolderIcon className="size-4" />
                <span>项目</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Alerts */}
      <SidebarFooter>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent">
            <BellIcon className="size-3.5" weight={notifications.length > 0 ? "fill" : "regular"} />
            <span>提醒</span>
            {notifications.length > 0 && (
              <span className="ml-auto rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium">
                {notifications.length}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-56 p-0"
          >
            <div className="max-h-48 overflow-y-auto p-1">
              {notifications.length === 0 ? (
                <p className="px-2 py-3 text-[11px] text-muted-foreground/50 text-center">暂无提醒</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-[11px] hover:bg-accent"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="shrink-0 text-muted-foreground/50">{n.type}</span>
                      <span className="truncate">{n.taskName}</span>
                    </span>
                    <span className="ml-1 shrink-0 text-muted-foreground/60">
                      {n.time}
                    </span>
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent"
          onClick={onOpenSettings}
        >
          <GearIcon className="size-3.5" />
          <span>设置</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}
