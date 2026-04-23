"""Shared infrastructure: env loading, disk cache, REST + GraphQL clients with rate-limit
handling, and the Supabase client used by analyze.py.

Cache layout: every REST GET and every GraphQL POST is keyed by a SHA256 of the full
request identity (URL for REST; query+variables for GraphQL). Hits return instantly so
reruns of analyze.py are free and re-runs of fetch.py only repeat the misses.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

# --- paths -------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
CACHE_DIR = DATA_DIR / 'cache'
DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# --- env --------------------------------------------------------------------

def _load_env():
    env_path = ROOT / '.env.local'
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v

_load_env()

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN')
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
SUPABASE_KEY = (
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    or os.environ.get('VITE_SUPABASE_ANON_KEY')
    or os.environ.get('SUPABASE_ANON_KEY')
)

REPO_OWNER = 'PostHog'
REPO_NAME = 'posthog'
WINDOW_DAYS_MAX = 90

# --- cache ------------------------------------------------------------------

def _cache_path(key: str) -> Path:
    return CACHE_DIR / f'{hashlib.sha256(key.encode()).hexdigest()}.json'


def cache_get(key: str) -> tuple[bool, Any]:
    p = _cache_path(key)
    if not p.exists():
        return False, None
    try:
        return True, json.loads(p.read_text())
    except json.JSONDecodeError:
        return False, None


def cache_put(key: str, value: Any) -> None:
    _cache_path(key).write_text(json.dumps(value, separators=(',', ':')))


# --- rate limit handling ----------------------------------------------------

_rate_lock = threading.Lock()

def _handle_rate_limit(resp: requests.Response, threshold: int = 10) -> None:
    """If the response exhausts the bucket, sleep until reset.
    Threshold=10 matches the user-described policy."""
    remaining = resp.headers.get('X-RateLimit-Remaining')
    if remaining is None:
        return
    try:
        remaining_i = int(remaining)
    except ValueError:
        return
    if remaining_i >= threshold:
        return
    reset = int(resp.headers.get('X-RateLimit-Reset', '0'))
    now = int(time.time())
    wait = max(reset - now, 5)
    with _rate_lock:
        print(f'[rate] {remaining_i} remaining, sleeping {wait}s until reset', flush=True)
        time.sleep(wait + 2)


# --- REST client ------------------------------------------------------------

def make_session() -> requests.Session:
    if not GITHUB_TOKEN:
        raise RuntimeError('GITHUB_TOKEN missing in .env.local')
    s = requests.Session()
    s.headers.update({
        'Authorization': f'Bearer {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'top-engineer-dashboard',
    })
    return s


def rest_get(session: requests.Session, path: str, params: dict | None = None) -> Any:
    """Cached REST GET. Path starts with '/'. Returns parsed JSON or None for 404."""
    url = f'https://api.github.com{path}'
    if params:
        from urllib.parse import urlencode
        url = f'{url}?{urlencode(sorted(params.items()))}'
    hit, val = cache_get(url)
    if hit:
        return val

    for attempt in range(5):
        resp = session.get(url, timeout=30)
        _handle_rate_limit(resp)
        if resp.status_code == 404:
            cache_put(url, None)
            return None
        if resp.status_code in (403, 429):
            # Secondary rate limit or abuse detection. Wait and retry.
            reset = int(resp.headers.get('X-RateLimit-Reset', '0'))
            now = int(time.time())
            wait = max(reset - now, 2 ** attempt * 5)
            print(f'[rest] {resp.status_code} on {path} — sleeping {wait}s', flush=True)
            time.sleep(wait + 2)
            continue
        if resp.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        if not resp.ok:
            raise RuntimeError(f'REST {resp.status_code} on {path}: {resp.text[:200]}')
        data = resp.json()
        cache_put(url, data)
        return data
    raise RuntimeError(f'REST: exhausted retries for {path}')


def rest_paginate(session: requests.Session, path: str, params: dict, per_page: int = 100):
    """Yield items page-by-page. Caller decides when to stop (return-early supported)."""
    page = 1
    while True:
        p = {**params, 'per_page': per_page, 'page': page}
        batch = rest_get(session, path, p)
        if not batch:
            return
        for item in batch:
            yield item
        if len(batch) < per_page:
            return
        page += 1


# --- GraphQL client ---------------------------------------------------------

GRAPHQL_URL = 'https://api.github.com/graphql'


class GraphQLError(Exception):
    pass


class GraphQLNotFound(Exception):
    """Raised when the only errors are NOT_FOUND — caller can choose to tolerate them."""


def graphql(session: requests.Session, query: str, variables: dict | None = None,
            tolerate_not_found: bool = True) -> dict:
    """Cached GraphQL POST. Returns `data` dict.

    NOT_FOUND errors (common for #N refs that point to deleted/cross-repo issues) are
    tolerated — the partial data is returned with null entries for missing nodes. Other
    GraphQL errors are fatal.
    """
    key = f'GQL|{hashlib.sha256(query.encode()).hexdigest()}|{json.dumps(variables or {}, sort_keys=True)}'
    hit, val = cache_get(key)
    if hit:
        return val

    payload = {'query': query, 'variables': variables or {}}
    for attempt in range(5):
        resp = session.post(GRAPHQL_URL, json=payload, timeout=60)
        _handle_rate_limit(resp)
        if resp.status_code in (403, 429):
            reset = int(resp.headers.get('X-RateLimit-Reset', '0'))
            wait = max(reset - int(time.time()), 2 ** attempt * 5)
            print(f'[gql] {resp.status_code} — sleeping {wait}s', flush=True)
            time.sleep(wait + 2)
            continue
        if resp.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        if not resp.ok:
            raise GraphQLError(f'HTTP {resp.status_code}: {resp.text[:300]}')

        body = resp.json()
        errors = body.get('errors') or []
        non_nf = [e for e in errors if e.get('type') != 'NOT_FOUND']
        if non_nf and not (tolerate_not_found and not non_nf):
            raise GraphQLError(f'GraphQL errors: {non_nf}')
        if errors and not tolerate_not_found:
            raise GraphQLError(f'GraphQL errors: {errors}')
        data = body.get('data') or {}
        cache_put(key, data)
        return data
    raise GraphQLError('exhausted retries')


# --- Supabase ---------------------------------------------------------------

@dataclass
class SupaCfg:
    url: str
    key: str

def supabase_cfg() -> SupaCfg:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError('SUPABASE_URL / key missing in .env.local')
    return SupaCfg(SUPABASE_URL, SUPABASE_KEY)


def supabase_upsert(table: str, rows: list[dict], on_conflict: str) -> None:
    cfg = supabase_cfg()
    url = f'{cfg.url}/rest/v1/{table}?on_conflict={on_conflict}'
    headers = {
        'apikey': cfg.key,
        'Authorization': f'Bearer {cfg.key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    }
    resp = requests.post(url, headers=headers, data=json.dumps(rows), timeout=60)
    if not resp.ok:
        raise RuntimeError(f'supabase upsert {table}: {resp.status_code} {resp.text[:400]}')
