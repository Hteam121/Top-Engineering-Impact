"""Fetch pipeline — produces 5 JSON files under data/ that analyze.py consumes.

Flow (steps lifted from the user-described design):
  A2  fetch_prs()     REST pagination of closed PRs, stop at 90-day cutoff
  A3  fetch_reviews_and_files()  GraphQL batches of 25 PRs with aliased pullRequest(...)
  A4  fetch_issues()  GraphQL batches of 25 issue nodes, NOT_FOUND tolerated
  A6  summary + sanity check

All network calls are disk-cached by _lib.cache_*, so reruns are near-instant.
"""
from __future__ import annotations

import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

from _lib import (
    DATA_DIR, REPO_OWNER, REPO_NAME, WINDOW_DAYS_MAX,
    graphql, make_session,
)

POOL_WORKERS = 10
BATCH = 25                                   # PRs/issues per GraphQL batch
LINKED_ISSUE_RE = re.compile(r'\b(fix|close|resolve)(e?[sd])?\s+#(\d+)', re.IGNORECASE)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s: str) -> datetime:
    # GitHub returns 'Z'-suffixed ISO8601; fromisoformat handles it on 3.11+.
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


# ---------- A2: merged PRs via GraphQL pagination ---------------------------
# Uses GraphQL instead of REST so the whole pipeline runs against the GraphQL
# rate-limit bucket. Functionally identical: paginate merged PRs sorted by
# update time DESC, stop when the stream crosses the 90-day cutoff.

PRS_QUERY = '''
query($owner:String!, $name:String!, $cursor:String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC},
                 first: 100, after: $cursor) {
      nodes {
        number title body
        createdAt mergedAt updatedAt
        author { login ... on User { avatarUrl } }
        labels(first: 15) { nodes { name } }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}
'''


def fetch_prs(session) -> list[dict]:
    cutoff = _now_utc() - timedelta(days=WINDOW_DAYS_MAX)
    print(f'[A2] fetching merged PRs since {cutoff.date()} (GraphQL)', flush=True)
    out: list[dict] = []
    cursor = None
    page = 0
    while True:
        page += 1
        data = graphql(session, PRS_QUERY,
                       {'owner': REPO_OWNER, 'name': REPO_NAME, 'cursor': cursor})
        conn = ((data.get('repository') or {}).get('pullRequests') or {})
        nodes = conn.get('nodes') or []
        if not nodes:
            break
        stop = False
        for n in nodes:
            updated = _parse_iso(n['updatedAt'])
            if updated < cutoff:
                stop = True
                break
            if not n.get('mergedAt'):
                continue
            author_obj = n.get('author') or {}
            out.append({
                'number': n['number'],
                'title': n['title'],
                'body': n.get('body') or '',
                'created_at': n['createdAt'],
                'merged_at': n['mergedAt'],
                'updated_at': n['updatedAt'],
                'author': author_obj.get('login'),
                'author_avatar': author_obj.get('avatarUrl'),
                'labels': [l['name'] for l in (n.get('labels') or {}).get('nodes') or []],
            })
        print(f'[A2] page {page}: +{len(nodes)} (kept total {len(out)})', flush=True)
        if stop:
            break
        pi = conn.get('pageInfo') or {}
        if not pi.get('hasNextPage'):
            break
        cursor = pi.get('endCursor')
    print(f'[A2] done. {len(out)} merged PRs in {WINDOW_DAYS_MAX}d window', flush=True)
    return out


# ---------- A3 + A5: reviews, files, file_authors (GraphQL) -----------------

REVIEWS_FILES_BATCH_TMPL = '''
query($owner:String!, $name:String!) {
%s
}
'''

def _alias_block(pr_number: int) -> str:
    return f'''
  pr{pr_number}: repository(owner: $owner, name: $name) {{
    pullRequest(number: {pr_number}) {{
      number
      author {{ login __typename ... on User {{ databaseId }} }}
      reviews(first: 50) {{
        nodes {{
          author {{ login }}
          submittedAt
          state
          comments {{ totalCount }}
        }}
      }}
      files(first: 100) {{
        nodes {{ path }}
        pageInfo {{ hasNextPage }}
      }}
    }}
  }}'''


def _batch_reviews_files(session, numbers: list[int]) -> dict:
    query = REVIEWS_FILES_BATCH_TMPL % '\n'.join(_alias_block(n) for n in numbers)
    return graphql(session, query, {'owner': REPO_OWNER, 'name': REPO_NAME})


