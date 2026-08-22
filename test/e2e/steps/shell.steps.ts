import { After, Given, Then, When } from '../fixtures'

// The offline scenario cuts the network; put it back so a shared context or
// a retry never starts life disconnected.
After(async ({ app }) => {
  await app.goOnline()
})

Given('I open the app', async ({ app }) => {
  await app.open()
})

Given('the service worker is in control', async ({ app }) => {
  await app.waitForServiceWorkerControl()
})

When('the network goes away', async ({ app }) => {
  await app.goOffline()
})

When('I reload the app', async ({ app }) => {
  await app.reload()
})

Then('the app shell is on screen', async ({ app }) => {
  await app.expectShellVisible()
})

Then('the service worker served it', async ({ app }) => {
  await app.expectServedByServiceWorker()
})

Then('the document has a title and a language', async ({ app }) => {
  await app.expectDocumentAnnounced()
})
