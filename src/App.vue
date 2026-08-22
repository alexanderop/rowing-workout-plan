<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import OrganismAppShell from '@/components/organisms/OrganismAppShell.vue'
import OrganismPwaInstallPrompt from '@/components/organisms/OrganismPwaInstallPrompt.vue'
import MoleculePwaUpdatePrompt from '@/components/molecules/MoleculePwaUpdatePrompt.vue'
import MoleculeToastViewport from '@/components/molecules/MoleculeToastViewport.vue'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import { useLocale } from '@/composables/useLocale'
import { useTheme } from '@/composables/useTheme'
import { NAV_ITEMS } from '@/router/navigation'
import type { NavItem } from '@/types/navigation'

// The shell's #center-action slot is deliberately unfilled: it held the
// quick-add "+" of the notes worked example, and comes back as "start a row"
// once there is a workout to start.

const { t } = useI18n()

useTheme()
useLocale()
useKeyboardInset()

const navItems = computed<Array<NavItem>>(() =>
  NAV_ITEMS.map((item) => ({
    routeName: item.routeName,
    icon: item.icon,
    label: t(item.labelKey),
  })),
)
</script>

<template>
  <div data-testid="app" class="h-full">
    <OrganismAppShell :items="navItems">
      <RouterView />
    </OrganismAppShell>

    <MoleculePwaUpdatePrompt />
    <OrganismPwaInstallPrompt />
    <MoleculeToastViewport />
  </div>
</template>
