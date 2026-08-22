import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { useLocale } from '@/composables/useLocale'

/**
 * The locale-aware formatting the training screens share: a rowed distance,
 * a workout's date, a month heading.
 *
 * `Intl` rather than messages with formats inside them — every locale orders
 * a date differently and separates thousands differently, and the browser
 * already knows how. Keeping it in one composable is what stops "10,240 m"
 * on one screen from being "10240 m" on the next.
 *
 * A composable rather than a core module because it reads two ambient things:
 * the chosen locale and the device's timezone. Core takes its inputs as
 * arguments (docs/functional-core.md), and neither of these is one.
 *
 * The formatters are `computed` so a locale change rebuilds them — an
 * `Intl.DateTimeFormat` captures its locale when it is constructed, so one
 * built at module scope would keep formatting in English forever.
 */
interface UseTrainingFormatReturn {
  /** Metres with the locale's grouping, unit included: `10,240 m`. */
  metres: ComputedRef<(value: number) => string>
  /** A workout's day, as a log row heads it: `Thu 20 Aug`. */
  day: ComputedRef<(timestamp: number) => string>
  /** The day spelled out, as Today heads itself: `Saturday, 22 August`. */
  longDay: ComputedRef<(timestamp: number) => string>
  /** The month a total covers: `August 2026`. */
  month: ComputedRef<(timestamp: number) => string>
}

export function useTrainingFormat(): UseTrainingFormatReturn {
  const { locale } = useLocale()

  const metresFormat = computed(() => new Intl.NumberFormat(locale.value))
  const dayFormat = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, { weekday: 'short', day: 'numeric', month: 'short' }),
  )
  const longDayFormat = computed(
    () => new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }),
  )
  const monthFormat = computed(
    () => new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }),
  )

  return {
    metres: computed(() => (value: number) => `${metresFormat.value.format(value)} m`),
    day: computed(() => (timestamp: number) => dayFormat.value.format(new Date(timestamp))),
    longDay: computed(() => (timestamp: number) => longDayFormat.value.format(new Date(timestamp))),
    month: computed(() => (timestamp: number) => monthFormat.value.format(new Date(timestamp))),
  }
}
