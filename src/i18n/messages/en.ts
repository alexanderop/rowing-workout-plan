export default {
  nav: {
    ariaLabel: 'Main navigation',
    plans: 'Plans',
    settings: 'Settings',
  },
  common: {
    buttons: {
      close: 'Close',
      save: 'Save',
    },
    aria: {
      goBack: 'Go back',
    },
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
    // top of features/training/catalog.ts.
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
  },
  benchmark: {
    heading: 'Your 2k time',
    description: 'Your most recent 2,000 m time. Every session target is derived from it.',
    label: '2k time',
    placeholder: '7:04.2',
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
