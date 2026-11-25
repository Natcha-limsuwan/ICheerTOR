/**
 * Lets anything on the page restart the guided tour.
 *
 * A plain DOM event rather than context: the trigger (a menu item in the
 * TopBar) and the tour sit in different branches of the layout tree, and an
 * event avoids wrapping the whole dashboard in another provider for one
 * rarely-used action.
 */

export const TOUR_RESTART_EVENT = "icheertor:restart-tour";

/** Ask the mounted tour to start again from step one. */
export function restartTour(): void {
  window.dispatchEvent(new CustomEvent(TOUR_RESTART_EVENT));
}
