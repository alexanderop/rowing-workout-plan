Feature: The app shell is local-first

  The shell is precached and the data lives in IndexedDB on the device, so
  the app has to open with the tab closed, reloaded, or the network gone.

  # This scenario passes with no service worker at all — the bundle is simply
  # refetched. The next one cuts the network first, so nothing renders unless
  # the worker precached the shell.
  Scenario: The app opens after a reload
    Given I open the app
    Then the app shell is on screen
    When I reload the app
    Then the app shell is on screen

  Scenario: The app opens with the network gone
    Given I open the app
    And the service worker is in control
    When the network goes away
    And I reload the app
    Then the app shell is on screen
    And the service worker served it

  # index.html is the one part of the app the browser-tier axe sweeps cannot
  # see — they run inside the Vitest runner's page, not ours.
  Scenario: The shipped page announces itself
    Given I open the app
    Then the document has a title and a language