def fetch_reviews_and_files(session, prs: list[dict]) -> tuple[dict, dict, dict]:
    numbers = [pr['number'] for pr in prs]
    batches = [numbers[i:i + BATCH] for i in range(0, len(numbers), BATCH)]
    print(f'[A3+A5] {len(prs)} PRs in {len(batches)} GraphQL batches '
          f'(pool={POOL_WORKERS})', flush=True)

    reviews: dict[str, dict] = {}
    pr_files: dict[str, list[str]] = {}
    file_authors: dict[str, set[str]] = {}

    done = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=POOL_WORKERS) as ex:
        futs = {ex.submit(_batch_reviews_files, session, b): b for b in batches}
        for fut in as_completed(futs):
            batch_nums = futs[fut]
            try:
                data = fut.result()
            except Exception as e:
                print(f'[A3+A5] batch failed ({batch_nums[0]}..): {e}', flush=True)
                continue
            for n in batch_nums:
                node = (data.get(f'pr{n}') or {}).get('pullRequest')
                if not node:
                    continue
                rev_nodes = ((node.get('reviews') or {}).get('nodes')) or []
                reviews[str(n)] = {
                    'reviews': [
                        {
                            'author': (r.get('author') or {}).get('login'),
                            'submittedAt': r.get('submittedAt'),
                            'state': r.get('state'),
                            'comments': (r.get('comments') or {}).get('totalCount', 0),
                        }
                        for r in rev_nodes
                    ],
                }
                files_conn = node.get('files') or {}
                file_nodes = files_conn.get('nodes') or []
                paths = [f['path'] for f in file_nodes if f.get('path')]
                if (files_conn.get('pageInfo') or {}).get('hasNextPage'):
                    print(f'[A3+A5] warn PR #{n} has >100 files; truncated', flush=True)
                pr_files[str(n)] = paths
                author = (node.get('author') or {}).get('login')
                if author:
                    for p in paths:
                        file_authors.setdefault(p, set()).add(author)
            done += 1
            if done % 25 == 0 or done == len(batches):
                pct = 100 * done / len(batches)
                print(f'[A3+A5] {done}/{len(batches)} batches ({pct:.0f}%) '
                      f'in {time.time()-t0:.0f}s', flush=True)

    # Collapse sets → sorted lists for JSON.
    file_authors_json = {p: sorted(a) for p, a in file_authors.items()}
    return reviews, pr_files, file_authors_json


# ---------- A4: issues (GraphQL) -------------------------------------------

ISSUES_BATCH_TMPL = '''
query($owner:String!, $name:String!) {
%s
}
'''

def _issue_alias(n: int) -> str:
    return f'''
  i{n}: repository(owner: $owner, name: $name) {{
    issueOrPullRequest(number: {n}) {{
      __typename
      ... on Issue {{
        number title state comments {{ totalCount }}
        author {{ login }}
        reactionGroups {{ content reactors {{ totalCount }} }}
      }}
      ... on PullRequest {{ number title }}
    }}
  }}'''


def _extract_linked(prs: list[dict]) -> list[int]:
    seen: set[int] = set()
    for pr in prs:
        for m in LINKED_ISSUE_RE.finditer(pr.get('body') or ''):
            seen.add(int(m.group(3)))
    return sorted(seen)


def _batch_issues(session, numbers: list[int]) -> dict:
    query = ISSUES_BATCH_TMPL % '\n'.join(_issue_alias(n) for n in numbers)
    return graphql(session, query, {'owner': REPO_OWNER, 'name': REPO_NAME},
                   tolerate_not_found=True)


def fetch_issues(session, prs: list[dict]) -> dict:
    numbers = _extract_linked(prs)
    print(f'[A4] {len(numbers)} unique linked #N refs extracted from PR bodies', flush=True)
    if not numbers:
        return {}

    batches = [numbers[i:i + BATCH] for i in range(0, len(numbers), BATCH)]
    out: dict[str, dict] = {}
    done = 0
    with ThreadPoolExecutor(max_workers=POOL_WORKERS) as ex:
        futs = {ex.submit(_batch_issues, session, b): b for b in batches}
        for fut in as_completed(futs):
            bnums = futs[fut]
            try:
                data = fut.result()
            except Exception as e:
                print(f'[A4] batch failed ({bnums[0]}..): {e}', flush=True)
                continue
            for n in bnums:
                node = (data.get(f'i{n}') or {}).get('issueOrPullRequest')
                if not node or node.get('__typename') != 'Issue':
                    continue
                rgroups = node.get('reactionGroups') or []
                reactions = {g['content']: (g.get('reactors') or {}).get('totalCount', 0)
                             for g in rgroups}
                out[str(n)] = {
                    'number': node.get('number'),
                    'title': node.get('title'),
                    'state': node.get('state'),
                    'comments': (node.get('comments') or {}).get('totalCount', 0),
                    'author': (node.get('author') or {}).get('login'),
                    'reactions': reactions,
                }
            done += 1
    print(f'[A4] resolved {len(out)} issues (other {len(numbers)-len(out)} were PRs / NOT_FOUND)', flush=True)
    return out


# ---------- orchestration ---------------------------------------------------

def write_json(name: str, obj) -> None:
    p = DATA_DIR / name
    p.write_text(json.dumps(obj, separators=(',', ':')))
    print(f'[out] {name}: {p.stat().st_size // 1024} KB', flush=True)


def main():
    session = make_session()

    prs = fetch_prs(session)
    write_json('prs.json', prs)

    reviews, pr_files, file_authors = fetch_reviews_and_files(session, prs)
    write_json('reviews.json', reviews)
    write_json('pr_files.json', pr_files)
    write_json('file_authors.json', file_authors)

    issues = fetch_issues(session, prs)
    write_json('issues.json', issues)

    # A6: summary + sanity check
    review_total = sum(len(v['reviews']) for v in reviews.values())
    comment_total = sum(r['comments'] for v in reviews.values() for r in v['reviews'])
    distinct_files = len(file_authors)
    print('\n--- summary ---')
    print(f'PRs:            {len(prs)}')
    print(f'Reviews:        {review_total}')
    print(f'Review comments:{comment_total}')
    print(f'Linked issues:  {len(issues)}')
    print(f'Distinct files: {distinct_files}')
    if len(prs) < 500:
        print('WARNING: fewer than 500 PRs — check token scope or window', file=sys.stderr)


if __name__ == '__main__':
    main()
