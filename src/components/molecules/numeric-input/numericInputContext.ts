import type { ComputedRef, InjectionKey, ModelRef, ShallowRef } from 'vue'
import type {
  NumericEditingState,
  NumericInputAction,
  ResolvedNumericInputOptions,
} from '@/lib/numericInput'
import { inject, provide } from 'vue'

export interface NumericInputContext {
  readonly open: ModelRef<boolean>
  readonly state: ShallowRef<NumericEditingState>
  readonly value: ComputedRef<number>
  readonly slotValue: ComputedRef<number>
  readonly displayText: ComputedRef<string>
  readonly formattedValue: ComputedRef<string>
  readonly decimalSeparator: ComputedRef<string>
  readonly options: ComputedRef<ResolvedNumericInputOptions>
  readonly presets: ComputedRef<ReadonlyArray<number>>
  readonly dispatch: (action: NumericInputAction) => void
  readonly confirm: () => void
  readonly cancel: () => void
  readonly handleKeydown: (event: KeyboardEvent) => void
}

const NUMERIC_INPUT_CONTEXT: InjectionKey<NumericInputContext> = Symbol('numeric-input')

export function provideNumericInputContext(context: NumericInputContext): void {
  provide(NUMERIC_INPUT_CONTEXT, context)
}

export function useNumericInputContext(): NumericInputContext {
  const context = inject(NUMERIC_INPUT_CONTEXT)
  if (context === undefined) {
    throw new Error('Numeric input parts must be used inside <MoleculeNumericInput>')
  }
  return context
}
