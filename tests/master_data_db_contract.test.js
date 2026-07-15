const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');

function migration(name) {
  return fs.readFileSync(path.join(migrationDir, name), 'utf8')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function includesAll(sql, fragments) {
  fragments.forEach(fragment => assert.ok(
    sql.includes(fragment.toLowerCase()),
    `Missing migration contract: ${fragment}`
  ));
}

test('[PMO-MST-DB-001] Shared Project, User, and Authority masters enforce core integrity', () => {
  const sql = migration('20260629120000_unified_shared_master_baseline.sql');

  includesAll(sql, [
    'create table if not exists public.organization_projects',
    "check (status in ('active', 'inactive', 'archived'))",
    'on public.organization_projects (lower(code))',
    'create table if not exists public.user_profiles',
    'full_name text not null',
    'on public.user_profiles (lower(email))',
    'create table if not exists public.authority_limits',
    'primary key (title, memo_type)',
    "check (memo_type in ('sl', 'hw', 'int', 'ent', 'dep'))",
    'check (limit_thb >= 0)',
  ]);
});

test('[PMO-MST-DB-002] Master tables enable RLS with read/create/update but no delete grant', () => {
  const sql = migration('20260629120000_unified_shared_master_baseline.sql');

  ['organization_projects', 'user_profiles', 'authority_limits'].forEach(table => {
    includesAll(sql, [
      `alter table public.${table} enable row level security`,
      `create policy poc_read_${table} on public.${table} for select`,
      `create policy poc_create_${table} on public.${table} for insert`,
      `create policy poc_update_${table} on public.${table} for update`,
      `grant select, insert, update on public.${table} to anon, authenticated`,
    ]);
    assert.ok(!sql.includes(`grant select, insert, update, delete on public.${table}`));
  });
});

test('[PMO-MST-DB-003] Project Code master and assignments preserve identity, ranges, and references', () => {
  const masterSql = migration('20260624103000_project_code_master.sql');
  const assignmentSql = migration('20260624113000_resource_project_code_assignments.sql');
  const organizationSql = migration('20260702113000_organization_projects.sql');

  includesAll(masterSql, [
    'create table if not exists public.project_code_master',
    'project text not null',
    'project_code text not null unique',
    'alter table public.project_code_master enable row level security',
  ]);
  includesAll(assignmentSql, [
    'resource_request_id text not null references public.resource_requests(id) on delete cascade',
    'project_code_id text references public.project_code_master(id) on delete set null',
    'check (allocation_percent between 1 and 100)',
    'check (end_date is null or start_date is null or end_date >= start_date)',
  ]);
  includesAll(organizationSql, [
    'add column if not exists organization_project_id text references public.organization_projects(id) on delete set null',
    'create index if not exists project_code_master_organization_project_idx',
  ]);
});

test('[PMO-MST-DB-004] Resource Master prevents duplicate employee codes and invalid lifecycle data', () => {
  const sql = migration('20260702110000_resource_master.sql');

  includesAll(sql, [
    'create table if not exists public.resource_master',
    "check (resource_status in ('active', 'inactive', 'offboarded'))",
    'check (offboard_date is null or onboard_date is null or offboard_date >= onboard_date)',
    'on public.resource_master (lower(employee_code))',
    'resource_master_id text references public.resource_master(id) on delete set null',
    'alter table public.resource_master enable row level security',
    'grant select, insert, update on public.resource_master to anon, authenticated',
  ]);
  assert.ok(!sql.includes('grant select, insert, update, delete on public.resource_master'));
});

test('[PMO-MST-DB-005] Organization Project backfill covers every existing project source', () => {
  const sql = migration('20260702113000_organization_projects.sql');
  const alignSql = migration('20260703104500_organization_project_code_same_as_name.sql');

  includesAll(sql, [
    'select project from public.project_code_master',
    'select current_project as project from public.resource_master',
    'select project from public.resource_requests',
    'lower(pcm.project) = lower(op.name)',
    'lower(rm.current_project) = lower(op.name)',
  ]);
  includesAll(alignSql, [
    'set code = name',
    'other.id <> op.id',
    'lower(other.code) = lower(op.name)',
  ]);
});

test('[PMO-MST-DB-006] Memo workflow references canonical User Profiles and backfills aliases', () => {
  const sql = migration('20260629123554_phase1_memo_workflow.sql');

  includesAll(sql, [
    'requester_profile_id bigint references public.user_profiles(id) on delete set null',
    'current_approver_profile_id bigint references public.user_profiles(id) on delete set null',
    "m.requester_name = any(coalesce(u.name_aliases, '{}'::text[]))",
    'create index if not exists memos_requester_profile_id_idx',
    'create index if not exists memos_current_approver_profile_id_idx',
  ]);
});
