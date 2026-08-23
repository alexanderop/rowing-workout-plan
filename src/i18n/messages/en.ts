export default {
  nav: {
    ariaLabel: 'Main navigation',
    today: 'Today',
    plans: 'Plans',
    log: 'Log',
    settings: 'Settings',
  },
  common: {
    buttons: {
      cancel: 'Cancel',
      close: 'Close',
      confirm: 'Confirm value',
      save: 'Save',
    },
    aria: {
      goBack: 'Go back',
    },
  },
  numericInput: {
    backspace: 'Backspace',
    currentValue: 'Current value',
    decimal: 'Add decimal separator',
    empty: 'Empty',
    keypad: 'Keypad',
    presets: 'Suggested values',
    replaceMode: 'Replace mode: the next digit replaces the current value',
  },
  plans: {
    title: 'Plans',
    subtitle: 'Structured erg programmes, paced to your 2k',
    loadError: 'Your plans could not be loaded',
    weeks: '{count} weeks',
    perWeek: '{count} / week',
    active: {
      heading: 'Active plan',
      progress: 'Week {week} of {weeks} · {done} of {total} sessions done',
      progressLabel: 'Sessions completed',
      open: 'Open week {week} of {name}',
    },
    browse: {
      heading: 'Browse',
      start: 'Start {name}',
    },
    none: {
      title: 'No plan yet',
      body: 'Pick one below. Switching later keeps everything you have already rowed.',
    },
    // "Adapted", not "published": the sessions are built from the rotations
    // Pete describes, not transcribed from them — see the reasoning at the
    // top of features/training/catalog/pete5k.ts.
    source: 'Sessions are adapted from the training plans published at {sources}.',
    catalog: {
      pete5k: {
        description: 'Twelve weeks of three-week rotations, tapering into a 5k test.',
      },
      pete5kLite: {
        description: 'The same three-week rotations at three sessions a week.',
      },
    },
    toast: {
      enrolled: 'You are on {name}',
      enrolFailed: 'That plan could not be started',
    },
    // What a session is called, built from the catalogue's numbers by
    // features/training/session.ts. The style — not the kind — picks the
    // sentence: five kinds, three ways of writing one down.
    session: {
      steady: '{distance}+ steady',
      intervals: '{reps} × {distance} / {rest} rest',
      // A pass-through, deliberately: the title of a hard piece is its
      // distance and nothing else (the kind line underneath already says
      // what it is), but it stays in the catalogue so a translator can put
      // words around it without a code change.
      piece: '{distance}',
    },
    // The kind, as the line under the title. One per SessionKind — the
    // i18nKeys arch test holds this list to exactly that set.
    kind: {
      steady: 'Aerobic distance',
      shortRest: 'Short rest intervals',
      longRest: 'Long rest intervals',
      pacedTwoK: 'Paced 2k, easy either side',
      distancePiece: 'Hard distance piece',
    },
    // Where a week sits in its plan's cycle. The plan's ending wins over the
    // rotation's — see `rotationNote`. No sentence here names a position by
    // ordinal: how long a rotation is belongs to the plan, so "second week"
    // would print a confident wrong number for any plan not built in threes.
    rotation: {
      first: 'First week of rotation {rotation} — the shortest reps of the cycle, and the fastest.',
      middle: 'Mid-rotation week of rotation {rotation} — the reps lengthen at the same target.',
      last: 'Last week of rotation {rotation} — the reps are at their longest. From week {nextWeek} the cycle restarts a touch faster.',
      final: 'Last week of the plan. Rotation {rotation} closes here.',
    },
    // The same four positions, said to someone about to row one of them.
    // Shown only for the kinds whose target actually moves between rotations.
    coach: {
      first:
        'The shortest reps of this rotation, at its fastest target. The pace is the point, not the effort.',
      middle: 'Longer reps than last week at the same target. Hold it.',
      last: 'Hold this pace as the reps get longer. Next rotation, go a tenth faster.',
      final: 'The last of these in the plan. Hold the target and close the rotation out.',
    },
    week: {
      title: 'Week {week}',
      summary: '{sessions} sessions · roughly {km} km · {done} done',
      strip: 'Weeks of {name}',
      open: 'Week {week}',
      notFound: 'That week is not part of this plan',
    },
    target: {
      label: 'target',
      band: '{lower}–{upper}',
      done: 'Done',
    },
    detail: {
      position: 'Week {week} · Session {position} of {sessions}',
      targets: 'Targets from your 2k of {time}',
      splitLabel: 'split /500m',
      rateLabel: 'rate spm',
      powerLabel: 'avg power',
      rate: '{low}–{high}',
      watts: '{watts} W',
      pieces: 'Pieces',
      rest: '{rest} rest between reps',
      rep: 'Rep {index}',
      notFound: 'That session is not in any plan',
      log: 'Log this session',
      logged: 'Logged',
      noBenchmark: 'Set your 2k on the Plans screen and this session gets its targets.',
    },
  },
  today: {
    title: 'Today',
    loadError: 'Today could not be loaded',
    heading: "Today's session",
    position: 'Week {week} of {weeks} · Session {position} of {sessions}',
    week: 'Week {week}',
    open: 'Open {title}',
    targetLabel: 'target /500m',
    distanceLabel: 'work distance',
    duration: '~{minutes} min',
    durationLabel: 'incl. rest',
    complete: {
      title: 'Plan complete',
      body: 'Every session in {name} is behind you. Start another plan when you are ready.',
    },
    empty: {
      title: 'Nothing scheduled yet',
      body: 'Set your 2k and start a plan, and this screen tells you what to row today.',
      action: 'Go to plans',
    },
  },
  log: {
    title: 'Log',
    action: 'Log a row',
    loadError: 'Your log could not be loaded',
    distanceLabel: 'distance',
    timeLabel: 'time',
    sessionsLabel: 'sessions',
    totalDistance: '{km} km',
    totalTime: '{hours}h {minutes}m',
    // Under an hour, "0h 43m" is a figure nobody writes.
    totalTimeShort: '{minutes}m',
    filterLabel: 'What to show',
    filter: {
      all: 'All',
      plan: 'Plan',
      free: 'Free row',
    },
    bucket: {
      thisWeek: 'This week',
      lastWeek: 'Last week',
      earlier: 'Earlier',
    },
    freeRow: 'Free row',
    entry: '{date} · {distance} · {duration}',
    empty: {
      title: 'Nothing logged yet',
      body: 'Row something and type the numbers in. Everything stays on this device.',
    },
  },
  logSheet: {
    heading: 'Log a row',
    session: 'Log this session',
    description: 'Type the numbers off the monitor.',
    distance: 'Distance in metres',
    distancePlaceholder: '10000',
    distanceTitle: 'Distance',
    distanceHelp: 'Pick a distance, or type one on the keypad.',
    time: 'Time',
    timePlaceholder: '43:07',
    timeTitle: 'Time',
    timeHelp: 'Type the minutes and seconds. The colon fills itself in.',
    rate: 'Rate in strokes per minute',
    ratePlaceholder: '24',
    rateTitle: 'Rate',
    rateHelp: 'Pick a rate, or type one on the keypad.',
    optional: 'optional',
    result: '{split} /500m · {watts} W',
    missingDistance: 'Add the distance to work out your split',
    missingTime: 'Add the time to work out your split',
    toast: {
      saved: 'Workout logged',
      saveFailed: 'That workout could not be saved',
    },
  },
  benchmark: {
    heading: 'Your 2k time',
    description: 'Your most recent 2,000 m time. Every session target is derived from it.',
    label: '2k time',
    placeholder: '7:04.2',
    help: 'Type the minutes, seconds and tenths. The colon and the point fill themselves in.',
    pace: 'That is {split} per 500 m.',
    invalid: 'Enter a time like 7:04.2',
    current: 'Paced from your 2k of {time}',
    change: 'Change',
    empty: {
      title: 'Start with a 2k',
      body: 'Every target in every plan is worked out from it, so there is nothing to show until you have one.',
      action: 'Enter your 2k',
    },
    toast: {
      saved: 'Benchmark saved',
      saveFailed: 'Your 2k could not be saved',
    },
  },
  settings: {
    title: 'Settings',
    appearance: {
      title: 'Appearance',
      darkMode: 'Dark mode',
    },
    language: {
      title: 'Language',
      label: 'App language',
      // This language in its own name — the picker reads it from every
      // catalog, so a translation of it would be wrong here.
      nativeName: 'English',
    },
    data: {
      title: 'Your data',
      description: 'All data lives in this browser. Export it any time — it is yours.',
      export: 'Export data',
      import: 'Import data',
      importSuccess: 'Data imported',
      importError: 'That file could not be imported',
      invalidBackup: 'That file is not a backup from this app',
      exportError: 'Your data could not be exported',
      deleteHint: 'This removes everything you have logged. There is no undo.',
      deleteAll: 'Delete everything',
      deleteSuccess: 'Everything was deleted',
      deleteError: 'Your data could not be deleted',
      // The confirmation names what goes and what stays, because "everything"
      // is the user's word and the app should be precise about which
      // everything it means.
      confirmDelete: {
        title: 'Delete everything?',
        description:
          'Every workout, 2k and plan on this device is removed. There is no copy anywhere else and this cannot be undone — export a backup first if you might want any of it back.',
        keeps: 'Your appearance and language settings stay as they are.',
        confirm: 'Yes, delete everything',
      },
    },
    about: {
      title: 'About',
      version: 'Version',
      commit: 'Commit',
      buildTime: 'Built',
    },
  },
  pwa: {
    updateAvailable: 'A new version is available',
    reload: 'Reload',
    dismiss: 'Dismiss update notice',
    install: {
      banner: {
        title: 'Install this app',
        body: 'Add it to your home screen for offline access and a full screen.',
        action: 'Install',
        later: 'Not now',
      },
      dialog: {
        title: 'Install this app',
        description:
          'Installed, it opens like any other app — full screen, offline, and your data stays on this device.',
        action: 'Install',
        // The button branch: the browser has already offered us a prompt.
        prompt: 'Your browser can install it directly.',
        ios: {
          intro: 'In Safari:',
          share: 'Tap the Share button in the toolbar',
          add: 'Choose "Add to Home Screen"',
          confirm: 'Tap "Add"',
          note: 'Safari is the only iOS browser that can install apps.',
        },
        android: {
          intro: 'In your browser menu:',
          menu: 'Open the menu (⋮)',
          install: 'Choose "Install app" or "Add to Home screen"',
          confirm: 'Confirm to install',
        },
        other: {
          intro: 'From your browser:',
          menu: 'Look for "Install" in the address bar or the browser menu',
          confirm: 'Confirm to install',
        },
      },
      settings: {
        title: 'Install',
        description: 'Add this app to your home screen for offline access.',
        action: 'How to install',
        installed: 'This app is installed.',
      },
    },
  },
}
