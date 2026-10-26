# TC Part Sourcing

Browser extension that scrapes eBay and Amazon listings and builds formatted option blocks for ResNet part sourcing tickets. Instead of tabbing between six listings and retyping price, shipping, seller rating, and returns into the ticket by hand, you click the icon on each listing, verify what it grabbed, and paste the whole block at the end.

Firefox, Chrome, and Edge.

## Using it

1. Open an eBay or Amazon listing for a candidate part.
2. Click the TC Part Sourcing icon. The form pre-fills from the page.
3. **Check every field.** The parsers miss things and the sites change their layout without warning. Everything is editable.
4. Hit **Add to list**.
5. Repeat for each candidate. The list survives closing and reopening the popup.
6. Reorder with the arrows so Option 1 is your recommendation. Pencil edits an entry, x deletes it.
7. **Copy all** puts the whole formatted block on your clipboard. Paste into the ticket.
8. **Clear list** when you start the next ticket.

Part number is intentionally never scraped. Sellers list wildly inconsistent MPN values for the same physical part, so a scraped one is worse than no value at all. Leave it blank and the template prints `N/A`, or type the real one if you have it off the service tag.

On any site other than eBay or Amazon the form opens blank with just the URL filled in. Type the rest by hand and add it to the list the same way. Nothing stops you from sourcing off a vendor site.

### Detached window

**Pop out ↗** in the header reopens the UI as its own browser window you can move and resize. It stays put while you switch tabs, and follows whichever listing tab is focused, so you can leave it on a second monitor and work down a list of candidates.

It will not clobber work in progress. Auto-scrape only fires when the form is completely empty and you're not mid-edit. Otherwise it syncs the URL and puts "Tab changed to eBay. Click Re-scrape to pull fields." in the status bar, and you decide. If you already clicked Add to list, the form is empty and the next tab switch just scrapes.

The list is shared between popup mode and detached mode, so switching between them mid-ticket is fine.

## Template output

```
[Option 1](https://www.ebay.com/itm/255599217597)
● Part Number: N/A
● $16.99 + Free shipping
● Ships from San Diego, California, United States
● ETA: 2-4 day delivery
● 99.9% positive (305404 reviews)
● Return Policy: 30 days returns. Seller pays for return shipping.
● Notes: comes with mounting bracket
```

Options are separated by a blank line. The Notes line only appears when you type something into Notes.

Empty fields print `?` rather than disappearing, so whoever reviews the ticket can see what's missing instead of assuming it was fine.

Rating format is deliberately not normalized. eBay gives seller feedback (`99.9% positive`), Amazon gives product stars (`4.8/5 stars`). Those measure different things and flattening them into one number would be misleading. The field is free text and passes through exactly as written.

## Known issues and caveats

- **eBay and Amazon rearrange their DOM every few months.** When fields start coming back empty, the selectors in `parsers/ebay.js` and `parsers/amazon.js` need updating. The popup stays usable in the meantime since every field is hand editable.
- **Content scripts only inject on page load.** If you just installed the extension, or the tab was open before you installed it, reload the page or the popup will report the scraper isn't loaded.
- **The list is not synced.** It lives in `storage.local`, so switching machines mid-ticket loses it.
- Amazon has no seller feedback percentage equivalent to eBay's, so rating falls back to product stars. If seller reputation actually matters for the part, check it by hand.
- Opening the detached window and then also clicking the toolbar icon gives you both at once. Close whichever you don't want.
- Firefox caps popup height lower than Chrome, so the popup starts scrolling sooner. Pop out if it bugs you.

## Dev notes

Manifest V3, no build step for the code. Raw JS, HTML, and CSS.

```
manifest.json            chrome / edge
manifest.firefox.json    firefox
build.sh                 packaging, mac / linux
build.ps1                packaging, windows
icons/
parsers/
  shared.js              ext shim + date helpers, loaded before both parsers
  ebay.js
  amazon.js
popup/
  popup.html
  popup.css
  popup.js               all UI, storage, and tab logic
```

