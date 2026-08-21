#!/usr/bin/env python3
"""Refresh the per-paper citation counts in index.html from OpenAlex.

Design notes, because the obvious approaches are worse:

  * The count is BAKED INTO index.html, not fetched by the browser. The page keeps
    its zero-third-party-request property, the number is there with JavaScript
    off, and there is no shields.io / jsDelivr chain to go down.
  * A paper with no recorded citations shows no line at all. That is a uniform
    rule, not a hand-picked one - Google Scholar behaves the same way - so it is
    not cherry-picking.
  * OpenAlex is asked once, for every DOI at a time, using the polite pool
    (`mailto=`). One request per run.

Usage:  python tools/update-citations.py [--dry-run]
"""
import argparse
import io, json, os, re, sys, urllib.parse, urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
MAILTO = 'xh.xihe@gmail.com'          # OpenAlex polite pool
API = 'https://api.openalex.org/works'


def dois_in_page(html):
    """Every DOI the publication list links to, in document order."""
    pubs = html[html.index('<ol class="pubs"'):]
    pubs = pubs[:pubs.index('</ol>')]
    out = []
    for block in pubs.split('<li class="pub"')[1:]:
        m = re.search(r'https://doi\.org/(10\.[^\s"<]+)', block)
        a = re.search(r'https://arxiv\.org/abs/([\w.\/-]+)', block)
        out.append((m.group(1) if m else None, a.group(1) if a else None))
    return out


def fetch(dois):
    if not dois:
        return {}
    q = urllib.parse.quote('|'.join(dois), safe='|/.')
    url = (f'{API}?filter=doi:{q}&select=doi,cited_by_count'
           f'&per-page=200&mailto={MAILTO}')
    req = urllib.request.Request(url, headers={'User-Agent': f'xh-xihe.github.io ({MAILTO})'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    return {(w.get('doi') or '').replace('https://doi.org/', '').lower(): w['cited_by_count']
            for w in data.get('results', [])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    html = io.open(INDEX, encoding='utf-8').read()
    refs = dois_in_page(html)
    dois = [d for d, _ in refs if d]
    had = len(re.findall(r'<span class="cites"', html))
    counts = fetch(dois)
    print(f'{len(refs)} publications, {len(dois)} with a DOI, {len(counts)} found in OpenAlex')

    # A 200 with an empty or renamed `results` array would otherwise strip every
    # chip and publish the wiped page unattended. Losing a third of the counts in
    # one run is not a real citation event; it is a bad response.
    if had and len(counts) < had * 2 / 3:
        sys.exit(f'ABORT: page carries {had} counts but OpenAlex returned only '
                 f'{len(counts)} — refusing to write. Re-run when the API is healthy.')

    pubs_start = html.index('<ol class="pubs"')
    pubs_end = html.index('</ol>', pubs_start)
    head, pubs, tail = html[:pubs_start], html[pubs_start:pubs_end], html[pubs_end:]

    blocks = pubs.split('<li class="pub"')
    total = shown = 0
    for i, (doi, _) in enumerate(refs, start=1):
        n = counts.get((doi or '').lower())
        blk = blocks[i]
        # drop any previous chip so runs are idempotent
        blk = re.sub(r'\s*<span class="cites"[^>]*>.*?</span>', '', blk, flags=re.S)
        if n:
            total += n
            shown += 1
            chip = (f'<span class="cites" title="Citations recorded by OpenAlex">'
                    f'{n} citation{"" if n == 1 else "s"}</span>')
            # the venue line is where a reader already looks for bibliographic
            # facts; the link row is for things you can click
            blk, k = re.subn(r'(<p class="pub-venue">.*?)(</p>)',
                             r'\1' + chip + r'\2', blk, count=1, flags=re.S)
            assert k == 1, 'a publication block has no .pub-venue line'
        blocks[i] = blk
    pubs = '<li class="pub"'.join(blocks)

    stamp = date.today().strftime('%b %Y')
    html = head + pubs + tail
    html = re.sub(r'(<span class="en">Citation counts are kept on )',
                  r'\1', html)
    html = re.sub(r'<!--CITE-STAMP-->.*?<!--/CITE-STAMP-->',
                  f'<!--CITE-STAMP-->{stamp}<!--/CITE-STAMP-->', html, flags=re.S)

    print(f'  {shown} entries carry a count, {total} citations in total, stamped {stamp}')
    if args.dry_run:
        print('  (dry run - nothing written)')
        return
    io.open(INDEX, 'w', encoding='utf-8').write(html)
    print(f'  wrote {INDEX}')


if __name__ == '__main__':
    sys.exit(main())
