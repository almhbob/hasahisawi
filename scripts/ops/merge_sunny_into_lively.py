"""
Merge the Hasahisawi "sunny-peace" database (SRC) into "lively-mindfulness" (DST).

Why: after the original DB crashed (May 15) a second DB was used from late May
to July 1. Data is split between them. DST becomes the primary database.

Rules (idempotent — safe to run again, e.g. as a catch-up after cutover):
  * users are matched by firebase_uid, then lower(email), then phone.
      - matched  -> keep the DST row; only fill DST columns that are NULL/empty
                    (never overwrite; never change role or password).
      - unmatched -> insert into DST with a new id.
  * user-generated tables: rows copied with every users-FK column remapped to
    the DST user id; duplicates skipped by a per-table natural key.
  * seed/config tables (cultural_*, rated_entities, admin_settings, plans …)
    are NOT copied — the API recreates them at startup.
  * never deletes or updates existing DST content rows.

MODE=dryrun runs everything inside one transaction and ROLLS BACK.
MODE=apply  commits. Output = counts only (no personal data).
"""
import os, re, sys, hashlib
import psycopg2, psycopg2.extras

MODE = os.environ.get("MODE", "dryrun")
SRC = psycopg2.connect(os.environ["SRC_URL"]); SRC.set_session(readonly=True)
DST = psycopg2.connect(os.environ["DST_URL"]); DST.autocommit = False

def note(title, msg):
    print(f"::notice title={title}::{msg}", flush=True)

def q(conn, sql, args=None, dict_rows=False):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor if dict_rows else None)
    cur.execute(sql, args or ())
    return cur.fetchall() if cur.description else None

def table_exists(conn, t):
    return bool(q(conn, "select 1 from information_schema.tables where table_schema='public' and table_name=%s", (t,)))

def columns(conn, t):
    return {r[0]: (r[1], r[2]) for r in q(conn,
        "select column_name, data_type, column_default from information_schema.columns "
        "where table_schema='public' and table_name=%s", (t,))}

def user_fk_columns(conn, t):
    """Columns of t that reference users(id) via a FK, plus conventional names."""
    rows = q(conn, """
        select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
          join information_schema.constraint_column_usage ccu
            on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
         where tc.constraint_type='FOREIGN KEY' and tc.table_name=%s and ccu.table_name='users'""", (t,))
    fks = {r[0] for r in rows}
    conventional = {"user_id", "author_id", "owner_id", "created_by", "submitted_by",
                    "reviewed_by", "sender_id", "receiver_id", "user1_id", "user2_id", "reporter_id"}
    return fks | (conventional & set(columns(conn, t)))

def norm_phone(p):
    if not p: return None
    d = re.sub(r"\D", "", str(p))
    if d.startswith("00"): d = d[2:]
    if d.startswith("249"): d = d[3:]
    return d.lstrip("0") or None

# ── 1. users ────────────────────────────────────────────────────────────────
src_users = q(SRC, "select * from users order by id", dict_rows=True)
dst_users = q(DST, "select * from users order by id", dict_rows=True)
by_fb, by_em, by_ph = {}, {}, {}
for u in dst_users:
    if u.get("firebase_uid"): by_fb[u["firebase_uid"]] = u
    if u.get("email"): by_em[str(u["email"]).strip().lower()] = u
    p = norm_phone(u.get("phone"))
    if p: by_ph[p] = u

ucols_src, ucols_dst = columns(SRC, "users"), columns(DST, "users")
common_ucols = [c for c in ucols_src if c in ucols_dst and c != "id"]
FILL_NULL = {"firebase_uid", "avatar_url", "gender", "neighborhood", "birth_date", "bio",
             "national_id", "email", "phone"}

idmap, matched, inserted, filled, insert_failed, fill_skipped = {}, 0, 0, 0, 0, 0
cur = DST.cursor()
for u in src_users:
    m = (u.get("firebase_uid") and by_fb.get(u["firebase_uid"])) \
        or (u.get("email") and by_em.get(str(u["email"]).strip().lower())) \
        or (norm_phone(u.get("phone")) and by_ph.get(norm_phone(u.get("phone"))))
    if m:
        idmap[u["id"]] = m["id"]; matched += 1
        for c in FILL_NULL & set(common_ucols):
            if u.get(c) not in (None, "") and m.get(c) in (None, ""):
                cur.execute("savepoint sp")
                try:
                    cur.execute(f'update users set "{c}"=%s where id=%s and ("{c}" is null or "{c}"::text = %s)', (u[c], m["id"], ""))
                    cur.execute("release savepoint sp"); filled += 1; m[c] = u[c]
                except Exception:
                    cur.execute("rollback to savepoint sp"); fill_skipped += 1
        continue
    cols = [c for c in common_ucols if u.get(c) is not None]
    cur.execute("savepoint sp")
    try:
        cur.execute(
            f'insert into users ({",".join(chr(34)+c+chr(34) for c in cols)}) values ({",".join(["%s"]*len(cols))}) returning id',
            [psycopg2.extras.Json(u[c]) if isinstance(u[c], (dict, list)) else u[c] for c in cols])
        new_id = cur.fetchone()[0]
        cur.execute("release savepoint sp")
        idmap[u["id"]] = new_id; inserted += 1
        if u.get("firebase_uid"): by_fb[u["firebase_uid"]] = {"id": new_id, **u}
        if u.get("email"): by_em[str(u["email"]).strip().lower()] = {"id": new_id, **u}
        if norm_phone(u.get("phone")): by_ph[norm_phone(u.get("phone"))] = {"id": new_id, **u}
    except Exception as e:
        cur.execute("rollback to savepoint sp"); insert_failed += 1
        print(f"user insert failed ({type(e).__name__}): {str(e).splitlines()[0][:160]}", flush=True)
