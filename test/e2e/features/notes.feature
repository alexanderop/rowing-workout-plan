Feature: Notes are local-first

  Data lives in IndexedDB on the device. A note captured offline has to
  survive the tab being closed, reloaded, or the network being gone.

  Scenario: A created note is still there after a reload
    Given I open the app
    When I add a note titled "Buy milk"
    Then I see a note titled "Buy milk"
    When I reload the app
    Then I see a note titled "Buy milk"

  # The reload scenario above passes with no service worker at all — the
  # bundle is simply refetched. This one cuts the network first, so nothing
  # renders unless the worker precached the shell and IndexedDB kept the row.
  Scenario: A note is still there with the network gone
    Given I open the app
    And the service worker is in control
    When I add a note titled "Feed the cat"
    And the network goes away
    And I reload the app
    Then the app shell is on screen
    And the service worker served it
    And I see a note titled "Feed the cat"

  # index.html is the one part of the app the browser-tier axe sweeps cannot
  # see — they run inside the Vitest runner's page, not ours.
  Scenario: The shipped page announces itself
    Given I open the app
    Then the document has a title and a language
