import { Profiler, useRef } from 'react'
import type { ReactNode, ProfilerOnRenderCallback } from 'react'

/** Instrumentação restrita ao build --mode profile; não atualiza estado React. */
export function BattleProfiler({ children }: { children: ReactNode }) {
  const output = useRef<HTMLOutputElement>(null)
  const records = useRef<unknown[]>([])
  const record: ProfilerOnRenderCallback = (
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime
  ) => {
    const stage = output.current?.parentElement?.querySelector<HTMLElement>('[data-fx-stage]')
    records.current.push({
      id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
      event: stage?.dataset.animation ?? 'mount',
      sequence: stage?.dataset.eventSequence ?? null,
    })
    if (records.current.length > 512) records.current.shift()
    if (output.current)
      output.current.textContent = JSON.stringify({ schema: 1, commits: records.current })
  }
  if (import.meta.env.MODE !== 'profile') return children
  return (
    <>
      <Profiler id="battle-scene" onRender={record}>
        {children}
      </Profiler>
      <output ref={output} hidden data-battle-profile />
    </>
  )
}
