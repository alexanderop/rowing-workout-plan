import type { RouteRecordRaw, Router, RouterHistory } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

export const RouteNames = {
  today: 'today',
  plans: 'plans',
  log: 'log',
  planWeek: 'plan-week',
  session: 'session',
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
  // Today is the home screen, and the only one that answers the question a
  // rower opens the app with. It is the path itself rather than a redirect:
  // there is nothing left to redirect to now that it has content of its own.
  {
    path: '/',
    name: RouteNames.today,
    component: () => import('@/views/TodayView.vue'),
  },
  {
    path: '/plans',
    name: RouteNames.plans,
    component: () => import('@/views/PlansView.vue'),
  },
  {
    // The week is in the path rather than in a query or in component state:
    // a rower comparing week 3 with week 6 wants two tabs, and the back
    // button out of a session has to land on the week it came from.
    path: '/plans/:planId/weeks/:week',
    name: RouteNames.planWeek,
    component: () => import('@/views/PlanWeekView.vue'),
  },
  {
    // Not nested under its plan: a session id already names exactly one
    // session in exactly one plan, so a second copy of that in the path
    // would be a second thing that can disagree.
    path: '/sessions/:sessionId',
    name: RouteNames.session,
    component: () => import('@/views/SessionView.vue'),
  },
  {
    path: '/log',
    name: RouteNames.log,
    component: () => import('@/views/LogView.vue'),
  },
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
