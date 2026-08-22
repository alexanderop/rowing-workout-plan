Feature: A logged workout is kept on the device

  There is no account and no server: a workout typed in off the monitor lives
  in IndexedDB on this device or it does not exist. That makes surviving a
  reload the one journey worth driving end to end against the shipped build.

  Scenario: A workout survives a reload
    Given I open the log
    When I log a row of 6000 metres in 24:06
    Then the log shows a free row
    When I reload the app
    Then the log shows a free row
    And the month totals count it
