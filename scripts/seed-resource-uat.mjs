import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const configPath = process.env.PMO_CONFIG_PATH || 'config.js';

async function loadConfig() {
  const source = await readFile(configPath, 'utf8');
  const match = source.match(/window\.__PMO_CONFIG__\s*=\s*(\{[\s\S]*?\});/);
  if (!match) throw new Error(`Could not parse ${configPath}`);
  const config = JSON.parse(match[1]);
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(`${configPath} must include supabaseUrl and supabaseAnonKey`);
  }
  return {
    supabaseUrl: String(config.supabaseUrl).replace(/\/$/, ''),
    supabaseAnonKey: String(config.supabaseAnonKey),
  };
}

async function loadFixtures() {
  const source = await readFile('scripts/resource-uat-fixtures.js', 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'scripts/resource-uat-fixtures.js' });
  if (!sandbox.PMO_RESOURCE_UAT_FIXTURES) throw new Error('Resource UAT fixtures did not load');
  return sandbox.PMO_RESOURCE_UAT_FIXTURES;
}

function dbResource(row) {
  return {
    id: row.id,
    resource_team: row.resourceTeam || null,
    project: row.project || null,
    position: row.position || null,
    level: row.level || null,
    hc: row.hc || 1,
    hiring_type: row.hiringType || null,
    start_date: row.startDate || null,
    end_date: row.endDate || null,
    request_date: row.requestDate || null,
    resolved_date: row.resolvedDate || null,
    remark: row.remark || null,
    status: row.status || 'pending',
    requester_name: row.requesterName || null,
    transfer_from: row.transferFrom || null,
    project_codes: row.projectCodes || [],
    resource_name: row.resourceName || row.resourceNameTh || row.resourceNameEn || null,
    employee_code: row.employeeCode || null,
    primary_project_code: row.primaryProjectCode || null,
    allocation_percent: row.allocationPercent || null,
    onboard_date: row.onboardDate || null,
    offboard_date: row.offboardDate || null,
    activity_log: row.activityLog || [],
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function dbProjectCode(row) {
  return {
    id: row.id,
    no: row.no || null,
    project: row.project,
    type: row.type || null,
    project_code: row.code,
    start_date: row.startDate || null,
    end_date: row.endDate || null,
    status: row.status || 'Active',
    pm_owner: row.pmOwner || null,
    updated_at: row.updatedAt,
  };
}

function dbResourceMaster(row) {
  const name = row.resourceName || row.resourceNameTh || row.resourceNameEn || '';
  if (!name && !row.employeeCode) return null;
  return {
    id: row.employeeCode || row.id,
    employee_code: row.employeeCode || null,
    resource_name: name || null,
    resource_name_th: row.resourceNameTh || name || null,
    resource_name_en: row.resourceNameEn || name || null,
    resource_team: row.resourceTeam || null,
    position: row.position || null,
    level: row.level || null,
    employment_type: row.hiringType || null,
    current_project: row.project || null,
    resource_status: ['resolved', 'cancelled'].includes(row.status) ? 'offboarded' : row.status === 'filled' ? 'active' : 'inactive',
    onboard_date: row.onboardDate || null,
    offboard_date: row.offboardDate || null,
    note: row.remark || null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function dbAssignments(resources, projectCodes) {
  const byCode = new Map(projectCodes.map(row => [row.code, row.id]));
  return resources.flatMap(resource => (resource.projectCodes || []).map(code => ({
    resource_request_id: resource.id,
    project_code_id: byCode.get(code.code) || null,
    project: code.project || resource.project,
    project_code: code.code,
    allocation_percent: code.allocation || resource.allocationPercent || 100,
    start_date: code.startDate || resource.onboardDate || resource.startDate || null,
    end_date: code.endDate || resource.offboardDate || resource.endDate || null,
    note: 'Resource UAT seed data',
  })));
}

async function rest(config, table, method = 'GET', body = null, query = '') {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
    },
    body: body == null ? null : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${method} ${table} failed: ${response.status} ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

async function tableExists(config, table) {
  try {
    await rest(config, table, 'GET', null, '?select=*&limit=1');
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function main() {
  const config = await loadConfig();
  const fixtures = await loadFixtures();
  const resources = fixtures.resources;
  const projectCodes = fixtures.projectCodes;

  await rest(config, 'project_code_master', 'POST', projectCodes.map(dbProjectCode), '?on_conflict=id');
  await rest(config, 'resource_requests', 'POST', resources.map(dbResource), '?on_conflict=id');

  const assignments = dbAssignments(resources, projectCodes);
  if (assignments.length && await tableExists(config, 'resource_project_codes')) {
    const ids = resources.map(row => row.id);
    await rest(config, 'resource_project_codes', 'DELETE', null, `?resource_request_id=in.(${ids.map(encodeURIComponent).join(',')})`);
    await rest(config, 'resource_project_codes', 'POST', assignments);
  }

  let masterRows = 0;
  if (await tableExists(config, 'resource_master')) {
    const master = resources.map(dbResourceMaster).filter(Boolean);
    if (master.length) {
      await rest(config, 'resource_master', 'POST', master, '?on_conflict=id');
      masterRows = master.length;
    }
  } else {
    console.warn('resource_master table is not available; skipped Resource Master seed rows.');
  }

  console.log(`Seeded Resource UAT data: ${resources.length} requests, ${projectCodes.length} project codes, ${assignments.length} assignments, ${masterRows} master rows.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
