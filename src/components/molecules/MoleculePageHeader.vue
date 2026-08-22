<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AtomButton from '@/components/atoms/AtomButton.vue'

const { t } = useI18n()

const {
  title,
  subtitle,
  backTo,
  showBack = true,
  preventNavigation = false,
} = defineProps<{
  title: string
  subtitle?: string
  /** Explicit back target; defaults to history back. */
  backTo?: string
  /** Root-level pages (tabs) render no back button. */
  showBack?: boolean
  /** Let the parent intercept back (e.g. unsaved-changes guard). */
  preventNavigation?: boolean
}>()

const emit = defineEmits<{
  back: []
}>()

defineSlots<{
  actions?: () => unknown
}>()

const router = useRouter()

function handleBack(): void {
  emit('back')
  if (preventNavigation) return
  if (backTo) {
    void router.push(backTo)
    return
  }
  router.back()
}
</script>

<template>
  <header
    class="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
  >
    <div class="flex items-center gap-3 px-4 py-3">
      <AtomButton
        v-if="showBack"
        variant="ghost"
        size="icon"
        class="shrink-0"
        :aria-label="t('common.aria.goBack')"
        @click="handleBack"
      >
        <ChevronLeft class="size-5" />
      </AtomButton>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold tracking-tight">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="text-sm text-muted-foreground">
          {{ subtitle }}
        </p>
      </div>
      <slot name="actions" />
    </div>
  </header>
</template>
