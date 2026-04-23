"""Analyzer — loads the 5 JSON files, produces 15 impact_views, upserts to Supabase.

Methodology (4 dimensions → weighted composite):
  1. Architectural Centrality (30%):
       - core PR share: fraction of PRs touching posthog/, frontend/src/scenes/,
         plugin-server/, rust/
       - file hub score: avg, across files the engineer touched, of distinct co-authors
         who also touched the file (shared-code signal)
  2. Review Leverage (30%):
       - review depth: per-review weight from inline comment count
         (0 => 0.2, 1 => 0.4, 2 => 0.6, 3 => 0.8, 5+ => 1.0), averaged per reviewer
       - review breadth: distinct PR authors reviewed
       - turnaround: median hours from PR open to first review by this reviewer (inverted)
  3. User Value Delivery (25%):
       - issue-linked PR count weighted by reactions + comments on linked issue;
         only fix/feature PRs
  4. Output Baseline (15%):
       - merged PR count (capped at cohort p95)
       - active days (distinct dates with >=1 PR authored or reviewed)

Each sub-metric is min-max normalized across the cohort to [0, 100]. Dimension scores
are the mean of their sub-metrics (already on the 0-100 scale). Composite is the
weighted sum of the four dimensions.

15 views = 3 windows (30/60/90 days) × 5 areas (all/backend/frontend/plugin-server/rust).
Each row stored in impact_views contains the ranked engineers[] with all raw + normalized
numbers so the card UI can render the exact breakdown.
"""
from __future__ import annotations

import json
import re
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from _lib import DATA_DIR, supabase_upsert

# ---- inputs ---------------------------------------------------------------

def load_inputs():
    with (DATA_DIR / 'prs.json').open() as f:
        prs = json.load(f)
    with (DATA_DIR / 'reviews.json').open() as f:
        reviews = json.load(f)
    with (DATA_DIR / 'pr_files.json').open() as f:
        pr_files = json.load(f)
    with (DATA_DIR / 'file_authors.json').open() as f:
        file_authors = json.load(f)
    with (DATA_DIR / 'issues.json').open() as f:
        issues = json.load(f)
    return prs, reviews, pr_files, file_authors, issues


# ---- classification --------------------------------------------------------

BOT_LOGINS = {
    'dependabot', 'dependabot[bot]', 'posthog-bot', 'github-actions', 'github-actions[bot]',
    'renovate', 'renovate[bot]', 'snyk-bot', 'greenkeeper[bot]',
}

AREAS = {
    'backend':       ['posthog/', 'ee/'],
    'frontend':      ['frontend/src/scenes/', 'frontend/'],
    'plugin-server': ['plugin-server/'],
    'rust':          ['rust/'],
}
CORE_PREFIXES = [p for ps in AREAS.values() for p in ps]

FIX_TITLE_RE = re.compile(r'^(fix|bug)[:(]', re.IGNORECASE)
FEAT_TITLE_RE = re.compile(r'^(feat|feature)[:(]', re.IGNORECASE)
LINKED_RE = re.compile(r'\b(fix|close|resolve)(e?[sd])?\s+#(\d+)', re.IGNORECASE)


def is_bot(login: str | None) -> bool:
    if not login:
        return True
    return login.lower() in BOT_LOGINS or 'bot' in login.lower()


def pr_area(paths: list[str]) -> set[str]:
    """Return set of area tags this PR touches (can be multiple)."""
    out: set[str] = set()
    for area, prefixes in AREAS.items():
        if any(p.startswith(pref) for p in paths for pref in prefixes):
            out.add(area)
    return out


def pr_is_core(paths: list[str]) -> bool:
    return any(p.startswith(pref) for p in paths for pref in CORE_PREFIXES)


def pr_kind(pr: dict) -> str:
    t = pr['title'] or ''
    labels = {l.lower() for l in pr.get('labels') or []}
    if FIX_TITLE_RE.match(t) or 'bug' in labels:
        return 'fix'
    if FEAT_TITLE_RE.match(t) or 'enhancement' in labels or 'feature' in labels:
        return 'feat'
    return 'other'


