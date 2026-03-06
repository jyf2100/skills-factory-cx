create table if not exists catalog_skills (
  skill_id text primary key,
  title text not null,
  summary text not null,
  category text not null,
  category_slug text not null,
  latest_version text not null,
  versions_count integer not null,
  risk_level text not null,
  published_at timestamptz not null,
  source_url text not null,
  package_url text not null,
  reviewer text not null,
  reviewed_at timestamptz,
  review_note text not null default '',
  scan_issue_count integer not null default 0,
  review_status text not null,
  static_scan_status text not null,
  sandbox_status text not null,
  readme_markdown text not null,
  readme_html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_catalog_skills_published_at on catalog_skills (published_at desc);
create index if not exists idx_catalog_skills_category on catalog_skills (category_slug, published_at desc);
create index if not exists idx_catalog_skills_risk on catalog_skills (risk_level, published_at desc);

create table if not exists catalog_skill_versions (
  skill_id text not null,
  version text not null,
  title text not null,
  summary text not null,
  category text not null,
  category_slug text not null,
  risk_level text not null,
  published_at timestamptz not null,
  source_url text not null,
  package_url text not null,
  reviewer text not null,
  reviewed_at timestamptz,
  review_note text not null default '',
  scan_issue_count integer not null default 0,
  review_status text not null,
  static_scan_status text not null,
  sandbox_status text not null,
  readme_markdown text not null,
  readme_html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (skill_id, version)
);

create index if not exists idx_catalog_skill_versions_skill_published on catalog_skill_versions (skill_id, published_at desc);
create index if not exists idx_catalog_skill_versions_reviewed on catalog_skill_versions (review_status, published_at desc);
create index if not exists idx_catalog_skill_versions_category on catalog_skill_versions (category_slug, published_at desc);

create table if not exists catalog_skill_tags (
  skill_id text not null,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (skill_id, tag)
);

create index if not exists idx_catalog_skill_tags_tag on catalog_skill_tags (tag, skill_id);

create table if not exists catalog_sync_runs (
  id text primary key,
  mode text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  skills_scanned integer not null default 0,
  versions_scanned integer not null default 0,
  error_message text
);
