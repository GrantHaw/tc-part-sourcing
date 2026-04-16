// shared helpers loaded before both site-specific parsers
// functions defined here are available in the global scope of the content script

const _MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3,
  june: 5, july: 6, august: 7, september: 8,
  october: 9, november: 10, december: 11
};

// extract all date mentions like "Mon, Apr 20" or "April 18" from text
// returns day-counts from today (floor), filtered to a sane 0-60 day window
function deliveryTextToDays(text) {
  if (!text) return [];
  // day-of-week prefix is optional, month abbreviation or full name, day number
  const re = /(?:(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\.?\s+(\d{1,2})/gi;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const curMonth = today.getMonth();
  const curYear = today.getFullYear();

  const days = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const monthIdx = _MONTHS[m[1].toLowerCase()];
    if (monthIdx === undefined) continue;
    const day = parseInt(m[2], 10);
    if (!day || day < 1 || day > 31) continue;

    // guess the year: current year, or next year if this month is more than 6 months behind
    let year = curYear;
    if (monthIdx < curMonth - 6) year = curYear + 1;

    const d = new Date(year, monthIdx, day);
    const diff = Math.round((d - today) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 60) days.push(diff);
  }
  return days;
}

// turn a delivery phrase like "Get it between Mon, Apr 20 and Thu, Apr 23"
// into "4-7 days" (or "estimated 4-7 days" when the source text says estimated)
// returns null when no parseable dates are present
function deliveryAsDays(text) {
  if (!text) return null;
  const isEstimated = /\bestimated\b/i.test(text);

  const days = deliveryTextToDays(text);
  if (days.length === 0) return null;

  days.sort(function (a, b) { return a - b; });
  const lo = days[0];
  const hi = days[days.length - 1];

  let out;
  if (lo === hi) {
    // "1 day" vs "2 days", keep the singular right
    out = lo + (lo === 1 ? ' day' : ' days');
  } else {
    out = lo + '-' + hi + ' days';
  }

  if (isEstimated) out = 'estimated ' + out;
  return out;
}