note("users", f"source={len(src_users)} matched={matched} inserted={inserted} insert_failed={insert_failed} "
              f"null_fields_filled={filled} fill_skipped={fill_skipped} target_before={len(dst_users)}")

# ── 2. user-generated tables ────────────────────────────────────────────────
# table -> natural key columns (after user-id remap) used to skip duplicates
TABLES = {
    "social_posts": ["user_id", "created_at"],
    "user_sessions": ["token"],
    "zawajil_applications": ["created_at"],
    "lost_items": ["created_at"],
    "chats": ["user1_id", "user2_id"],
    "chat_messages": ["sender_id", "created_at"],
    "contact_messages": ["created_at"],
    "push_tokens": ["token"],
    "institution_applications": ["created_at"],
    "lawyer_applications": ["created_at"],
    "women_join_requests": ["created_at"],
    "travel_agency_applications": ["created_at"],
    "medical_institutions": ["name"],
    "clinic_supervisors": ["created_at"],
}

def key_of(row, keycols):
    return tuple(str(row.get(k)) for k in keycols)

for t, keycols in TABLES.items():
    if not table_exists(SRC, t):
        continue
    if not table_exists(DST, t):
        note(f"table {t}", "skipped: table not in target yet (created by the API at startup; rerun after cutover)")
        continue
    src_rows = q(SRC, f'select * from "{t}"', dict_rows=True)
    if not src_rows:
        continue
    scols, dcols = columns(SRC, t), columns(DST, t)
    fks = user_fk_columns(DST, t) | user_fk_columns(SRC, t)
    keycols = [k for k in keycols if k in dcols]
    existing = {key_of(r, keycols) for r in q(DST, f'select * from "{t}"', dict_rows=True)} if keycols else set()
    id_has_default = bool(dcols.get("id", (None, None))[1])
    copy, dup, unmapped, failed = 0, 0, 0, 0
    for r in src_rows:
        row = dict(r)
        ok = True
        for fk in fks:
            if fk in row and row[fk] is not None:
                if row[fk] in idmap: row[fk] = idmap[row[fk]]
                else: ok = False
        if not ok:
            unmapped += 1; continue
        if keycols and key_of(row, keycols) in existing:
            dup += 1; continue
        cols = [c for c in scols if c in dcols and row.get(c) is not None and not (c == "id" and id_has_default)]
        cur.execute("savepoint sp")
        try:
            cur.execute(f'insert into "{t}" ({",".join(chr(34)+c+chr(34) for c in cols)}) values ({",".join(["%s"]*len(cols))})',
                        [psycopg2.extras.Json(row[c]) if isinstance(row[c], (dict, list)) else row[c] for c in cols])
            cur.execute("release savepoint sp"); copy += 1
            if keycols: existing.add(key_of(row, keycols))
        except Exception as e:
            cur.execute("rollback to savepoint sp"); failed += 1
            print(f"{t} insert failed ({type(e).__name__}): {str(e).splitlines()[0][:160]}", flush=True)
    note(f"table {t}", f"source={len(src_rows)} copied={copy} duplicates_skipped={dup} owner_unmapped={unmapped} failed={failed}")

# ── 3. reset sequences so new rows get fresh ids ─────────────────────────────
for (t, col, seq) in q(DST, """
    select c.table_name, c.column_name, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name)
      from information_schema.columns c
     where c.table_schema='public' and c.column_default like 'nextval%%'"""):
    if seq:
        cur.execute(f"select setval(%s, greatest((select coalesce(max(\"{col}\"),0) from \"{t}\"), 1))", (seq,))

after = q(DST, "select (select count(*) from users), (select count(*) from social_posts), (select count(*) from lawyers)")[0]
note("target after", f"users={after[0]} social_posts={after[1]} lawyers={after[2]} (mode={MODE})")

if MODE == "apply":
    DST.commit(); note("result", "COMMITTED")
else:
    DST.rollback(); note("result", "DRY RUN — rolled back, nothing changed")
