/**
 * SUBSCRIPTION HUB — Code.gs
 * Web-app entry point. Serves the compiled React frontend via HTMLService and
 * exposes the Google-side bootstrap helpers an owner runs once from the editor.
 */

/** Serve the app. Access is restricted to the deploying owner (see appsscript.json). */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SUBSCRIPTION HUB')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Include helper for composable HTML templates (not used by the inlined build). */
function include(fileName) {
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

/**
 * OWNER BOOTSTRAP — run this ONCE from the Apps Script editor after pasting the
 * project. It creates/connects the spreadsheet, seeds settings, plans and the
 * administrator (RAMESH / JSK), installs the daily reminder trigger, and returns
 * the spreadsheet URL. Idempotent — safe to re-run.
 */
function bootstrap() {
  return setupAndInstall();
}
