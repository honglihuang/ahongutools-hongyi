import type { ResolveTargetLang } from './contract.ts'

export function resolveTargetLang(...[detected, prefs]: Parameters<ResolveTargetLang>): string {
  return detected && detected === prefs.native ? prefs.foreign : prefs.native
}
