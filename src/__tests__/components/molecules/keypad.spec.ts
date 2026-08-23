import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect, vi } from 'vitest'
import MoleculeKeypad from '@/components/molecules/MoleculeKeypad.vue'
import { it as base } from '../../fixtures'

const it = base.extend('keypad', async ({}, { onCleanup }) => {
  const press = vi.fn()
  const mounted = render(MoleculeKeypad, {
    props: {
      label: 'Number pad for Time',
      backspaceLabel: 'Backspace',
      actionLabel: 'Next',
      extraKey: '00',
      onPress: press,
    },
  })
  onCleanup(() => mounted.unmount())

  const pad = page.getByRole('group', { name: 'Number pad for Time' })

  return {
    press,
    pad,
    key: (name: string) => pad.getByRole('button', { name }),
  }
})

describe('MoleculeKeypad', () => {
  it('renders the complete key grid with accessible names', async ({ keypad }) => {
    for (const name of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '00'])
      await expect.element(keypad.key(name)).toBeVisible()

    await expect.element(keypad.key('Backspace')).toBeVisible()
    await expect.element(keypad.key('Next')).toBeVisible()
  })

  it('reports digits, shortcuts, deletion and the action through one event', async ({ keypad }) => {
    for (const name of ['4', '00', 'Backspace', 'Next']) await keypad.key(name).click()

    expect(keypad.press.mock.calls).toEqual([['4'], ['00'], ['backspace'], ['action']])
  })
})
