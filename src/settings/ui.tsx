// 设置页的小型布局件。复用上游选项页的 ConfigSection / ConfigItem，保证与上游设置页同一视觉。
import type { ReactNode } from 'react'
import { ConfigItem } from '@/entrypoints/options/components/config-item'
import { ConfigSection } from '@/entrypoints/options/components/config-section'
import { Label } from '@/components/ui/base-ui/label'

export { ConfigItem, ConfigSection }

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-[13px] text-destructive">{error}</p>
      ) : (
        hint && <p className="text-[13px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-[18px] text-muted-foreground">{children}</p>
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
