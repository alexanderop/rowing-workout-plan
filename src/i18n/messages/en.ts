export default {
  nav: {
    ariaLabel: 'Main navigation',
    notes: 'Notes',
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
  quickAdd: {
    open: 'Add a note',
  },
  notes: {
    title: 'Notes',
    empty: {
      title: 'No notes yet',
      body: 'Tap the + button to capture your first note. Everything stays on this device.',
    },
    pinned: 'Pinned',
    form: {
      heading: 'New note',
      description: 'Saved locally, available offline.',
      titleLabel: 'Title',
      titlePlaceholder: 'What is this about?',
      bodyLabel: 'Note',
      bodyPlaceholder: 'Write it down…',
    },
    // How long ago a note was edited. {n} is vue-i18n's plural count; the
    // `one | many` forms keep "1 day ago" grammatical in every locale.
    age: {
      justNow: 'Just now',
      minutes: '{n} min ago',
      hours: '{n} hr ago',
      days: '{n} day ago | {n} days ago',
    },
    actions: {
      pin: 'Pin note {title}',
      unpin: 'Unpin note {title}',
      delete: 'Delete note {title}',
    },
    // Rendered inline in place of the list — a load failure is a state of
    // the page, not a passing notification.
    loadError: 'Your notes could not be loaded',
    toast: {
      created: 'Note saved',
      deleted: 'Note deleted',
      saveFailed: 'That note could not be saved',
      titleRequired: 'A note needs a title',
      deleteFailed: 'That note could not be deleted',
      pinFailed: 'That note could not be updated',
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
          'Installed, it opens like any other app — full screen, offline, and your notes stay on this device.',
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
