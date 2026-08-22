import type { MessageSchema } from '../types'

const de: MessageSchema = {
  nav: {
    ariaLabel: 'Hauptnavigation',
    settings: 'Einstellungen',
  },
  common: {
    buttons: {
      close: 'Schließen',
    },
    aria: {
      goBack: 'Zurück',
    },
  },
  settings: {
    title: 'Einstellungen',
    appearance: {
      title: 'Darstellung',
      darkMode: 'Dunkler Modus',
    },
    language: {
      title: 'Sprache',
      label: 'App-Sprache',
      // Diese Sprache in ihrem eigenen Namen — bleibt in jedem Katalog
      // unübersetzt.
      nativeName: 'Deutsch',
    },
    data: {
      title: 'Deine Daten',
      description:
        'Alle Daten leben in diesem Browser. Exportiere sie jederzeit — sie gehören dir.',
      export: 'Daten exportieren',
      import: 'Daten importieren',
      importSuccess: 'Daten importiert',
      importError: 'Diese Datei konnte nicht importiert werden',
      invalidBackup: 'Diese Datei ist kein Backup dieser App',
      exportError: 'Deine Daten konnten nicht exportiert werden',
    },
  },
  pwa: {
    updateAvailable: 'Eine neue Version ist verfügbar',
    reload: 'Neu laden',
    dismiss: 'Update-Hinweis ausblenden',
    install: {
      banner: {
        title: 'App installieren',
        body: 'Füge sie zum Startbildschirm hinzu — offline und im Vollbild.',
        action: 'Installieren',
        later: 'Später',
      },
      dialog: {
        title: 'App installieren',
        description:
          'Installiert öffnet sie sich wie jede andere App — im Vollbild, offline, und deine Daten bleiben auf diesem Gerät.',
        action: 'Installieren',
        prompt: 'Dein Browser kann sie direkt installieren.',
        ios: {
          intro: 'In Safari:',
          share: 'Tippe auf „Teilen“ in der Symbolleiste',
          add: 'Wähle „Zum Home-Bildschirm“',
          confirm: 'Tippe auf „Hinzufügen“',
          note: 'Nur Safari kann unter iOS Apps installieren.',
        },
        android: {
          intro: 'Im Browser-Menü:',
          menu: 'Öffne das Menü (⋮)',
          install: 'Wähle „App installieren“ oder „Zum Startbildschirm“',
          confirm: 'Bestätige die Installation',
        },
        other: {
          intro: 'In deinem Browser:',
          menu: 'Suche „Installieren“ in der Adressleiste oder im Browser-Menü',
          confirm: 'Bestätige die Installation',
        },
      },
      settings: {
        title: 'Installieren',
        description: 'Füge die App zum Startbildschirm hinzu — für Offline-Zugriff.',
        action: 'Anleitung anzeigen',
        installed: 'Diese App ist installiert.',
      },
    },
  },
}

export default de
