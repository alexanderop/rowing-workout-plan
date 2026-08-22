import { Given, Then, When } from '../fixtures'

Given('I open the log', async ({ log }) => {
  await log.open()
})

When('I log a row of {int} metres in {word}', async ({ log }, distance: number, time: string) => {
  await log.logRow(String(distance), time)
})

Then('the log shows a free row', async ({ log }) => {
  await log.expectLogged('Free row')
})

Then('the month totals count it', async ({ log }) => {
  await log.expectTotal('6 km')
})
