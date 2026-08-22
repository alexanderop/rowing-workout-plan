export default {
  nav: {
    ariaLabel: 'Main navigation',
    settings: 'Settings',
  },
  common: {
    buttons: {
      close: 'Close',
    },
    aria: {
      goBack: 'Go back',
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
