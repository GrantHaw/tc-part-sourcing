# TC Part Sourcing

Chrome extension that scrapes eBay and Amazon listings and builds formatted option blocks for ResNet part sourcing tickets.

## Install (unpacked)

1. Unzip the folder somewhere it can live permanently.
2. Go to `chrome://extensions`.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and pick the `partsourcer` folder.
5. Pin the icon to the toolbar so it's one click away.

Works in Chrome and Edge. Firefox would need a manifest tweak, not done here.

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

Click **Pop out ↗** in the header and the UI opens in its own Chrome window that you can move and resize freely. It stays open while you switch tabs in the main browser, and auto-tracks whichever listing tab is focused. If you've already started typing into the form, it won't overwrite your work. It only auto-scrapes when the form is empty. Otherwise it just syncs the URL and shows a status message telling you to click Re-scrape.

Options persist between popup mode and detached mode via `chrome.storage.local`, so you can switch freely.

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
- Options are stored in `chrome.storage.local`, not synced, so if you switch machines mid-ticket you lose the list.
- If the detached window is open and you also click the toolbar icon, you'll get both. Close whichever you don't want.

## Dev notes

- Manifest V3, no build step, raw JS / HTML / CSS.
- Content scripts live in `parsers/`, popup UI in `popup/`.
- Popup messages the active tab's content script with `{ action: 'scrape' }`, gets back `{ ok, data }` where data is a flat object of the template fields.
- Adding a new site: write a content script in `parsers/`, add a matches entry in `manifest.json`, add the hostname check to `detectSite()` in `popup.js`. Done.

## Version

0.3.1 - URLs stripped of tracking params and path fluff (eBay var= preserved since it selects the variant)
0.3.0 - delivery date ranges converted to "N-M days" from today, "estimated" prefix preserved when source says estimated, shared helper file for cross-parser code
0.2.5 - delivery prefers "Free N-day delivery" speed over date ranges since date ranges go stale during review
0.2.4 - delivery no longer captures the word "delivery" alone from "2-4 day delivery", preserves "between" in output
0.2.3 - delivery string sanitized (zip codes, junk labels, prefix verbiage stripped), part number no longer scraped
0.2.2 - Amazon returns fix (whitespace in label), clear stale fields on cross-site scrape
0.2.1 - eBay shipping/location/delivery rewrite, rating scoped to seller card, cleaner returns, Amazon split-layout support
0.2.0 - detachable window, Amazon stars + returns fix
0.1.0 - initial build
