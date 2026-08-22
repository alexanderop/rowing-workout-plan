import type { Component } from 'vue'

/**
 * One entry in the bottom navigation. `label` is already translated —
 * the shell renders it verbatim so it stays free of i18n concerns.
 */
export type NavItem = {
  routeName: string
  icon: Component
  label: string
}
