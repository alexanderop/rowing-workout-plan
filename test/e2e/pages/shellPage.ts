import { AppPage } from './appPage'

/**
 * The shipped app on any route, with nothing screen-specific added.
 *
 * Everything the offline journey needs already lives on `AppPage`, so this is
 * a concrete stand-in rather than a screen object with content of its own —
 * the notes worked example was the screen, and the training screens are what
 * bring one back. Give it methods when there is a screen to name.
 */
export class ShellPage extends AppPage {}
