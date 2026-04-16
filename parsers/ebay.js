// ebay listing scraper
// selectors will break eventually, just update them when they do
// popup lets user edit fields so a broken parser degrades gracefully

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.action === 'scrape') {
    try {
      sendResponse({ ok: true, data: scrape() });
    } catch (e) {
      // console.log('ebay scrape err', e);
      sendResponse({ ok: false, err: String(e) });
    }
  }
  return true;
});

function scrape() {
  return {
    partNumber: '',  // skip, sellers use inconsistent MPN values for the same part, user fills manually
    price: getPrice(),
    shipping: getShip(),
    location: getLoc(),
    delivery: getDelivery(),
    rating: getRating(),
    reviewCount: getReviewCount(),
    returnPolicy: getReturns(),
    notes: '',
  };
}

function txt(sel) {
  const el = document.querySelector(sel);
  return el ? el.textContent.trim() : '';
}

function getPrice() {
  // tries the main display price first, then the itemprop fallback
  const raw = txt('.x-price-primary span') || txt('[itemprop="price"]');
  // console.log('price raw', raw);
  if (!raw) return '';
  const m = raw.match(/\$[\d,]+\.\d{2}/);
  return m ? m[0] : raw;
}

// look through the labeled rows on the listing
// ebay uses ux-labels-values for most of the sidebar fields
function findLabeled(regex) {
  const rows = document.querySelectorAll('.ux-labels-values');
  for (const r of rows) {
    const lbl = r.querySelector('.ux-labels-values__labels');
    if (lbl && regex.test(lbl.textContent)) {
      const v = r.querySelector('.ux-labels-values__values');
      if (v) return v.textContent.trim();
    }
  }
  return '';
}

// the shipping section on ebay often contains cost, delivery estimate, and location
// all inside one value block, so grab it once and pull out each piece
function getShipBlock() {
  const rows = document.querySelectorAll('.ux-labels-values');
  for (const r of rows) {
    const lbl = r.querySelector('.ux-labels-values__labels');
    if (lbl && /shipping/i.test(lbl.textContent)) {
      const v = r.querySelector('.ux-labels-values__values');
      if (v) return v.innerText || v.textContent || '';
    }
  }
  return '';
}

function getShip() {
  const block = getShipBlock();
  if (!block) return '';
  // check the first line for free/paid
  const firstLine = block.split('\n')[0];
  if (/free/i.test(firstLine)) return 'Free';
  const m = block.match(/\$[\d,]+\.\d{2}/);
  if (m) return m[0];
  return firstLine.slice(0, 30);
}

function getLoc() {
  // ebay nests "Located in: City, State, Country" inside the shipping block
  const block = getShipBlock();
  if (block) {
    const m = block.match(/Located in:?\s*([^\n|]+)/i);
    if (m) return m[1].trim().slice(0, 60);
  }
  // fallback to labeled row in case layout changes
  const raw = findLabeled(/located in|ships from|item location/i);
  if (raw) return raw.split('\n')[0].trim();
  // last resort, scan the page
  const body = document.body ? (document.body.innerText || '') : '';
  const m = body.match(/Located in:?\s*([^\n|]+)/i);
  if (m) return m[1].trim().slice(0, 60);
  return '';
}

// clean up whatever delivery string we extracted
// currently unused since deliveryAsDays handles the conversion, but keeping
// the old helper out so the file stays clean
function getDelivery() {
  const block = getShipBlock();
  if (block) {
    // prefer speed description since it stays meaningful when reviewed days later
    const speed = block.match(/(?:Free\s+)?\d+(?:\s*-\s*\d+)?\s*(?:business\s+)?days?\s*(?:delivery|shipping)?/i);
    if (speed) return speed[0].replace(/\s+/g, ' ').trim();

    // fallback: convert "Get it between DATE and DATE" to "N-M days from today"
    const phrase = block.match(/(?:Get it|Estimated|Arrives)[^\n]+/i);
    if (phrase) {
      const days = deliveryAsDays(phrase[0]);
      if (days) return days;
    }
  }
  // labeled-row fallback
  const raw = findLabeled(/delivery|estimated/i);
  if (raw) {
    const speed = raw.match(/(?:Free\s+)?\d+(?:\s*-\s*\d+)?\s*(?:business\s+)?days?\s*(?:delivery|shipping)?/i);
    if (speed) return speed[0].replace(/\s+/g, ' ').trim();
    const days = deliveryAsDays(raw);
    if (days) return days;
  }
  return '';
}

function getReturns() {
  let raw = findLabeled(/return/i);
  // fallback: scan page text
  if (!raw) {
    const body = document.body ? (document.body.innerText || '') : '';
    const m = body.match(/(\d+\s+days?\s+returns?[^\n]*)/i);
    if (m) raw = m[1];
  }
  if (!raw) return '';
  // use first line only, then strip out "See details" link text and anything after
  let t = raw.split('\n')[0];
  t = t.replace(/See details.*$/i, '').trim();
  // collapse weird whitespace
  t = t.replace(/\s+/g, ' ').trim();
  // clean dangling period if we cut mid-sentence
  t = t.replace(/\.\s*$/, '');
  return t.slice(0, 120);
}

function getPart() {
  // item specifics often has MPN or Part Number
  const raw = findLabeled(/^(mpn|part number|manufacturer part)$/i) ||
              findLabeled(/part number|mpn/i);
  if (!raw) return '';
  return raw.split('\n')[0].trim();
}

function getRating() {
  // scope to the seller card so we don't accidentally grab another listing's rating
  // from a "similar items" sidebar or recommendations
  const sellerBox = document.querySelector('.x-sellercard-atf, [class*="x-sellercard"]');
  if (sellerBox) {
    const m = sellerBox.textContent.match(/(\d{2,3}(?:\.\d)?)\s*%\s*positive/i);
    if (m) return m[1] + '% positive';
  }
  // fallback: look for an anchor whose entire text is "X% positive" (the rating link)
  const links = document.querySelectorAll('a');
  for (const a of links) {
    const t = a.textContent.trim();
    const m = t.match(/^(\d{2,3}(?:\.\d)?)\s*%\s*positive$/i);
    if (m) return m[1] + '% positive';
  }
  // prob better to return nothing than a wrong value
  return '';
}

function getReviewCount() {
  // seller feedback count, usually formatted as (1,234) near seller name
  const sellerBox = document.querySelector('[class*="x-sellercard"], [class*="seller-persona"], .info__subtitle, #RightSummaryPanel');
  if (sellerBox) {
    // look for a parenthesized number in that region
    const m = sellerBox.textContent.match(/\(([\d,]+)\)/);
    if (m) return m[1];
  }
  // fallback: anchor text like "1,234 items sold" style is not quite it, but feedback count often appears near feedback link
  const links = document.querySelectorAll('a');
  for (const a of links) {
    const t = a.textContent.trim();
    if (/^\(?[\d,]{2,}\)?$/.test(t)) {
      // check the surrounding text to see if it's near "positive" or "feedback"
      const ctx = (a.parentElement ? a.parentElement.textContent : '').toLowerCase();
      if (/positive|feedback/.test(ctx)) {
        return t.replace(/[()]/g, '');
      }
    }
  }
  return '';
}
