<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { computed, defineAsyncComponent } from 'vue'
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
import { useQuickAddStore } from '@/stores/quickAdd'
import type { NavItem } from '@/types/navigation'

// Loaded on first use so the quick-add machinery stays off the startup path.
const QuickAddNoteSheet = defineAsyncComponent(
  () => import('@/features/notes/components/QuickAddNoteSheet.vue'),
)

const { t } = useI18n()

useTheme()
useLocale()
useKeyboardInset()

const quickAdd = useQuickAddStore()

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

      <template #center-action>
        <!-- The outer button, not the inner span, is the hit target — so the
             double-tap-zoom suppression belongs here even though the visible
             press transform is on the span. -->
        <!-- eslint-disable-next-line vue/no-restricted-html-elements -- AtomButton cannot express a nav-bar slot: `buttonVariants` is `inline-flex` with `gap-2 rounded-md`, and its `[&_svg:not([class*='size-'])]:size-4` would shrink the 26px Plus icon, since lucide sets size as an attribute rather than a class. Wants a `nav` variant on the atom, not an override here. -->
        <button
          type="button"
          class="flex flex-1 flex-col items-center justify-center px-2 py-2 select-none touch-manipulation"
          :aria-label="t('quickAdd.open')"
          @click="quickAdd.open()"
        >
          <span
            class="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
          >
            <Plus :size="26" aria-hidden="true" />
          </span>
        </button>
      </template>
    </OrganismAppShell>

    <QuickAddNoteSheet v-if="quickAdd.hasOpened" v-model:open="quickAdd.isOpen" />
    <MoleculePwaUpdatePrompt />
    <OrganismPwaInstallPrompt />
    <MoleculeToastViewport />
  </div>
</template>
