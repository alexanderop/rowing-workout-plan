import type { RouteRecordRaw, Router, RouterHistory } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

export const RouteNames = {
  settings: 'settings',
} as const

export type RouteName = (typeof RouteNames)[keyof typeof RouteNames]

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * Full-screen routes (media players, immersive editors, onboarding) can
     * opt out of the bottom navigation. AppShell reads this flag.
     */
    hideNav?: boolean
  }
}

const routes: Array<RouteRecordRaw> = [
  // Settings is the only screen there is, so it is also the home screen. The
  // redirect rather than a second record: one route name means the tab bar
  // still marks it current when the app opens on `/`.
  { path: '/', redirect: { name: RouteNames.settings } },
  {
    path: '/settings',
    name: RouteNames.settings,
    component: () => import('@/views/SettingsView.vue'),
  },
]

/**
 * Router factory instead of a singleton: the app creates one with web
 * history in main.ts, tests create isolated instances with memory history.
 */
export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
): Router {
  return createRouter({ history, routes })
}
