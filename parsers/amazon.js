// amazon listing scraper
// amazon doesn't have seller-feedback % like ebay, so rating falls back to product stars
// user should verify seller info manually if it matters

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.action === 'scrape') {
    try {
      sendResponse({ ok: true, data: scrape() });
    } catch (e) {
      // console.log('amazon scrape err', e);
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

function getPrice() {
  // a-offscreen has the clean $XX.XX string, bypass the split-dollar display
  const sels = [
    '.a-price .a-offscreen',
    '#corePrice_feature_div .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && el.textContent.trim()) {
      const m = el.textContent.trim().match(/\$[\d,]+\.\d{2}/);
      if (m) return m[0];
    }
  }
  return '';
}

function getShip() {
  // prime = free
  if (document.querySelector('.a-icon-prime, [aria-label*="Prime" i]')) {
    return 'Free (Prime)';
  }
  const fb = document.getElementById('fulfillment_feature_div');
  if (fb) {
    const t = fb.textContent;
    if (/free.*ship/i.test(t)) return 'Free';
    const m = t.match(/\$[\d,]+\.\d{2}\s*shipping/i);
    if (m) return m[0].replace(/\s*shipping/i, '').trim();
  }
  return '';
}

// amazon's buybox has labeled rows for Ships from, Sold by, Returns, Payment, etc.
// handles two DOM layouts:
//   old: label and value inside same .tabular-buybox-text row
//   new: label and text are separate siblings linked by offer-display-feature-name attribute
function buyboxValue(labelRegex) {
  // old nested layout
  const tabRows = document.querySelectorAll('.tabular-buybox-text');
  for (const r of tabRows) {
    const lbl = r.querySelector('.tabular-buybox-text-label');
    if (lbl && labelRegex.test(lbl.textContent.trim())) {
      const v = r.querySelector('.tabular-buybox-text-value, a');
      if (v && v.textContent.trim()) return v.textContent.trim();
    }
  }

  // newer split layout: find the label, then grab the matching text block by feature-name
  const labels = document.querySelectorAll('.offer-display-feature-label');
  for (const lbl of labels) {
    // trim is important, amazon pads labels with whitespace which breaks ^...$ regexes
    if (!labelRegex.test(lbl.textContent.trim())) continue;
    const name = lbl.getAttribute('offer-display-feature-name');
    if (name) {
      const block = document.querySelector(
        '.offer-display-feature-text[offer-display-feature-name="' + name + '"]'
      );
      if (block) {
        const msg = block.querySelector('.offer-display-feature-text-message');
        const t = (msg ? msg.textContent : block.textContent).trim();
        if (t) return t;
      }
    }
  }

  return '';
}

function getLoc() {
  const v = buyboxValue(/ships from/i);
  if (v) return v;
  // fallback: scan the fulfillment feature div for a "Ships from" line
  const fb = document.getElementById('fulfillment_feature_div');
  if (fb) {
    const m = fb.textContent.match(/Ships from[\s\S]{0,100}?([A-Z][A-Za-z\.,\s]+?)(?:Sold by|Payment|Packaging|$)/);
    if (m && m[1]) return m[1].trim().split('\n')[0].slice(0, 40);
  }
  return '';
}

function getDelivery() {
  const del = document.getElementById('deliveryBlockMessage') ||
              document.querySelector('[data-csa-c-content-id="DEXUnifiedCXPDM"]') ||
              document.querySelector('#mir-layout-DELIVERY_BLOCK');
  if (!del) return '';
  const t = del.textContent.trim().replace(/\s+/g, ' ');

  // convert any date mentions to days-from-today (same logic as eBay)
  const days = deliveryAsDays(t);
  if (days) return days;

  // fallback if no parseable date
  return t.slice(0, 70);
}

function getRating() {
  // product star rating, preserve amazon's native format
  const el = document.querySelector('#acrPopover, [data-hook="rating-out-of-text"]');
  if (!el) return '';
  const src = el.title || el.textContent || '';
  const m = src.match(/(\d(?:\.\d)?)\s*out of\s*5/i);
  if (m) return m[1] + '/5 stars';
  return '';
}

function getReviewCount() {
  const el = document.getElementById('acrCustomerReviewText');
  if (!el) return '';
  const m = el.textContent.match(/[\d,]+/);
  return m ? m[0] : '';
}

function getReturns() {
  // amazon shows this in the same buybox as Ships from
  // value is usually a link like "FREE 30-day refund/replacement"
  const v = buyboxValue(/^returns?$/i);
  if (v) return v;
  // some layouts put it in a dedicated returns policy element
  const rt = document.getElementById('returns-policy') ||
             document.querySelector('[data-feature-name="returnsPolicy"]');
  if (rt) {
    const t = rt.textContent.trim().split('\n')[0];
    if (t) return t.slice(0, 80);
  }
  return '';
}

function getPart() {
  // tables under productDetails
  const tableRows = document.querySelectorAll(
    '#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_2 tr'
  );
  for (const r of tableRows) {
    const th = r.querySelector('th');
    const td = r.querySelector('td');
    if (th && td && /model number|part number|item model number|mpn/i.test(th.textContent)) {
      return td.textContent.trim();
    }
  }
  // detail bullets format (older layout)
  const bullets = document.querySelectorAll('#detailBullets_feature_div li');
  for (const b of bullets) {
    const spans = b.querySelectorAll('span span');
    if (spans.length >= 2 && /model number|part number|item model number/i.test(spans[0].textContent)) {
      return spans[1].textContent.trim().replace(/^:\s*/, '');
    }
  }
  return '';
}
