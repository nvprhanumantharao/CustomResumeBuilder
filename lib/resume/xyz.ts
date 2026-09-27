const METRIC_SPAN =
  /(?<![A-Za-z0-9])\$?\d[\d,]*(?:\.\d+)?%?(?:ms|(?<=\d)\s?[kmb](?![A-Za-z]))?/gi

/**
 * Google's XYZ line: Accomplished [X] as measured by [Y] by doing [Z].
 * X, Y, and Z are taken from the source sentence. No metric is added.
 */
export function accomplishmentXyz(text: string): string {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return source;
  const measuredCount = source.match(/\bas measured by\b/gi)?.length ?? 0;
  const doingCount = source.match(/\bby doing\b/gi)?.length ?? 0;
  if (/^accomplished\b/i.test(source) && measuredCount === 1 && doingCount === 1) {
    return source.endsWith(".") ? source : `${source}.`;
  }

  const bare = source.replace(/[.]+$/, "").trim();
  let accomplished = bare;
  let doing = "";
  const byAt = bare.toLowerCase().lastIndexOf(" by ");
  if (byAt > 12) {
    const right = bare.slice(byAt + 4).trim();
    const left = bare.slice(0, byAt).trim();
    if (measurementPhrase(left) && !/^\d/.test(right)) {
      accomplished = left;
      doing = right;
    }
  }

  const measured = measurementPhrase(accomplished) || measurementPhrase(bare);
  if (measured) {
    const without = stripEdgeWords(accomplished.replace(measured, " "));
    if (without.length >= 8) accomplished = without;
  }

  const outcome = stripEdgeWords(accomplished);
  const method = doing || outcome;
  return `Accomplished ${lowerFirst(outcome)} as measured by ${lowerFirst(measured || outcome)} by doing ${lowerFirst(method)}.`;
}

function lowerFirst(value: string): string {
  const trimmed = value.replace(/[.]+$/, "").replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function stripEdgeWords(value: string): string {
  let next = value.replace(/\s+/g, " ").trim();
  const edge =
    /^(?:from|to|of|by|into|for|with|over|across|a|an|the)\b\s*|\b(?:from|to|of|by|into|for|with|over|across|used|a|an|the)\s*$/i;
  for (let pass = 0; pass < 4 && edge.test(next); pass += 1) {
    next = next.replace(edge, "").replace(/\s+/g, " ").trim();
  }
  return next;
}

function measurementPhrase(text: string): string {
  const matches = [...text.matchAll(METRIC_SPAN)];
  if (matches.length === 0) return "";
  const first = matches[0];
  const last = matches[matches.length - 1];
  if (!first || !last || first.index === undefined || last.index === undefined) return "";
  const start0 = first.index;
  const end0 = last.index + last[0].length;
  let start = start0;
  const lead = text.slice(Math.max(0, start0 - 16), start0);
  const leadMatch = lead.match(/(?:from|of|over|across|about)\s+$/i);
  if (leadMatch) start = start0 - leadMatch[0].length;
  const tail = text
    .slice(end0)
    .match(/^(?:[-–][A-Za-z]+)?(?:\s+(?:[A-Za-z][A-Za-z-]*|a|an)){0,4}/);
  const end = end0 + (tail?.[0].length ?? 0);
  return text
    .slice(start, end)
    .trim()
    .replace(/[.,:;]+$/, "")
    .replace(/^(?:from|of|over|across|about)\s+/i, "");
}