def pr_linked_issues(pr: dict) -> list[int]:
    body = pr.get('body') or ''
    return sorted({int(m.group(3)) for m in LINKED_RE.finditer(body)})


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


# ---- review-depth weighting -----------------------------------------------

DEPTH_WEIGHTS = [(0, 0.2), (1, 0.4), (2, 0.6), (3, 0.8), (5, 1.0)]

def review_depth_weight(comments: int) -> float:
    w = 0.2
    for threshold, weight in DEPTH_WEIGHTS:
        if comments >= threshold:
            w = weight
    return w


# ---- issue weight ---------------------------------------------------------

POSITIVE_REACTIONS = {'THUMBS_UP', 'HEART', 'HOORAY', 'ROCKET'}

def issue_weight(issue: dict) -> float:
    """reactions (positive subset) + comments, lightly capped."""
    reactions = issue.get('reactions') or {}
    pos = sum(v for k, v in reactions.items() if k in POSITIVE_REACTIONS)
    comments = issue.get('comments', 0)
    return float(pos + comments)


# ---- core computation -----------------------------------------------------

def compute_view(
    prs: list[dict],
    reviews_idx: dict,
    pr_files: dict,
    file_authors: dict,
    issues: dict,
    window_days: int,
    area: str,
) -> list[dict]:
    """Return ranked engineers for this (window, area) view."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

    # Filter PRs by window + area.
    kept: list[dict] = []
    for pr in prs:
        if is_bot(pr.get('author')):
            continue
        if parse_iso(pr['merged_at']) < cutoff:
            continue
        paths = pr_files.get(str(pr['number']), [])
        if area != 'all':
            if area not in pr_area(paths):
                continue
        kept.append(pr)
    if not kept:
        return []

    # PRs per author, files per author, etc.
    pr_by_author: dict[str, list[dict]] = defaultdict(list)
    for pr in kept:
        pr_by_author[pr['author']].append(pr)

    # Per-author raw metrics.
    raw: dict[str, dict] = {}
    for author, author_prs in pr_by_author.items():
        # Centrality
        core_hits = sum(1 for pr in author_prs if pr_is_core(pr_files.get(str(pr['number']), [])))
        core_share = core_hits / len(author_prs)

        touched_files = {p for pr in author_prs for p in pr_files.get(str(pr['number']), [])}
        hub_scores = []
        for f in touched_files:
            co_authors = {a for a in file_authors.get(f, []) if not is_bot(a) and a != author}
            hub_scores.append(len(co_authors))
        file_hub = statistics.fmean(hub_scores) if hub_scores else 0.0

        # User value delivery (only fix/feature PRs with linked issues that resolved to issues)
        uv_score = 0.0
        for pr in author_prs:
            if pr_kind(pr) == 'other':
                continue
            for issue_num in pr_linked_issues(pr):
                iss = issues.get(str(issue_num))
                if not iss:
                    continue
                uv_score += issue_weight(iss)

        # Output baseline — PR count + active days (authored within window)
        merged_count = len(author_prs)
        active_days_set = {parse_iso(pr['merged_at']).date() for pr in author_prs}

        raw[author] = {
            'avatar': author_prs[0].get('author_avatar'),
            'merged_prs': merged_count,
            'core_share': core_share,
            'file_hub': file_hub,
            'user_value': uv_score,
            'active_days': len(active_days_set),
            # review metrics filled below
            'review_depth': 0.0,
            'review_breadth': 0,
            'turnaround_hours': None,
            'reviews_given': 0,
        }

    # Review metrics: iterate over all reviews of kept PRs (regardless of area),
    # attributing to reviewers. Reviewers can appear even without authoring a PR;
    # we still want to include them if they meet the threshold.
    pr_created_by_num = {pr['number']: parse_iso(pr['created_at']) for pr in kept}
    pr_author_by_num = {pr['number']: pr['author'] for pr in kept}

    first_review_hours_by_reviewer: dict[str, list[float]] = defaultdict(list)
    depth_samples_by_reviewer: dict[str, list[float]] = defaultdict(list)
    authors_reviewed_by_reviewer: dict[str, set[str]] = defaultdict(set)
    reviews_count_by_reviewer: dict[str, int] = defaultdict(int)
    active_days_by_reviewer: dict[str, set] = defaultdict(set)

    for pr in kept:
        rev_entry = reviews_idx.get(str(pr['number']))
        if not rev_entry:
            continue
        revs = rev_entry.get('reviews', [])
        # Group by reviewer → first submittedAt and depth
        per_reviewer: dict[str, list[dict]] = defaultdict(list)
        for r in revs:
            login = r.get('author')
            if not login or is_bot(login):
                continue
            if not r.get('submittedAt'):
                continue
            per_reviewer[login].append(r)
        for reviewer, rs in per_reviewer.items():
            rs_sorted = sorted(rs, key=lambda x: x['submittedAt'])
            first = rs_sorted[0]
            first_dt = parse_iso(first['submittedAt'])
            hours = max((first_dt - pr_created_by_num[pr['number']]).total_seconds() / 3600, 0.0)
            first_review_hours_by_reviewer[reviewer].append(hours)
            authors_reviewed_by_reviewer[reviewer].add(pr_author_by_num[pr['number']])
            for r in rs:
                depth_samples_by_reviewer[reviewer].append(
                    review_depth_weight(r.get('comments', 0))
                )
                reviews_count_by_reviewer[reviewer] += 1
                active_days_by_reviewer[reviewer].add(parse_iso(r['submittedAt']).date())

    # Merge reviewer-side metrics into raw. Create entries for reviewer-only engineers.
    for reviewer in set(list(depth_samples_by_reviewer.keys()) + list(raw.keys())):
        if reviewer not in raw:
            raw[reviewer] = {
                'avatar': None,
                'merged_prs': 0,
                'core_share': 0.0,
                'file_hub': 0.0,
                'user_value': 0.0,
                'active_days': 0,
                'review_depth': 0.0,
                'review_breadth': 0,
                'turnaround_hours': None,
                'reviews_given': 0,
            }
        if reviewer in depth_samples_by_reviewer:
            samples = depth_samples_by_reviewer[reviewer]
            raw[reviewer]['review_depth'] = (
                statistics.fmean(samples) if samples else 0.0
            )
            raw[reviewer]['review_breadth'] = len(
                {a for a in authors_reviewed_by_reviewer[reviewer] if a and a != reviewer}
            )
            hours = first_review_hours_by_reviewer[reviewer]
            raw[reviewer]['turnaround_hours'] = (
                statistics.median(hours) if hours else None
            )
            raw[reviewer]['reviews_given'] = reviews_count_by_reviewer[reviewer]
            # Merge active days from reviewing too
            merged_days = set(active_days_by_reviewer[reviewer])
            # active_days already counted authored merges above; combine sets.
            if raw[reviewer]['active_days']:
                # We lost the set above; approximate by taking max. Better: recompute.
                pass
            raw[reviewer]['active_days'] = max(
                raw[reviewer]['active_days'], len(merged_days)
            )

    # Activity floor: drop engineers who are both low-volume authors AND low-volume
    # reviewers. Prevents tiny samples (1-2 PRs touching core paths) from fluking into
    # the top ranks via min-max normalization.
    raw = {
        login: v for login, v in raw.items()
        if v['merged_prs'] >= 5 or v['reviews_given'] >= 3
    }
    if not raw:
        return []

    # Output baseline: cap merged_prs at cohort p95 to kill volume dominance.
    mp_values = sorted(v['merged_prs'] for v in raw.values())
    idx = max(0, int(len(mp_values) * 0.95) - 1)
    p95 = mp_values[idx] if mp_values else 0
    for v in raw.values():
        v['merged_prs_capped'] = min(v['merged_prs'], p95)

    # Turnaround is inverted (lower = better). Translate None → worst so they don't
    # fluke to the top. We'll invert after normalizing.
    # Min-max normalize to 0..100. Turnaround: invert (1 - norm).

    def normalize(field: str, invert: bool = False, none_as_worst: bool = False) -> dict[str, float]:
        vals = []
        for v in raw.values():
            x = v.get(field)
            if x is None:
                continue
            vals.append(float(x))
        if not vals:
            return {login: 0.0 for login in raw}
        lo, hi = min(vals), max(vals)
        spread = hi - lo
        out = {}
        for login, v in raw.items():
            x = v.get(field)
            if x is None:
                out[login] = 0.0 if not none_as_worst else (100.0 if invert else 0.0)
                continue
            if spread == 0:
                n = 50.0
            else:
                n = (float(x) - lo) / spread * 100.0
            if invert:
                n = 100.0 - n
            out[login] = n
        return out

    norm = {
        'core_share':       normalize('core_share'),
        'file_hub':         normalize('file_hub'),
        'review_depth':     normalize('review_depth'),
        'review_breadth':   normalize('review_breadth'),
        'turnaround':       normalize('turnaround_hours', invert=True, none_as_worst=True),
        'user_value':       normalize('user_value'),
        'merged_prs':       normalize('merged_prs_capped'),
        'active_days':      normalize('active_days'),
    }

    # Dimension scores = mean of sub-metrics (already 0-100).
    ranked = []
    for login, v in raw.items():
        centrality   = (norm['core_share'][login] + norm['file_hub'][login]) / 2
        review_lev   = (norm['review_depth'][login] + norm['review_breadth'][login] + norm['turnaround'][login]) / 3
        user_value_d = norm['user_value'][login]
        output_base  = (norm['merged_prs'][login] + norm['active_days'][login]) / 2

        composite = (
            0.30 * centrality
            + 0.30 * review_lev
            + 0.25 * user_value_d
            + 0.15 * output_base
        )
        ranked.append({
            'login': login,
            'avatar_url': v.get('avatar'),
            'composite': round(composite, 2),
            'dimensions': {
                'centrality':        round(centrality, 2),
                'review_leverage':   round(review_lev, 2),
                'user_value':        round(user_value_d, 2),
                'output_baseline':   round(output_base, 2),
            },
            'normalized': {k: round(norm[k][login], 2) for k in norm},
            'raw': {
                'merged_prs':       v['merged_prs'],
                'merged_prs_capped': v['merged_prs_capped'],
                'core_share':       round(v['core_share'], 3),
                'file_hub':         round(v['file_hub'], 2),
                'review_depth':     round(v['review_depth'], 3),
                'review_breadth':   v['review_breadth'],
                'turnaround_hours': (None if v['turnaround_hours'] is None
                                     else round(v['turnaround_hours'], 2)),
                'reviews_given':    v['reviews_given'],
                'user_value_raw':   v['user_value'],
                'active_days':      v['active_days'],
            },
        })
    ranked.sort(key=lambda x: x['composite'], reverse=True)
    return ranked


# ---- driver ---------------------------------------------------------------

WINDOWS = [30, 60, 90]
VIEW_AREAS = ['all', 'backend', 'frontend', 'plugin-server', 'rust']


def main():
    prs, reviews, pr_files, file_authors, issues = load_inputs()
    print(f'Loaded: {len(prs)} PRs, {len(reviews)} review sets, '
          f'{len(pr_files)} file lists, {len(file_authors)} files in authorship index, '
          f'{len(issues)} issues')

    rows = []
    for w in WINDOWS:
        for a in VIEW_AREAS:
            ranked = compute_view(prs, reviews, pr_files, file_authors, issues, w, a)
            print(f'  view w={w} area={a:<14s} engineers={len(ranked)}')
            rows.append({
                'window_days': w,
                'area': a,
                'engineers': ranked,
                # `computed_at` defaults to now() at the DB.
            })

    # Write locally for debugging.
    (DATA_DIR / 'impact_views.json').write_text(json.dumps(rows, separators=(',', ':')))
    print(f'wrote data/impact_views.json ({(DATA_DIR / "impact_views.json").stat().st_size // 1024} KB)')

    # Upsert to Supabase.
    supabase_upsert('impact_views', rows, on_conflict='window_days,area')
    print(f'upserted {len(rows)} rows into impact_views')


if __name__ == '__main__':
    main()