The popup sends `{ action: 'scrape' }` to the active tab's content script and gets back `{ ok, data }`, where data is a flat object of template fields. That's the entire interface between the two halves.

**Adding a new site:** write a content script in `parsers/`, add a matches entry to **both** manifests, and add a hostname check to `detectSite()` in `popup.js`. That's it.

### Cross browser notes

One source tree, two manifests. They're identical except Firefox needs `browser_specific_settings.gecko` for the add-on ID, `strict_min_version`, and the data collection declaration AMO requires. **Keep them in sync when you touch permissions or matches.** Nothing enforces it.

All extension API calls go through the `ext` shim at the top of `popup/popup.js` and `parsers/shared.js`:

```js
const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
```

Firefox does alias `chrome.*`, but that alias is callback flavored while `browser.*` is promise based. Everything here calls the APIs with the callback omitted, which both browsers answer with a promise. Don't reintroduce callback style calls, they'll work in Chrome and silently return undefined in Firefox.

Three other things that exist for Firefox and shouldn't be "simplified" away:

- `getTab()` tracks the last focused normal window itself via `windows.onFocusChanged` and filters on `w.type`. The obvious `windows.getLastFocused({ windowTypes })` is deprecated in Firefox and breaks detached mode.
- `copyText()` falls back to a hidden textarea plus `execCommand('copy')`. `navigator.clipboard.writeText` can get rejected in a Firefox extension popup.
- The parsers only `return true` from `onMessage` for messages they actually handle. Returning it unconditionally leaves the sender's promise hanging forever in Firefox.

`host_permissions` is declared explicitly for ebay and amazon. Chrome grants those implicitly from the `content_scripts` matches, Firefox MV3 does not.

### Building

```
./build.sh          # mac / linux
.\build.ps1         # windows
```

Both drop `dist/tc-part-sourcing-chrome.zip` and `dist/tc-part-sourcing-firefox.xpi`. An xpi is just a zip with the manifest at the archive root.

`build.ps1` exists because Git for Windows doesn't ship `zip.exe`, and it builds the archive through `System.IO.Compression` rather than `Compress-Archive`, which writes backslash separated entry names that both browsers reject.

**The xpi has to be signed before anyone can install it by opening the file.** Release Firefox refuses unsigned add-ons, so an unsigned xpi behind the download link above is a dead link with extra steps. Submit it to addons.mozilla.org as unlisted (self distribution), download the signed copy, and upload that as the release artifact.

For testing without signing, `about:debugging#/runtime/this-firefox` then "Load Temporary Add-on". It lasts until you restart Firefox.

The Firefox download link at the top of this file points at the AMO hosted signed file, so it always serves the signed copy. When you ship a new version, sign it the same way and update that link to the new file URL. The Chrome link is a GitLab upload and needs replacing with a fresh upload each release.

Validate before submitting:

```
npx addons-linter dist/tc-part-sourcing-firefox.xpi
```

## Version

0.4.0 - Firefox support: `ext` API shim across popup and parsers, promise based storage calls, detached window no longer relies on deprecated `getLastFocused` filtering, clipboard fallback, explicit `host_permissions`, separate Firefox manifest, `build.sh` and `build.ps1`
0.3.1 - URLs stripped of tracking params and path fluff (eBay var= preserved since it selects the variant)
0.3.0 - delivery date ranges converted to "N-M days" from today, "estimated" prefix preserved when source says estimated, shared helper file for cross-parser code
0.2.5 - delivery prefers "Free N-day delivery" speed over date ranges since date ranges go stale during review
0.2.4 - delivery no longer captures the word "delivery" alone from "2-4 day delivery", preserves "between" in output
0.2.3 - delivery string sanitized (zip codes, junk labels, prefix verbiage stripped), part number no longer scraped
0.2.2 - Amazon returns fix (whitespace in label), clear stale fields on cross-site scrape
0.2.1 - eBay shipping/location/delivery rewrite, rating scoped to seller card, cleaner returns, Amazon split-layout support
0.2.0 - detachable window, Amazon stars + returns fix
0.1.0 - initial build
