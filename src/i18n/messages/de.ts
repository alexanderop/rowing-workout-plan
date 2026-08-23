import type { MessageSchema } from '../types'

const de: MessageSchema = {
  nav: {
    ariaLabel: 'Hauptnavigation',
    today: 'Heute',
    plans: 'Pläne',
    log: 'Logbuch',
    settings: 'Einstellungen',
  },
  common: {
    buttons: {
      cancel: 'Abbrechen',
      close: 'Schließen',
      confirm: 'Wert bestätigen',
      save: 'Speichern',
    },
    aria: {
      goBack: 'Zurück',
    },
  },
  numericInput: {
    backspace: 'Rücktaste',
    currentValue: 'Aktueller Wert',
    decimal: 'Dezimaltrennzeichen hinzufügen',
    empty: 'Leer',
    keypad: 'Ziffernblock',
    presets: 'Vorgeschlagene Werte',
    replaceMode: 'Ersetzmodus: Die nächste Ziffer ersetzt den aktuellen Wert',
  },
  plans: {
    title: 'Pläne',
    subtitle: 'Strukturierte Ergo-Programme, an deiner 2k-Zeit ausgerichtet',
    loadError: 'Deine Pläne konnten nicht geladen werden',
    weeks: '{count} Wochen',
    perWeek: '{count} / Woche',
    active: {
      heading: 'Aktiver Plan',
      progress: 'Woche {week} von {weeks} · {done} von {total} Einheiten erledigt',
      progressLabel: 'Erledigte Einheiten',
      open: 'Woche {week} von {name} öffnen',
    },
    browse: {
      heading: 'Auswählen',
      start: '{name} starten',
    },
    none: {
      title: 'Noch kein Plan',
      body: 'Wähle unten einen aus. Ein Wechsel behält alles, was du schon gerudert hast.',
    },
    source: 'Die Einheiten sind von den auf {sources} veröffentlichten Trainingsplänen abgeleitet.',
    catalog: {
      pete5k: {
        description: 'Zwölf Wochen aus Drei-Wochen-Zyklen, die in einen 5k-Test auslaufen.',
      },
      pete5kLite: {
        description: 'Dieselben Drei-Wochen-Zyklen mit drei Einheiten pro Woche.',
      },
    },
    toast: {
      enrolled: 'Du bist auf {name}',
      enrolFailed: 'Dieser Plan konnte nicht gestartet werden',
    },
    session: {
      steady: '{distance}+ locker',
      intervals: '{reps} × {distance} / {rest} Pause',
      piece: '{distance}',
    },
    kind: {
      steady: 'Aerobe Distanz',
      shortRest: 'Intervalle mit kurzer Pause',
      longRest: 'Intervalle mit langer Pause',
      pacedTwoK: 'Gesteuerte 2k, außen locker',
      distancePiece: 'Harte Distanz',
    },
    rotation: {
      first:
        'Erste Woche von Zyklus {rotation} — die kürzesten Intervalle des Zyklus, und die schnellsten.',
      middle: 'Zweite Woche von Zyklus {rotation} — die Intervalle werden länger, das Ziel bleibt.',
      last: 'Letzte Woche von Zyklus {rotation} — die Intervalle sind am längsten. Ab Woche {nextWeek} beginnt der Zyklus eine Spur schneller von vorn.',
      final: 'Letzte Woche des Plans. Zyklus {rotation} endet hier.',
    },
    coach: {
      first:
        'Die kürzesten Intervalle dieses Zyklus, mit dem schnellsten Ziel. Es geht um das Tempo, nicht um die Anstrengung.',
      middle: 'Längere Intervalle als letzte Woche, gleiches Ziel. Halte es.',
      last: 'Halte dieses Tempo, während die Intervalle länger werden. Im nächsten Zyklus eine Zehntel schneller.',
      final: 'Das letzte davon im Plan. Halte das Ziel und schließe den Zyklus ab.',
    },
    week: {
      title: 'Woche {week}',
      summary: '{sessions} Einheiten · rund {km} km · {done} erledigt',
      strip: 'Wochen von {name}',
      open: 'Woche {week}',
      notFound: 'Diese Woche gehört nicht zu diesem Plan',
    },
    target: {
      label: 'Ziel',
      band: '{lower}–{upper}',
      done: 'Erledigt',
    },
    detail: {
      position: 'Woche {week} · Einheit {position} von {sessions}',
      targets: 'Ziele aus deiner 2k-Zeit von {time}',
      splitLabel: 'Tempo /500m',
      rateLabel: 'Frequenz spm',
      powerLabel: 'Ø Leistung',
      rate: '{low}–{high}',
      watts: '{watts} W',
      pieces: 'Abschnitte',
      rest: '{rest} Pause zwischen den Intervallen',
      rep: 'Intervall {index}',
      notFound: 'Diese Einheit gehört zu keinem Plan',
      log: 'Diese Einheit eintragen',
      logged: 'Eingetragen',
      noBenchmark:
        'Trage deine 2k-Zeit auf der Plan-Seite ein, dann bekommt diese Einheit ihre Ziele.',
    },
  },
  today: {
    title: 'Heute',
    loadError: 'Heute konnte nicht geladen werden',
    heading: 'Einheit für heute',
    position: 'Woche {week} von {weeks} · Einheit {position} von {sessions}',
    week: 'Woche {week}',
    open: '{title} öffnen',
    targetLabel: 'Ziel /500m',
    distanceLabel: 'Arbeitsdistanz',
    duration: '~{minutes} Min.',
    durationLabel: 'inkl. Pause',
    complete: {
      title: 'Plan abgeschlossen',
      body: 'Jede Einheit in {name} liegt hinter dir. Starte einen neuen Plan, wenn du so weit bist.',
    },
    empty: {
      title: 'Noch nichts geplant',
      body: 'Trage deine 2k-Zeit ein und starte einen Plan — dann steht hier, was heute ansteht.',
      action: 'Zu den Plänen',
    },
  },
  log: {
    title: 'Logbuch',
    action: 'Eintrag hinzufügen',
    loadError: 'Dein Logbuch konnte nicht geladen werden',
    distanceLabel: 'Distanz',
    timeLabel: 'Zeit',
    sessionsLabel: 'Einheiten',
    totalDistance: '{km} km',
    totalTime: '{hours} Std. {minutes} Min.',
    totalTimeShort: '{minutes} Min.',
    filterLabel: 'Was angezeigt wird',
    filter: {
      all: 'Alle',
      plan: 'Plan',
      free: 'Freie Fahrt',
    },
    bucket: {
      thisWeek: 'Diese Woche',
      lastWeek: 'Letzte Woche',
      earlier: 'Früher',
    },
    freeRow: 'Freie Fahrt',
    entry: '{date} · {distance} · {duration}',
    empty: {
      title: 'Noch nichts eingetragen',
      body: 'Rudere etwas und trage die Zahlen ein. Alles bleibt auf diesem Gerät.',
    },
  },
  logSheet: {
    heading: 'Eintrag hinzufügen',
    session: 'Diese Einheit eintragen',
    description: 'Trage die Zahlen vom Monitor ein.',
    distance: 'Distanz in Metern',
    distancePlaceholder: '10000',
    distanceTitle: 'Distanz',
    distanceHelp: 'Wähle eine Distanz oder tippe sie auf dem Ziffernblock ein.',
    time: 'Zeit',
    timePlaceholder: '43:07',
    timeTitle: 'Zeit',
    timeHelp: 'Tippe Minuten und Sekunden ein. Der Doppelpunkt setzt sich selbst.',
    rate: 'Frequenz in Schlägen pro Minute',
    ratePlaceholder: '24',
    rateTitle: 'Frequenz',
    rateHelp: 'Wähle eine Frequenz oder tippe sie auf dem Ziffernblock ein.',
    optional: 'optional',
    result: '{split} /500m · {watts} W',
    missingDistance: 'Ergänze die Distanz, um deinen Split zu berechnen',
    missingTime: 'Ergänze die Zeit, um deinen Split zu berechnen',
    toast: {
      saved: 'Einheit eingetragen',
      saveFailed: 'Diese Einheit konnte nicht gespeichert werden',
    },
  },
  benchmark: {
    heading: 'Deine 2k-Zeit',
    description: 'Deine aktuellste Zeit über 2.000 m. Jedes Ziel im Plan wird daraus abgeleitet.',
    label: '2k-Zeit',
    placeholder: '7:04.2',
    help: 'Tippe Minuten, Sekunden und Zehntel ein. Doppelpunkt und Punkt setzen sich selbst.',
    pace: 'Das sind {split} pro 500 m.',
    invalid: 'Gib eine Zeit wie 7:04.2 ein',
    current: 'Ausgerichtet an deiner 2k-Zeit von {time}',
    change: 'Ändern',
    empty: {
      title: 'Beginne mit einer 2k-Zeit',
      body: 'Jedes Ziel in jedem Plan wird daraus berechnet — ohne sie gibt es nichts zu zeigen.',
      action: '2k-Zeit eingeben',
    },
    toast: {
      saved: 'Bestzeit gespeichert',
      saveFailed: 'Deine 2k-Zeit konnte nicht gespeichert werden',
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
      deleteHint: 'Damit wird alles Aufgezeichnete entfernt. Rückgängig machen geht nicht.',
      deleteAll: 'Alles löschen',
      deleteSuccess: 'Alle Daten wurden gelöscht',
      deleteError: 'Deine Daten konnten nicht gelöscht werden',
      confirmDelete: {
        title: 'Wirklich alles löschen?',
        description:
          'Alle Trainings, 2k-Zeiten und Pläne auf diesem Gerät werden entfernt. Es gibt keine andere Kopie, und das lässt sich nicht rückgängig machen — exportiere vorher ein Backup, falls du die Daten noch brauchst.',
        keeps: 'Darstellung und Sprache bleiben unverändert.',
        confirm: 'Ja, alles löschen',
      },
    },
    about: {
      title: 'Über',
      version: 'Version',
      commit: 'Commit',
      buildTime: 'Erstellt',
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
