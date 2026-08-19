# TC Part Sourcing

Browser extension that scrapes eBay and Amazon listings and builds formatted option blocks for ResNet part sourcing tickets. Works in Firefox, Chrome, and Edge.

## Install

* Firefox
   * [Download for Firefox](REPLACE_WITH_XPI_UPLOAD_URL)
   * Download and open the `.xpi` file with Firefox
* Chrome
   * [Download for Chrome (Unpacked)](REPLACE_WITH_ZIP_UPLOAD_URL)
   * Download the `.zip` file and extract it. Visit chrome://extensions and ensure you are in developer mode. Click "Load unpacked" and select the extracted folder.

You'll likely want to allow the extension to run in a private tab.

In Firefox that setting is under `about:addons`, click TC Part Sourcing, then set "Run in Private Windows" to Allow. Firefox will also ask you to grant access to ebay.com and amazon.com. If the popup opens but nothing pre-fills, check the extensions button in the toolbar and make sure site access is granted.

## Using it

1. Open an eBay or Amazon listing for a candidate part.
2. Click the TC Part Sourcing icon.
3. The form pre-fills from the page. **Double check every field** before adding, parsers miss stuff.
4. Hit **Add to list**.
5. Repeat for each candidate listing. Your options persist between popup opens.
6. Reorder with the arrows so Option 1 is the best pick. Edit or delete with the pencil/x buttons.
7. Click **Copy all**. The full formatted block is on your clipboard. Paste into the ticket.
8. Click **Clear list** when you move to the next ticket.

On any site other than eBay or Amazon, the form opens blank with just the URL filled in. Type the rest by hand, add to the list same way.

### Detached window

Click **Pop out ↗** in the header and the UI opens in its own browser window that you can move and resize freely. It stays open while you switch tabs in the main browser, and auto-tracks whichever listing tab is focused. If you've already started typing into the form, it won't overwrite your work. It only auto-scrapes when the form is empty. Otherwise it just syncs the URL and shows a status message telling you to click Re-scrape.

Options persist between popup mode and detached mode via `storage.local`, so you can switch freely.

## The template output

Matches what's in the part sourcing instructions:

```
Option 1 - https://...
● Part Number: ABC123
● $49.99 + Free shipping
● Ships from Rochester, NY
● Takes 3-5 days
● 99.2% positive (4521 reviews)
● Return Policy: 30-day returns
● Notes: comes with mounting bracket
```

If a field is empty the template shows `?` so missing info is obvious to the reviewer.

## Known issues / caveats

- **Rating format differs by site.** eBay outputs `99.2% positive`, Amazon outputs `4.5/5 stars`. The field is free-text, so you can paste whatever you want. Template passes it through verbatim.
- eBay and Amazon change their DOM every few months. When fields start coming back empty, the parsers in `parsers/ebay.js` and `parsers/amazon.js` need updated selectors.
- If you just installed the extension and the scraper won't load on a tab that was already open, reload the page. Content scripts only inject on page load.
- Options are stored in `storage.local`, not synced, so if you switch machines mid-ticket you lose the list.
- If the detached window is open and you also click the toolbar icon, you'll get both. Close whichever you don't want.
- Firefox caps popup height lower than Chrome does, so the popup starts scrolling sooner. Pop out if that gets annoying.

## Dev notes

- Manifest V3, no build step for the code itself, raw JS / HTML / CSS.
- Content scripts live in `parsers/`, popup UI in `popup/`.
- Popup messages the active tab's content script with `{ action: 'scrape' }`, gets back `{ ok, data }` where data is a flat object of the template fields.
- Adding a new site: write a content script in `parsers/`, add a matches entry to **both** manifests, add the hostname check to `detectSite()` in `popup.js`. Done.

### Cross browser notes

One source tree, two manifests. `manifest.json` is the Chrome/Edge one, `manifest.firefox.json` is the Firefox one. They are identical except Firefox needs `browser_specific_settings.gecko` for the add-on ID, the minimum version, and the data collection declaration. Keep them in sync when you change permissions or matches.

All extension API calls go through the `ext` shim defined at the top of `popup/popup.js` and `parsers/shared.js`:

```js
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
```

Firefox aliases `chrome.*` but that alias is callback flavored, while `browser.*` is promise based. Everything here calls the APIs with the callback omitted, which both browsers answer with a promise, so don't reintroduce callback style calls.

Two other Firefox specific things worth not undoing:

- `windows.getLastFocused({ windowTypes })` is deprecated in Firefox, so detached mode tracks the last focused normal window itself in `getTab()` and filters on `w.type` instead.
- `navigator.clipboard.writeText` can get rejected in a Firefox extension popup, so `copyText()` falls back to a hidden textarea plus `execCommand('copy')`.

### Building the packages

```
./build.sh
```

Drops `dist/tc-part-sourcing-chrome.zip` and `dist/tc-part-sourcing-firefox.xpi`. The xpi is just a zip with the manifest at the archive root.

**The xpi has to be signed before anyone can install it by opening the file.** Release Firefox refuses unsigned add-ons. Submit the xpi to addons.mozilla.org as unlisted (self distribution), download the signed copy, and upload that as the release artifact. For testing without signing, use `about:debugging#/runtime/this-firefox` and click "Load Temporary Add-on", which lasts until you restart Firefox.

Validate before submitting:

```
npx addons-linter dist/tc-part-sourcing-firefox.xpi
```

## Version

0.4.0 - Firefox support: `ext` API shim across popup and parsers, promise based storage calls, detached window no longer relies on deprecated `getLastFocused` filtering, clipboard fallback, explicit `host_permissions`, separate Firefox manifest and `build.sh`
0.3.1 - URLs stripped of tracking params and path fluff (eBay var= preserved since it selects the variant)
0.3.0 - delivery date ranges converted to "N-M days" from today, "estimated" prefix preserved when source says estimated, shared helper file for cross-parser code
0.2.5 - delivery prefers "Free N-day delivery" speed over date ranges since date ranges go stale during review
0.2.4 - delivery no longer captures the word "delivery" alone from "2-4 day delivery", preserves "between" in output
0.2.3 - delivery string sanitized (zip codes, junk labels, prefix verbiage stripped), part number no longer scraped
0.2.2 - Amazon returns fix (whitespace in label), clear stale fields on cross-site scrape
0.2.1 - eBay shipping/location/delivery rewrite, rating scoped to seller card, cleaner returns, Amazon split-layout support
0.2.0 - detachable window, Amazon stars + returns fix
0.1.0 - initial build
