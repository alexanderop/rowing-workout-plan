import { After, Given, Then, When } from '../fixtures'

// The offline scenario cuts the network; put it back so a shared context or
// a retry never starts life disconnected.
After(async ({ notes }) => {
  await notes.goOnline()
})

Given('I open the app', async ({ notes }) => {
  await notes.open()
})

Given('the service worker is in control', async ({ notes }) => {
  await notes.waitForServiceWorkerControl()
})

When('I add a note titled {string}', async ({ notes }, title: string) => {
  await notes.addNote({ title })
})

When('the network goes away', async ({ notes }) => {
  await notes.goOffline()
})

When('I reload the app', async ({ notes }) => {
  await notes.reload()
})

Then('I see a note titled {string}', async ({ notes }, title: string) => {
  await notes.expectNote(title)
})

Then('the app shell is on screen', async ({ notes }) => {
  await notes.expectShellVisible()
})

Then('the service worker served it', async ({ notes }) => {
  await notes.expectServedByServiceWorker()
})

Then('the document has a title and a language', async ({ notes }) => {
  await notes.expectDocumentAnnounced()
})
