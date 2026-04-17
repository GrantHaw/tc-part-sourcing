// tc part sourcing popup logic

const KEY = 'tcps_options';

const els = {
  status: document.getElementById('status'),
  url: document.getElementById('url'),
  partNum: document.getElementById('partNum'),
  price: document.getElementById('price'),
  shipping: document.getElementById('shipping'),
  location: document.getElementById('location'),
  delivery: document.getElementById('delivery'),
  rating: document.getElementById('rating'),
  reviews: document.getElementById('reviews'),
  returns: document.getElementById('returns'),
  notes: document.getElementById('notes'),
  rescrape: document.getElementById('rescrape'),
  add: document.getElementById('add'),
  list: document.getElementById('list'),
  count: document.getElementById('count'),
  copy: document.getElementById('copy'),
  clear: document.getElementById('clear'),
  popout: document.getElementById('popout'),
  modal: document.getElementById('modal'),
  modalMsg: document.getElementById('modal-msg'),
  modalOk: document.getElementById('modal-ok'),
  modalCancel: document.getElementById('modal-cancel'),
  helpBtn: document.getElementById('help'),
  helpModal: document.getElementById('help-modal'),
  helpClose: document.getElementById('help-close'),
};

// chrome blocks alert() and confirm() in extension popups so we use these instead
// tcAlert: just an ok button, no cancel
// tcConfirm: ok + cancel, resolves true/false
function tcAlert(msg) {
  return new Promise(function (res) {
    els.modalMsg.textContent = msg;
    els.modalCancel.style.display = 'none';
    els.modal.classList.remove('hidden');

    function done() {
      els.modal.classList.add('hidden');
      els.modalCancel.style.display = '';
      els.modalOk.removeEventListener('click', done);
      res();
    }
    els.modalOk.addEventListener('click', done);
  });
}

function tcConfirm(msg) {
  return new Promise(function (res) {
    els.modalMsg.textContent = msg;
    els.modalCancel.style.display = '';
    els.modal.classList.remove('hidden');

    function ok() {
      cleanup();
      res(true);
    }
    function cancel() {
      cleanup();
      res(false);
    }
    function cleanup() {
      els.modal.classList.add('hidden');
      els.modalOk.removeEventListener('click', ok);
      els.modalCancel.removeEventListener('click', cancel);
    }

    els.modalOk.addEventListener('click', ok);
    els.modalCancel.addEventListener('click', cancel);
  });
}

// url param tells us if this instance is running in a detached window
const isDetached = new URLSearchParams(location.search).get('detached') === '1';

// strip tracking params and path fluff from listing URLs so the output is readable
// preserves ebay var= (variation selector) since that's functional, not tracking
function cleanUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'ebay.com' || host.endsWith('.ebay.com')) {
      const m = url.pathname.match(/^\/itm\/\d+/);
      if (m) {
        let out = 'https://www.ebay.com' + m[0];
        const v = url.searchParams.get('var');
        if (v) out += '?var=' + v;
        return out;
      }
    }

    if (host === 'amazon.com' || host.endsWith('.amazon.com')) {
      // collapse /Product-Name-Slug/dp/ASIN or /gp/product/ASIN down to /dp/ASIN
      const m = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
                url.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      if (m) return 'https://www.amazon.com/dp/' + m[1].toUpperCase();
    }

    return u;
  } catch (e) {
    return u;
  }
}

let opts = [];
let editIdx = -1; // -1 when adding a new one

// boot
(async function () {
  opts = await loadOpts();
  render();

  if (isDetached) {
    // hide the popout button since we already are popped out
    els.popout.style.display = 'none';
    document.title = 'TC Part Sourcing';
    // track tab changes so URL/scrape stays in sync with whichever listing is focused
    chrome.tabs.onActivated.addListener(onTabChange);
    chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
      // only react to completed navigations in the active tab
      if (info.status === 'complete' && tab.active) onTabChange();
    });
  }

  await scrapeTab();
})();

// pop out into a detached window
els.popout.addEventListener('click', function () {
  const url = chrome.runtime.getURL('popup/popup.html?detached=1');
  chrome.windows.create({
    url: url,
    type: 'popup',
    width: 500,
    height: 820,
  });
  // popup will auto-close when focus moves to the new window
});

// help modal
els.helpBtn.addEventListener('click', function () {
  els.helpModal.classList.remove('hidden');
});
els.helpClose.addEventListener('click', function () {
  els.helpModal.classList.add('hidden');
});
// close on backdrop click too
els.helpModal.addEventListener('click', function (e) {
  if (e.target === els.helpModal) els.helpModal.classList.add('hidden');
});

