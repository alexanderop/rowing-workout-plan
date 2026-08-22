<script setup lang="ts">
import { Pin, PinOff, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import type { Note } from '@/db'
import { useNoteAge } from '../useNoteAge'

const { note } = defineProps<{ note: Note }>()

const emit = defineEmits<{
  togglePinned: []
  delete: []
}>()

const { t } = useI18n()

const age = useNoteAge(() => note.updatedAt)

// The domain returns data ({ unit, count }); only here does it become words.
// Plural-sensitive units pass the count as vue-i18n's plural argument.
const ageLabel = computed(() => {
  const current = age.value
  return current.unit === 'justNow'
    ? t('notes.age.justNow')
    : t(`notes.age.${current.unit}`, current.count)
})
</script>

<template>
  <article class="rounded-lg border bg-card p-4 shadow-xs">
    <div class="flex items-start gap-1">
      <div class="min-w-0 flex-1">
        <p v-if="note.pinned" class="text-xs font-medium text-primary">{{ t('notes.pinned') }}</p>
        <!-- h2, not h3: the note list sits directly under the page's h1 with no
             section heading between them, so h3 would skip a level. axe reports
             that as `heading-order`, and the a11y tier only sees it when a card
             is actually on screen — see the `notesHomeWithNote` sweep. -->
        <!-- `select-text` on both: the body carries the app's global
             `user-select: none` (src/style.css), which is right for chrome and
             wrong for the one thing on this card the user wrote themselves. -->
        <h2 class="truncate font-semibold select-text">{{ note.title }}</h2>
        <p
          v-if="note.body"
          class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground select-text"
        >
          {{ note.body }}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">{{ ageLabel }}</p>
      </div>
      <!-- Per-row actions carry the note title in their accessible name so
           screen-reader users can tell rows apart. -->
      <AtomButton
        variant="ghost"
        size="icon"
        :aria-label="
          note.pinned
            ? t('notes.actions.unpin', { title: note.title })
            : t('notes.actions.pin', { title: note.title })
        "
        @click="emit('togglePinned')"
      >
        <PinOff v-if="note.pinned" />
        <Pin v-else />
      </AtomButton>
      <AtomButton
        variant="ghost"
        size="icon"
        :aria-label="t('notes.actions.delete', { title: note.title })"
        @click="emit('delete')"
      >
        <Trash2 />
      </AtomButton>
    </div>
  </article>
</template>
