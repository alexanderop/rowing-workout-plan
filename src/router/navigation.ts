import type { Component } from 'vue'
import { Settings } from '@lucide/vue'
import type { RouteName } from './index'
import { RouteNames } from './index'

/**
 * Bottom navigation, declared as data. Add a tab by adding an entry here —
 * the shell splits the items around the optional center action on its own.
 * `labelKey` is resolved through i18n in App.vue.
 */
export type NavItemConfig = {
  routeName: RouteName
  icon: Component
  labelKey: string
}

export const NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  { routeName: RouteNames.settings, icon: Settings, labelKey: 'nav.settings' },
]