// handle tab changes in detached mode
// don't clobber form data if user is mid-edit, only auto-scrape when form is clear
async function onTabChange() {
  const tab = await getTab();
  if (!tab || !tab.url) return;

  const formHasData = els.partNum.value || els.price.value || els.shipping.value ||
                      els.location.value || els.delivery.value || els.rating.value ||
                      els.reviews.value || els.returns.value || els.notes.value;

  if (!formHasData && editIdx < 0) {
    // safe to rescrape
    await scrapeTab();
  } else {
    // just sync URL so user sees which tab they're on, skip the rest
    els.url.value = cleanUrl(tab.url);
    const site = detectSite(tab.url);
    setStatus('Tab changed' + (site ? ' to ' + site : '') + '. Click Re-scrape to pull fields.', '');
  }
}

// storage
function loadOpts() {
  return new Promise(function (res) {
    chrome.storage.local.get([KEY], function (d) {
      res(d[KEY] || []);
    });
  });
}

function saveOpts() {
  return new Promise(function (res) {
    const obj = {};
    obj[KEY] = opts;
    chrome.storage.local.set(obj, res);
  });
}

// scraping
async function scrapeTab() {
  const tab = await getTab();
  if (!tab || !tab.url) {
    setStatus('No active tab detected', 'err');
    return;
  }

  els.url.value = cleanUrl(tab.url);

  const site = detectSite(tab.url);
  if (!site) {
    setStatus('Not an eBay or Amazon listing. Fill fields manually.', '');
    return;
  }

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
    if (res && res.ok) {
      fillForm(res.data);
      setStatus('Scraped from ' + site + '. Verify fields before adding.', 'ok');
    } else {
      setStatus('Scrape returned nothing. Fill manually.', 'err');
    }
  } catch (e) {
    // console.log('scrape msg err', e);
    // content script likely not injected yet (first install, or page loaded before install)
    setStatus('Scraper not loaded on this tab. Reload the page and try again.', 'err');
  }
}

function getTab() {
  if (isDetached) {
    // find the active tab in the user's actual browser window, not this extension window
    return new Promise(function (res) {
      chrome.windows.getLastFocused({ windowTypes: ['normal'] }, function (win) {
        if (!win) { res(null); return; }
        chrome.tabs.query({ active: true, windowId: win.id }, function (tabs) {
          res(tabs[0]);
        });
      });
    });
  }
  return new Promise(function (res) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      res(tabs[0]);
    });
  });
}

function detectSite(url) {
  if (/(^|\.)ebay\.com/.test(new URL(url).hostname)) return 'eBay';
  if (/(^|\.)amazon\.com/.test(new URL(url).hostname)) return 'Amazon';
  return null;
}

function fillForm(d) {
  // wipe all non-URL fields first so stale values from a previous site don't stick around
  // when the new site's scrape returns blank for some of them
  els.partNum.value = d.partNumber || '';
  els.price.value = d.price || '';
  els.shipping.value = d.shipping || '';
  els.location.value = d.location || '';
  els.delivery.value = d.delivery || '';
  els.rating.value = d.rating || '';
  els.reviews.value = d.reviewCount || '';
  els.returns.value = d.returnPolicy || '';
  els.notes.value = d.notes || '';
}

function setStatus(msg, kind) {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
}

// form helpers
function formToOpt() {
  return {
    url: els.url.value.trim(),
    partNumber: els.partNum.value.trim() || 'N/A',
    price: els.price.value.trim(),
    shipping: els.shipping.value.trim(),
    location: els.location.value.trim(),
    delivery: els.delivery.value.trim(),
    rating: els.rating.value.trim(),
    reviewCount: els.reviews.value.trim(),
    returnPolicy: els.returns.value.trim(),
    notes: els.notes.value.trim(),
  };
}

function clearForm() {
  els.partNum.value = '';
  els.price.value = '';
  els.shipping.value = '';
  els.location.value = '';
  els.delivery.value = '';
  els.rating.value = '';
  els.reviews.value = '';
  els.returns.value = '';
  els.notes.value = '';
  editIdx = -1;
  els.add.textContent = 'Add to list';
}

// add or update
els.add.addEventListener('click', async function () {
  const o = formToOpt();
  if (!o.url) {
    await tcAlert('URL is required');
    return;
  }
  if (editIdx >= 0) {
    opts[editIdx] = o;
  } else {
    opts.push(o);
  }
  await saveOpts();
  clearForm();
  render();
});

els.rescrape.addEventListener('click', async function () {
  await scrapeTab();
});

