<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { DialogRoot, useForwardPropsEmits } from 'reka-ui'

/**
 * The provider. Renders no DOM of its own — it establishes the dialog
 * context (open state, ids, focus bookkeeping) that every other part of
 * this barrel injects. That is what lets `<DialogClose>` sit anywhere in
 * the tree, including outside `<MoleculeDialogContent>`.
 */
const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()

defineSlots<{
  default: (props: { open: boolean; close: () => void }) => unknown
}>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DialogRoot v-slot="slotProps" data-slot="dialog" v-bind="forwarded">
    <slot v-bind="slotProps" />
  </DialogRoot>
</template>