// list rendering
function render() {
  els.count.textContent = '(' + opts.length + ')';
  els.list.innerHTML = '';

  if (opts.length === 0) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'No options yet. Scrape or fill in a listing.';
    els.list.appendChild(e);
    return;
  }

  opts.forEach(function (o, i) {
    const li = document.createElement('li');

    const n = document.createElement('span');
    n.className = 'num';
    n.textContent = (i + 1) + '.';
    li.appendChild(n);

    const t = document.createElement('span');
    t.className = 'title';
    t.textContent = o.price ? (o.price + '  ' + shortUrl(o.url)) : shortUrl(o.url);
    t.title = o.url;
    li.appendChild(t);

    const b = document.createElement('div');
    b.className = 'btns';

    const up = mkBtn('↑', 'Move up', function () { move(i, -1); });
    up.disabled = (i === 0);
    b.appendChild(up);

    const dn = mkBtn('↓', 'Move down', function () { move(i, 1); });
    dn.disabled = (i === opts.length - 1);
    b.appendChild(dn);

    b.appendChild(mkBtn('✎', 'Edit', function () { edit(i); }));
    b.appendChild(mkBtn('✕', 'Delete', function () { del(i); }));

    li.appendChild(b);
    els.list.appendChild(li);
  });
}

function mkBtn(label, tip, fn) {
  const b = document.createElement('button');
  b.className = 'icon';
  b.textContent = label;
  b.title = tip;
  b.addEventListener('click', fn);
  return b;
}

function shortUrl(u) {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, '') + x.pathname.slice(0, 18);
  } catch (e) {
    return u.slice(0, 34);
  }
}

async function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= opts.length) return;
  const tmp = opts[i];
  opts[i] = opts[j];
  opts[j] = tmp;
  // keep editIdx tracking the same option if it moved
  if (editIdx === i) editIdx = j;
  else if (editIdx === j) editIdx = i;
  await saveOpts();
  render();
}

function edit(i) {
  const o = opts[i];
  els.url.value = o.url;
  els.partNum.value = o.partNumber === 'N/A' ? '' : o.partNumber;
  els.price.value = o.price;
  els.shipping.value = o.shipping;
  els.location.value = o.location;
  els.delivery.value = o.delivery;
  els.rating.value = o.rating;
  els.reviews.value = o.reviewCount;
  els.returns.value = o.returnPolicy;
  els.notes.value = o.notes;
  editIdx = i;
  els.add.textContent = 'Update option ' + (i + 1);
  // scroll to top so user sees the form
  window.scrollTo(0, 0);
}

async function del(i) {
  const confirmed = await tcConfirm('Delete option ' + (i + 1) + '?');
  if (!confirmed) return;
  opts.splice(i, 1);
  if (editIdx === i) clearForm();
  else if (editIdx > i) editIdx -= 1;
  await saveOpts();
  render();
}

// copy all
els.copy.addEventListener('click', async function () {
  if (opts.length === 0) {
    await tcAlert('No options to copy');
    return;
  }
  const text = opts.map(function (o, i) { return formatOpt(o, i + 1); }).join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    els.copy.textContent = 'Copied!';
    setTimeout(function () { els.copy.textContent = 'Copy all'; }, 1500);
  } catch (e) {
    await tcAlert('Copy failed: ' + e.message);
  }
});

function formatOpt(o, n) {
  const lines = [];
  lines.push('[Option ' + n + '](' + cleanUrl(o.url) + ')');
  lines.push('● Part Number: ' + (o.partNumber || 'N/A'));

  let priceLine = o.price || '?';
  if (o.shipping) priceLine = priceLine + ' + ' + o.shipping + ' shipping';
  lines.push('● ' + priceLine);

  lines.push('● Ships from ' + (o.location || '?'));
  lines.push('● ETA: ' + (o.delivery || '?'));

  let ratingLine = o.rating || '?';
  // backward compat: if rating is just a number (old storage format), assume ebay-style
  if (/^[\d.]+$/.test(ratingLine)) ratingLine = ratingLine + '% positive';
  if (o.reviewCount) ratingLine = ratingLine + ' (' + o.reviewCount + ' reviews)';
  lines.push('● ' + ratingLine);

  lines.push('● Return Policy: ' + (o.returnPolicy || '?'));

  if (o.notes) lines.push('● Notes: ' + o.notes);

  return lines.join('\n');
}

// clear list
els.clear.addEventListener('click', async function () {
  if (opts.length === 0) return;
  const confirmed = await tcConfirm('Clear all ' + opts.length + ' options?');
  if (!confirmed) return;
  opts = [];
  editIdx = -1;
  await saveOpts();
  clearForm();
  render();
});